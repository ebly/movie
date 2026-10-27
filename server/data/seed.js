/*
 * 映途演示片库（demo dataset）.
 * Titles are real works; ratings, availability, prices and offers are demo data.
 * This project only indexes legal streaming services. It never stores media files
 * or cloud-drive sharing links.
 */
"use strict";

const PROVIDERS = {
  netflix:  { name: "Netflix",     short: "N",   color: "#e50914", fg: "#fff",     region: "海外",     search: "https://www.netflix.com/search?q=" },
  max:      { name: "Max",         short: "M",   color: "#5c2d91", fg: "#fff",     region: "海外",     search: "https://play.max.com/search?q=" },
  appletv:  { name: "Apple TV+",   short: "tv+", color: "#1c1c1e", fg: "#fff",     region: "海外",     search: "https://tv.apple.com/search?term=" },
  prime:    { name: "Prime Video", short: "P",   color: "#00a8e1", fg: "#fff",     region: "海外",     search: "https://www.amazon.com/s?k=" },
  disney:   { name: "Disney+",     short: "D+",  color: "#113ccf", fg: "#fff",     region: "海外",     search: "https://www.disneyplus.com/search?q=" },
  hulu:     { name: "Hulu",        short: "H",   color: "#1ce783", fg: "#0d2a2e", region: "海外",     search: "https://www.hulu.com/search?q=" },
  peacock:  { name: "Peacock",     short: "Pc",  color: "#f5c518", fg: "#0d2a2e", region: "海外",     search: "https://www.peacocktv.com/search?q=" },
  bbc:      { name: "BBC iPlayer", short: "BBC", color: "#f54997", fg: "#fff",     region: "海外",     search: "https://www.bbc.co.uk/iplayer/search?q=" },
  tencent:  { name: "腾讯视频",     short: "腾",  color: "#ff6a00", fg: "#fff",     region: "中国大陆", search: "https://v.qq.com/x/search/?q=" },
  iqiyi:    { name: "爱奇艺",       short: "爱",  color: "#00be06", fg: "#fff",     region: "中国大陆", search: "https://so.iqiyi.com/so/q_" },
  youku:    { name: "优酷",         short: "优",  color: "#ff4d00", fg: "#fff",     region: "中国大陆", search: "https://so.youku.com/search_video/q_" },
  bilibili: { name: "Bilibili",    short: "B",   color: "#00a1d6", fg: "#fff",     region: "中国大陆", search: "https://search.bilibili.com/all?keyword=" }
};

const offer = (pid, tier, season, quality, price, verified) => ({ pid, tier, season, quality, price, verified });

