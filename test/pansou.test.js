"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApi } = require("../server/api");
const { createPansouClient, normalizeResults, searchParams } = require("../shared/pansou");
const params = (extra = {}) => new URLSearchParams({ q: "开放电影", ...extra });
const rows = Array.from({ length: 65 }, (_, i) => ({ url: `https://pan.quark.cn/s/test${i}`, note: `公开测试 ${i}`, source: "plugin:test" }));
const wrap = (list = rows) => ({ code: 0, data: { total: list.length, merged_by_type: { quark: list } } });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const make = (fetchImpl, opts = {}) => createPansouClient({ baseUrl: "http://127.0.0.1:8888", fetchImpl, ...opts });

test("Worker bundle exposes the same quark contract without a D1 binding", async (t) => {
  const path = require("node:path");
  const { build } = require("esbuild");
  const output = await build({ entryPoints: [path.join(__dirname, "../worker/index.js")], bundle: true, write: false, format: "esm", platform: "browser" });
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  const request = (query = "?q=test", method = "GET") => new Request(`https://movie.example/api/quark/search${query}`, { method });
  const missing = await worker.fetch(request(), {}, {});
  assert.equal(missing.status, 503); assert.equal((await missing.json()).error.code, "pansou_unconfigured");
  const upstream = [];
  t.mock.method(globalThis, "fetch", async (url, opts) => { upstream.push(JSON.parse(opts.body)); return json(wrap()); });
  const env = { PANSOU_URL: "https://pansou.example" };
  const response = await worker.fetch(request("?q=test&offset=60"), env, {});
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.total, 65); assert.equal(result.items.length, 5); assert.equal(result.complete, false);
  assert.deepEqual(upstream[0].cloud_types, ["quark"]);
  const second = await worker.fetch(request("?q=test"), env, {});
  assert.equal((await second.json()).cached, true); assert.equal(upstream.length, 1);
  assert.equal((await worker.fetch(request("", "POST"), env, {})).status, 405);
  assert.equal((await worker.fetch(request(""), env, {})).status, 400);
});

test("normalizes only genuine Quark links, deduplicates share IDs and retains passwords/sources", () => {
  const list = [
    { url: "https://pan.quark.cn/s/abc?pwd=1234", note: "<script>sample</script>", source: "plugin:a", datetime: "0001-01-01T00:00:00Z" },
    { url: "http://pan.quark.cn/s/abc/", note: "duplicate", source: "tg:b", datetime: "2025-03-01T00:00:00Z" },
    ...["javascript:alert(1)", "https://pan.quark.cn.evil.test/s/abc", "https://pan.quark.cn@evil.test/s/abc", "https://user@pan.quark.cn/s/a", "https://pan.quark.cn:99/s/a", "https://pan.quark.cn/not-a-share", "https://pan.quark.cn/s/a\n"].map((url) => ({ url }))
  ];
  const items = normalizeResults(wrap(list));
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://pan.quark.cn/s/abc");
  assert.equal(items[0].password, "1234");
  assert.deepEqual(items[0].sources, ["plugin:a", "tg:b"]);
  assert.equal(items[0].datetime, "2025-03-01T00:00:00.000Z");
  assert.equal(items[0].title, "<script>sample</script>"); // rendering escapes this, never trust source HTML
  assert.deepEqual(normalizeResults({ total: 0 }), []);
  assert.deepEqual(normalizeResults({ merged_by_type: { baidu: [{}] } }), []);
  assert.throws(() => normalizeResults({ code: 500 }), { code: "pansou_error" });
  assert.throws(() => normalizeResults({ unexpected: true }), { code: "pansou_format" });
});

test("supports baidu / xunlei / aliyun with type isolation and canonical URLs", () => {
  const payload = { code: 0, data: { total: 4, merged_by_type: {
    baidu: [{ url: "https://pan.baidu.com/s/1AbC?pwd=9x2k", note: "百度分享", source: "plugin:b" }],
    xunlei: [{ url: "https://pan.xunlei.com/s/VNabc123?pwd=ab12", note: "迅雷分享", source: "plugin:x" }],
    aliyun: [{ url: "https://www.alipan.com/s/AbC123", note: "阿里分享", source: "plugin:a" }],
    quark: [{ url: "https://pan.quark.cn/s/zzz", note: "夸克分享" }]
  } } };

  const baidu = normalizeResults(payload, "baidu");
  assert.equal(baidu.length, 1);
  assert.equal(baidu[0].id, "baidu:1AbC");
  assert.equal(baidu[0].type, "baidu");
  assert.equal(baidu[0].url, "https://pan.baidu.com/s/1AbC");
  assert.equal(baidu[0].password, "9x2k");

  const xunlei = normalizeResults(payload, "xunlei");
  assert.equal(xunlei.length, 1);
  assert.equal(xunlei[0].url, "https://pan.xunlei.com/s/VNabc123");
  assert.equal(xunlei[0].password, "ab12");
  assert.equal(xunlei[0].type, "xunlei");

  const aliyun = normalizeResults(payload, "aliyun");
  assert.equal(aliyun.length, 1);
  assert.equal(aliyun[0].url, "https://www.alipan.com/s/AbC123");

  assert.equal(normalizeResults(payload).length, 1);
  assert.throws(() => normalizeResults(payload, "pikpak"), { code: "invalid_type" });
  assert.throws(() => searchParams(params({ type: "pikpak" })), { code: "invalid_type" });
  assert.equal(searchParams(params({ type: "baidu" })).type, "baidu");
});

