"use strict";

const { HttpError, sendJSON, sendError, readJSON, clientKey } = require("./lib/http");
const { createRateLimiter, cleanText } = require("./feedback");

function methodNotAllowed(res, allow) {
  sendError(res, 405, "method_not_allowed", "不支持的请求方法", { Allow: allow });
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (err) {
    return false;
  }
}

function createAdminApi({ analytics, auth, feedback, providers }) {
  const allowLogin = createRateLimiter({ windowMs: 10 * 60_000, max: 8 });

  return async function handleAdmin(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/api";
    const method = req.method || "GET";

    if (method !== "GET" && method !== "HEAD" && !sameOrigin(req)) {
      return sendError(res, 403, "bad_origin", "请求来源不合法");
    }

    if (path === "/api/session") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      const session = auth.authenticate(req);
      return sendJSON(res, 200, {
        authenticated: Boolean(session),
        usingDefaultPassword: auth.usingDefaultPassword,
        expiresAt: session ? new Date(session.expiresAt).toISOString() : null
      });
    }

    if (path === "/api/login") {
      if (method !== "POST") return methodNotAllowed(res, "POST");
      if (!allowLogin(clientKey(req))) {
        return sendError(res, 429, "rate_limited", "尝试太频繁了，请稍后再试", {
          "Retry-After": "600"
        });
      }
      const body = await readJSON(req, { limit: 2 * 1024 });
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(422, "invalid_body", "请求体格式不正确");
      }
      if (!auth.checkPassword(cleanText(body.password, 200))) {
        return sendError(res, 401, "invalid_password", "密码不正确");
      }
      const session = auth.issue(req, res);
      return sendJSON(res, 200, {
        ok: true,
        expiresAt: new Date(session.expiresAt).toISOString()
      });
    }

    if (path === "/api/logout") {
      if (method !== "POST") return methodNotAllowed(res, "POST");
      auth.destroy(req, res);
      return sendJSON(res, 200, { ok: true });
    }

    if (!auth.authenticate(req)) {
      return sendError(res, 401, "unauthorized", "请先登录管理后台");
    }

    if (path === "/api/meta") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      return sendJSON(res, 200, {
        providers: Object.entries(providers).map(([id, provider]) => ({
          id,
          name: provider.name,
          short: provider.short,
          region: provider.region,
          color: provider.color,
          fg: provider.fg
        }))
      });
    }

    if (path === "/api/feedback") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      const data = await feedback.list({
        q: cleanText(url.searchParams.get("q"), 60),
        limit: Number(url.searchParams.get("limit") || 20),
        offset: Number(url.searchParams.get("offset") || 0)
      });
      return sendJSON(res, 200, data);
    }

    if (path === "/api/dashboard") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      const days = Number(url.searchParams.get("days") || 30);
      let recentFeedback = [];
      try {
        recentFeedback = await feedback.recent(5);
      } catch (err) {
        recentFeedback = [];
      }
      return sendJSON(res, 200, {
        ...analytics.dashboard({ days, feedback: recentFeedback }),
        usingDefaultPassword: auth.usingDefaultPassword,
        generatedAt: new Date().toISOString()
      });
    }

    return sendError(res, 404, "not_found", "接口不存在");
  };
}

module.exports = { createAdminApi };
