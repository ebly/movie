// adminAuth.js — 无状态管理会话：Web Crypto HMAC-SHA256 签名的 HttpOnly Cookie 令牌，语义对齐 server/adminAuth.js（过期、篡改即拒绝）。
// 密码取 env.ADMIN_PASSWORD，未设置时回退 DEFAULT_PASSWORD（与 Node 版一致，且不对外泄露密码本身）；
// 签名密钥取 env.ADMIN_SECRET，未设置时由密码派生。与 Node 版的差异：令牌不落内存表，服务端无法单独吊销（logout 只清 Cookie）。
// 品牌与 Cookie 名、默认密码来自仓库根目录 config/brand.json，与 Node 服务端共用同一份。

import BRAND from "../config/brand.json";

const COOKIE_NAME = BRAND.cookies.admin;
export const DEFAULT_PASSWORD = BRAND.defaultPassword;
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

const encoder = new TextEncoder();

/* ---------------- 通用 cookie 助手（index.js 也会用到） ---------------- */

export function parseCookies(request) {
  const header = String(request.headers.get("cookie") || "");
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

export function secureFlag(request) {
  try {
    if (new URL(request.url).protocol === "https:") return "; Secure";
  } catch (err) {
    // 忽略非法 URL，按非安全连接处理
  }
  return "";
}

/* ---------------- Web Crypto 工具 ---------------- */

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)));
  return [...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, "0")).join("");
}

/** 常数时间风格的字符串比较（Web Crypto 没有 timingSafeEqual，用 XOR 累积近似）。 */
function safeEqual(a, b) {
  const left = String(a);
  const right = String(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function base64urlEncode(bytes) {
  let binary = "";
  bytes.forEach((entry) => {
    binary += String.fromCharCode(entry);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(value) {
  const padded = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function createAdminAuth({ env, ttlMs = DEFAULT_TTL_MS } = {}) {
  const password = env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const usingDefaultPassword = !env.ADMIN_PASSWORD;
  const secret = env.ADMIN_SECRET || `${BRAND.slug}-worker-auth:${password}`;

  let passwordHashPromise = null;
  const passwordHash = () => (passwordHashPromise = passwordHashPromise || sha256Hex(password));

  let keyPromise = null;
  const hmacKey = () => (keyPromise = keyPromise || crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  ));

  async function sign(payload) {
    const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload));
    return base64urlEncode(new Uint8Array(signature));
  }

  /** 对齐 Node 版：先做 SHA-256 摘要再比较，避免明文长度泄露。 */
  async function checkPassword(candidate) {
    const [given, expected] = await Promise.all([sha256Hex(candidate || ""), passwordHash()]);
    return safeEqual(given, expected);
  }

  /** 签发令牌并把 Set-Cookie 追加进 cookies 数组（由 index.js 统一写回响应头）。 */
  async function issue(request, cookies) {
    const expiresAt = Date.now() + ttlMs;
    const payload = base64urlEncode(encoder.encode(JSON.stringify({ exp: expiresAt })));
    const token = `${payload}.${await sign(payload)}`;
    const maxAge = Math.floor(ttlMs / 1000);
    cookies.push(`${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secureFlag(request)}`);
    return { token, expiresAt };
  }

  /** 校验 Cookie 令牌：签名不符（篡改）或已过期都返回 null。 */
  async function authenticate(request) {
    const token = parseCookies(request)[COOKIE_NAME];
    if (!token) return null;
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const payload = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    if (!safeEqual(signature, await sign(payload))) return null;
    let data;
    try {
      data = JSON.parse(new TextDecoder().decode(base64urlDecode(payload)));
    } catch (err) {
      return null;
    }
    if (!data || !Number.isFinite(data.exp) || data.exp <= Date.now()) return null;
    return { token, expiresAt: data.exp };
  }

  function destroy(request, cookies) {
    cookies.push(`${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secureFlag(request)}`);
  }

  return { usingDefaultPassword, checkPassword, issue, authenticate, destroy };
}
