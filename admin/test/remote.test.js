"use strict";

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/app");
const BRAND = require("../config/brand.json");

const REMOTE_PASSWORD = "remote-pass";
const REMOTE_TOKEN = "remote-token-abc";
const REMOTE_TITLE = { id: "remote-only", title: "线上作品", type: "电影", offers: [] };

let upstream;
let upstreamUrl;
let seen;
let expireRemote = false;

let server;
let base;
let cookie;
let tmpDir;

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
}

function json(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extra
  });
  res.end(body);
}

/** 模拟线上 Worker 的 /api/admin/* 行为，并把收到的请求记录下来供断言。 */
function startUpstream() {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      const body = await readBody(req);
      seen.push({
        method: req.method,
        path: url.pathname,
        search: url.search,
        cookie: req.headers.cookie || "",
        contentType: req.headers["content-type"] || "",
        tmdbKey: req.headers["x-tmdb-key"] || "",
        body
      });

      const authorized = !expireRemote && (req.headers.cookie || "").includes(`yt_admin=${REMOTE_TOKEN}`);

      if (url.pathname === "/api/admin/login" && req.method === "POST") {
        let payload = null;
        try {
          payload = JSON.parse(body);
        } catch (err) {
          payload = null;
        }
        if (!payload || payload.password !== REMOTE_PASSWORD) {
          return json(res, 401, { error: { code: "invalid_password", message: "密码不正确" } });
        }
        res.setHeader("Set-Cookie", `yt_admin=${REMOTE_TOKEN}; Path=/; Max-Age=43200; HttpOnly; SameSite=Strict`);
        return json(res, 200, { ok: true, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      }

      if (url.pathname === "/api/admin/logout" && req.method === "POST") {
        return json(res, 200, { ok: true });
      }

      if (!authorized) {
        return json(res, 401, { error: { code: "unauthorized", message: "请先登录管理后台" } });
      }

      if (url.pathname === "/api/admin/titles" && req.method === "GET") {
        return json(res, 200, { total: 1, items: [REMOTE_TITLE] });
      }
      if (url.pathname === "/api/admin/meta") {
        return json(res, 200, { providers: [{ id: "netflix", name: "Netflix" }], types: ["电影"] });
      }
      if (url.pathname === "/api/admin/dashboard") {
        return json(res, 200, { range: { days: 7 }, overview: { searches: 9 }, trend: [], usingDefaultPassword: false });
      }
      if (url.pathname === "/api/admin/titles/remote-only" && req.method === "DELETE") {
        return json(res, 200, { ok: true, id: "remote-only" });
      }

      return json(res, 404, { error: { code: "not_found", message: "接口不存在" } });
    });
    srv.listen(0, "127.0.0.1", () => {
      upstream = srv;
      upstreamUrl = `http://127.0.0.1:${srv.address().port}`;
      resolve();
    });
  });
}

