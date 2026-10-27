# Showpaw 拆解与映途复刻方案

调研对象：https://www.showpaw.xyz/
交付代码：`E:\workspacedemo\movie`
交付形态：公开前台「映途」（原生 HTML/CSS/JS，柔和杂志风）+ Cloudflare Workers / D1 生产后端 + 零依赖 Node 本地开发与测试服务 + 管理后台 + 21 项自动化测试

> 说明：本文把“可观察到的页面事实”和“对后端/架构的推断”分开写。参考站是网盘资源聚合器，本文只复刻其信息架构与视觉语言，不复刻盗版链接的抓取、校验和分发。

## 1. 一句话结论

Showpaw 不是“影视目录站”，而是一个把“我想看某部剧”压缩成“哪条网盘链接还能用”的三屏工具：

1. 首页只做一件事：让用户输入片名。
2. 结果页只做一件事：在多个同名/近名候选里选对作品。
3. 详情页只做一件事：把可用资源、季数、画质、网盘和验证状态排好，让用户复制或打开。

它真正的产品价值不是海报墙，而是**候选消歧 + 链接有效性验证 + 操作路径短**。视觉上则刻意做成杂志感的米白纸、墨绿字和朱红强调，降低“资源站”的粗糙感。

对合法复刻来说，正确的替换是：保留三屏结构和视觉语言，把“网盘资源层”换成“正版流媒体可看性层”。

## 2. 参考站拆解

### 2.1 定位与文案

页面元信息直接说明了产品定位：

- 标题：`Showpaw — 海外影视网盘资源搜索 · 美剧 英剧 电影 一键找资源`
- 描述：聚合海外影视网盘资源，实时验证百度网盘、夸克、阿里云盘、115、迅雷、UC 等链接有效性，自动过滤失效资源，无需注册、无广告。
- 主标题：`省下找资源的时间，多看两集。`
- 副标题：`聚合网盘资源，失效链接已尽力过滤`
- 搜索占位：`搜索影视剧名称…`
- 热门精选：`龙之家族`、`人生切割术`、`熊家餐厅`、`辐射`、`怪奇物语`
- 右下/右上：`✦ 反馈`
- 移动端底部补充：`聚合网盘资源,失效链接已尽力过滤。`

文案策略很明确：不卖“海量片库”，卖“省时间”和“少踩失效链接”。

### 2.2 三视图信息架构

```text
首页
└─ 输入片名 / 点热门词
   └─ 候选结果
      ├─ 同名、近名、续作、不同年份并排
      └─ 选中一部
         └─ 作品详情
            ├─ 海报、标题、原名、年份、类型、评分、季数
            ├─ 简介、类型标签、豆瓣/IMDb/TMDB 外链
            ├─ 资源列表（按已验证/待确认分组）
            ├─ 季 / 网盘 / 方式 / 画质筛选
            ├─ 仅显示可看
            ├─ 复制提取码 / 打开链接
            ├─ 免责声明
            └─ 相似作品
```

**首页**：极简。品牌字标、单句主张、一个胶囊搜索框、五个热门词，没有导航、没有分类、没有海报流。搜索按钮在输入为空时是禁用态，输入后才变为可用，减少无效提交。

**候选结果**：不是“搜索结果列表”那么简单，而是消歧界面。每张卡片都带海报、中文名、英文原名、年份、类型、评分、季数/时长和一句简介，用户先确认“是哪一部”，再进入详情。对同名剧、续作、翻拍尤其重要。

**详情页**：海报与元数据是身份确认，真正的核心是资源区。资源按“已验证可看”和“待确认”分组，每条包含平台/网盘、方式（订阅/租赁/购买/免费）、季、画质、价格、验证状态和操作按钮。筛选维度是季、地区、方式、画质，另有一个“仅显示可看”开关。页面底部有相似作品和免责声明。

**加载过渡**：从结果进入详情时有短暂加载态，用爪子圆点和检查清单制造“正在检索/校验”的节奏。这个动效不是装饰，它在心理上把“等 1 秒”解释成“系统在替我验证资源”。

### 2.3 视觉系统

