# 映途

映途是一个“正版影视观看渠道搜索”的全栈演示项目：前台与管理后台统一使用「映途」品牌（旧称已完全弃用），采用柔和杂志风设计，包含前台搜索站和一套可用的管理后台。生产目标后端为 Cloudflare Workers + D1，本地另附零依赖 Node 服务用于开发与测试。项目聚合 Netflix、Max、Apple TV+、Prime Video、Disney+ 等正版平台的观看信息，不抓取、不存储、也不提供网盘或盗版链接。

当前是**演示数据**：16 部作品、12 个平台。评分、价格、可看状态和播放地址均为模拟值，不会真的扣费或播放。

参考站拆解、设计令牌、合规边界和生产化路线见 [docs/showpaw-拆解与复刻方案.md](docs/showpaw-拆解与复刻方案.md)。

## 快速开始

环境要求：Node.js >= 18.16。本地 Node 服务零第三方依赖，可直接运行；若要使用 Workers 后端 / wrangler 工具链，先执行一次 `npm install`。

```powershell
cd E:\workspacedemo\movie
npm start
```

- 前台：http://127.0.0.1:4173
- 后台：http://127.0.0.1:4173/admin/

后台首次启动使用演示密码 `yingtu-admin`。正式使用前请设置 `ADMIN_PASSWORD`：

```powershell
$env:ADMIN_PASSWORD="换成你自己的强密码"
npm start
```

开发时可以用自动重启：

```powershell
npm run dev
```

运行测试：

```powershell
npm test
```

换端口或允许局域网访问：

```powershell
$env:PORT=4174
$env:HOST="0.0.0.0"
npm start
```

不要直接双击 `client/index.html`。页面需要同源 API，直接以 `file://` 打开时会显示“服务端还没有启动”的提示。

## Cloudflare Workers + D1（生产后端）

生产目标栈：前端 HTML/CSS/JS（ Workers 静态资源托管）+ 后端 Cloudflare Workers + 数据库 Cloudflare D1。`worker/` 是 `server/` 的忠实移植，API 路径、响应结构、状态码、安全头与鉴权语义完全对齐，前台/后台页面不需要任何改动即可切换。

工具链要求 **Node >= 20**（wrangler 4；wrangler 3 的 beta 静态资源在本地不解析子目录页面，已弃用）。当前 shell 若是 Node 18，用 `nvm use 22`（或 Volta）切换后再执行下面的命令；`npm start` / `npm test` 仍然只需要 Node 18.16。

