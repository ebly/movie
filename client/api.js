/* 映途 API client — same-origin fetch wrapper. */
"use strict";

/* 品牌兜底值：真实来源是仓库根目录 config/brand.json，由 /api/bootstrap 下发并覆盖这里。
   只有在服务端还没启动、拿不到 bootstrap 时才会用到这份文案。 */
let BRAND = {
  name: "映途",
  latin: "Yingtu",
  slug: "yingtu",
  tagline: "影视索引与公开分享搜索",
  slogan: "查找影视作品与公开分享"
};

const API = (() => {
  const isFile = location.protocol === "file:";

  async function request(path, { method = "GET", body, signal } = {}) {
    if (isFile) {
      throw new Error(t("api.needStart"));
    }

    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(path, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && payload.error && payload.error.message
        ? payload.error.message
        : t("api.httpError", { status: response.status });
      const error = new Error(message);
      error.status = response.status;
      error.code = payload && payload.error ? payload.error.code : "http_error";
      throw error;
    }

    return payload;
  }

  return {
    bootstrap() {
      return request("/api/bootstrap");
    },
    doubanList({ kind = "hot", limit = 11, signal } = {}) {
      return request(`/api/douban/list?kind=${encodeURIComponent(kind)}&limit=${encodeURIComponent(limit)}`, { signal });
    },
    catalog(signal) {
      return request("/api/catalog", { signal });
    },
    search({ q = "", type = "全部", limit = 50, signal, suggest = false } = {}) {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (type && type !== "全部") params.set("type", type);
      if (limit) params.set("limit", String(limit));
      // 联想请求不打热搜埋点，避免逐字输入污染 analytics。
      if (suggest) params.set("suggest", "1");
      const query = params.toString();
      return request(`/api/search${query ? `?${query}` : ""}`, { signal });
    },
    title(id, signal) {
      return request(`/api/titles/${encodeURIComponent(id)}`, { signal });
    },
    async panSearch({ q = "", type = "quark", offset = 0, reload = false, signal } = {}) {
      const query = String(q).trim();
      if (!query) throw new Error(t("api.queryRequired"));
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error(t("api.badOffset"));
      const params = new URLSearchParams({ q: query, type, offset: String(offset), limit: "30" });
      // 只跳过 movie 的短缓存，不向 PanSou 发送 refresh。
      if (reload) params.set("reload", "1");
      const data = await request(`/api/pan/search?${params.toString()}`, { signal });
      if (!data || !Array.isArray(data.items)
        || !Number.isSafeInteger(data.total) || data.total < 0
        || data.offset !== offset || data.limit !== 30
        || typeof data.hasMore !== "boolean"
        || typeof data.complete !== "boolean") {
        throw new Error(t("api.panFormat"));
      }
      return data;
    },
    feedback(payload) {
      return request("/api/feedback", { method: "POST", body: payload });
    },
    track(payload) {
      return request("/api/track", { method: "POST", body: payload });
    }
  };
})();
