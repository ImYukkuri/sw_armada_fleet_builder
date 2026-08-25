/* Card Database · 数据加载层
 * 从 data/*.json 加载全部卡牌数据与公共配置（需要本地服务器）。
 * 统一挂到 window.CardDB，供 app.js 使用。 */
window.CardDB = (function () {
  const CATEGORY_FILES = {
    ships: "data/ships.json",
    squadrons: "data/squadrons.json",
    upgrades: "data/upgrades.json",
    titles: "data/titles.json",
  };

  const db = {
    config: null,          // {factions, upgradeSlots, sizes}
    cards: { ships: [], squadrons: [], upgrades: [], titles: [] },
    loaded: false,

    async load() {
      const [config, ships, squadrons, upgrades, titles] = await Promise.all([
        fetchJSON("data/config.json"),
        fetchJSON(CATEGORY_FILES.ships),
        fetchJSON(CATEGORY_FILES.squadrons),
        fetchJSON(CATEGORY_FILES.upgrades),
        fetchJSON(CATEGORY_FILES.titles),
      ]);
      this.config = config;
      this.cards.ships = ships;
      this.cards.squadrons = squadrons;
      this.cards.upgrades = upgrades;
      this.cards.titles = titles;
      this.loaded = true;
    },

    // ---- 配置查找 ----
    faction(id) {
      return this.config.factions.find(function (f) { return f.id === id; }) || null;
    },
    slot(id) {
      return this.config.upgradeSlots.find(function (s) { return s.id === id; }) || null;
    },
    size(id) {
      return this.config.sizes.find(function (s) { return s.id === id; }) || null;
    },

    categoryCards(category) {
      return this.cards[category] || [];
    },

    findCard(category, cardId) {
      return this.categoryCards(category).find(function (c) { return c.id === cardId; }) || null;
    },
  };

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status + " — " + url);
    return res.json();
  }

  return db;
})();
