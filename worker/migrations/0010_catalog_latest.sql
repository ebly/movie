-- 0010_catalog_latest.sql — 片库影片是否进入首页「大家都在搜」最前面（最新）。
-- 1 = 勾选，排在「大家都在搜」chips 最前面，可无限添加；0 = 不勾选。
ALTER TABLE catalog ADD COLUMN latest INTEGER NOT NULL DEFAULT 0;