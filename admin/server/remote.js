"use strict";

const { HttpError, sendJSON, sendError, readJSON, applySecurityHeaders, clientKey } = require("./lib/http");
const { createRateLimiter, cleanText } = require("./feedback");

const MAX_BODY = 256 * 1024;

/**
 * 远程模式：本地后台当 BFF 代理，把请求转发到线上 Worker 的 /api/admin/*。
 *
 * 为什么不让浏览器直连线上 Worker：
 *  1. Worker 没有 CORS 头，跨域拿不到响应；
 *  2. 线上会话 Cookie 是 HttpOnly，跨站也带不过去。
 * 所以由 Node 侧代持远程 Cookie：浏览器只跟本地后台打交道（本地会话），
 * 本地会话 → 远程 Cookie 的映射只存在进程内存里，重启即失效（和本地模式一致）。
 *
 * 代理层不做任何数据缓存：片库、看板、反馈全部实时打到线上，避免两份真相。
 */
function extractCookie(response) {
  const list = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  const hit = list.find((entry) => /(^|;\s*)yt_admin=/.test(entry) || /^yt_admin=/.test(entry));
  if (!hit) return null;
  return hit.split(";")[0].trim();
}

function createRemoteApi({ baseUrl, auth, fetcher = globalThis.fetch, timeoutMs = 20_000 }) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base) throw new Error("远程模式需要提供 REMOTE_API_BASE");

  /** 本地会话 token → 线上 Cookie。只存内存，进程退出即失效。 */
  const bindings = new Map();
  const allowLogin = createRateLimiter({ windowMs: 10 * 60_000, max: 8 });

  function pruneBindings(now = Date.now()) {
    for (const [token, entry] of bindings) {
      if (entry.expiresAt <= now) bindings.delete(token);
    }
  }

  function bindSession(req, res, cookie) {
    const session = auth.issue(req, res);
    pruneBindings();
    bindings.set(session.token, { cookie, expiresAt: session.expiresAt });
    return session;
  }

  function bindingOf(req) {
    const session = auth.authenticate(req);
    if (!session) return null;
    const entry = bindings.get(session.token);
    if (!entry || entry.expiresAt <= Date.now()) {
      bindings.delete(session.token);
      return null;
    }
    return { session, cookie: entry.cookie };
  }

  async function callRemote(pathname, { method = "GET", body, headers = {} } = {}) {
    const init = {
      method,
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(timeoutMs)
    };
    if (body !== undefined) init.body = body;
    try {
      return await fetcher(base + pathname, init);
    } catch (err) {
      const reason = err && err.name === "TimeoutError" ? "请求超时" : "连接失败";
      throw new HttpError(502, "remote_unreachable", `连不上线上后端（${reason}）：${base}`);
    }
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, "payload_too_large", "请求内容过大");
      chunks.push(chunk);
    }
    return chunks.length ? Buffer.concat(chunks) : undefined;
  }

  async function handleLogin(req, res) {
    if (!allowLogin(clientKey(req))) {
      return sendError(res, 429, "rate_limited", "尝试太频繁了，请稍后再试", { "Retry-After": "600" });
    }
    const body = await readJSON(req, { limit: 2 * 1024 });
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(422, "invalid_body", "请求体格式不正确");
    }
    const password = cleanText(body.password, 200);
    if (!password) throw new HttpError(422, "invalid_password", "密码不能为空");

    // 密码不在本地校验，直接交给线上；本地不存、不比对。
    const upstream = await callRemote("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    let payload = null;
    try {
      payload = await upstream.json();
    } catch (err) {
      payload = null;
    }

    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 401;
      const code = (payload && payload.error && payload.error.code) || "invalid_password";
      const message = (payload && payload.error && payload.error.message) || "密码不正确";
      return sendError(res, status, code, message);
    }

    const cookie = extractCookie(upstream);
    if (!cookie) {
      throw new HttpError(502, "remote_no_session", "线上后端没有返回会话 Cookie，无法建立代理会话");
    }

    const session = bindSession(req, res, cookie);
    return sendJSON(res, 200, { ok: true, expiresAt: new Date(session.expiresAt).toISOString() });
  }

  async function handleForward(req, res, url) {
    const binding = bindingOf(req);
    if (!binding) {
      return sendError(res, 401, "unauthorized", "请先登录管理后台");
    }

    const suffix = url.pathname.slice("/api".length) || "";
    const target = base + "/api/admin" + suffix + (url.search || "");
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);

    const headers = { Cookie: binding.cookie };
    if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];
    // TMDB Key 是浏览器带的，需要透传；其它自定头一律不放行。
    if (req.headers["x-tmdb-key"]) headers["x-tmdb-key"] = String(req.headers["x-tmdb-key"]).slice(0, 200);

    const upstream = await callRemote(target.slice(base.length), {
      method: req.method,
      headers,
      body
    });

    const text = await upstream.text();

    if (upstream.status === 401) {
      // 线上会话过期：连带清掉本地绑定，让前端回到登录页。
      bindings.delete(binding.session.token);
      applySecurityHeaders(res, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.writeHead(401);
      res.end(text || JSON.stringify({ error: { code: "unauthorized", message: "线上会话已过期，请重新登录" } }));
      return;
    }

    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
    applySecurityHeaders(res, {
      "Content-Type": contentType,
      "Content-Length": Buffer.byteLength(text),
      "Cache-Control": "no-store"
    });
    res.writeHead(upstream.status);
    res.end(req.method === "HEAD" ? undefined : text);
  }

  return async function handleRemoteApi(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/api";
    const method = req.method || "GET";

    if (path === "/api/session") {
      if (method !== "GET") {
        return sendError(res, 405, "method_not_allowed", "不支持的请求方法", { Allow: "GET" });
      }
      const binding = bindingOf(req);
      return sendJSON(res, 200, {
        authenticated: Boolean(binding),
        mode: "remote",
        remoteBase: base,
        expiresAt: binding ? new Date(binding.session.expiresAt).toISOString() : null
      });
    }

    if (path === "/api/login") {
      if (method !== "POST") {
        return sendError(res, 405, "method_not_allowed", "不支持的请求方法", { Allow: "POST" });
      }
      if (!sameOrigin(req)) {
        return sendError(res, 403, "bad_origin", "请求来源不合法");
      }
      return handleLogin(req, res);
    }

    if (path === "/api/logout") {
      if (method !== "POST") {
        return sendError(res, 405, "method_not_allowed", "不支持的请求方法", { Allow: "POST" });
      }
      const binding = bindingOf(req);
      if (binding) {
        bindings.delete(binding.session.token);
        // 顺手让线上会话失效，失败也不影响本地登出。
        await callRemote("/api/admin/logout", {
          method: "POST",
          headers: { Cookie: binding.cookie }
        }).catch(() => null);
      }
      auth.destroy(req, res);
      return sendJSON(res, 200, { ok: true });
    }

    if (method !== "GET" && method !== "HEAD" && !sameOrigin(req)) {
      return sendError(res, 403, "bad_origin", "请求来源不合法");
    }

    return handleForward(req, res, url);
  };
}

/** 与 server/admin.js 的同源校验保持一致。 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (err) {
    return false;
  }
}

module.exports = { createRemoteApi, extractCookie };
