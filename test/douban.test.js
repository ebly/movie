"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize, createDoubanList } = require("../shared/douban");

const row = (over = {}) => ({
  id: "37322586",
  title: "生日快乐",
  original_title: "Happy Birthday",
  year: "2025",
  type: "movie",
  cover: { url: "https://img9.doubanio.com/view/photo/m_ratio_poster/public/p1.jpg" },
  rating: { value: 8.9 },
  release_date: "10.23",
  ...over
});

test("normalizes douban now-playing rows into pickable items", () => {
  const payload = {
    subject_collection_items: [
      row(),
      row({ id: "123", title: "无评分片", rating: { value: 0 }, year: "2026" }),
      row({ id: "", title: "没有 id" }),
      row({ id: "456", title: "   " }),
      row({ id: "789", title: "神探之痕迹\u200e", type: "tv", cover: null })
    ]
  };
  const items = normalize(payload, 10);
  assert.equal(items.length, 3);
  const first = items[0];
  assert.equal(first.id, "douban:37322586");
  assert.equal(first.title, "生日快乐");
  assert.equal(first.year, 2025);
  assert.equal(first.type, "电影");
  assert.equal(first.rating, 8.9);
  // m_ratio_poster 换成 l_ratio_poster，并锁定豆瓣图床域名
  assert.equal(first.poster, "https://img9.doubanio.com/view/photo/l_ratio_poster/public/p1.jpg");
  assert.equal(first.url, "https://movie.douban.com/subject/37322586/");

  const noRating = items[1];
  assert.equal(noRating.rating, null);
  assert.equal(noRating.year, 2026);

  const tv = items[2];
  assert.equal(tv.type, "剧集");
  assert.equal(tv.poster, null);
  // 方向控制符必须清掉，否则标题宽度和复制都会受影响
  assert.equal(tv.title, "神探之痕迹");
  assert.equal(normalize({ subject_collection_items: [] }, 6).length, 0);
  assert.equal(normalize({}, 6).length, 0);
  assert.equal(normalize({ subject_collection_items: [row(), row({ id: "9" })] }, 1).length, 1);
});

test("douban client caches results and falls back to stale data on failure", async () => {
  let calls = 0;
  let fail = false;
  const client = createDoubanList({
    logger: { warn() {} },
    ttlMs: 60_000,
    fetchImpl: async () => {
      calls += 1;
      if (fail) throw new Error("network down");
      return new Response(JSON.stringify({ subject_collection_items: [row()] }), { status: 200 });
    }
  });
  const a = await client.list({ limit: 6 });
  assert.equal(a.items.length, 1);
  assert.equal(a.cached, false);
  const b = await client.list({ limit: 6 });
  assert.equal(b.cached, true);
  assert.equal(calls, 1);

  // 缓存过期且上游失败：应降级返回旧数据而不是抛错
  let mode = "ok";
  const flaky = createDoubanList({
    logger: { warn() {} },
    ttlMs: 0,
    fetchImpl: async () => {
      if (mode === "fail") throw new Error("network down");
      return new Response(JSON.stringify({ subject_collection_items: [row()] }), { status: 200 });
    }
  });
  const warmed = await flaky.list({ limit: 2 });
  assert.equal(warmed.items.length, 1);
  mode = "fail";
  const degraded = await flaky.list({ limit: 2 });
  assert.equal(degraded.items.length, 1);
  assert.equal(degraded.stale, true);
});

test("hot and latest hit different collections and cache separately", async () => {
  const urls = [];
  const client = createDoubanList({
    logger: { warn() {} },
    fetchImpl: async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ subject_collection_items: [row()] }), { status: 200 });
    }
  });
  const hot = await client.list({ kind: "hot", limit: 3 });
  const latest = await client.list({ kind: "latest", limit: 3 });
  await client.list({ kind: "hot", limit: 3 });
  assert.equal(hot.kind, "hot");
  assert.equal(latest.kind, "latest");
  assert.equal(latest.label, "最新");
  assert.match(urls[0], /movie_hot_gaia/);
  assert.match(urls[1], /movie_latest/);
  assert.equal(urls.length, 2);
});
