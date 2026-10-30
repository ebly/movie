# 映途 管理后台（`admin/`）

映途的数据看板与用户反馈后台，代码在 `movie/admin/`，但仍是一个**独立进程、独立端口**：不再挂在 `/admin/` 下面，也不参与前台进程。后台只读，不含片库编辑。

- 后台界面：http://127.0.0.1:4174
- 前台站点：https://yinto.top（远程模式默认；本地开发也可 http://127.0.0.1:4173）

**固定走远程模式**：`npm start` 直接把所有请求转发到线上 Worker，读写线上 D1，不再使用本地文件。

## 远程模式（默认，读写线上 D1）

默认目标 `https://yinto.top`，换部署地址用 `REMOTE_API_BASE` 覆盖：

```bash
REMOTE_API_BASE=https://另一个域名 npm start
```

打开后台，用**线上后台的密码**登录（即 Worker 上 `ADMIN_PASSWORD` 的值，不是本地那个）。侧边栏会出现绿色的「线上 D1」徽章，说明看板读的是线上数据。

工作方式：后台当 BFF 代理，浏览器 → 本地后台 → 线上 Worker。

- 本地只做会话映射：登录密码原样交给线上校验，本地不存密码、不比对。
- 线上返回的 `yt_admin` Cookie 只存在后台进程内存里，不会下发给浏览器；浏览器拿到的是本地会话 Cookie。
- 看板、反馈全部实时打到线上，代理层不缓存，不存在两份真相。
- 线上会话过期时后台返回 401，前端自动回登录页，本地绑定同时作废。
- 线上不可达时返回 `502 remote_unreachable`，不会静默吞掉。

为什么不直接让浏览器连线上 Worker：Worker 没有 CORS 头，跨域拿不到响应；线上会话 Cookie 是 HttpOnly，跨站也带不过去。

> 本地文件模式（读 `../data/` 的 ndjson）仅供单元测试使用（`npm test` 直接构造本地 app），`npm start` 不再进入该模式。

> 注意：远程模式的连接是**后台进程发起的**，所以这台机器必须能访问那个域名。本机 DNS 被污染或网络被封锁时（`*.workers.dev` 在国内就是这样），先绑一个自己的域名；如果走代理能通，用 `NODE_OPTIONS=--use-env-proxy` 启动，Node 会读取 `HTTPS_PROXY`（Node 22 起支持，实验性）。

## 线上后台（admin.yinto.top）

https://admin.yinto.top 是本项目的前端界面单独部署到 Cloudflare Workers 的版本，Worker 名 `yingtu-admin`。

> **当前状态（2026-10-30）：已下线，整站返回 404。** 访问控制还没配好，`wrangler.toml` 里 `ADMIN_ENABLED = "false"`，Worker 对所有请求（包括静态页面）直接 404。配好访问控制后改成 `"true"` 再部署即可。custom domain 仍挂在 Worker 上，如果想让域名彻底不可解析，去控制台 Workers & Pages → `yingtu-admin` → Settings → Domains & Routes 把它删掉。

- 静态界面来自本仓库的 `client/`，由 `[assets]` 托管。
- 所有 `/api/*` 请求由 `worker/index.js` 反代到 `https://yinto.top/api/admin/*`，登录密码、会话、看板、反馈全部由主站 Worker 处理，这一层不复制业务逻辑，也没有自己的数据库。
- 浏览器只和 `admin.yinto.top` 同源通信，所以不存在跨域问题；主站返回的 `yt_admin` Cookie 由代理原样回传，只保留这一个 Cookie，Cloudflare Access 的 `CF_Authorization` 不会转发给主站。
- 写请求会把 `Origin` 改写成 `https://yinto.top` 以通过主站的同源校验，并把访客 IP 放进 `X-Forwarded-For` 供主站限流。
- 后台只做只读看板与反馈：片库 / TMDB 接口（`/api/titles*`、`/api/tmdb*`）在代理层直接返回 404，不会转发到主站。
- 响应带 CSP、`X-Frame-Options: DENY`、`X-Robots-Tag: noindex`，`/robots.txt` 全部 Disallow。

部署（在仓库根目录执行，wrangler 装在那里）：

