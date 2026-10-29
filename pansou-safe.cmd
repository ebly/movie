@echo off
REM PanSou 安全启动：只启用网盘/影视资源类插件，排除 BT/磁力/社交抓取。
REM 说明：前台 shared/pansou.js 已把结果限定为 quark/baidu/xunlei/aliyun 四种网盘，
REM       这里排除的是「会被请求但不产出可用结果」的源，减少请求数与被源站封 IP 的风险。
REM 被排除：nyaa / thepiratebay（BT）、weibo（微博）、qqpd（QQ频道）、
REM          xb6v（6v电影磁力站）、rrbt（BT）、btbtlb（BT）
REM 未编译进来（无需排除）：javdb、wuji、mikuclub、pianku、jupansou、qupanshe、erxiao

set ENABLED_PLUGINS=diduan,jutoushe,labi,libvio,lou1,susu,wanou,zhizhen,488run,aipan,clxiong,djgou,duoduo,dyyj,dyyjpro,erxiaopan,haitunsou,hdmoli,huban,jsnoteclub,lingjisp,meitizy,miosou,muou,nsgame,ouge,quarkres,quarktv,shandian,ting77,woniu,xiaokupan,yunsou,5266ys,buerchen,cldi,clmao,cyg,duanjuw,dy4k,dygang,feikuai,gaoqing888,gying,hjzhencai,hunhepan,ikantv,kkv,kpkuang,leso,melost,pan365,panlian,pansearch,qiwei,quark4k,quarksoo,sopanya,sousou,xdpan,xiaoyu,xiaozhang,yingso,yulinshufa,yunso,zlxapp,zxzj,u3c3
set PANSOU_EXECUTABLE=%~dp0pansou-main\pansou.exe
set PANSOU_PORT=8888

cd /d "%~dp0"
node scripts\start-pansou.mjs