const DATA = [
  {
    id: "severance",
    title: "人生切割术",
    original: "Severance",
    year: 2022,
    type: "剧集",
    rating: 8.7,
    seasons: 2,
    runtime: null,
    genres: ["科幻", "悬疑", "剧情"],
    synopsis: "一家公司用手术把工作记忆与生活记忆切开。新同事的到来，让这条界线第一次出现裂缝。",
    aliases: ["离职", "切断"],
    tags: ["职场", "记忆", "公司"],
    hot: true,
    art: { p1: "#dfeae3", p2: "#8faeaa", p3: "#2f5f5a", ink: "#102a2c", motif: "orbit" },
    offers: [
      offer("appletv", "订阅", "S02", ["4K", "HDR", "中字"], "含在订阅", true),
      offer("appletv", "订阅", "S01", ["4K", "中字"], "含在订阅", true),
      offer("prime", "订阅", "S02", ["1080P"], "含在订阅", false),
      offer("appletv", "购买", "S01", ["4K"], "¥168", false)
    ]
  },
  {
    id: "thebear",
    title: "熊家餐厅",
    original: "The Bear",
    year: 2022,
    type: "剧集",
    rating: 8.6,
    seasons: 3,
    runtime: null,
    genres: ["剧情", "喜剧", "美食"],
    synopsis: "米其林厨师回到芝加哥，接手哥哥留下的三明治店。他要修的不只是厨房，还有一个散掉的家。",
    aliases: ["熊家餐馆", "餐厅"],
    tags: ["厨房", "芝加哥", "家庭"],
    hot: true,
    art: { p1: "#f2ddc9", p2: "#d08a63", p3: "#8c3327", ink: "#2b1611", motif: "plate" },
    offers: [
      offer("disney", "订阅", "S03", ["4K", "中字"], "含在订阅", true),
      offer("hulu", "订阅", "S03", ["1080P", "中字"], "含在订阅", true),
      offer("disney", "订阅", "S02", ["1080P"], "含在订阅", true),
      offer("prime", "租赁", "S03", ["4K"], "¥15 / 集", false)
    ]
  },
  {
    id: "hotd",
    title: "龙之家族",
    original: "House of the Dragon",
    year: 2022,
    type: "剧集",
    rating: 8.4,
    seasons: 3,
    runtime: null,
    genres: ["奇幻", "剧情"],
    synopsis: "坦格利安王朝最鼎盛的时候，一次继承安排让家族分成两派。龙很多，耐心很少。",
    aliases: ["龙族", "权力的游戏前传"],
    tags: ["维斯特洛", "坦格利安", "龙"],
    hot: true,
    art: { p1: "#2a2420", p2: "#0a0908", p3: "#c25434", ink: "#f4eadb", motif: "ember" },
    offers: [
      offer("max", "订阅", "S03", ["4K", "HDR", "中字"], "含在订阅", true),
      offer("max", "订阅", "S02", ["4K", "中字"], "含在订阅", true),
      offer("max", "订阅", "S01", ["1080P", "中字"], "含在订阅", true),
      offer("prime", "租赁", "S03", ["4K"], "¥25 / 集", false)
    ]
  },
  {
    id: "got",
    title: "权力的游戏",
    original: "Game of Thrones",
    year: 2011,
    type: "剧集",
    rating: 8.5,
    seasons: 8,
    runtime: null,
    genres: ["奇幻", "剧情"],
    synopsis: "七个家族为一张铁王座明争暗斗，北方的长城外，还有更古老的东西正在醒来。",
    aliases: ["权游", "冰与火之歌"],
    tags: ["龙之家族", "维斯特洛", "坦格利安", "龙", "权谋"],
    hot: false,
    art: { p1: "#2b2a26", p2: "#0c0c0b", p3: "#b9975b", ink: "#efe8d8", motif: "blades" },
    offers: [
      offer("max", "订阅", "S08", ["4K", "HDR", "中字"], "含在订阅", true),
      offer("max", "订阅", "S01", ["1080P"], "含在订阅", true),
      offer("prime", "租赁", "S08", ["1080P"], "¥18 / 集", false)
    ]
  },
  {
    id: "fallout",
    title: "辐射",
    original: "Fallout",
    year: 2024,
    type: "剧集",
    rating: 8.3,
    seasons: 1,
    runtime: null,
    genres: ["科幻", "冒险", "废土"],
    synopsis: "末日两百年后，避难所居民第一次走上地表。废土上的规矩，和手册里写的不太一样。",
    aliases: ["异尘余生"],
    tags: ["末日", "避难所", "废土"],
    hot: true,
    art: { p1: "#e8d49a", p2: "#c9a13e", p3: "#1f4d4a", ink: "#1e2b26", motif: "vault" },
    offers: [
      offer("prime", "订阅", "S01", ["4K", "HDR", "中字"], "含在订阅", true),
      offer("prime", "订阅", "S01", ["1080P"], "含在订阅", true),
      offer("appletv", "购买", "S01", ["4K"], "¥198", false)
    ]
  },
  {
    id: "stranger",
    title: "怪奇物语",
    original: "Stranger Things",
    year: 2016,
    type: "剧集",
    rating: 8.6,
    seasons: 4,
    runtime: null,
    genres: ["科幻", "恐怖", "悬疑"],
    synopsis: "小镇男孩失踪后，三个朋友在树林里遇到一个会念力的女孩。镇上的灯，开始不按常理闪烁。",
    aliases: ["奇怪的事"],
    tags: ["霍金斯", "颠倒世界", "80年代"],
    hot: true,
    art: { p1: "#1a0f14", p2: "#050506", p3: "#d23b32", ink: "#f2e8dc", motif: "neon" },
    offers: [
      offer("netflix", "订阅", "S04", ["4K", "HDR", "中字"], "含在订阅", true),
      offer("netflix", "订阅", "S03", ["4K"], "含在订阅", true),
      offer("netflix", "订阅", "S01", ["1080P"], "含在订阅", true),
      offer("netflix", "订阅", "S04", ["1080P"], "含在订阅", false)
    ]
  },
  {
    id: "shogun",
    title: "幕府将军",
    original: "Shōgun",
    year: 2024,
    type: "剧集",
    rating: 8.7,
    seasons: 1,
    runtime: null,
    genres: ["历史", "剧情"],
    synopsis: "一艘欧洲船搁浅在日本海岸，领航员被迫卷入大名的权力棋局。在这里，活下去比航行更难。",
    aliases: ["将军", "幕府"],
    tags: ["日本", "武士", "权谋"],
    hot: false,
    art: { p1: "#232823", p2: "#0a0c0b", p3: "#c9a227", ink: "#f4efe2", motif: "sun" },
    offers: [
      offer("disney", "订阅", "S01", ["4K", "HDR", "中字"], "含在订阅", true),
      offer("hulu", "订阅", "S01", ["1080P"], "含在订阅", true),
      offer("prime", "购买", "S01", ["4K"], "¥158", false)
    ]
  },
  {
    id: "succession",
    title: "继承之战",
    original: "Succession",
    year: 2018,
    type: "剧集",
    rating: 8.9,
    seasons: 4,
    runtime: null,
    genres: ["剧情", "家族"],
    synopsis: "传媒帝国的掌权者迟迟不肯退场，四个孩子围着一把椅子互相拆台。没人真的想接班，只是都不想输。",
    aliases: ["继承", "继承大战"],
    tags: ["传媒", "权谋", "豪门"],
    hot: false,
    art: { p1: "#1b2a33", p2: "#0b1418", p3: "#b9975b", ink: "#eee6d4", motif: "arch" },
    offers: [
      offer("max", "订阅", "S04", ["4K", "HDR", "中字"], "含在订阅", true),
      offer("max", "订阅", "S01", ["1080P"], "含在订阅", true),
      offer("prime", "租赁", "S04", ["1080P"], "¥18 / 集", false),
      offer("tencent", "订阅", "S04", ["1080P", "中字"], "VIP 可看", false)
    ]
  },
  {
    id: "tlou",
    title: "最后生还者",
    original: "The Last of Us",
    year: 2023,
    type: "剧集",
    rating: 8.7,
    seasons: 2,
    runtime: null,
    genres: ["末日", "剧情", "冒险"],
    synopsis: "文明崩塌二十年后，一个走私犯护送免疫少女穿越美国。他们要找的不是解药，是能继续走下去的理由。",
    aliases: ["美国末日"],
    tags: ["真菌", "末日", "公路"],
    hot: false,
    art: { p1: "#66735a", p2: "#26301f", p3: "#d9c68a", ink: "#f0ead6", motif: "ruins" },
    offers: [
      offer("max", "订阅", "S02", ["4K", "HDR", "中字"], "含在订阅", true),
      offer("max", "订阅", "S01", ["4K", "中字"], "含在订阅", true),
      offer("prime", "租赁", "S02", ["4K"], "¥25 / 集", false),
      offer("iqiyi", "订阅", "S01", ["1080P", "中字"], "VIP 可看", false)
    ]
  },
  {
    id: "dark",
    title: "暗黑",
    original: "Dark",
    year: 2017,
    type: "剧集",
    rating: 8.4,
    seasons: 3,
    runtime: null,
    genres: ["悬疑", "科幻"],
    synopsis: "德国小镇接连有孩子失踪，四个家庭的秘密沿着洞穴里的时间线缠在一起。",
    aliases: ["暗"],
    tags: ["时间旅行", "小镇", "洞穴"],
    hot: false,
    art: { p1: "#14312f", p2: "#061211", p3: "#7fb0a5", ink: "#e6efe9", motif: "cave" },
    offers: [
      offer("netflix", "订阅", "S03", ["4K", "HDR", "中字"], "含在订阅", true),
      offer("netflix", "订阅", "S02", ["1080P"], "含在订阅", true),
      offer("netflix", "订阅", "S01", ["1080P"], "含在订阅", true)
    ]
  },
  {
    id: "fleabag",
    title: "伦敦生活",
    original: "Fleabag",
    year: 2016,
    type: "剧集",
    rating: 8.7,
    seasons: 2,
    runtime: null,
    genres: ["喜剧", "剧情"],
    synopsis: "她守着一家快倒闭的咖啡馆，对镜头说笑话，也把身边的人一个个推开。",
    aliases: ["伦敦生活"],
    tags: ["英剧", "咖啡馆", "第四面墙"],
    hot: false,
    art: { p1: "#f4e3dc", p2: "#d9a99c", p3: "#8e3b34", ink: "#2a1917", motif: "bust" },
    offers: [
      offer("prime", "订阅", "S02", ["1080P", "中字"], "含在订阅", true),
      offer("bbc", "免费", "S01", ["1080P", "中字"], "免费 · 需英国 IP", true),
      offer("prime", "租赁", "S02", ["1080P"], "¥12 / 集", false)
    ]
  },
  {
    id: "dune2",
    title: "沙丘2",
    original: "Dune: Part Two",
    year: 2024,
    type: "电影",
    rating: 8.5,
    seasons: null,
    runtime: "2 小时 46 分",
    genres: ["科幻", "史诗"],
    synopsis: "保罗与弗雷曼人并肩，在沙暴、预言和复仇之间，走向一场他无法拒绝的战争。",
    aliases: ["沙丘：第二部", "沙丘 2"],
    tags: ["厄拉科斯", "弗雷曼", "沙虫"],
    hot: false,
    art: { p1: "#e7c795", p2: "#b7763c", p3: "#5b2a17", ink: "#2a180c", motif: "dune", title: "沙丘" },
    offers: [
      offer("max", "订阅", null, ["4K", "HDR", "中字"], "含在订阅", true),
      offer("prime", "租赁", null, ["4K", "中字"], "¥25", true),
      offer("appletv", "购买", null, ["4K"], "¥128", false),
      offer("tencent", "订阅", null, ["1080P", "中字"], "VIP 可看", false)
    ]
  },
  {
    id: "oppenheimer",
    title: "奥本海默",
    original: "Oppenheimer",
    year: 2023,
    type: "电影",
    rating: 8.1,
    seasons: null,
    runtime: "3 小时",
    genres: ["传记", "历史"],
    synopsis: "一个人点燃了世界，然后用余生听那声回响。",
    aliases: ["奥本海默传"],
    tags: ["原子弹", "曼哈顿计划", "诺兰"],
    hot: false,
    art: { p1: "#1a1917", p2: "#0a0a09", p3: "#d96b2a", ink: "#f0e8d8", motif: "flash" },
    offers: [
      offer("peacock", "订阅", null, ["4K", "中字"], "含在订阅", true),
      offer("prime", "租赁", null, ["4K"], "¥25", true),
      offer("appletv", "购买", null, ["4K"], "¥148", false),
      offer("youku", "订阅", null, ["1080P", "中字"], "VIP 可看", false)
    ]
  },
  {
    id: "spider",
    title: "蜘蛛侠：纵横宇宙",
    original: "Spider-Man: Across the Spider-Verse",
    year: 2023,
    type: "动画",
    rating: 8.6,
    seasons: null,
    runtime: "2 小时 20 分",
    genres: ["动画", "冒险"],
    synopsis: "迈尔斯穿越多重宇宙，发现每个英雄的故事里，都有一页不许改写的剧本。",
    aliases: ["蜘蛛侠：平行宇宙 2", "纵横宇宙"],
    tags: ["迈尔斯", "多重宇宙", "格温"],
    hot: false,
    art: { p1: "#2b1a45", p2: "#101a3a", p3: "#e0467d", p4: "#37d0d6", ink: "#f6e9f3", motif: "multiverse", title: "蜘蛛侠" },
    offers: [
      offer("netflix", "订阅", null, ["4K", "HDR", "中字"], "含在订阅", true),
      offer("prime", "租赁", null, ["4K"], "¥25", true),
      offer("appletv", "购买", null, ["4K"], "¥128", false),
      offer("bilibili", "订阅", null, ["1080P", "中字"], "大会员", false)
    ]
  },
  {
    id: "planet",
    title: "地球脉动 II",
    original: "Planet Earth II",
    year: 2016,
    type: "纪录片",
    rating: 9.5,
    seasons: null,
    runtime: "50 分钟 / 集",
    genres: ["纪录", "自然"],
    synopsis: "从孤岛到城市，镜头贴近地球的呼吸，记录动物如何在人类的世界里继续生活。",
    aliases: ["行星地球 2", "地球脉动2"],
    tags: ["自然", "BBC", "动物"],
    hot: false,
    art: { p1: "#0f2a3a", p2: "#06131c", p3: "#5fa88e", ink: "#e8f1ea", motif: "earth" },
    offers: [
      offer("bbc", "免费", null, ["4K", "中字"], "免费 · 需英国 IP", true),
      offer("max", "订阅", null, ["4K", "HDR", "中字"], "含在订阅", true),
      offer("iqiyi", "订阅", null, ["1080P", "中字"], "VIP 可看", false),
      offer("bilibili", "订阅", null, ["1080P", "中字"], "大会员", false)
    ]
  },
  {
    id: "chernobyl",
    title: "切尔诺贝利",
    original: "Chernobyl",
    year: 2019,
    type: "剧集",
    rating: 9.3,
    seasons: 1,
    runtime: null,
    genres: ["历史", "灾难"],
    synopsis: "反应堆爆炸后的最初几小时，谎言比辐射扩散得更快。",
    aliases: ["切尔诺贝尔"],
    tags: ["核事故", "苏联", "灾难"],
    hot: false,
    art: { p1: "#4a544c", p2: "#20261f", p3: "#d08a3e", ink: "#efe9da", motif: "reactor" },
    offers: [
      offer("max", "订阅", "S01", ["4K", "HDR", "中字"], "含在订阅", true),
      offer("prime", "租赁", "S01", ["1080P"], "¥18 / 集", false),
      offer("tencent", "订阅", "S01", ["1080P", "中字"], "VIP 可看", false)
    ]
  }
];

const HOT_IDS = ["hotd", "severance", "thebear", "fallout", "stranger"];

module.exports = { PROVIDERS, DATA, HOT_IDS };
