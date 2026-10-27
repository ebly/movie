"use strict";

const { HttpError, sendJSON, sendError, readJSON, clientKey, visitorId } = require("./lib/http");
const { createRateLimiter, cleanText } = require("./feedback");
const BRAND = require("../config/brand.json");

const DISCLAIMER = BRAND.disclaimer;

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

function createApi({ store, feedback, analytics }) {
  const allowFeedback = createRateLimiter({ windowMs: 60_000, max: 5 });

  const index = {
    name: `${BRAND.name} API`,
    brand: BRAND,
    version: "1.0.0",
    endpoints: [
      { method: "GET", path: "/api/health", description: "健康检查" },
      { method: "GET", path: "/api/bootstrap", description: "平台列表、热门作品、统计与免责声明" },
      { method: "GET", path: "/api/search?q=&type=&limit=", description: "搜索作品（服务端排序与候选匹配）" },
      { method: "GET", path: "/api/titles", description: "作品列表（等价于空关键词搜索）" },
      { method: "GET", path: "/api/titles/:id", description: "作品详情与相似作品" },
      { method: "GET", path: "/api/titles/:id/offers?season=&region=&tier=&quality=&verified=1", description: "筛选观看渠道" },
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

    if (path === "/api/bootstrap") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      return sendJSON(res, 200, {
        brand: BRAND,
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
      if (analytics && data.query) {
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
