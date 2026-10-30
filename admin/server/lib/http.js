"use strict";

const crypto = require("crypto");
const BRAND = require("../../config/brand.json");

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin"
  };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  // 放开 https: 是因为后台可以给作品填外部海报图片地址（titles.poster）
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

function applySecurityHeaders(res, extra = {}) {
  const headers = { ...securityHeaders(), ...extra };
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
}

function sendJSON(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  applySecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(body);
}

function sendError(res, status, code, message, extraHeaders = {}) {
  sendJSON(res, status, { error: { code, message } }, extraHeaders);
}

function sendText(res, status, text, extraHeaders = {}) {
  applySecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(text);
}

async function readJSON(req, { limit = 16 * 1024 } = {}) {
  const type = String(req.headers["content-type"] || "");
  if (!/^application\/json\b/i.test(type)) {
    throw new HttpError(415, "unsupported_media_type", "请求需使用 application/json");
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new HttpError(413, "payload_too_large", "请求内容过大");
    }
    chunks.push(chunk);
  }
  if (!size) throw new HttpError(400, "invalid_json", "请求体不能为空");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (err) {
    throw new HttpError(400, "invalid_json", "请求体不是合法 JSON");
  }
}

function clientKey(req) {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || "unknown";
}

function parseCookies(req) {
  const header = String(req.headers.cookie || "");
  const result = {};
  if (!header) return result;
  header.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index < 1) return;
    const key = part.slice(0, index).trim();
    if (!key) return;
    try {
      result[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch (err) {
      result[key] = part.slice(index + 1).trim();
    }
  });
  return result;
}

function appendCookie(res, cookie) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) res.setHeader("Set-Cookie", cookie);
  else if (Array.isArray(existing)) res.setHeader("Set-Cookie", [...existing, cookie]);
  else res.setHeader("Set-Cookie", [String(existing), cookie]);
}

function secureFlag(req) {
  if (req.socket && req.socket.encrypted) return "; Secure";
  return process.env.COOKIE_SECURE === "1" ? "; Secure" : "";
}

const VISITOR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stable anonymous id for behavior stats. No IP or user agent is stored. */
function visitorId(req, res) {
  const cookies = parseCookies(req);
  const name = BRAND.cookies.visitor;
  let id = cookies[name];
  if (!id || !VISITOR_RE.test(id)) {
    id = crypto.randomUUID();
    appendCookie(
      res,
      `${name}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secureFlag(req)}`
    );
  }
  return id;
}

module.exports = {
  HttpError,
  CSP,
  applySecurityHeaders,
  sendJSON,
  sendError,
  sendText,
  readJSON,
  clientKey,
  parseCookies,
  appendCookie,
  secureFlag,
  visitorId
};
