// 写表器 DOM stub 冒烟测试：真实执行 builder.js 全流程 + 纯规则/点数断言
import fs from "node:fs";
import zlib from "node:zlib";

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? "[ok] " : "[FAIL] ") + name + (extra ? " :: " + extra : ""));
  if (!cond) failures++;
}

/* ---------------- 最小 DOM / window mock ---------------- */
function makeEl(id) {
  const el = {
    id, _html: "", _ls: {}, dataset: {}, style: { color: "" }, title: "",
    _removed: false,
    addEventListener(t, fn) { el._ls[t] = fn; },
    appendChild() {},
    remove() { el._removed = true; },
    closest() { return null; },
    querySelector() { return null; },
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html; },
    set(v) { el._html = String(v); },
  });
  return el;
}
const els = {};
const selBodyEl = makeEl("sel-body");
global.document = {
  getElementById(id) { return (els[id] ||= makeEl(id)); },
  createElement() { return makeEl("created"); },
  body: { appendChild() {} },
  title: "",
  documentElement: { style: { setProperty() {} } },
};
els["selector-root"] ||= makeEl("selector-root");
els["selector-root"].querySelector = (sel) => (sel === "[data-sel-body]" ? selBodyEl : null);

global.window = global;
global.location = { search: "?faction=imperial", replace() { global.__redirected = true; } };
global.scrollTo = () => {};

