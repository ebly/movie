"use strict";

const fs = require("fs");
const path = require("path");
const { sendText, applySecurityHeaders, CSP } = require("./http");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

function notFound(res) {
  sendText(res, 404, "404 · 页面不存在");
}

async function serveStatic(root, req, res) {
  const url = new URL(req.url, "http://localhost");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname).replace(/\\/g, "/");
  } catch (err) {
    sendText(res, 400, "400 · 路径不合法");
    return;
  }

  if (pathname.includes("\0")) {
    sendText(res, 400, "400 · 路径不合法");
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  if (pathname.endsWith("/")) pathname += "index.html";

  const relative = pathname.replace(/^\/+/, "");
  if (relative.split("/").some((segment) => segment.startsWith("."))) {
    notFound(res);
    return;
  }

  const resolvedRoot = path.resolve(root);
  let filePath = path.resolve(resolvedRoot, relative);
  const guard = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (filePath !== resolvedRoot && !filePath.startsWith(guard)) {
    notFound(res);
    return;
  }

  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch (err) {
    notFound(res);
    return;
  }
  if (stat.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    try {
      stat = await fs.promises.stat(filePath);
    } catch (err) {
      notFound(res);
      return;
    }
  }
  if (!stat.isFile()) {
    notFound(res);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const adminAsset = relative === "admin" || relative.startsWith("admin/");
  applySecurityHeaders(res, {
    ...(ext === ".html" ? { "Content-Security-Policy": CSP } : {}),
    ...(adminAsset ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    ETag: etag,
    "Last-Modified": stat.mtime.toUTCString(),
    "Cache-Control": "no-cache"
  });

  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": "no-cache"
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) sendText(res, 500, "500 · 文件读取失败");
    else res.destroy();
  });
  stream.pipe(res);
}

module.exports = { serveStatic };
