// analytics.js — events 表（D1）埋点写入与看板聚合，口径对齐 server/analytics.js。
//
// 与 Node 版的差异（受 events 表结构限制）：
// 1. 匿名访客使用 events.visitor_id 列（来自 yt_vid Cookie），与 Node 版一致；
// 2. 表没有 total 列，search 事件借用 offer_index 存「结果总数」（search 行不存在渠道下标语义），用于 zeroSearches / zeroCount / zeroRate；
// 3. 表没有 title / provider 列，看板里用目录快照（titles.json）按 title_id 还原名称、按 pid 关联 PROVIDERS 配置（作品下架后回退显示 id）；
// 4. 分日口径与 Node 版共用 shared/stats-time.js（北京时间 UTC+8），两套部署的日界一致。
// 5. country/city 来自 Cloudflare 边缘 GeoIP，ip 是访客的真实来源地址，
//    asn/as_org 是该地址所属网络（清洗都在 shared/geo.js）。
//    这些列只从 /api/admin/* 管理端接口输出，公开响应不带；UA 仍然不落库。
// 6. 「真实访客」还要再过一道机房判定（shared/asn.js）：无头浏览器也会执行页面脚本，
//    只按页面信标会把机房 IP 算成人。判定只影响口径与展示，事件本身照常入库。

import { PROVIDERS } from "./config.js";
import statsTime from "../shared/stats-time.js";
import geoLib from "../shared/geo.js";
import asnLib from "../shared/asn.js";

const { DAY_MS, dayKey, startOfDay } = statsTime;
const { geoLabel } = geoLib;

// 看板各列表最多返回的条数：前端每张卡片显示 10 条，其余在「查看全部」弹框里分页。
const LIST_LIMIT = 200;
const { isHosting, splitVisitors } = asnLib;

function percentChange(current, previous) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function emptyBucket(date) {
  return { date, pageviews: 0, searches: 0, views: 0, clicks: 0, visitors: new Set() };
}

