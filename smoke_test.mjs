// 冒烟测试：模拟 Card Database 的数据加载 + 分组逻辑
// 数据已按阵营拆分（assets/<type>/<faction>/cards.json + assets/upgrades/<bucket>.json），
// 这里对每类文件列表并发加载并按 id 去重（双阵营升级卡会出现在两份里）。
const base = "http://localhost:8123";
const J = async (f) => (await fetch(base + "/" + f)).json();

const CATEGORY_FILES = {
  ships: ["assets/ships/imperial/cards.json", "assets/ships/rebel/cards.json"],
  squadrons: ["assets/squadrons/imperial/cards.json", "assets/squadrons/rebel/cards.json"],
  titles: ["assets/titles/imperial/cards.json", "assets/titles/rebel/cards.json"],
  upgrades: [
    "assets/upgrades/neutral.json", "assets/upgrades/imperial.json",
    "assets/upgrades/rebel.json", "assets/upgrades/separatist.json",
    "assets/upgrades/republic.json",
  ],
};

async function loadCategory(fileList) {
  const lists = await Promise.all(fileList.map(J));
  const seen = {}, merged = [];
  lists.forEach((list) => {
    (list || []).forEach((card) => {
      if (card && card.id && seen[card.id]) return;
      if (card) { seen[card.id] = true; merged.push(card); }
    });
  });
  return merged;
}

try {
  const config = await J("data/config.json");
  const [ships, squadrons, upgrades, titles] = await Promise.all([
    loadCategory(CATEGORY_FILES.ships),
    loadCategory(CATEGORY_FILES.squadrons),
    loadCategory(CATEGORY_FILES.upgrades),
    loadCategory(CATEGORY_FILES.titles),
  ]);
  const cards = { ships, squadrons, upgrades, titles };
  console.log("config factions:", config.factions.map((f) => f.id + ":" + f.name).join(", "));
  console.log("config slots:", config.upgradeSlots.length, "种");

  function groupsOf(category) {
    const list = cards[category];
    if (category === "upgrades") {
      return config.upgradeSlots
        .map((s) => ({ h: s.name, n: list.filter((c) => c.slot === s.id).length }))
        .filter((g) => g.n > 0);
    }
    return config.factions
      .map((f) => ({ h: f.name, n: list.filter((c) => c.faction === f.id).length }))
      .filter((g) => g.n > 0);
  }

  for (const cat of ["ships", "squadrons", "upgrades", "titles"]) {
    const g = groupsOf(cat);
    console.log("[" + cat + "]", cards[cat].length, "张 ->", g.map((x) => x.h + "(" + x.n + ")").join(" "));
  }

  for (const cat of Object.keys(cards)) {
    const ids = cards[cat].map((c) => c.id);
    if (new Set(ids).size !== ids.length) console.log("!! id 重复:", cat);
  }
  const slotIds = new Set(config.upgradeSlots.map((s) => s.id));
  const bad = cards.ships.flatMap((c) => c.slots.filter((s) => !slotIds.has(s)).map((s) => c.id + ":" + s));
  console.log("ships 未知槽位:", bad.length ? bad : "无");
  console.log("upgrades 未知slot:", cards.upgrades.filter((c) => !slotIds.has(c.slot)).length);

  const missing = [];
  for (const cat of Object.keys(cards)) {
    for (const c of cards[cat]) {
      const r = await fetch(base + "/" + c.image);
      if (r.status !== 200) missing.push(c.id + " " + c.image);
    }
  }
  console.log("图片缺失:", missing.length ? missing : "无");
} catch (e) {
  console.error("ERR", e.message);
  process.exit(1);
}
