"use strict";

/**
 * 统计口径测试：分日时区、页面信标聚合、真实访客判定。
 *
 * 这里同时比对 server/ 与 admin/server/ 两份 AnalyticsStore 的输出。
 * 后台曾经有一份独立副本漏掉了 pan_search / page 两类事件（载入时被当作无效行丢弃），
 * 看板因此少算了一整类行为；这条 parity 断言就是防止两边再次走偏。
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const statsTime = require("../shared/stats-time.js");
const { AnalyticsStore: FrontStore } = require("../server/analytics.js");
const { AnalyticsStore: AdminStore } = require("../admin/server/analytics.js");

function writeFixture(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yingtu-stats-"));
  const file = path.join(dir, "analytics.ndjson");
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  return file;
}

const quietLogger = { warn() {}, error() {} };

test("分日按北京时间（UTC+8），与宿主机时区无关", () => {
  assert.equal(statsTime.OFFSET_MINUTES, 480);
  // 北京时间 10-29 23:59 与 10-30 00:00 的分界，正好落在 UTC 16:00。
  assert.equal(statsTime.dayKey(new Date("2026-10-29T15:59:59Z")), "2026-10-29");
  assert.equal(statsTime.dayKey(new Date("2026-10-29T16:00:00Z")), "2026-10-30");
  assert.equal(statsTime.startOfDay(new Date("2026-10-29T16:00:00Z")).toISOString(), "2026-10-29T16:00:00.000Z");
  assert.equal(statsTime.startOfDay(new Date("2026-10-29T15:00:00Z")).toISOString(), "2026-10-28T16:00:00.000Z");
});

test("看板聚合页面信标，并只把执行过脚本的编号算作真实访客", () => {
  const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  const file = writeFixture([
    { id: "h1", at: at(1), type: "page", path: "/", lang: "zh", visitorId: "human-1", country: "CN", city: "Shanghai", ip: "203.0.113.7" },
    { id: "h2", at: at(1), type: "page", path: "/search", lang: "en", visitorId: "human-1", country: "CN", city: "Shanghai", ip: "203.0.113.7" },
    { id: "h3", at: at(1), type: "pan_search", query: "沙丘", netdiskType: "quark", total: 5, visitorId: "human-1", country: "CN", city: "Shanghai", ip: "203.0.113.7" },
    { id: "h4", at: at(2), type: "view", titleId: "hotd", title: "龙之家族", visitorId: "human-2", country: "US", city: "Seattle", ip: "198.51.100.20" },
    { id: "h5", at: at(2), type: "page", path: "/", lang: "zh", visitorId: "human-2", country: "US", city: "Seattle", ip: "198.51.100.20" },
    // 采集脚本：不带 Cookie 的请求每次被铸一个新编号，且从不打页面信标。
    { id: "b1", at: at(3), type: "pan_search", query: "《某剧》全集", netdiskType: "quark", total: 0, visitorId: "bot-1", country: "RU", ip: "192.0.2.99" },
    { id: "b2", at: at(3), type: "view", titleId: "hotd", title: "龙之家族", visitorId: "bot-2", country: "RU", ip: "192.0.2.99" }
  ]);

  const dashboard = new FrontStore({ file, logger: quietLogger }).dashboard({ days: 7 });
  const { overview } = dashboard;

  assert.equal(overview.pageviews, 3, "page 事件计入页面浏览");
  assert.equal(overview.searches, 2, "网盘搜索与站内搜索合并计数");
  assert.equal(overview.visitors, 2, "只有打过页面信标的编号算真实访客");
  assert.equal(overview.rawVisitors, 4);
  assert.equal(overview.botSuspects, 2, "差值就是疑似自动化流量");

  assert.ok(dashboard.topPaths.some((entry) => entry.path === "/" && entry.views === 2 && entry.visitors === 2));
  assert.ok(dashboard.topPaths.some((entry) => entry.path === "/search" && entry.views === 1));
  assert.deepEqual(dashboard.langs.map((entry) => [entry.lang, entry.views]), [["zh", 2], ["en", 1]]);

  // 地区只按页面信标统计：human-1 两次上海、human-2 一次西雅图；爬虫的搜索/浏览不进这里。
  assert.deepEqual(
    dashboard.topGeo.map((entry) => [entry.label, entry.views, entry.visitors]),
    [["中国 · Shanghai", 2, 1], ["美国 · Seattle", 1, 1]]
  );
  // 疑似自动化的来源地单独给出：两个没打过页面信标的编号，都在俄罗斯。
  assert.deepEqual(
    dashboard.suspectGeo.map((entry) => [entry.label, entry.events]),
    [["俄罗斯", 2]]
  );

  // 来源 IP 明细：不分真人与脚本，按事件数排，最活跃的来源在前。
  assert.deepEqual(
    dashboard.topIps.map((entry) => [entry.ip, entry.label, entry.events, entry.real]),
    [
      ["203.0.113.7", "中国 · Shanghai", 3, true],
      ["198.51.100.20", "美国 · Seattle", 2, true],
      ["192.0.2.99", "俄罗斯", 2, false]
    ]
  );
  const botSource = dashboard.topIps.find((entry) => entry.ip === "192.0.2.99");
  assert.equal(botSource.pages, 0, "这个来源从没打过页面信标");
  assert.equal(botSource.visitors, 2, "同一 IP 被铸成两个编号，正是脚本的典型特征");

  // 事件取「1~3 小时前」，跨不跨午夜取决于运行时刻；这里对趋势求和，
  // 免得在凌晨运行（事件落到昨天）时「最后一天」桶为 0 造成误判。
  const pageviewTotal = dashboard.trend.reduce((sum, bucket) => sum + bucket.pageviews, 0);
  assert.equal(pageviewTotal, 3);
  const visitorTotal = dashboard.trend.reduce((sum, bucket) => sum + bucket.visitors, 0);
  assert.equal(visitorTotal, 2, "趋势里的每日访客同样只算真实访客");

  assert.equal(dashboard.recent.some((entry) => entry.type === "page"), false, "页面信标不混进最近动态");
  assert.equal(dashboard.visitors[0].real, true);
  assert.ok(dashboard.visitors[0].pages >= 1);
  assert.equal(dashboard.visitors[0].ip, "203.0.113.7", "访客编号带上最近一次来源 IP");
  assert.equal(dashboard.visitors[0].ips, 1);
  assert.equal(dashboard.visitors[dashboard.visitors.length - 1].real, false, "疑似自动化的编号排在最后");
});

test("机房来源执行了页面脚本也不算真实访客，但事件照常入库", () => {
  const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  const file = writeFixture([
    // 家用宽带：正常访客
    { id: "m1", at: at(1), type: "page", path: "/", lang: "zh", visitorId: "human-1", country: "CN", city: "Wuhan", ip: "203.0.113.7", asn: 4134, asOrg: "China Telecom" },
    // Scaleway 上跑的无头浏览器：页面信标、浏览都有，但整个编号都在机房网段
    { id: "m2", at: at(1), type: "page", path: "/", lang: "en", visitorId: "headless-1", country: "FR", city: "Paris", ip: "45.1.1.1", asn: 12876, asOrg: "Scaleway" },
    { id: "m3", at: at(2), type: "view", titleId: "hotd", title: "龙之家族", visitorId: "headless-1", country: "FR", city: "Paris", ip: "45.1.1.1", asn: 12876, asOrg: "Scaleway" },
    // 没有 ASN 的页面信标（历史行 / 本地开发）：仍然算人，不能凭空扣掉
    { id: "m4", at: at(2), type: "page", path: "/search", lang: "en", visitorId: "headless-2", country: "US", ip: "198.51.100.9" }
  ]);

  const dashboard = new FrontStore({ file, logger: quietLogger }).dashboard({ days: 7 });
  const { overview } = dashboard;

  assert.equal(overview.pageviews, 3, "机房来源的页面浏览照常计数");
  assert.equal(overview.visitors, 2, "human-1 与没有 ASN 的 headless-2 才算真实访客");
  assert.equal(overview.rawVisitors, 3);
  assert.equal(overview.hostingVisitors, 1, "被打过页面信标、但整体在机房网段的编号");
  assert.equal(overview.botSuspects, 1, "visitors + botSuspects 仍然等于 rawVisitors");

  const hosting = dashboard.topIps.find((entry) => entry.ip === "45.1.1.1");
  assert.equal(hosting.hosting, true);
  assert.equal(hosting.real, false, "机房 IP 即使打过页面信标也不标成真实来源");
  assert.equal(hosting.asn, 12876);
  assert.equal(hosting.asOrg, "Scaleway");
  assert.equal(hosting.pages, 1, "页面信标本身仍然记在这个来源下");

  const hostVisitor = dashboard.visitors.find((entry) => entry.id === "headless-1");
  assert.equal(hostVisitor.real, false);
  assert.equal(hostVisitor.hosting, true);
  assert.equal(hostVisitor.asOrg, "Scaleway");
  assert.equal(dashboard.visitors[dashboard.visitors.length - 1].id, "headless-1", "机房来源排在最后");

  // 后台只读副本给出同样的结论。
  const admin = new AdminStore({ file, logger: quietLogger }).dashboard({ days: 7 });
  assert.deepEqual(admin.overview, overview);
  assert.deepEqual(admin.topIps, dashboard.topIps);
  assert.deepEqual(admin.visitors, dashboard.visitors);
});

test("前台与后台两份 AnalyticsStore 的看板输出一致", () => {
  const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  const file = writeFixture([
    { id: "p1", at: at(1), type: "page", path: "/list", lang: "zh", visitorId: "v-1", country: "CN", city: "Hangzhou", ip: "203.0.113.11" },
    { id: "s1", at: at(1), type: "search", query: "沙丘", resultType: "全部", total: 3, visitorId: "v-1", country: "CN", city: "Hangzhou", ip: "203.0.113.11" },
    { id: "n1", at: at(1), type: "pan_search", query: "沙丘 夸克", netdiskType: "quark", total: 0, visitorId: "v-1", country: "CN", city: "Hangzhou", ip: "203.0.113.11" },
    { id: "c1", at: at(2), type: "click", titleId: "hotd", title: "龙之家族", providerId: "max", provider: "Max", visitorId: "v-2", country: "SG", ip: "198.51.100.5" }
  ]);

  const front = new FrontStore({ file, logger: quietLogger }).dashboard({ days: 7 });
  const admin = new AdminStore({ file, logger: quietLogger }).dashboard({ days: 7 });

  assert.deepEqual(admin.overview, front.overview);
  assert.deepEqual(admin.trend, front.trend);
  assert.deepEqual(admin.topPaths, front.topPaths);
  assert.deepEqual(admin.langs, front.langs);
  assert.deepEqual(admin.topGeo, front.topGeo);
  assert.deepEqual(admin.suspectGeo, front.suspectGeo);
  assert.deepEqual(admin.topIps, front.topIps);
  assert.deepEqual(admin.visitors.map(({ id, real, pages, ip, ips }) => ({ id, real, pages, ip, ips })),
    front.visitors.map(({ id, real, pages, ip, ips }) => ({ id, real, pages, ip, ips })));
  // v-2 只有点击、没有页面信标 → 地区分布里没有新加坡，但疑似自动化来源里有。
  assert.equal(front.topGeo.some((entry) => entry.country === "SG"), false);
  assert.deepEqual(front.suspectGeo.map((entry) => [entry.country, entry.events]), [["SG", 1]]);
  // 来源 IP 不分真人与脚本，两边都要给出，否则后台看不出「谁在打接口」。
  assert.deepEqual(front.topIps.map((entry) => [entry.ip, entry.events, entry.real]),
    [["203.0.113.11", 3, true], ["198.51.100.5", 1, false]]);
});
