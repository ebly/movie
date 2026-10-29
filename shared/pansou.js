"use strict";

// Runtime-neutral adapter: PanSou stays a separate Go service.
const SCOPE = "PanSou 已接入的公开来源";
const MAX_BODY = 8 * 1024 * 1024;

/**
 * 允许放行的网盘类型。只列确定的域名与路径形态，未知类型一律不返回，
 * 避免把别人的站外链接当成网盘分享展示。
 */
const PAN_TYPES = {
  quark: { label: "夸克网盘", hosts: ["pan.quark.cn"], path: /^\/s\/([a-zA-Z0-9]+)\/?$/ },
  baidu: { label: "百度网盘", hosts: ["pan.baidu.com"], path: /^\/s\/([a-zA-Z0-9_-]+)\/?$/ },
  xunlei: { label: "迅雷网盘", hosts: ["pan.xunlei.com"], path: /^\/s\/([a-zA-Z0-9_-]+)\/?$/ },
  aliyun: {
    label: "阿里云盘",
    hosts: ["www.alipan.com", "alipan.com", "www.aliyundrive.com", "aliyundrive.com"],
    path: /^\/s\/([a-zA-Z0-9_-]+)\/?$/
  }
};
const PAN_TYPE_IDS = Object.keys(PAN_TYPES);

