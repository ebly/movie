"use strict";

const path = require("path");
const BRAND = require("../config/brand.json");
const seed = require("./data/seed");
const { createStore } = require("./store");
const { TitleRepository } = require("./repository");
const { AnalyticsStore } = require("./analytics");
const { FeedbackStore } = require("./feedback");
const { createApi } = require("./api");
const { createPansouClient, configFromEnv } = require("../shared/pansou");
const { createGoHandler } = require("./go");
const { serveStatic } = require("./lib/static");
const { PageRenderer, originOf } = require("./pages");
const { HttpError, CSP, sendError, sendText, applySecurityHeaders } = require("./lib/http");

function sendHTML(res, req, status, html, extraHeaders = {}) {
  const body = Buffer.from(html, "utf8");
  applySecurityHeaders(res, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    ...extraHeaders
  });
  res.writeHead(status);
  res.end(req.method === "HEAD" ? undefined : body);
}

function createApp(options = {}) {
  const log = options.logger === false ? () => {} : options.logger || console.log;
  const dataLogger = options.logger === false ? { warn() {}, error() {} } : console;
  const dataFile = options.dataFile || process.env.DATA_FILE || path.join(__dirname, "..", "data", "titles.json");
  const analyticsFile = options.analyticsFile || process.env.ANALYTICS_FILE || path.join(__dirname, "..", "data", "analytics.ndjson");
  const feedbackFile = options.feedbackFile || process.env.FEEDBACK_FILE || path.join(__dirname, "..", "data", "feedback.ndjson");

  const repository = options.repository || new TitleRepository({
    file: dataFile,
    seedData: seed.DATA,
    logger: dataLogger
  });
  const store = options.store || createStore({ providers: seed.PROVIDERS, repository });
  const analytics = options.analytics || new AnalyticsStore({ file: analyticsFile, logger: dataLogger });
  const feedback = options.feedback || new FeedbackStore(feedbackFile);
  const pansou = options.pansou || createPansouClient(configFromEnv(process.env));
  const api = createApi({ store, feedback, analytics, pansou });
  const go = createGoHandler({ store, analytics });
  const clientRoot = path.resolve(options.clientRoot || path.join(__dirname, "..", "client"));
  const pages = new PageRenderer({ clientRoot, brand: BRAND, repository, providers: seed.PROVIDERS });

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

      if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/api/admin" || pathname.startsWith("/api/admin/")) {
        // 管理后台已经拆成独立项目（默认 http://127.0.0.1:4174），这里不再提供任何后台入口。
        sendText(res, 404, "404 · 页面不存在");
        return;
      }

      const goMatch = /^\/go\/([^/]+)\/(\d+)\/?$/.exec(pathname);
      if (goMatch) {
        if (req.method !== "GET" && req.method !== "HEAD") {
          sendText(res, 405, "405 · Method Not Allowed", { Allow: "GET, HEAD" });
          return;
        }
        await go(req, res, goMatch[1], goMatch[2]);
        return;
      }

      if (pathname === "/api" || pathname.startsWith("/api/")) {
        await api(req, res);
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        sendText(res, 405, "405 · Method Not Allowed", { Allow: "GET, HEAD" });
        return;
      }

      const origin = originOf(req);
      let page = null;
      if (pathname === "/" || pathname === "/index.html") {
        page = pages.home(origin);
      } else if (pathname === "/search" || pathname === "/search/") {
        page = pages.search(url, origin);
      } else if (pathname === "/list" || pathname === "/list/") {
        page = pages.list(url, origin);
      } else {
        const titleMatch = /^\/title\/([^/]+)\/?$/.exec(pathname);
        if (titleMatch) {
          let id = titleMatch[1];
          try {
            id = decodeURIComponent(id);
          } catch (err) {
            id = "";
          }
          page = pages.detail(id, origin);
        }
      }

      if (page) {
        const headers = page.status === 404
          ? { "Content-Security-Policy": CSP, "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" }
          : { "Content-Security-Policy": CSP, "Cache-Control": "no-cache" };
        sendHTML(res, req, page.status, page.html, headers);
        return;
      }

      if (pathname === "/robots.txt") {
        applySecurityHeaders(res);
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        });
        res.end(pages.robots(origin));
        return;
      }

      if (pathname === "/sitemap.xml") {
        applySecurityHeaders(res);
        res.writeHead(200, {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        });
        res.end(req.method === "HEAD" ? undefined : pages.sitemap(origin));
        return;
      }

      if (pathname === "/llms.txt") {
        applySecurityHeaders(res);
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        });
        res.end(req.method === "HEAD" ? undefined : pages.llms(origin));
        return;
      }

      await serveStatic(clientRoot, req, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const code = err instanceof HttpError ? err.code : "internal_error";
      const message = status >= 500 ? "服务器开小差了，请稍后再试" : err.message;

      if (res.headersSent) {
        res.destroy();
      } else {
        sendError(res, status, code, message);
      }
      if (status >= 500) console.error(BRAND.logPrefix, err);
    }
  };
}

module.exports = { createApp };
