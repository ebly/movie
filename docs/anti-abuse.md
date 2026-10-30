# 边缘反爬与滥用防护清单（Cloudflare）

适用对象：`yinto.top`（Worker `yingtu` + D1 `yingtu-db`）。

写这份清单的起因：Cloudflare 访客面板显示 24 小时 262 页面浏览 / 261 次访问，而站内自己的页面信标只记录到 3 个真实访客。边缘统计把爬虫算成了访问量，**PV / 访问 ≈ 1.0 就是机器人流量的典型特征**（真人一次访问通常看好几个页面）。所以第一原则是：数据口径看站内看板，挡流量在边缘挡——站内负责认出来源，边缘负责拦下来。

三层防线各管一段，别互相替代：

| 层 | 位置 | 管什么 | 现状 |
| --- | --- | --- | --- |
| 边缘 | Cloudflare 控制台（本文） | 直接不让垃圾请求到达 Worker，省 10 万次/天额度 | 未配置 |
| 应用 | `worker/index.js` 限流器 | 反馈 5 次/分、网盘搜索 30 次/分、埋点与跳转限频、登录尝试 | 已实现，但是 isolate 内存级，冷启动会重置 |
| 口径 | 后台看板 | 用页面信标 + 来源网络（ASN）区分真人、疑似自动化与机房来源，并给出来源 IP 与国家/城市 | 已实现（真实访客 / 疑似自动化 / 机房来源 / 访问地区 / 访问来源） |

---

## 免费版有多少额度

按 2026 年的公开资料，Free 计划大致是：WAF 自定义规则约 5 条、速率限制规则 1 条、自动部署 Free Managed Ruleset、Bot Fight Mode 一键开启，`ip.geoip.country` 在自定义规则里可用。**这些数字各家资料说法不完全一致（有教程称速率限制要 Pro），以你控制台里实际显示的配额为准。**

下面的规则按性价比排序，配额不够就只做前两条。

---

## 规则 1：把 CMS 扫描直接挡在边缘（最划算）

你的站点是 Worker + 静态资源，根本没有 WordPress / phpMyadmin / `.env` 这些东西，但日志里这类请求占比最高。挡掉它们不影响任何真实用户，纯粹省 Worker 请求数。

Security → WAF → Custom rules → Create rule，动作先选 **Log** 观察一两天，再改 **Block**。

```
http.request.uri.path matches "^/(wp-|xmlrpc\\.php|phpmyadmin|\\.env|\\.git|admin|vendor/|config/)"
```

几点说明：

- `^/(admin)` 这条对 `yinto.top` 是安全的：前台 Worker 早已不挂 `/admin` 路由（smoke 里 "GET /admin 已下线 404" 那条断言就是锁这个的），真正的后台在 `admin.yinto.top`，而这个域名当前整站 404、只在本机 4174 端口访问。
- 如果哪天给后台配了 Cloudflare Access 并把 `admin.yinto.top` 启用，记得这条规则的 Zone 作用域别误伤，或者把 `|admin` 从表达式里去掉。
- 想更省事也可以用下拉菜单：Field 选 `URI Path`，Operator `starts with`，值 `/wp-`，再对 `.env`、`.git` 各加一条——但那样会占掉好几条额度，用一条 `matches` 更划算。

## 规则 2：护住后台登录（用唯一那条速率限制）

后台密码已经换成 `ADMIN_PASSWORD` secret，但公网登录入口一旦被字典命中就是全站失守。Security → Rate limiting rules → Create rule：

- 表达式：`http.request.uri.path eq "/api/admin/login"`
- 计数维度：With the same → `URI path`，Characterized by → `IP src`
- 阈值：5 次 / 10 分钟（真人输错两三次足够了）
- 动作：Block（登录接口不需要质询，超了就直接拒）

注意这条只统计失败与成功一起，如果有人反馈"我明明输对了却 429"，把窗口放宽即可。站内 Worker 还有一层登录限流，两者不冲突：边缘这条能挡住打满 401 的爆破，应用层那条是兜底。

## 规则 3：给网盘搜索接口降载（可选，看受众）

`/api/pan/search` 与 `/api/quark/search` 会去调用上游 PanSou，是最容易被白嫖算力的接口。如果访客基本在国内，可以对非国内 IP 加质询：

```
(http.request.uri.path starts_with "/api/pan/" or http.request.uri.path starts_with "/api/quark/")
and ip.geoip.country ne "CN" and ip.geoip.country ne "HK" and ip.geoip.country ne "MO" and ip.geoip.country ne "TW"
```

动作选 **Managed Challenge**。代价说清楚：如果你确实有海外华人访客，他们会多一次人机验证；国内公司出口 NAT 后面多人共用一个 IP 时，阈值设太紧会互相拖累。所以这条建议先 Log 看一周，确认命中量与来源国再开。

## 规则 4：Bot Fight Mode 与 AI 爬虫开关

Security → Bots → 打开 **Bot Fight Mode**；同一页面里通常还有拦截 AI 训练爬虫的开关（名称可能是 "Block AI bots" / "Restricted AI bots"，以控制台为准）。

局限要知道：Bot Fight Mode 主要对付"已被 Cloudflare 验证过的机器人"，对自写的 `curl` / Python 脚本基本无效——而你这批流量看特征更像后者。所以它是补充，不是主力。

**别顺手开"屏蔽所有疑似机器人"**：这个站靠 Google/Bing 收录带来真实访客，误伤搜索爬虫等于自断流量。前台 `robots.txt` 已经写了 `Disallow: /list` 并给出 Sitemap，保持现状即可。