从参考站 CSS 中提取到的核心令牌：

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--v4-paper` | `#f4ede0` | 页面底色，暖米白 |
| `--v4-cream` | `#faf6ec` | 卡片、浅色块 |
| `--v4-ink` | `#0d2a2e` | 主文字，墨绿近黑 |
| `--v4-ink-soft` | `#3e5558` | 次级文字 |
| `--v4-mute` | `#8a928e` | 弱化信息 |
| `--v4-accent` | `#a83232` | 朱红强调、斜体关键词 |
| `--v4-accent-soft` | `#a832321a` | 强调色淡背景 |
| `--v4-rule` | `#0d2a2e1f` | 细分割线 |
| `--v4-rule-strong` | `#0d2a2e38` | 强分割线 |
| `--v4-status-alive` | `#2d7a5a` | 链接有效 |
| `--v4-status-dead` | `#a35543` | 链接失效 |
| `--v4-status-unchecked` | `--v4-mute` | 未检查 |
| `--v4-hero-dark` | `#081619` | 深色区域 |
| `--v4-ink-disabled` | `#0d2a2e59` | 禁用按钮 |

浅色 `theme-color` 是 `#f5f0e3`，深色是 `#1a1a1a`，说明参考站用 `prefers-color-scheme` 做了系统级深浅色适配，而不是只做一套米白。

**字体**：HTML 的字体变量类名和预加载文件显示使用了五套自托管字体：

- `Fraunces`：英文展示标题，支持 italic 和 `opsz` 光学尺寸，主标题使用 `opsz 144`。
- `Inter`：英文正文和 UI。
- `Noto Serif SC`：中文衬线，承接杂志感。
- `Noto Sans SC`：中文无衬线 UI。
- `JetBrains Mono`：编号、元数据、资源码等。

**字阶与排版**：

- 首页主标题：`clamp(34px, 6vw, 60px)`，字重 400，行高 1.06，字距 `-0.03em`。
- 主标题中的“多看两集”用朱红斜体，形成唯一的情绪强调。
- 副标题 14.5px，热门标签 14px，页脚 11.5px。
- 搜索框为 999px 胶囊，内边距 `8px 8px 8px 24px`，按钮同胶囊。
- 首页内容最大宽度 720px，头部内边距 `24px 32px`。

**品牌字标**：`Showpaw` 的第二个 `o` 被替换成三个椭圆组成的爪印，位置在字母上方，`viewBox="0 0 90 52"`，三条 toe 椭圆分别位于 14/45/76。这个细节让极简页面有一个可记忆的视觉锚点。

**颗粒质感**：参考站用一层 240×240 的 SVG `feTurbulence` 噪点，`baseFrequency=0.85`、`numOctaves=2`、`opacity .1`、`mix-blend-mode: multiply` 叠在页面上，制造纸张/印刷感。它不是背景图，而是编码进 CSS 的 data URI，零请求。

**深色主题**：参考站有深色变量体系。映途在复刻时保留了手动切换，并把深色做成墨绿黑底、米色字、降饱和朱红，而不是简单反相。

### 2.4 技术栈推断

从保存下来的首页 HTML 和 CSS 可以确认：

| 证据 | 推断 |
| --- | --- |
| `_next/static/chunks/...`、RSC payload、`BAILOUT_TO_CLIENT_SIDE_RENDERING` | Next.js App Router + React Server Components；搜索页是客户端渲染边界 |
| `turbopack-*.js` | 使用 Turbopack 构建 |
| `data-dpl-id="dpl_..."` | 部署在 Vercel |
| Tailwind 原子类 + 大量内联样式 | Tailwind 为主，局部动态样式内联 |
| 五套 `next/font` 预加载 woff2 | 自托管字体，避免第三方字体请求 |
| `next/script` 注入 `capture-initial-referer` 和百度推送 | 用 `afterInteractive` 做首访来源 Cookie 和百度收录推送 |
| JSON-LD `WebSite` + `Organization` + `SearchAction` | 搜索型站点 SEO |
| `baidu-site-verification` | 面向百度搜索优化 |
| `og:image`、Twitter Card、canonical、hreflang | 完整社交分享与多语言基础 |

参考站没有暴露后端实现，但按产品形态可以推断出一条典型管线：