```powershell
npm install                # 安装 wrangler 4（仅 Workers 工具链需要）
npm run db:migrate         # 本地 D1 建表（worker/migrations/0001_init.sql + 0002_poster.sql）
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
- `run_worker_first` 是路由白名单而不是 `true`：只有页面外壳、`/api/*`、`/go/*`、`/admin/*` 进 Worker，静态资源由静态层直出，不消耗 10 万次/天的免费请求额度。新增前台页面路由要同步这个列表。
- 目录在一次 isolate 内缓存 20 秒，避免每个请求两条全表扫描；后台写入后立即失效，编辑仍然即时可见。
- 埋点写入走 `waitUntil`，不占用响应时间。
- 统计写入 `events` 表：匿名访客用 `visitor_id` 列（同样来自 `yt_vid` Cookie，不存 IP/UA）；搜索“结果数”借用 `offer_index` 列；标题/平台名查询时关联还原；按日分桶使用 UTC。
- 反馈/登录限流是 isolate 内存级近似，跨实例与冷启动会重置——与 Node 的“单进程内存”同级，都不是分布式限流。
- 后台会话默认 12 小时；密码默认值、演示数据与免责声明与 Node 版相同。

## 管理后台

后台是独立页面，但复用同一套服务端和片库数据。登录后可以：

- **数据看板**：7/30/90 天搜索、详情浏览、平台跳转、独立访客；环比变化；每日趋势；热门搜索；无结果搜索；热门作品；平台跳转排行；匿名访客活跃度；最近动态和反馈。
- **片库管理**：搜索、按类型筛选、仅看热门、编辑、删除。
- **TMDB 导入**：片库页右上角「TMDB 导入」，粘贴自己的 TMDB Key（v3 API Key 或 v4 Read Token）后按片名搜索，选中条目即把中文名、原名、年份、类型、评分、类型标签、简介和海报地址预填进新增表单，确认后再保存。Key 只保存在本机浏览器，也可以用 `TMDB_API_KEY` 环境变量/SECRET 统一配置。
- **用户反馈**：按时间倒序查看全部留言，统计累计数量、最近 7 天新增与留有联系方式的人数；搜索留言或邮箱；分页浏览；从看板一键进入完整收件箱。
- **新增/编辑作品**：中文名、原名、年份、类型、评分、季数、片长、类型标签、别名、搜索标签、简介、热门推荐。
- **海报**：可以粘贴一张外部海报图片地址（`https://` 图片直链，最长 500 字），右侧实时预览；留空则用程序化海报。程序化海报仍然可选图案（轨道、余烬、沙丘等）、三组颜色和文字色，并作为图片加载失败时的回退。
- **观看渠道**：任意增删平台、观看方式（订阅/租赁/购买/免费）、季数、画质（4K/HDR/杜比/1080P/中字）、价格、是否已验证。
- 保存后**立即**反映到前台搜索与详情页，无需重启。

后台地址和接口都带 `noindex`，`/admin` 会跳转到 `/admin/`，`robots.txt` 也屏蔽了 `/admin/`。但这些只是降低被索引的概率，**真正的访问控制是密码和会话**。

### 后台登录与会话

- 密码来自 `ADMIN_PASSWORD`；未设置时使用演示默认值 `yingtu-admin`，服务端启动时会打印警告。
- 会话保存在内存中，通过 `yt_admin` HttpOnly、SameSite=Strict Cookie 传递，默认 12 小时过期。
- 重启服务端会注销所有后台会话。
- 登录接口按 IP 限制为 10 分钟 8 次；后台写接口还会校验同源 `Origin`。
- 这是单机演示级鉴权：没有账号、角色、审计日志、二次验证或密码找回。公网部署前应换成正式的身份系统，并启用 HTTPS。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4173` | HTTP 端口 |
| `HOST` | `127.0.0.1` | 监听地址；局域网访问设为 `0.0.0.0` |
| `ADMIN_PASSWORD` | `yingtu-admin` | 后台密码；**正式使用必须修改** |
| `DATA_FILE` | `data/titles.json` | 可变片库文件 |
| `ANALYTICS_FILE` | `data/analytics.ndjson` | 匿名行为事件 |
| `FEEDBACK_FILE` | `data/feedback.ndjson` | 前台反馈 |
| `TMDB_API_KEY` | 空 | 后台 TMDB 导入用的 Key（v3 API Key 或 v4 Read Token），不设则由后台页面自带 |
| `TMDB_BASE` | `https://api.themoviedb.org/3` | TMDB 接口地址；本地网络需要代理/镜像时改这里 |

Workers 部署时环境变量改在 `wrangler.toml [vars]` / `wrangler secret put`：`ADMIN_PASSWORD`（后台密码）、`ADMIN_SECRET`（会话签名密钥）。

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
│  ├─ app.js              前台哈希路由、渲染、筛选、主题
│  ├─ robots.txt          屏蔽 /admin/
│  └─ admin/
│     ├─ index.html       后台壳
│     ├─ admin.css        后台设计系统、表格、编辑器、响应式
│     └─ admin.js         登录、看板、片库、编辑器、反馈（无依赖 SPA）
├─ shared/                 Node 与 Worker 共用的纯逻辑（第 8 项：消除双端重复）
│  ├─ search.js            归一化 + 字段加权打分（含拼音）
│  ├─ pinyin.js            汉字 → 全拼/首字母、拼音匹配打分
│  ├─ pinyin-data.js       构建产物，勿手改（npm run pinyin:build）
│  ├─ meta.js              页面 title/description/OG/JSON-LD 与 sitemap
│  └─ tmdb.js              TMDB 检索、错误码与字段映射
├─ server/
│  ├─ index.js            启动入口、超时与优雅关闭
│  ├─ app.js              路由编排、页面外壳、静态托管、错误处理
│  ├─ pages.js            读取 index.html 并注入 shared/meta.js 的元信息
│  ├─ api.js              /api/* 公开接口
│  ├─ admin.js            /api/admin/* 登录、CRUD、看板、反馈
│  ├─ adminAuth.js        密码哈希、内存会话、Cookie
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
│  ├─ api.test.js         12 个公开 API / 安全 / 持久化测试
│  ├─ admin.test.js       9 个后台鉴权 / CRUD / 看板 / 反馈 / 跳转测试
│  ├─ seo.test.js         页面 meta / canonical / noindex / sitemap / TMDB 映射
│  ├─ pinyin.test.js      拼音转换与拼音搜索命中
│  └─ brand.test.js       品牌一致性守卫（字段齐全、无旧品牌残留、双后端同源）
├─ worker/                Cloudflare Workers 版后端（对齐 server/ 契约）
│  ├─ index.js            fetch 入口：路由、安全头、静态资源、/go 跳转
│  ├─ store.js            D1 数据层：搜索/详情/筛选/CRUD（batch + 本地降级）
│  ├─ analytics.js        events 表埋点与看板聚合
│  ├─ feedback.js         反馈存储与限流
│  ├─ adminAuth.js        HMAC 无状态会话 Cookie
│  ├─ config.js           平台表、类型、画质顺序
│  ├─ migrations/         D1 建表 SQL（0001 建表 / 0002 海报地址列）
│  └─ seed.sql            本地生成的演示数据（.gitignore）
├─ scripts/
│  ├─ seed-d1.mjs         从 server/data/seed.js 生成 worker/seed.sql
│  └─ build-pinyin.mjs    生成 shared/pinyin-data.js（离线，一次即可）
├─ data/                  运行时生成，已加入 .gitignore
│  ├─ titles.json         可变片库（首次启动从 seed 生成）
│  ├─ analytics.ndjson    匿名搜索、浏览、跳转事件
│  └─ feedback.ndjson     前台反馈
├─ docs/
│  └─ showpaw-拆解与复刻方案.md
├─ wrangler.toml          Workers 部署配置（assets + D1 绑定）
├─ package.json
└─ .gitignore
```

## 前台页面与路由

前台使用 History API 真实路径，服务端为这些路径回退 `client/index.html` 并注入本页 meta；旧的 `#/` 链接会自动转换成新路径：

| 路由 | 页面 |
| --- | --- |
| `/` | 首页：主标题、搜索框、热门精选 |
| `/search?q=龙之家族&type=剧集` | 候选结果：同名/近名作品消歧、类型筛选 |
| `/title/hotd?q=龙之家族` | 详情：元数据、观看渠道、季/地区/方式/画质筛选、相似作品 |
| `/list?ids=hotd,severance` | 我的片单（本地收藏 + 分享片单） |
| `/go/:titleId/:offerIndex` | 记录匿名点击后 302 跳转到平台官方地址 |
| `/sitemap.xml` | 首页 + 全部作品的 sitemap |

支持的交互：

- 服务端搜索排序，支持中文名、英文原名、别名、标签、类型、年份，以及**拼音全拼与首字母**（`qldyx`、`quanlideyouxi` 都能找到《权力的游戏》）。
- **本地收藏**：详情页与结果卡右上角的心形按钮，数据只写 `localStorage`（键名 `yingtu-favorites`，最多 200 部），不上传服务端、不需要登录。
- **片单分享**：`/list` 页可复制 `?ids=a,b,c` 形式的分享链接，对方打开后能看到「别人分享的片单」并一键加入自己的收藏。
- 结果类型筛选，URL 可分享，保留滚动位置。
- 详情页 900ms 的“整理渠道”加载动效，包含请求取消和竞态保护。
- 渠道按“已验证可看 / 待确认”分组，支持仅看可看、季、地区、方式、画质筛选。
- 深浅色切换，主题写入 `localStorage`。
- 反馈弹窗提交到服务端，带校验、蜜罐、限流和 JSONL 持久化。
- 移动端布局，含 390px 断点的海报与筛选重排。

## SEO 与分享

- 每部作品都有独立真实路径 `/title/:id`，服务端把本页的 `<title>`、`description`、`canonical`、Open Graph 与 JSON-LD（`Movie` / `TVSeries`）注入 `client/index.html` 的 `<!--SEO-->` 占位；Node 与 Worker 共用 `shared/meta.js`，输出完全一致。
- 可索引范围：首页与详情页可收录；`/search`、`/list`、404 页返回 `noindex,follow`，把抓取预算留给详情页。未知作品同时返回 HTTP 404，不是“200 的空页面”。
- `/sitemap.xml` 由片库实时生成（首页 + 全部作品，带 `lastmod`）；`/robots.txt` 动态返回并指向 sitemap，同时屏蔽 `/admin/` 与 `/list`。
- 有海报时把 `poster` 用作 `og:image`，没有海报时退回 `summary` 卡片，不会引用不存在的图片。
- `client/index.html` 里的 CSS/JS 必须用绝对路径（`/styles.css`、`/app.js`）：子路径页面用相对路径会被解析成 `/title/styles.css`。

## API

服务端只使用 Node 内置模块（`http`、`fs`、`crypto`），便于直接运行和审阅。

### 公开接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api` | 接口索引与免责声明 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/bootstrap` | 平台列表、热门作品、统计、免责声明 |
| GET | `/api/search?q=&type=&limit=` | 搜索；空关键词返回全量，按评分排序 |
| GET | `/api/titles` | 作品列表，等价于空关键词搜索 |
| GET | `/api/titles/:id` | 作品详情 + 4 部相似作品 |
| GET | `/api/titles/:id/offers?season=&region=&tier=&quality=&verified=1` | 渠道筛选、分组和计数 |
| GET | `/go/:titleId/:offerIndex` | 记录点击并跳转到平台 |
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

### 匿名统计

`data/analytics.ndjson` 是追加写入的 JSON Lines：

```json
{"type":"search","query":"沙丘","resultType":"全部","total":2,"tookMs":1,"visitorId":"..."}
{"type":"view","titleId":"dune2","title":"沙丘2","visitorId":"..."}
{"type":"click","titleId":"dune2","providerId":"max","provider":"Max","visitorId":"..."}
```

- 访客用随机 `yt_vid` HttpOnly Cookie 去重，**不保存 IP、User-Agent、设备指纹或登录身份**。
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

Showpaw 本身聚合的是网盘分享链接。把未授权影视资源整理成可搜索的链接库，在多数司法辖区会涉及版权侵权，也可能违反信息网络传播、网盘平台条款等规定。因此本项目**没有**复刻它的网盘链接抓取、校验和分发链路。

本项目改为聚合正版平台的观看入口：

- 只展示平台名称、订阅/租赁/购买方式、画质、价格和官方搜索深链。
- 不托管视频文件，不提供磁力、网盘分享码或破解资源。
- 演示海报由程序生成，简介为原创文案。
- 反馈只存本地 JSONL，不在前台公开展示。

上线前仍然需要做法律与数据授权审查，尤其是元数据、海报、评分、可看状态和平台商标的使用。后台不会改变这些边界，它只是编辑同一份合法渠道数据。

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
- 参考站：https://www.showpaw.xyz/
