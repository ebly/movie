"use strict";

const path = require("path");
const BRAND = require("../config/brand.json");
const { TitleRepository } = require("./repository");
const { AnalyticsStore } = require("./analytics");
const { FeedbackStore } = require("./feedback");
const { AdminAuth } = require("./adminAuth");
const { createAdminApi } = require("./admin");
const { createRemoteApi } = require("./remote");
const { serveStatic } = require("./lib/static");
const { PROVIDERS, TYPES } = require("./providers");
const { HttpError, sendJSON, sendText, applySecurityHeaders } = require("./lib/http");

const DEFAULT_DATA_DIR = path.resolve(__dirname, "..", "..", "movie", "data");
const DEFAULT_FRONTEND_URL = "http://127.0.0.1:4173";

/**
 * 品牌字段白名单。config/brand.json 里的 defaultPassword、cookies、logPrefix
 * 是服务端内部配置，绝不能跟着 /api/bootstrap 发给浏览器。
 * （与前台项目 shared/brand.js 保持同一份字段清单。）
 */
const PUBLIC_BRAND_FIELDS = ["name", "latin", "slug", "tagline", "slogan", "disclaimer"];

function publicBrand(brand) {
  const result = {};
  PUBLIC_BRAND_FIELDS.forEach((key) => {
    if (brand && brand[key] !== undefined) result[key] = brand[key];
  });
  return result;
}

/**
 * 映途管理后台（独立进程）。两种数据源模式：
 *
 * - 本地模式（默认）：读写 ../movie/data 下的文件。后台写 titles.json，前台读；
 *   前台写 analytics/feedback，后台读。两边不缓存过期数据，改完刷新前台就能看到。
 * - 远程模式（设置 REMOTE_API_BASE）：后台当 BFF 代理，所有 /api/* 转发到线上
 *   Worker 的 /api/admin/*，数据以 D1 为准，不碰本地文件。
 */
function createApp(options = {}) {
  const log = options.logger === false ? () => {} : options.logger || console.log;
  const dataLogger = options.logger === false ? { warn() {}, error() {} } : console;

  const remoteBase = String(
    options.remoteApiBase !== undefined ? options.remoteApiBase : process.env.REMOTE_API_BASE || ""
  ).trim().replace(/\/+$/, "");
  const mode = remoteBase ? "remote" : "local";

  const dataDir = options.dataDir || process.env.ADMIN_DATA_DIR || DEFAULT_DATA_DIR;
  const dataFile = options.dataFile || process.env.DATA_FILE || path.join(dataDir, "titles.json");
  const analyticsFile = options.analyticsFile || process.env.ANALYTICS_FILE || path.join(dataDir, "analytics.ndjson");
  const feedbackFile = options.feedbackFile || process.env.FEEDBACK_FILE || path.join(dataDir, "feedback.ndjson");
  // 远程模式下前台就是那个 Worker（同一个域名同时提供前台与 API）。
  const frontendUrl = String(
    options.frontendUrl || process.env.FRONTEND_URL || (mode === "remote" ? remoteBase : DEFAULT_FRONTEND_URL)
  ).replace(/\/+$/, "");

  const auth = options.auth || new AdminAuth({
    password: options.adminPassword !== undefined ? options.adminPassword : process.env.ADMIN_PASSWORD
  });

  let adminApi;
  if (mode === "remote") {
    adminApi = createRemoteApi({ baseUrl: remoteBase, auth, logger: dataLogger });
  } else {
    const repository = options.repository || new TitleRepository({ file: dataFile, logger: dataLogger });
    const analytics = options.analytics || new AnalyticsStore({ file: analyticsFile, logger: dataLogger });
    const feedback = options.feedback || new FeedbackStore(feedbackFile);
    adminApi = createAdminApi({
      repository,
      analytics,
      auth,
      feedback,
      providers: PROVIDERS,
      types: TYPES
    });
  }
  const clientRoot = path.resolve(options.clientRoot || path.join(__dirname, "..", "client"));

  // 远程模式下密码由线上校验，这里的默认密码告警没有意义。
  if (mode === "local" && auth.usingDefaultPassword) {
    log(`${BRAND.logPrefix} 管理后台正在使用默认密码，部署前请设置 ADMIN_PASSWORD`);
  }

  return async function handler(req, res) {
    const started = process.hrtime.bigint();
    let pathname = "/";

    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      log(`${req.method} ${pathname} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });

    try {
      let url;
      try {
        url = new URL(req.url || "/", "http://localhost");
        pathname = url.pathname;
      } catch (err) {
        throw new HttpError(400, "bad_request", "请求地址不合法");
      }

      // 品牌与前台地址：登录页在拿到会话之前就要用，所以是公开接口。
      if (pathname === "/api/bootstrap") {
        if (req.method !== "GET" && req.method !== "HEAD") {
          sendText(res, 405, "405 · Method Not Allowed", { Allow: "GET, HEAD" });
          return;
        }
        sendJSON(res, 200, {
          brand: publicBrand(BRAND),
          frontendUrl,
          mode,
          remoteBase: mode === "remote" ? remoteBase : null
        });
        return;
      }

      if (pathname === "/api" || pathname.startsWith("/api/")) {
        await adminApi(req, res);
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        sendText(res, 405, "405 · Method Not Allowed", { Allow: "GET, HEAD" });
        return;
      }

      if (pathname === "/robots.txt") {
        applySecurityHeaders(res);
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        });
        res.end("User-agent: *\nDisallow: /\n");
        return;
      }

      await serveStatic(clientRoot, req, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const code = err instanceof HttpError ? err.code : "internal_error";
      // 主动抛出的 HttpError 带着可读的诊断信息（如 remote_unreachable 会说明连的是哪个地址），
      // 直接透出；只有意料之外的异常才用通用文案，避免泄漏堆栈细节。
      const message = err instanceof HttpError ? err.message : "服务器开小差了，请稍后再试";

      if (res.headersSent) {
        res.destroy();
      } else if (pathname === "/api" || pathname.startsWith("/api/")) {
        sendJSON(res, status, { error: { code, message } });
      } else {
        sendText(res, status, `${status} · ${message}`);
      }
      if (status >= 500) console.error(BRAND.logPrefix, err);
    }
  };
}

module.exports = { createApp, DEFAULT_DATA_DIR, DEFAULT_FRONTEND_URL };
