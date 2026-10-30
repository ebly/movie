-- 0007_asn.sql — events 增加来源网络两列（ASN + 组织名）。
--
-- 值来自 Cloudflare 边缘的 request.cf.asn / request.cf.asOrganization，
-- 由 shared/geo.js 的 cleanAsn() / cleanAsOrg() 清洗后写入，非法值落 NULL。
-- 用途：识别机房 / 代理来源（shared/asn.js），把它们从「真实访客」里剔除——
-- 无头浏览器也会执行页面脚本，光看页面信标分不出人。
--
-- 判定只影响看板口径与展示，事件本身照常入库：名单改了随时能重算，不需要补采。
-- 这两列同样只走 /api/admin/* 管理端接口（需登录），不出现在任何公开响应里。
--
-- 顺序要求：先跑迁移，再部署代码。反了的话 INSERT 会因为列不存在而失败，埋点整条链路静默报错。
ALTER TABLE events ADD COLUMN asn INTEGER;
ALTER TABLE events ADD COLUMN as_org TEXT;
