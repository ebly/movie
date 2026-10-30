-- 0011_catalog_poster.sql — 片库影片海报（图片 URL，可选）。
-- 为空时前端用渐变色占位；填了则在首页最热卡片显示海报。
ALTER TABLE catalog ADD COLUMN poster TEXT;