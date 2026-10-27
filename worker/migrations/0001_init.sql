-- 0001_init.sql — D1 初始建表脚本：作品、观看渠道、反馈、行为事件与键值元数据。
-- 语义与 Node 版 server/ 下的 JSON/ndjson 存储对齐；时间统一为 ISO 8601 (UTC) 字符串。

CREATE TABLE IF NOT EXISTS titles (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  original   TEXT NOT NULL,
  year       INTEGER NOT NULL,
  type       TEXT NOT NULL,
  rating     REAL NOT NULL DEFAULT 0,
  seasons    INTEGER,
  runtime    TEXT,
  genres     TEXT NOT NULL DEFAULT '[]',          -- JSON 数组
  synopsis   TEXT NOT NULL DEFAULT '',
  aliases    TEXT NOT NULL DEFAULT '[]',          -- JSON 数组
  tags       TEXT NOT NULL DEFAULT '[]',          -- JSON 数组
  hot        INTEGER NOT NULL DEFAULT 0,          -- 0/1
  art        TEXT NOT NULL DEFAULT '{}',          -- JSON 对象
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,            -- 同一作品内的渠道顺序（对齐 Node 版数组下标）
  pid      TEXT NOT NULL,
  tier     TEXT NOT NULL,
  season   TEXT,
  quality  TEXT NOT NULL DEFAULT '[]',            -- JSON 数组
  price    TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0             -- 0/1
);

CREATE INDEX IF NOT EXISTS idx_offers_title ON offers(title_id, position);

CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message    TEXT NOT NULL,
  contact    TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',            -- 预留字段，当前实现与 Node 版一致：不写入
  ua         TEXT NOT NULL DEFAULT '',            -- 预留字段，当前实现与 Node 版一致：不写入
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('search', 'view', 'click')),
  q           TEXT NOT NULL DEFAULT '',           -- search: 查询词；view/click: 空
  title_id    TEXT,                               -- view/click: 作品编号
  offer_index INTEGER,                            -- click: 渠道下标；search: 借用为「结果总数」(0 = 无结果)，见 worker/analytics.js 注释
  pid         TEXT,                               -- click: 平台 id
  visitor_id  TEXT,                               -- 匿名访客 cookie id（yt_vid），不记录 IP/UA
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
