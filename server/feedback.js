"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** Tiny append-only JSONL store. Replace with Postgres in production. */
class FeedbackStore {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  async add({ message, contact = "" }) {
    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      message,
      contact
    };
    await fs.promises.appendFile(this.file, JSON.stringify(entry) + "\n", "utf8");
    return entry;
  }

  async readEntries() {
    try {
      const lines = (await fs.promises.readFile(this.file, "utf8")).split("\n").filter(Boolean);
      const entries = [];
      lines.forEach((line, index) => {
        try {
          const entry = JSON.parse(line);
          if (entry && typeof entry.message === "string") entries.push({ ...entry, __index: index });
        } catch (err) {
          // Skip malformed lines instead of failing the whole inbox.
        }
      });
      entries.sort((a, b) => {
        const left = Date.parse(a.createdAt) || 0;
        const right = Date.parse(b.createdAt) || 0;
        return right - left || b.__index - a.__index;
      });
      return entries.map(({ __index, ...entry }) => entry);
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }

  async recent(limit = 6) {
    const entries = await this.readEntries();
    return entries.slice(0, Math.max(1, Math.min(Number(limit) || 6, 50)));
  }

  /** Search and paginate the inbox, newest first. */
  async list({ q = "", limit = 20, offset = 0 } = {}) {
    const entries = await this.readEntries();
    const term = String(q || "").trim().toLowerCase();
    const matchedEntries = term
      ? entries.filter((entry) => {
        const haystack = `${entry.message || ""} ${entry.contact || ""}`.toLowerCase();
        return haystack.includes(term);
      })
      : entries;

    const pageSize = Math.min(Math.max(Math.round(Number(limit) || 20), 1), 100);
    const total = entries.length;
    const matched = matchedEntries.length;
    const maxOffset = Math.max(matched - 1, 0);
    const start = Math.min(Math.max(Math.round(Number(offset) || 0), 0), maxOffset);
    const items = matchedEntries.slice(start, start + pageSize);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const week = entries.filter((entry) => {
      const at = Date.parse(entry.createdAt);
      return Number.isFinite(at) && at >= weekAgo;
    }).length;
    const contact = entries.filter((entry) => String(entry.contact || "").trim()).length;

    return {
      total,
      matched,
      limit: pageSize,
      offset: start,
      stats: { total, week, contact },
      items
    };
  }
}

function createRateLimiter({ windowMs = 60_000, max = 5 } = {}) {
  const hits = new Map();

  function prune(now) {
    if (hits.size < 2000) return;
    for (const [key, stamps] of hits) {
      if (!stamps.some((stamp) => now - stamp < windowMs)) hits.delete(key);
    }
  }

  return function allow(key) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((stamp) => now - stamp < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    prune(now);
    return true;
  };
}

function cleanText(value, maxLength) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

module.exports = { FeedbackStore, createRateLimiter, cleanText };
