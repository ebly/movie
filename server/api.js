"use strict";

const { HttpError, sendJSON, sendError, readJSON, clientKey, visitorId } = require("./lib/http");
const { createRateLimiter, cleanText } = require("./feedback");
const { publicBrand } = require("../shared/brand");
const BRAND = require("../config/brand.json");
const { PansouError } = require("../shared/pansou");
const { createDoubanList, KIND_IDS } = require("../shared/douban");

const DISCLAIMER = BRAND.disclaimer;
// 对外只给白名单字段：brand.json 里的 defaultPassword / cookies / logPrefix 不外发。
const BRAND_PUBLIC = publicBrand(BRAND);
const PAGE_PATHS = new Set(["/", "/search", "/list", "/title"]);

/** 页面埋点只接受归一化后的固定路径，避免把任意 URL 写进统计。 */
function pagePath(value) {
  const raw = String(value || "").trim();
  return PAGE_PATHS.has(raw) ? raw : "";
}

function pageLang(value) {
  const lang = String(value || "").trim().toLowerCase();
  return lang === "zh" || lang === "en" ? lang : "";
}

function methodNotAllowed(res, allow) {
  sendError(res, 405, "method_not_allowed", "不支持的请求方法", { Allow: allow });
}

async function record(promise) {
  try {
    await promise;
  } catch (err) {
    console.warn(`${BRAND.logPrefix} 统计记录失败`, err.message);
  }
}

