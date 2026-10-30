"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const BRAND = require("../config/brand.json");
const { DAY_MS, dayKey, startOfDay } = require("../shared/stats-time.js");
const { geoLabel } = require("../shared/geo.js");
const { isHosting, splitVisitors } = require("../shared/asn.js");

const MAX_EVENTS = 200_000;
const EVENT_TYPES = new Set(["search", "view", "click", "pan_search", "page"]);

function isSearchEvent(event) {
  return event.type === "search" || event.type === "pan_search";
}

function percentChange(current, previous) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function emptyBucket(date) {
  return { date, pageviews: 0, searches: 0, views: 0, clicks: 0, visitors: new Set() };
}

function addToBucket(bucket, event, humans) {
  if (isSearchEvent(event)) bucket.searches += 1;
  if (event.type === "view") bucket.views += 1;
  if (event.type === "click") bucket.clicks += 1;
  if (event.type === "page") bucket.pageviews += 1;
  if (event.visitorId && humans.has(event.visitorId)) bucket.visitors.add(event.visitorId);
}

function summarize(events, humans, hostingVisitors = 0) {
  const visitors = new Set();
  const allIds = new Set();
  let pageviews = 0;
  let searches = 0;
  let views = 0;
  let clicks = 0;
  let zeroSearches = 0;
  events.forEach((event) => {
    if (event.visitorId) {
      allIds.add(event.visitorId);
      if (humans.has(event.visitorId)) visitors.add(event.visitorId);
    }
    if (event.type === "page") pageviews += 1;
    if (isSearchEvent(event)) {
      searches += 1;
      if (event.total === 0) zeroSearches += 1;
    }
    if (event.type === "view") views += 1;
    if (event.type === "click") clicks += 1;
  });
  return {
    pageviews,
    searches,
    views,
    clicks,
    visitors: visitors.size,
    rawVisitors: allIds.size,
    botSuspects: allIds.size - visitors.size,
    hostingVisitors,
    zeroSearches,
    zeroRate: searches ? Math.round((zeroSearches / searches) * 1000) / 10 : 0
  };
}

function topEntries(map, limit) {
  return [...map.values()].sort((a, b) => b.count - a.count || String(b.lastAt).localeCompare(String(a.lastAt))).slice(0, limit);
}

/** 访客列表排序权重：真实访客 2 > 一般疑似 1 > 机房来源 0。 */
function visitorRank(entry, humans) {
  if (humans.has(entry.id)) return 2;
  return entry.anyIp && entry.hosting ? 0 : 1;
}

/**
 * Append-only analytics store. Records query terms, titles, providers, a random
 * visitor cookie, the visitor's source IP and the serving network (ASN + org).
 * User agents are never stored; the network fields only leave this process through
 * the admin endpoints, never through a public one.
 */
class AnalyticsStore {
  constructor({ file, logger = console }) {
    this.file = file;
    this.logger = logger;
    this.events = [];
    this.queue = Promise.resolve();
    this.load();
  }

