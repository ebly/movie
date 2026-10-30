# 映途小程序（wx/）

微信端的映途：豆瓣新片榜、站内作品索引与观看渠道、网盘公开分享搜索。
纯原生小程序（WXML / WXSS / JS），零依赖，没有自己的后端——所有数据都走 `https://yinto.top` 的公开 API。

## 目录与接口

```
wx/
├── app.js / app.json / app.wxss   全局：bootstrap 缓存、页面信标、暖色主题
├── config.js                      baseUrl 与超时（换域名只改这里）
├── utils/
│   ├── api.js                     所有网络请求的唯一出口
│   ├── format.js                  评分/年份/相对时间/海报兜底配色（纯函数，可单测）
│   └── store.js                   访客编号、搜索历史、bootstrap 缓存
├── pages/
│   ├── index/                     发现：豆瓣最新 / 热门榜单
│   ├── search/                    站内搜索（片名、别名、演员）
│   ├── detail/                    作品详情 + 各平台观看渠道
│   └── pan/                       网盘公开分享搜索
└── tools/check.js                 结构自检，不必打开开发者工具
```

| 页面 | 接口 |
| --- | --- |
| 启动 | `GET /api/bootstrap` |
| 发现 | `GET /api/douban/list?kind=latest\|hot&limit=12` |
| 搜索 | `GET /api/search?q=&type=&limit=` |
| 详情 | `GET /api/titles/:id` |
| 网盘 | `GET /api/pan/search?q=&type=quark\|baidu\|xunlei\|aliyun&offset=&limit=&reload=` |
| 埋点 | `POST /api/track`（`path` 只接受 `/`、`/search`、`/list`、`/title`） |

## 本地跑起来

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（稳定版即可）。
2. 导入项目，目录选 `E:\workspacedemo\movie\wx`。AppID 选「测试号」或直接用仓库里的 `touristappid`，没有 AppID 也能编译预览。
3. 右上角「详情 → 本地设置」勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**。
4. 点编译。首页会拉到豆瓣最新榜；搜索、详情、网盘用的是线上接口，和网页端同源同数据。

改完代码先跑一遍结构自检（检查页面四件套、`bindtap` 方法是否存在、JSON 与语法）：

```bash
node wx/tools/check.js
```

## 发布成正式小程序

发布不是「点一下部署」，要走微信的注册与审核流程，按顺序做四件事：

1. **注册小程序主体**：在 [mp.weixin.qq.com](https://mp.weixin.qq.com/) 注册，个人主体可选类目少，涉及影视资讯通常要企业主体并做微信认证（300 元/年）。
2. **填 AppID**：注册后把 AppID 填进 `project.config.json` 的 `appid`（或在开发者工具「详情 → 基本信息」里改）。
3. **配置服务器域名**：公众平台「开发管理 → 开发设置 → 服务器域名 → request 合法域名」加上 `https://yinto.top`。
   - 域名必须已 ICP 备案，且证书有效；**没备案的域名绑不上**，这是当前最先要确认的门槛。
   - 每个月只能改 5 次，别拿它做频繁切换。
4. **上传 → 提交审核 → 发布**：开发者工具「上传」后，在公众平台提交审核。类目建议「工具 → 信息查询」；描述写「影视作品信息查询与官方观看渠道导航」，不要写「网盘资源下载」。

## 审核与合规（这块决定能不能上架）

- 小程序里**不提供播放、不存储文件**，只做元数据与官方平台链接，这一点已经是现状。
- **网盘搜索是最容易被拒的点**。稳妥的做法：首发版本先弱化（首页与底部 tab 只留「发现/作品」），审核通过后再把网盘页加回来；或者首版只上「新片 + 官方渠道」。
- 不要做「关注公众号回复关键词领取资源」的引导，这属于诱导关注，轻则删文重则封号。
- 小程序没有调用任何需要用户授权的接口（没有定位、相册、手机号），不需要额外弹隐私授权；后台记录的是随机访客编号与来源 IP，不采集设备信息。

## 两个刻意的设计

- **外链只能复制**：微信不允许小程序直接打开外部网页（`web-view` 需要把域名配成业务域名并放校验文件）。所以详情页的观看渠道、网盘结果都是「复制链接（连提取码一起）」，用户粘到浏览器打开，效果和网页端 `/go/:id/:index` 一致。
- **访客编号走请求头**：小程序没有 Cookie 罐，`utils/api.js` 会给每个请求带 `X-YT-Visitor`（本地持久化的随机 UUID），Worker 在没有 Cookie 时认这个头。这样小程序用户的搜索、浏览、访问不会被后台记成「疑似自动化流量」。
  这项支持已经写进 `worker/index.js`，**需要重新部署 Worker 才生效**（`npm run deploy`）。

## 还没做的

- tabBar 目前只有文字，想要图标就在 `app.json` 的 `tabBar.list` 里补 `iconPath` / `selectedIconPath`（81×81 PNG）。
- 没有登录、收藏、追剧提醒；要做得先有小程序云开发或自己的账号体系。
- 网盘结果没有做本地缓存，切 tab 会重新请求（服务端有缓存，压力不大）。
