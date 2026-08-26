// DOM stub 冒烟测试：真实执行 app.js 的渲染与交互
import fs from "node:fs";

const app = { html: "" };
const listeners = {};
const downloads = [];
const createdEls = [];

// ---- 最小 DOM / window mock ----
global.window = global;
global.scrollTo = () => {};
global.URL.createObjectURL = () => "blob:mock";
global.URL.revokeObjectURL = () => {};
// 浏览器里相对 URL 会相对页面地址解析；node 里需要补全为绝对地址
const BASE = "http://localhost:8123/";
const realFetch = global.fetch;
global.fetch = (url, opts) => realFetch(new URL(url, BASE).href, opts);

global.document = {
  getElementById(id) { return app; },
  createElement(tag) {
    const el = { className: "", textContent: "", innerHTML: "", dataset: {}, href: "", download: "", value: "", _removed: false };
    el.remove = () => { el._removed = true; };
    el.click = () => { if (el.download) downloads.push(el.download); };
    el.appendChild = () => {};
    el.addEventListener = (t, fn) => { el._ls = el._ls || {}; el._ls[t] = fn; };
    createdEls.push(el);
    return el;
  },
  body: { appendChild() {} },
};
Object.defineProperty(app, "innerHTML", {
  get() { return app.html; },
  set(v) { app.html = String(v); },
});
app.addEventListener = (t, fn) => { listeners[t] = fn; };

// ---- 事件模拟 ----
function clickBtn(dataset) {
  const el = { dataset, closest(sel) { return sel === "[data-action]" ? el : null; } };
  listeners.click({ target: el });
}
function inputField(field, value) {
  const el = { dataset: { field }, value, closest(sel) { return sel === "[data-field]" ? el : null; } };
  listeners.input({ target: el });
  listeners.change({ target: el });
}
function changeField(field, value) {
  const el = { dataset: { field }, value, closest(sel) { return sel === "[data-field]" ? el : null; } };
  listeners.change({ target: el });
}

process.on("unhandledRejection", (e) => { console.error("!! unhandledRejection:", e); });
process.on("uncaughtException", (e) => { console.error("!! uncaughtException:", e); });

// ---- 加载脚本（eval 全局作用域） ----
eval(fs.readFileSync("js/carddb/data.js", "utf8"));
console.log("[load] data.js CardDB 存在:", !!global.CardDB);
try {
  eval(fs.readFileSync("js/carddb/app.js", "utf8"));
} catch (e) {
  console.error("!! app.js 顶层异常:", e);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 等待异步加载完成
for (let i = 0; i < 20 && !app.html.includes("卡牌资料库"); i++) await sleep(100);
if (!app.html.includes("卡牌资料库")) {
  console.error("!! 首页未渲染。实际渲染内容：\n" + app.html.slice(0, 800));
  process.exit(1);
}
console.log("[home] 渲染 OK:", app.html.replace(/\n/g, " ").match(/<h1>([^<]+)<\/h1>/)[1]);

// 进入 舰船
clickBtn({ action: "open-cat", category: "ships" });
console.log("[list] 含银河帝国分组:", app.html.includes("银河帝国"), "| 含义军同盟分组:", app.html.includes("义军同盟"));

// 打开第一艘舰船（取第一个 open-card 的 id）
const m = app.html.match(/data-action="open-card" data-id="([^"]+)"/);
clickBtn({ action: "open-card", id: m[1] });
console.log("[edit] 含舰船规模:", app.html.includes("舰船规模"), "| 含升级槽:", app.html.includes("升级槽"), "| 含中文效果:", app.html.includes("中文效果"), "| 含 FAQ 编辑框:", app.html.includes('data-field="faq"'));

// 修改中文名
inputField("name", "测试舰船名");
// 删除第一个升级槽
clickBtn({ action: "remove-slot", index: "0" });
const slotsAfter = (app.html.match(/class="slot-row"/g) || []).length;
console.log("[edit] 删除槽后剩余 slot-row:", slotsAfter);

// 添加升级槽：触发 add-slot → 弹层出现 → 点选 commander
const beforeSlots = (app.html.match(/class="slot-row"/g) || []).length;
clickBtn({ action: "add-slot" });
const overlay = createdEls[createdEls.length - 1];
const sheetBtn = { dataset: { slot: "commander" }, closest(sel) { return sel === "[data-slot]" ? sheetBtn : null; } };
overlay._ls.click({ target: sheetBtn });
const afterSlots = (app.html.match(/class="slot-row"/g) || []).length;
console.log("[edit] 添加槽:", beforeSlots, "→", afterSlots, "| 弹层已关闭:", overlay._removed);

clickBtn({ action: "back" });   // edit -> list
clickBtn({ action: "back" });   // list -> home
console.log("[home] 返回后 dirty 提示:", app.html.includes("有未导出的修改"));

// 重新进入查看改名是否持久化
clickBtn({ action: "open-cat", category: "ships" });
console.log("[list] 改名持久化:", app.html.includes("测试舰船名"));

// 导出（按阵营拆分 12 个文件，每个下载间隔 350ms → 等全部触发）
clickBtn({ action: "export" });
await sleep(5000);
console.log("[export] 下载文件数:", downloads.length, "->", downloads.join(", "));

console.log("\nDOM 冒烟测试完成");
