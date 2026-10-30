"use strict";

const api = require("../../utils/api.js");
const fmt = require("../../utils/format.js");

/**
 * 作品详情：目录里的一条记录 + 各平台观看入口。
 * 小程序打不开外部网页（除非配业务域名），所以渠道这里是「复制链接」，
 * 用户粘到浏览器里打开，跟网页端 /go/:id/:index 的结果一致。
 */
Page({
  data: {
    id: "",
    item: null,
    offers: [],
    related: [],
    loading: true,
    error: "",
    heroStyle: "",
    ratingText: "",
    meta: "",
    disclaimer: ""
  },

  onLoad(options) {
    const id = options && options.id ? decodeURIComponent(options.id) : "";
    this.setData({ id, disclaimer: getApp().globalData.disclaimer });
    if (!id) {
      this.setData({ loading: false, error: "缺少作品编号" });
      return;
    }
    getApp().ensureBootstrap().then(() => {
      this.setData({ disclaimer: getApp().globalData.disclaimer });
      if (this.data.item) this.applyProviders(this.data.item, this._related || []);
    });
    this.fetch(id);
  },

  onShow() {
    getApp().track("/title");
  },

  fetch(id) {
    this.setData({ loading: true, error: "" });
    return api.title(id)
      .then((payload) => {
        const item = payload.item || {};
        this._related = payload.related || [];
        this.setData({
          item: this.decorate(item),
          heroStyle: fmt.posterStyle(item.id || item.title, item.art),
          ratingText: fmt.ratingText(item.rating),
          meta: fmt.metaLine(item),
          related: this._related.map((entry) => this.decorate(entry)),
          loading: false
        });
        this.applyProviders(item, this._related);
        wx.setNavigationBarTitle({ title: item.title || "作品详情" });
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message || "作品加载失败" });
      });
  },

  decorate(item) {
    return Object.assign({}, item, {
      initial: String(item.title || "").slice(0, 1),
      ratingText: fmt.ratingText(item.rating),
      meta: fmt.metaLine(item),
      posterStyle: fmt.posterStyle(item.id || item.title, item.art),
      genreText: (item.genres || []).join(" / ")
    });
  },

  applyProviders(item, related) {
    const app = getApp();
    const offers = (item.offers || []).map((offer, index) => {
      const provider = app.provider(offer.pid);
      return Object.assign({}, offer, {
        key: `${offer.pid || "offer"}-${index}`,
        providerName: provider.name,
        providerShort: provider.short || provider.name.slice(0, 2),
        providerColor: provider.color,
        providerRegion: provider.region,
        qualityText: (offer.quality || []).join(" · "),
        seasonText: offer.season ? `第 ${offer.season} 季` : ""
      });
    });
    const patch = { offers };
    if (related && related.length) {
      patch.related = related.map((entry) => {
        const decorated = this.decorate(entry);
        return decorated;
      });
    }
    this.setData(patch);
  },

  copyOffer(event) {
    const index = event.currentTarget.dataset.index;
    const offer = this.data.offers[index];
    if (!offer || !offer.url) return;
    wx.setClipboardData({
      data: offer.url,
      success: () => wx.showToast({ title: "链接已复制，去浏览器打开", icon: "none" })
    });
  },

  copyText(event) {
    const text = event.currentTarget.dataset.text;
    if (!text) return;
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: "已复制", icon: "none" }) });
  },

  panFor() {
    const title = (this.data.item && this.data.item.title) || "";
    if (!title) return;
    const app = getApp();
    app.globalData.pendingPanQuery = title;
    wx.switchTab({ url: "/pages/pan/pan" });
  },

  openRelated(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` });
  },

  retry() {
    if (this.data.id) this.fetch(this.data.id);
  },

  onShareAppMessage() {
    const item = this.data.item;
    return {
      title: item ? `${item.title} · 映途` : "映途 · 影视索引",
      path: `/pages/detail/detail?id=${encodeURIComponent(this.data.id)}`
    };
  }
});
