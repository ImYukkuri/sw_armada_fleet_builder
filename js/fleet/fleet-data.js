/* Fleet Builder · 数据加载层
 * 从 data/*.json 与 assets 各阵营目录下的 cards.json 加载全部卡牌数据与公共配置（需本地服务器）。
 * 卡牌类（ships/squadrons/upgrades/titles）已按阵营拆分为多个文件（见 build_data.py），
 * 这里对每个文件列表并发加载并按 id 去重（双阵营升级卡会出现在两份里）后合并为扁平数组。
 * 挂到 window.FleetData，供 fleet-state/rules/calculator/render 使用。
 * 附带：升级槽位 SVG 图标注入（fill="black" -> currentColor，可随主题取色）。
 *
 * 与 Card Database 的 CardDB 保持独立：这里额外加载 objectives，且不依赖 carddb 页面。 */
window.FleetData = (function () {
  const FILES = {
    config: "data/config.json",
    objectives: "data/objectives.json",
    // 舰船 / 中队 4 阵营全列（共和国/分离势力文件尚未录入时由 loadCategory 容错跳过）
    ships: [
      "assets/ships/imperial/cards.json", "assets/ships/rebel/cards.json",
      "assets/ships/separatist/cards.json", "assets/ships/republic/cards.json",
    ],
    squadrons: [
      "assets/squadrons/imperial/cards.json", "assets/squadrons/rebel/cards.json",
      "assets/squadrons/separatist/cards.json", "assets/squadrons/republic/cards.json",
    ],
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

  // 槽位 id -> assets/*.svg 文件
  const SLOT_ICON_FILES = {
    commander: "commander.svg",
    defensive_retrofit: "defensive-retro.svg",
    experimental_retrofit: "experimental-retro.svg",
    fleet_command: "fleet-command.svg",
    fleet_support: "fleet-support.svg",
    ion_cannons: "ion-cannon.svg",
    offensive_retrofit: "offensive-retro.svg",
    officer: "officer.svg",
    ordnance: "ordnance.svg",
    superweapon: "super-weapon.svg",
    support_team: "support-team.svg",
    turbolasers: "turbolaser.svg",
    weapons_team: "weapons-team.svg",
    title: "title.svg",
  };

  const db = {
    config: null,
    cards: { ships: [], squadrons: [], upgrades: [], titles: [], objectives: [] },
    icons: {}, // slotId -> inline svg（fill=currentColor）
    loaded: false,

    // load(onProgress?)：onProgress(fraction, label) 可选，切页/启动进度条用。
    // 不传则行为不变（await FleetData.load() 全量加载）。按类顺序加载，
    // 各类内部仍并发拉文件，每完成一类回调一次进度。
    async load(onProgress) {
      const report = typeof onProgress === "function" ? onProgress : null;
      const step = function (fraction, label) { if (report) report(fraction, label); };

      step(0.1, "正在加载基础配置…");
      const [config, objectives] = await Promise.all([
        fetchJSON(FILES.config),
        fetchJSON(FILES.objectives),
      ]);
      this.config = config;
      this.cards.objectives = objectives;

      step(0.28, "正在加载舰船数据…");
      this.cards.ships = await loadCategory(FILES.ships);

      step(0.45, "正在加载中队数据…");
      this.cards.squadrons = await loadCategory(FILES.squadrons);

      step(0.65, "正在加载升级卡数据…");
      this.cards.upgrades = await loadCategory(FILES.upgrades);

      step(0.82, "正在加载称号数据…");
      this.cards.titles = await loadCategory(FILES.titles);

      step(0.92, "正在加载图标…");
      await this.loadIcons();

      this.loaded = true;
      step(1, "加载完成");
      return this;
    },

    /* ---- 配置查找 ---- */
    faction(id) {
      return this.config.factions.find(function (f) { return f.id === id; }) || null;
    },
    slot(id) {
      return this.config.upgradeSlots.find(function (s) { return s.id === id; }) || null;
    },
    size(id) {
      return this.config.sizes.find(function (s) { return s.id === id; }) || null;
    },

    /* ---- 卡牌查找 ---- */
    ship(id) {
      return this.cards.ships.find(function (c) { return c.id === id; }) || null;
    },
    squadron(id) {
      return this.cards.squadrons.find(function (c) { return c.id === id; }) || null;
    },
    upgrade(id) {
      return this.cards.upgrades.find(function (c) { return c.id === id; }) || null;
    },
    title(id) {
      return this.cards.titles.find(function (c) { return c.id === id; }) || null;
    },
    objective(id) {
      return this.cards.objectives.find(function (c) { return c.id === id; }) || null;
    },
    anyCard(id) {
      return this.ship(id) || this.squadron(id) || this.upgrade(id) || this.title(id) || this.objective(id);
    },

    /* ---- 按阵营取卡池 ---- */
    shipsOf(faction) {
      return this.cards.ships.filter(function (c) { return c.faction === faction; });
    },
    squadronsOf(faction) {
      return this.cards.squadrons.filter(function (c) { return c.faction === faction; });
    },
    upgradesOfSlot(slotId) {
      // 双槽卡（slots 非空，如 武器小组/进攻改装）在自身任一槽的选择界面都出现
      return this.cards.upgrades.filter(function (c) {
        return c.slot === slotId || ((c.slots && c.slots.length) && c.slots.indexOf(slotId) !== -1);
      });
    },
    objectivesOf(category) {
      return this.cards.objectives.filter(function (c) { return c.category === category; });
    },

    /* ---- 槽位图标 ---- */
    async loadIcons() {
      const tasks = Object.keys(SLOT_ICON_FILES).map(async function (slotId) {
        const file = SLOT_ICON_FILES[slotId];
        try {
          const res = await fetch("assets/" + file, { cache: "no-store" });
          if (!res.ok) return;
          let svg = await res.text();
          // 图标用 currentColor 随阵营主题取色
          svg = svg.replace(/fill="black"/g, 'fill="currentColor"');
          db.icons[slotId] = svg;
        } catch (e) { /* 图标缺失不影响构建 */ }
      });
      await Promise.all(tasks);
    },
    slotIcon(slotId) {
      return db.icons[slotId] || "";
    },
  };

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status + " — " + url);
    return res.json();
  }

  // 按文件列表并发加载并按 id 去重：双阵营升级卡（separatist+republic）会在两份里出现。
  // 单个阵营文件缺失（尚未录入，如共和国/分离势力舰船或中队）→ 跳过该文件，不影响整体加载。
  async function loadCategory(fileList) {
    const lists = await Promise.all(fileList.map(fetchJSONOrEmpty));
    const seen = {}, merged = [];
    lists.forEach(function (list) {
      (list || []).forEach(function (card) {
        if (card && card.id && seen[card.id]) return;
        if (card) { seen[card.id] = true; merged.push(card); }
      });
    });
    return merged;
  }

  // 容错版 fetch：文件拉取失败 / 404（阵营尚未录入）→ 空列表跳过；
  // 但已存在的文件若 JSON 解析失败则上抛（真损坏不掩盖）。config/objectives 仍走严格 fetchJSON。
  async function fetchJSONOrEmpty(url) {
    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch (e) {
      return [];
    }
    if (!res.ok) return [];
    return await res.json();
  }

  return db;
})();