```text
资源采集/投稿
  → 片名与别名归一化
  → 作品实体消歧（片名 + 年份 + 类型 + 季数）
  → 链接入库（网盘、季、画质、提取码、大小）
  → 定时/按需有效性校验
  → 检索索引与排序
  → 候选结果 + 详情资源列表
```

真正难的不是前端，而是**实体消歧**和**链接有效性**：

- 同一个中文名可能对应不同年份、不同国家、电影/剧集/动画。
- 续作、前传、衍生剧、同名翻拍需要靠原名、年份、季数和别名共同判断。
- 网盘分享链接会失效、被限流、需要提取码、地区限制，校验本身有成本和反爬风险。
- 链接有效性不是布尔值，至少有“已验证 / 待确认 / 失效 / 未检查”四态。
- 排序不能只看时间，还要看验证状态、季数新旧、画质、平台偏好和用户反馈。

映途的演示版把这条管线压缩成：服务端搜索排序 + 详情返回渠道 + 客户端筛选，保留了交互形状，去掉了不合法的资源层。

## 3. 合规红线与替代方案

### 3.1 为什么不能直接复刻资源层

Showpaw 聚合的是网盘分享链接。把未授权影视资源整理成可搜索、可复制、可跳转的链接库，风险至少包括：

- 著作权侵权：复制、传播、提供作品获取途径。
- 信息网络传播相关行政/刑事责任风险（视司法辖区而定）。
- 违反网盘平台服务条款，可能涉及账号、接口、反爬和分享规则。
- 平台商标、海报、剧照、评分数据的授权问题。
- 广告、支付、联盟等商业化环节的连带合规风险。

“用户上传 + 通知删除”不是万能免责牌。如果站点主动采集、分类、验证、推荐盗版链接，很难主张自己只是中立管道。

### 3.2 四种合法产品模型

| 模型 | 做法 | 优点 | 难点 |
| --- | --- | --- | --- |
| A. 正版可看性指南（推荐） | 聚合 Netflix/Max/Apple TV+/Prime/Disney+/国内平台，展示订阅、租赁、购买、画质、价格和官方深链 | 合法、可 SEO、可变现、与参考站 UX 最接近 | 需要元数据与可看性授权，价格地区差异大 |
| B. 自有/授权片库 | 自己拥有或独家授权的视频内容，做点播 | 壁垒高、体验完整 | 内容成本极高 |
| C. 合规 UGC + 严格审核 | 用户投稿正版渠道信息或自有内容，人工审核 + 通知删除 | 冷启动可能更快 | 审核成本、侵权风险仍在 |
| D. 工具型延伸 | 只做“在哪看”的搜索/比价/收藏/提醒，不提供播放 | 最轻、风险最低 | 变现弱，依赖联盟 |

映途选择 A：它保留了“搜索片名 → 选对作品 → 看渠道”的三屏结构，但详情页的“资源”变成“正版平台报价与官方入口”。

### 3.3 上线前必须确认

- TMDB 元数据与图片的使用条款、署名和缓存限制。
- Watchmode/JustWatch 等可看性数据的商业授权与地区覆盖。
- 平台商标、Logo、品牌色的使用规范。
- 价格、画质、字幕、地区限制的展示免责声明。
- 隐私政策、Cookie、日志保留、反馈数据保留。
- 如果部署在中国大陆，ICP 备案、内容审核和网络文化经营相关要求。
- 如果做联盟分佣，披露关系和跳转追踪合规。

## 4. 映途交付说明

代码位置：`E:\workspacedemo\movie`

### 4.1 做了什么

