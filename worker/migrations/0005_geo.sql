-- 0005_geo.sql — events 增加地区两列（国家码 + 城市名）。
--
-- 来源是 Cloudflare 边缘 GeoIP 已经解析好的 request.cf.country / request.cf.city
-- （经 Cloudflare 回源的 Node 部署只有 cf-ipcountry 头，城市留空）。
-- 真实 IP 不落库，这两列只是粗粒度地区，用于后台看板的「访问地区」分布。
--
-- 顺序要求：先跑迁移，再部署代码。反了的话 INSERT 会因为列不存在而失败，埋点整条链路静默报错。
ALTER TABLE events ADD COLUMN country TEXT;
ALTER TABLE events ADD COLUMN city TEXT;
