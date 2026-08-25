// 任务卡一览 DOM stub 冒烟测试：真实执行 js/objectives/app.js 的渲染与交互
import fs from "node:fs";

// ---- 最小 DOM / window mock（按 id 返回独立元素） ----
function makeEl(id) {
  const el = {
    id,
    innerHTML: "",
    hidden: false,
    dataset: {},
    _ls: {},
    addEventListener(t, fn) { el._ls[t] = fn; },
    appendChild() {},
    remove() {},
    closest() { return null; },
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html; },
    set(v) { el._html = String(v); },
  });
  return el;
}
const els = {};
global.document = {
  getElementById(id) { return (els[id] ||= makeEl(id)); },
  createElement(tag) {
    const el = makeEl("created:" + tag);
    el._removed = false;
    el.remove = () => { el._removed = true; };
    created.push(el);
    return el;
  },
  body: { appendChild() {} },
};
const created = [];
global.window = global;
global.scrollTo = () => {};
// 直接读本地文件，避免起服务器
global.fetch = async (url) => {
  const u = String(url);
  const m = u.match(/(?:^|\/)data\/([^?#]+)$/);
  if (!m) throw new Error("unexpected url " + u);
  const body = fs.readFileSync("data/" + m[1], "utf8");
  return { ok: true, status: 200, async json() { return JSON.parse(body); } };
};

process.on("unhandledRejection", (e) => { console.error("!! unhandledRejection:", e); });

eval(fs.readFileSync("js/fleet/armada-icons.js", "utf8"));
eval(fs.readFileSync("js/objectives/app.js", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 等待渲染完成（tab 出现；元素引用须在异步加载后取得）
let tabsHtml = "";
for (let i = 0; i < 20 && !(tabsHtml = (els["tabs"] || {}).innerHTML || "").includes("data-cat"); i++) await sleep(100);
const tabs = els["tabs"], grid = els["grid"], empty = els["empty"];
if (!tabs || !tabs.innerHTML.includes("data-cat")) {
  console.error("!! 页面未渲染。grid:\n" + ((grid || {}).innerHTML || "").slice(0, 500));
  process.exit(1);
}

// tab 数量与默认分类
const tabCount = (tabs.innerHTML.match(/data-cat=/g) || []).length;
console.log("[tabs] 分类 tab:", tabCount, "| 含进攻/防御/导航:",
  tabs.innerHTML.includes("进攻"), tabs.innerHTML.includes("防御"), tabs.innerHTML.includes("导航"));

// 默认 assault 12 张
const assaultCards = (grid.innerHTML.match(/class="card" data-id=/g) || []).length;
console.log("[grid] 默认进攻分类卡片数:", assaultCards, "| 含 Advanced Gunnery:",
  grid.innerHTML.includes("Advanced Gunnery"), "| 含 20 分标记:", grid.innerHTML.includes("20"));

// 网格卡片内联全部规则段落（用户要求：任务信息展示完全；英文/FAQ 默认关闭）
console.log("[grid] 卡片内联规则段落 布设/特殊规则/回合结束/游戏结束:",
  grid.innerHTML.includes("布设"), grid.innerHTML.includes("特殊规则"),
  grid.innerHTML.includes("回合结束"), grid.innerHTML.includes("游戏结束"));
console.log("[grid] 卡片内联规则正文(Advanced Gunnery 布设全文):", grid.innerHTML.includes("选1个自己的战舰"));
console.log("[grid] 英文/FAQ 默认关闭(不含英文原文与FAQ):",
  !grid.innerHTML.includes("After deploying fleets"), !grid.innerHTML.includes("FAQ"));

// 顶部两个偏好开关：控制显示英文 / 显示FAQ（默认关闭）
const prefEn = els["pref-en"], prefFaq = els["pref-faq"];
console.log("[prefs] 顶部含 显示英文/显示FAQ 开关:", !!prefEn && !!prefFaq);
if (prefEn) { prefEn.checked = true; prefEn._ls.change({ target: prefEn }); }
console.log("[prefs] 开启英文后卡片显示英文原文:", grid.innerHTML.includes("After deploying fleets"),
  "| 中文规则仍在:", grid.innerHTML.includes("选1个自己的战舰"));
if (prefFaq) { prefFaq.checked = true; prefFaq._ls.change({ target: prefFaq }); }
console.log("[prefs] 开启FAQ后卡片显示FAQ:", grid.innerHTML.includes("FAQ"),
  "| 布设仍在:", grid.innerHTML.includes("布设"));
// 关闭英文/FAQ
if (prefEn) { prefEn.checked = false; prefEn._ls.change({ target: prefEn }); }
if (prefFaq) { prefFaq.checked = false; prefFaq._ls.change({ target: prefFaq }); }
console.log("[prefs] 重新关闭后 英文/FAQ 隐藏:", !grid.innerHTML.includes("After deploying fleets"), !grid.innerHTML.includes("FAQ"));
// 恢复开启（后续 detail 断言依赖英文显示）
if (prefEn) { prefEn.checked = true; prefEn._ls.change({ target: prefEn }); }
if (prefFaq) { prefFaq.checked = true; prefFaq._ls.change({ target: prefFaq }); }

// 切到 导航
let navBtn = { dataset: { cat: "navigation" }, closest(sel) { return sel === "[data-cat]" ? navBtn : null; } };
tabs._ls.click({ target: navBtn });
const navCards = (grid.innerHTML.match(/class="card" data-id=/g) || []).length;
console.log("[grid] 切换导航后卡片数:", navCards);

// 点击第一张卡 -> 弹层详情
const createdBefore = created.length;
const firstCard = { dataset: { id: grid.innerHTML.match(/data-id="([^"]+)"/)[1] }, closest(sel) { return sel === "[data-id]" ? firstCard : null; } };
grid._ls.click({ target: firstCard });
const overlay = created[createdBefore];
const detHtml = overlay.innerHTML;
console.log("[detail] 弹层已创建:", !!overlay, "| 含卡图:", detHtml.includes("det-img"),
  "| 含布设/特殊规则/游戏结束:", detHtml.includes("布设"), detHtml.includes("特殊规则"), detHtml.includes("游戏结束"),
  "| 含英文原文折叠:", detHtml.includes("英文原文"));

// 关闭弹层
overlay._ls.click({ target: { closest(sel) { return sel === "[data-close]" ? {} : null; } } });
console.log("[detail] 弹层已关闭:", overlay._removed);

// 空分类保护
let defenseBtn = { dataset: { cat: "defense" }, closest(sel) { return sel === "[data-cat]" ? defenseBtn : null; } };
tabs._ls.click({ target: defenseBtn });
const defCards = (grid.innerHTML.match(/class="card" data-id=/g) || []).length;
console.log("[grid] 防御分类卡片数:", defCards, "| empty 隐藏状态:", empty.hidden);

console.log("\n任务卡一览冒烟测试完成");
