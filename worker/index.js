// index.js — Worker fetch 入口与路由表：公开 API、管理 API、/go 跳转记录、静态资源（env.ASSETS），
// 全部响应结构 / 字段名 / 状态码对齐 server/ 下的 Node 版（api.js、admin.js、go.js、app.js、lib/http.js、lib/static.js）。

import { BRAND, PROVIDERS, TYPES, DISCLAIMER } from "./config.js";
import {
  HttpError,
  createStore,
  catalogFromData,
  TIERS,
  QUALITIES,
  MOTIFS,
  ART_PRESETS,
  DEFAULT_ART
} from "./store.js";
import { createAnalytics } from "./analytics.js";
import { createFeedbackStore, createRateLimiter, cleanText } from "./feedback.js";
import { createAdminAuth, parseCookies, secureFlag } from "./adminAuth.js";
import meta from "../shared/meta.js";
import tmdb from "../shared/tmdb.js";
import brandUtil from "../shared/brand.js";
import pansou from "../shared/pansou.js";
import douban from "../shared/douban.js";
import geo from "../shared/geo.js";

const { geoFields } = geo;

const pansouClients = new WeakMap();
const doubanClients = new WeakMap();
const allowQuarkSearch = createRateLimiter({ windowMs: 60_000, max: 30 });
// 防刷：全站总量 + 跳缓存（reload）次数 + 并发闸门。
// isolate 内存级近似，扩缩容会重置，真正的第一道防线应放在边缘（Cloudflare/Caddy 速率限制）。
const allowPanGlobal = createRateLimiter({ windowMs: 60_000, max: 240 });
const allowPanReload = createRateLimiter({ windowMs: 60_000, max: 5 });
const PAN_MAX_INFLIGHT = 3;
let panInflight = 0;
async function handleQuarkSearch(ctx) {
  if (ctx.request.method !== "GET") return methodNotAllowed(ctx, "GET");
  const ip = clientKey(ctx.request);
  const reload = ctx.url.searchParams.get("reload") === "1";
  if (!allowPanGlobal("all")) {
    return sendError(ctx, 429, "rate_limited", "全站搜索请求过多，请稍后再试。", { "Retry-After": "30" });
  }
  if (!allowQuarkSearch(ip)) {
    return sendError(ctx, 429, "rate_limited", "搜索太频繁，请稍后再试。", { "Retry-After": "60" });
  }
  if (reload && !allowPanReload(ip)) {
    return sendError(ctx, 429, "rate_limited", "「重新获取」太频繁，请等一分钟再试。", { "Retry-After": "60" });
  }
  if (panInflight >= PAN_MAX_INFLIGHT) {
    return sendError(ctx, 429, "busy", "当前搜索任务较多，请稍后再试。", { "Retry-After": "5" });
  }
  if (!pansouClients.has(ctx.env)) {
    pansouClients.set(ctx.env, pansou.createPansouClient(pansou.configFromEnv(ctx.env)));
  }
  panInflight += 1;
  try {
    const result = await pansouClients.get(ctx.env).search(ctx.url.searchParams);
    const query = String(ctx.url.searchParams.get("q") || "").trim();
    if (query && ctx.env.DB) {
      result.mine = await catalogMatch(ctx.env, query, result.type);
      const visitor = visitorId(ctx);
      record(ctx.execution, createAnalytics({ db: ctx.env.DB }).recordPanSearch({
        query,
        type: result.type,
        total: result.total,
        visitorId: visitor,
        geo: clientGeo(ctx.request)
      }));
    }
    return sendJSON(ctx, 200, result);
  } catch (err) {
    if (err instanceof pansou.PansouError) return sendError(ctx, err.status, err.code, err.message);
    throw err;
  } finally {
    panInflight -= 1;
  }
}


async function handleDoubanList(ctx) {
  if (ctx.request.method !== "GET") return methodNotAllowed(ctx, "GET");
  if (!doubanClients.has(ctx.env)) {
    doubanClients.set(ctx.env, douban.createDoubanList({ logger: { warn() {} } }));
  }
  try {
    const kind = ctx.url.searchParams.get("kind") || "hot";
    if (!douban.KIND_IDS.includes(kind)) return sendError(ctx, 422, "invalid_kind", "kind 只支持 hot、latest。");
    const limit = Number(ctx.url.searchParams.get("limit")) || 6;
    return sendJSON(ctx, 200, { source: "douban", ...(await doubanClients.get(ctx.env).list({ kind, limit })) });
  } catch (err) {
    return sendError(ctx, 502, "douban_unavailable", "豆瓣榜单暂时不可用，请稍后再试。");
  }
}

// Workers 没有 process.uptime()，用 isolate 启动时刻近似（health 的 uptime 字段）。
const BOOT_TIME = Date.now();

/**
 * 目录缓存：目录来自部署时打包进 ASSETS 的 /data/titles.json（只读快照，
 * 随部署变更），isolate 内缓存 60 秒足够把每次请求的 ASSETS fetch 降到个位数。
 */
