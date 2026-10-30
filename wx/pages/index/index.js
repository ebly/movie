"use strict";

const api = require("../../utils/api.js");
const fmt = require("../../utils/format.js");

const KINDS = [
  { id: "latest", label: "最新上架" },
  { id: "hot", label: "本周热门" }
];

/**
 * 发现页：豆瓣公开榜单（只有片名、年份、评分、海报这类元数据）。
 * 榜单条目不在站内目录里，所以点卡片是「拿片名去站内找」或「拿片名去搜网盘」。
 */
Page({
  data: {
    kinds: KINDS,
    kind: "latest",
    items: [],
    loading: true,
    error: "",
    disclaimer: "",
    cached: false
  },

  onLoad() {
    const app = getApp();
    this.lists = {};
    this.setData({ disclaimer: app.globalData.disclaimer });
    app.ensureBootstrap().then(() => {
      this.setData({ disclaimer: getApp().globalData.disclaimer });
    });
    this.fetch(this.data.kind);
  },

  onShow() {
    getApp().track("/");
  },

  onPullDownRefresh() {
    this.lists = {};
    this.fetch(this.data.kind, { force: true }).then(() => wx.stopPullDownRefresh());
  },

  onKind(event) {
    const kind = event.currentTarget.dataset.id;
    if (!kind || kind === this.data.kind) return;
    this.setData({ kind });
    if (this.lists[kind]) {
      this.setData({ items: this.lists[kind], loading: false, error: "" });
      return;
    }
    this.fetch(kind);
  },

  fetch(kind, { force = false } = {}) {
    if (this.lists[kind] && !force) {
      this.setData({ items: this.lists[kind], loading: false, error: "" });
      return Promise.resolve();
    }
    this.setData({ loading: true, error: "" });
    return api.douban({ kind, limit: 12 })
      .then((result) => {
        const items = (result.items || []).map((item) => this.decorate(item));
        this.lists[kind] = items;
        if (this.data.kind !== kind) return;
        this.setData({ items, loading: false, cached: !!result.cached });
      })
      .catch((err) => {
        if (this.data.kind !== kind) return;
        this.setData({ loading: false, error: err.message || "榜单加载失败" });
      });
  },

  decorate(item) {
    return Object.assign({}, item, {
      initial: String(item.title || "").slice(0, 2),
      yearText: item.year ? `${item.year}` : "—",
      ratingText: fmt.ratingText(item.rating),
      meta: [item.year, item.type].filter(Boolean).join(" · "),
      posterStyle: fmt.posterStyle(item.id || item.title, null)
    });
  },

  onPosterError(event) {
    const index = event.currentTarget.dataset.index;
    const patch = {};
    patch[`items[${index}].poster`] = "";
    this.setData(patch);
  },

  onCard(event) {
    const item = this.data.items[event.currentTarget.dataset.index];
    if (!item) return;
    wx.showActionSheet({
      itemList: ["站内查找同名作品", "搜索网盘资源", "复制豆瓣条目链接"],
      success: (res) => {
        if (res.tapIndex === 0) this.goSearch(item.title);
        else if (res.tapIndex === 1) this.goPan(item.title);
        else if (item.url) {
          wx.setClipboardData({ data: item.url, success: () => wx.showToast({ title: "链接已复制", icon: "none" }) });
        }
      },
      fail: () => {}
    });
  },

  goSearch(title) {
    const app = getApp();
    app.globalData.pendingQuery = String(title || "");
    wx.switchTab({ url: "/pages/search/search" });
  },

  goPan(title) {
    const app = getApp();
    app.globalData.pendingPanQuery = String(title || "");
    wx.switchTab({ url: "/pages/pan/pan" });
  },

  onSearchTap() {
    const app = getApp();
    app.globalData.pendingFocus = true;
    wx.switchTab({ url: "/pages/search/search" });
  },

  retry() {
    this.fetch(this.data.kind, { force: true });
  }
});