function addToBucket(bucket, event, humans) {
  if (event.type === "search") bucket.searches += 1;
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
    if (event.type === "search") {
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

export function createAnalytics({ db, providers = PROVIDERS, titleNames = new Map() }) {
  // geo 是 shared/geo.js 清洗出来的 { country, city, ip, asn?, asOrg? }，缺哪个字段就不写哪个。
  async function add(kind, { q = "", titleId = null, offerIndex = null, pid = null, visitorId = null, geo = null } = {}) {
    await db.prepare(
      "INSERT INTO events (kind, q, title_id, offer_index, pid, visitor_id, country, city, ip, asn, as_org, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      kind,
      String(q).slice(0, 80),
      titleId,
      offerIndex,
      pid,
      visitorId,
      geo && geo.country ? geo.country : null,
      geo && geo.city ? geo.city : null,
      geo && geo.ip ? geo.ip : null,
      geo && geo.asn ? geo.asn : null,
      geo && geo.asOrg ? geo.asOrg : null,
      new Date().toISOString()
    ).run();
  }

  function recordSearch({ query, total, visitorId, geo }) {
    // offer_index 在 search 行上借用为「结果总数」（0 = 无结果），见文件头注释。
    return add("search", { q: String(query || ""), offerIndex: Number(total) || 0, visitorId: visitorId || null, geo });
  }

  function recordView({ titleId, visitorId, geo }) {
    return add("view", { titleId: String(titleId || "") || null, visitorId: visitorId || null, geo });
  }

  function recordClick({ titleId, providerId, offerIndex, visitorId, geo }) {
    return add("click", {
      titleId: String(titleId || "") || null,
      pid: String(providerId || "") || null,
      offerIndex: Number.isInteger(Number(offerIndex)) ? Number(offerIndex) : null,
      visitorId: visitorId || null,
      geo
    });
  }

  /** 网盘搜索：pid 记网盘类型（quark/baidu/...），offer_index 借用来记结果总数。 */
  function recordPanSearch({ query, type, total, visitorId, geo }) {
    return add("pan_search", {
      q: String(query || ""),
      pid: String(type || "") || null,
      offerIndex: Number(total) || 0,
      visitorId: visitorId || null,
      geo
    });
  }

  /** 页面访问：q 记归一化后的路径，pid 记界面语言（zh/en）。 */
  function recordPage({ path, lang, visitorId, geo }) {
    return add("page", {
      q: String(path || ""),
      pid: String(lang || "") || null,
      visitorId: visitorId || null,
      geo
    });
  }

  async function dashboard({ days = 30, feedback = [] } = {}) {
    const rangeDays = Math.min(Math.max(Math.round(Number(days) || 30), 1), 365);
    const now = new Date();
    const start = startOfDay(now);
    const currentStart = new Date(start.getTime() - (rangeDays - 1) * DAY_MS);
    const previousStart = new Date(currentStart.getTime() - rangeDays * DAY_MS);

    const { results } = await db.prepare(
      "SELECT kind, q, title_id, offer_index, pid, visitor_id, country, city, ip, asn, as_org, created_at FROM events WHERE created_at >= ? AND created_at <= ? ORDER BY id"
    ).bind(previousStart.toISOString(), now.toISOString()).all();

    // title_id -> 中文标题（用于 topTitles / recent 的展示名），来自目录快照（内存 Map）。
    const titleNamesMap = titleNames instanceof Map ? titleNames : new Map(Object.entries(titleNames || {}));

    const events = [];
    (results || []).forEach((row) => {
      const at = new Date(row.created_at);
      if (Number.isNaN(at.getTime()) || at > now) return;
      events.push({
        // pan_search 与旧版片库 search 合并统计：看板上的「搜索」就是用户真正搜过什么。
        type: row.kind === "pan_search" ? "search" : row.kind,
        at: row.created_at,
        query: row.q || "",
        // page 行：q 存归一化路径、pid 存界面语言（zh/en），与 recordPage 的写法对齐。
        path: row.kind === "page" ? row.q || "" : "",
        lang: row.kind === "page" ? row.pid || "" : "",
        total: row.kind === "search" || row.kind === "pan_search" ? Number(row.offer_index) || 0 : 0,
        titleId: row.title_id || "",
        title: (row.title_id && titleNamesMap.get(row.title_id)) || row.title_id || "",
        providerId: row.pid || "",
        provider: (providers[row.pid] || {}).name || row.pid || "",
        visitorId: row.visitor_id || null,
        country: row.country || "",
        city: row.city || "",
        ip: row.ip || "",
        asn: Number(row.asn) || 0,
        asOrg: row.as_org || "",
        // 机房判定在读取时做：名单随时可改，历史事件不用补采也能重算。
        hosting: isHosting(row.asn, row.as_org)
      });
    });

    const current = [];
    const previous = [];
    events.forEach((event) => {
      const at = new Date(event.at);
      if (at >= currentStart) current.push(event);
      else if (at >= previousStart) previous.push(event);
    });

    const buckets = new Map();
    for (let index = 0; index < rangeDays; index += 1) {
      const date = new Date(currentStart.getTime() + index * DAY_MS);
      buckets.set(dayKey(date), emptyBucket(dayKey(date)));
    }
    // 两个窗口各自独立判定真实访客：上一周期没人打过 page 埋点时，不能借用本周期的结论。
    // splitVisitors 在页面信标之上再剔掉机房 / 代理来源（shared/asn.js）。
    const currentSplit = splitVisitors(current);
    const previousSplit = splitVisitors(previous);
    const currentHumans = currentSplit.humans;
    const previousHumans = previousSplit.humans;
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
      if (event.type === "search" && event.query) {
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
        if (event.type === "search") entry.searches += 1;
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
      .slice(0, LIST_LIMIT)
      .map((event) => {
        if (event.type === "search") {
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
      topSearches: topEntries(searchMap, LIST_LIMIT),
      zeroSearches: topEntries(zeroMap, LIST_LIMIT),
      topTitles: [...titleMap.values()]
        .sort((a, b) => b.views - a.views || b.clicks - a.clicks)
        .slice(0, LIST_LIMIT),
      platforms: [...platformMap.values()]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, LIST_LIMIT),
      topPaths: [...pathMap.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, LIST_LIMIT)
        .map((entry) => ({ path: entry.path, views: entry.count, visitors: entry.visitors.size, lastAt: entry.lastAt })),
      langs: [...langMap.values()]
        .sort((a, b) => b.count - a.count)
        .map((entry) => ({ lang: entry.lang, views: entry.count, visitors: entry.visitors.size })),
      topGeo: [...geoMap.values()]
        .sort((a, b) => b.count - a.count || String(b.lastAt).localeCompare(String(a.lastAt)))
        .slice(0, LIST_LIMIT)
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
      // 来源 IP 明细：按最近访问时间倒序，最近出现的来源排前面（事件数仅作并列次序）。
      topIps: [...ipMap.values()]
        .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)) || b.count - a.count)
        .slice(0, LIST_LIMIT)
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
        })),
      visitors: [...visitorMap.values()]
        // 真实访客排在前面，机房来源排在未经页面信标的编号之后。
        .sort((a, b) => visitorRank(b, currentHumans) - visitorRank(a, currentHumans)
          || String(b.lastAt).localeCompare(String(a.lastAt)))
        .slice(0, LIST_LIMIT)
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
        })),
      recent,
      feedback
    };
  }

  return { recordSearch, recordView, recordClick, recordPanSearch, recordPage, dashboard };
}