  load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) return;
    try {
      const lines = fs.readFileSync(this.file, "utf8").split("\n");
      let skipped = 0;
      const events = [];
      lines.forEach((line) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line);
          if (event && EVENT_TYPES.has(event.type) && Number.isFinite(Date.parse(event.at))) {
            events.push(event);
          } else {
            skipped += 1;
          }
        } catch (err) {
          skipped += 1;
        }
      });
      this.events = events.slice(-MAX_EVENTS);
      if (skipped) this.logger.warn(`${BRAND.logPrefix} 已忽略 ${skipped} 条无效统计记录`);
    } catch (err) {
      this.logger.error(`${BRAND.logPrefix} 统计文件读取失败`, err);
    }
  }

  add(event) {
    const entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      ...event
    };
    this.events.push(entry);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    const line = JSON.stringify(entry) + "\n";
    const run = this.queue.then(() => fs.promises.appendFile(this.file, line, "utf8"));
    this.queue = run.catch((err) => {
      this.logger.error(`${BRAND.logPrefix} 统计写入失败`, err);
    });
    return run.catch(() => entry);
  }

  // geo 是 shared/geo.js 清洗出来的 { country, city, ip }（可能为空对象），字段直接摊进 ndjson 行。
  recordSearch({ query, type, total, tookMs, visitorId, geo }) {
    return this.add({
      type: "search",
      query: String(query || "").slice(0, 80),
      resultType: String(type || "全部"),
      total: Number(total) || 0,
      tookMs: Number(tookMs) || 0,
      visitorId: visitorId || null,
      ...(geo || {})
    });
  }

  recordView({ titleId, title, visitorId, geo }) {
    return this.add({
      type: "view",
      titleId: String(titleId || ""),
      title: String(title || "").slice(0, 120),
      visitorId: visitorId || null,
      ...(geo || {})
    });
  }

  recordClick({ titleId, title, providerId, provider, visitorId, geo }) {
    return this.add({
      type: "click",
      titleId: String(titleId || ""),
      title: String(title || "").slice(0, 120),
      providerId: String(providerId || ""),
      provider: String(provider || "").slice(0, 60),
      visitorId: visitorId || null,
      ...(geo || {})
    });
  }

  /** 网盘搜索：netdiskType 记夸克/百度等类型，total 记结果总数。 */
  recordPanSearch({ query, type, total, visitorId, geo }) {
    return this.add({
      type: "pan_search",
      query: String(query || "").slice(0, 80),
      netdiskType: String(type || ""),
      total: Number(total) || 0,
      visitorId: visitorId || null,
      ...(geo || {})
    });
  }

  /** 页面访问：path 是归一化路径（/、/search、/list、/title），lang 是界面语言。 */
  recordPage({ path, lang, visitorId, geo }) {
    return this.add({
      type: "page",
      path: String(path || "").slice(0, 80),
      lang: String(lang || ""),
      visitorId: visitorId || null,
      ...(geo || {})
    });
  }

  dashboard({ days = 30, feedback = [] } = {}) {
    const rangeDays = Math.min(Math.max(Math.round(Number(days) || 30), 1), 365);
    const now = new Date();
    const currentStart = new Date(startOfDay(now).getTime() - (rangeDays - 1) * DAY_MS);
    const previousStart = new Date(currentStart.getTime() - rangeDays * DAY_MS);

    const current = [];
    const previous = [];
    this.events.forEach((event) => {
      const at = new Date(event.at);
      if (Number.isNaN(at.getTime()) || at > now) return;
      // 机房判定放在读取时做：名单随时可改，历史行不用补采也能重算。
      const hosting = event.hosting === undefined ? isHosting(event.asn, event.asOrg) : event.hosting;
      if (at >= currentStart) current.push(hosting ? { ...event, hosting } : event);
      else if (at >= previousStart && at < currentStart) previous.push(hosting ? { ...event, hosting } : event);
    });

    const buckets = new Map();
    // 两个窗口各自独立判定真实访客：上一周期没人打过 page 埋点时，不能借用本周期的结论。
    // splitVisitors 在页面信标之上再剔掉机房 / 代理来源（shared/asn.js）。
    const currentSplit = splitVisitors(current);
    const previousSplit = splitVisitors(previous);
    const currentHumans = currentSplit.humans;
    const previousHumans = previousSplit.humans;
    for (let index = 0; index < rangeDays; index += 1) {
      const date = new Date(currentStart.getTime() + index * DAY_MS);
      buckets.set(dayKey(date), emptyBucket(dayKey(date)));
    }
    current.forEach((event) => {
      const bucket = buckets.get(dayKey(new Date(event.at)));
      if (bucket) addToBucket(bucket, event, currentHumans);
    });

    const currentSummary = summarize(current, currentHumans, currentSplit.hostingVisitors);
    const previousSummary = summarize(previous, previousHumans, previousSplit.hostingVisitors);

    const searchMap = new Map();
    const zeroMap = new Map();
    const titleMap = new Map();
    const platformMap = new Map();
    const visitorMap = new Map();
    const pathMap = new Map();
    const langMap = new Map();
    const geoMap = new Map();
    const botGeoMap = new Map();
    const ipMap = new Map();

    current.forEach((event) => {
      if (isSearchEvent(event) && event.query) {
        const key = String(event.query).trim().toLowerCase();
        const entry = searchMap.get(key) || {
          query: String(event.query).trim(),
          count: 0,
          zeroCount: 0,
          lastAt: event.at
        };
        entry.count += 1;
        if (!event.total) {
          entry.zeroCount += 1;
          const zero = zeroMap.get(key) || {
            query: String(event.query).trim(),
            count: 0,
            lastAt: event.at
          };
          zero.count += 1;
          zero.lastAt = event.at;
          zeroMap.set(key, zero);
        }
        entry.lastAt = event.at;
        searchMap.set(key, entry);
      }

      if (event.type === "view" && event.titleId) {
        const entry = titleMap.get(event.titleId) || {
          id: event.titleId,
          title: event.title,
          views: 0,
          clicks: 0,
          lastAt: event.at
        };
        entry.views += 1;
        entry.title = event.title || entry.title;
        entry.lastAt = event.at;
        titleMap.set(event.titleId, entry);
      }

      if (event.type === "click" && event.providerId) {
        const entry = platformMap.get(event.providerId) || {
          id: event.providerId,
          name: event.provider || event.providerId,
          clicks: 0,
          lastAt: event.at
        };
        entry.clicks += 1;
        entry.lastAt = event.at;
        platformMap.set(event.providerId, entry);
        if (event.titleId) {
          const title = titleMap.get(event.titleId) || {
            id: event.titleId,
            title: event.title,
            views: 0,
            clicks: 0,
            lastAt: event.at
          };
          title.clicks += 1;
          title.title = event.title || title.title;
          title.lastAt = event.at;
          titleMap.set(event.titleId, title);
        }
      }

      // page 事件：唯一能证明「这个 ID 背后跑过浏览器 JS」的信号，单独聚合成路径与语言分布。
      if (event.type === "page") {
        const pagePath = event.path || "其他";
        const pathEntry = pathMap.get(pagePath) || { path: pagePath, count: 0, lastAt: event.at, visitors: new Set() };
        pathEntry.count += 1;
        if (event.visitorId && currentHumans.has(event.visitorId)) pathEntry.visitors.add(event.visitorId);
        pathEntry.lastAt = event.at;
        pathMap.set(pagePath, pathEntry);

        const lang = event.lang || "未知";
        const langEntry = langMap.get(lang) || { lang, count: 0, lastAt: event.at, visitors: new Set() };
        langEntry.count += 1;
        if (event.visitorId && currentHumans.has(event.visitorId)) langEntry.visitors.add(event.visitorId);
        langEntry.lastAt = event.at;
        langMap.set(lang, langEntry);

        // 地区同样只按页面信标统计：与「真实访客」同一口径，避免爬虫的国家分布混进来。
        const geoKey = `${event.country || ""}|${event.city || ""}`;
        const geoEntry = geoMap.get(geoKey) || {
          country: event.country || "",
          city: event.city || "",
          count: 0,
          lastAt: event.at,
          visitors: new Set()
        };
        geoEntry.count += 1;
        if (event.visitorId && currentHumans.has(event.visitorId)) geoEntry.visitors.add(event.visitorId);
        geoEntry.lastAt = event.at;
        geoMap.set(geoKey, geoEntry);
      }

      // 疑似自动化的来源地：出现过事件、却从没打过页面信标的编号，只按国家归并。
      if (event.type !== "page" && event.visitorId && !currentHumans.has(event.visitorId)) {
        const botKey = event.country || "";
        const botEntry = botGeoMap.get(botKey) || { country: botKey, count: 0, lastAt: event.at };
        botEntry.count += 1;
        botEntry.lastAt = event.at;
        botGeoMap.set(botKey, botEntry);
      }

      // 来源 IP：所有事件都归到这里，和上面「只按页面信标统计」的地区分布互补——
      // 这里要的就是能落到具体来源，包括爬虫。real 要求打过页面信标且不是机房网段。
      if (event.ip) {
        const ipEntry = ipMap.get(event.ip) || {
          ip: event.ip,
          country: event.country || "",
          city: event.city || "",
          asn: event.asn || 0,
          asOrg: event.asOrg || "",
          hosting: false,
          count: 0,
          pages: 0,
          lastAt: event.at,
          visitors: new Set()
        };
        ipEntry.count += 1;
        if (event.type === "page") ipEntry.pages += 1;
        if (event.hosting) ipEntry.hosting = true;
        if (!ipEntry.country && event.country) ipEntry.country = event.country;
        if (!ipEntry.city && event.city) ipEntry.city = event.city;
        if (!ipEntry.asn && event.asn) ipEntry.asn = event.asn;
        if (!ipEntry.asOrg && event.asOrg) ipEntry.asOrg = event.asOrg;
        if (event.visitorId) ipEntry.visitors.add(event.visitorId);
        ipEntry.lastAt = event.at;
        ipMap.set(event.ip, ipEntry);
      }

      if (event.visitorId) {
        const entry = visitorMap.get(event.visitorId) || {
          id: event.visitorId,
          searches: 0,
          views: 0,
          clicks: 0,
          pages: 0,
          ip: "",
          ips: new Set(),
          asOrg: "",
          anyIp: false,
          hosting: true,
          lastAt: event.at
        };
        if (isSearchEvent(event)) entry.searches += 1;
        if (event.type === "view") entry.views += 1;
        if (event.type === "click") entry.clicks += 1;
        if (event.type === "page") entry.pages += 1;
        if (event.ip) {
          entry.ips.add(event.ip);
          entry.ip = event.ip;
          entry.anyIp = true;
          // 只要有一次事件来自非机房网段，这个编号就不算机房来源。
          if (!event.hosting) entry.hosting = false;
          if (event.asOrg) entry.asOrg = event.asOrg;
        }
        entry.lastAt = event.at;
        visitorMap.set(event.visitorId, entry);
      }
    });

    const trend = [...buckets.values()].map((bucket) => ({
      date: bucket.date,
      pageviews: bucket.pageviews,
      searches: bucket.searches,
      views: bucket.views,
      clicks: bucket.clicks,
      visitors: bucket.visitors.size
    }));

    const recent = current
      .filter((event) => event.type !== "page")
      .slice()
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 14)
      .map((event) => {
        if (isSearchEvent(event)) {
          return {
            type: "search",
            at: event.at,
            label: `搜索「${event.query}」`,
            detail: event.total ? `${event.total} 个结果` : "没有结果"
          };
        }
        if (event.type === "view") {
          return { type: "view", at: event.at, label: `浏览 ${event.title}`, detail: "详情页" };
        }
        return {
          type: "click",
          at: event.at,
          label: `跳转 ${event.provider}`,
          detail: event.title || "观看渠道"
        };
      });

    // 来源 IP 明细：按事件数排序，最活跃的来源（通常也就是最该盯的）排在前面。
    const topIps = [...ipMap.values()]
      .sort((a, b) => b.count - a.count || String(b.lastAt).localeCompare(String(a.lastAt)))
      .slice(0, 12)
      .map((entry) => ({
        ip: entry.ip,
        label: geoLabel(entry.country, entry.city),
        asn: entry.asn,
        asOrg: entry.asOrg,
        hosting: entry.hosting,
        events: entry.count,
        pages: entry.pages,
        real: entry.pages > 0 && !entry.hosting,
        visitors: entry.visitors.size,
        lastAt: entry.lastAt
      }));

    const visitorList = [...visitorMap.values()]
      // 真实访客排在前面，机房来源排在未经页面信标的编号之后。
      .sort((a, b) => visitorRank(b, currentHumans) - visitorRank(a, currentHumans)
        || String(b.lastAt).localeCompare(String(a.lastAt)))
      .slice(0, 10)
      .map((entry) => ({
        id: entry.id,
        label: `访客 ${String(entry.id).slice(0, 8)}`,
        real: currentHumans.has(entry.id),
        hosting: entry.anyIp && entry.hosting,
        asOrg: entry.asOrg,
        pages: entry.pages,
        searches: entry.searches,
        views: entry.views,
        clicks: entry.clicks,
        ip: entry.ip,
        ips: entry.ips.size,
        lastAt: entry.lastAt
      }));

    return {
      range: {
        days: rangeDays,
        from: currentStart.toISOString(),
        to: now.toISOString()
      },
      overview: currentSummary,
      comparison: {
        pageviews: percentChange(currentSummary.pageviews, previousSummary.pageviews),
        searches: percentChange(currentSummary.searches, previousSummary.searches),
        views: percentChange(currentSummary.views, previousSummary.views),
        clicks: percentChange(currentSummary.clicks, previousSummary.clicks),
        visitors: percentChange(currentSummary.visitors, previousSummary.visitors)
      },
      trend,
      topSearches: topEntries(searchMap, 8),
      zeroSearches: topEntries(zeroMap, 8),
      topTitles: [...titleMap.values()]
        .sort((a, b) => b.views - a.views || b.clicks - a.clicks)
        .slice(0, 8),
      platforms: [...platformMap.values()]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 8),
      topPaths: [...pathMap.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
        .map((entry) => ({ path: entry.path, views: entry.count, visitors: entry.visitors.size, lastAt: entry.lastAt })),
      langs: [...langMap.values()]
        .sort((a, b) => b.count - a.count)
        .map((entry) => ({ lang: entry.lang, views: entry.count, visitors: entry.visitors.size })),
      topGeo: [...geoMap.values()]
        .sort((a, b) => b.count - a.count || String(b.lastAt).localeCompare(String(a.lastAt)))
        .slice(0, 8)
        .map((entry) => ({
          country: entry.country,
          city: entry.city,
          label: geoLabel(entry.country, entry.city),
          views: entry.count,
          visitors: entry.visitors.size,
          lastAt: entry.lastAt
        })),
      // 疑似自动化的流量来自哪些国家：判据与「真实访客」一致（出现过事件但没打过页面信标）。
      suspectGeo: [...botGeoMap.values()]
        .sort((a, b) => b.count - a.count || String(b.lastAt).localeCompare(String(a.lastAt)))
        .slice(0, 6)
        .map((entry) => ({
          country: entry.country,
          label: geoLabel(entry.country, ""),
          events: entry.count,
          lastAt: entry.lastAt
        })),
      topIps,
      visitors: visitorList,
      recent,
      feedback
    };
  }
}

module.exports = { AnalyticsStore };
