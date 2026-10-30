-- 0006_ip.sql — events 增加来源 IP 列。
--
-- 值来自 request.headers["cf-connecting-ip"]（Node 部署用 x-forwarded-for / socket 对端地址），
-- 由 shared/geo.js 的 cleanIp() 校验后写入，非法值落 NULL。
--
-- 用途：在本地后台认出「同一个来源在反复打点」，配合是否执行过页面脚本判定采集脚本。
-- 这一列只走 /api/admin/* 管理端接口（需登录），不出现在任何公开响应里。
--
-- 顺序要求：先跑迁移，再部署代码。反了的话 INSERT 会因为列不存在而失败，埋点整条链路静默报错。
ALTER TABLE events ADD COLUMN ip TEXT;
