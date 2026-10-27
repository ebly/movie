"use strict";

const { norm, scoreItem } = require("../shared/search.js");

const TYPES = ["剧集", "电影", "动画", "纪录片"];
const QUALITY_ORDER = ["4K", "HDR", "1080P"];
const DEFAULT_LIMIT = 50;

function seasonNumber(season) {
  const match = /^S(\d+)$/i.exec(season || "");
  return match ? Number(match[1]) : 0;
}

function createStore({ providers, repository }) {
  const all = () => repository.all();
  const getById = (id) => repository.get(id);

  function providerURL(offerItem, item) {
    const provider = providers[offerItem.pid];
    if (!provider) return "#";
    const term = provider.region === "中国大陆" ? item.title : item.original;
    return provider.search + encodeURIComponent(term);
  }

  function summarize(item) {
    const verifiedCount = item.offers.filter((offerItem) => offerItem.verified).length;
    return {
      id: item.id,
      title: item.title,
      original: item.original,
      year: item.year,
      type: item.type,
      rating: item.rating,
      seasons: item.seasons,
      runtime: item.runtime,
      genres: item.genres,
      synopsis: item.synopsis,
      aliases: item.aliases || [],
      tags: item.tags || [],
      hot: Boolean(item.hot),
      poster: item.poster || null,
      art: item.art,
      offerCount: item.offers.length,
      verifiedCount
    };
  }

  function rank(q) {
    if (!q) {
      return all().slice().sort((a, b) => b.rating - a.rating);
    }
    return all()
      .map((item) => ({ item, score: scoreItem(item, q) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.item.rating - a.item.rating)
      .map((entry) => entry.item);
  }

  function hotPool() {
    const items = all();
    const featured = items
      .filter((item) => item.hot)
      .sort((a, b) => b.rating - a.rating);
    return featured.length ? featured : items.slice().sort((a, b) => b.rating - a.rating).slice(0, 5);
  }

  function search({ q = "", type = "全部", limit = DEFAULT_LIMIT } = {}) {
    const query = String(q || "").trim().slice(0, 80);
    const cleanType = TYPES.includes(type) ? type : "全部";
    const max = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 100);
    const matched = rank(norm(query));
    const matchedTypes = TYPES.filter((entry) => matched.some((item) => item.type === entry));
    const effectiveType = cleanType === "全部" || matchedTypes.includes(cleanType) ? cleanType : "全部";
    const filtered = effectiveType === "全部" ? matched : matched.filter((item) => item.type === effectiveType);
    const visibleIds = new Set(filtered.slice(0, max).map((item) => item.id));

    return {
      query,
      type: effectiveType,
      total: filtered.length,
      matchedTotal: matched.length,
      matchedTypes,
      items: filtered.slice(0, max).map(summarize),
      suggestions: hotPool()
        .filter((item) => !visibleIds.has(item.id))
        .slice(0, 3)
        .map(summarize)
    };
  }

  function related(item) {
    return all()
      .filter((candidate) => candidate.id !== item.id)
      .map((candidate) => {
        const genreOverlap = (candidate.genres || []).filter((genre) => (item.genres || []).includes(genre)).length;
        const tagOverlap = (candidate.tags || []).filter((tag) => (item.tags || []).includes(tag)).length;
        const typeBonus = candidate.type === item.type ? 3 : 0;
        return {
          candidate,
          score: genreOverlap * 10 + tagOverlap * 4 + typeBonus + candidate.rating / 10
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => summarize(entry.candidate));
  }

  function decorateOffer(item, offerItem, index) {
    return {
      ...offerItem,
      url: providerURL(offerItem, item),
      clickUrl: `/go/${encodeURIComponent(item.id)}/${index}`
    };
  }

  function getTitle(id) {
    const item = getById(id);
    if (!item) return null;
    return {
      item: {
        ...item,
        aliases: item.aliases || [],
        tags: item.tags || [],
        offers: item.offers.map((offerItem, index) => decorateOffer(item, offerItem, index))
      },
      related: related(item)
    };
  }

  function offerOptions(item) {
    const seasons = [...new Set(item.offers.map((offerItem) => offerItem.season).filter(Boolean))]
      .sort((a, b) => seasonNumber(b) - seasonNumber(a));
    const regions = [...new Set(item.offers.map((offerItem) => providers[offerItem.pid] && providers[offerItem.pid].region).filter(Boolean))];
    const tiers = [...new Set(item.offers.map((offerItem) => offerItem.tier))];
    const qualities = QUALITY_ORDER.filter((quality) =>
      item.offers.some((offerItem) => offerItem.quality.includes(quality))
    );
    return { seasons, regions, tiers, qualities };
  }

  function filterOffers(id, rawFilters = {}) {
    const item = getById(id);
    if (!item) return null;

    const options = offerOptions(item);
    const season = options.seasons.includes(rawFilters.season) ? rawFilters.season : "全部";
    const region = options.regions.includes(rawFilters.region) ? rawFilters.region : "全部";
    const tier = options.tiers.includes(rawFilters.tier) ? rawFilters.tier : "全部";
    const quality = options.qualities.includes(rawFilters.quality) ? rawFilters.quality : "全部";
    const verified = rawFilters.verified === true || rawFilters.verified === "1" || rawFilters.verified === "true";

    const matches = (offerItem) => {
      if (verified && !offerItem.verified) return false;
      if (season !== "全部" && offerItem.season !== season) return false;
      if (region !== "全部" && (!providers[offerItem.pid] || providers[offerItem.pid].region !== region)) return false;
      if (tier !== "全部" && offerItem.tier !== tier) return false;
      if (quality !== "全部" && !offerItem.quality.includes(quality)) return false;
      return true;
    };

    const visible = item.offers
      .map((offerItem, index) => decorateOffer(item, offerItem, index))
      .filter(matches);
    const online = visible.filter((offerItem) => offerItem.verified);
    const pending = visible.filter((offerItem) => !offerItem.verified);

    const counts = {
      season: {},
      region: {},
      tier: {},
      quality: {}
    };
    item.offers.forEach((offerItem) => {
      if (offerItem.season) counts.season[offerItem.season] = (counts.season[offerItem.season] || 0) + 1;
      const provider = providers[offerItem.pid];
      if (provider) counts.region[provider.region] = (counts.region[provider.region] || 0) + 1;
      counts.tier[offerItem.tier] = (counts.tier[offerItem.tier] || 0) + 1;
      offerItem.quality.forEach((entry) => {
        if (QUALITY_ORDER.includes(entry)) counts.quality[entry] = (counts.quality[entry] || 0) + 1;
      });
    });

    return {
      id: item.id,
      filters: { season, region, tier, quality, verified },
      options,
      counts,
      total: visible.length,
      verifiedCount: online.length,
      groups: [
        { key: "verified", title: "已验证可看", items: online },
        { key: "pending", title: "待确认", items: pending }
      ]
    };
  }

  function resolveOffer(id, rawIndex) {
    const item = getById(id);
    if (!item) return null;
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= item.offers.length) return null;
    const offerItem = item.offers[index];
    return {
      item,
      offer: offerItem,
      url: providerURL(offerItem, item)
    };
  }

  function stats() {
    const items = all();
    return {
      titles: items.length,
      providers: Object.keys(providers).length,
      offers: items.reduce((sum, item) => sum + item.offers.length, 0),
      verifiedOffers: items.reduce(
        (sum, item) => sum + item.offers.filter((offerItem) => offerItem.verified).length,
        0
      )
    };
  }

  return {
    providers,
    types: TYPES,
    get stats() {
      return stats();
    },
    hot: () => hotPool().map(summarize),
    search,
    getTitle,
    filterOffers,
    resolveOffer
  };
}

module.exports = { createStore, TYPES, QUALITY_ORDER, norm };