const CATALOG_TTL_MS = 60_000;
let catalogCache = null;

async function getCatalog(env, baseUrl) {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) return catalogCache.catalog;
  const res = await env.ASSETS.fetch(new Request(new URL("/data/titles.json", baseUrl)));
  if (!res.ok) {
    throw new HttpError(503, "catalog_unavailable", "站内目录未随本次部署打包，请重新 npm run deploy");
  }
  const catalog = catalogFromData(await res.json());
  catalogCache = { catalog, at: now };
  return catalog;
}

const API_INDEX = {
  name: `${BRAND.name} API`,
  brand: brandUtil.publicBrand(BRAND),
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

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin"
};

// CSP 与 server/lib/http.js 完全一致。
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  // 放开 https: 是因为后台可以给作品填外部海报图片地址（titles.poster）
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

// 限流是 isolate 内存级近似：Map 只在单个 Worker 实例内共享，实例扩容/回收会重置计数（见 feedback.js 注释）。
const allowFeedback = createRateLimiter({ windowMs: 60_000, max: 5 });
const allowLogin = createRateLimiter({ windowMs: 10 * 60_000, max: 8 });
const allowGo = createRateLimiter({ windowMs: 60_000, max: 60 });
// 页面访问埋点：每次 SPA 路由一次，正常用户远低于这个上限。
const allowTrack = createRateLimiter({ windowMs: 60_000, max: 120 });

const VISITOR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

/* ---------------- 响应助手（对齐 server/lib/http.js） ---------------- */

function buildHeaders(ctx, status, headersInit) {
  const headers = new Headers(headersInit);
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => headers.set(key, value));
  (ctx && ctx.cookies ? ctx.cookies : []).forEach((cookie) => headers.append("Set-Cookie", cookie));
  return headers;
}

function sendJSON(ctx, status, payload, extraHeaders = {}) {
  const headers = buildHeaders(ctx, status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  return new Response(JSON.stringify(payload), { status, headers });
}

function sendError(ctx, status, code, message, extraHeaders = {}) {
  return sendJSON(ctx, status, { error: { code, message } }, extraHeaders);
}

function sendText(ctx, status, body, extraHeaders = {}) {
  const headers = buildHeaders(ctx, status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  return new Response(body, { status, headers });
}

function methodNotAllowed(ctx, allow) {
  return sendError(ctx, 405, "method_not_allowed", "不支持的请求方法", { Allow: allow });
}

async function readJSON(request, { limit = 16 * 1024 } = {}) {
  const type = String(request.headers.get("content-type") || "");
  if (!/^application\/json\b/i.test(type)) {
    throw new HttpError(415, "unsupported_media_type", "请求需使用 application/json");
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > limit) {
    throw new HttpError(413, "payload_too_large", "请求内容过大");
  }
  if (!buffer.byteLength) throw new HttpError(400, "invalid_json", "请求体不能为空");
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch (err) {
    throw new HttpError(400, "invalid_json", "请求体不是合法 JSON");
  }
}

function clientKey(request) {
  const cf = String(request.headers.get("cf-connecting-ip") || "").trim();
  if (cf) return cf;
  const forwarded = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return forwarded || "unknown";
}

/** 访客去重用的随机编号（Cookie）。UA 不落库；IP 另存一列，只给后台看来源。 */
function visitorId(ctx) {
  const cookies = parseCookies(ctx.request);
  let id = cookies[BRAND.cookies.visitor];
  if (!id) {
    // 小程序没有 Cookie 罐，允许客户端用 X-YT-Visitor 自报一个 UUID 形状的编号：
    // 同一个人的多次请求才能算成一个访客，而不是每次都被铸成新编号记进「疑似自动化」。
    // 浏览器仍然以 Cookie 为准；两边都是随机 UUID，不含任何设备信息。
    const header = ctx.request.headers.get("x-yt-visitor");
    if (header) id = header.trim();
  }
  if (!id || !VISITOR_RE.test(id)) {
    id = crypto.randomUUID();
    ctx.cookies.push(`${BRAND.cookies.visitor}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secureFlag(ctx.request)}`);
  }
  return id;
}

/**
 * 地区与来源：国家/城市取 Cloudflare 边缘 GeoIP 已经解析好的结果，IP 取 cf-connecting-ip
 * （本地跑测没有 request.cf 时回退 x-forwarded-for），清洗都在 shared/geo.js 里做。
 * asn / asOrganization 是同一个请求的来源网络，用来把机房与代理从「真实访客」里剔除
 * （判据见 shared/asn.js）。这些字段都只写进 events 表供后台看板用；公开接口不会返回。
 */
function clientGeo(request) {
  const cf = request.cf || {};
  return geoFields({
    country: cf.country || request.headers.get("cf-ipcountry"),
    city: cf.city,
    ip: clientKey(request),
    asn: cf.asn,
    asOrganization: cf.asOrganization
  });
}

function sameOrigin(request, url) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === url.host;
  } catch (err) {
    return false;
  }
}

