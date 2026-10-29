-- 0003_drop_catalog.sql — 目录数据改由部署时打包的 titles.json 提供（只读快照），
-- D1 不再存影片数据，只保留 feedback / events / meta（统计与反馈）。
-- 应用方式：npm run db:migrate:remote
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS titles;
