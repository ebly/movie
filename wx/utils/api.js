"use strict";

/**
 * 映途公开 API 的薄封装。
 *
 * 所有网络请求都从这里出去，页面不直接碰 wx.request：
 * 统一超时、统一错误文案、统一带上访客编号，换域名只改 config.js。
 */

const config = require("../config.js");
const store = require("./store.js");

function friendlyFailure(err) {
  const text = String((err && err.errMsg) || "");
  if (/domain list|not in domain list/i.test(text)) {
    return "域名未加入白名单：请把 yinto.top 配到 request 合法域名，或开发时勾选「不校验合法域名」";
  }
  if (/timeout/i.test(text)) return "网络有点慢，请稍后再试";
  return "网络连接失败，请检查网络后重试";
}

function request(path, { method = "GET", data, timeout } = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.baseUrl + path,
      method,
      data,
      timeout: timeout || config.timeout,
      header: {
        "Content-Type": "application/json",
        // 小程序共享不了 Cookie，用稳定编号让后台把多次访问算成同一个访客。
        "X-YT-Visitor": store.visitorId()
      },
      success(res) {
        const body = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
          return;
        }
        const message = body && body.error && body.error.message
          ? body.error.message
          : `请求失败（${res.statusCode}）`;
        const error = new Error(message);
        error.status = res.statusCode;
        error.code = body && body.error ? body.error.code : "http_error";
        reject(error);
      },
      fail(err) {
        const error = new Error(friendlyFailure(err));
        error.code = "network_error";
        reject(error);
      }
    });
  });
}

function query(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
}

module.exports = {
  bootstrap() {
    return request("/api/bootstrap");
  },

  douban({ kind = "latest", limit = 12 } = {}) {
    return request(`/api/douban/list?${query({ kind, limit })}`);
  },

  search({ q = "", type = "全部", limit = 30 } = {}) {
    return request(`/api/search?${query({ q, type, limit })}`);
  },

  title(id) {
    return request(`/api/titles/${encodeURIComponent(id)}`);
  },

  pan({ q = "", type = "quark", offset = 0, limit = 20, reload = 0 } = {}) {
    return request(`/api/pan/search?${query({ q, type, offset, limit, reload })}`, { timeout: 25000 });
  },

  /** 页面信标：只记路径与语言，失败一律吞掉，埋点不能影响体验。 */
  track(path, lang = "zh") {
    return request("/api/track", { method: "POST", data: { path, lang }, timeout: 5000 });
  }
};
