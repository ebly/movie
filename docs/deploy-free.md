# 免费上线：Cloudflare Workers + D1 检查清单

目标：不花一分钱把映途发到公网，并且在免费额度内跑得住。

## 0. 先确认三件事

| 事项 | 说明 |
| --- | --- |
| Cloudflare 账号 | 免费计划即可，不需要绑卡也能用 Workers / D1 / 静态资源 |
| 域名（可选） | `*.workers.dev` 在国内多数网络不可直连；想让国内用户访问，建议绑定自己的域名并托管在 Cloudflare |
| Node >= 20 | wrangler 4 的要求；`npm start` 本地服务只需 18.16 |

## 0.5 先跑一次自检

```bash
npm run preflight
```

脚本逐项检查：Node 版本、`database_id` 是否还是占位符、`run_worker_first` 是否被改回 `true`、`index.html` 是否有绝对路径、`seed.sql` 是否生成、wrangler 是否登录，并提醒两个必设的密钥。**有 ❌ 就别急着 deploy。**

再跑一次生产代码预演（不需要账号，不需要 workerd）：

```bash
npm run smoke:worker
```

它用 `wrangler deploy --dry-run` 打出真实部署包，再用 `node:sqlite` 模拟 D1 跑 33 项断言——公开 API、页面外壳、`/go` 跳转、后台登录与增删改、看板、反馈、鉴权边界。**这一步能提前发现 90% 的 deploy 后才发现的问题。**

