# 映途

影视作品索引、平台观看渠道与网盘公开分享搜索（夸克 / 百度 / 迅雷 / 阿里）。前台通过独立 PanSou 服务检索已接入来源中的分享链接，支持他人公开分享，但不承诺各网盘全量覆盖，不读取私有文件、不存储影片。Node 与 Cloudflare Worker 共用同一套搜索适配。

本地片库是**演示数据**：16 部作品、12 个平台。评分、价格、可看状态和平台播放地址均为模拟值。PanSou 结果为外部来源返回的信息，不保证有效、完整或已获授权。

参考站拆解、设计令牌、合规边界和生产化路线见 [docs/showpaw-拆解与复刻方案.md](docs/showpaw-拆解与复刻方案.md)。

## 快速开始

环境要求：Node.js >= 18.16。本地 Node 服务零第三方依赖，可直接运行；若要使用 Workers 后端 / wrangler 工具链，先执行一次 `npm install`。

```bash
cd D:/workspace/movie
npm start
```

- 前台：http://127.0.0.1:4173
- 后台：**不在前台进程里**。另开一个终端启动后台：

```bash
cd D:/workspace/movie/admin
npm start
```

后台在 http://127.0.0.1:4174 ，默认密码 `yingtu-admin`（用 `ADMIN_PASSWORD` 覆盖）。后台只读前台写下的行为与反馈日志，刷新看板即可看到最新数据，不用重启。

开发时可以用自动重启：

```bash
npm run dev
```

运行测试：

```bash
npm test              # Node 服务与 shared/ 的单元测试
npm run smoke:worker  # 打真实部署包并在 Node 里跑 worker 的 fetch 入口（含 D1 全流程）
```

`smoke:worker` 先用 `wrangler deploy --dry-run` 打包，再用 `node:sqlite` 模拟 D1、用文件系统模拟 `ASSETS`，把生产 bundle 当普通模块跑一遍：公开 API、页面外壳、`/go` 跳转、后台登录与增删改、看板、反馈、鉴权边界共 33 项断言。它不依赖 Cloudflare 账号，也不需要 `workerd`——本机缺 VC++ 运行库时 `wrangler dev` 起不来，这个脚本是唯一能在本地跑通生产代码路径的方式。需要 Node 22+（`node:sqlite`）。

换端口或允许局域网访问：

```bash
PORT=4174 HOST=0.0.0.0 npm start
```

不要直接双击 `client/index.html`。页面需要同源 API，直接以 `file://` 打开时会显示“服务端还没有启动”的提示。

## Cloudflare Workers + D1（生产后端）

生产目标栈：前端 HTML/CSS/JS（ Workers 静态资源托管）+ 后端 Cloudflare Workers + 数据库 Cloudflare D1。`worker/` 是 `server/` 的忠实移植，API 路径、响应结构、状态码、安全头与鉴权语义完全对齐，前台/后台页面不需要任何改动即可切换。

工具链要求 **Node >= 20**（wrangler 4；wrangler 3 的 beta 静态资源在本地不解析子目录页面，已弃用）。当前 shell 若是 Node 18，用 `nvm use 22`（或 Volta）切换后再执行下面的命令；`npm start` / `npm test` 仍然只需要 Node 18.16。

```powershell
npm install                # 安装 wrangler 4（仅 Workers 工具链需要）
npm run db:migrate         # 本地 D1 建表（worker/migrations/ 下 0001-0007，含事件的地区、来源 IP 与来源网络列）
npm run db:seed            # 生成 worker/seed.sql 并导入 16 部演示作品
npm run dev:worker         # http://localhost:8787，Worker + 静态资源 + 本地 D1
```

本地 D1 数据保存在 `.wrangler/state/`，与 Node 版的 `data/` 目录互不影响。

已经建过表的库（本地或远程）在升级后需要重跑一次 `npm run db:migrate` / `db:migrate:remote`：`0002_poster.sql` 会给 `titles` 补上 `poster` 列，缺这一列时后台保存作品会失败。

上线前先跑 `npm run preflight`（检查 database_id、白名单、资源路径、登录状态与密钥），完整清单见 **[docs/deploy-free.md](docs/deploy-free.md)**。下面是精简版（需要你自己的 Cloudflare 账号）：

```powershell
npx wrangler login                                  # 浏览器授权，由你本人操作
npx wrangler d1 create yingtu-db                    # 输出真实 database_id
# 把 wrangler.toml 里的占位 database_id 换成真实值
npm run db:migrate:remote                           # 远程建表
node scripts/seed-d1.mjs                            # 生成 worker/seed.sql
npx wrangler d1 execute yingtu-db --remote --file=worker/seed.sql   # 远程灌数据
npx wrangler secret put ADMIN_PASSWORD              # 后台密码
npx wrangler secret put ADMIN_SECRET                # 会话签名密钥（随机长字符串）
npm run deploy                                      # 发布，输出 *.workers.dev 地址
```

Workers 版与 Node 版的行为差异（都已在冒烟测试中确认）：