// 本地 fetch：data/*.json 与 assets/*.svg 直接读盘
global.fetch = async (url) => {
  const u = String(url);
  const m = u.match(/(?:^|\/)(data\/[^?#]+)$/);
  if (m) {
    const body = fs.readFileSync(m[1], "utf8");
    return { ok: true, status: 200, async json() { return JSON.parse(body); } };
  }
  const s = u.match(/(?:^|\/)assets\/([^?#]+)$/);
  if (s) {
    const body = fs.readFileSync("assets/" + s[1], "utf8");
    // assets/ 下既有 .svg（text 用）也有拆分后的 .json 卡牌文件（json 用）
    return { ok: true, status: 200, async json() { return JSON.parse(body); }, async text() { return body; } };
  }
  throw new Error("unexpected url " + u);
};

process.on("unhandledRejection", (e) => { console.error("!! unhandledRejection:", e); process.exit(1); });

/* ---------------- 加载脚本 ---------------- */
// factions.js 顶层 const 在严格模式 eval 内不进入全局，需在同一 eval 作用域内导出
eval(fs.readFileSync("js/factions.js", "utf8") + "\nglobalThis.FACTIONS = FACTIONS;");
for (const mod of ["lightbox", "armada-icons", "fleet-data", "fleet-state", "fleet-io", "fleet-rules", "fleet-calculator", "fleet-render", "selectors"]) {
  eval(fs.readFileSync("js/fleet/" + mod + ".js", "utf8"));
}
// 军表存取测试环境：注入 zlib 同步 codec（Node 18 无 CompressionStream）+ Map 存储桩
const _store = new Map();
FleetIO.setCodec({
  gzip: (bytes) => new Uint8Array(zlib.gzipSync(Buffer.from(bytes))),
  gunzip: (bytes) => new Uint8Array(zlib.gunzipSync(Buffer.from(bytes))),
});
FleetIO.setStorage({
  getItem: (k) => _store.get(k) || null,
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
});
eval(fs.readFileSync("js/builder.js", "utf8"));
console.log("[load] ArmadaIcons/FleetData/FleetState/FleetIO/FleetRules/FleetCalculator/FleetRender/Selectors 均已挂载:",
  !!global.ArmadaIcons && !!global.FleetData && !!global.FleetState && !!global.FleetIO && !!global.FleetRules && !!global.FleetCalculator && !!global.FleetRender && !!global.FleetSelectors);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 30 && !els["fleet-overview"].innerHTML.includes("overview-section"); i++) await sleep(100);
if (!els["fleet-overview"].innerHTML.includes("overview-section")) {
  console.error("!! 页面未渲染。overview:\n" + els["fleet-overview"].innerHTML.slice(0, 600));
  process.exit(1);
}

const data = FleetData;
const fleet = FleetState.get();

/* ---------------- 共和国舰船数据（4 阵营加载 + 容错 + 去重） ---------------- */
const repShips = data.shipsOf("republic");
check("共和国舰船已加载(13 艘)", repShips.length === 13, "count=" + repShips.length + " ids=" + repShips.map((c) => c.id).join(","));
check("共和国舰船 id 不与帝国/义军撞车",
  repShips.every((c) => !["imperial", "rebel"].some((f) => data.ship(c.id) && data.ship(c.id).faction === f)));
check("共和国猎兵I型 数据完整", data.ship("venator_i") && data.ship("venator_i").faction === "republic" &&
  data.ship("venator_i").points === 86 && data.ship("venator_i").slots.length === 7,
  data.ship("venator_i") && JSON.stringify({ pts: data.ship("venator_i").points, slots: data.ship("venator_i").slots }));
check("共和国胜利I 已改唯一 id 且图片路径存在",
  data.ship("victory_i_republic") && data.ship("victory_i_republic").faction === "republic" &&
  fs.existsSync(data.ship("victory_i_republic").image),
  data.ship("victory_i_republic") && data.ship("victory_i_republic").image);
check("帝国 victory_i 未被共和国版覆盖(仍为帝国)",
  data.ship("victory_i") && data.ship("victory_i").faction === "imperial");
check("共和国 13 艘舰图片文件全部存在",
  repShips.every((c) => fs.existsSync(c.image)), repShips.filter((c) => !fs.existsSync(c.image)).map((c) => c.image).join(","));
check("分离势力舰船缺失被容错(加载仍成功)", data.shipsOf("separatist").length === 0);
check("中队关键字提取(squadron_keyword)",
  JSON.stringify(data.squadron("imperial_squadrons_001").squadron_keyword) === JSON.stringify([{ key: "counter", value: 1 }, { key: "escort", value: null }]) &&
  JSON.stringify(data.squadron("rebel_squadrons_028").squadron_keyword) === JSON.stringify([{ key: "bomber", value: null }, { key: "snipe", value: 3 }]));

/* ---------------- 头部与初始状态 ---------------- */
check("阵营主题已设置", els["faction-title"].textContent.includes("帝国"), els["faction-title"].textContent);
check("初始分数 0/400", els["points-box"].innerHTML.includes("0") && els["points-box"].innerHTML.includes("400"));
check("总览含 舰船/中队/任务卡 三节", ["舰船", "中队", "任务卡"].every((s) => els["fleet-overview"].innerHTML.includes(s)));
check("空态不再显示提示文案", !els["fleet-overview"].innerHTML.includes("还没有舰船") && !els["fleet-overview"].innerHTML.includes("还没有中队"));
check("初始中队分数含 1/3 上限 0/134", els["fleet-overview"].innerHTML.includes("0 / 134"));

/* ---------------- 纯规则断言 ---------------- */
function clickBtn(container, dataset) {
  const btn = { dataset, closest(sel) { return sel === "[data-action]" ? btn : null; } };
  els[container]._ls.click({ target: btn });
}
function cardBtn(id) {
  return { dataset: { action: "sel-pick", id }, closest(sel) { return sel === "[data-action]" ? cardBtn() : null; } };
}
function selClick(dataset) {
  const btn = { dataset, closest(sel) { return sel === "[data-action]" ? btn : null; } };
  els["selector-root"]._ls.click({ target: btn });
}

// 纯逻辑：舰队为 imperial
const arquitens = data.ship("arquitens_command"); // small
const gladiator = data.ship("gladiator_i");
const executor = data.ship("executor_i");          // huge
const shipA = { instanceId: "ship-t1", cardId: "arquitens_command", title: null, upgrades: [] };
const shipB = { instanceId: "ship-t2", cardId: "gladiator_i", title: null, upgrades: [] };
const shipHuge = { instanceId: "ship-t3", cardId: "executor_i", title: null, upgrades: [] };

const impOfficer = data.upgrade("officer_001");       // 帝国限定
const ionCannon = data.upgrade("ion_cannons_008");    // 非-巨型（small/medium/large）
const sdTitle = data.title("imperial_title_008");     // 帝国级歼星舰 限定
const arquitensTitle = data.title("imperial_title_001"); // 阿奎腾斯级轻巡洋舰 限定
const flagshipBridge = data.upgrade("offensive_retrofit_006"); // 中型或大型 + 旗舰

let r = FleetRules.canEquipUpgrade(data, fleet, shipA, "officer", impOfficer);
check("帝国军官可装帝国舰", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, shipA, "officer", data.upgrade("officer_026")); // 义军限定
check("义军军官不可装帝国舰(faction)", !r.allowed && r.reasons.includes("faction"), JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, shipA, "ion_cannons", ionCannon);
check("非巨型升级可装小型舰", r.allowed);
r = FleetRules.canEquipUpgrade(data, fleet, shipHuge, "ion_cannons", ionCannon);
check("非巨型升级不可装巨型舰(size)", !r.allowed && r.reasons.includes("size"), JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, { ...shipA, cardId: "imperial_i" }, "title", sdTitle);
check("帝国级称号可装帝国级歼星舰", r.allowed);
r = FleetRules.canEquipUpgrade(data, fleet, shipA, "title", sdTitle);
check("帝国级称号不可装阿奎腾斯(ship)", !r.allowed && r.reasons.includes("ship"), JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, shipA, "title", arquitensTitle);
check("阿奎腾斯称号可装指挥巡洋舰(shipId 权威)", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, shipA, "offensive_retrofit", flagshipBridge);
check("旗舰桥不可装小型舰(size)", !r.allowed && r.reasons.includes("size"));
const shipLargeNoFlag = { instanceId: "ship-t4", cardId: "imperial_i", title: null, upgrades: [] };
// 旗舰桥是改装类升级：按自身槽（offensive_retrofit）出现，仍需中型/大型 + 旗舰
r = FleetRules.canEquipUpgrade(data, fleet, shipLargeNoFlag, "offensive_retrofit", flagshipBridge);
check("大型非旗舰不可装旗舰桥(flagship)", !r.allowed && r.reasons.includes("flagship"), JSON.stringify(r.reasons));
// 旗舰 = 装备指挥官的舰船（fleet.commanderShipId）
const fleetWithFlag = { ...fleet, commander: "commander_001", commanderShipId: "ship-t4" };
r = FleetRules.canEquipUpgrade(data, fleetWithFlag, shipLargeNoFlag, "offensive_retrofit", flagshipBridge);
check("大型旗舰(装备指挥官)可装旗舰桥", r.allowed, JSON.stringify(r.reasons));

// 指挥官：阵营过滤 + 舰队级唯一（用舰队副本，不改动真实军表）
const impCmd = data.upgrade("commander_001");    // 康斯坦丁（帝国）
const impCmd2 = data.upgrade("commander_002");   // 莫蒂（帝国）
const rebCmd = data.upgrade("commander_014");    // 阿克巴（义军）
r = FleetRules.canEquipUpgrade(data, fleet, shipA, "commander", rebCmd);
check("义军指挥官不可装帝国舰(faction)", !r.allowed && r.reasons.includes("faction"), JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, shipA, "commander", impCmd);
check("帝国指挥官可装帝国舰", r.allowed, JSON.stringify(r.reasons));
const fleetWithCmd = { ...fleet, commander: "commander_001", commanderShipId: "ship-other" };
r = FleetRules.canEquipUpgrade(data, fleetWithCmd, shipA, "commander", impCmd2);
check("舰队已有指挥官时其它舰不可再选(commander)", !r.allowed && r.reasons.includes("commander"), JSON.stringify(r.reasons));
// 旗舰可更换指挥官（fleet.commander 为单一字段，装备指挥官的那艘舰才可操作）
const flagshipShip = { instanceId: "ship-other", cardId: "gladiator_i", title: null, upgrades: [] };
r = FleetRules.canEquipUpgrade(data, fleetWithCmd, flagshipShip, "commander", impCmd2);
check("旗舰可更换为其它指挥官", r.allowed, JSON.stringify(r.reasons));

/* ---------------- 按阵营拆分加载 + FAQ/勘误 字段 ---------------- */
check("加载器按阵营拆分后舰船总数(60, 帝国24+义军23+共和国13)", data.cards.ships.length === 60, "n=" + data.cards.ships.length);
check("中队总数 82(含手工录入 6 张)", data.cards.squadrons.length === 82, "n=" + data.cards.squadrons.length);
check("称号总数 82(义军 32 含义军一号 + 帝国31 + 共和国/分离 19)", data.cards.titles.length === 82, "n=" + data.cards.titles.length);
check("升级总数 223(已删 战略顾问/贝尔奥加纳 2 张禁卡, 双阵营卡去重)", data.cards.upgrades.length === 223, "n=" + data.cards.upgrades.length);
["defensive_retrofit_008", "turbolasers_012", "fleet_command_003"].forEach(function (id) {
  const dup = data.cards.upgrades.filter((c) => c.id === id);
  check("双阵营升级卡去重(" + id + ")", dup.length === 1, "n=" + dup.length);
});
check("neutral 升级卡可查(weapons_team_017)", !!data.upgrade("weapons_team_017"));
// 新增共和国/分离势力卡已重编号为全局唯一 id（不与帝国/义军碰撞），且无跨阵营重复
const newUpIds = ["commander_025", "officer_057", "commander_031", "officer_065", "defensive_retrofit_009", "defensive_retrofit_010"];
check("新阵营升级卡重编号后可查", newUpIds.every((id) => !!data.upgrade(id)), "missing=" + newUpIds.filter((id) => !data.upgrade(id)).join(","));
const allUpIds = data.cards.upgrades.map((c) => c.id);
check("升级 id 全局唯一(无双阵营卡之外重复)", new Set(allUpIds).size === allUpIds.length, "n=" + allUpIds.length + ", 唯一=" + new Set(allUpIds).size);
const allTitleIds = data.cards.titles.map((c) => c.id);
check("称号 id 全局唯一", new Set(allTitleIds).size === allTitleIds.length, "n=" + allTitleIds.length + ", 唯一=" + new Set(allTitleIds).size);
check("义军一号 已挂到神意级航母(reb_providence)", !!data.title("rebel_title_032") && data.title("rebel_title_032").name === "义军一号" && (data.title("rebel_title_032").shipId || []).indexOf("reb_providence") !== -1);
check("title_011 是称号而非升级卡", !!data.title("title_011") && !data.upgrade("title_011") && data.title("title_011").type === "title", JSON.stringify(data.title("title_011")));
check("title_028 是称号而非升级卡", !!data.title("title_028") && !data.upgrade("title_028") && data.title("title_028").type === "title", JSON.stringify(data.title("title_028")));
check("共和国指挥官 贝尔奥加纳 有分离图像链接(commander_031)", !!data.upgrade("commander_031") && data.upgrade("commander_031").image === "assets/upgrades/commander/republic/page_001_img_1.jpeg", data.upgrade("commander_031") && data.upgrade("commander_031").image);
check("分离势力指挥官 杜库伯爵 有分离图像链接(commander_025)", !!data.upgrade("commander_025") && data.upgrade("commander_025").image === "assets/upgrades/commander/separatist/page_001_img_1.jpeg", data.upgrade("commander_025") && data.upgrade("commander_025").image);
check("分离势力称号 爱国者之拳号 有图片链接(title_010)", !!data.title("title_010") && data.title("title_010").image === "assets/titles/separatist/images/page_010_img_1.jpeg", data.title("title_010") && data.title("title_010").image);
check("共和国称号 无可饶恕号 有图片链接(title_020)", !!data.title("title_020") && data.title("title_020").image === "assets/titles/republic/images/page_001_img_1.jpeg", data.title("title_020") && data.title("title_020").image);
// 同名克隆卡/用户补图：升级卡图片指向已有共享页（反应炮组/弹药补充/克隆人炮手等）
const imgChecks = {
  "defensive_retrofit_010": "assets/upgrades/defensive_retrofit/images/page_005_img_1.jpeg",  // 共和国 反应炮组=neutral克隆
  "fleet_support_008": "assets/upgrades/fleet_support/images/page_004_img_1.jpeg",            // 分离势力 弹药补充=neutral克隆
  "fleet_support_009": "assets/upgrades/fleet_support/images/page_005_img_1.jpeg",            // 分离势力 备件补充=neutral克隆
  "ordnance_009": "assets/upgrades/ordnance/images/page_001_img_1.jpeg",                      // 共和国 突击震荡导弹=neutral克隆
  "support_team_010": "assets/upgrades/support_team/images/page_001_img_1.jpeg",              // 共和国 辅助护盾机组=neutral克隆
  "offensive_retrofit_020": "assets/upgrades/offensive_retrofit/images/page_017_img_1.jpeg",  // 共和国 超空间环(用户补图)
  "weapons_team_018": "assets/upgrades/weapons_team/images/page_018_img_1.jpeg",              // 共和国 克隆人炮手(用户补图)
};
Object.keys(imgChecks).forEach(function (id) {
  check("升级卡图已关联(" + id + ")", !!data.upgrade(id) && data.upgrade(id).image === imgChecks[id], data.upgrade(id) && data.upgrade(id).image);
});

// effect 内嵌 [FAQ：/[勘误：/[1.5勘误： 已拆成独立 faq 字段（默认不渲染）
const c002 = data.upgrade("commander_002");
check("commander_002 faq 含莫蒂", !!c002.faq && c002.faq.includes("莫蒂"), c002.faq || "无");
check("commander_002 effect 不再含 [FAQ：", !c002.effect.includes("[FAQ："));
const rs010 = data.squadron("rebel_squadrons_010");
check("简奥斯 FAQ+勘误 两段拆为 2 行", (rs010.faq || "").split("\n").length === 2, rs010.faq || "无");
check("简奥斯 effect 已剥离关键字与防御标记", !rs010.effect.includes("反击Counter") && !rs010.effect.includes("自带防御标记") && rs010.effect.includes("它可花费你的防御标记"));
check("简奥斯 提取出关键字与防御标记", JSON.stringify(rs010.squadron_keyword) === JSON.stringify([{ key: "counter", value: 2 }, { key: "intel", value: null }]) && JSON.stringify(rs010.defense_token) === JSON.stringify(["brace", "brace"]));
check("禁卡 战略顾问/贝尔奥加纳 已删除", !data.upgrade("officer_028") && !data.upgrade("officer_051"));

/* ---------------- 义军中队数据 + unique/limit 执行 ---------------- */
const rebelCards = data.cards.squadrons.filter((c) => c.id.startsWith("rebel_"));
check("义军中队 41 张已列入", rebelCards.length === 41, "count=" + rebelCards.length);
check("义军中队已合并点数", data.squadron("rebel_squadrons_001").points === 19 &&
  data.squadron("rebel_squadrons_037").points === 16);
check("义军比格斯 unique+ace", data.squadron("rebel_squadrons_001").unique && data.squadron("rebel_squadrons_001").ace);
check("义军匕首 unique 非 ace", data.squadron("rebel_squadrons_003").unique && !data.squadron("rebel_squadrons_003").ace);
check("义军A翼普通 无limit(不封顶)", !data.squadron("rebel_squadrons_026").unique && data.squadron("rebel_squadrons_026").limit == null);

// 帝国中队标记（检测回退，与 BattleScribe 一致）
const impBlack = data.squadron("imperial_squadrons_001");
const impBoba = data.squadron("imperial_squadrons_002");
check("帝国黑色中队 unique 非 ace limit1", impBlack.unique && !impBlack.ace && impBlack.limit === 1);
check("帝国波巴 unique+ace limit1", impBoba.unique && impBoba.ace && impBoba.limit === 1);
const impGeneric = data.cards.squadrons.find((c) => c.faction === "imperial" && !c.unique);
check("帝国普通中队 无limit(不封顶)", !!impGeneric && impGeneric.limit == null, impGeneric && impGeneric.id);

// 义军舰队副本：unique 限 1、普通不封顶（不污染真实军表）
const rebelFleet = { faction: "rebel", ships: [], squadrons: [], objectives: {}, version: 1 };
const luke = data.squadron("rebel_squadrons_016"); // 卢克 unique+ace
r = FleetRules.canEquipSquadron(data, rebelFleet, luke);
check("义军卢克可装义军舰队", r.allowed, JSON.stringify(r.reasons));
rebelFleet.squadrons.push({ instanceId: "sq-l1", cardId: luke.id });
r = FleetRules.canEquipSquadron(data, rebelFleet, luke);
check("unique 中队第 2 个被拒(squadron-unique)", !r.allowed && r.reasons.includes("squadron-unique"), JSON.stringify(r.reasons));
const xwing = data.squadron("rebel_squadrons_033"); // X翼 普通，无 limit（不封顶）
for (let i = 0; i < 5; i++) rebelFleet.squadrons.push({ instanceId: "sq-x" + i, cardId: xwing.id });
r = FleetRules.canEquipSquadron(data, rebelFleet, xwing);
check("普通中队第 6 个仍允许(不封顶)", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipSquadron(data, rebelFleet, data.squadron("rebel_squadrons_001")); // 比格斯 另一 unique
check("同舰队其它 unique 不冲突", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipSquadron(data, rebelFleet, data.squadron("rebel_squadrons_026")); // A翼
check("义军普通中队可装义军舰队", r.allowed);

/* ---------------- UI 流程：加舰船 ---------------- */
clickBtn("action-bar", { action: "add-ship" });
check("舰船选择器打开", els["selector-root"].innerHTML.includes("选择舰船"));
check("选择器顶部含军表点数条(selector-pts)", els["selector-root"].innerHTML.includes("selector-pts"));
check("选择器含帝国舰船卡", selBodyEl.innerHTML.includes("阿奎腾斯级指挥巡洋舰"));
check("舰船选择卡含槽位图标行(sel-slots)", selBodyEl.innerHTML.includes("sel-slots") && selBodyEl.innerHTML.includes("sel-slot"));
selClick({ action: "sel-pick", id: "arquitens_command" });
check("选中后选择器关闭", !FleetSelectors.isOpen());
let overview = els["fleet-overview"].innerHTML;
check("总览出现舰船条目", overview.includes("ship-entry") && overview.includes("阿奎腾斯级指挥巡洋舰"));
check("分数更新 55/400", els["points-box"].innerHTML.includes("55"));
check("舰船条目含槽位图标横排(slot-row)", overview.includes("slot-row") && overview.includes("slot-btn"));
check("列表末尾含添加舰船按钮(add-in-list)", overview.includes("add-in-list"));
check("舰船卡图含点击放大(onclick)", overview.includes("Lightbox.open"));

// 中队选择：图标 token 已转义为 <img> + 效果全文显示
clickBtn("fleet-overview", { action: "add-squadron" });
check("中队选择器打开", els["selector-root"].innerHTML.includes("选择中队"));
check("中队卡防御标记图标已渲染(armada-icon--defense-brace)", selBodyEl.innerHTML.includes('armada-icon--defense-brace"'));
check("中队卡暴击图标已渲染(armada-icon--attack-critical)", selBodyEl.innerHTML.includes('armada-icon--attack-critical"'));
check("无残留原始icon token", !selBodyEl.innerHTML.includes("[[icon:"));
check("中队卡关键词/防御标记渲染为 tag", selBodyEl.innerHTML.includes("sq-tag--keyword") && selBodyEl.innerHTML.includes("sq-tag--defense"));
check("中队卡 effect 已清理(不含关键字与防御标记原文)", !selBodyEl.innerHTML.includes("自带防御标记") && !selBodyEl.innerHTML.includes("侠盗Rogue"));
selClick({ action: "sel-close" });
check("中队选择器可关闭", !FleetSelectors.isOpen());

// 重复加同一舰 -> 两个实例
clickBtn("action-bar", { action: "add-ship" });
selClick({ action: "sel-pick", id: "arquitens_command" });
overview = els["fleet-overview"].innerHTML;
const shipIds = [...overview.matchAll(/data-action="remove-ship" data-id="([^"]+)"/g)].map((m) => m[1]);
check("同一舰船出现两个独立实例", shipIds.length === 2 && shipIds[0] !== shipIds[1], shipIds.join(" | "));

// 打开第一个舰船的 officer 槽（slotIndex=0）
const firstShipId = shipIds[0];
clickBtn("fleet-overview", { action: "open-upgrade", id: firstShipId, slot: "officer", slotIndex: "0" });
check("升级选择器标题含 军官", els["selector-root"].innerHTML.includes("选择升级") || els["selector-root"].innerHTML.includes("军官"));
check("升级列表含 奇拉内奥 上将", selBodyEl.innerHTML.includes("奇拉内奥"));
// 帝国军官卡：不应出现义军军官
check("升级列表不含义军军官(过滤)", !selBodyEl.innerHTML.includes("韦奇 安蒂列斯"));
// 军官槽排序：势力特有卡(帝国)优先于通用卡(neutral)
check("军官槽 势力特有卡排在通用卡之前",
  selBodyEl.innerHTML.indexOf("奇拉内奥") !== -1 &&
  selBodyEl.innerHTML.indexOf("航图士官") !== -1 &&
  selBodyEl.innerHTML.indexOf("奇拉内奥") < selBodyEl.innerHTML.indexOf("航图士官"));
// 缩略显示：网格 + 缩略卡
check("升级选择器含 缩略显示 开关", els["selector-root"].innerHTML.includes('data-action="pref-thumb"'));
prefChange("pref-thumb", true);
check("缩略显示切换为网格布局(sel-grid + thumb)", selBodyEl.innerHTML.includes("sel-grid") && selBodyEl.innerHTML.includes("sel-card--thumb"));
prefChange("pref-thumb", false);
check("关闭缩略显示恢复列表", !selBodyEl.innerHTML.includes("sel-grid"));
selClick({ action: "sel-pick", id: "officer_001" });
overview = els["fleet-overview"].innerHTML;
check("军官已装备显示", overview.includes("奇拉内奥"));
check("已装备条目显示在舰船下方(equip-item)", overview.includes("equip-item"));
check("已装备槽位图标变暗(slot-btn is-equipped)", overview.includes("slot-btn is-equipped"));
check("已装备条目默认不显示效果(收起)", !overview.includes("即使交战中也可移动"));
check("已装备条目默认不显示 FAQ 段(速度为3 在 faq)", !overview.includes("速度为3"));
// 页头开关「完整卡牌效果」：勾选后显示完整效果 + 整卡图（equip-thumb is-full）
FleetRender.setPrefs({ showEffect: true });
const effHtml = FleetRender.renderOverview(data, fleet, FleetCalculator.calculateFleetPoints(data, fleet));
check("勾选完整卡牌效果后显示完整效果", effHtml.includes("即使交战中也可移动"));
check("勾选后卡图整卡显示(equip-thumb is-full)", effHtml.includes("equip-thumb is-full"));
FleetRender.setPrefs({ showEffect: false });
// 两艘阿奎腾斯(55×2) + 军官(10) = 120
check("分数含两艘舰+军官 120", els["points-box"].innerHTML.includes("120"));

// 称号：打开第一个舰船的 title 槽
clickBtn("fleet-overview", { action: "open-upgrade", id: firstShipId, slot: "title" });
// 阿奎腾斯级指挥巡洋舰 -> 阿奎腾斯称号可用（shipId 权威），角斗士限定称号被过滤
const titleSelHtml = selBodyEl.innerHTML;
check("称号选择器按舰船过滤(含阿奎腾斯称号)", titleSelHtml.includes("半牛马号"));
check("称号选择器排除非本舰称号(不含破坏者号)", !titleSelHtml.includes("破坏者号"));
selClick({ action: "sel-close" });
check("选择器可关闭", !FleetSelectors.isOpen());

// 任务卡：打开进攻任务槽
clickBtn("fleet-overview", { action: "open-objective", category: "assault" });
check("任务选择器只列进攻类", selBodyEl.innerHTML.includes("Advanced Gunnery") && !selBodyEl.innerHTML.includes("Navigation"));
check("任务选择卡内联规则段落(布设/特殊规则)", selBodyEl.innerHTML.includes("布设") && selBodyEl.innerHTML.includes("特殊规则"));
check("任务选择卡内联规则正文(Advanced Gunnery 布设全文)", selBodyEl.innerHTML.includes("选1个自己的战舰"));
check("英文/FAQ开关默认关闭(不显示英文原文和FAQ)", !selBodyEl.innerHTML.includes("After deploying fleets") && !selBodyEl.innerHTML.includes("FAQ"));
const selRootHtml = els["selector-root"].innerHTML;
check("任务选择页顶部含两个偏好开关(显示英文/显示FAQ)", selRootHtml.includes("pref-en") && selRootHtml.includes("pref-faq"));
function prefChange(action, checked) {
  const tgt = { dataset: { action }, checked, closest(sel) { return sel === "[data-action='pref-en'],[data-action='pref-faq'],[data-action='pref-thumb']" ? tgt : null; } };
  els["selector-root"]._ls.change({ target: tgt });
}
// 打开 显示英文 -> 卡片英文原文出现，中文保留
prefChange("pref-en", true);
check("开启英文后卡片显示英文原文", selBodyEl.innerHTML.includes("After deploying fleets") && selBodyEl.innerHTML.includes("选1个自己的战舰"));
// 打开 显示FAQ -> FAQ 段落出现
prefChange("pref-faq", true);
check("开启FAQ后卡片显示FAQ段落", selBodyEl.innerHTML.includes("FAQ"));
// 重新关闭英文/FAQ，验证能隐藏
prefChange("pref-en", false);
prefChange("pref-faq", false);
check("重新关闭英文/FAQ 后恢复隐藏", !selBodyEl.innerHTML.includes("After deploying fleets") && !selBodyEl.innerHTML.includes("FAQ"));
selClick({ action: "sel-pick", id: "advanced_gunnery" });
overview = els["fleet-overview"].innerHTML;
check("进攻任务已选", overview.includes("Advanced Gunnery"));
// 任务卡不计分：仍是 120
check("任务卡不计入分数(120/400)", els["points-box"].innerHTML.includes("120"));

// 删除舰船
clickBtn("fleet-overview", { action: "remove-ship", id: firstShipId });
overview = els["fleet-overview"].innerHTML;
check("删除舰船后剩 1 艘", (overview.match(/ship-entry/g) || []).length === 1);

/* ---------------- 点数计算 ---------------- */
// 删除的是带军官的第一艘，剩 1 艘裸阿奎腾斯 = 55
const calc = FleetCalculator.calculateFleetPoints(data, fleet);
check("点数计算器总分为舰船+升级", calc.total === 55, "total=" + calc.total);
check("点数不超限", !calc.isOverLimit && calc.remaining === 345, "remaining=" + calc.remaining);

// 中队 1/3 软上限：400 分 → ceil(400/3) = 134，超限标红提示（不阻止添加）
check("中队上限为 1/3 舰队分数(134)", calc.squadronLimit === 134, "squadronLimit=" + calc.squadronLimit);
check("当前未超中队上限", !calc.isOverSquadronLimit);
const sqBudgetFleet = { ...fleet, ships: [], squadrons: [], pointsLimit: 400 };
const sqGen = data.cards.squadrons.find((c) => c.faction === "imperial" && !c.unique && c.points != null);
const copies = Math.floor(134 / sqGen.points) + 1; // 保证总分 > 134
for (let i = 0; i < copies; i++) sqBudgetFleet.squadrons.push({ instanceId: "sq-b" + i, cardId: sqGen.id });
const sqCalc = FleetCalculator.calculateFleetPoints(data, sqBudgetFleet);
check("中队总分超 1/3 上限时 isOverSquadronLimit=true",
  sqCalc.isOverSquadronLimit && sqCalc.squadrons > sqCalc.squadronLimit,
  "squadrons=" + sqCalc.squadrons + " limit=" + sqCalc.squadronLimit);
const sqOverHtml = FleetRender.renderOverview(data, sqBudgetFleet, sqCalc);
check("中队超限渲染标红(over + 提示)", sqOverHtml.includes("section-pts over") && sqOverHtml.includes("超出中队上限"), "render squad warn");

// JSON 序列化（task.md §28）
const json = JSON.parse(JSON.stringify(fleet));
check("军表可 JSON 序列化且结构完整",
  Array.isArray(json.ships) && Array.isArray(json.squadrons) &&
  typeof json.objectives === "object" && json.faction === "imperial" && json.version === 1);

/* ---------------- Commander（舰队级 + 槽位图标 + 总览顶部展示） ---------------- */
// 仅统计槽位图标行的指挥官槽位（排除顶部 fleet-commander 块的 cmd-change）
function cmdSlotCount(html) {
  return (html.match(/class="slot-btn[^"]*" data-action="open-upgrade"[^>]*data-slot="commander"/g) || []).length;
}
overview = els["fleet-overview"].innerHTML;
check("无指挥官时每艘舰显示指挥官槽位图标", cmdSlotCount(overview) === 1, "count=" + cmdSlotCount(overview));
check("无指挥官时不显示舰队指挥官块", !overview.includes("fleet-commander"));
const cmdShipId = (overview.match(/data-action="remove-ship" data-id="([^"]+)"/) || [])[1];
check("当前有舰船可装指挥官", !!cmdShipId, cmdShipId);

clickBtn("fleet-overview", { action: "open-upgrade", id: cmdShipId, slot: "commander" });
check("指挥官选择器打开(选择指挥官)", els["selector-root"].innerHTML.includes("选择指挥官"));
check("指挥官列表只列指挥官卡(不列军官)", selBodyEl.innerHTML.includes("康斯坦丁") && !selBodyEl.innerHTML.includes("奇拉内奥"));
// FAQ 开关：所有卡类选择器都显示“显示FAQ”（默认隐藏），勾选后卡上出现独立 faq 段
check("指挥官选择器顶部含 显示FAQ 开关", els["selector-root"].innerHTML.includes('data-action="pref-faq"'));
check("默认隐藏 FAQ(莫蒂 faq 段不在)", !selBodyEl.innerHTML.includes("伤害卡数量"));
prefChange("pref-faq", true);
check("勾选后指挥官卡显示 FAQ(莫蒂·伤害卡数量)", selBodyEl.innerHTML.includes("伤害卡数量"));
prefChange("pref-faq", false);
check("取消后 FAQ 段消失", !selBodyEl.innerHTML.includes("伤害卡数量"));
selClick({ action: "sel-pick", id: "commander_001" });
overview = els["fleet-overview"].innerHTML;
check("选择后 Commander 存入 Fleet 级状态", fleet.commander === "commander_001" && fleet.commanderShipId === cmdShipId,
  JSON.stringify({ c: fleet.commander, s: fleet.commanderShipId }));
check("总览顶部显示指挥官块(含卡图+名称)", overview.includes("fleet-commander") && overview.includes("康斯坦丁"));
check("旗舰保留指挥官槽位图标(已装备)", cmdSlotCount(overview) === 1 && overview.includes('slot-btn is-equipped" data-action="open-upgrade" data-id="' + cmdShipId + '" data-slot="commander"'));
check("指挥官点数计入旗舰(78=55+23)", els["points-box"].innerHTML.includes("78"), els["points-box"].innerHTML);
check("指挥官卡图可点击放大(Lightbox)", overview.includes("Lightbox.open"));
// 指挥官作为升级卡显示在旗舰条目里（req: 一眼看出它在哪条船上）
check("指挥官在旗舰舰船条目中显示(带 指挥官 标签)",
  overview.includes('equip-item" data-slot="commander"') &&
  overview.includes('equip-slot-name">指挥官</span>') &&
  overview.includes("康斯坦丁"),
  "cmd-on-ship");

// 加第二艘舰：其余舰的指挥官槽位隐藏（仅旗舰保留）
clickBtn("action-bar", { action: "add-ship" });
selClick({ action: "sel-pick", id: "arquitens_command" });
overview = els["fleet-overview"].innerHTML;
check("其它舰指挥官槽位隐藏(只剩旗舰 1 个)", cmdSlotCount(overview) === 1, "count=" + cmdSlotCount(overview));

// 删除指挥官 -> 各舰指挥官槽位重新显示
clickBtn("fleet-overview", { action: "clear-upgrade", id: cmdShipId, slot: "commander" });
overview = els["fleet-overview"].innerHTML;
check("删除后 Fleet.commander 清除", fleet.commander === null && fleet.commanderShipId === null);
check("删除后各舰 Commander 槽位恢复", cmdSlotCount(overview) === 2 && !overview.includes("fleet-commander"),
  "count=" + cmdSlotCount(overview));

/* ---------------- Title（槽位图标 + unique 舰队级） ---------------- */
overview = els["fleet-overview"].innerHTML;
check("舰船含 称号 槽位图标(排在其他升级槽之后)", overview.includes('data-slot="title"') &&
  overview.indexOf('data-slot="title"') > overview.indexOf('data-slot="officer"'),
  "title@" + overview.indexOf('data-slot="title"') + " officer@" + overview.indexOf('data-slot="officer"'));
// 称号装备后：槽位图标变暗 + 舰船下方出现称号条目（可更换/删除）
clickBtn("fleet-overview", { action: "open-upgrade", id: cmdShipId, slot: "title" });
selClick({ action: "sel-pick", id: "imperial_title_001" });   // 阿奎腾斯级轻巡洋舰 限定
overview = els["fleet-overview"].innerHTML;
check("称号装备后舰船下方显示称号条目", overview.includes("半牛马号"));
check("称号槽位图标变暗", overview.includes('data-slot="title"') && /slot-btn is-equipped" data-action="open-upgrade"[^>]*data-slot="title"/.test(overview));

// unique 舰队级：副本舰队，同一 unique 称号不能出现在两艘舰
const titleFleet = {
  faction: "imperial", pointsLimit: 400, commander: null, commanderShipId: null,
  ships: [
    { instanceId: "ts-a", cardId: "imperial_i", title: "imperial_title_008", upgrades: [] },
    { instanceId: "ts-b", cardId: "imperial_i", title: null, upgrades: [] },
  ],
  squadrons: [], objectives: {},
};
r = FleetRules.canEquipUpgrade(data, titleFleet, titleFleet.ships[1], "title", sdTitle);
check("unique 称号不可在同一舰队另一舰重复选择(unique-name)", !r.allowed && r.reasons.includes("unique-name"), JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, titleFleet, titleFleet.ships[0], "title", sdTitle);
check("替换本舰同名 unique 称号允许", r.allowed);
r = FleetRules.canEquipUpgrade(data, titleFleet, titleFleet.ships[1], "title", data.title("imperial_title_007"));
check("非 unique 称号可重复装备", r.allowed, JSON.stringify(r.reasons));
titleFleet.ships[0].title = null;
r = FleetRules.canEquipUpgrade(data, titleFleet, titleFleet.ships[1], "title", sdTitle);
check("删除 unique 称号后其它舰可再选", r.allowed);

/* ---------------- Modification（数据字段 + 按自身槽装备 + 每舰 1 张） ---------------- */
const modTurbo = data.upgrade("turbolasers_001");    // 双联涡轮激光炮塔（改装）
const normalTurbo = data.upgrade("turbolasers_002"); // DBY-827重型涡轮激光炮（普通）
const modTurbo2 = data.upgrade("turbolasers_003");   // 另一张改装（涡旋涡轮激光）
check("改装卡 JSON 有 modification 字段(true)", modTurbo.modification === true, JSON.stringify(modTurbo.modification));
check("普通卡 modification===false", normalTurbo.modification === false, JSON.stringify(normalTurbo.modification));
check("改装卡正文已去除开头改装标签", !modTurbo.effect.trimStart().startsWith("改装"), modTurbo.effect.slice(0, 20));
r = FleetRules.canEquipUpgrade(data, fleet, shipA, "turbolasers", modTurbo);
check("改装卡按自身槽(涡轮激光)可装备", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, shipA, "turbolasers", modTurbo2);
check("未装改装时另一改装卡同槽可装备", r.allowed, JSON.stringify(r.reasons));
const shipWithMod = { ...shipA, upgrades: [{ slotIndex: 3, cardId: "turbolasers_001" }] };
r = FleetRules.canEquipUpgrade(data, fleet, shipWithMod, "turbolasers", modTurbo2);
check("已装备改装后其它改装不可选(modification-limit)", !r.allowed && r.reasons.includes("modification-limit"), JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, shipWithMod, "turbolasers", modTurbo, 3);
check("已装备改装可替换同一张", r.allowed);
r = FleetRules.canEquipUpgrade(data, fleet, shipWithMod, "turbolasers", normalTurbo);
check("已装备改装不影响普通卡装备", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, shipLargeNoFlag, "offensive_retrofit", flagshipBridge);
check("旗舰桥(改装)在进攻改装槽中仍需旗舰", !r.allowed && r.reasons.includes("flagship"), JSON.stringify(r.reasons));

// UI：改装卡出现在自然槽位选择器（带改装徽章）；已装改装后其它改装标红 + 提示
clickBtn("fleet-overview", { action: "open-upgrade", id: cmdShipId, slot: "turbolasers", slotIndex: "3" });
check("涡轮激光选择器含改装卡 + 普通卡", selBodyEl.innerHTML.includes("双联涡轮激光炮塔") && selBodyEl.innerHTML.includes("DBY-827"));
check("改装卡在 sel-meta 显示改装徽章", selBodyEl.innerHTML.includes("改装 · 涡轮激光"), "meta");
selClick({ action: "sel-pick", id: "turbolasers_001" });
overview = els["fleet-overview"].innerHTML;
check("装备后改装卡作为普通升级条目显示(名称+槽位名)", overview.includes("双联涡轮激光炮塔") && overview.includes('equip-slot-name">涡轮激光</span>'));
// 再开同槽：另一张改装卡标红 + 提示（普通卡不受影响）
clickBtn("fleet-overview", { action: "open-upgrade", id: cmdShipId, slot: "turbolasers", slotIndex: "3" });
check("已装改装后其它改装卡标红(sel-card is-blocked)", selBodyEl.innerHTML.includes('sel-card is-blocked"'), "blocked");
check("标红卡提示每艘船只能有一个改装类组件", selBodyEl.innerHTML.includes("每艘船只能有一个改装类组件"));
selClick({ action: "sel-pick", id: "turbolasers_003" });
check("点击标红改装卡不装备(pick 守卫)",
  FleetState.findShip(cmdShipId).upgrades.every(function (u) { return u.cardId !== "turbolasers_003"; }));
// 删除改装恢复
clickBtn("fleet-overview", { action: "clear-upgrade", id: cmdShipId, slot: "turbolasers", slotIndex: "3" });
overview = els["fleet-overview"].innerHTML;
check("删除改装卡后恢复", !overview.includes("双联涡轮激光炮塔"));

/* ---------------- 双槽卡：武器小组 / 进攻改装（占两槽、点数只计一次；占用时禁替换、任一侧被占不可选） ---------------- */
// 帝国I级歼星舰：slots[1]=weapons_team, slots[2]=offensive_retrofit
const dualShipSlots = ["officer", "weapons_team", "offensive_retrofit", "offensive_retrofit", "ion_cannons", "turbolasers"];
const dualInst = FleetState.addShip("imperial_i", dualShipSlots);
const dualIdxWT = dualShipSlots.indexOf("weapons_team");          // 1
const dualIdxOR = dualShipSlots.indexOf("offensive_retrofit");    // 2
const boarding = data.upgrade("weapons_team_017");   // 登舰步兵（中性 双槽 非 unique）
const boarding2 = data.upgrade("weapons_team_016");  // 登舰工兵（中性 双槽 非 unique）
const singleWT = data.upgrade("weapons_team_007");   // 火控组（中性 单槽）

r = FleetRules.canEquipUpgrade(data, fleet, dualInst, "weapons_team", boarding, dualIdxWT);
check("双槽卡可装 武器小组 槽", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, dualInst, "offensive_retrofit", boarding, dualIdxOR);
check("双槽卡也可装 进攻改装 槽", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, dualInst, "offensive_retrofit", singleWT, dualIdxOR);
check("单槽武器小组卡不可装 进攻改装 槽(slot)", !r.allowed && r.reasons.includes("slot"), JSON.stringify(r.reasons));

// 状态：装进 武器小组 且 进攻改装 空闲 → 两槽都占用（兄弟槽写 shared），点数只计一次
FleetState.setUpgrade(dualInst.instanceId, dualIdxWT, boarding.id, dualIdxOR);
check("双槽卡装备后两槽都被占用(兄弟槽 shared)", dualInst.upgrades[dualIdxWT].cardId === boarding.id &&
  dualInst.upgrades[dualIdxOR].cardId === boarding.id &&
  dualInst.upgrades[dualIdxOR].shared === true,
  JSON.stringify(dualInst.upgrades.map(function (u) { return { i: u.slotIndex, c: u.cardId, s: u.shared }; })));
const dualCalc = FleetCalculator.calculateFleetPoints(data, fleet);
const dualShipCalc = dualCalc.perShip.find(function (p) { return p.instanceId === dualInst.instanceId; });
check("双槽卡点数只计一次", dualShipCalc.total === 110 + boarding.points, "total=" + dualShipCalc.total);
overview = FleetRender.renderOverview(data, fleet, dualCalc);
function shipEntryBlock(html, instanceId) {
  // 按条目开头切分：包含该 remove-ship 的整段即该舰完整条目（含 slot-row / ship-equips）
  const marker = 'data-action="remove-ship" data-id="' + instanceId + '"';
  const parts = html.split('<div class="ship-entry">');
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].indexOf(marker) !== -1) return parts[i];
  }
  return "";
}
const dualBlock = shipEntryBlock(overview, dualInst.instanceId);
check("渲染：双槽卡在舰船下方只显示一个条目(shared 跳过)", (dualBlock.match(/equip-item/g) || []).length === 1,
  "items=" + (dualBlock.match(/equip-item/g) || []).length);
check("渲染：双槽卡条目带 武器小组 槽位名", dualBlock.includes('equip-slot-name">武器小组</span>') && dualBlock.includes("登舰步兵"));
check("渲染：进攻改装槽位图标标注双槽共用", dualBlock.includes("双槽共用"));
check("渲染：两个槽位图标都变暗且锁定(不可直接替换)",
  (dualBlock.match(/slot-btn is-equipped is-locked"/g) || []).length === 2 &&
  /data-slot="weapons_team" data-slot-index="1"/.test(dualBlock) &&
  /data-slot="offensive_retrofit" data-slot-index="2"/.test(dualBlock) &&
  !dualBlock.includes('slot-btn is-equipped" data-action="open-upgrade"'),
  "locked-btns=" + (dualBlock.match(/slot-btn is-equipped is-locked"/g) || []).length);
check("渲染：双槽卡条目的更换按钮禁用(equip-open is-locked + disabled)",
  dualBlock.includes('equip-open is-locked"') && dualBlock.includes("disabled"));

// 双槽卡占用时，两个被占槽位都不可替换（rule dual-locked）——另一张双槽卡 / 单槽卡 / 同一张 全被拒
r = FleetRules.canEquipUpgrade(data, fleet, dualInst, "weapons_team", boarding2, dualIdxWT);
check("双槽卡占用时替换为另一双槽卡被拒(dual-locked)", !r.allowed && r.reasons.includes("dual-locked"), JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, dualInst, "weapons_team", singleWT, dualIdxWT);
check("双槽卡占用时替换为单槽卡被拒(dual-locked)", !r.allowed && r.reasons.includes("dual-locked"), JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, dualInst, "weapons_team", boarding, dualIdxWT);
check("双槽卡占用时替换为同一张也被拒(dual-locked)", !r.allowed && r.reasons.includes("dual-locked"), JSON.stringify(r.reasons));

// 删除共享槽 → 双槽整组清除（两槽重新开放）
FleetState.setUpgrade(dualInst.instanceId, dualIdxOR, null, null);
check("删除共享槽后双槽整组清除", dualInst.upgrades[dualIdxWT].cardId === null && dualInst.upgrades[dualIdxOR].cardId === null);
r = FleetRules.canEquipUpgrade(data, fleet, dualInst, "weapons_team", boarding, dualIdxWT);
check("删除后双槽卡可重新装备(槽位重新开放)", r.allowed, JSON.stringify(r.reasons));

// 清空后装一张单槽卡占 武器小组 → 双槽卡在 进攻改装 槽不可选(dual-slot)，提示指出另一槽已占用
FleetState.setUpgrade(dualInst.instanceId, dualIdxWT, singleWT.id, null);
r = FleetRules.canEquipUpgrade(data, fleet, dualInst, "offensive_retrofit", boarding, dualIdxOR);
check("兄弟槽已占用时双槽卡被拒(dual-slot)", !r.allowed && r.reasons.includes("dual-slot") && !r.reasons.includes("dual-locked"), JSON.stringify(r.reasons));
const dualHint = FleetRules.dualSlotHint(data, dualInst, boarding);
check("双槽卡提示指出另一槽已占用(武器小组已有升级卡)", dualHint.includes("武器小组已有升级卡"), dualHint);

// UI：进攻改装槽打开选择器 → 双槽卡标红 + 提示（不可选），点击不装备
clickBtn("fleet-overview", { action: "open-upgrade", id: dualInst.instanceId, slot: "offensive_retrofit", slotIndex: String(dualIdxOR) });
check("UI 双槽卡在选择器标红(sel-card is-blocked)", selBodyEl.innerHTML.includes('sel-card is-blocked"'));
check("UI 标红双槽卡提示 另一槽位武器小组已有升级卡", selBodyEl.innerHTML.includes("另一槽位武器小组已有升级卡"));
check("UI 双槽卡在选择器 meta 显示 武器小组 / 进攻改装", selBodyEl.innerHTML.includes("武器小组 / 进攻改装"));
selClick({ action: "sel-pick", id: boarding.id });
check("UI 点击标红双槽卡不装备(pick 守卫)", dualInst.upgrades[dualIdxOR].cardId !== boarding.id);
selClick({ action: "sel-close" });

// 清空后走 UI 选择流程：进攻改装槽选双槽卡 → 两槽都占用
FleetState.setUpgrade(dualInst.instanceId, dualIdxWT, null, null);
FleetState.setUpgrade(dualInst.instanceId, dualIdxOR, null, null);
clickBtn("fleet-overview", { action: "open-upgrade", id: dualInst.instanceId, slot: "offensive_retrofit", slotIndex: String(dualIdxOR) });
check("清空后双槽卡在选择器可选中(非标红)", selBodyEl.innerHTML.includes("武器小组 / 进攻改装") && !selBodyEl.innerHTML.includes('sel-card is-blocked"'));
selClick({ action: "sel-pick", id: boarding.id });
check("UI 选双槽卡后两槽都被占用", dualInst.upgrades[dualIdxOR].cardId === boarding.id &&
  dualInst.upgrades[dualIdxWT].cardId === boarding.id &&
  dualInst.upgrades[dualIdxWT].shared === true,
  JSON.stringify(dualInst.upgrades.map(function (u) { return { i: u.slotIndex, c: u.cardId, s: u.shared }; })));
FleetState.removeShip(dualInst.instanceId);

/* ---------------- 每舰同一张升级卡最多一次（per-ship-duplicate） ---------------- */
// 同一艘舰两个同类型槽位（帝国I级 原生 offensive_retrofit 双槽），同一张单槽卡不可装两次
const dupSlots = ["offensive_retrofit", "offensive_retrofit"];
const dupInst = FleetState.addShip("imperial_i", dupSlots);
const comms = data.upgrade("offensive_retrofit_002"); // 强力通讯（中性 单槽）
FleetState.setUpgrade(dupInst.instanceId, 0, comms.id, null);
r = FleetRules.canEquipUpgrade(data, fleet, dupInst, "offensive_retrofit", comms, 1);
check("per-ship：同一张卡装进该舰第二个同类型槽被拒", !r.allowed && r.reasons.includes("per-ship-duplicate"), JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, dupInst, "offensive_retrofit", data.upgrade("offensive_retrofit_007"), 1);
check("per-ship：不同单槽卡可装第二个槽", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, dupInst, "offensive_retrofit", comms, 0);
check("per-ship：替换/重选同槽位自身不误报", r.allowed, JSON.stringify(r.reasons));
FleetState.removeShip(dupInst.instanceId);

/* ---------------- 加槽卡：数据字段 + 状态(加槽/清理) + 规则(adds-slots) + 渲染/选择器 ---------------- */
// 数据：7 张加槽卡 addsSlots 字段 + 3 张带 reject（卡面写明"已有该槽则不能装备"）
check("旗舰舰桥 addsSlots=fleet_command", (data.upgrade("offensive_retrofit_006").addsSlots || []).join(",") === "fleet_command");
check("喷火兽号 addsSlots+reject(fleet_command)", data.title("imperial_title_009").addsSlots[0] === "fleet_command" &&
  JSON.stringify(data.title("imperial_title_009").addsSlotsReject) === JSON.stringify({ slots: ["fleet_command"] }));
check("解放者号 addsSlots+reject(fleet_command)", data.title("rebel_title_005").addsSlots[0] === "fleet_command" &&
  !!data.title("rebel_title_005").addsSlotsReject);
check("图阿部长 addsSlots+reject(仅中/大型已有防御改装)", data.upgrade("officer_021").addsSlots[0] === "defensive_retrofit" &&
  JSON.stringify(data.upgrade("officer_021").addsSlotsReject) === JSON.stringify({ slots: ["defensive_retrofit"], sizes: ["medium", "large"] }));
check("蹂躏号 addsSlots=support_team 无 reject", data.title("imperial_title_029").addsSlots[0] === "support_team" && !data.title("imperial_title_029").addsSlotsReject);
check("前卫号 addsSlots=weapons_team 无 reject", data.title("rebel_title_025").addsSlots[0] === "weapons_team" && !data.title("rebel_title_025").addsSlotsReject);
check("凤凰之巢号 addsSlots=officer 无 reject", data.title("rebel_title_027").addsSlots[0] === "officer" && !data.title("rebel_title_027").addsSlotsReject);

// 状态+UI：旗舰舰桥(大型旗舰 ISD) 装备 → 追加 fleet_command 子槽；装子卡后删除加槽卡 → 子槽+子卡一起清理
const fbSlots = ["officer", "weapons_team", "offensive_retrofit", "offensive_retrofit", "ion_cannons", "turbolasers"];
const fbInst = FleetState.addShip("imperial_i", fbSlots);
const fbIdx = fbSlots.indexOf("offensive_retrofit");   // 2
fleet.commander = "commander_001";                      // 让 ISD 当旗舰（旗舰舰桥需旗舰）
fleet.commanderShipId = fbInst.instanceId;
clickBtn("fleet-overview", { action: "open-upgrade", id: fbInst.instanceId, slot: "offensive_retrofit", slotIndex: String(fbIdx) });
check("旗舰舰桥在选择器可选中(非标红)", selBodyEl.innerHTML.includes('data-action="sel-pick" data-id="offensive_retrofit_006"'));
check("选择器 meta 显示 增加槽位:舰队指挥", selBodyEl.innerHTML.includes("增加槽位:舰队指挥"));
selClick({ action: "sel-pick", id: "offensive_retrofit_006" });
const fcEntry = fbInst.upgrades.find(function (u) { return u.slotId === "fleet_command"; });
check("UI 选旗舰舰桥后追加 fleet_command 子槽", !!fcEntry && fcEntry.cardId === null && fcEntry.addedBy === fbIdx,
  JSON.stringify(fbInst.upgrades));
FleetState.setUpgrade(fbInst.instanceId, fcEntry.slotIndex, "fleet_command_001");
check("追加的舰队指挥子槽可装舰队指挥卡", fbInst.upgrades.find(function (u) { return u.slotIndex === fcEntry.slotIndex; }).cardId === "fleet_command_001");
const fbCalc = FleetCalculator.calculateFleetPoints(data, fleet);
const fbBlock = shipEntryBlock(FleetRender.renderOverview(data, fleet, fbCalc), fbInst.instanceId);
check("渲染：追加子槽带(升级添加)标记", fbBlock.includes("（升级添加）") && /data-slot="fleet_command"/.test(fbBlock));
FleetState.setUpgrade(fbInst.instanceId, fbIdx, null);   // 卸下旗舰舰桥
check("删除加槽卡后子槽连同子卡一起清理(不留孤儿组件)",
  !fbInst.upgrades.some(function (u) { return u.slotId === "fleet_command"; }) &&
  !fbInst.upgrades.some(function (u) { return u.cardId === "fleet_command_001"; }),
  JSON.stringify(fbInst.upgrades));
FleetState.removeShip(fbInst.instanceId);                // 顺带清除舰队指挥官
check("清理后舰队指挥官已清除", fleet.commander === null && fleet.commanderShipId === null);

// 称号加槽：蹂躏号(胜利级) 经 setTitle 追加 support_team 子槽；setTitle(null) 整组清理
const victInst = FleetState.addShip("victory_i", ["officer", "weapons_team", "offensive_retrofit", "ordnance", "turbolasers"]);
FleetState.setTitle(victInst.instanceId, "imperial_title_029", data.title("imperial_title_029").addsSlots);
const stEntry = victInst.upgrades.find(function (u) { return u.slotId === "support_team"; });
check("称号加槽卡(setTitle)追加支援小组子槽(addedBy=title)", !!stEntry && stEntry.cardId === null && stEntry.addedBy === "title", JSON.stringify(victInst.upgrades));
FleetState.setTitle(victInst.instanceId, "imperial_title_029", data.title("imperial_title_029").addsSlots);
check("setTitle 重设同名称号不重复追加子槽", victInst.upgrades.filter(function (u) { return u.slotId === "support_team"; }).length === 1);
FleetState.setTitle(victInst.instanceId, null);
check("setTitle(null) 清理称号添加的子槽", !victInst.upgrades.some(function (u) { return u.addedBy === "title"; }), JSON.stringify(victInst.upgrades));
FleetState.removeShip(victInst.instanceId);

// 规则 adds-slots：仅卡面写明"已有该槽则不能装备"的卡拒绝
const chimaera = data.title("imperial_title_009");
r = FleetRules.canEquipUpgrade(data, fleet, { instanceId: "t-cymoon", cardId: "imperial_cymoon", title: null, upgrades: [] }, "title", chimaera);
check("喷火兽号：native 已有舰队指挥槽被拒(adds-slots)", !r.allowed && r.reasons.includes("adds-slots"), JSON.stringify(r.reasons));
const addsHint = FleetRules.addsSlotsHint(data, { instanceId: "t-cymoon", cardId: "imperial_cymoon", title: null, upgrades: [] }, chimaera, "title", null);
check("喷火兽号拒绝提示指出已有 舰队指挥", addsHint.includes("舰队指挥"), addsHint);
r = FleetRules.canEquipUpgrade(data, fleet, { instanceId: "t-isd", cardId: "imperial_i", title: null, upgrades: [] }, "title", chimaera);
check("喷火兽号：无舰队指挥槽的帝国I级可装(并加槽)", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet,
  { instanceId: "t-isd2", cardId: "imperial_i", title: "imperial_title_009",
    upgrades: [{ slotIndex: 6, cardId: null, slotId: "fleet_command", addedBy: "title" }] }, "title", chimaera);
check("喷火兽号：重选同一张不误报(排除自身加槽)", r.allowed, JSON.stringify(r.reasons));

// 图阿部长：中/大型已有防御改装 → 拒；小型已有防御改装 → 允许；中型无防御改装 → 允许
const tua = data.upgrade("officer_021");
r = FleetRules.canEquipUpgrade(data, fleet, { instanceId: "t-isdii", cardId: "imperial_ii", title: null, upgrades: [] }, "officer", tua, 0);
check("图阿部长：大型已有防御改装被拒(adds-slots)", !r.allowed && r.reasons.includes("adds-slots"), JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, { instanceId: "t-arq", cardId: "arquitens_command", title: null, upgrades: [] }, "officer", tua, 0);
check("图阿部长：小型已有防御改装仍可装(规模限制)", r.allowed, JSON.stringify(r.reasons));
r = FleetRules.canEquipUpgrade(data, fleet, { instanceId: "t-vic", cardId: "victory_i", title: null, upgrades: [] }, "officer", tua, 0);
check("图阿部长：中型无防御改装可装", r.allowed, JSON.stringify(r.reasons));

// 无 reject 的加槽卡：已有该槽仍可装（卡面未限制）
const harrow = data.title("imperial_title_029");
r = FleetRules.canEquipUpgrade(data, fleet,
  { instanceId: "t-vst", cardId: "victory_i", title: null,
    upgrades: [{ slotIndex: 5, cardId: null, slotId: "support_team", addedBy: 3 }] }, "title", harrow);
check("蹂躏号：已有支援小组(非自身)仍可装(无 reject)", r.allowed, JSON.stringify(r.reasons));

// UI blocked 渲染：喷火兽号在已有舰队指挥的赛蒙号上标红 + 提示，点击不装备
const cymoonBlockShip = FleetState.addShip("imperial_cymoon", ["officer", "weapons_team", "fleet_command", "offensive_retrofit", "turbolasers", "turbolasers"]);
clickBtn("fleet-overview", { action: "open-upgrade", id: cymoonBlockShip.instanceId, slot: "title" });
check("喷火兽号在已有舰队指挥的舰上标红(sel-card is-blocked)", selBodyEl.innerHTML.includes('data-blocked="1"'));
check("标红喷火兽号提示 卡面限制", selBodyEl.innerHTML.includes("卡面限制"));
selClick({ action: "sel-pick", id: "imperial_title_009" });
check("点击标红喷火兽号不装备(pick 守卫)", cymoonBlockShip.title === null);
selClick({ action: "sel-close" });
FleetState.removeShip(cymoonBlockShip.instanceId);

/* ---------------- Unique 全局唯一（按 nameEn 跨卡牌类型，如 •Darth Vader） ---------------- */
// 副本舰队：指挥官为 达斯 维达 → 军官/双槽武器小组 的 达斯 维达 都被挡
const uniqueFleet = {
  faction: "imperial", pointsLimit: 400, commander: "commander_007", commanderShipId: "uf-flag",
  ships: [{ instanceId: "uf-flag", cardId: "imperial_i", title: null, upgrades: [{ slotIndex: 0, cardId: null }] }],
  squadrons: [], objectives: {},
};
const vaderOfficer = data.upgrade("officer_013");
const vaderWT = data.upgrade("weapons_team_002");
r = FleetRules.canEquipUpgrade(data, uniqueFleet, uniqueFleet.ships[0], "officer", vaderOfficer, 0);
check("同名 unique(军官 达斯 维达)被指挥官挡住(unique-name)", !r.allowed && r.reasons.includes("unique-name"), JSON.stringify(r.reasons));
const vaderHint = FleetRules.uniqueNameHint(data, uniqueFleet, vaderOfficer, null);
check("冲突提示含 槽位名+中文名(舰队中已存在同名卡：指挥官 达斯 维达)", vaderHint.includes("舰队中已存在同名卡：指挥官 达斯 维达"), vaderHint);
r = FleetRules.canEquipUpgrade(data, uniqueFleet, uniqueFleet.ships[0], "weapons_team", vaderWT, 1);
check("同名 unique(双槽 达斯 维达)也被挡住", !r.allowed && r.reasons.includes("unique-name"), JSON.stringify(r.reasons));
// 替换本槽同名卡：当前槽位就是同一张 → 不算冲突
const vaderShip = { instanceId: "uf-v2", cardId: "imperial_i", title: null, upgrades: [{ slotIndex: 0, cardId: "officer_013" }] };
r = FleetRules.canEquipUpgrade(data,
  { faction: "imperial", pointsLimit: 400, commander: null, commanderShipId: null, ships: [vaderShip], squadrons: [], objectives: {} },
  vaderShip, "officer", vaderOfficer, 0);
check("替换本槽同名卡不算冲突(排除当前占用)", r.allowed, JSON.stringify(r.reasons));
// 同名卡在另一舰（同一军官槽）仍冲突
const vaderFleet3 = {
  faction: "imperial", pointsLimit: 400, commander: null, commanderShipId: null,
  ships: [
    { instanceId: "uf-a", cardId: "imperial_i", title: null, upgrades: [{ slotIndex: 0, cardId: "officer_013" }] },
    { instanceId: "uf-b", cardId: "imperial_i", title: null, upgrades: [{ slotIndex: 0, cardId: null }] },
  ],
  squadrons: [], objectives: {},
};
r = FleetRules.canEquipUpgrade(data, vaderFleet3, vaderFleet3.ships[1], "officer", vaderOfficer, 0);
check("同名卡在另一舰仍冲突(unique-name)", !r.allowed && r.reasons.includes("unique-name"), JSON.stringify(r.reasons));

// UI blocked 渲染：真实军表先装军官 达斯 维达 → 指挥官选择器里 指挥官 达斯 维达 标红 + 提示
const blockShipId = (els["fleet-overview"].innerHTML.match(/data-action="remove-ship" data-id="([^"]+)"/) || [])[1];
FleetState.setUpgrade(blockShipId, 0, "officer_013");
clickBtn("fleet-overview", { action: "open-upgrade", id: blockShipId, slot: "commander" });
check("同名冲突卡在选择界面标红(sel-card is-blocked)", selBodyEl.innerHTML.includes('sel-card is-blocked"'));
check("标红卡提示 舰队中已存在同名卡：军官 达斯 维达", selBodyEl.innerHTML.includes("舰队中已存在同名卡：军官 达斯 维达"));
selClick({ action: "sel-pick", id: "commander_007" });
check("点击标红同名卡不装备(pick 守卫)", fleet.commander === null);
selClick({ action: "sel-close" });
FleetState.setUpgrade(blockShipId, 0, null);

/* ---------------- 中队数量（非 unique 非 ace 单卡 + ± 调节，舰船不套用） ---------------- */
const qtySq = data.cards.squadrons.find((c) => c.faction === "imperial" && !c.unique && !c.ace && c.points != null);
check("帝国普通中队存在(用于数量测试)", !!qtySq, qtySq && qtySq.id);
for (let i = 0; i < 3; i++) {
  clickBtn("fleet-overview", { action: "add-squadron" });
  selClick({ action: "sel-pick", id: qtySq.id });
}
overview = els["fleet-overview"].innerHTML;
check("同一普通中队不产生多个卡片(单 chip)", (overview.match(/squadron-chip/g) || []).length === 1,
  "chips=" + (overview.match(/squadron-chip/g) || []).length);
check("单卡显示数量 ×3", overview.includes("×3"));
check("普通中队分数为 点数×数量", overview.includes((qtySq.points * 3) + " 分"));
// 数量调节：+ 不封顶（普通战机已去掉 limit），− 减 1
clickBtn("fleet-overview", { action: "squadron-inc", id: qtySq.id });
overview = els["fleet-overview"].innerHTML;
check("数量 + 到 4", overview.includes("×4"));
check("普通战机无上限 + 按钮不禁用(无 is-max)", !overview.includes('sq-step is-max"'));
clickBtn("fleet-overview", { action: "squadron-inc", id: qtySq.id });   // 继续加到 5
overview = els["fleet-overview"].innerHTML;
check("数量 + 到 5 仍可继续(不封顶)", overview.includes("×5") && fleet.squadrons.length === 5, "count=" + fleet.squadrons.length);
clickBtn("fleet-overview", { action: "squadron-dec", id: qtySq.id });
overview = els["fleet-overview"].innerHTML;
check("数量 − 回 4", overview.includes("×4"));
// × 删除整组
clickBtn("fleet-overview", { action: "squadron-del", id: qtySq.id });
check("删除后该中队全部移除", !fleet.squadrons.some(function (s) { return s.cardId === qtySq.id; }));
// unique 中队：单卡，无数量调节（不出现 sq-stepper）
const qtyUnique = data.cards.squadrons.find((c) => c.faction === "imperial" && c.unique && c.points != null);
clickBtn("fleet-overview", { action: "add-squadron" });
selClick({ action: "sel-pick", id: qtyUnique.id });
overview = els["fleet-overview"].innerHTML;
check("unique 中队单卡无数量调节", overview.includes(qtyUnique.name) && !overview.includes("sq-stepper"));
// 舰船不套用数量逻辑
check("舰船不套用中队数量逻辑", !overview.includes("sq-stepper"));

/* ================ 军表存取（FleetIO：序列化 / 压缩 / 导入重建 / 自动存档） ================ */
// 构造“现场”军表（live shape：instanceId/commanderShipId/shared 齐全），序列化后走导入管线还原
const liveFleet = {
  faction: "imperial", pointsLimit: 400, name: "测试军表",
  commander: "commander_001", commanderShipId: "live-0",
  ships: [
    {
      instanceId: "live-0", cardId: "imperial_i", title: null,
      upgrades: [
        { slotIndex: 2, cardId: "offensive_retrofit_006" },                    // 旗舰舰桥 → 加 fleet_command 子槽
        { slotIndex: 6, slotId: "fleet_command", addedBy: 2, cardId: "fleet_command_001" },  // 子槽
        { slotIndex: 1, cardId: "weapons_team_017" },                          // 双槽主条目
        { slotIndex: 3, cardId: "weapons_team_017", shared: true },            // 双槽兄弟条目
        { slotIndex: 0, cardId: "officer_001" },
      ],
    },
    {
      instanceId: "live-1", cardId: "victory_i", title: "imperial_title_029",
      upgrades: [
        { slotIndex: 0, cardId: "officer_001" },
        { slotIndex: 5, slotId: "support_team", addedBy: "title", cardId: null },  // 空子槽（serialize 会滤掉，重建时由称号重铺）
      ],
    },
  ],
  squadrons: [{ instanceId: "q-1", cardId: "imperial_squadrons_001" }],
  objectives: { assault: "advanced_gunnery", defense: null, navigation: null },
};

const serialized = FleetIO.serializePlain(liveFleet);
const parsed = JSON.parse(serialized);
check("序列化包含 版本2 + app 标识", parsed.version === 2 && parsed.app === "sw-armada-fleet-builder");
check("序列化不含 instanceId / shared", !JSON.stringify(parsed.ships).includes("instanceId") && !JSON.stringify(parsed.ships).includes("shared"));
check("序列化含 commanderShipIndex", parsed.commanderShipIndex === 0, "idx=" + parsed.commanderShipIndex);

const r1 = await FleetIO.importFromText(serialized, data);
check("明文导入 ok + faction 供切页判断", r1.ok && r1.faction === "imperial", JSON.stringify(r1.error));
check("明文导入无警告", r1.warnings.length === 0, JSON.stringify(r1.warnings));
const n1 = r1.fleet;
check("导入后版本归一为 2 + 舰船数 2", n1.version === 2 && n1.ships.length === 2);
check("导入后指挥官保留(commanderShipIndex)", n1.commander === "commander_001" && n1.commanderShipIndex === 0);
const s0 = n1.ships[0];
check("双槽卡重建占两槽且兄弟条目标 shared",
  s0.upgrades.filter(function (u) { return u.cardId === "weapons_team_017"; }).length === 2 &&
  s0.upgrades.find(function (u) { return u.slotIndex === 3; }).shared === true,
  JSON.stringify(s0.upgrades));
check("加槽子槽还原(slotId+addedBy=实际父槽)",
  s0.upgrades.some(function (u) { return u.slotId === "fleet_command" && u.addedBy === 2 && u.cardId === "fleet_command_001"; }),
  JSON.stringify(s0.upgrades));
check("原生槽无 slotId", s0.upgrades.every(function (u) { return !u.slotId || u.slotId === "fleet_command"; }));
check("称号加槽子槽重铺(addedBy=title)",
  n1.ships[1].title === "imperial_title_029" &&
  n1.ships[1].upgrades.some(function (u) { return u.slotId === "support_team" && u.addedBy === "title"; }),
  JSON.stringify(n1.ships[1].upgrades));
check("中队/任务卡保留", n1.squadrons.length === 1 && n1.objectives.assault === "advanced_gunnery");

// 压缩格式：FA2: 前缀 + 导入还原一致
const compressed = await FleetIO.exportCompressed(liveFleet);
check("压缩串以 FA2: 开头", compressed.startsWith("FA2:"), compressed.slice(0, 20));
const r2 = await FleetIO.importFromText(compressed, data);
check("压缩导入 ok 且结构一致", r2.ok && r2.fleet.faction === "imperial" && r2.fleet.ships.length === 2, JSON.stringify(r2.error));

// 槽位错位：原生槽 slotIndex 故意改成越界 99 → 按类型归位 + slot-rematched 警告
const corrupt = JSON.parse(serialized);
corrupt.ships[0].upgrades.forEach(function (u) { if (u.cardId === "officer_001") u.slotIndex = 99; });
const r3 = await FleetIO.importFromText(JSON.stringify(corrupt), data);
check("槽位错位按类型归位(越界 slotIndex→0)",
  r3.fleet.ships[0].upgrades.some(function (u) { return u.slotIndex === 0 && u.cardId === "officer_001"; }),
  JSON.stringify(r3.fleet.ships[0].upgrades));
check("槽位错位触发 slot-rematched 警告",
  r3.warnings.some(function (w) { return w.type === "slot-rematched"; }), JSON.stringify(r3.warnings));

// 未知卡：未知舰船整艘跳过 + 警告；未知升级仅该卡跳过
const unk = JSON.parse(serialized);
unk.ships.push({ cardId: "nonexistent_ship_xyz", title: null, upgrades: [] });
unk.ships[0].upgrades.push({ slotIndex: 0, cardId: "nonexistent_upg_xyz" });
const r4 = await FleetIO.importFromText(JSON.stringify(unk), data);
check("未知舰船整艘跳过 + 警告", r4.fleet.ships.length === 2 && r4.warnings.some(function (w) { return w.type === "ship"; }));
check("未知升级仅该卡跳过(舰保留)",
  r4.fleet.ships[0].upgrades.every(function (u) { return u.cardId !== "nonexistent_upg_xyz"; }) &&
  r4.warnings.some(function (w) { return w.type === "upgrade"; }));

// 版本：999 拒绝（newer-version）；1 正常导入并归一
const ver999 = JSON.parse(serialized); ver999.version = 999;
const r5 = await FleetIO.importFromText(JSON.stringify(ver999), data);
check("版本 999 拒绝(newer-version)", !r5.ok && r5.error.code === "newer-version", JSON.stringify(r5.error));
const ver1 = JSON.parse(serialized); ver1.version = 1;
const r6 = await FleetIO.importFromText(JSON.stringify(ver1), data);
check("版本 1 可导入且归一为 2", r6.ok && r6.fleet.version === 2);

// 非法数据
const r7a = await FleetIO.importFromText("not json at all", data);
check("非 JSON → parse-error", !r7a.ok && r7a.error.code === "parse-error");
const r7b = await FleetIO.importFromText("FA2:%%%not-base64%%%", data);
check("坏压缩串 → parse-error", !r7b.ok && r7b.error.code === "parse-error");
const r7c = await FleetIO.importFromText("[1,2,3]", data);
check("非对象 → not-a-fleet", !r7c.ok && r7c.error.code === "not-a-fleet");

// 落地：FleetState.load 原地替换，引用不变，指挥官 remap
const r8 = await FleetIO.importFromText(serialized, data);
const beforeLoad = FleetState.get();
FleetState.load(r8.fleet);
check("FleetState.load 原地变更(引用不变)", FleetState.get() === beforeLoad);
check("load 后 faction/点数/version 正确", FleetState.get().faction === "imperial" && FleetState.get().pointsLimit === 400 && FleetState.get().version === 2);
check("load 重编号 instanceId(ship-001…)", FleetState.get().ships[0].instanceId === "ship-001");
check("指挥官 remap 到新 instanceId",
  FleetState.get().commander === "commander_001" && FleetState.get().commanderShipId === FleetState.get().ships[0].instanceId);

// 指挥官挂载越界 → 移除 + 警告
const badCmd = JSON.parse(serialized); badCmd.commanderShipIndex = 99;
const r9 = await FleetIO.importFromText(JSON.stringify(badCmd), data);
check("指挥官挂载越界 → 移除 + 警告", r9.fleet.commander === null && r9.warnings.some(function (w) { return w.type === "commander"; }));

// 未知任务卡 → 置空 + 警告
const badObj = JSON.parse(serialized); badObj.objectives.assault = "objective_nope";
const r10 = await FleetIO.importFromText(JSON.stringify(badObj), data);
check("未知任务卡 → 置空 + 警告", r10.fleet.objectives.assault == null && r10.warnings.some(function (w) { return w.type === "objective"; }));

// 阵营不符卡 → 跳过 + 警告（officer_026 为义军限定）
const mix = JSON.parse(serialized);
mix.ships[0].upgrades.push({ slotIndex: 0, cardId: "officer_026" });
const r11 = await FleetIO.importFromText(JSON.stringify(mix), data);
check("阵营不符升级卡跳过 + 警告",
  r11.fleet.ships[0].upgrades.every(function (u) { return u.cardId !== "officer_026"; }) &&
  r11.warnings.some(function (w) { return w.type === "upgrade" && /阵营/.test(w.reason); }),
  JSON.stringify(r11.warnings));

// 自动存档：Map 桩写入 / 读回 / 清除；空表不落键
const AUTO_KEY = "armada.fleet.autosave.imperial";
_store.clear();
FleetIO.autosave(liveFleet);
check("自动存档写入键", _store.has(AUTO_KEY));
const savedParsed = JSON.parse(_store.get(AUTO_KEY));
check("自动存档可解析且含 faction/版本", savedParsed.faction === "imperial" && savedParsed.version === 2);
check("readAutosave 读回", FleetIO.readAutosave("imperial") === _store.get(AUTO_KEY));
check("readAutosave 无键返回 null", FleetIO.readAutosave("rebel") === null);
FleetIO.clearStorage("imperial");
check("clearStorage 删除键", !_store.has(AUTO_KEY));
FleetIO.autosave({ faction: "imperial", ships: [], squadrons: [], commander: null });
check("空表 autosave 不落键", !_store.has(AUTO_KEY));

// 恢复分支：损坏存档导入失败 → 清键；阵营不符存档 → 不落地
_store.set(AUTO_KEY, "{ not valid json !!!");
const r12 = await FleetIO.importFromText(_store.get(AUTO_KEY), data);
check("损坏存档导入失败(parse-error)", !r12.ok && r12.error.code === "parse-error");
if (!r12.ok) FleetIO.clearStorage("imperial");
check("损坏存档被清键", !_store.has(AUTO_KEY));
const rebelSave = FleetIO.serializePlain(Object.assign({}, liveFleet, { faction: "rebel" }));
const r13 = await FleetIO.importFromText(rebelSave, data);
check("存档 faction 供切页判断(异阵营)", r13.ok && r13.faction === "rebel");

/* ---------------- 打印版式（导出 PDF） ---------------- */
const _pc = FleetState.create("imperial", 400);
FleetState.addShip("imperial_i", ["officer", "weapons_team", "offensive_retrofit", "offensive_retrofit", "ion_cannons", "turbolasers"]);
const _s0 = FleetState.get().ships[0];
FleetState.setCommander(_s0.instanceId, "commander_001");
FleetState.setUpgrade(_s0.instanceId, 0, "officer_001", null, null);
FleetState.setUpgrade(_s0.instanceId, 1, "weapons_team_017", 2, null);   // 双槽
FleetState.setTitle(_s0.instanceId, "imperial_title_001", null);
FleetState.addSquadron("imperial_squadrons_001");                          // 反击1 + 护卫
FleetState.setObjective("assault", "advanced_gunnery");
const _calc = FleetCalculator.calculateFleetPoints(data, FleetState.get());
const psZh = FleetRender.renderPrintSheet(data, FleetState.get(), _calc, { printZh: true });
const psEn = FleetRender.renderPrintSheet(data, FleetState.get(), _calc, { printZh: false });
check("打印版式含 print-sheet + 舰船/升级/中队/任务卡卡片",
  psZh.includes("print-sheet") && psZh.includes("pc-card--ship") && psZh.includes("pc-card--upgrade") &&
  psZh.includes("pc-card--squadron") && psZh.includes("pc-card--objective"));
check("打印版式中文覆盖(printZh=true 含 pc-ov + 效果)", psZh.includes("pc-ov"));
check("指挥官不再单独成栏(无 ps-commander / pc-card--commander / ps-flagship)",
  !psZh.includes("ps-commander") && !psZh.includes("pc-card--commander") && !psZh.includes("ps-flagship"));
check("指挥官作为旗舰升级卡之一(含其卡图)",
  psZh.includes(data.upgrade("commander_001").image) && psZh.includes("pc-card--upgrade"));
check("打印版式关闭中文覆盖(printZh=false 无 pc-ov)", !psEn.includes("pc-ov"));
check("打印版式中队关键字覆盖(含 pc-kw)", psZh.includes("pc-kw"));
check("打印版式嵌入图标改用真实 <img>(armada-icon-img)",
  psZh.includes("armada-icon-img") && psZh.includes("icons/web/command-navigate.png") &&
  !psZh.includes('class="armada-icon armada-icon--command-navigate"'));
check("打印版式关闭中文覆盖无图标 img", !psEn.includes("armada-icon-img"));
check("ArmadaIcons.toHtml 默认仍为 mask span(非 img)",
  ArmadaIcons.toHtml("[[icon:attack-critical]]").includes("armada-icon--attack-critical") &&
  !ArmadaIcons.toHtml("[[icon:attack-critical]]").includes("armada-icon-img"));
check("ArmadaIcons.toHtml asImage 输出 <img> 且带 src",
  ArmadaIcons.toHtml("[[icon:attack-critical]]", {asImage: true}).includes('class="armada-icon-img"') &&
  ArmadaIcons.toHtml("[[icon:attack-critical]]", {asImage: true}).includes('src="icons/web/attack-critical.png"'));

console.log("\nfleet_test 结果: " + (failures === 0 ? "全部通过 ✓" : failures + " 项失败 ✗"));
process.exit(failures === 0 ? 0 : 1);
