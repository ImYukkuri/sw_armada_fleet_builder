/* 写表器 · 引导脚本
 * 流程：读 faction 参数 -> 初始化 FleetState -> 加载数据 -> 接线选择器 -> 渲染总览。
 * 数据流：Fleet State -> Render -> User Action -> Update State -> Render（task.md §27）。
 *
 * 军表存取：渲染后自动写 localStorage（FleetIO.autosave），刷新自动恢复；
 * 返回阵营选择页(index.html)时清空当前阵营存档；底部操作栏提供
 * 导出 JSON / 压缩分享 / 导入 / 清空；跨阵营导入切页 + 进度条。 */
(function () {
  const PENDING_KEY = "armada.fleet.pending-import";   // 跨阵营导入中转（sessionStorage 存原始文本）
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
  let openModalObj = null;

  function render() {
    if (!data) return;
    const calc = FleetCalculator.calculateFleetPoints(data, fleet);
    overviewEl.innerHTML = FleetRender.renderOverview(data, fleet, calc);
    actionBarEl.innerHTML = FleetRender.renderActionBar(calc);
    pointsBoxEl.innerHTML = FleetRender.renderHeaderPoints(calc);
    // 自动存档：非空表写入，空表清键（autosave 内部处理空表不落键）
    FleetIO.autosave(fleet);
  }

  /* ---- 军表操作（清空封装方法，清空按钮 / 其它调用复用） ---- */
  function clearFleet() {
    FleetState.clear(faction.id, 400);
    FleetIO.clearStorage(faction.id);
    render();
  }

  /* ---- 启动 / 切页 遮罩 + 进度条 ---- */
  function bootEl(id) { return document.getElementById(id); }

  function showBootOverlay(factionName, label) {
    const o = bootEl("boot-overlay");
    if (!o) return;
    o.hidden = false;
    if (factionName) bootEl("boot-faction").textContent = factionName;
    setBootProgress(0, label || "");
  }
  function setBootProgress(fraction, label) {
    const fill = bootEl("boot-fill");
    const lab = bootEl("boot-label");
    if (fill) fill.style.width = (fraction == null ? 100 : Math.round(fraction * 100)) + "%";
    if (lab && label) lab.textContent = label;
  }
  function hideBootOverlay() {
    const o = bootEl("boot-overlay");
    if (o) o.hidden = true;
  }

  /* ---- 弹窗 / 提示 ---- */
  function openModal(title, bodyHTML) {
    closeModal();
    const overlay = document.createElement("div");
    overlay.className = "overlay modal-overlay";
    overlay.innerHTML =
      '<div class="sheet modal-sheet">' +
      "<h3>" + escapeHtml(title) + "</h3>" +
      bodyHTML +
      '<button class="btn modal-close" data-modal-close>关闭</button>' +
      "</div>";
    const close = function () { overlay.remove(); openModalObj = null; };
    overlay.addEventListener("click", function (e) {
      const btn = e.target.closest && e.target.closest("[data-action]");
      if (btn) { onModalAction(btn.dataset.action, overlay); return; }
      if ((e.target.closest && e.target.closest("[data-modal-close]")) || e.target === overlay) close();
    });
    const root = document.getElementById("modal-root") || document.body;
    root.appendChild(overlay);
    openModalObj = { overlay: overlay, close: close };
    return openModalObj;
  }
  function closeModal() { if (openModalObj) openModalObj.close(); }

  function onModalAction(action, overlay) {
    const q = function (sel) { return overlay.querySelector ? overlay.querySelector(sel) : null; };
    if (action === "fleet-import-do") {
      const ta = q(".modal-textarea");
      doImport(ta ? ta.value : "");
    } else if (action === "fleet-copy") {
      const ta = q(".modal-textarea");
      if (ta) {
        FleetIO.copyText(ta.value).then(function () { toast("已复制"); }, function () { toast("复制失败"); });
      }
    } else if (action === "fleet-clear-confirm") {
      clearFleet();
      closeModal();
      toast("军表已清空");
    }
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  /* ---- sessionStorage（file:// 下会抛，全部 try/catch） ---- */
  function safeSessionGet(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
  function safeSessionSet(key, val) { try { sessionStorage.setItem(key, val); return true; } catch (e) { return false; } }
  function safeSessionRemove(key) { try { sessionStorage.removeItem(key); } catch (e) {} }

  /* ---- 导入（明文 / 压缩均可，粘贴或文件） ---- */
  function openImportModal() {
    openModal("导入军表",
      '<p class="modal-hint">粘贴军表 JSON 或 FA2: 压缩字符串，也可以选择文件。</p>' +
      '<textarea class="modal-textarea" placeholder="在此粘贴…"></textarea>' +
      '<label class="btn modal-file-btn">选择文件…' +
      '<input type="file" accept=".json,.txt,application/json,text/plain" hidden></label>' +
      '<button class="btn modal-do" data-action="fleet-import-do">导入</button>'
    );
    const overlay = openModalObj && openModalObj.overlay;
    const fileInput = overlay && overlay.querySelector ? overlay.querySelector('input[type="file"]') : null;
    if (fileInput) {
      fileInput.addEventListener("change", function (e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = function () { doImport(String(reader.result || "")); };
        reader.readAsText(f);
      });
    }
  }

  async function doImport(text) {
    if (!text || !text.trim()) { toast("内容为空"); return; }
    const r = await FleetIO.importFromText(text, data);
    if (!r.ok) { showImportError(r.error); return; }

    // 阵营不符 → 切换到对应势力页，等目标页全部加载完成后载入存档（进度条由目标页显示）
    if (r.faction && r.faction !== faction.id && FACTIONS[r.faction]) {
      FleetIO.clearStorage(faction.id);              // 源阵营旧档作废
      showBootOverlay(FACTIONS[r.faction].name, "正在切换到该阵营页面…");
      setBootProgress(null, "正在切换到" + FACTIONS[r.faction].name + "…");
      if (safeSessionSet(PENDING_KEY, text)) {        // 存原始文本，目标页重跑同一管线
        closeModal();
        window.location.href = "builder.html?faction=" + r.faction;
      } else {
        hideBootOverlay();
        showImportError({ code: "server-required", message: "跨阵营导入需要本地服务器支持（sessionStorage 不可用），请在 localhost 下使用" });
      }
      return;
    }

    // 同阵营 / faction 缺失 → 直接落地
    closeModal();
    FleetState.load(r.fleet);
    render();
    if (r.warnings && r.warnings.length) showImportResult(r.warnings);
    else toast("导入成功");
  }

  function showImportError(error) {
    const notes = {
      "parse-error": "无法解析：不是有效的 JSON 或压缩军表数据。",
      "not-a-fleet": "无法解析：数据不是军表结构。",
      "newer-version": "版本过新：此军表由更新版本导出，请升级后再导入。",
      "server-required": "",
    };
    const msg = notes[error.code] || error.message || "";
    openModal("导入失败",
      '<p class="modal-warn-note">' + escapeHtml(msg) +
      (error.version ? '<br>版本号：' + error.version : "") + "</p>");
  }

  function showImportResult(warnings) {
    if (!warnings || !warnings.length) return;
    const rows = warnings.map(function (w) {
      return "<li><b>" + escapeHtml(w.type) + "</b> " + escapeHtml(w.name || "") + " — " + escapeHtml(w.reason || "") + "</li>";
    }).join("");
    openModal("导入完成（部分内容已跳过）", '<ul class="modal-warn">' + rows + "</ul>");
  }

  /* ---- 导出 ---- */
  function downloadJson() {
    const json = FleetIO.serializePlain(fleet);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      (fleet.name ? fleet.name + " " : "") +
      "军表-" + (FACTIONS[fleet.faction] ? FACTIONS[fleet.faction].name : fleet.faction) +
      " " + fleet.pointsLimit + "分.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportCompressedModal() {
    const s = await FleetIO.exportCompressed(fleet);
    openModal("压缩分享",
      '<p class="modal-hint">这段字符串就是完整军表（gzip+base64），复制后发给对方，对方导入即可还原。</p>' +
      '<textarea class="modal-textarea" readonly>' + escapeHtml(s) + "</textarea>" +
      '<button class="btn modal-do" data-action="fleet-copy">复制</button>'
    );
  }

  function bind() {
    overviewEl.addEventListener("click", onAction);
    actionBarEl.addEventListener("click", onAction);

    // 返回阵营选择页(index.html)时清空当前阵营自动存档（“返回上一层清空”）
    if (document.querySelector) {
      const backLink = document.querySelector(".back-link");
      if (backLink) backLink.addEventListener("click", function () { FleetIO.clearStorage(faction.id); });
    }

    // 页头开关「完整卡牌效果」：默认关；勾选后总览里已装备升级卡展开完整效果 + 完整卡图
    const showEffectsEl = document.getElementById("show-effects");
    if (showEffectsEl) {
      showEffectsEl.addEventListener("change", function () {
        FleetRender.setPrefs({ showEffect: showEffectsEl.checked });
        render();
      });
    }

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
    else if (a === "fleet-export-json") downloadJson();
    else if (a === "fleet-export-compressed") exportCompressedModal();
    else if (a === "fleet-import") openImportModal();
    else if (a === "fleet-clear") {
      openModal("清空军表",
        '<p class="modal-warn-note">清空当前军表？本阵营的自动存档会一并清除。</p>' +
        '<button class="btn modal-do btn-danger" data-action="fleet-clear-confirm">确认清空</button>'
      );
    }
  }

  (async function init() {
    showBootOverlay(faction.name, "正在加载卡牌数据…");
    try {
      data = await FleetData.load(setBootProgress);

      // 恢复：跨阵营导入中转 > 自动存档
      let warnings = [];
      const pending = safeSessionGet(PENDING_KEY);
      if (pending) {
        safeSessionRemove(PENDING_KEY);
        const r = await FleetIO.importFromText(pending, data);
        if (r.ok) { FleetState.load(r.fleet); warnings = r.warnings; }
        // 目标页数据理应能解析；失败则空表开始
      } else {
        const saved = FleetIO.readAutosave(faction.id);
        if (saved) {
          const r = await FleetIO.importFromText(saved, data);
          if (r.ok && r.faction === faction.id) { FleetState.load(r.fleet); warnings = r.warnings; }
          else FleetIO.clearStorage(faction.id);   // 存档损坏 / 阵营不符 → 清键从空表开始
        }
      }

      hideBootOverlay();
      bind();
      render();
      if (warnings.length) showImportResult(warnings);   // 恢复 / 切页导入的警告也弹出
    } catch (err) {
      hideBootOverlay();
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