> 本机若 `wrangler dev` 报 `write EOF` 或 `STATUS_DLL_NOT_FOUND`，是系统缺 VC++ 运行库（`api-ms-win-crt-*`、`vcruntime140.dll`）导致 `workerd.exe` 起不来。装一次 [VC++ 2015-2022 Redistributable (x64)](https://aka.ms/vs/17/release/vc_redist.x64.exe) 即可；不装也不影响 deploy 与 `smoke:worker`（它们不经过 workerd），只影响 `wrangler dev` 和 `d1 --local`。

当前仓库状态（2026-10-27 实测）：Node、白名单、SEO 占位、绝对路径、seed.sql、生产包预演全部 ✅；阻塞项是「database_id 占位」和「wrangler 未登录」。

## 1. 一次性上线命令

```powershell
cd E:\workspacedemo\movie
npm install                                  # 装 wrangler
npx wrangler login                           # 浏览器里点授权，只有你能做这一步

npx wrangler d1 create yingtu-db             # 记下输出里的 database_id
# 把 wrangler.toml 里的占位 database_id 换成真实值，否则 deploy 会直接报错

npm run db:migrate:remote                    # 远程建表（0001 建表 + 0002 poster 列）
node scripts/seed-d1.mjs                     # 生成 worker/seed.sql
npx wrangler d1 execute yingtu-db --remote --file=worker/seed.sql   # 灌 16 部演示数据

npx wrangler secret put ADMIN_PASSWORD       # 后台密码：必须改，默认值是公开的
npx wrangler secret put ADMIN_SECRET         # 会话签名密钥：32 位以上随机串
npx wrangler secret put TMDB_API_KEY         # 可选：后台 TMDB 导入用

npm run deploy                               # 输出 https://yingtu.<你的子域>.workers.dev
```

生成随机密钥：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 2. 免费额度（决定你能撑多少量）

| 资源 | 免费额度 | 本项目的用量特征 |
| --- | --- | --- |
| Workers 请求 | 10 万次/天 | 只有页面外壳、`/api/*`、`/go/*`、`/admin/*` 进 Worker |
| Workers CPU | 10 毫秒/次 | 在 16 部片库下远低于上限；片库涨到几千部时要重新评估打分耗时 |
| 静态资源请求 | 不限、不计费 | CSS/JS/图片/字体由静态层直出，不消耗 Worker 请求 |
| D1 存储 | 5 GB | 片库 + 埋点事件，正常站点很难打满 |
| D1 读取 | 500 万行/天 | 已加 20 秒目录缓存，单次请求不再扫全表 |
| D1 写入 | 10 万行/天 | 每次搜索/浏览/跳转写 1 行，等于每天 10 万次行为的上限 |

具体数字以控制台 Workers & Pages → 用量 页面当天显示为准，Cloudflare 会调整。

### 为什么配额够用（本轮做的三件事）

1. `wrangler.toml` 的 `run_worker_first` 改成**路由白名单**，不再让 CSS/JS 也走 Worker；
2. Worker 内加了 20 秒目录缓存，每个请求不再执行两条全表查询；后台写入后主动失效，编辑仍然即时生效；
3. 埋点写入改用 `waitUntil`，响应先返回、统计后落库，少一次 D1 写延迟。

## 2.5 部署前最后一次确认

```bash
npm run preflight     # 应该全绿
npm run deploy        # 输出 https://yingtu.<子域>.workers.dev
```

若 `deploy` 报 Worker 名称冲突，说明账号里已有同名 Worker：改 `wrangler.toml` 的 `name`，或确认覆盖。

## 3. 上线后自检（5 分钟）

```powershell
$base = "https://你的域名"
curl.exe -I "$base/"                       # 200 + text/html
curl.exe "$base/title/hotd" | Select-String "<title>|canonical|ld+json"
curl.exe "$base/sitemap.xml"               # 应包含全部作品
curl.exe "$base/robots.txt"                # 应有 Sitemap 行且 Disallow /admin/
curl.exe -X POST "$base/api/admin/login" -H "Content-Type: application/json" -d '{\"password\":\"你的密码\"}'
```

- 浏览器打开 `/admin/`，用新密码能登录，新增一部作品后前台立刻能搜到。
- 打开浏览器控制台，确认没有 CSP 报错、没有 404 的静态资源。
- 移动端（390px）看一遍首页、详情、片单，确认没有横向滚动。

## 4. 域名与国内访问

- `*.workers.dev` 在国内通常被 DNS 污染/阻断，**国内用户基本打不开**；绑自有域名（Cloudflare 代理开启）后可访问，但免费版没有中国大陆节点，实测延迟大约 150–300ms。
- 绑定方式：Cloudflare → Workers & Pages → 你的 Worker → Settings → Domains & Routes → Add custom domain。
- 站内用了 Google Fonts，国内不可达时不会阻塞首屏（已改成 `media="print"` + 脚本启用），但会一直用系统字体。想要统一观感，建议自托管 woff2 子集。
- 若要认真做国内访问，最终还是要备案 + 国内 CDN 或换境内主机，这已经超出"免费"范围。

## 5. 安全与运维

- **必须**设置 `ADMIN_PASSWORD`。不设置时用的是 `config/brand.json` 里的演示密码 `yingtu-admin`，等于后台对全网开放。
- 后台是单密码、无账号体系、无限流跨实例共享；公网长期运营前建议加 Cloudflare Access（免费版可绑邮箱白名单）。
- 限流是 isolate 内存级，多个实例会各自计数，只防君子。
- 日志：`wrangler.toml` 已开 `[observability]`，可在控制台看请求与异常；也可 `npx wrangler tail` 实时看。
- 埋点表会一直增长：需要时用
  ```powershell
  npx wrangler d1 execute yingtu-db --remote --command "DELETE FROM events WHERE created_at < date('now','-90 day');"
  ```
  清理 90 天前的事件（先在小库上确认字段名）。

## 6. 备份与回滚

```powershell
npx wrangler d1 export yingtu-db --remote --output backup-2026-10-27.sql   # 备份片库
npx wrangler deployments list                                              # 查看历史版本
npx wrangler rollback                                                      # 回滚到上一版本
```

`data/titles.json`（本地 Node 版）与 D1 是两套数据，改哪边就用哪边的备份，别混用。

## 7. 常见报错对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Couldn't find a D1 DB with the name or binding 'DB'` | `database_id` 还是全 0 占位 | 换成 `wrangler d1 create` 输出的真实 ID |
| 后台保存报 `no such column: poster` | 只跑了 0001 迁移 | `npm run db:migrate:remote` |
| 前台首页空白、控制台 404 `styles.css` | 静态资源路径被当成相对路径 | 已修为 `/styles.css`，若再出现检查 HTML 壳 |
| 打开 `/title/xxx` 是裸页面、没有 title | 该路由没进 `run_worker_first` 白名单 | 在 `wrangler.toml` 补路由后重新 deploy |
| 后台登录一直 401 | `ADMIN_PASSWORD` 没设或设错 | `wrangler secret put ADMIN_PASSWORD` 后重试 |
| 中文标题搜不到 | 片库没灌数据 | 重跑 `db:seed` 的第 3 步 |
| 部署报 Worker 体积超限 | 免费版单文件上限 3 MiB（压缩后） | 当前打包 gzip 约 50 KiB，正常不会触发 |
| 5xx 且日志里有 D1 报错 | 免费版并发被限流 | 降低请求频率；必要时加一层 Cache API |