```bash
cd D:/workspace/movie
npx wrangler deploy --config admin/wrangler.toml
```

`wrangler.toml` 用 `custom_domain = true` 绑定 `admin.yinto.top`，首次部署会自动创建 DNS 记录和证书，无需手动加 CNAME。后台 Worker 不需要任何 secret：它不校验密码，只做代理。启用前把 `routes` 的注释取消，并把 `ADMIN_ENABLED` 改成 `"true"`。

### 访问控制：Cloudflare Access

子域名会进证书透明度日志，被扫到只是时间问题，所以除后台密码外还应加一层 Cloudflare Access（邮箱一次性验证码）：

1. 打开 https://one.dash.cloudflare.com/ ，选对应账户，进入 **Access → Applications**。
2. **Add an application → Self-hosted**。
3. Application name 填 `映途后台`；Session Duration 选 `12 hours`；Application domain 选子域 `admin`、域 `yinto.top`，路径留空。
4. 添加策略：Action `Allow`，Include → `Emails`，填你自己的邮箱。
5. 确认 **Settings → Authentication → Login methods** 里 `One-time PIN` 已启用（默认启用）。
6. 保存后打开 https://admin.yinto.top ，应先跳到 Cloudflare 的邮箱验证页，收到验证码后才看到后台密码登录页。

Access 是独立于 `ADMIN_PASSWORD` 的第二道门：即使有人拿到了后台密码，没有你邮箱里的验证码也进不来。

## 快速开始

环境要求：Node.js >= 18.16。零第三方依赖，不用 `npm install`。

```bash
cd D:/workspace/movie/admin
npm start
```

打开 http://127.0.0.1:4174 ，用管理密码登录。首次默认密码 `yingtu-admin`，启动日志会提醒你换掉：

```bash
ADMIN_PASSWORD="换成你自己的强密码" npm start
```

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4174` | 后台端口，不能和前台 `4173` 撞车 |
| `HOST` | `127.0.0.1` | 监听地址；`0.0.0.0` 才允许局域网访问 |
| `REMOTE_API_BASE` | `https://yinto.top` | 远程模式转发的线上 Worker 域名；默认即远程，可覆盖成其它部署 |
| `FRONTEND_URL` | 远程域名 | 后台里「查看前台」链接指向的地址 |
| `ADMIN_DATA_DIR` | `../data` | 仅单元测试用的本地数据目录；`npm start` 不读 |

## 接口

后台接口在根路径 `/api` 下（不再有 `/api/admin` 前缀）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/bootstrap` | 品牌文案、前台地址（公开；只返回白名单字段，不含 `defaultPassword` / `cookies`） |
| GET | `/api/session` | 当前会话状态 |
| POST | `/api/login` | 登录，10 分钟内最多 8 次 |
| POST | `/api/logout` | 退出并清 Cookie |
| GET | `/api/meta` | 平台清单（看板还原平台名称 / 配色用） |
| GET | `/api/dashboard?days=7\|30\|90` | 行为看板 |
| GET | `/api/feedback?q=&limit=&offset=` | 反馈收件箱 |

除 `/api/bootstrap`、`/api/session`、`/api/login` 外都需要登录会话（HttpOnly Cookie，12 小时过期）。片库 / TMDB 接口已移除，访问一律 404。

## 测试

```bash
npm test
```

覆盖：会话与登录、Cookie 属性、meta 平台清单、片库 / TMDB 接口已移除、跨进程读取统计、反馈搜索分页、首页 CSP 与 noindex、旧 `/api/admin/*` 路径已消失；远程模式另有 BFF 代理、Cookie 代持、目录拦截、会话过期与 502 兜底，线上外壳另有 Worker 反代与整站开关测试。

## 与前台项目的关系

- 前台项目里已经没有 `client/admin/`、`server/admin.js`、`server/adminAuth.js`，`/admin/*` 和 `/api/admin/*` 在本地 Node 服务上一律 404。
- 生产部署（Cloudflare Workers）保留 `/api/admin/*` 作为后台 API，供单独部署的后台调用；对应界面从本项目管理。
- `config/brand.json` 两边各有一份，改品牌文案要同步改两处。
