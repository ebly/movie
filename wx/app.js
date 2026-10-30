"use strict";

const api = require("./utils/api.js");
const store = require("./utils/store.js");

/**
 * 全局只做三件事：
 * 1. 拉一次 /api/bootstrap（品牌名、平台名、免责声明），缓存一天；
 * 2. 给页面提供「待处理搜索词」，解决 tabBar 页面之间不能带参数的问题；
 * 3. 统一发页面信标（/api/track），让后台的访问量与真实访客口径覆盖小程序。
 */
App({
  globalData: {
    brand: null,
    providers: {},
    hot: [],
    disclaimer: "",
    /* 首页点卡片 → 搜索页消费；详情页点「搜网盘」→ 网盘页消费 */
    pendingQuery: "",
    pendingPanQuery: ""
  },

  onLaunch() {
    this.ensureBootstrap();
  },

  ensureBootstrap() {
    if (this._bootstrapTask) return this._bootstrapTask;
    const cached = store.readBootstrap();
    if (cached) this.applyBootstrap(cached);
    this._bootstrapTask = api.bootstrap()
      .then((data) => {
        store.writeBootstrap(data);
        this.applyBootstrap(data);
        return data;
      })
      .catch((err) => {
        // 缓存可用就继续用缓存；一次失败不值得打断页面。
        this._bootstrapTask = null;
        if (!cached) console.warn("[yingtu] bootstrap 失败", err);
        return null;
      });
    return this._bootstrapTask;
  },

  applyBootstrap(data) {
    if (!data) return;
    this.globalData.brand = data.brand || null;
    this.globalData.providers = data.providers || {};
    this.globalData.hot = Array.isArray(data.hot) ? data.hot : [];
    this.globalData.disclaimer = data.disclaimer || (data.brand && data.brand.disclaimer) || "";
  },

  provider(pid) {
    const entry = this.globalData.providers[pid];
    return {
      id: pid,
      name: (entry && entry.name) || pid || "平台",
      short: (entry && entry.short) || "",
      color: (entry && entry.color) || "#5f6662",
      region: (entry && entry.region) || ""
    };
  },

  track(path) {
    api.track(path, "zh").catch(() => {});
  }
});