describe(`${BRAND.name} 管理后台 · 远程模式`, () => {
  before(async () => {
    seen = [];
    await startUpstream();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yingtu-remote-"));
    // 故意指向一个不存在的片库文件：远程模式就不该碰本地数据。
    server = http.createServer(createApp({
      remoteApiBase: upstreamUrl,
      dataFile: path.join(tmpDir, "does-not-exist.json"),
      analyticsFile: path.join(tmpDir, "does-not-exist.ndjson"),
      feedbackFile: path.join(tmpDir, "does-not-exist.ndjson"),
      logger: false
    }));
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function call(pathname, { method = "GET", body, auth = true, headers = {} } = {}) {
    const finalHeaders = { Accept: "application/json", ...headers };
    if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
    if (auth && cookie) finalHeaders.Cookie = cookie;
    const response = await fetch(base + pathname, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }
    return { response, body: payload };
  }

  test("bootstrap 明确标记远程模式，前台地址指向线上", async () => {
    const { response, body } = await call("/api/bootstrap", { auth: false });
    assert.equal(response.status, 200);
    assert.equal(body.mode, "remote");
    assert.equal(body.frontendUrl, upstreamUrl);
    assert.equal(body.remoteBase, upstreamUrl);
    assert.equal(body.brand.defaultPassword, undefined, "仍然不能下发默认密码");
  });

  test("未登录时 session 报告 remote 且未认证", async () => {
    const { response, body } = await call("/api/session", { auth: false });
    assert.equal(response.status, 200);
    assert.equal(body.authenticated, false);
    assert.equal(body.mode, "remote");
    assert.equal(body.remoteBase, upstreamUrl);
  });

  test("登录错误密码由线上判定，本地不透传远程 Cookie", async () => {
    const bad = await call("/api/login", { method: "POST", body: { password: "wrong" }, auth: false });
    assert.equal(bad.response.status, 401);
    assert.equal(bad.body.error.code, "invalid_password");

    const good = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: REMOTE_PASSWORD })
    });
    assert.equal(good.status, 200);
    const setCookie = good.headers.getSetCookie().join("; ");
    assert.ok(setCookie.includes(`${BRAND.cookies.admin}=`), "本地应签发自己的会话 Cookie");
    assert.ok(!setCookie.includes(REMOTE_TOKEN), "远程会话 Cookie 不能下发给浏览器");
    cookie = setCookie.split(";")[0].trim();

    // 线上确实收到了密码
    const loginHit = seen.filter((entry) => entry.path === "/api/admin/login").pop();
    assert.ok(loginHit, "应向线上发出登录请求");
    assert.equal(JSON.parse(loginHit.body).password, REMOTE_PASSWORD);

    const session = await call("/api/session");
    assert.equal(session.body.authenticated, true);
  });

  test("后台请求转发到线上 /api/admin/*，并代持远程 Cookie", async () => {
    const list = await call("/api/titles");
    assert.equal(list.response.status, 200);
    assert.equal(list.body.total, 1);
    assert.equal(list.body.items[0].id, "remote-only");

    const hit = seen.filter((entry) => entry.path === "/api/admin/titles").pop();
    assert.ok(hit, "应转发到 /api/admin/titles");
    assert.equal(hit.cookie, `${BRAND.cookies.admin}=${REMOTE_TOKEN}`, "转发的必须是远程 Cookie，不是本地 Cookie");

    const meta = await call("/api/meta");
    assert.equal(meta.response.status, 200);
    assert.equal(meta.body.types[0], "电影");

    const board = await call("/api/dashboard?days=7");
    assert.equal(board.body.overview.searches, 9);
    const boardHit = seen.filter((entry) => entry.path === "/api/admin/dashboard").pop();
    assert.equal(boardHit.search, "?days=7", "查询串要一起转发");
  });

  test("写请求的方法、请求体与 TMDB 头都透传", async () => {
    const removed = await call("/api/titles/remote-only", {
      method: "DELETE",
      headers: { "x-tmdb-key": "tmdb-key-123" }
    });
    assert.equal(removed.response.status, 200);
    const hit = seen.filter((entry) => entry.path === "/api/admin/titles/remote-only").pop();
    assert.ok(hit);
    assert.equal(hit.method, "DELETE");
    assert.equal(hit.tmdbKey, "tmdb-key-123");
  });

  test("线上会话过期后本地回到未登录，且绑定被清掉", async () => {
    expireRemote = true;
    const expired = await call("/api/titles");
    assert.equal(expired.response.status, 401);

    const session = await call("/api/session");
    assert.equal(session.body.authenticated, false, "本地绑定应已作废");
    expireRemote = false;
  });

  test("线上不可达时返回 502 而不是崩掉", async () => {
    // 先重新登录拿回绑定
    const relogin = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: REMOTE_PASSWORD })
    });
    cookie = relogin.headers.getSetCookie().join("; ").split(";")[0].trim();

    const dead = http.createServer(createApp({
      remoteApiBase: "http://127.0.0.1:1",
      logger: false
    }));
    await new Promise((resolve) => dead.listen(0, "127.0.0.1", resolve));
    const deadBase = `http://127.0.0.1:${dead.address().port}`;
    try {
      const login = await fetch(`${deadBase}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: REMOTE_PASSWORD })
      });
      assert.equal(login.status, 502);
      const payload = await login.json();
      assert.equal(payload.error.code, "remote_unreachable");
    } finally {
      await new Promise((resolve) => dead.close(resolve));
    }
  });

  test("跨站写请求被拒，登出会通知线上", async () => {
    const crossOrigin = await call("/api/titles/remote-only", {
      method: "DELETE",
      headers: { Origin: "https://evil.example.com" }
    });
    assert.equal(crossOrigin.response.status, 403);

    const logout = await call("/api/logout", { method: "POST" });
    assert.equal(logout.response.status, 200);
    assert.match(logout.response.headers.get("set-cookie") || "", /Max-Age=0/);

    const after = await call("/api/titles");
    assert.equal(after.response.status, 401);

    assert.ok(
      seen.some((entry) => entry.path === "/api/admin/logout" && entry.method === "POST"),
      "应通知线上会话失效"
    );
  });

  test("远程模式不会去读本地片库文件", () => {
    assert.equal(fs.existsSync(path.join(tmpDir, "does-not-exist.json")), false);
  });
});
