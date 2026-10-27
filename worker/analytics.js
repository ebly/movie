// analytics.js — events 表（D1）埋点写入与看板聚合，口径对齐 server/analytics.js。
//
// 与 Node 版的差异（受 events 表结构限制）：
// 1. 匿名访客使用 events.visitor_id 列（来自 yt_vid Cookie），与 Node 版一致：不存 IP/UA；
// 2. 表没有 total 列，search 事件借用 offer_index 存「结果总数」（search 行不存在渠道下标语义），用于 zeroSearches / zeroCount / zeroRate；
// 3. 表没有 title / provider 列，看板里按 title_id 关联 titles 表、按 pid 关联 PROVIDERS 配置还原名称（作品被删除后回退显示 id）；
// 4. 按日分桶使用 UTC 日期（Node 版用服务器本地时区）。

import { PROVIDERS } from "./config.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, "0");
}

function dayKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function startOfUTCDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function percentChange(current, previous) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function emptyBucket(date) {
  return { date, searches: 0, views: 0, clicks: 0, visitors: new Set() };
}

function addToBucket(bucket, event) {
  if (event.type === "search") bucket.searches += 1;
  if (event.type === "view") bucket.views += 1;
  if (event.type === "click") bucket.clicks += 1;
  if (event.visitorId) bucket.visitors.add(event.visitorId);
}

function summarize(events) {
  const visitors = new Set();
  let searches = 0;
  let views = 0;
  let clicks = 0;
  let zeroSearches = 0;
  events.forEach((event) => {
    if (event.visitorId) visitors.add(event.visitorId);
    if (event.type === "search") {
      searches += 1;
      if (event.total === 0) zeroSearches += 1;
    }
    if (event.type === "view") views += 1;
    if (event.type === "click") clicks += 1;
  });
  return {
    searches,
    views,
    clicks,
    visitors: visitors.size,
    zeroSearches,
    zeroRate: searches ? Math.round((zeroSearches / searches) * 1000) / 10 : 0
  };
}

function topEntries(map, limit) {
  return [...map.values()].sort((a, b) => b.count - a.count || String(b.lastAt).localeCompare(String(a.lastAt))).slice(0, limit);
}

export function createAnalytics({ db, providers = PROVIDERS }) {
  async function add(kind, { q = "", titleId = null, offerIndex = null, pid = null, visitorId = null } = {}) {
    await db.prepare(
      "INSERT INTO events (kind, q, title_id, offer_index, pid, visitor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(kind, String(q).slice(0, 80), titleId, offerIndex, pid, visitorId, new Date().toISOString()).run();
  }

  function recordSearch({ query, total, visitorId }) {
    // offer_index 在 search 行上借用为「结果总数」（0 = 无结果），见文件头注释。
    return add("search", { q: String(query || ""), offerIndex: Number(total) || 0, visitorId: visitorId || null });
  }

  function recordView({ titleId, visitorId }) {
    return add("view", { titleId: String(titleId || "") || null, visitorId: visitorId || null });
  }

  function recordClick({ titleId, providerId, offerIndex, visitorId }) {
    return add("click", {
      titleId: String(titleId || "") || null,
      pid: String(providerId || "") || null,
      offerIndex: Number.isInteger(Number(offerIndex)) ? Number(offerIndex) : null,
      visitorId: visitorId || null
    });
  }

  async function dashboard({ days = 30, feedback = [] } = {}) {
    const rangeDays = Math.min(Math.max(Math.round(Number(days) || 30), 1), 365);
    const now = new Date();
    const start = startOfUTCDay(now);
    const currentStart = new Date(start - (rangeDays - 1) * DAY_MS);
    const previousStart = new Date(currentStart.getTime() - rangeDays * DAY_MS);

    const { results } = await db.prepare(
      "SELECT kind, q, title_id, offer_index, pid, visitor_id, created_at FROM events WHERE created_at >= ? AND created_at <= ? ORDER BY id"
    ).bind(previousStart.toISOString(), now.toISOString()).all();

    // title_id -> 中文标题（用于 topTitles / recent 的展示名）。
    const titleRows = await db.prepare("SELECT id, title FROM titles").all();
    const titleNames = new Map((titleRows.results || []).map((row) => [row.id, row.title]));

    const events = [];
    (results || []).forEach((row) => {
      const at = new Date(row.created_at);
      if (Number.isNaN(at.getTime()) || at > now) return;
      events.push({
        type: row.kind,
        at: row.created_at,
        query: row.q || "",
        total: row.kind === "search" ? Number(row.offer_index) || 0 : 0,
        titleId: row.title_id || "",
        title: (row.title_id && titleNames.get(row.title_id)) || row.title_id || "",
        providerId: row.pid || "",
        provider: (providers[row.pid] || {}).name || row.pid || "",
        visitorId: row.visitor_id || null
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
    current.forEach((event) => {
      const bucket = buckets.get(dayKey(new Date(event.at)));
      if (bucket) addToBucket(bucket, event);
    });

    const currentSummary = summarize(current);
    const previousSummary = summarize(previous);

    const searchMap = new Map();
    const zeroMap = new Map();
    const titleMap = new Map();
    const platformMap = new Map();
    const visitorMap = new Map();

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

      if (event.visitorId) {
        const entry = visitorMap.get(event.visitorId) || {
          id: event.visitorId,
          searches: 0,
          views: 0,
          clicks: 0,
          lastAt: event.at
        };
        if (event.type === "search") entry.searches += 1;
        if (event.type === "view") entry.views += 1;
        if (event.type === "click") entry.clicks += 1;
        entry.lastAt = event.at;
        visitorMap.set(event.visitorId, entry);
      }
    });

    const trend = [...buckets.values()].map((bucket) => ({
      date: bucket.date,
      searches: bucket.searches,
      views: bucket.views,
      clicks: bucket.clicks,
      visitors: bucket.visitors.size
    }));

    const recent = current
      .slice()
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 14)
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
      visitors: [...visitorMap.values()]
        .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
        .slice(0, 10)
        .map((entry) => ({
          id: entry.id,
          label: `访客 ${String(entry.id).slice(0, 8)}`,
          searches: entry.searches,
          views: entry.views,
          clicks: entry.clicks,
          lastAt: entry.lastAt
        })),
      recent,
      feedback
    };
  }

  return { recordSearch, recordView, recordClick, dashboard };
}
