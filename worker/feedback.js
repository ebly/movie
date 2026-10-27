// feedback.js — 反馈存储（D1 feedback 表）、内存限流器与文本清理，契约对齐 server/feedback.js。
// 注意：ip / ua 列保留为空字符串（Node 版同样不记录）；限流是 isolate 内存级近似，见 createRateLimiter 注释。

export function createFeedbackStore({ db }) {
  /** 写入一条反馈，返回与 Node 版一致的结构 { id, createdAt, message, contact }（id 为 D1 自增整数而非 UUID）。 */
  async function add({ message, contact = "" }) {
    const createdAt = new Date().toISOString();
    const result = await db.prepare(
      "INSERT INTO feedback (message, contact, created_at) VALUES (?, ?, ?)"
    ).bind(message, contact, createdAt).run();
    const id = result && result.meta ? result.meta.last_row_id : null;
    return { id, createdAt, message, contact };
  }

  /** 全部反馈，最新在前（created_at 降序，同一时刻按 id 降序，等价于 Node 版的文件行序）。 */
  async function readEntries() {
    const { results } = await db.prepare(
      "SELECT id, created_at AS createdAt, message, contact FROM feedback ORDER BY created_at DESC, id DESC"
    ).all();
    return results || [];
  }

  async function recent(limit = 6) {
    const entries = await readEntries();
    return entries.slice(0, Math.max(1, Math.min(Number(limit) || 6, 50)));
  }

  /** Search and paginate the inbox, newest first. 响应结构 {total, matched, limit, offset, stats:{total,week,contact}, items}。 */
  async function list({ q = "", limit = 20, offset = 0 } = {}) {
    const entries = await readEntries();
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

  return { add, recent, list };
}

/**
 * 滑动窗口限流器。Workers 里 Map 只存在于单个 isolate 内存中：
 * 同一实例内精确计数，跨实例/实例回收后重置，属于「近似限流」（与任务约定一致）。
 */
export function createRateLimiter({ windowMs = 60_000, max = 5 } = {}) {
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

export function cleanText(value, maxLength) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}