- 会话令牌改为 HMAC-SHA256 签名的无状态 Cookie（`ADMIN_SECRET` 缺失时由密码派生）；登出只清 Cookie，服务端无法单独吊销某个未过期令牌。
- 管理端写入用 `db.batch` 事务；本地 miniflare 的 batch 有缺陷时自动降级为逐条执行（仅影响本地演示的原子性）。
- `run_worker_first` 是路由白名单而不是 `true`：只有页面外壳、`/api/*`、`/go/*` 进 Worker，静态资源由静态层直出，不消耗 10 万次/天的免费请求额度。新增前台页面路由要同步这个列表。
- 目录在一次 isolate 内缓存 20 秒，避免每个请求两条全表扫描；后台写入后立即失效，编辑仍然即时可见。
- 埋点写入走 `waitUntil`，不占用响应时间。
- 统计写入 `events` 表：匿名访客用 `visitor_id` 列（同样来自 `yt_vid` Cookie，不存 UA）；`kind` 支持 `pan_search`（网盘搜索，`pid` 记网盘类型、`offer_index` 记结果总数）、`page`（页面访问，`q` 记 `/`、`/search`、`/list`、`/title`，`pid` 记 zh/en）、`search`（旧版站内搜索）、`view`、`click`；标题/平台名查询时关联还原；按日分桶使用北京时间（UTC+8，`shared/stats-time.js`，与 Node 版共用一份口径）；`country`/`city` 取自 Cloudflare 边缘 GeoIP（`request.cf`，Node 侧只有 `cf-ipcountry` 头，故只到国家），`ip` 存访客的真实来源地址（`cf-connecting-ip`，Node 侧走 `clientKey()`），`asn`/`as_org` 存该地址所属网络（`request.cf.asn` / `asOrganization`），四者都只从 `/api/admin/*` 输出。「真实访客」= 打过页面信标、且所属网络不是机房/代理（判据在 `shared/asn.js`）的匿名编号；无头浏览器会执行页面脚本，所以光看信标不足以证明是人。
- 反馈/登录限流是 isolate 内存级近似，跨实例与冷启动会重置——与 Node 的“单进程内存”同级，都不是分布式限流。
- 后台会话默认 12 小时；密码默认值、演示数据与免责声明与 Node 版相同。

## 网盘公开分享搜索（PanSou）

站内搜索只有一个入口：`/search?source=quark&q=关键词&type=类型`。首页搜索框、顶部搜索框、作品详情页的「搜索夸克公开分享」都走这里；不再提供豆瓣/TMDB 元数据聚合搜索。结果页顶部有类型 tabs：**夸克 / 百度 / 迅雷 / 阿里**，各自独立查询、独立分页。资源卡提供来源、来源时间、分享链接、提取码、复制；不会伪造影片评分或把分享标为已验证。每页 30 条。

**支持的类型**（`type` 参数）：`quark`（默认）、`baidu`、`xunlei`、`aliyun`。每个类型只放行对应域名与分享路径，其余一律丢弃：

| type | 域名 | 路径 |
| --- | --- | --- |
| `quark` | `pan.quark.cn` | `/s/<id>` |
| `baidu` | `pan.baidu.com` | `/s/<id>` |
| `xunlei` | `pan.xunlei.com` | `/s/<id>` |
| `aliyun` | `alipan.com`、`aliyundrive.com` | `/s/<id>` |

**覆盖范围**：默认 `src=all`，使用 PanSou 服务已启用的插件与配置的频道，每次只向 PanSou 请求一种 `cloud_types`。可搜到这些来源收录的他人公开分享，但不能承诺对应网盘的全量覆盖。不会登录用户账户，也不读取私有文件。当前没有可靠的影视分类标记，所以按关键词返回资源，不声称每条都是影视。

**运行结构**：浏览器 → movie 同源 `/api/pan/search`（`/api/quark/search` 为兼容别名）→ 独立 Go PanSou `/api/search`。Node 与 Worker 共用 `shared/pansou.js`，Worker 的此接口不依赖 D1。Go 服务不能塞进 Worker，线上须另行部署为可访问的 HTTPS 服务。

### 本地启动

1. 本地 `pansou-main/go.mod` 要求 Go **1.25.0+**。先安装相应 Go，或准备已编译的 PanSou 可执行文件；脚本不会自动安装工具。`pansou-main/` 已被 `.gitignore` 排除，换机器需另外准备源码。
2. 在 `D:/workspace/movie` 终端启动 PanSou：

```powershell
npm run pansou:check       # 列出从 main.go 实际导入的插件，不启动服务
npm run pansou:start       # 默认端口 8888，运行本地 pansou-main 源码
```

启动器默认启用 `main.go` 中全部有效空导入插件，忽略注释掉的导入；不是使用镜像中不确定的插件版本。可设置 `ENABLED_PLUGINS` 为逗号分隔列表来缩小范围。某些插件需要额外配置或其来源不可达，启用不保证成功。Go 不在 PATH 时设置 `GO_BIN` 完整路径；使用现成程序则设置 `PANSOU_EXECUTABLE` 完整路径；源码位置可用 `PANSOU_DIR` 覆盖。PanSou 端口用 `PANSOU_PORT`，避免与 movie 的 `PORT` 混淆。

**注意**：上游源码默认监听所有网卡，请用防火墙限制本机访问；对外部署必须配置认证与 HTTPS，不要裸露搜索服务。项目已有 `pansou-main/docker-compose.yml` 也可使用，但它默认拉取远程镜像，不一定等同当前本地源码。

3. 另开一个终端启动 movie：

```powershell
$env:PANSOU_URL = "http://127.0.0.1:8888"
npm start
```

访问 `http://127.0.0.1:4173/search?source=quark`，结果页顶部切换网盘类型。没有配置地址会明确提示未配置；服务未启动会提示无法连接，不会假装搜索成功或用演示结果冒充。

### 服务端配置（Node 环境变量 / Worker bindings）

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `PANSOU_URL` | 空，未启用 | 服务根地址，如 `http://127.0.0.1:8888`，不要带 `/api/search`；远程必须 HTTPS |
| `PANSOU_SRC` | `all` | `all` / `plugin` / `tg` |
| `PANSOU_PLUGINS` | 空 | 空表示服务端已启用的全部插件；不能启用上游未加载的插件 |
| `PANSOU_TIMEOUT_MS` | `20000` | 单次上游 HTTP 请求超时，最高 60000 ms |
| `PANSOU_TOKEN` | 空 | 上游启用认证时可提供 Bearer token，优先于账号密码 |
| `PANSOU_USERNAME` / `PANSOU_PASSWORD` | 空 | 可替代 token；自动登录并缓存 JWT，过期刷新，401/403 最多重新登录一次 |

