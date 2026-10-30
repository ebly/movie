"use strict";

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/app");
const tmdb = require("../shared/tmdb.js");

let server;
let base;
let tmpDir;

describe("页面外壳与 SEO", () => {
  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yingtu-seo-"));
    server = http.createServer(createApp({
      dataFile: path.join(tmpDir, "titles.json"),
      analyticsFile: path.join(tmpDir, "analytics.ndjson"),
      feedbackFile: path.join(tmpDir, "feedback.ndjson"),
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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const html = async (pathname) => {
    const response = await fetch(base + pathname);
    return { status: response.status, body: await response.text(), headers: response.headers };
  };

  test("详情页返回 200 并注入 title / canonical / JSON-LD", async () => {
    const page = await html("/title/hotd");
    assert.equal(page.status, 200);
    assert.match(page.body, /<title>龙之家族 在哪里看 — /);
    assert.match(page.body, /rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/title\/hotd"/);
    assert.match(page.body, /application\/ld\+json/);
    assert.match(page.body, /"@type":"TVSeries"/);
    assert.match(page.headers.get("content-security-policy") || "", /default-src 'self'/);
    // 站内链接必须是真实路径，不能再出现旧的 #/ 链接
    assert.doesNotMatch(page.body, /href="#\//);
  });

  test("未知作品返回 404 且 noindex", async () => {
    const page = await html("/title/not-a-real-id");
    assert.equal(page.status, 404);
    assert.match(page.body, /name="robots" content="noindex,follow"/);
  });

  test("搜索页与片单页 noindex，首页可索引", async () => {
    const search = await html("/search?q=%E6%B2%99%E4%B8%98");
    assert.equal(search.status, 200);
    assert.match(search.body, /<title>搜索「沙丘」的结果 — /);
    assert.match(search.body, /content="noindex,follow"/);

    const list = await html("/list");
    assert.match(list.body, /<title>我的收藏 — /);

    const home = await html("/");
    assert.equal(home.status, 200);
    assert.doesNotMatch(home.body, /name="robots" content="noindex/);
  });

  test("sitemap 覆盖首页与全部作品", async () => {
    const response = await fetch(`${base}/sitemap.xml`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /xml/);
    const xml = await response.text();
    assert.match(xml, /<loc>http:\/\/127\.0\.0\.1:\d+\/<\/loc>/);
    const count = (xml.match(/<loc>/g) || []).length;
    assert.ok(count >= 5, `sitemap 至少应包含 5 条，实际 ${count}`);
  });

  test("robots.txt 指向 sitemap，且不再暴露后台路径", async () => {
    const response = await fetch(`${base}/robots.txt`);
    const body = await response.text();
    assert.doesNotMatch(body, /\/admin/);
    assert.match(body, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
  });

  test("首页注入可索引正文，含站内搜索结构化数据", async () => {
    const home = await html("/");
    // 不执行 JS 的爬虫也能看到作品标题与站内链接
    assert.match(home.body, /class="seo-static"/);
    assert.match(home.body, /<a href="\/title\/hotd">/);
    assert.doesNotMatch(home.body, /<!--SEO-BODY-->/);
    assert.match(home.body, /"@type":"WebSite"/);
    assert.match(home.body, /"@type":"SearchAction"/);
    assert.match(home.body, /"@type":"Organization"/);
    assert.match(home.body, /property="og:site_name" content="映途"/);
    assert.match(home.body, /property="og:locale" content="zh_CN"/);
    assert.match(home.body, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/icon-512\.png"/);
  });

  test("详情页正文、面包屑、评分与观看渠道结构化数据齐全", async () => {
    const page = await html("/title/hotd");
    assert.match(page.body, /class="seo-static"/);
    assert.match(page.body, /<h1>龙之家族/);
    assert.match(page.body, /class="seo-crumb"/);
    assert.match(page.body, /<span>龙之家族<\/span>/); // 面包屑当前项
    assert.match(page.body, /"@type":"BreadcrumbList"/);
    assert.match(page.body, /"@type":"AggregateRating"/);
    assert.match(page.body, /"@type":"Offer"/);
    // 无海报时 og:image 需回落到绝对地址
    assert.match(page.body, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/icon-512\.png"/);
  });

  test("sitemap 声明图片命名空间", async () => {
    const response = await fetch(`${base}/sitemap.xml`);
    const xml = await response.text();
    assert.match(xml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  });

  test("llms.txt 提供站点摘要与作品链接", async () => {
    const response = await fetch(`${base}/llms.txt`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/plain/);
    const body = await response.text();
    assert.match(body, /^# 映途/);
    assert.match(body, /\]\(http:\/\/127\.0\.0\.1:\d+\/title\//);
    assert.match(body, /sitemap\.xml/);
  });

  test("robots 显式放行 AI 爬虫并指向 sitemap", async () => {
    const body = await (await fetch(`${base}/robots.txt`)).text();
    assert.match(body, /User-agent: GPTBot/);
    assert.match(body, /User-agent: PerplexityBot/);
    assert.match(body, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
    assert.doesNotMatch(body, /\/admin/);
  });

  test("详情正文有一句话结论，可索引页放开 snippet", async () => {
    const page = await html("/title/hotd");
    assert.match(page.body, /class="seo-lead"/);
    assert.match(page.body, /<h1>龙之家族/);
    const home = await html("/");
    assert.match(home.body, /name="robots" content="max-snippet:-1, max-image-preview:large"/);
  });

  test("分享页可打开且 noindex", async () => {
    const page = await html("/share/hotd");
    assert.equal(page.status, 200);
    assert.match(page.body, /<title>片库分享 — /);
    assert.match(page.body, /content="noindex,follow"/);
  });
});

describe("TMDB 映射", () => {
  const fakeFetch = (payload, status = 200) => async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  });

  test("电影与剧集映射成作品字段", async () => {
    const results = await tmdb.search("dune", {
      key: "1234567890abcdef1234567890abcdef",
      fetchImpl: fakeFetch({
        results: [
          {
            media_type: "movie", id: 438631, title: "沙丘", original_title: "Dune",
            release_date: "2021-09-15", overview: "保罗·厄崔迪…", poster_path: "/abc.jpg",
            vote_average: 7.78, genre_ids: [878, 12]
          },
          {
            media_type: "tv", id: 1396, name: "绝命毒师", original_name: "Breaking Bad",
            first_air_date: "2008-01-20", overview: "", poster_path: null,
            vote_average: 8.9, genre_ids: [18, 80]
          },
          { media_type: "person", id: 1, name: "某人" }
        ]
      })
    });

    assert.equal(results.length, 2);
    assert.deepEqual(results[0], {
      tmdbId: 438631,
      mediaType: "movie",
      title: "沙丘",
      original: "Dune",
      year: 2021,
      overview: "保罗·厄崔迪…",
      poster: "https://image.tmdb.org/t/p/w500/abc.jpg",
      rating: 7.8,
      genres: ["科幻", "冒险"],
      type: "电影"
    });
    assert.equal(results[1].type, "剧集");
    assert.equal(results[1].poster, null);
  });

  test("缺少 Key / 空查询 / 401 都有明确错误码", async () => {
    await assert.rejects(() => tmdb.search("dune", { key: "" }), (err) => err.code === "missing_key");
    await assert.rejects(() => tmdb.search("   ", { key: "k" }), (err) => err.code === "empty_query");
    await assert.rejects(
      () => tmdb.search("dune", { key: "k", fetchImpl: fakeFetch({}, 401) }),
      (err) => err.code === "invalid_key"
    );
  });
});
