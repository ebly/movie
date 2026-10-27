"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const BRAND = require("../config/brand.json");

const MAX_EVENTS = 200_000;
const EVENT_TYPES = new Set(["search", "view", "click"]);

function pad(value) {
  return String(value).padStart(2, "0");
}

function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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

/**
 * Append-only anonymous analytics store. Records only query terms, titles,
 * providers and a random visitor cookie. IP addresses and user agents are never stored.
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

  recordSearch({ query, type, total, tookMs, visitorId }) {
    return this.add({
      type: "search",
      query: String(query || "").slice(0, 80),
      resultType: String(type || "全部"),
      total: Number(total) || 0,
      tookMs: Number(tookMs) || 0,
      visitorId: visitorId || null
    });
  }

  recordView({ titleId, title, visitorId }) {
    return this.add({
      type: "view",
      titleId: String(titleId || ""),
      title: String(title || "").slice(0, 120),
      visitorId: visitorId || null
    });
  }

  recordClick({ titleId, title, providerId, provider, visitorId }) {
    return this.add({
      type: "click",
      titleId: String(titleId || ""),
      title: String(title || "").slice(0, 120),
      providerId: String(providerId || ""),
      provider: String(provider || "").slice(0, 60),
      visitorId: visitorId || null
    });
  }

  dashboard({ days = 30, feedback = [] } = {}) {
    const rangeDays = Math.min(Math.max(Math.round(Number(days) || 30), 1), 365);
    const now = new Date();
    const start = startOfDay(now);
    const currentStart = new Date(start);
    currentStart.setDate(start.getDate() - (rangeDays - 1));
    const previousStart = new Date(currentStart);
    previousStart.setDate(currentStart.getDate() - rangeDays);

    const current = [];
    const previous = [];
    this.events.forEach((event) => {
      const at = new Date(event.at);
      if (Number.isNaN(at.getTime()) || at > now) return;
      if (at >= currentStart) current.push(event);
      else if (at >= previousStart && at < currentStart) previous.push(event);
    });

    const buckets = new Map();
    for (let index = 0; index < rangeDays; index += 1) {
      const date = new Date(currentStart);
      date.setDate(currentStart.getDate() + index);
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

    const visitorList = [...visitorMap.values()]
      .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
      .slice(0, 10)
      .map((entry) => ({
        id: entry.id,
        label: `访客 ${String(entry.id).slice(0, 8)}`,
        searches: entry.searches,
        views: entry.views,
        clicks: entry.clicks,
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
      visitors: visitorList,
      recent,
      feedback
    };
  }
}

module.exports = { AnalyticsStore };
