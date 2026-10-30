"use strict";

/**
 * 平台清单：必须与前台项目（../movie/server/data/seed.js）保持一致。
 * 后台只用它把点击事件里的平台编号还原成名称/配色，不含任何片库数据。
 */
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

module.exports = { PROVIDERS };
