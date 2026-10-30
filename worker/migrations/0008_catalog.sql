-- 0008_catalog.sql — 我自己的资源（片库），由后台维护，存 D1。
-- 与 titles.json（只读快照，驱动 /title 正版渠道详情页）相互独立：
-- 这张表只服务「首页优先展示」与「搜索页把自有资源置顶」。
CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  year INTEGER,
  kind TEXT,          -- 电影 / 剧集
  rating REAL,
  pan TEXT NOT NULL,  -- quark / baidu / aliyun / xunlei
  link TEXT NOT NULL, -- 网盘分享链接
  password TEXT,      -- 提取码
  note TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalog_title ON catalog(title);