test("type selects the upstream cloud_types and caches per type", async () => {
  const bodies = [];
  const client = make(async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return json(wrap()); });
  await client.search(params());
  await client.search(params({ type: "baidu" }));
  assert.deepEqual(bodies.map((body) => body.cloud_types), [["quark"], ["baidu"]]);
});

test("validates query and pagination instead of silently truncating", () => {
  for (const p of [new URLSearchParams(), params({ q: "a".repeat(121) }), params({ q: "abc\u0001" }), params({ offset: "-1" }), params({ offset: "NaN" }), params({ limit: "101" }), params({ limit: "1.5" }), params({ reload: "yes" })]) {
    assert.throws(() => searchParams(p));
  }
  assert.equal(searchParams(params()).limit, 30);
});

test("queries all enabled sources, filters quark, paginates all results and uses bounded short cache", async () => {
  let calls = 0;
  const client = make(async (url, opts) => {
    calls++;
    assert.equal(url, "http://127.0.0.1:8888/api/search");
    assert.equal(opts.redirect, "error");
    assert.deepEqual(JSON.parse(opts.body), { kw: "开放电影", src: "all", res: "merge", cloud_types: ["quark"] });
    return json(wrap());
  });
  const a = await client.search(params());
  assert.equal(a.total, 65); assert.equal(a.items.length, 30); assert.equal(a.complete, false);
  assert.equal(a.hasMore, true); assert.equal(a.cached, false);
  const b = await client.search(params({ offset: "60" }));
  assert.equal(b.items.length, 5); assert.equal(b.items[0].id, "quark:test60");
  assert.equal(b.hasMore, false); assert.equal(b.cached, true); assert.equal(calls, 1);
  const c = await client.search(params({ reload: "1" }));
  assert.equal(c.cached, false); assert.equal(calls, 2);
});

test("same-query concurrent requests coalesce and overload is bounded", async () => {
  let release, calls = 0;
  const ready = new Promise((resolve) => { release = resolve; });
  const client = make(async () => { calls++; await ready; return json(wrap()); });
  const jobs = [client.search(params()), client.search(params({ offset: "30" })), ...["b", "c", "d"].map((q) => client.search(params({ q })))];
  await assert.rejects(client.search(params({ q: "e" })), { code: "pansou_busy" });
  release();
  const results = await Promise.all(jobs);
  assert.equal(calls, 4); assert.equal(results[1].offset, 30);
});

test("disabled, invalid config, upstream error, timeout and oversized body remain distinguishable", async () => {
  await assert.rejects(createPansouClient().search(params()), { status: 503, code: "pansou_unconfigured" });
  for (const baseUrl of ["http://example.com", "https://user:pass@example.com", "https://example.com?token=abc"]) {
    await assert.rejects(make(() => assert.fail(), { baseUrl }).search(params()), { code: "pansou_config" });
  }
  await assert.rejects(make(async () => { throw new Error("secret host info"); }).search(params()), { code: "pansou_unreachable" });
  await assert.rejects(make(async () => json({}, 401)).search(params()), { code: "pansou_auth" });
  await assert.rejects(make(async () => json({}, 429)).search(params()), { status: 429 });
  await assert.rejects(make(async () => new Response("not-json")).search(params()), { code: "pansou_format" });
  await assert.rejects(make(() => new Promise(() => {}), { timeoutMs: 100 }).search(params()), { status: 504 });
  await assert.rejects(make(async () => new Response("{}", { headers: { "content-length": String(9 * 1024 * 1024) } })).search(params()), { code: "pansou_too_large" });
});

test("login tokens are cached, renewed once on authentication failure, and never returned", async () => {
  let logins = 0, searches = 0;
  const client = make(async (url, opts) => {
    if (url.endsWith("/api/auth/login")) {
      logins++;
      assert.deepEqual(JSON.parse(opts.body), { username: "test-user", password: "test-password" });
      return json({ token: `test-token-${logins}`, expires_at: Math.floor(Date.now() / 1000) + 3600 });
    }
    searches++;
    if (searches === 1) return json({}, 401);
    assert.equal(opts.headers.Authorization, "Bearer test-token-2");
    return json(wrap());
  }, { username: "test-user", password: "test-password", source: "plugin", plugins: "quark4k,quarkres" });
  const result = await client.search(params());
  assert.equal(logins, 2); assert.equal(searches, 2);
  assert.doesNotMatch(JSON.stringify(result), /test-password|test-token/);
  await client.search(params({ reload: "1" }));
  assert.equal(logins, 2);
});

test("Node route handles success, 405, validation, rate limiting and no-store without catalog dependencies", async (t) => {
  const api = createApi({ pansou: make(async () => json(wrap())) });
  const server = http.createServer(api);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/quark/search`;
  const good = await fetch(url + "?q=test&offset=60");
  assert.equal(good.status, 200); assert.equal((await good.json()).items.length, 5);
  assert.equal(good.headers.get("cache-control"), "no-store");
  const bad = await fetch(url); assert.equal(bad.status, 400);
  const wrong = await fetch(url, { method: "POST" });
  assert.equal(wrong.status, 405); assert.equal(wrong.headers.get("allow"), "GET");
  let last;
  for (let i = 0; i < 30; i++) { const res = await fetch(url + "?q=test"); last = res.status; await res.text(); }
  assert.equal(last, 429);
});
