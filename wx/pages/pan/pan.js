"use strict";

const api = require("../../utils/api.js");
const fmt = require("../../utils/format.js");

const TYPES = [
  { id: "quark", label: "夸克" },
  { id: "baidu", label: "百度" },
  { id: "xunlei", label: "迅雷" },
  { id: "aliyun", label: "阿里云盘" }
];

const PAGE_SIZE = 20;

/**
 * 网盘公开分享搜索：直连 /api/pan/search（背后是 PanSou），只展示已接入来源里的公开链接。
 * 小程序打不开外部网页，所以每条结果给的是「复制链接」，提取码一起带上。
 */
Page({
  data: {
    q: "",
    type: "quark",
    types: TYPES,
    items: [],
    total: 0,
    loading: false,
    loadingMore: false,
    error: "",
    searched: false,
    hasMore: false,
    tookMs: 0,
    hot: []
  },

  onLoad() {
    const app = getApp();
    this.offset = 0;
    this.setData({ hot: (app.globalData.hot || []).slice(0, 8) });
    if (!app.globalData.hot || !app.globalData.hot.length) {
      app.ensureBootstrap().then(() => this.setData({ hot: (getApp().globalData.hot || []).slice(0, 8) }));
    }
  },

  onShow() {
    const app = getApp();
    getApp().track("/list");
    if (app.globalData.pendingPanQuery) {
      const q = fmt.trimQuery(app.globalData.pendingPanQuery, 60);
      app.globalData.pendingPanQuery = "";
      this.setData({ q });
      this.search({ reset: true });
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) this.search({ reset: false });
  },

  onMoreTap() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) this.search({ reset: false });
  },

  onInput(event) {
    this.setData({ q: event.detail.value });
  },

  onConfirm() {
    this.search({ reset: true });
  },

  onType(event) {
    const type = event.currentTarget.dataset.type;
    if (!type || type === this.data.type) return;
    this.setData({ type });
    if (this.data.q.trim()) this.search({ reset: true });
  },

  useHot(event) {
    const q = event.currentTarget.dataset.title;
    if (!q) return;
    this.setData({ q });
    this.search({ reset: true });
  },

  clearInput() {
    this.offset = 0;
    this.setData({ q: "", items: [], total: 0, searched: false, error: "", hasMore: false });
  },

  search({ reset = true, reload = 0 } = {}) {
    const q = fmt.trimQuery(this.data.q, 60);
    if (!q) {
      this.setData({ items: [], total: 0, searched: false, error: "", hasMore: false });
      return Promise.resolve();
    }
    if (this._busy) return Promise.resolve();
    this._busy = true;

    const type = this.data.type;
    const offset = reset ? 0 : this.offset;
    this.setData(reset
      ? { loading: true, error: "", searched: true, q }
      : { loadingMore: true, error: "" });

    return api.pan({ q, type, offset, limit: PAGE_SIZE, reload })
      .then((result) => {
        const rows = (result.items || []).map((item) => this.decorate(item));
        const items = reset ? rows : this.data.items.concat(rows);
        this.offset = offset + rows.length;
        this.setData({
          items,
          total: Number(result.total) || items.length,
          hasMore: !!result.hasMore,
          tookMs: Number(result.tookMs) || 0,
          loading: false,
          loadingMore: false
        });
      })
      .catch((err) => {
        this.setData({ loading: false, loadingMore: false, error: err.message || "搜索失败" });
      })
      .then(() => {
        this._busy = false;
      });
  },

  decorate(item) {
    return Object.assign({}, item, {
      typeLabel: fmt.panTypeLabel(item.type),
      timeText: fmt.relTime(item.datetime),
      sourceText: (item.sources || [])
        .map((source) => String(source).replace(/^plugin:/, ""))
        .slice(0, 3)
        .join(" / "),
      copyText: fmt.panCopyText(item)
    });
  },

  copyItem(event) {
    const index = event.currentTarget.dataset.index;
    const item = this.data.items[index];
    if (!item || !item.copyText) return;
    wx.setClipboardData({
      data: item.copyText,
      success: () => wx.showToast({ title: "链接已复制，去浏览器打开", icon: "none" })
    });
  },

  reload() {
    if (!this.data.q) return;
    this.search({ reset: true, reload: 1 }).then(() => {
      if (!this.data.error) wx.showToast({ title: "已重新获取", icon: "none" });
    });
  },

  retry() {
    this.search({ reset: true });
  }
});