## 规则 5：Free Managed Ruleset 保持开启

免费版自动部署的托管规则集（覆盖 Log4J、Shellshock、常见 CMS 漏洞利用）保持默认开启，不用调。完整版 Cloudflare Managed Ruleset / OWASP Core Ruleset 要 Pro，你这个站点规模不值得升级。

---

## 上规则之前先做的一件事

后台看板「访问地区」面板下面那行小字（"未执行页面脚本的流量来自：xx N、yy M"）就是为这个准备的：先看清楚疑似自动化的主要来源国，再决定规则 3 的地理阈值要不要开。这个判据是「出现过事件但从未打过页面信标」的匿名编号；「真实访客」在此之上还多剔除了一层机房来源（见下一节），所以两个数字不完全等同。

看板上这些数字只覆盖进了 Worker 的请求；被边缘规则挡掉的那部分在 Security → Events 里看，两边加起来才是全貌。

## 页面信标不够用的那一段：用 ASN 认机房

2026-10-30 的复盘发现，剩下的可疑流量不是「不执行 JS 的 curl」，而是**会执行页面脚本的无头浏览器**：Scaleway 那个地址 3.5 秒内打了 4 次页面信标，另外八个机房 IP 各自正好一次——真人不会这么整齐。所以从这天起事件多存两列 `asn` / `as_org`（Cloudflare 边缘给的 `request.cf.asn` 与 `asOrganization`），看板按 `shared/asn.js` 的名单把机房与代理网段从「真实访客」里剔除：

- 「访问来源」面板里标了「机房 · Scaleway · AS12876」并压暗的行就是它；即使这个来源打过页面信标，也不再算真实来源。
- 「真实访客」卡片的小字会写「已排除 N 个机房来源」，`overview.hostingVisitors` 是同一个数。
- 判定只在看板聚合时做，事件照常入库；名单误判了改 `shared/asn.js` 重算即可，历史数据不用补采。名字里带 fiber / broadband / telecom 的宽带运营商一律放过，避免误伤真人。
- 要把这类流量挡在边缘，可以直接用 ASN：`ip.geoip.asnum in {12876 16509 20473}`（WAF 自定义规则支持），比按国家封精准得多。先在 Log 模式下看命中，确认没误伤再切 Block。

## 不建议做的事

- **别指望存了 IP 就能封住谁**。`events.ip` 现在会落访客的真实来源地址（2026-10-30 起的决定），作用是**认出**「同一个 IP 在反复打接口却从不执行页面脚本」；真要拦，还得把那个地址抄进上面的边缘规则。站内 `clientKey()` 的限流是 isolate 内存级，冷启动就清零，挡不住换连接的脚本。存 IP 同时把隐私侧的账一起接下来：隐私政策要写明采集目的与保留期限，旧事件定期清（`DELETE FROM events WHERE created_at < …`），IP 只从需登录、只跑内网的 `/api/admin/*` 输出。
- **不要用 Cloudflare Web Analytics 代替站内统计**。它是浏览器信标口径、且要往页面注入脚本，而你现在看到的 261 那个数字来自边缘口径，两者混着看只会更糊涂。站内 `/api/track` 已经覆盖同源页面信标，够用。
- **不要一次上多条 Block 规则**。先 Log、看 24–48 小时 Security Events 的命中来源，确认没有误伤真实访客再切 Block/Challenge。每条规则都能单独关掉，出问题就地回滚，不用改代码。

## 验证清单

1. 规则改完，用浏览器正常走一遍：搜索、详情页、平台跳转、提交反馈，确认没有莫名 403/429。
2. 本机 `curl -A "Mozilla/5.0" "https://yinto.top/wp-login.php"` 应该被边缘挡掉（返回 Cloudflare 拦截页而不是 Worker 的 404）。
3. 第二天对比两处数字：Cloudflare Security Events 的拦截计数，和后台看板里"疑似自动化"的数量。前者涨、后者降，说明规则真的挡在了前面。
4. 后台看板的"真实访客"不应该因为上规则而下降；如果降了，说明规则误伤了真人，回到对应规则改 Log 或放宽阈值。
5. 开规则前后各看一次「访问来源」面板：把事件数最高、且整行压暗（标了「机房」或没执行页面脚本）的那个地址或 ASN 填进边缘规则，第二天它应该从看板里消失，只留在 Security Events 的拦截计数里。

Sources:
- [Cloudflare 免费服务使用指南（免费层能力与配额，2026-09）](https://itindex.net/detail/63282-cloudflare-%E5%85%8D%E8%B4%B9-%E6%9C%8D%E5%8A%A1)
- [WAF 入门：免费计划里就有的托管规则与自定义规则表达式（2026-09）](https://m.admin5.com/article/20260911/16702354.shtml)
- [Cloudflare 防火墙规则新手指南：免费版 5 条自定义规则与优先级（2026-05）](https://www.cnblogs.com/jscs/p/20184391)
- [如何在 Cloudflare 配置 WAF 自定义规则拦截特定国家 IP（ip.geoip.country 用法与风险控制，2026-05）](https://www.cnblogs.com/drstx/p/20066525)
- [Cloudflare Docs：Create a rate limiting ruleset in the dashboard（账户级规则集为 Enterprise，Zone 级另计）](https://developers.cloudflare.com/waf/account/rate-limiting-rulesets/create-dashboard/)