- 复刻三视图：首页、候选结果、作品详情。
- 复刻视觉语言：米白纸、墨绿、朱红、Fraunces + 中文衬线、爪印字标、颗粒层、深浅色。
- 复刻交互节奏：搜索禁用态、热门词、结果类型筛选、详情加载清单、渠道分组、仅看可看、季/地区/方式/画质筛选、相似作品、反馈弹窗。
- 改为合法数据：12 个正版平台、16 部作品、演示报价与可看状态、官方搜索深链。
- 改为原创资产：海报由 SVG 程序化生成，简介为原创演示文案，没有使用剧照。
- 改为真实前后端：Node 服务端负责搜索、详情、渠道筛选、反馈持久化；客户端只做渲染与交互。
- 增加管理后台：单密码登录、片库增删改查、程序化海报编辑、观看渠道编辑、匿名搜索/浏览/跳转看板、完整用户反馈收件箱。
- 增加可变数据层：`data/titles.json` 原子写入、失败回滚、损坏文件备份、首次启动自动 seed。
- 增加匿名统计：随机访客 Cookie 去重，不存 IP/UA；搜索、详情浏览与 `/go` 平台跳转按事件落盘。
- 增加工程化：CSP、路径穿越防护、ETag、请求体限制、后台同源校验、登录/反馈/跳转限流、优雅关闭、21 项自动化测试。

### 4.2 关键设计决策

| 决策 | 原因 |
| --- | --- |
| 品牌改为「映途」 | 避免与参考站混淆，也避免复用其商标 |
| 零第三方依赖 | 交付即可运行，方便审阅和二次改造 |
| 服务端搜索而非前端过滤 | 演示真实架构，便于后续换数据库/搜索引擎 |
| 海报程序化生成 | 规避剧照版权，同时保持每部作品有独立视觉 |
| 演示报价与状态 | 不伪造真实商业信息，页面明确标注“演示数据” |
| 反馈写 JSONL | 无数据库也能演示完整提交链路，生产可替换 |
| 片库写 JSON + 原子替换 | 不引入数据库即可演示可编辑内容，写盘失败可回滚 |
| 后台单密码 + 内存会话 | 演示鉴权链路完整、部署简单；正式环境必须换账号/角色/审计 |
| 匿名 Cookie 统计 | 不做跨站追踪，不存 IP/UA，只回答“搜了什么、看了哪部、跳去哪” |
| `/go` 服务端跳转 | 点击归属可靠，不依赖前端 beacon 或广告拦截环境 |
| 深链到平台搜索 | 不自建播放器，不托管内容 |

### 4.3 目录与 API

见项目根目录 [README.md](../README.md)。

核心接口：

- `GET /api/bootstrap`
- `GET /api/search?q=&type=&limit=`
- `GET /api/titles/:id`
- `GET /api/titles/:id/offers?season=&region=&tier=&quality=&verified=1`
- `POST /api/feedback`
- `GET /go/:titleId/:offerIndex`
- `POST /api/admin/login`、`POST /api/admin/logout`、`GET /api/admin/session`
- `GET|POST /api/admin/titles`、`GET|PUT|DELETE /api/admin/titles/:id`
- `GET /api/admin/dashboard?days=7|30|90`
- `GET /api/admin/feedback?q=&limit=&offset=`
- `GET /api/admin/meta`

后台页面位于 `/admin/`，`/admin` 会 302 跳转；后台页面、脚本和接口均带 `noindex`。

### 4.4 验证结果

- `npm test`：21 项全部通过（12 项公开 API + 9 项后台）。
- 搜索“龙之家族”返回 2 部候选，顺序为《龙之家族》《权力的游戏》。
- 类型筛选“电影”返回《沙丘2》《奥本海默》。
- 详情页 S03 筛选剩 2 条，仅看可看剩 1 条，再叠加 4K 仍为 1 条。
- 反馈从浏览器提交后以 UTF-8 写入 `data/feedback.ndjson`。
- 后台登录、错误密码、未登录拦截、会话 Cookie 属性、登出失效。
- 后台新增作品后前台立即可搜；编辑后详情更新；删除后前台 404。
- 非法评分、未知平台、空标题返回 422；片库 JSON 写入正确。
- 看板正确聚合搜索、详情浏览、`/go` 跳转、无结果搜索、平台排行和匿名访客。
- `/admin/` 返回 CSP 与 `X-Robots-Tag: noindex`；`/go` 302 到平台。
- 首页、结果页、详情页、后台看板、片库、编辑器在桌面 1440px 与移动 390px 下通过浏览器检查，无横向溢出，控制台无报错。

## 5. 生产架构建议

### 5.1 总体结构

