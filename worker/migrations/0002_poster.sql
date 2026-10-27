-- 0002_poster.sql — 给 titles 增加海报图片地址列。
-- poster 存的是外部 https 图片直链（由后台填写），NULL 表示没有海报，前台回退到程序化海报。
-- Node 版 server/ 用 data/titles.json，无需迁移；本文件只服务于 D1。

ALTER TABLE titles ADD COLUMN poster TEXT;