/**
 * 统计写入不阻塞响应：交给 waitUntil 在响应返回后执行，
 * 既省掉一次 D1 写延迟，也避免用户等待埋点。
 */
function record(execution, promise) {
  const task = Promise.resolve(promise).catch((err) => {
    console.warn(`${BRAND.logPrefix} 统计记录失败`, err.message);
  });
  if (execution && typeof execution.waitUntil === "function") execution.waitUntil(task);
  return task;
}

/** 每个请求准备一次数据层（目录一次性载入内存，供打分/筛选/related 复用）。 */
/* ---------------- 我的资源（catalog，D1） ---------------- */

const CATALOG_PANS = new Set(["quark", "baidu", "aliyun", "xunlei"]);

function titleKey(value) {
  return String(value || "").toLowerCase().replace(/[\s《》〈〉「」『』【】\[\]（）()：:·.,，。!！?？\-_—\/\\]/g, "");
}

function catalogFromRow(row) {
  const rating = Number(row.rating);
  return {
    id: row.id,
    title: row.title,
    year: row.year || null,
    kind: row.kind || "电影",
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    featured: Number(row.featured) ? 1 : 0,
    latest: Number(row.latest) ? 1 : 0,
    poster: row.poster || "",
    pan: row.pan || "quark",
    link: row.link || "",
    password: row.password || "",
    note: row.note || "",
    updatedAt: row.updated_at || null
  };
}

async function catalogAll(env) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare("SELECT * FROM catalog ORDER BY sort ASC, id ASC").all();
  return (results || []).map(catalogFromRow);
}

async function catalogMatch(env, query, pan) {
  const key = titleKey(query);
  if (!key) return [];
  const wanted = pan ? String(pan) : "";
  const all = await catalogAll(env);
  return all.filter((entry) => titleKey(entry.title) === key && (!wanted || entry.pan === wanted));
}

function catalogInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(422, "invalid_body", "请求体格式不正确");
  }
  const title = cleanText(body.title, 120);
  if (!title) throw new HttpError(422, "invalid_title", "片名不能为空");
  const link = String(body.link || "").trim();
  if (!/^https?:\/\/\S+$/i.test(link)) throw new HttpError(422, "invalid_link", "链接必须是 http(s) 地址");
  const pan = CATALOG_PANS.has(String(body.pan)) ? String(body.pan) : "quark";
  const poster = String(body.poster || "").trim();
  if (poster && !/^https?:\/\/\S+$/i.test(poster)) throw new HttpError(422, "invalid_poster", "海报必须是 http(s) 图片地址");
  const year = Number(body.year);
  const rating = Number(body.rating);
  const sort = Number(body.sort);
  return {
    title,
    year: Number.isInteger(year) && year > 1900 && year < 2100 ? year : null,
    kind: body.kind === "剧集" ? "剧集" : "电影",
    rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
    pan,
    featured: (body.featured === true || body.featured === 1 || body.featured === "1" || body.featured === "on") ? 1 : 0,
    latest: (body.latest === true || body.latest === 1 || body.latest === "1" || body.latest === "on") ? 1 : 0,
    poster,
    link,
    password: cleanText(body.password, 64),
    note: cleanText(body.note, 200),
    sort: Number.isFinite(sort) ? Math.trunc(sort) : 0
  };
}

async function prepare(ctx) {
  const catalog = await getCatalog(ctx.env, ctx.url);
  ctx.store = createStore({ providers: PROVIDERS, catalog });
  const titleNames = new Map(catalog.items.map((item) => [item.id, item.title]));
  ctx.analytics = createAnalytics({ db: ctx.env.DB, providers: PROVIDERS, titleNames });
  ctx.feedback = createFeedbackStore({ db: ctx.env.DB });
  ctx.auth = createAdminAuth({ env: ctx.env });
}

/* ---------------- 公开 API（对齐 server/api.js） ---------------- */

const DOUBAN_IMG_HOST = /(^|\.)doubanio\.com$/i;
const TMDB_IMG_HOST = /(^|\.)tmdb\.org$/i;

