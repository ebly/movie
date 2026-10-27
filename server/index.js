"use strict";

const http = require("http");
const { createApp } = require("./app");
const BRAND = require("../config/brand.json");

const port = Number(process.env.PORT || 4173);
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
    console.error(`端口 ${port} 已被占用。可以用 PORT=4174 npm start 换一个端口。`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  const shownHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`${BRAND.name} 已启动: http://${shownHost}:${port}`);
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