Worker 需使用可达的远程地址，不能填开发机 `127.0.0.1`。敏感配置使用 Worker secret，不写前端或提交版本库。Node 默认不自动加载 `.env`，请在启动终端设置环境变量。

### 接口与限制

`GET /api/pan/search?q=关键词&type=quark&offset=0&limit=30&reload=1`。`q` 必填、最多 120 字符；`type` 为 `quark`/`baidu`/`xunlei`/`aliyun`，默认 `quark`；`limit` 为 1–100；`offset` 非负整数；`reload` 可选。

- 当前源码的 `{code:0,data:{merged_by_type:{quark:[]}}}` 与旧版未包裹响应均可处理。
- 服务端按类型校验域名与分享路径，统一重建成 `https://<域名>/s/<id>`，`?pwd=` 并入提取码，按分享 ID 去重并合并来源；http 写法会被纠正为 https。
- 本站有 30 秒短缓存（按 `类型:关键词` 分键）、相同请求合并、最多 4 个不同关键词并发、50 个缓存项/16 MiB 缓存预算、8 MiB 上游响应上限。超限明确报错，不静默截掉结果。
- 每个客户端每分钟最多 30 次接口请求；限流与缓存为单进程/Worker isolate 内近似值，不是分布式限流。
- PanSou 可能异步补充结果，且无每次查询完成标记，因此 `complete:false` 表示**未确认完整**，不是已确定仍在执行。`total` 只统计本次归一化后的该类型结果。
- “重新获取”仅跳过本站短缓存，再次读取 PanSou 当前结果，不传 `refresh=true`，无自动轮询；翻页期间上游更新可能影响结果数量和顺序。
- 分享 URL、来源、关键词属于不可信外部数据；界面转义文本，外链限制为四类网盘的标准分享地址，令牌不下发。

测试：`npm run test:pansou`（模拟上游、Node 与 Worker bundle），另跑 `npm test` 检查原功能。通过模拟测试不代表所有真实外部插件可用。

## 管理后台（`admin/`，独立进程）

后台代码在本仓库的 [admin](admin) 目录，但仍是自己一个进程、自己一个端口（默认 `4174`），界面不挂在 `/admin/` 下。

```
D:/workspace/movie         前台  http://127.0.0.1:4173
D:/workspace/movie/admin   后台  http://127.0.0.1:4174
```

后台只读前台写下的日志，两个进程通过 `data/` 里的文件通信，没有 RPC、没有额外数据库：

- `analytics.ndjson`：前台写，后台读。看板每次请求都重新载入。
- `feedback.ndjson`：前台写，后台读。
- `titles.json`：前台片库，后台不再读写（片库管理已从后台移除）。

功能清单、接口列表、环境变量与后台鉴权说明见 [admin/README.md](admin/README.md)。

线上另有一份后台界面准备部署在 https://admin.yinto.top（Worker `yingtu-admin`）：静态文件来自 `admin/client`，`/api/*` 反代到本 Worker 的 `/api/admin/*`。目前访问控制还没就绪，整站被开关关掉、一律返回 404；部署命令与启用步骤见 [admin/README.md](admin/README.md#线上后台adminyintotop)。

