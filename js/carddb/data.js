/* Card Database · 数据加载层
 * 从 data/config.json 与 assets 各阵营目录下的 cards.json 加载全部卡牌数据（需要本地服务器）。
 * 卡牌类（ships/squadrons/upgrades/titles）已按阵营拆分为多个文件（见 build_data.py），
 * 这里对每个文件列表并发加载并按 id 去重（双阵营升级卡会出现在两份里）后合并为扁平数组。
 * 统一挂到 window.CardDB，供 app.js 使用。 */
window.CardDB = (function () {
  const CATEGORY_FILES = {
    ships: ["assets/ships/imperial/cards.json", "assets/ships/rebel/cards.json"],
    squadrons: ["assets/squadrons/imperial/cards.json", "assets/squadrons/rebel/cards.json"],
    titles: [
      "assets/titles/imperial/cards.json", "assets/titles/rebel/cards.json",
      "assets/titles/separatist/cards.json", "assets/titles/republic/cards.json",
    ],
    upgrades: [
      "assets/upgrades/neutral.json", "assets/upgrades/imperial.json",
      "assets/upgrades/rebel.json", "assets/upgrades/separatist.json",
      "assets/upgrades/republic.json",
    ],
  };

  const ALL_FACTIONS = ["imperial", "rebel", "separatist", "republic"];

  // 升级卡允许阵营（镜像 js/fleet/fleet-rules.js cardFactionAllowed 语义）：
  // restrictions.factions 非空数组优先，其次 faction 字段，否则全部阵营 = neutral。
  function upgradeFactions(card) {
    const r = card.restrictions || {};
    if (Array.isArray(r.factions) && r.factions.length) {
      return r.factions.filter(function (f) { return ALL_FACTIONS.indexOf(f) !== -1; });
    }
    if (card.faction) return [card.faction];
    return ALL_FACTIONS.slice();
  }

  // 升级卡所属文件（双阵营卡写两份；neutral 单独一文件）。
  function upgradeFiles(card) {
    const fs = upgradeFactions(card);
    if (fs.length === ALL_FACTIONS.length) return ["assets/upgrades/neutral.json"];
    if (fs.length === 1) return ["assets/upgrades/" + fs[0] + ".json"];
    return fs.map(function (f) { return "assets/upgrades/" + f + ".json"; });
  }

  const db = {
    config: null,          // {factions, upgradeSlots, sizes}
    cards: { ships: [], squadrons: [], upgrades: [], titles: [] },
    loaded: false,

    async load() {
      const [config, ships, squadrons, upgrades, titles] = await Promise.all([
        fetchJSON("data/config.json"),
        loadCategory(CATEGORY_FILES.ships),
        loadCategory(CATEGORY_FILES.squadrons),
        loadCategory(CATEGORY_FILES.upgrades),
        loadCategory(CATEGORY_FILES.titles),
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

    // ---- 升级卡阵营/文件助手（导出切分与阵营显示用） ----
    ALL_FACTIONS: ALL_FACTIONS,
    upgradeFactions: upgradeFactions,
    upgradeFiles: upgradeFiles,
  };

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status + " — " + url);
    return res.json();
  }

  // 按文件列表并发加载并按 id 去重：双阵营升级卡（separatist+republic）会在两份里出现。
  async function loadCategory(fileList) {
    const lists = await Promise.all(fileList.map(fetchJSON));
    const seen = {}, merged = [];
    lists.forEach(function (list) {
      (list || []).forEach(function (card) {
        if (card && card.id && seen[card.id]) return;
        if (card) { seen[card.id] = true; merged.push(card); }
      });
    });
    return merged;
  }

  return db;
})();
