#!/usr/bin/env node
// 映途本地后台代理：把浏览器请求转发到线上 Worker 的 /api/admin/*。
// 页面与代理同源（不需要 CORS）；会话令牌只存在本进程内存里，浏览器不接触 Secure Cookie。
//
// 网络说明：*.workers.dev 在部分网络下 TLS 握手会被重置（ECONNRESET / 握手失败）。
// 本进程会自动读取系统代理并用 NODE_USE_ENV_PROXY 重启自身，让 fetch 走代理。
// 想强制指定：YINGTU_PROXY=http://127.0.0.1:10808 npm run admin:local
// 想关闭代理：YINGTU_PROXY=off npm run admin:local
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const API = (process.env.YINGTU_API || "https://yingtu.yingtu-demo.workers.dev").replace(/\/+$/, "");
const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || "127.0.0.1";

/* ---------------- 代理检测与自重启 ---------------- */

function detectProxy() {
  if (process.env.YINGTU_PROXY) {
    return process.env.YINGTU_PROXY === "off" ? "" : process.env.YINGTU_PROXY;
  }
  const fromEnv = process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;
  if (fromEnv) return fromEnv;

  if (process.platform !== "win32") return "";
  try {
    const out = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer"],
      { encoding: "utf8", timeout: 3000 }
    );
    const match = /ProxyServer\s+REG_SZ\s+(.+)/.exec(out);
    if (!match) return "";
    const raw = match[1].trim();
    if (/^https?:\/\//.test(raw)) return raw;
    const httpsPart = /(?:^|;)\s*https=([^;]+)/i.exec(raw);
    const httpPart = /(?:^|;)\s*http=([^;]+)/i.exec(raw);
    const hostPort = (httpsPart ? httpsPart[1] : httpPart ? httpPart[1] : raw.split(";")[0]).trim();
    return hostPort ? `http://${hostPort}` : "";
  } catch (err) {
    return "";
  }
}

const detectedProxy = detectProxy();
// 三种情况下这里都该有值：自己重启传的、用户手动设的环境变量、系统环境里已有的。
const ACTIVE_PROXY = process.env.YINGTU_ACTIVE_PROXY ||
  process.env.HTTPS_PROXY || process.env.https_proxy ||
  process.env.HTTP_PROXY || process.env.http_proxy || "";

// Node 只在启动时读取 NODE_USE_ENV_PROXY，运行时改 process.env 无效，所以用子进程重启一次。
if (!process.env.NODE_USE_ENV_PROXY && detectedProxy && !/^socks/i.test(detectedProxy)) {
  const child = spawn(process.execPath, [SELF], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_USE_ENV_PROXY: "1",
      HTTPS_PROXY: detectedProxy,
      HTTP_PROXY: detectedProxy,
      YINGTU_ACTIVE_PROXY: detectedProxy
    }
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => {
    console.error("启动代理子进程失败:", err.message);
    process.exit(1);
  });
  await new Promise(() => {});
}

/* ---------------- HTTP 工具 ---------------- */

function send(res, status, body, type = "application/json; charset=utf-8") {
  const buf = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": type,
    "content-length": buf.length,
    "cache-control": "no-store"
  });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// fetch 失败时 err.message 只有 "fetch failed"，真正原因在 err.cause 里
// （ENOTFOUND / ECONNRESET / CERT_HAS_EXPIRED / UNABLE_TO_VERIFY_LEAF_SIGNATURE 等）。
function describeError(err) {
  const parts = [String((err && err.message) || err)];
  const cause = err && err.cause;
  if (cause) {
    const code = cause.code || cause.errno || "";
    const message = cause.message || "";
    const detail = [code, message].filter(Boolean).join(" ");
    if (detail) parts.push(detail);
  }
  return parts.filter(Boolean).join(" · ");
}

let session = { cookie: "", expiresAt: null };

async function callUpstream(pathname, { method = "GET", body, extra = {} } = {}) {
  const headers = { accept: "application/json", ...extra };
  if (session.cookie) headers.cookie = session.cookie;
  // 关键：不带 Origin 头。Worker 的 sameOrigin() 在没有 Origin 时直接放行，
  // 否则从 127.0.0.1 发出的写请求会被判成 403 bad_origin。
  const res = await fetch(API + pathname, { method, headers, body, redirect: "manual" });
  const text = await res.text();
  let payload = text;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    /* 非 JSON 原样返回 */
  }
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return { status: res.status, payload, setCookie };
}

/* ---------------- 路由 ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  try {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return send(res, 200, fs.readFileSync(path.join(HERE, "index.html")), "text/html; charset=utf-8");
    }

    if (url.pathname === "/api/status") {
      return send(res, 200, {
        api: API,
        proxy: ACTIVE_PROXY || (detectedProxy && /^socks/i.test(detectedProxy) ? detectedProxy + "（不支持）" : ""),
        loggedIn: Boolean(session.cookie),
        expiresAt: session.expiresAt
      });
    }

    if (url.pathname === "/api/login" && req.method === "POST") {
      const body = await readBody(req);
      const result = await callUpstream("/api/admin/login", {
        method: "POST",
        body,
        extra: { "content-type": "application/json" }
      });
      if (result.status === 200) {
        const pair = result.setCookie
          .map((line) => String(line || "").split(";")[0])
          .find((line) => line.includes("="));
        if (!pair) return send(res, 502, { error: { message: "上游没有返回会话 Cookie" } });
        session = { cookie: pair, expiresAt: result.payload?.expiresAt || null };
      }
      return send(res, result.status, result.payload);
    }

    if (url.pathname === "/api/logout" && req.method === "POST") {
      req.resume();
      session = { cookie: "", expiresAt: null };
      return send(res, 200, { ok: true });
    }

    if (url.pathname.startsWith("/api/")) {
      const isRead = req.method === "GET" || req.method === "HEAD";
      const result = await callUpstream(`/api/admin/${url.pathname.slice(5)}${url.search}`, {
        method: req.method,
        body: isRead ? undefined : await readBody(req),
        extra: isRead ? {} : { "content-type": "application/json" }
      });
      return send(res, result.status, result.payload);
    }

    send(res, 404, { error: { message: "404 · 本地后台没有这个路径" } });
  } catch (err) {
    send(res, 502, { error: { message: describeError(err) } });
  }
});

server.requestTimeout = 25_000;
server.headersTimeout = 10_000;

server.listen(PORT, HOST, () => {
  console.log(`映途本地后台: http://127.0.0.1:${PORT}`);
  console.log(`上游 API: ${API}`);
  console.log(`代理: ${ACTIVE_PROXY || (detectedProxy ? detectedProxy : "直连")}`);
  console.log("按 Ctrl+C 停止。");
});
