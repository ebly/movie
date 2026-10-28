"use strict";

const http = require("http");
const { createApp, DEFAULT_DATA_DIR, DEFAULT_FRONTEND_URL } = require("./app");
const BRAND = require("../config/brand.json");

const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "127.0.0.1";

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("PORT 必须是 0-65535 之间的整数");
  process.exit(1);
}

const server = http.createServer(createApp());

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。可以用 PORT=4175 npm start 换一个端口。`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  const shownHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const remoteBase = String(process.env.REMOTE_API_BASE || "").replace(/\/+$/, "");
  console.log(`${BRAND.name} 管理后台 已启动: http://${shownHost}:${port}`);
  if (remoteBase) {
    console.log(`  模式: 远程 —— 所有请求转发到 ${remoteBase}/api/admin/*`);
    console.log(`  前台地址: ${process.env.FRONTEND_URL || remoteBase}`);
  } else {
    console.log(`  模式: 本地文件 —— 数据目录 ${process.env.ADMIN_DATA_DIR || DEFAULT_DATA_DIR}`);
    console.log(`  前台地址: ${process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL}`);
  }
  console.log("按 Ctrl+C 停止。");
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n收到 ${signal}，正在关闭…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
