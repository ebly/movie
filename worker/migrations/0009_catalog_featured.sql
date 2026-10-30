-- 0009_catalog_featured.sql — 片库影片是否进入首页「最热」推荐位。
-- 1 = 勾选，出现在首页最热顶部；0 = 不勾选，不出现在最热（仍可用于搜索置顶与分享页）。
ALTER TABLE catalog ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;