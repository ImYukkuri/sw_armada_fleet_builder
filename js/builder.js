/* 写表器 · 引导脚本
 * 流程：读 faction 参数 -> 初始化 FleetState -> 加载数据 -> 接线选择器 -> 渲染总览。
 * 数据流：Fleet State -> Render -> User Action -> Update State -> Render（task.md §27）。 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const faction = FACTIONS[params.get("faction")];

  if (!faction) {
    window.location.replace("index.html");
    return;
  }

  // ---- 阵营主题 ----
  document.documentElement.style.setProperty("--accent", faction.accent);
  document.documentElement.style.setProperty("--accent-glow", faction.glow || faction.accent);
  const badge = document.getElementById("faction-badge");
  badge.innerHTML = faction.emblem;
  badge.style.color = faction.accent;
  document.getElementById("faction-title").textContent = faction.name + " · 舰队写表";
  document.getElementById("faction-en").textContent = faction.nameEn;
  document.title = "写表器 — " + faction.name;

  const overviewEl = document.getElementById("fleet-overview");
  const actionBarEl = document.getElementById("action-bar");
  const pointsBoxEl = document.getElementById("points-box");

  const fleet = FleetState.create(faction.id, 400);
  let data = null;

  function render() {
    if (!data) return;
    const calc = FleetCalculator.calculateFleetPoints(data, fleet);
    overviewEl.innerHTML = FleetRender.renderOverview(data, fleet, calc);
    actionBarEl.innerHTML = FleetRender.renderActionBar(calc);
    pointsBoxEl.innerHTML = FleetRender.renderHeaderPoints(calc);
  }

  function bind() {
    overviewEl.addEventListener("click", onAction);
    actionBarEl.addEventListener("click", onAction);

    FleetSelectors.configure({
      data: data,
      fleet: fleet,
      onChange: render,
      onClose: render,
    });
    FleetSelectors.bind();
  }

  function onAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const a = btn.dataset.action;
    const id = btn.dataset.id;
    const slot = btn.dataset.slot;
    const slotIndex = btn.dataset.slotIndex != null ? Number(btn.dataset.slotIndex) : null;
    const category = btn.dataset.category;

    if (a === "add-ship") FleetSelectors.openShip();
    else if (a === "add-squadron") FleetSelectors.openSquadron();
    else if (a === "remove-ship") { FleetState.removeShip(id); render(); }
    else if (a === "remove-squadron") { FleetState.removeSquadron(id); render(); }
    else if (a === "squadron-inc") {
      const sqCard = data.squadron(id) || {};
      if (FleetRules.canEquipSquadron(data, fleet, sqCard).allowed) {
        FleetState.changeSquadronCount(id, +1);
        render();
      }
    }
    else if (a === "squadron-dec") { FleetState.changeSquadronCount(id, -1); render(); }
    else if (a === "squadron-del") { FleetState.removeSquadronsByCard(id); render(); }
    else if (a === "open-upgrade") FleetSelectors.openUpgrade(id, slot, slotIndex);
    else if (a === "clear-upgrade") {
      if (slot === "commander") FleetState.setCommander(id, null);
      else if (slot === "title") FleetState.setTitle(id, null);
      else FleetState.setUpgrade(id, slotIndex, null);
      render();
    }
    else if (a === "open-objective") FleetSelectors.openObjective(category);
  }

  (async function init() {
    try {
      data = await FleetData.load();
      bind();
      render();
    } catch (err) {
      overviewEl.innerHTML =
        '<div class="err-box"><h1>无法读取卡牌数据</h1>' +
        "<p>需要本地服务器。请在 <b>list-builder</b> 目录运行：</p>" +
        "<pre>python -m http.server 8000</pre>" +
        "<p>然后访问 <b>http://localhost:8000/builder.html?faction=" + faction.id + "</b></p>" +
        '<p class="err-detail">' + escapeHtml(String(err && err.message || err)) + "</p></div>";
    }
  })();

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
})();