```text
Next.js App Router (SSR/ISR)
  ├─ /                      首页
  ├─ /search?q=             候选结果（可 SSR + 客户端交互）
  ├─ /title/[slug]          详情（ISR，SEO 重点）
  ├─ /api/*                 BFF / 反馈 / 埋点
  └─ sitemap.ts / robots.ts

Postgres (Supabase/Neon)
  ├─ titles / title_aliases / genres
  ├─ providers / offers / seasons
  ├─ feedback
  └─ availability_snapshots

外部数据
  ├─ TMDB：元数据、海报、演职员
  ├─ Watchmode/持牌数据：地区可看性
  └─ 官方深链/联盟链接

缓存与任务
  ├─ Redis/Upstash：热门搜索、可看性缓存、限流
  └─ Cron：每日刷新可看性、失效巡检、sitemap
```

### 5.2 数据表草案

```sql
create table titles (
  id            text primary key,
  tmdb_id       integer unique,
  type          text not null,          -- 剧集/电影/动画/纪录片
  title_zh      text not null,
  title_en      text,
  year          integer,
  synopsis      text,
  poster_path   text,
  rating        numeric(3,1),
  seasons       integer,
  runtime       text,
  created_at    timestamptz default now()
);

create table title_aliases (
  title_id      text references titles(id) on delete cascade,
  alias         text not null,
  normalized    text not null,
  primary key (title_id, alias)
);

create table providers (
  id            text primary key,
  name          text not null,
  region        text not null,          -- 海外/中国大陆
  brand_color   text,
  homepage      text,
  deep_link     text                    -- 官方搜索模板
);

create table offers (
  id            bigserial primary key,
  title_id      text references titles(id) on delete cascade,
  provider_id   text references providers(id),
  country       text not null,          -- US/CN/GB...
  monetization  text not null,          -- 订阅/租赁/购买/免费
  season        text,
  quality       text[],
  price_cents   integer,
  currency      text,
  deep_link     text,
  status        text default 'unchecked', -- verified/pending/dead/unchecked
  verified_at   timestamptz,
  source        text,
  unique (title_id, provider_id, country, season, monetization)
);

create table feedback (
  id            uuid primary key default gen_random_uuid(),
  message       text not null,
  contact       text,
  created_at    timestamptz default now()
);
```

### 5.3 搜索

16 部作品用内存排序足够，生产建议分两步：

1. **Postgres 起步**：`pg_trgm` + `tsvector`，标题、原名、别名、标签、类型分字段加权；`similarity()` 处理错别字。
2. **规模上来后**：Meilisearch 或 Typesense，支持拼音、首字母、繁简、同义词、typo tolerance 和即时搜索。

索引字段建议：

- `title_zh`、`title_en`、`aliases[]`、`genres[]`、`tags[]`、`year`、`type`、`popularity`、`available_regions[]`。
- 排序权重：精确标题 > 原名 > 别名 > 标签 > 类型 > 简介；同分再按评分/热度/可看渠道数。

### 5.4 可看性数据

- 用持牌 API 或官方开放数据，不抓取平台页面。
- 可看性按国家/地区存储，不要做成一个全局布尔值。
- 每日全量刷新 + 热门作品更高频刷新；保留 `availability_snapshots` 便于追踪变化。
- 价格显示必须带“以平台实际页面为准”的免责声明。
- 深链优先使用官方搜索/详情链接，联盟链接需披露。

### 5.5 SEO

参考站做了 JSON-LD、canonical、OG、百度推送，但搜索页是客户端渲染。生产版应把详情页做成可索引页面：

- 路由：`/title/[slug]`，slug 用英文名 + 年份，避免纯 ID。
- `generateMetadata`：标题模式 `${中文名} 在哪里看？正版平台与价格 | 映途`。
- JSON-LD：`Movie`/`TVSeries` + `WatchAction`，遵守 Google 影视观看结构化数据规范。
- `sitemap.ts` 覆盖全部作品与分类页，`robots.ts` 放行详情页。
- OG 图按作品生成，不要全部用一张默认图。
- 内链：相似作品、同平台、同类型、同主演（有数据后）。
- 避免“薄页面”：每页至少要有独特简介、平台可看性、地区价格和常见问题。

### 5.6 安全与隐私

