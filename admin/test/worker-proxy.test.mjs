import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// worker/index.js 是给 Workers 的 ES module；movie-admin 的 package.json 没有 "type": "module"，
// 直接 import 会被当成 CommonJS，这里用 data URL 载入源码。
const source = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");
const { default: worker } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const ASSETS = {
  async fetch(request) {
    return new Response(`asset:${new URL(request.url).pathname}`, { status: 200 });
  }
};

const ENV = { ASSETS, ADMIN_ENABLED: "true" };

function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.fetch = original;
    })
    .then((result) => ({ result, calls }));
}

test("登录请求转发到主站 /api/admin，并改写成主站 Origin", async () => {
  const { result, calls } = await withFetch(
    () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": "yt_admin=token123; Path=/; HttpOnly; SameSite=Strict; Secure"
      }
    }),
    () => worker.fetch(new Request("https://admin.yinto.top/api/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://admin.yinto.top",
        "cf-connecting-ip": "203.0.113.9"
      },
      body: JSON.stringify({ password: "x" })
    }), ENV)
  );

  assert.equal(calls[0].url, "https://yinto.top/api/admin/login");
  const sent = new Headers(calls[0].init.headers);
  assert.equal(sent.get("origin"), "https://yinto.top");
  assert.equal(sent.get("referer"), "https://yinto.top/");
  assert.equal(sent.get("x-forwarded-for"), "203.0.113.9");
  assert.equal(await result.text(), JSON.stringify({ ok: true }));
  assert.match(result.headers.get("set-cookie"), /^yt_admin=token123/);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("只回传后台会话 Cookie，其它 Cookie 丢弃", async () => {
  const { result } = await withFetch(
    () => new Response("{}", {
      status: 200,
      headers: [
        ["content-type", "application/json"],
        ["set-cookie", "yt_vid=abc; Path=/"],
        ["set-cookie", "yt_admin=xyz; Path=/; HttpOnly"]
      ]
    }),
    () => worker.fetch(new Request("https://admin.yinto.top/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    }), ENV)
  );

  const cookies = result.headers.getSetCookie();
  assert.equal(cookies.length, 1);
  assert.match(cookies[0], /^yt_admin=xyz/);
});

test("只把后台会话 Cookie 转给主站，Access 凭据不转发", async () => {
  const { result, calls } = await withFetch(
    () => new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }),
    () => worker.fetch(new Request("https://admin.yinto.top/api/dashboard?days=7", {
      headers: { cookie: "CF_Authorization=access-jwt; yt_admin=token123; CF_AppSession=abc" }
    }), ENV)
  );

  assert.equal(calls[0].url, "https://yinto.top/api/admin/dashboard?days=7");
  assert.equal(new Headers(calls[0].init.headers).get("cookie"), "yt_admin=token123");
  assert.equal(result.status, 200);
});

test("/api/bootstrap 走公开接口，并补充前端地址与远程模式标记", async () => {
  const { result, calls } = await withFetch(
    () => new Response(JSON.stringify({ brand: { name: "映途" }, stats: { titles: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }),
    () => worker.fetch(new Request("https://admin.yinto.top/api/bootstrap"), ENV)
  );

  assert.equal(calls[0].url, "https://yinto.top/api/bootstrap");
  const payload = await result.json();
  assert.deepEqual(payload.brand, { name: "映途" });
  assert.equal(payload.mode, "remote");
  assert.equal(payload.frontendUrl, "https://yinto.top");
  assert.equal(payload.stats, undefined);
});

test("静态资源与 robots 不经过上游", async () => {
  const { result, calls } = await withFetch(
    () => new Response("upstream", { status: 200 }),
    () => worker.fetch(new Request("https://admin.yinto.top/"), ENV)
  );
  assert.equal(calls.length, 0);
  assert.equal(await result.text(), "asset:/");

  const { result: robots } = await withFetch(
    () => new Response("upstream", { status: 200 }),
    () => worker.fetch(new Request("https://admin.yinto.top/robots.txt"), ENV)
  );
  assert.match(await robots.text(), /Disallow: \//);
});

test("开关未开启时整站 404，静态页面和 API 都不下发", async () => {
  const { result, calls } = await withFetch(
    () => new Response("upstream", { status: 200 }),
    async () => {
      const page = await worker.fetch(new Request("https://admin.yinto.top/"), { ASSETS, ADMIN_ENABLED: "false" });
      return page;
    }
  );
  assert.equal(result.status, 404);
  assert.equal(calls.length, 0);
  assert.equal(await result.text(), "404 Not Found");
});

test("片库 / TMDB 接口被拦下，不转发到主站", async () => {
  const { result, calls } = await withFetch(
    () => new Response("upstream", { status: 200 }),
    () => worker.fetch(new Request("https://admin.yinto.top/api/titles"), ENV)
  );
  assert.equal(result.status, 404);
  assert.equal(calls.length, 0);
  assert.equal((await result.json()).error.code, "not_found");

  const { result: tmdb, calls: tmdbCalls } = await withFetch(
    () => new Response("upstream", { status: 200 }),
    () => worker.fetch(new Request("https://admin.yinto.top/api/tmdb/search?q=x"), ENV)
  );
  assert.equal(tmdb.status, 404);
  assert.equal(tmdbCalls.length, 0);
});

test("上游不可达时返回 502 JSON", async () => {
  const { result } = await withFetch(
    () => { throw new Error("boom"); },
    () => worker.fetch(new Request("https://admin.yinto.top/api/dashboard"), ENV)
  );
  assert.equal(result.status, 502);
  const payload = await result.json();
  assert.equal(payload.error.code, "remote_unreachable");
});