// 豆瓣图片防盗链：部分图只认豆瓣自己的 Referer（yinto.top 会 403，无 Referer 418）。
// 浏览器改不了 Referer，所以在 Worker 侧带豆瓣 Referer 取图并按天缓存。
async function handleImageProxy(ctx) {
  const { request, url } = ctx;
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(ctx, "GET");
  const src = url.searchParams.get("src") || "";
  let target;
  try {
    target = new URL(src);
  } catch (err) {
    return sendText(ctx, 400, "400 · 图片地址不合法");
  }
  if (!/^https?:$/.test(target.protocol)
    || !(DOUBAN_IMG_HOST.test(target.hostname) || TMDB_IMG_HOST.test(target.hostname))) {
    return sendText(ctx, 403, "403 · 仅允许豆瓣/TMDB 图片");
  }
  // 只缓存成功取回的图片；命中边缘缓存直接返回，避免每个访客都回源豆瓣。
  const cacheable = request.method === "GET";
  const cacheKey = new Request(url.toString(), { method: "GET" });
  if (cacheable) {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
  }
  let upstream = null;
  if (TMDB_IMG_HOST.test(target.hostname)) {
    // TMDB 图片是公开 CDN，无需 Referer；国内直连常被墙，所以经我们代理取。
    try {
      const response = await fetch(target.href, { headers: { Accept: "image/*,*/*" } });
      if (response.ok && /^image\//i.test(response.headers.get("content-type") || "")) upstream = response;
    } catch (err) {
      upstream = null;
    }
  } else {
    const referers = ["https://movie.douban.com/", "https://www.douban.com/", "https://yinto.top/"];
    // 豆瓣的 img1/2/3/9 互为镜像；某些域名会被 Cloudflare 出口挡住，失败就换域名重试。
    const hosts = [...new Set([target.hostname, "img9.doubanio.com", "img3.doubanio.com", "img1.doubanio.com"])];
    for (const host of hosts) {
      const candidate = new URL(target.href);
      candidate.hostname = host;
      for (const referer of referers) {
        try {
          const response = await fetch(candidate.href, {
            headers: { Referer: referer, Accept: "image/*,*/*" }
          });
          if (response.ok && /^image\//i.test(response.headers.get("content-type") || "")) {
            upstream = response;
            break;
          }
          if (response.status === 404) return sendText(ctx, 404, "图片不存在");
        } catch (err) {
          // 换下一个 Referer / 域名
        }
      }
      if (upstream) break;
    }
  }
  if (!upstream) return sendText(ctx, 502, "502 · 图片获取失败");
  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  if (!/^image\//i.test(contentType)) return sendText(ctx, 502, "非图片响应");
  const response = new Response(request.method === "HEAD" ? null : upstream.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, s-maxage=86400",
      "x-content-type-options": "nosniff"
    }
  });
  if (cacheable) ctx.execution.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}

async function handleApi(ctx) {
  const { url, request, store, analytics, feedback } = ctx;
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/catalog" || path === "/api/catalog/") {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed(ctx, "GET");
    const items = (await catalogAll(ctx.env)).map((entry) => ({
      id: entry.id,
      title: entry.title,
      year: entry.year,
      kind: entry.kind,
      rating: entry.rating,
      featured: entry.featured,
      latest: entry.latest,
      poster: entry.poster
    }));
    return sendJSON(ctx, 200, { items });
  }

  const catalogItemMatch = /^\/api\/catalog\/(\d+)$/.exec(path);
  if (catalogItemMatch) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed(ctx, "GET");
    const id = Number(catalogItemMatch[1]);
    const entry = (await catalogAll(ctx.env)).find((item) => item.id === id);
    if (!entry) return sendError(ctx, 404, "not_found", "分享不存在");
    return sendJSON(ctx, 200, { item: entry });
  }

  if (path === "/api" || path === "/api/") {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
    return sendJSON(ctx, 200, API_INDEX);
  }

  if (path === "/api/health") {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
    return sendJSON(ctx, 200, {
      ok: true,
      name: BRAND.apiName,
      version: API_INDEX.version,
      uptime: Math.round((Date.now() - BOOT_TIME) / 1000)
    });
  }

  if (path === "/api/bootstrap") {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
    return sendJSON(ctx, 200, {
      brand: brandUtil.publicBrand(BRAND),
      providers: store.providers,
      hot: store.hot(),
      types: store.types,
      stats: store.stats,
      disclaimer: DISCLAIMER
    });
  }

  if (path === "/api/track") {
    if (method !== "POST") return methodNotAllowed(ctx, "POST");
    if (!allowTrack(clientKey(request))) {
      return sendError(ctx, 429, "rate_limited", "访问记录太频繁", { "Retry-After": "60" });
    }
    const body = await readJSON(request, { limit: 1024 });
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(422, "invalid_body", "请求体格式不正确");
    }
    const page = pagePath(body.path);
    if (!page) return sendError(ctx, 422, "invalid_path", "未知页面");
    const visitor = visitorId(ctx);
    record(ctx.execution, analytics.recordPage({
      path: page,
      lang: pageLang(body.lang),
      visitorId: visitor,
      geo: clientGeo(request)
    }));
    return sendJSON(ctx, 202, { ok: true });
  }

  if (path === "/api/search" || path === "/api/titles") {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
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
      const visitor = visitorId(ctx);
      record(ctx.execution, analytics.recordSearch({
        query: data.query,
        type: data.type,
        total: data.total,
        tookMs: data.tookMs,
        visitorId: visitor,
        geo: clientGeo(ctx.request)
      }));
    }
    return sendJSON(ctx, 200, data);
  }

  const titleMatch = /^\/api\/titles\/([^/]+)(\/offers)?\/?$/.exec(path);
  if (titleMatch) {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
    let id;
    try {
      id = decodeURIComponent(titleMatch[1]);
    } catch (err) {
      return sendError(ctx, 400, "invalid_id", "作品编号不合法");
    }

    if (titleMatch[2]) {
      const data = store.filterOffers(id, {
        season: url.searchParams.get("season") || "全部",
        region: url.searchParams.get("region") || "全部",
        tier: url.searchParams.get("tier") || "全部",
        quality: url.searchParams.get("quality") || "全部",
        verified: url.searchParams.get("verified") || undefined
      });
      if (!data) return sendError(ctx, 404, "title_not_found", "没有找到这部作品");
      return sendJSON(ctx, 200, data);
    }

    const data = store.getTitle(id);
    if (!data) return sendError(ctx, 404, "title_not_found", "没有找到这部作品");
    if (analytics) {
      const visitor = visitorId(ctx);
      record(ctx.execution, analytics.recordView({
        titleId: data.item.id,
        title: data.item.title,
        visitorId: visitor,
        geo: clientGeo(ctx.request)
      }));
    }
    return sendJSON(ctx, 200, data);
  }

  if (path === "/api/feedback") {
    if (method !== "POST") return methodNotAllowed(ctx, "POST");
    if (!allowFeedback(clientKey(request))) {
      return sendError(ctx, 429, "rate_limited", "提交太频繁了，请稍后再试", {
        "Retry-After": "60"
      });
    }

    const body = await readJSON(request, { limit: 4 * 1024 });
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(422, "invalid_body", "请求体格式不正确");
    }
    // 蜜罐字段：机器人填了 website 就假装成功，不落库。
    if (cleanText(body.website, 40)) {
      return sendJSON(ctx, 201, { ok: true });
    }

    const message = cleanText(body.message, 600);
    const contact = cleanText(body.contact, 120);
    if (message.length < 2) {
      throw new HttpError(422, "invalid_message", "反馈至少需要 2 个字");
    }

    const entry = await feedback.add({ message, contact });
    return sendJSON(ctx, 201, { ok: true, id: entry.id });
  }

  return sendError(ctx, 404, "not_found", "接口不存在");
}