- 不要求注册，默认不收集账号信息。
- 搜索词、作品名和平台名以匿名事件写入本地 NDJSON，不含 IP、User-Agent 或设备指纹；生产需告知、同意与保留期限。
- 后台使用单密码 + HttpOnly/SameSite=Strict 会话，写接口校验同源；正式环境应换账号、角色、审计、2FA 与 HTTPS。
- 反馈限流用 Redis，按 IP 哈希计数，不存原始 IP；反馈内容只在后台可见。
- CSP、HSTS、`X-Content-Type-Options`、`Referrer-Policy` 全站启用。
- 后台页面与接口启用 `noindex` 并写入 `robots.txt`，但不把隐藏 URL 当安全措施。
- 第三方字体可改为自托管子集，减少外部依赖。

## 6. 五周落地计划

| 周 | 目标 | 产出 |
| --- | --- | --- |
| 第 1 周 | 设计冻结与前端骨架 | 三视图、令牌、移动端、空/错/加载状态（当前已完成） |
| 第 2 周 | 数据接入 | TMDB 元数据与海报、Postgres 表、导入脚本、详情页 SSR |
| 第 3 周 | 可看性 | Watchmode/持牌数据、地区价格、官方深链、每日刷新任务 |
| 第 4 周 | 搜索与 SEO | 加权搜索、候选消歧、sitemap、JSON-LD、OG 图、埋点 |
| 第 5 周 | 上线准备 | 反馈后台、失效巡检、隐私政策、法务审查、监控与告警 |

## 7. 验收清单

- [x] 首页搜索、热门词、禁用态按钮
- [x] 候选结果、类型筛选、URL 可分享
- [x] 详情加载、渠道分组、仅看可看
- [x] 季/地区/方式/画质筛选与计数
- [x] 相似作品
- [x] 深浅色主题
- [x] 移动端布局
- [x] 反馈校验、限流、持久化
- [x] 服务端搜索与详情 API
- [x] CSP、路径穿越防护、404
- [x] 管理后台登录、片库 CRUD、海报与渠道编辑
- [x] 匿名搜索/浏览/跳转看板与完整用户反馈收件箱
- [x] 自动化测试
- [ ] 真实 TMDB/Watchmode 数据
- [ ] 正式账号体系、角色权限与操作审计
- [ ] 数据库迁移
- [ ] 真实 OG 图与 sitemap
- [ ] 法务与数据授权审查

## 8. 风险表

| 风险 | 等级 | 对策 |
| --- | --- | --- |
| 版权/信息网络传播风险 | 高 | 不做网盘链接聚合；只用持牌数据与官方深链；上线前法务审查 |
| 元数据/图片授权 | 高 | 遵守 TMDB 条款与署名；不缓存禁止缓存的资源 |
| 可看性数据不准确 | 中 | 标注更新时间与免责声明；多源校验；用户反馈 |
| 链接失效/地区限制 | 中 | 定时巡检、状态快照、降级到平台搜索页 |
| SEO 薄页面 | 中 | 独特简介、价格与地区信息、常见问题、内链 |
| 品牌/商标 | 中 | 使用独立品牌「映途」，不复用参考站 Logo/文案/素材 |
| 性能 | 低 | 字体子集、图片 CDN、ISR、缓存热门搜索 |
| 隐私 | 中 | 最小化日志、IP 哈希、反馈保留期限、隐私政策 |

## 9. 参考

- Showpaw：https://www.showpaw.xyz/
- 调研时保存的首页 HTML 与 CSS 包：`research/showpaw-home.html`、`research/css1.css` 至 `research/css4.css`（工作区研究目录，不随项目交付）
- Next.js App Router：https://nextjs.org/docs/app
- TMDB API：https://developer.themoviedb.org/docs
- Watchmode API：https://api.watchmode.com/
- Google 影视观看结构化数据：https://developers.google.com/search/docs/appearance/structured-data/movie
- schema.org Movie / TVSeries：https://schema.org/Movie

## 10. 最后一句

复刻参考站最值得学的是“把一件事做到极短路径”的产品克制，而不是它的资源来源。把同样的三屏结构、排版和验证叙事，用在正版可看性上，既能保留那种“找片不费劲”的体验，也能把项目放到可持续、可上线、可商业化的轨道上。
