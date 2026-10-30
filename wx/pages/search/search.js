"use strict";

const api = require("../../utils/api.js");
const fmt = require("../../utils/format.js");
const store = require("../../utils/store.js");

const TYPES = ["全部", "电影", "剧集"];

/**
 * 站内搜索：查的是随部署打包的目录快照（片名、别名、演员、平台），
 * 与网页端 /api/search 同一个接口、同一套排序。
 */
Page({
  data: {
    q: "",
    types: TYPES,
    type: "全部",
    items: [],
    suggestions: [],
    loading: false,
    error: "",
    searched: false,
    focus: false,
    history: [],
    hot: []
  },

  onLoad() {
    const app = getApp();
    this.setData({ history: store.history(), hot: app.globalData.hot || [] });
    if (!app.globalData.hot) {
      app.ensureBootstrap().then(() => this.setData({ hot: getApp().globalData.hot || [] }));
    }
  },

  onShow() {
    const app = getApp();
    getApp().track("/search");
    if (app.globalData.pendingQuery) {
      const q = fmt.trimQuery(app.globalData.pendingQuery, 60);
      app.globalData.pendingQuery = "";
      this.setData({ q, focus: false });
      this.search();
    } else if (app.globalData.pendingFocus) {
      app.globalData.pendingFocus = false;
      this.setData({ focus: true });
    }
  },

  onInput(event) {
    this.setData({ q: event.detail.value });
  },

  onConfirm() {
    this.search();
  },

  onType(event) {
    const type = event.currentTarget.dataset.type;
    if (!type || type === this.data.type) return;
    this.setData({ type });
    if (this.data.q.trim()) this.search({ keepHistory: true });
  },

  search({ keepHistory = false } = {}) {
    const q = fmt.trimQuery(this.data.q, 60);
    if (!q) {
      this.setData({ items: [], suggestions: [], searched: false, error: "" });
      return Promise.resolve();
    }
    const type = this.data.type;
    this.setData({ loading: true, error: "", searched: true, q });
    return api.search({ q, type, limit: 30 })
      .then((result) => {
        const items = (result.items || []).map((item) => this.decorate(item));
        const suggestions = (result.suggestions || []).map((item) => this.decorate(item));
        const patch = { items, suggestions, loading: false };
        if (!keepHistory) patch.history = store.pushHistory(q);
        this.setData(patch);
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message || "搜索失败" });
      });
  },

  decorate(item) {
    return Object.assign({}, item, {
      initial: String(item.title || "").slice(0, 1),
      ratingText: fmt.ratingText(item.rating),
      meta: fmt.metaLine(item),
      posterStyle: fmt.posterStyle(item.id || item.title, item.art),
      genreText: (item.genres || []).slice(0, 3).join(" / "),
      offerCount: item.offerCount || 0,
      verifiedCount: item.verifiedCount || 0,
      synopsis: fmt.clip(item.synopsis, 70)
    });
  },

  onPosterError(event) {
    const { index, section } = event.currentTarget.dataset;
    const patch = {};
    patch[`${section}[${index}].poster`] = "";
    this.setData(patch);
  },

  openDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` });
  },

  panFor(event) {
    const title = event.currentTarget.dataset.title || this.data.q;
    const app = getApp();
    app.globalData.pendingPanQuery = fmt.trimQuery(title, 60);
    wx.switchTab({ url: "/pages/pan/pan" });
  },

  useHistory(event) {
    const q = event.currentTarget.dataset.q;
    if (!q) return;
    this.setData({ q, focus: false });
    this.search();
  },

  clearHistory() {
    store.clearHistory();
    this.setData({ history: [] });
  },

  clearInput() {
    this.setData({ q: "", items: [], suggestions: [], searched: false, error: "" });
  },

  retry() {
    this.search({ keepHistory: true });
  }
});