本仓库的 `server/` 不含任何后台代码：`/admin`、`/admin/*`、`/api/admin/*` 在本地 Node 服务上一律 404，`client/admin/` 已删除，`robots.txt` 也不再需要屏蔽后台路径。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4173` | HTTP 端口 |
| `HOST` | `127.0.0.1` | 监听地址；局域网访问设为 `0.0.0.0` |
| `DATA_FILE` | `data/titles.json` | 可变片库文件（与后台共用同一份） |
| `ANALYTICS_FILE` | `data/analytics.ndjson` | 匿名行为事件 |
| `FEEDBACK_FILE` | `data/feedback.ndjson` | 前台反馈 |

后台项目的环境变量（`ADMIN_PASSWORD`、`ADMIN_DATA_DIR`、`FRONTEND_URL` 等）见 [admin/README.md](admin/README.md)。Workers 部署时改用 `wrangler secret put ADMIN_PASSWORD` / `ADMIN_SECRET`。

## 换品牌（改一处即可）

品牌文案的唯一来源是 [config/brand.json](config/brand.json)：

```json
{
  "name": "映途", "latin": "Yingtu", "slug": "yingtu",
  "tagline": "正版观看渠道索引", "slogan": "找到正版影视的观看去处",
  "apiName": "yingtu-api", "logPrefix": "[yingtu]",
  "cookies": { "admin": "yt_admin", "visitor": "yt_vid" },
  "defaultPassword": "yingtu-admin", "disclaimer": "…"
}
```

- Node 服务端 `require("../config/brand.json")`；Worker 端 `import BRAND from "../config/brand.json"`（esbuild 会把它打进产物），两端共用同一份，不存在第二处定义。
- 前台与管理后台不写死品牌：`/api/bootstrap` 会返回 `brand` 字段，页面标题、页脚、后台侧边栏、面包屑、海报 kicker 都从这里取。
- `name` 改字标、`slug` 改日志前缀与 Cookie 前缀、`defaultPassword` 改演示密码；Cookie 改名会让已登录会话和匿名访客 ID 失效重来。
- 仍需手工同步的只有两个静态 HTML 壳的 `<title>` / `<meta description>` / favicon：`client/index.html`、`client/admin/index.html`（它们在拿到接口前就要显示）。
- `npm test` 里的 `test/brand.test.js` 会扫描源码与文档，出现被替换掉的旧品牌标识即失败。

## 目录结构

```text
movie/
├─ client/
│  ├─ index.html          前台壳、字体、反馈弹窗
│  ├─ styles.css          前台设计系统与响应式布局
│  ├─ api.js              同源 API 客户端
│  ├─ i18n.js             中英文案表、语言切换与静态节点替换
│  ├─ app.js              前台哈希路由、渲染、筛选、主题
│  └─ robots.txt          屏蔽 /admin/
├─ admin/                 管理后台：独立进程 4174 + 线上 Worker
│  ├─ client/             后台界面（无依赖 SPA、看板与反馈收件箱）
│  ├─ server/             本地后台：鉴权、看板、反馈、远程 BFF
│  ├─ worker/             线上后台外壳：静态资源 + /api 反代
│  ├─ test/               后台鉴权、远程代理与 Worker 代理测试
│  ├─ wrangler.toml       线上后台部署配置（admin.yinto.top）
│  └─ README.md           后台功能、接口、部署与访问控制说明
├─ shared/                 Node 与 Worker 共用的纯逻辑（第 8 项：消除双端重复）
│  ├─ search.js            归一化 + 字段加权打分（含拼音）
│  ├─ pinyin.js            汉字 → 全拼/首字母、拼音匹配打分
│  ├─ pinyin-data.js       构建产物，勿手改（npm run pinyin:build）
│  ├─ meta.js              页面 title/description/OG/JSON-LD 与 sitemap
│  ├─ tmdb.js              TMDB 检索、错误码与字段映射
│  ├─ pansou.js            PanSou 客户端：类型白名单、URL 校验、缓存与分页
│  ├─ stats-time.js        统计分日口径（北京时间 UTC+8，可用 STATS_TZ_OFFSET_MINUTES 覆盖）
│  ├─ geo.js               事件来源字段清洗：国家码/城市名/来源 IP/ASN 与组织名校验、中文名映射
│  ├─ asn.js               来源网络性质判定：机房/代理 ASN 名单，以及「真实访客」的拆分口径
│  └─ douban.js            豆瓣榜单（热门/最新）抓取、归一化与 10 分钟缓存
├─ server/
│  ├─ index.js            启动入口、超时与优雅关闭
│  ├─ app.js              路由编排、页面外壳、静态托管、错误处理
│  ├─ pages.js            读取 index.html 并注入 shared/meta.js 的元信息
│  ├─ api.js              /api/* 公开接口
│  ├─ analytics.js        匿名事件存储与看板聚合
│  ├─ go.js               /go 跳转、点击归属与限流
│  ├─ repository.js       片库读写、原子落盘、回滚
│  ├─ validate.js         后台作品数据校验与归一化
│  ├─ store.js            搜索、详情、相似作品、渠道筛选
│  ├─ feedback.js         JSONL 反馈存储、限流、最近反馈
│  ├─ data/seed.js        首次启动的演示片库（16 部 / 12 平台）
│  └─ lib/
│     ├─ http.js          JSON、安全头、Cookie、请求体解析
│     └─ static.js        静态文件、ETag、路径穿越防护
├─ config/
│  └─ brand.json          品牌唯一来源：名称、标语、Cookie 名、默认密码、免责声明
├─ test/
│  ├─ api.test.js         公开 API / 安全 / 持久化测试
│  ├─ seo.test.js         页面 meta / canonical / noindex / sitemap / TMDB 映射
│  ├─ pinyin.test.js      拼音转换与拼音搜索命中
│  ├─ pansou.test.js      PanSou 客户端、限流与 Worker bundle
│  └─ brand.test.js       品牌一致性守卫（字段齐全、无旧品牌残留、双后端同源）
├─ worker/                Cloudflare Workers 版后端（对齐 server/ 契约）
│  ├─ index.js            fetch 入口：路由、安全头、静态资源、/go 跳转
│  ├─ store.js            D1 数据层：搜索/详情/筛选/CRUD（batch + 本地降级）
│  ├─ analytics.js        events 表埋点与看板聚合
│  ├─ feedback.js         反馈存储与限流
│  ├─ adminAuth.js        HMAC 无状态会话 Cookie
│  ├─ config.js           平台表、类型、画质顺序
│  └─ migrations/         D1 迁移（0001 建表 / 0002 海报地址 / 0003 移除片库 / 0004 事件类型 / 0005 地区 / 0006 来源 IP / 0007 来源网络 ASN）
├─ scripts/
│  ├─ build-pinyin.mjs    生成 shared/pinyin-data.js（离线，一次即可）
│  ├─ sync-catalog.mjs    把 titles.json 同步到打包目录并重新部署
│  └─ worker-smoke.mjs    Worker 冒烟测试（冷启动、路由、后台等）
├─ data/                  运行时生成，已加入 .gitignore
│  ├─ titles.json         可变片库（首次启动从 seed 生成）
│  ├─ analytics.ndjson    匿名搜索、浏览、跳转事件
│  └─ feedback.ndjson     前台反馈
├─ docs/
│  ├─ showpaw-拆解与复刻方案.md
│  ├─ deploy-free.md       免费上线检查清单
│  └─ anti-abuse.md        边缘反爬与滥用防护清单（Cloudflare 规则）
├─ wrangler.toml          Workers 部署配置（assets + D1 绑定）
├─ package.json
└─ .gitignore
```

## 前台页面与路由

前台使用 History API 真实路径，服务端为这些路径回退 `client/index.html` 并注入本页 meta；旧的 `#/` 链接会自动转换成新路径：

| 路由 | 页面 |
| --- | --- |
| `/` | 首页：搜索框 +「大家都在搜」热门片名 + 豆瓣最新 10 部（1 大卡 + 9 小卡）。榜单接口取不到数据时回落到 `localStorage`（键 `yingtu-douban-cache`）里上次成功的记录；缓存也没有才整块不显示，不用本地片库兜底 |
| `/search?source=quark&q=沙丘&type=baidu&page=2` | 网盘公开分享结果：类型 tabs、来源、时间、分享链接、提取码、分页 |
| `/title/hotd?q=龙之家族` | 详情：元数据、观看渠道、季/地区/方式/画质筛选、相似作品 |
| `/list?ids=hotd,severance` | 我的片单（本地收藏 + 分享片单） |
| `/go/:titleId/:offerIndex` | 记录匿名点击后 302 跳转到平台官方地址 |
| `/sitemap.xml` | 首页 + 全部作品的 sitemap |

支持的交互：

- 搜索框只查网盘公开分享：关键词必填，空词不浏览；结果按分享链接去重并合并来源，类型由结果页 tabs 切换。
- **本地收藏**：详情页与结果卡右上角的心形按钮，数据只写 `localStorage`（键名 `yingtu-favorites`，最多 200 部），不上传服务端、不需要登录。
- **片单分享**：`/list` 页可复制 `?ids=a,b,c` 形式的分享链接，对方打开后能看到「别人分享的片单」并一键加入自己的收藏。
- 结果每页 30 条，可切换夸克/百度/迅雷/阿里、翻页、跳页与手动重新获取，URL 可分享。
- 详情页 900ms 的“整理渠道”加载动效，包含请求取消和竞态保护。
- 渠道按“已验证可看 / 待确认”分组，支持仅看可看、季、地区、方式、画质筛选。
- 深浅色切换，主题写入 `localStorage`。
- 中英切换：左上角的语言按钮在中文与 English 间切换，选择写入 `localStorage`（键 `yingtu-lang`），当前页原地重渲染。界面文案来自 `client/i18n.js`；片名、简介、价格等片库数据保持原文，服务端注入的 `<title>`/`description` 与 sitemap 仍为中文。
- 反馈弹窗提交到服务端，带校验、蜜罐、限流和 JSONL 持久化。
- 移动端布局，含 390px 断点的海报与筛选重排。

## SEO 与分享

- 每部作品都有独立真实路径 `/title/:id`，服务端把本页的 `<title>`、`description`、`canonical`、Open Graph 与 JSON-LD 注入 `client/index.html` 的 `<!--SEO-->` 占位；Node 与 Worker 共用 `shared/meta.js`，输出完全一致。
- 首页注入 `WebSite` + `SearchAction`（站内搜索框）与 `Organization`；详情页注入 `Movie`/`TVSeries`（含类型、年份、评分 `AggregateRating` 与观看渠道 `Offer`）和 `BreadcrumbList` 面包屑。
- 可索引正文：首页与详情页在 `<!--SEO-BODY-->` 占位处注入真实内容（标题、简介、评分、平台、作品内链），让百度、Bing、社交预览这类不执行 JS 的爬虫也能读到内容；应用启动后由 `app.js` 接管并替换。搜索页、片单页不注入正文。
- 可索引范围：首页与详情页可收录；`/search`、`/list`、404 页返回 `noindex,follow`，把抓取预算留给详情页。未知作品同时返回 HTTP 404，不是“200 的空页面”。
- `/sitemap.xml` 由片库实时生成（首页 + 全部作品，带 `lastmod`，声明 `image:image` 命名空间，有海报时附带图片）；`/robots.txt` 动态返回并指向 sitemap，同时屏蔽 `/admin/` 与 `/list`。
- `og:image` 有海报时用 `poster`，没有时回落到 `${origin}/icon-512.png`（绝对地址）；`og:site_name`、`og:locale`、`twitter:*` 一并输出。
- `client/index.html` 里的 CSS/JS 必须用绝对路径（`/styles.css`、`/app.js`）：子路径页面用相对路径会被解析成 `/title/styles.css`。

### 生成式引擎优化（GEO）

- `/llms.txt`：站点摘要 + 关键作品链接，供支持该约定的 LLM 工具读取。
- `/robots.txt` 显式放行主流 AI 检索/引用爬虫（GPTBot、OAI-SearchBot、ChatGPT-User、ClaudeBot、PerplexityBot、Google-Extended、Bingbot、CCBot、Bytespider），仍屏蔽 `/list`。
- 可索引页输出 `max-snippet:-1, max-image-preview:large`，鼓励大段摘录与图片预览；`Organization` 仅在 `config/brand.json` 配了 `sameAs`（真实外部主页）时才输出，避免编造链接。
- 详情正文（`<!--SEO-BODY-->`）带「一句话结论」，如「《沙丘2》（2024）是电影，可在 Max、Prime Video、Apple TV+ 等平台观看。」，方便 AI 直接引用。

### 部署后主动提交给搜索引擎

```
npm run seo:init-key    # 首次：生成 IndexNow 密钥文件到 client/（随部署上线到 /<密钥>.txt）
npm run deploy          # 部署（会把密钥文件一起发布）
npm run seo:ping        # 读取线上 sitemap，把全部 URL 推给 IndexNow（Bing 等）与百度
npm run seo:check       # 只读：抓 sitemap 并列出 URL，不提交
```

- **IndexNow**：一次 POST 通知 Bing / Yandex / Seznam / Naver，密钥文件用来验证站点归属；`deploy:seo` = 部署后自动 ping。
- **百度**：设置 `BAIDU_TOKEN`（搜索资源平台推送 token）后自动推送到「普通收录」。
- **Google**：已停用 sitemap ping，在 Search Console 提交一次 `sitemap.xml` 即可长期自动抓取。
- 站点根地址默认 `https://yinto.top`，换域名用 `SITE_URL=https://你的域名 npm run seo:ping`。

（注意：`deploy` 本身不会自动 ping，避免误触外部接口；需要时用 `npm run deploy:seo`。）

## API

服务端只使用 Node 内置模块（`http`、`fs`、`crypto`），便于直接运行和审阅。

### 公开接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api` | 接口索引与免责声明 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/bootstrap` | 平台列表、热门作品、统计、免责声明 |
| GET | `/api/search?q=&type=&limit=` | 搜索本地作品条目；空关键词返回全量，按评分排序 |
| GET | `/api/douban/list?kind=hot\|latest&limit=` | 豆瓣榜单（热门 / 最新，只有片名/年份/评分/海报，用于首页切换） |
| GET | `/api/pan/search?q=&type=&offset=&limit=&reload=` | 搜索 PanSou 已接入来源中的网盘公开分享（站内搜索主入口；`/api/quark/search` 为兼容别名） |
| GET | `/api/titles` | 作品列表，等价于空关键词搜索 |
| GET | `/api/titles/:id` | 作品详情 + 4 部相似作品 |
| GET | `/api/titles/:id/offers?season=&region=&tier=&quality=&verified=1` | 渠道筛选、分组和计数 |
| GET | `/go/:titleId/:offerIndex` | 记录点击并跳转到平台 |
| POST | `/api/track` | 匿名页面访问埋点，JSON `{path, lang}`（路径白名单 `/`、`/search`、`/list`、`/title`） |
| POST | `/api/feedback` | 提交反馈，JSON，60 秒内最多 5 次 |

### 后台接口

除 `session`、`login`、`logout` 外都需要 `yt_admin` 会话 Cookie。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/session` | 当前登录状态、过期时间、是否默认密码 |
| POST | `/api/admin/login` | `{ "password": "..." }`，限流 8 次 / 10 分钟 |
| POST | `/api/admin/logout` | 注销当前会话 |
| GET | `/api/admin/meta` | 平台、类型、观看方式、画质、图案、配色预设 |
| GET | `/api/admin/titles?q=&type=&hot=1` | 后台作品列表 |
| POST | `/api/admin/titles` | 新增作品 |
| GET | `/api/admin/titles/:id` | 单个作品 |
| PUT | `/api/admin/titles/:id` | 更新作品 |
| DELETE | `/api/admin/titles/:id` | 删除作品 |
| GET | `/api/admin/dashboard?days=7\|30\|90` | 看板聚合数据 |
| GET | `/api/admin/feedback?q=&limit=&offset=` | 反馈列表、搜索、统计与分页 |
| GET | `/api/admin/tmdb/search?q=` | 代理检索 TMDB（需 `TMDB_API_KEY` 或请求头 `x-tmdb-key`） |

示例：

```bash
curl "http://127.0.0.1:4173/api/search?q=%E9%BE%99%E4%B9%8B%E5%AE%B6%E6%97%8F"
curl "http://127.0.0.1:4173/api/titles/hotd"
curl "http://127.0.0.1:4173/api/titles/hotd/offers?season=S03&verified=1"

# 登录并把会话 Cookie 存到临时文件
curl -c cookies.txt -X POST "http://127.0.0.1:4173/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"yingtu-admin"}'

curl -b cookies.txt "http://127.0.0.1:4173/api/admin/dashboard?days=30"
```

搜索响应中的 `matchedTotal` 是类型筛选前的匹配数，`items` 是当前类型下的结果，`suggestions` 用于空结果和少量结果时的推荐。`/offers` 返回 `filters`、`options`、`counts` 与 `groups`，可直接供其他客户端复用。

## 数据模型

```js
Provider = {
  id, name, short, color, fg, region, search
}

Title = {
  id, title, original, year, type, rating,
  seasons, runtime, genres, synopsis, aliases, tags,
  hot, poster, art, offers, createdAt, updatedAt
}

Offer = {
  pid, tier, season, quality[], price, verified
}

// 服务端返回详情和渠道时，会为 Offer 补充：
url, clickUrl
```

- `server/data/seed.js` 提供首次启动的演示片库，之后以 `data/titles.json` 为准。
- 后台新增作品时，`id` 由英文原名生成（如 `the-bear`）；纯中文名会生成随机 `title-xxxxxx`。
- `createdAt` / `updatedAt` 由服务端维护，后台表单不能覆盖。
- 作品是真实作品，简介为原创演示文案。默认片库不含任何外部图片：`poster` 为 `null` 时海报由客户端用 SVG 程序化生成，没有使用受版权保护的剧照。
- `poster` 是可选的海报图片直链：只接受 `https://` 开头、不含空白与引号、最长 500 字，其余值返回 422；留空存成 `null`。图片由运营者自行提供并确认授权，站点不抓取、不转存、也不代为核验。

### 片库持久化

- `TitleRepository` 启动时读取 `data/titles.json`；文件不存在时写入 seed 数据。
- 每次新增、修改、删除都会先改内存、再写临时文件、最后 `rename` 原子替换。
- 写盘失败会回滚内存变更，接口返回错误，不会出现“页面成功但文件没写”的情况。
- 如果 JSON 文件损坏，会重命名为 `titles.json.broken-<时间戳>.json`，再重新用 seed 初始化；原文件会保留供排查。
- 直接手改 `data/titles.json` 需要重启服务端；通过后台修改则立即生效。

### 行为统计与来源

`data/analytics.ndjson` 是追加写入的 JSON Lines：

```json
{"type":"page","path":"/","lang":"zh","visitorId":"...","country":"CN","city":"Shanghai","ip":"203.0.113.7","asn":4134,"asOrg":"China Telecom"}
{"type":"search","query":"沙丘","resultType":"全部","total":2,"tookMs":1,"visitorId":"...","country":"CN","city":"Shanghai","ip":"203.0.113.7","asn":4134,"asOrg":"China Telecom"}
{"type":"view","titleId":"dune2","title":"沙丘2","visitorId":"...","ip":"198.51.100.20"}
{"type":"click","titleId":"dune2","providerId":"max","provider":"Max","visitorId":"...","ip":"198.51.100.20"}
```

- 访客用随机 `yt_vid` HttpOnly Cookie 去重，**不保存 User-Agent、设备指纹或登录身份**。
- 事件带四个来源字段：`country`/`city` 来自 Cloudflare 边缘 GeoIP 对连接 IP 的解析结果（只到国家/城市，城市常被运营商归到省会），`ip` 是访客的真实来源地址（Worker 取 `cf-connecting-ip`，Node 侧走 `clientKey()`），`asn`/`asOrg` 是这个地址所属网络（AS 号与组织名，Worker 取 `request.cf.asn` / `asOrganization`）。存 IP 是为了认出「同一个来源在反复打接口却从不执行页面脚本」，存来源网络是为了认出机房和代理——无头浏览器会执行页面脚本，光看页面信标分不出人。
- 看板里的「真实访客」= 打过页面信标 **且** 不是机房/代理来源的匿名编号；判定名单在 `shared/asn.js`（已知云厂商 ASN + 组织名关键词，名字里带 fiber/broadband/telecom 等宽带词的放过）。判定只在看板聚合时做，事件照常入库，改完名单历史数据能直接重算。`overview.hostingVisitors` 给出被排除的机房编号数。
- 这些字段只从 `/api/admin/*` 输出（需登录，且后台按约定只跑在本地/内网），前台任何公开接口都不返回。清洗统一在 `shared/geo.js`：国家码限两位大写字母、城市名去控制字符并限 48 字、IP 只收合法 IPv4/IPv6（顺手去掉 `::ffff:` 前缀与区域标识）并限 45 字、ASN 只收 32 位正整数、组织名去控制字符并限 64 字，非法值一律落成空。
- IP 属于个人信息：线上部署需要在隐私政策里写明采集目的与保留期限，并定期清理旧事件（`DELETE FROM events WHERE created_at < …`）。历史行在迁移前写入的没有这些字段，看板会归到「未知地区」，且因为拿不到 ASN 而不会被判成机房。
- 搜索词、作品名和平台名会记录，属于可能含个人偏好的行为数据；生产环境需要隐私政策、告知与保留期限。
- 看板中的“详情浏览”是详情页请求数，“平台跳转”是 `/go` 跳转数。**它们不是实际播放量**，映途无法获知用户在 Netflix 等平台是否真的播放。
- 文件按行加载，单行损坏会被跳过；内存最多保留 20 万条事件，旧事件仍留在文件中。
- 统计写入失败只记日志，不影响前台搜索、详情和跳转。

## 搜索规则

关键词先做小写、去空白和常见标点归一化（例如 `沙丘 2` 等同于 `沙丘2`），再按字段加权：

| 命中 | 权重 |
| --- | --- |
| 中文名完全匹配 | +120 |
| 中文名包含关键词 | +70 |
| 关键词包含中文名 | +45 |
| 英文原名完全匹配 | +105 |
| 英文原名包含关键词 | +55 |
| 别名完全匹配 | +50 |
| 别名部分匹配 | +24 |
| 标签完全匹配 | +40 |
| 标签部分匹配 | +15 |
| 类型完全匹配 | +18 |
| 简介包含 | +4 |
| 年份匹配 | +6 |
| 拼音首字母完全匹配 | +110 |
| 拼音全拼完全匹配 | +100 |
| 拼音首字母前缀 | +80 |
| 拼音全拼前缀 | +70 |
| 拼音全拼包含（关键词 ≥3 字母） | +45 |

拼音只对纯字母关键词生效（至少 2 个字母），所以中文与英文查询的排序和以前完全一致；命中别名时按 0.8 折计入。同分按评分降序。类型筛选在匹配之后进行，因此不会把“类型”当成关键词扩大结果。

拼音表由 `scripts/build-pinyin.mjs` 从 [pinyin-data](https://github.com/mozillazg/pinyin-data) 的 kMandarin 读音离线生成（`shared/pinyin-data.js`，覆盖 U+4E00–U+9FA5 共 20902 字，约 44KB），运行时零依赖、零网络请求。新增冷僻字需要重建时执行 `npm run pinyin:build`。

## 服务端细节

- 静态托管：ETag、`Last-Modified`、`Cache-Control: no-cache`，未知路径返回 404。
- 安全头：CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`。
- 后台静态资源和页面额外返回 `X-Robots-Tag: noindex, nofollow`。
- 路径穿越防护：解码后规范化路径，并校验是否仍在 `client/` 内。
- API：统一 JSON 错误结构 `{ error: { code, message } }`，`Cache-Control: no-store`。
- 后台写接口：256KB 请求体上限，严格校验平台、类型、画质、季数、颜色和数值范围，丢弃未知字段。
- 反馈：4KB 请求体上限、`application/json` 校验、2-600 字、蜜罐字段、每 IP 每分钟 5 次（进程内内存）。
- 登录与跳转也有限流；所有限流都是单进程内存实现。
- 隐私：访问日志只记录方法、路径、状态码和耗时，不记录搜索词、反馈内容或 IP。
- 运维：请求/头部超时、SIGINT/SIGTERM 优雅关闭。

### 备份与恢复

```powershell
# 停止服务后复制数据文件
Copy-Item data\titles.json data\titles.backup.json
Copy-Item data\analytics.ndjson data\analytics.backup.ndjson

# 恢复片库
Copy-Item data\titles.backup.json data\titles.json
```

`data/titles.json` 是唯一需要重点备份的业务数据。删除它会在下次启动时重新生成 16 部演示作品；`analytics.ndjson` 和 `feedback.ndjson` 可以独立清空。

## 合规边界

网站区分平台观看渠道与 PanSou 公开分享结果：前者保留官方深链，后者仅展示已接入来源提供的网盘分享信息（夸克 / 百度 / 迅雷 / 阿里），不混入已验证观看渠道。

- 公开分享搜索不是任一网盘的全盘搜索，不能访问私有文件、枚举所有用户，也不能保证收录全部公开分享。
- 不托管影片、不绕过登录、提取码、访问控制或平台限制；提取码仅显示来源已经提供的值。
- 不把 HTTP 成功、公开可见或 PanSou 的 MIT 许可证解释为内容已获授权；分享链接可能失效或与关键词无关。
- 运营者应核查来源与内容授权，遵守平台条款，并在公开运营前建立版权投诉、移除与数据保留机制。目前反馈功能不是完整的版权处置系统。
- 演示海报由程序生成，简介为原创文案。原平台片库、价格与可看状态仍为演示值。

PanSou 源码采用 MIT 许可证，复制或分发其代码须保留其版权和许可声明；该许可不覆盖搜索到的第三方内容。

## 生产化路线

| 阶段 | 内容 |
| --- | --- |
| 1. 设计冻结 | 三视图、设计令牌、移动端、空状态、加载动效（已完成） |
| 2. 内容运营 | 可变片库、后台 CRUD、海报风格、渠道编辑、匿名看板（已完成，演示级） |
| 3. 数据接入 | TMDB 后台一键导入（已完成，按条目手动确认）；待做：批量导入、自动刷新、Watchmode 或持牌可看状态 |
| 4. 搜索与 SEO | 真实 URL、服务端 meta/OG/JSON-LD、sitemap、拼音搜索（已完成）；规模上来后用 Postgres `pg_trgm`/`tsvector` 或 Meilisearch/Typesense 替换内存打分 |
| 5. 身份与安全 | 正式管理员账号、角色权限、审计日志、2FA、HTTPS、共享会话与限流 |
| 6. 运营与合规 | 反馈工单、失效渠道巡检、隐私政策、ICP/版权审查、监控告警 |

参考技术栈：Next.js App Router + TypeScript + Tailwind + Postgres（Supabase/Neon）+ Drizzle/Prisma + Upstash Redis + Vercel。商业化优先考虑官方深链联盟、会员导购和品牌合作，而不是搬运资源。

## 已验证

- `npm test`：35 项测试全部通过（12 项公开 API + 9 项后台 + 7 项 SEO/TMDB + 3 项拼音 + 4 项品牌一致性）。
- 搜索结果“龙之家族”返回 2 部候选，顺序为《龙之家族》《权力的游戏》。
- 类型筛选“电影”返回《沙丘2》《奥本海默》。
- 详情页 S03 筛选剩 2 条，仅看可看剩 1 条，再叠加 4K 仍为 1 条。
- 后台登录、错误密码、会话过期、登出、未登录拦截。
- 后台新增 → 前台立即可搜 → 编辑 → 删除 → 前台 404。
- 非法评分、未知平台、空标题均返回 422；写盘后 JSON 内容正确。
- 看板搜索/浏览/跳转计数、趋势、热门搜索、无结果搜索、平台排行、匿名访客。
- `/go` 302 到平台、未知渠道 404、`Cache-Control: no-store`。
- `/admin` 跳转、`/admin/` CSP、`X-Robots-Tag: noindex`、静态资源可访问。
- 桌面 1440px 与移动 390px 浏览器检查：看板、片库、编辑器、删除确认弹窗，无横向溢出；控制台无报错。
- 桌面 1440px 浏览器检查：反馈列表、统计、搜索、无结果空状态与搜索焦点保持；后台分页 API 返回第 2 页 2 条。
- 反馈从浏览器提交后以 UTF-8 写入 `data/feedback.ndjson`。
- Workers + 本地 D1 冒烟：bootstrap/搜索/详情/渠道筛选/`/go` 302/反馈 201/404；登录、meta、看板（含匿名访客活跃度）、反馈收件箱、作品新增→前台可见→编辑→删除→404、非法数据 422；`/` 与 `/admin/` 静态页 CSP、no-store、noindex 生效；`/`、`/title/:id`、`/search`、`/list`、`/sitemap.xml`、`/robots.txt` 均返回注入后的正确 meta。
- 真实浏览器（Edge headless + CDP）跑通 14 项交互：首页渲染、点卡片 SPA 跳转（无整页刷新）、详情页、收藏写入 `localStorage`、头部计数、浏览器后退、`/list` 收藏列表、分享链接生成、`?ids=` 分享片单（2 部）、拼音搜索 `qldyx` 命中《权力的游戏》、搜索提交更新 URL。
- 后台真机交互 7 项：登录、片库、TMDB 导入按钮、弹窗、Key/搜索框、未配置 Key 时的提示文案。
- 未知作品返回 404 且 `noindex`；`/search`、`/list` 为 `noindex,follow`；sitemap 条数与片库一致（16 部 → 17 条 `<loc>`）。
- 路由白名单验证：`/`、`/title/:id`、`/search`、`/list`、`/sitemap.xml` 走 Worker 并注入 meta；`/styles.css`、`/app.js` 由静态层直出；未知路径 404。
- 目录缓存验证：新增作品后立即可搜、页面可见，删除后立即消失（缓存失效生效）。
- `wrangler deploy --dry-run`：Worker 产物 128 KiB、gzip 约 50 KiB，远低于免费版 3 MiB 上限。

## 已知限制

- 片库只有 16 部演示作品，可看状态是静态值，没有真实可用性巡检。
- 后台是单密码、单管理员、内存会话；没有账号体系、权限分级、操作审计和密码找回。
- 片库是单进程内存 + JSON 文件，不适合多实例并发写入；生产应换数据库。
- 统计只覆盖匿名搜索、详情浏览和平台跳转，**不能统计合作平台内的真实播放、完播或付费转化**。
- 分析数据没有采集同意流程、自动保留期限和导出/删除工具；生产环境需要补齐。
- 限流是单进程内存实现，多实例部署会失效。
- 没有对象存储上传、视频播放器和多语言。D1 迁移与种子脚本已就绪，但真实可看状态巡检仍缺。
- 评分、价格、平台可看状态均为演示值，不能作为真实购买依据。
- 映途与 Showpaw、Netflix、Max、Apple TV+、Prime Video、Disney+ 等均无关联。

## 文档

- [Showpaw 拆解与复刻方案](docs/showpaw-拆解与复刻方案.md)
- [免费上线检查清单](docs/deploy-free.md)
- [边缘反爬与滥用防护清单](docs/anti-abuse.md)
- 参考站：https://www.showpaw.xyz/
