-- 0004_event_kinds.sql — events.kind 增加 pan_search（网盘搜索）与 page（页面访问）。
-- SQLite 不能直接改 CHECK 约束，按官方建议重建表并拷贝旧数据。
CREATE TABLE IF NOT EXISTS events_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('search', 'view', 'click', 'pan_search', 'page')),
  q           TEXT NOT NULL DEFAULT '',           -- search/pan_search: 查询词；page: 页面路径
  title_id    TEXT,                               -- view/click: 作品编号
  offer_index INTEGER,                            -- click: 渠道下标；search/pan_search: 结果总数（0 = 无结果）
  pid         TEXT,                               -- click: 平台 id；pan_search: 网盘类型；page: 界面语言
  visitor_id  TEXT,                               -- 匿名访客 cookie id（yt_vid），不记录 IP/UA
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO events_new (id, kind, q, title_id, offer_index, pid, visitor_id, created_at)
  SELECT id, kind, q, title_id, offer_index, pid, visitor_id, created_at FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
