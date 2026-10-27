/* 映途 API client — same-origin fetch wrapper. */
"use strict";

/* 品牌兜底值：真实来源是仓库根目录 config/brand.json，由 /api/bootstrap 下发并覆盖这里。
   只有在服务端还没启动、拿不到 bootstrap 时才会用到这份文案。 */
let BRAND = {
  name: "映途",
  latin: "Yingtu",
  slug: "yingtu",
  tagline: "正版观看渠道索引",
  slogan: "找到正版影视的观看去处"
};

const API = (() => {
  const isFile = location.protocol === "file:";

  async function request(path, { method = "GET", body, signal } = {}) {
    if (isFile) {
      throw new Error("请先在项目目录运行 npm start，再访问 http://127.0.0.1:4173");
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
        : `请求失败（HTTP ${response.status}）`;
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
    search({ q = "", type = "全部", limit = 50, signal } = {}) {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (type && type !== "全部") params.set("type", type);
      if (limit) params.set("limit", String(limit));
      const query = params.toString();
      return request(`/api/search${query ? `?${query}` : ""}`, { signal });
    },
    title(id, signal) {
      return request(`/api/titles/${encodeURIComponent(id)}`, { signal });
    },
    feedback(payload) {
      return request("/api/feedback", { method: "POST", body: payload });
    }
  };
})();