/* ---------------- 管理 API（对齐 server/admin.js） ---------------- */

function adminSummary(item) {
  const verifiedCount = item.offers.filter((offerItem) => offerItem.verified).length;
  return {
    id: item.id,
    title: item.title,
    original: item.original,
    year: item.year,
    type: item.type,
    rating: item.rating,
    seasons: item.seasons,
    runtime: item.runtime,
    genres: item.genres || [],
    hot: Boolean(item.hot),
    poster: item.poster || null,
    art: item.art,
    offerCount: item.offers.length,
    verifiedCount,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

async function handleAdmin(ctx) {
  const { url, request, store, analytics, feedback, auth } = ctx;
  const path = url.pathname.replace(/\/+$/, "") || "/api/admin";
  const method = request.method;
  const titlePattern = /^\/api\/admin\/titles\/([^/]+)$/;

  if (method !== "GET" && method !== "HEAD" && !sameOrigin(request, url)) {
    return sendError(ctx, 403, "bad_origin", "请求来源不合法");
  }

  if (path === "/api/admin/session") {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
    const session = await auth.authenticate(request);
    return sendJSON(ctx, 200, {
      authenticated: Boolean(session),
      usingDefaultPassword: auth.usingDefaultPassword,
      expiresAt: session ? new Date(session.expiresAt).toISOString() : null
    });
  }

  if (path === "/api/admin/login") {
    if (method !== "POST") return methodNotAllowed(ctx, "POST");
    if (!allowLogin(clientKey(request))) {
      return sendError(ctx, 429, "rate_limited", "尝试太频繁了，请稍后再试", {
        "Retry-After": "600"
      });
    }
    const body = await readJSON(request, { limit: 2 * 1024 });
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(422, "invalid_body", "请求体格式不正确");
    }
    if (!(await auth.checkPassword(cleanText(body.password, 200)))) {
      return sendError(ctx, 401, "invalid_password", "密码不正确");
    }
    const session = await auth.issue(request, ctx.cookies);
    return sendJSON(ctx, 200, {
      ok: true,
      expiresAt: new Date(session.expiresAt).toISOString()
    });
  }

  if (path === "/api/admin/logout") {
    if (method !== "POST") return methodNotAllowed(ctx, "POST");
    auth.destroy(request, ctx.cookies);
    return sendJSON(ctx, 200, { ok: true });
  }

  if (!(await auth.authenticate(request))) {
    return sendError(ctx, 401, "unauthorized", "请先登录管理后台");
  }

  if (path === "/api/admin/meta") {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
    return sendJSON(ctx, 200, {
      providers: Object.entries(PROVIDERS).map(([id, provider]) => ({
        id,
        name: provider.name,
        short: provider.short,
        region: provider.region,
        color: provider.color,
        fg: provider.fg
      })),
      types: TYPES,
      tiers: TIERS,
      qualities: QUALITIES,
      motifs: MOTIFS,
      artPresets: ART_PRESETS,
      defaultArt: DEFAULT_ART
    });
  }

  if (path === "/api/admin/feedback") {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
    const data = await feedback.list({
      q: cleanText(url.searchParams.get("q"), 60),
      limit: Number(url.searchParams.get("limit") || 20),
      offset: Number(url.searchParams.get("offset") || 0)
    });
    return sendJSON(ctx, 200, data);
  }

  if (path === "/api/admin/tmdb/search") {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
    const query = cleanText(url.searchParams.get("q"), 80);
    const key = cleanText(request.headers.get("x-tmdb-key"), 300) || ctx.env.TMDB_API_KEY || "";
    try {
      const results = await tmdb.search(query, { key, baseUrl: ctx.env.TMDB_BASE || "" });
      return sendJSON(ctx, 200, { ok: true, results });
    } catch (err) {
      if (err instanceof tmdb.TmdbError) {
        const status = err.code === "empty_query" ? 422
          : err.code === "missing_key" ? 400
          : err.code === "invalid_key" ? 401
          : err.code === "rate_limited" ? 429
          : 502;
        return sendError(ctx, status, err.code, err.message);
      }
      throw err;
    }
  }

  if (path === "/api/admin/poster") {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
    const query = cleanText(url.searchParams.get("title") || url.searchParams.get("q"), 120);
    const key = ctx.env.TMDB_API_KEY || "";
    try {
      const results = await tmdb.search(query, { key, baseUrl: ctx.env.TMDB_BASE || "" });
      const first = Array.isArray(results) ? results[0] : null;
      return sendJSON(ctx, 200, {
        ok: true,
        poster: first && first.poster ? first.poster : "",
        title: first ? first.title : "",
        year: first ? first.year : null
      });
    } catch (err) {
      if (err instanceof tmdb.TmdbError) {
        const status = err.code === "empty_query" ? 422
          : err.code === "missing_key" ? 400
          : err.code === "invalid_key" ? 401
          : err.code === "rate_limited" ? 429
          : 502;
        return sendError(ctx, status, err.code, err.message);
      }
      throw err;
    }
  }

  if (path === "/api/admin/titles") {
    if (method === "GET") {
      const q = cleanText(url.searchParams.get("q"), 60).toLowerCase();
      const type = url.searchParams.get("type") || "";
      const onlyHot = url.searchParams.get("hot") === "1";
      const rows = store.all()
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => {
          if (type && item.type !== type) return false;
          if (onlyHot && !item.hot) return false;
          if (!q) return true;
          const haystack = [item.id, item.title, item.original, ...(item.aliases || [])]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
        .sort((a, b) => {
          const left = Date.parse(b.item.updatedAt || 0) || 0;
          const right = Date.parse(a.item.updatedAt || 0) || 0;
          return left - right || a.index - b.index;
        })
        .map(({ item }) => adminSummary(item));
      return sendJSON(ctx, 200, { total: rows.length, items: rows });
    }

    // 目录改为部署时打包的只读快照，线上不再支持写入；数据更新走本地后台 + 重新部署。
    return sendError(ctx, 410, "catalog_readonly", "线上目录为只读快照：请在本地后台编辑 titles.json 后重新部署。");
  }

  const match = titlePattern.exec(path);
  if (match) {
    let id;
    try {
      id = decodeURIComponent(match[1]);
    } catch (err) {
      throw new HttpError(400, "invalid_id", "作品编号不合法");
    }

    if (method === "GET") {
      const item = store.get(id);
      if (!item) return sendError(ctx, 404, "title_not_found", "没有找到这部作品");
      return sendJSON(ctx, 200, { item });
    }

    if (method === "PUT" || method === "DELETE") {
      return sendError(ctx, 410, "catalog_readonly", "线上目录为只读快照：请在本地后台编辑 titles.json 后重新部署。");
    }

    return methodNotAllowed(ctx, "GET");
  }

  if (path === "/api/admin/dashboard") {
    if (method !== "GET") return methodNotAllowed(ctx, "GET");
    const days = Number(url.searchParams.get("days") || 30);
    let recentFeedback = [];
    try {
      recentFeedback = await feedback.recent(5);
    } catch (err) {
      recentFeedback = [];
    }
    return sendJSON(ctx, 200, {
      ...(await analytics.dashboard({ days, feedback: recentFeedback })),
      usingDefaultPassword: auth.usingDefaultPassword,
      generatedAt: new Date().toISOString()
    });
  }

  const catalogIdMatch = /^\/api\/admin\/catalog\/(\d+)$/.exec(path);

  if (path === "/api/admin/catalog") {
    if (method === "GET") {
      return sendJSON(ctx, 200, { items: await catalogAll(ctx.env) });
    }
    if (method === "POST") {
      const body = await readJSON(request, { limit: 8 * 1024 });
      const input = catalogInput(body);
      const now = new Date().toISOString();
      const res = await ctx.env.DB.prepare(
        "INSERT INTO catalog (title, year, kind, rating, pan, featured, latest, poster, link, password, note, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(input.title, input.year, input.kind, input.rating, input.pan, input.featured, input.latest, input.poster, input.link, input.password, input.note, input.sort, now, now).run();
      const id = res.meta && res.meta.last_row_id;
      const created = (await catalogAll(ctx.env)).find((entry) => entry.id === id) || null;
      return sendJSON(ctx, 201, { item: created });
    }
    return methodNotAllowed(ctx, "GET, POST");
  }

  if (catalogIdMatch) {
    const id = Number(catalogIdMatch[1]);
    if (method === "PUT") {
      const body = await readJSON(request, { limit: 8 * 1024 });
      const input = catalogInput(body);
      const now = new Date().toISOString();
      const res = await ctx.env.DB.prepare(
        "UPDATE catalog SET title = ?, year = ?, kind = ?, rating = ?, pan = ?, featured = ?, latest = ?, poster = ?, link = ?, password = ?, note = ?, sort = ?, updated_at = ? WHERE id = ?"
      ).bind(input.title, input.year, input.kind, input.rating, input.pan, input.featured, input.latest, input.poster, input.link, input.password, input.note, input.sort, now, id).run();
      if (!res.meta || !res.meta.changes) return sendError(ctx, 404, "not_found", "条目不存在");
      const updated = (await catalogAll(ctx.env)).find((entry) => entry.id === id) || null;
      return sendJSON(ctx, 200, { item: updated });
    }
    if (method === "DELETE") {
      const res = await ctx.env.DB.prepare("DELETE FROM catalog WHERE id = ?").bind(id).run();
      if (!res.meta || !res.meta.changes) return sendError(ctx, 404, "not_found", "条目不存在");
      return sendJSON(ctx, 200, { ok: true });
    }
    return methodNotAllowed(ctx, "PUT, DELETE");
  }

  return sendError(ctx, 404, "not_found", "接口不存在");
}

/* ---------------- 跳转记录（对齐 server/go.js） ---------------- */

async function handleGo(ctx, rawId, rawIndex) {
  let id;
  try {
    id = decodeURIComponent(rawId);
  } catch (err) {
    return sendText(ctx, 400, "400 · 作品编号不合法");
  }

  const resolved = ctx.store.resolveOffer(id, rawIndex);
  if (!resolved || !/^https?:\/\//i.test(resolved.url)) {
    return sendText(ctx, 404, "404 · 观看渠道不存在");
  }

  const visitor = visitorId(ctx);
  if (allowGo(clientKey(ctx.request))) {
    record(ctx.execution, ctx.analytics.recordClick({
      titleId: resolved.item.id,
      title: resolved.item.title,
      providerId: resolved.offer.pid,
      provider: (PROVIDERS[resolved.offer.pid] || {}).name || resolved.offer.pid,
      visitorId: visitor,
      offerIndex: Number(rawIndex),
      geo: clientGeo(ctx.request)
    }));
  }

  const headers = buildHeaders(ctx, 302, {
    Location: resolved.url,
    "Cache-Control": "no-store"
  });
  return new Response(null, { status: 302, headers });
}

/* ---------------- 静态资源（wrangler [assets] binding，安全头对齐 server/lib/static.js） ---------------- */

async function handleStatic(ctx) {
  const response = await ctx.env.ASSETS.fetch(ctx.request);
  const headers = new Headers(response.headers);
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => headers.set(key, value));

  const contentType = String(headers.get("content-type") || "");
  if (/text\/html/i.test(contentType)) {
    headers.set("Content-Security-Policy", CSP);
    headers.set("Cache-Control", "no-store");
  } else {
    headers.set("Cache-Control", "public, max-age=300");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/* ---------------- 页面外壳（真实路径 + meta 注入，与 server/pages.js 同源） ---------------- */

async function assetText(ctx, pathname) {
  const target = new URL(pathname, ctx.url);
  const response = await ctx.env.ASSETS.fetch(new Request(target, {
    method: "GET",
    headers: ctx.request.headers
  }));
  return response.text();
}

function sendHTML(ctx, status, html, extraHeaders = {}) {
  const headers = buildHeaders(ctx, status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
    "Content-Security-Policy": CSP,
    ...extraHeaders
  });
  return new Response(html, { status, headers });
}

async function handlePage(ctx, kind, id) {
  let result;
  let body = "";
  if (kind === "detail") {
    const catalog = await getCatalog(ctx.env, ctx.url);
    const item = catalog.byId.get(id) || null;
    result = meta.detailMeta(item, id, BRAND, ctx.url.origin, PROVIDERS);
    if (item) body = meta.detailBody(item, BRAND, PROVIDERS);
  } else if (kind === "search") {
    result = meta.searchMeta(ctx.url, BRAND, ctx.url.origin);
  } else if (kind === "list") {
    result = meta.listMeta(BRAND, ctx.url.origin);
  } else if (kind === "share") {
    result = meta.shareMeta(id, BRAND, ctx.url.origin);
  } else {
    const catalog = await getCatalog(ctx.env, ctx.url);
    result = meta.homeMeta(BRAND, ctx.url.origin);
    body = meta.homeBody(catalog.items, BRAND, ctx.url.origin);
  }

  const template = await assetText(ctx, "/index.html");
  const headers = result.status === 404
    ? { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" }
    : {};
  return sendHTML(ctx, result.status, meta.inject(template, result.meta, body), headers);
}

async function handleSitemap(ctx) {
  const catalog = await getCatalog(ctx.env, ctx.url);
  const headers = buildHeaders(ctx, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600"
  });
  return new Response(meta.sitemapXML(catalog.items, ctx.url.origin), { status: 200, headers });
}

async function handleLlms(ctx) {
  const catalog = await getCatalog(ctx.env, ctx.url);
  const headers = buildHeaders(ctx, 200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=3600"
  });
  return new Response(meta.llmsTxt(BRAND, catalog.items, ctx.url.origin), { status: 200, headers });
}

/* ---------------- 入口与路由表（顺序对齐 server/app.js） ---------------- */

export default {
  async fetch(request, env, execution) {
    const ctx = { request, env, execution, cookies: [] };

    try {
      ctx.url = new URL(request.url);
    } catch (err) {
      return sendError(ctx, 400, "bad_request", "请求地址不合法");
    }

    const path = ctx.url.pathname;
    const method = request.method;

    try {
      // 管理后台是独立项目（../movie-admin），前台站点不再提供 /admin 页面；
      // /api/admin/* 仍保留，供单独部署的后台调用。
      if (path === "/admin" || path.startsWith("/admin/")) {
        return sendText(ctx, 404, "404 · 页面不存在");
      }

      if (path === "/api/admin" || path.startsWith("/api/admin/")) {
        await prepare(ctx);
        return await handleAdmin(ctx);
      }

      const goMatch = /^\/go\/([^/]+)\/(\d+)\/?$/.exec(path);
      if (goMatch) {
        if (method !== "GET" && method !== "HEAD") {
          return sendText(ctx, 405, "405 · Method Not Allowed", { Allow: "GET, HEAD" });
        }
        await prepare(ctx);
        return await handleGo(ctx, goMatch[1], goMatch[2]);
      }

      if (path === "/api/douban/list" || path === "/api/douban/list/" || path === "/api/douban/hot" || path === "/api/douban/hot/" || path === "/api/douban/nowplaying" || path === "/api/douban/nowplaying/") {
        return await handleDoubanList(ctx);
      }

      // PanSou searches do not read D1 or require the movie catalog.
      if (path === "/api/pan/search" || path === "/api/pan/search/" || path === "/api/quark/search" || path === "/api/quark/search/") {
        return await handleQuarkSearch(ctx);
      }

      if (path === "/api/img" || path === "/api/img/") {
        return await handleImageProxy(ctx);
      }

      if (path === "/api" || path.startsWith("/api/")) {
        await prepare(ctx);
        return await handleApi(ctx);
      }

      if (method !== "GET" && method !== "HEAD") {
        return sendText(ctx, 405, "405 · Method Not Allowed", { Allow: "GET, HEAD" });
      }

      if (path === "/robots.txt") {
        const headers = buildHeaders(ctx, 200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        });
        return new Response(meta.robotsTxt(ctx.url.origin), { status: 200, headers });
      }

      if (path === "/sitemap.xml") return await handleSitemap(ctx);
      if (path === "/llms.txt") return await handleLlms(ctx);
      if (path === "/" || path === "/index.html") return await handlePage(ctx, "home");
      if (path === "/search" || path === "/search/") return await handlePage(ctx, "search");
      if (path === "/list" || path === "/list/") return await handlePage(ctx, "list");

      const titlePage = /^\/title\/([^/]+)\/?$/.exec(path);
      if (titlePage) {
        let id = titlePage[1];
        try {
          id = decodeURIComponent(id);
        } catch (err) {
          id = "";
        }
        return await handlePage(ctx, "detail", id);
      }

      const sharePage = /^\/share\/([^/]+)\/?$/.exec(path);
      if (sharePage) {
        let id = sharePage[1];
        try {
          id = decodeURIComponent(id);
        } catch (err) {
          id = "";
        }
        return await handlePage(ctx, "share", id);
      }

      return await handleStatic(ctx);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const code = err instanceof HttpError ? err.code : "internal_error";
      const message = status >= 500 ? "服务器开小差了，请稍后再试" : err.message;
      if (status >= 500) console.error(BRAND.logPrefix, err);
      return sendError(ctx, status, code, message);
    }
  }
};
