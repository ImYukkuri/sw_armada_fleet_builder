/* 任务卡一览 · 主应用
 * 从 data/objectives.json 加载 36 张任务卡，按分类 tab 分组展示。
 * 点击卡片弹出详情：卡图 + 中文规则 + 英文原文对照。
 * 数据与 UI 解耦；纯 JS 渲染。 */
(function () {
  const tabsEl = document.getElementById("tabs");
  const gridEl = document.getElementById("grid");
  const emptyEl = document.getElementById("empty");

  const CATEGORIES = [
    { id: "assault", label: "进攻", labelEn: "Assault" },
    { id: "defense", label: "防御", labelEn: "Defense" },
    { id: "navigation", label: "导航", labelEn: "Navigation" },
  ];

  const state = { category: "assault", all: [], showEn: false, showFaq: false };

  /* ---------------- 工具 ---------------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function linesOf(s) {
    return String(s || "").split("\n").filter(function (l) { return l.trim(); });
  }

  function renderText(lines) {
    return lines.map(function (l) { return "<p>" + escapeHtml(l) + "</p>"; }).join("");
  }

  /* ---------------- tab ---------------- */
  function renderTabs() {
    tabsEl.innerHTML = CATEGORIES.map(function (c) {
      const n = state.all.filter(function (o) { return o.category === c.id; }).length;
      const active = c.id === state.category ? " active" : "";
      return (
        '<button class="tab' + active + '" data-cat="' + c.id + '">' +
        c.label + ' <span class="tab-en">' + c.labelEn + '</span>' +
        '<span class="tab-n">' + n + "</span>" +
        "</button>"
      );
    }).join("");
  }

  /* ---------------- 卡片网格 ---------------- */
  function sourceBadge(o) {
    const map = {
      "Core Set": "核心盒",
      "The Corellian Conflict": "科雷利亚冲突",
      "Rebellion in the Rim": "边疆起义",
    };
    return map[o.source] || o.source || "";
  }

  /* 网格卡片内联的规则段落：标题静态输出，中文正文过 ArmadaIcons.toHtml
   * （转义 + 行内图标）多行拆 <p>；英文原文在下方以弱化样式整块展示。
   * 顶部开关控制：英文原文（state.showEn）与 FAQ（state.showFaq）。 */
  function inlineSection(title, text, enText) {
    if (!text && !enText) return "";
    const zh = text ? linesOf(text).map(function (l) {
      return "<p>" + ArmadaIcons.toHtml(l) + "</p>";
    }).join("") : "";
    const en = enText && state.showEn ? '<div class="card-sec-en">' + escapeHtml(enText) + "</div>" : "";
    return (
      '<div class="card-sec"><h5 class="card-sec-title">' + escapeHtml(title) + "</h5>" +
      zh + en + "</div>"
    );
  }

  function card(o) {
    const rules =
      inlineSection("布设", o.setup, o.setupEn) +
      inlineSection("特殊规则", o.special, o.specialEn) +
      inlineSection("回合结束", o.endOfRound, o.endOfRoundEn) +
      inlineSection("游戏结束", o.endOfGame, o.endOfGameEn) +
      (state.showFaq ? inlineSection("FAQ", o.faq, o.faqEn) : "");
    return (
      '<button class="card" data-id="' + escapeHtml(o.id) + '">' +
      '<img class="card-img" src="' + escapeHtml(o.image) + '" alt="' + escapeHtml(o.name) + '" loading="lazy" ' +
      'onclick="event.stopPropagation(); Lightbox.open(this.src, this.alt)">' +
      '<span class="card-body">' +
      '<span class="card-name">' + escapeHtml(o.name) + "</span>" +
      '<span class="card-meta">' +
      '<span class="src">' + escapeHtml(sourceBadge(o)) + "</span>" +
      (o.score ? '<span class="score">' + o.score + " 分</span>" : "") +
      "</span>" +
      (rules ? '<span class="card-rules">' + rules + "</span>" : "") +
      "</span>" +
      "</button>"
    );
  }

  function renderGrid() {
    const cards = state.all.filter(function (o) { return o.category === state.category; });
    gridEl.innerHTML = cards.map(card).join("");
    emptyEl.hidden = cards.length > 0;
  }

  /* ---------------- 详情 ---------------- */
  function section(title, zhLines, enLines) {
    if (!zhLines.length && !enLines.length) return "";
    return (
      "<section class='det-sec'>" +
      "<h4>" + escapeHtml(title) + "</h4>" +
      (zhLines.length ? '<div class="det-zh">' + renderText(zhLines) + "</div>" : "") +
      (state.showEn && enLines.length ? '<details class="det-en"><summary>英文原文</summary>' + renderText(enLines) + "</details>" : "") +
      "</section>"
    );
  }

  function openDetail(id) {
    const o = state.all.find(function (x) { return x.id === id; });
    if (!o) return;
    const cat = CATEGORIES.find(function (c) { return c.id === o.category; });

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML =
      '<div class="detail">' +
      '<button class="det-close" data-close aria-label="关闭">×</button>' +
      '<div class="det-top">' +
      '<img class="det-img" src="' + escapeHtml(o.image) + '" alt="' + escapeHtml(o.name) + '" ' +
      'onclick="event.stopPropagation(); Lightbox.open(this.src, this.alt)">' +
      '<div class="det-head">' +
      "<h2>" + escapeHtml(o.name) + "</h2>" +
      '<p class="det-sub">' +
      (cat ? escapeHtml(cat.label + " · " + cat.labelEn) : "") +
      ' · <span class="src">' + escapeHtml(sourceBadge(o)) + "</span>" +
      (o.score ? ' · <span class="score">' + o.score + " 分</span>" : "") +
      "</p>" +
      "</div>" +
      "</div>" +
      section("布设", linesOf(o.setup), linesOf(o.setupEn)) +
      section("特殊规则", linesOf(o.special), linesOf(o.specialEn)) +
      section("回合结束", linesOf(o.endOfRound), linesOf(o.endOfRoundEn)) +
      section("游戏结束", linesOf(o.endOfGame), linesOf(o.endOfGameEn)) +
      (state.showFaq && (o.faq || o.faqEn) ? "<section class='det-sec det-faq'><h4>FAQ</h4>" +
        (o.faq ? renderText(linesOf(o.faq)) : "") +
        (state.showEn && o.faqEn ? '<details class="det-en"><summary>英文原文</summary>' + renderText(linesOf(o.faqEn)) + "</details>" : "") +
        "</section>" : "") +
      "</div>";
    overlay.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]") || e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    tabsEl.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-cat]");
      if (!btn) return;
      state.category = btn.dataset.cat;
      renderTabs();
      renderGrid();
    });
    gridEl.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-id]");
      if (!btn) return;
      openDetail(btn.dataset.id);
    });
    const prefEn = document.getElementById("pref-en");
    const prefFaq = document.getElementById("pref-faq");
    if (prefEn) prefEn.addEventListener("change", function () { state.showEn = prefEn.checked; renderGrid(); });
    if (prefFaq) prefFaq.addEventListener("change", function () { state.showFaq = prefFaq.checked; renderGrid(); });
  }

  /* ---------------- 启动 ---------------- */
  (async function init() {
    try {
      const res = await fetch("data/objectives.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.all = await res.json();
      bind();
      renderTabs();
      renderGrid();
    } catch (err) {
      tabsEl.innerHTML = "";
      gridEl.innerHTML =
        '<div class="err-box"><h1>无法读取任务卡数据</h1>' +
        "<p>需要本地服务器才能加载 data/objectives.json。</p>" +
        "<p>请在 <b>list-builder</b> 目录运行：<code>python -m http.server 8000</code></p>" +
        "<p>然后访问 <b>http://localhost:8000/objectives.html</b></p>" +
        '<p class="err-detail">' + escapeHtml(String(err && err.message || err)) + "</p></div>";
    }
  })();
})();
