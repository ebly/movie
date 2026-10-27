"use strict";

const { HttpError, sendJSON, sendError, readJSON, clientKey } = require("./lib/http");
const { createRateLimiter, cleanText } = require("./feedback");
const tmdb = require("../shared/tmdb.js");
const {
  validateTitle,
  ART_PRESETS,
  DEFAULT_ART,
  MOTIFS,
  TIERS,
  QUALITIES
} = require("./validate");

function methodNotAllowed(res, allow) {
  sendError(res, 405, "method_not_allowed", "不支持的请求方法", { Allow: allow });
}

function safeId(value) {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    throw new HttpError(400, "invalid_id", "作品编号不合法");
  }
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

function createAdminApi({ repository, analytics, auth, feedback, providers, types }) {
  const allowLogin = createRateLimiter({ windowMs: 10 * 60_000, max: 8 });
  const titlePattern = /^\/api\/admin\/titles\/([^/]+)$/;

  return async function handleAdmin(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/api/admin";
    const method = req.method || "GET";

    if (method !== "GET" && method !== "HEAD" && !sameOrigin(req)) {
      return sendError(res, 403, "bad_origin", "请求来源不合法");
    }

    if (path === "/api/admin/session") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      const session = auth.authenticate(req);
      return sendJSON(res, 200, {
        authenticated: Boolean(session),
        usingDefaultPassword: auth.usingDefaultPassword,
        expiresAt: session ? new Date(session.expiresAt).toISOString() : null
      });
    }

    if (path === "/api/admin/login") {
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

    if (path === "/api/admin/logout") {
      if (method !== "POST") return methodNotAllowed(res, "POST");
      auth.destroy(req, res);
      return sendJSON(res, 200, { ok: true });
    }

    if (!auth.authenticate(req)) {
      return sendError(res, 401, "unauthorized", "请先登录管理后台");
    }

    if (path === "/api/admin/meta") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      return sendJSON(res, 200, {
        providers: Object.entries(providers).map(([id, provider]) => ({
          id,
          name: provider.name,
          short: provider.short,
          region: provider.region,
          color: provider.color,
          fg: provider.fg
        })),
        types,
        tiers: TIERS,
        qualities: QUALITIES,
        motifs: MOTIFS,
        artPresets: ART_PRESETS,
        defaultArt: DEFAULT_ART
      });
    }

    if (path === "/api/admin/feedback") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      const data = await feedback.list({
        q: cleanText(url.searchParams.get("q"), 60),
        limit: Number(url.searchParams.get("limit") || 20),
        offset: Number(url.searchParams.get("offset") || 0)
      });
      return sendJSON(res, 200, data);
    }

    if (path === "/api/admin/tmdb/search") {
      if (method !== "GET") return methodNotAllowed(res, "GET");
      const query = cleanText(url.searchParams.get("q"), 80);
      const key = String(req.headers["x-tmdb-key"] || "").trim() || process.env.TMDB_API_KEY || "";
      try {
        const results = await tmdb.search(query, { key, baseUrl: process.env.TMDB_BASE || "" });
        return sendJSON(res, 200, { ok: true, results });
      } catch (err) {
        if (err instanceof tmdb.TmdbError) {
          const status = err.code === "empty_query" ? 422
            : err.code === "missing_key" ? 400
            : err.code === "invalid_key" ? 401
            : err.code === "rate_limited" ? 429
            : 502;
          return sendError(res, status, err.code, err.message);
        }
        throw err;
      }
    }

    if (path === "/api/admin/titles") {
      if (method === "GET") {
        const q = cleanText(url.searchParams.get("q"), 60).toLowerCase();
        const type = url.searchParams.get("type") || "";
        const onlyHot = url.searchParams.get("hot") === "1";
        const rows = repository.all()
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
        return sendJSON(res, 200, { total: rows.length, items: rows });
      }

      if (method === "POST") {
        const body = await readJSON(req, { limit: 256 * 1024 });
        const input = validateTitle(body, { providers });
        const item = await repository.create(input);
        return sendJSON(res, 201, { ok: true, item });
      }

      return methodNotAllowed(res, "GET, POST");
    }

    const match = titlePattern.exec(path);
    if (match) {
      const id = safeId(match[1]);
      if (method === "GET") {
        const item = repository.get(id);
        if (!item) return sendError(res, 404, "title_not_found", "没有找到这部作品");
        return sendJSON(res, 200, { item });
      }

      if (method === "PUT") {
        const body = await readJSON(req, { limit: 256 * 1024 });
        const input = validateTitle(body, { providers });
        const item = await repository.update(id, input);
        if (!item) return sendError(res, 404, "title_not_found", "没有找到这部作品");
        return sendJSON(res, 200, { ok: true, item });
      }

      if (method === "DELETE") {
        const item = await repository.remove(id);
        if (!item) return sendError(res, 404, "title_not_found", "没有找到这部作品");
        return sendJSON(res, 200, { ok: true, id });
      }

      return methodNotAllowed(res, "GET, PUT, DELETE");
    }

    if (path === "/api/admin/dashboard") {
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