class PansouError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { name: "PansouError", status, code });
  }
}
function configFromEnv(env = {}) {
  return { baseUrl: env.PANSOU_URL || "", token: env.PANSOU_TOKEN || "",
    username: env.PANSOU_USERNAME || "", password: env.PANSOU_PASSWORD || "",
    source: env.PANSOU_SRC || "all", plugins: env.PANSOU_PLUGINS || "",
    timeoutMs: env.PANSOU_TIMEOUT_MS || 20000 };
}
function searchParams(params) {
  const query = String(params.get("q") || "").trim();
  if (!query) throw new PansouError(400, "query_required", "请输入搜索关键词，不能枚举整个夸克网盘。");
  if (query.length > 120 || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new PansouError(422, "invalid_query", "关键词最多 120 个字符，且不能包含控制字符。");
  }
  function integer(key, fallback, min, max) {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new PansouError(422, "invalid_pagination", "分页参数不合法：offset 为非负整数，limit 为 1–100。");
    }
    return value;
  }
  const reload = params.get("reload");
  if (reload !== null && reload !== "0" && reload !== "1") throw new PansouError(422, "invalid_reload", "reload 只能为 0 或 1。");
  const type = params.get("type") || "quark";
  if (!PAN_TYPES[type]) {
    throw new PansouError(422, "invalid_type", `type 只支持 ${PAN_TYPE_IDS.join("、")}。`);
  }
  return { query, type, offset: integer("offset", 0, 0, Number.MAX_SAFE_INTEGER - 100),
    limit: integer("limit", 30, 1, 100), reload: reload === "1" };
}
const clean = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
function normalizeResults(payload, type = "quark") {
  const cfg = PAN_TYPES[type];
  if (!cfg) throw new PansouError(422, "invalid_type", `type 只支持 ${PAN_TYPE_IDS.join("、")}。`);
  const invalid = () => new PansouError(502, "pansou_format", "PanSou 返回的数据格式不正确。");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalid();
  if (Object.hasOwn(payload, "code")) {
    if (payload.code !== 0) throw new PansouError(502, "pansou_error", "PanSou 搜索失败，请检查上游服务日志。");
    payload = payload.data;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalid();
  const merged = payload.merged_by_type;
  if ((!merged || typeof merged !== "object" || Array.isArray(merged)) && payload.total !== 0) throw invalid();
  const rows = merged && merged[type];
  if (rows != null && !Array.isArray(rows)) throw invalid();
  const found = new Map();
  for (const row of rows || []) {
    if (!row || typeof row.url !== "string" || row.url.length > 2048 || /[\s\\]/.test(row.url)) continue;
    let u;
    try { u = new URL(row.url); } catch { continue; }
    // 只接受 HTTP(S)、默认端口、无凭据，且域名与分享路径都匹配该类型；
    // 上游偶有 http 写法，统一重建成 https 再输出。
    if (!/^https?:$/.test(u.protocol) || u.port || u.username || u.password) continue;
    if (!cfg.hosts.includes(u.hostname)) continue;
    const match = cfg.path.exec(u.pathname);
    if (!match) continue;
    const id = match[1];
    const password = clean(row.password, 64) || clean(u.searchParams.get("pwd") || u.searchParams.get("password") || u.searchParams.get("passcode"), 64);
    const source = clean(row.source, 160);
    const stamp = typeof row.datetime === "string" ? Date.parse(row.datetime) : NaN;
    const datetime = Number.isFinite(stamp) && stamp >= 0 ? new Date(stamp).toISOString() : null;
    const title = clean(row.note, 2000);
    if (found.has(id)) {
      const item = found.get(id);
      if (source && !item.sources.includes(source)) item.sources.push(source);
      if (!item.password) item.password = password;
      if (!item.title) item.title = title;
      if (datetime && (!item.datetime || datetime > item.datetime)) item.datetime = datetime;
    } else {
      found.set(id, { id: `${type}:${id}`, type, title, url: `https://${u.hostname}/s/${id}`, password,
        sources: source ? [source] : [], datetime });
    }
  }
  return [...found.values()].map((item) => ({ ...item, title: item.title || "未命名公开分享" }));
}
async function readJSON(response) {
  const tooLarge = () => new PansouError(502, "pansou_too_large", "PanSou 响应过大，请使用更具体的关键词。");
  if (Number(response.headers.get("content-length")) > MAX_BODY) {
    if (response.body) await response.body.cancel();
    throw tooLarge();
  }
  if (!response.body) throw new PansouError(502, "pansou_format", "PanSou 返回空响应。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw tooLarge(); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { throw new PansouError(502, "pansou_format", "PanSou 返回的不是有效 JSON。"); }
}
function createPansouClient(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const base = String(options.baseUrl || "").trim();
  const source = options.source || "all";
  const plugins = String(options.plugins || "").split(",").map((s) => s.trim()).filter(Boolean);
  const token = String(options.token || "").trim();
  const username = String(options.username || ""), password = String(options.password || "");
  const timeoutMs = Math.min(60000, Math.max(100, Number(options.timeoutMs) || 20000));
  const cacheMs = Math.min(60000, Math.max(0, Number(options.cacheMs ?? 30000)));
  const cache = new Map(), inflight = new Map();
  const budget = 16 * 1024 * 1024;
  let cacheBytes = 0, login = null, session = null, apiBase = null;
  function endpoint() {
    if (!base) throw new PansouError(503, "pansou_unconfigured", "尚未配置 PanSou。请启动独立服务并设置服务端 PANSOU_URL。");
    if (apiBase) return apiBase;
    try {
      const u = new URL(base);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
      if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new Error();
      if (u.username || u.password || u.search || u.hash || !["all", "plugin", "tg"].includes(source)) throw new Error();
      if (Boolean(username) !== Boolean(password)) throw new Error();
      apiBase = u.href.replace(/\/+$/, "");
      return apiBase;
    } catch { throw new PansouError(503, "pansou_config", "PanSou 配置错误：远程地址需 HTTPS，本机可用 http://127.0.0.1:8888；账号密码须成对配置。"); }
  }
  async function post(path, body, bearer = "") {
    const target = endpoint() + path;
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new PansouError(504, "pansou_timeout", "PanSou 响应超时，请稍后重试。"));
      }, timeoutMs);
    });
    const run = async () => {
      // Workers 的 fetch 只接受 follow/manual（"error" 会在边缘直接抛错），
      // 用 manual 手动拒掉 3xx，语义和原来的 redirect:"error" 一致。
      const response = await fetchImpl(target, { method: "POST", redirect: "manual", signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify(body) });
      if (response.status >= 300 && response.status < 400) {
        if (response.body) await response.body.cancel();
        throw new PansouError(502, "pansou_redirect", "PanSou 返回了重定向，请检查地址配置。");
      }
      if (!response.ok) {
        if (response.body) await response.body.cancel();
        if (response.status === 401 || response.status === 403) throw new PansouError(502, "pansou_auth", "PanSou 认证失败，请检查服务端令牌或账号配置。");
        if (response.status === 429) throw new PansouError(429, "pansou_rate_limited", "PanSou 请求过于频繁，请稍后再试。");
        throw new PansouError(502, "pansou_http", "PanSou 暂时不可用，请检查上游服务。");
      }
      return readJSON(response);
    };
    try { return await Promise.race([run(), deadline]); } catch (err) {
      if (err instanceof PansouError) throw err;
      if (controller.signal.aborted) throw new PansouError(504, "pansou_timeout", "PanSou 响应超时，请稍后重试。");
      throw new PansouError(502, "pansou_unreachable", "连接不到 PanSou，请确认服务已启动、地址可达。");
    } finally { clearTimeout(timer); }
  }
  async function bearerToken() {
    if (token) return token;
    if (!username) return "";
    if (session && session.expires > Date.now() + 30000) return session.token;
    if (!login) login = post("/api/auth/login", { username, password }).then((data) => {
      const expires = Number(data.expires_at) * 1000;
      if (typeof data.token !== "string" || !data.token || !Number.isFinite(expires) || expires <= Date.now()) {
        throw new PansouError(502, "pansou_auth", "PanSou 登录响应无效。");
      }
      session = { token: data.token, expires };
      return session.token;
    }).finally(() => { login = null; });
    return login;
  }
  async function load(query, type) {
    const body = { kw: query, src: source, res: "merge", cloud_types: [type] };
    if (plugins.length) body.plugins = plugins;
    // Repeat normally to pick up PanSou async backfill; do NOT set refresh=true.
    const bearer = await bearerToken();
    let payload;
    try { payload = await post("/api/search", body, bearer); } catch (err) {
      if (err.code !== "pansou_auth" || token || !username) throw err;
      if (session && session.token === bearer) session = null;
      payload = await post("/api/search", body, await bearerToken());
    }
    return normalizeResults(payload, type);
  }
  function remove(key) {
    const entry = cache.get(key);
    if (entry) cacheBytes -= entry.bytes;
    cache.delete(key);
  }
  async function search(params) {
    const { query, type, offset, limit, reload } = searchParams(params);
    endpoint();
    const started = Date.now();
    const key = `${type}:${query}`;
    for (const [k, entry] of cache) if (entry.expires <= started) remove(k);
    let items, cached = false;
    const entry = cache.get(key);
    if (!reload && entry) {
      cache.delete(key); cache.set(key, entry);
      items = entry.items; cached = true;
    } else {
      if (!inflight.has(key)) {
        if (inflight.size >= 4) throw new PansouError(503, "pansou_busy", "搜索任务较多，请稍后再试。");
        const task = load(query, type).then((rows) => {
          remove(key);
          const bytes = new TextEncoder().encode(JSON.stringify(rows)).byteLength;
          if (cacheMs && bytes <= budget) {
            while (cache.size >= 50 || cacheBytes + bytes > budget) remove(cache.keys().next().value);
            cache.set(key, { items: rows, bytes, expires: Date.now() + cacheMs });
            cacheBytes += bytes;
          }
          return rows;
        }).finally(() => { inflight.delete(key); });
        inflight.set(key, task);
      }
      items = await inflight.get(key);
    }
    return { query, type, items: items.slice(offset, offset + limit), total: items.length,
      offset, limit, hasMore: offset + limit < items.length, cached, tookMs: Date.now() - started,
      complete: false, scope: SCOPE };
  }
  return { search };
}
module.exports = { createPansouClient, configFromEnv, PansouError, normalizeResults, searchParams, SCOPE, PAN_TYPES, PAN_TYPE_IDS };