function createApi({ store, feedback, analytics, pansou }) {
  const allowFeedback = createRateLimiter({ windowMs: 60_000, max: 5 });
  const allowQuarkSearch = createRateLimiter({ windowMs: 60_000, max: 30 });
  const allowDouban = createRateLimiter({ windowMs: 60_000, max: 20 });
  // 防刷：全站总量、访客维度、跳过缓存（reload）各自计数，另加并发闸门。
  // 单次 reload 会让 PanSou 把全部启用插件打一遍，所以它必须比普通搜索严得多。
  const allowPanGlobal = createRateLimiter({ windowMs: 60_000, max: 240 });
  const allowPanVisitor = createRateLimiter({ windowMs: 60_000, max: 20 });
  const allowPanReload = createRateLimiter({ windowMs: 60_000, max: 5 });
  // 页面访问埋点：每次 SPA 路由一次，正常用户远低于这个上限。
  const allowTrack = createRateLimiter({ windowMs: 60_000, max: 120 });
  const PAN_MAX_INFLIGHT = 3;
  let panInflight = 0;
  const doubanList = createDoubanList();

  const index = {
    name: `${BRAND.name} API`,
    brand: BRAND_PUBLIC,
    version: "1.0.0",
    endpoints: [
      { method: "GET", path: "/api/health", description: "健康检查" },
      { method: "GET", path: "/api/bootstrap", description: "平台列表、热门作品、统计与免责声明" },
      { method: "GET", path: "/api/search?q=&type=&limit=", description: "搜索作品（服务端排序与候选匹配）" },
      { method: "GET", path: "/api/douban/list?kind=&limit=", description: "豆瓣榜单（kind=hot/latest，只有元数据，用于首页）" },
      { method: "GET", path: "/api/pan/search?q=&type=&offset=&limit=", description: "搜索 PanSou 已接入来源中的网盘公开分享（type=quark/baidu/xunlei/aliyun）" },
      { method: "GET", path: "/api/titles", description: "作品列表（等价于空关键词搜索）" },
      { method: "GET", path: "/api/titles/:id", description: "作品详情与相似作品" },
      { method: "GET", path: "/api/titles/:id/offers?season=&region=&tier=&quality=&verified=1", description: "筛选观看渠道" },
      { method: "POST", path: "/api/track", description: "匿名页面访问埋点（path=/, /search, /list, /title；lang=zh/en）" },
      { method: "POST", path: "/api/feedback", description: "提交反馈（JSON，60 秒内最多 5 次）" }
    ],
    disclaimer: DISCLAIMER
  };

  return async function handleApi(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const method = req.method || "GET";

    if (path === "/api" || path === "/api/") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      return sendJSON(res, 200, index);
    }

    if (path === "/api/health") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      return sendJSON(res, 200, {
        ok: true,
        name: BRAND.apiName,
        version: index.version,
        uptime: Math.round(process.uptime())
      });
    }

    if (path === "/api/douban/list" || path === "/api/douban/list/" || path === "/api/douban/hot" || path === "/api/douban/hot/" || path === "/api/douban/nowplaying" || path === "/api/douban/nowplaying/") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      if (!allowDouban(clientKey(req))) {
        return sendError(res, 429, "rate_limited", "请求太频繁，请稍后再试。", { "Retry-After": "60" });
      }
      try {
        const kind = url.searchParams.get("kind") || "hot";
        if (!KIND_IDS.includes(kind)) return sendError(res, 422, "invalid_kind", "kind 只支持 hot、latest。");
        const limit = Number(url.searchParams.get("limit")) || 6;
        return sendJSON(res, 200, { source: "douban", ...(await doubanList.list({ kind, limit })) });
      } catch (err) {
        return sendError(res, 502, "douban_unavailable", "豆瓣榜单暂时不可用，请稍后再试。");
      }
    }

    // /api/quark/search 是早期路径，保留兼容；/api/pan/search 是加上多类型后的正式入口。
    if (path === "/api/pan/search" || path === "/api/pan/search/" || path === "/api/quark/search" || path === "/api/quark/search/") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      const ip = clientKey(req);
      const reload = url.searchParams.get("reload") === "1";
      if (!allowPanGlobal("all")) {
        return sendError(res, 429, "rate_limited", "全站搜索请求过多，请稍后再试。", { "Retry-After": "30" });
      }
      if (!allowQuarkSearch(ip)) {
        return sendError(res, 429, "rate_limited", "搜索太频繁，请稍后再试。", { "Retry-After": "60" });
      }
      if (!allowPanVisitor(visitorId(req, res))) {
        return sendError(res, 429, "rate_limited", "搜索太频繁，请稍后再试。", { "Retry-After": "60" });
      }
      if (reload && !allowPanReload(ip)) {
        return sendError(res, 429, "rate_limited", "「重新获取」太频繁，请等一分钟再试。", { "Retry-After": "60" });
      }
      if (!pansou) return sendError(res, 503, "pansou_unconfigured", "尚未配置 PanSou 搜索服务。");
      if (panInflight >= PAN_MAX_INFLIGHT) {
        return sendError(res, 429, "busy", "当前搜索任务较多，请稍后再试。", { "Retry-After": "5" });
      }
      panInflight += 1;
      try {
        const result = await pansou.search(url.searchParams);
        const query = String(url.searchParams.get("q") || "").trim();
        if (analytics && query) {
          const visitor = visitorId(req, res);
          await record(analytics.recordPanSearch({
            query,
            type: result.type,
            total: result.total,
            visitorId: visitor
          }));
        }
        return sendJSON(res, 200, result);
      } catch (err) {
        if (err instanceof PansouError) return sendError(res, err.status, err.code, err.message);
        throw err;
      } finally {
        panInflight -= 1;
      }
    }

    if (path === "/api/bootstrap") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      return sendJSON(res, 200, {
        brand: BRAND_PUBLIC,
        providers: store.providers,
        hot: store.hot(),
        types: store.types,
        stats: store.stats,
        disclaimer: DISCLAIMER
      });
    }

    if (path === "/api/search" || path === "/api/titles") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      const started = Date.now();
      const query = path === "/api/titles" ? "" : url.searchParams.get("q") || "";
      const data = store.search({
        q: query,
        type: url.searchParams.get("type") || "全部",
        limit: url.searchParams.get("limit") || undefined
      });
      data.tookMs = Date.now() - started;
      // 联想请求（suggest=1）不计入热搜统计，只记用户真正提交的搜索。
      if (analytics && data.query && url.searchParams.get("suggest") !== "1") {
        const visitor = visitorId(req, res);
        await record(analytics.recordSearch({
          query: data.query,
          type: data.type,
          total: data.total,
          tookMs: data.tookMs,
          visitorId: visitor
        }));
      }
      return sendJSON(res, 200, data);
    }

    const titleMatch = /^\/api\/titles\/([^/]+)(\/offers)?\/?$/.exec(path);
    if (titleMatch) {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      let id;
      try {
        id = decodeURIComponent(titleMatch[1]);
      } catch (err) {
        return sendError(res, 400, "invalid_id", "作品编号不合法");
      }

      if (titleMatch[2]) {
        const data = store.filterOffers(id, {
          season: url.searchParams.get("season") || "全部",
          region: url.searchParams.get("region") || "全部",
          tier: url.searchParams.get("tier") || "全部",
          quality: url.searchParams.get("quality") || "全部",
          verified: url.searchParams.get("verified") || undefined
        });
        if (!data) return sendError(res, 404, "title_not_found", "没有找到这部作品");
        return sendJSON(res, 200, data);
      }

      const data = store.getTitle(id);
      if (!data) return sendError(res, 404, "title_not_found", "没有找到这部作品");
      if (analytics) {
        const visitor = visitorId(req, res);
        await record(analytics.recordView({
          titleId: data.item.id,
          title: data.item.title,
          visitorId: visitor
        }));
      }
      return sendJSON(res, 200, data);
    }

    if (path === "/api/track") {
      if (method !== "POST") return methodNotAllowed(res, "POST");
      if (!allowTrack(clientKey(req))) {
        return sendError(res, 429, "rate_limited", "访问记录太频繁", { "Retry-After": "60" });
      }
      const body = await readJSON(req, { limit: 1024 });
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(422, "invalid_body", "请求体格式不正确");
      }
      const page = pagePath(body.path);
      if (!page) return sendError(res, 422, "invalid_path", "未知页面");
      await record(analytics.recordPage({
        path: page,
        lang: pageLang(body.lang),
        visitorId: visitorId(req, res)
      }));
      return sendJSON(res, 202, { ok: true });
    }

    if (path === "/api/feedback") {
      if (method !== "POST") return methodNotAllowed(res, "POST");
      if (!allowFeedback(clientKey(req))) {
        return sendError(res, 429, "rate_limited", "提交太频繁了，请稍后再试", {
          "Retry-After": "60"
        });
      }

      const body = await readJSON(req, { limit: 4 * 1024 });
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(422, "invalid_body", "请求体格式不正确");
      }
      if (cleanText(body.website, 40)) {
        return sendJSON(res, 201, { ok: true });
      }

      const message = cleanText(body.message, 600);
      const contact = cleanText(body.contact, 120);
      if (message.length < 2) {
        throw new HttpError(422, "invalid_message", "反馈至少需要 2 个字");
      }

      const entry = await feedback.add({ message, contact });
      return sendJSON(res, 201, { ok: true, id: entry.id });
    }

    return sendError(res, 404, "not_found", "接口不存在");
  };
}

module.exports = { createApi, DISCLAIMER };
