// 映途后台的线上外壳：托管 client/ 静态资源，并把 /api/* 反代到主站 Worker 的 /api/admin/*。
// 这一层不复制 D1、鉴权或统计逻辑，数据口径与 https://yinto.top 完全一致；
// 主站没有 CORS 头、会话 Cookie 是 HttpOnly，所以只能由服务端代转，不能让浏览器跨域直连。

const UPSTREAM = "https://yinto.top";
const API_PREFIX = "/api";
const ADMIN_COOKIE = /^yt_admin=/;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    // admin.js 用 style="--metric-color:…" 内联变量，样式表来自 Google Fonts。
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'"
  ].join("; ")
};

function json(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

/**
 * 品牌与前台地址：后台客户端需要 brand / frontendUrl，还要 mode=remote 才会
 * 显示「线上 D1」。主站 /api/admin/* 没有这个接口，
 * 这里转发到公开的 /api/bootstrap 再挑白名单字段。
 */
async function handleBootstrap() {
  let brand = null;
  try {
    const upstream = await fetch(`${UPSTREAM}/api/bootstrap`, {
      headers: { accept: "application/json" }
    });
    if (upstream.ok) {
      const payload = await upstream.json();
      brand = payload && payload.brand ? payload.brand : null;
    }
  } catch (err) {
    brand = null;
  }
  return json(200, {
    brand,
    frontendUrl: UPSTREAM,
    mode: "remote",
    remoteBase: UPSTREAM
  });
}

async function handleApi(request, url) {
  if (url.pathname === `${API_PREFIX}/bootstrap` && request.method === "GET") {
    return handleBootstrap();
  }

  const suffix = url.pathname.slice(API_PREFIX.length);
  // 片库管理已移除：后台只做只读看板与反馈，目录 / TMDB 接口一律不转发。
  if (/^\/(titles|tmdb)(\/|$)/.test(suffix)) {
    return json(404, { error: { code: "not_found", message: "接口不存在" } });
  }
  const target = `${UPSTREAM}/api/admin${suffix}${url.search}`;

  const headers = new Headers();
  headers.set("accept", "application/json");
  // 只转后台会话 Cookie：Cloudflare Access 的 CF_Authorization 等凭据没必要发给主站。
  const session = String(request.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => ADMIN_COOKIE.test(part));
  if (session) headers.set("cookie", session);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  // 主站按 cf-connecting-ip 限流登录；子请求里它未必是访客 IP，显式带上原值兜底。
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  // 主站对写请求校验 Origin；浏览器带的是 admin.yinto.top，必须改写成主站域名。
  headers.set("origin", UPSTREAM);
  headers.set("referer", `${UPSTREAM}/`);

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    return json(502, {
      error: { code: "remote_unreachable", message: "连不上线上后端，请稍后再试" }
    });
  }

  const responseHeaders = new Headers(SECURITY_HEADERS);
  responseHeaders.set(
    "content-type",
    upstream.headers.get("content-type") || "application/json; charset=utf-8"
  );
  responseHeaders.set("cache-control", "no-store");

  // 只回传后台会话 Cookie；主站 Cookie 是 host-only 的，跨主机必须在这里改名主机。
  const setCookies = typeof upstream.headers.getSetCookie === "function"
    ? upstream.headers.getSetCookie()
    : [upstream.headers.get("set-cookie")].filter(Boolean);
  for (const entry of setCookies) {
    if (ADMIN_COOKIE.test(entry.trim())) responseHeaders.append("set-cookie", entry);
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  });
}

export default {
  async fetch(request, env) {
    // 访问控制配置好之前整站关闭：连静态页面也不下发。
    if (env.ADMIN_ENABLED !== "true") {
      return new Response("404 Not Found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-robots-tag": "noindex, nofollow"
        }
      });
    }
    const url = new URL(request.url);
    if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
      return handleApi(request, url);
    }
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
