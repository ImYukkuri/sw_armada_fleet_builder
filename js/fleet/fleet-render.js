/* Fleet Builder · 总览渲染（纯函数：输入 data/fleet/calc -> HTML 字符串）
 * 结构（task.md §5）：COMMANDER（若选了）→ SHIPS → SQUADRONS → OBJECTIVES。
 * 舰船条目：舰船本体 → 槽位图标横排（指挥官 + 普通升级槽 + 称号）→ 已装备升级条目。
 *   - ship-head：卡图(contain) + 名称/规模 + 本舰总分 + 删除
 *   - slot-row ：指挥官（未选时每舰显示，选了仅旗舰显示）+ 普通升级槽 + 称号（永远最后）图标；已装备变暗
 *   - ship-equips：已装备的升级卡/称号作为条目显示在舰船下方；指挥官除顶部
 *     fleet-commander 块外，还在旗舰的条目里重复显示（带“指挥官”标签），便于识别在哪个船
 * 中队：非 unique 非 ace 的普通中队以“单卡 + 数量（±）”展示，其余单卡（舰船不套用）。
 * 列表末尾放「＋ 添加舰船 / ＋ 添加中队」按钮（槽位式添加）。
 * 所有卡图 object-fit: contain + 点击 Lightbox 放大（升级 slot 图标 svg 除外）。 */
window.FleetRender = (function () {
  // 显示偏好（选择器“显示FAQ”开关同步到这里）：总览已装备条目默认不显示 FAQ/勘误 段
  var prefs = { showFaq: false };

  function setPrefs(p) {
    if (p && typeof p.showFaq === "boolean") prefs.showFaq = p.showFaq;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function slotIcon(data, slotId) {
    var svg = data.slotIcon(slotId);
    if (!svg) return "";
    return '<span class="slot-ico">' + svg + "</span>";
  }

  // 卡图点击放大（不含 slot 图标）。按钮内图片 stopPropagation 避免误触父级选择。
  function lb() {
    return 'onclick="event.stopPropagation(); Lightbox.open(this.src, this.alt)"';
  }

  /* ---- 舰船头部 ---- */
  function shipHead(data, shipInstance, shipTotal) {
    var shipCard = data.ship(shipInstance.cardId) || {};
    var sizeMeta = data.size(shipCard.size);
    var sizeLabel = sizeMeta ? sizeMeta.name : "";
    return (
      '<div class="ship-head">' +
      '<img class="ship-thumb" src="' + escapeHtml(shipCard.image) + '" alt="' + escapeHtml(shipCard.name) + '" loading="lazy" ' + lb() + ">" +
      '<div class="ship-info">' +
      '<span class="ship-name">' + escapeHtml(shipCard.name || shipInstance.cardId) + "</span>" +
      (shipCard.nameEn ? '<span class="ship-en">' + escapeHtml(shipCard.nameEn) + "</span>" : "") +
      '<span class="ship-meta">' + escapeHtml(sizeLabel ? sizeLabel + " · " : "") + (shipCard.points == null ? "?" : shipCard.points) + " 分</span>" +
      "</div>" +
      '<span class="ship-total">' + shipTotal + "</span>" +
      '<button class="ship-del" data-action="remove-ship" data-id="' + escapeHtml(shipInstance.instanceId) + '" aria-label="删除舰船">×</button>' +
      "</div>"
    );
  }

  /* ---- 槽位图标横排（指挥官 + 普通升级槽 + 称号；改装类升级按普通槽显示） ---- */
  function slotRow(data, fleet, shipInstance, shipCard) {
    var cells = [];
    function cell(slotId, slotIndex, equipped, label, locked) {
      // locked：该槽位被双槽卡占用 → 禁用按钮（不可直接替换，须先删除整组）
      var idxAttr = slotIndex != null ? ' data-slot-index="' + slotIndex + '"' : "";
      var attrs = locked
        ? 'disabled data-slot="' + escapeHtml(slotId) + '"' + idxAttr +
          ' title="' + escapeHtml(label) + '（双槽位卡占用，需先删除才能更换）" aria-label="' + escapeHtml(label) + '（双槽位卡锁定）"'
        : 'data-action="open-upgrade" data-id="' + escapeHtml(shipInstance.instanceId) +
          '" data-slot="' + escapeHtml(slotId) + '"' + idxAttr +
          ' title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '"';
      cells.push(
        '<button class="slot-btn' + (equipped ? " is-equipped" : "") + (locked ? " is-locked" : "") + '" ' + attrs + ">" +
        slotIcon(data, slotId) + "</button>"
      );
    }
    var isFlag = !!(fleet.commander && fleet.commanderShipId === shipInstance.instanceId);
    // 指挥官槽位：未选指挥官时每艘舰都显示；选了指挥官后只有旗舰显示，其余舰隐藏
    if (!fleet.commander || isFlag) {
      var cmdCard = fleet.commander ? data.upgrade(fleet.commander) : null;
      cell("commander", null, !!fleet.commander, "指挥官" + (cmdCard ? " · " + cmdCard.name : "（空）"));
    }
    (shipInstance.upgrades || []).forEach(function (slot) {
      var slotId = slot.slotId || (shipCard.slots && shipCard.slots[slot.slotIndex]) || slot.slotIndex;
      var slotMeta = data.slot(slotId) || { name: slotId };
      var card = slot.cardId ? data.upgrade(slot.cardId) : null;
      var locked = !!(card && card.slots && card.slots.length > 1);   // 双槽卡占用 → 禁止直接替换
      var addedMark = slot.addedBy != null ? (slot.addedBy === "title" ? "（称号添加）" : "（升级添加）") : "";
      cell(slotId, slot.slotIndex, !!slot.cardId,
        slotMeta.name + (slot.shared ? "（双槽共用）" : "") + addedMark + (card ? " · " + card.name : "（空）"),
        locked);
    });
    // 称号槽位：永远排在其他槽位图标之后
    var titleCard = shipInstance.title ? data.title(shipInstance.title) : null;
    cell("title", null, !!shipInstance.title, "称号" + (titleCard ? " · " + titleCard.name : "（空）"));
    return cells.length ? '<div class="slot-row">' + cells.join("") + "</div>" : "";
  }

  /* ---- 已装备条目（显示在舰船下方，slotId 区分指挥官/称号/普通槽） ---- */
  function equipItem(data, shipInstance, slotId, slotIndex, card) {
    var idx = slotIndex != null ? ' data-slot-index="' + slotIndex + '"' : "";
    var isDual = !!(card.slots && card.slots.length > 1);
    var clearAttrs =
      'data-action="clear-upgrade" data-id="' + escapeHtml(shipInstance.instanceId) +
      '" data-slot="' + escapeHtml(slotId) + '"' + idx;
    var tag = FleetRules.slotLabel(data, slotId);
    // 双槽卡整组占用两个槽位：不可直接替换（须先删除再重装），仅保留删除按钮
    var openBtn = isDual
      ? '<button class="equip-open is-locked" disabled title="双槽位卡占用两个槽位，需先删除才能更换" aria-label="双槽位卡需先删除才能更换">'
      : '<button class="equip-open" data-action="open-upgrade" data-id="' + escapeHtml(shipInstance.instanceId) +
        '" data-slot="' + escapeHtml(slotId) + '"' + idx + ' aria-label="更换 ' + escapeHtml(card.name) + '">';
    return (
      '<div class="equip-item' + (isDual ? " is-dual" : "") + '" data-slot="' + escapeHtml(slotId) + '">' +
      openBtn +
      '<img class="equip-thumb" src="' + escapeHtml(card.image) + '" alt="' + escapeHtml(card.name) + '" loading="lazy" ' + lb() + ">" +
      '<span class="equip-main">' +
      '<span class="equip-name">' + (tag ? '<span class="equip-tag">' + escapeHtml(tag) + "</span>" : "") + escapeHtml(card.name) + "</span>" +
      (card.nameEn ? '<span class="equip-en">' + escapeHtml(card.nameEn) + "</span>" : "") +
      '<span class="equip-effect">' + (card.effect ? ArmadaIcons.toHtml(card.effect) : "") + "</span>" +
      (prefs.showFaq && card.faq
        ? '<span class="equip-faq"><b>FAQ：</b>' + String(card.faq).split("\n").map(function (line) {
            return '<span class="equip-faq-line">' + ArmadaIcons.toHtml(line) + "</span>";
          }).join("") + "</span>"
        : "") +
      "</span>" +
      '<span class="equip-pts">' + (card.points == null ? "?" : card.points) + "</span>" +
      "</button>" +
      '<button class="equip-del" ' + clearAttrs + ' aria-label="卸下 ' + escapeHtml(card.name) + '">×</button>' +
      "</div>"
    );
  }

  /* ---- 单艘舰船（顺序：舰船本体 → 槽位图标横排 → 已装备升级条目） ---- */
  function shipEntry(data, fleet, shipInstance, shipTotal) {
    var shipCard = data.ship(shipInstance.cardId) || {};
    var equips = [];
    // 指挥官：作为升级卡也要显示在旗舰上（fleet-commander 顶部块负责全局标注，
    // 这里把指挥官卡作为旗舰的装备条目再列一次，一眼就能看出它在哪条船上）
    if (fleet.commander && fleet.commanderShipId === shipInstance.instanceId) {
      var cmdCard = data.upgrade(fleet.commander);
      if (cmdCard) equips.push(equipItem(data, shipInstance, "commander", null, cmdCard));
    }
    (shipInstance.upgrades || []).forEach(function (slot) {
      if (!slot.cardId || slot.shared) return;   // shared = 双槽卡占用的兄弟槽，条目只显示一次
      var card = data.upgrade(slot.cardId);
      if (!card) return;
      var slotId = slot.slotId || (shipCard.slots && shipCard.slots[slot.slotIndex]) || slot.slotIndex;
      equips.push(equipItem(data, shipInstance, slotId, slot.slotIndex, card));
    });
    if (shipInstance.title) {
      var titleCard = data.title(shipInstance.title);
      if (titleCard) equips.push(equipItem(data, shipInstance, "title", null, titleCard));
    }

    return (
      '<div class="ship-entry">' +
      shipHead(data, shipInstance, shipTotal) +
      slotRow(data, fleet, shipInstance, shipCard) +
      (equips.length ? '<div class="ship-equips">' + equips.join("") + "</div>" : "") +
      "</div>"
    );
  }

  /* ---- 舰队指挥官（总览顶部，点数附近；卡图用上半部分主体区域） ---- */
  function commanderHtml(data, fleet, cmd) {
    var shipId = fleet.commanderShipId || "";
    return (
      '<div class="fleet-commander">' +
      '<img class="cmd-art" src="' + escapeHtml(cmd.image) + '" alt="' + escapeHtml(cmd.name) + '" loading="lazy" ' + lb() + ">" +
      '<div class="cmd-info">' +
      '<span class="cmd-role">指挥官 Commander</span>' +
      '<span class="cmd-name">' + escapeHtml(cmd.name) + "</span>" +
      (cmd.nameEn ? '<span class="cmd-en">' + escapeHtml(cmd.nameEn) + "</span>" : "") +
      '<span class="cmd-pts">' + (cmd.points == null ? "?" : cmd.points) + " 分</span>" +
      "</div>" +
      '<button class="cmd-change" data-action="open-upgrade" data-id="' + escapeHtml(shipId) +
      '" data-slot="commander" aria-label="更换指挥官">更换</button>' +
      '<button class="cmd-del" data-action="clear-upgrade" data-id="' + escapeHtml(shipId) +
      '" data-slot="commander" aria-label="删除指挥官">×</button>' +
      "</div>"
    );
  }

  /* ---- 中队：非 unique 非 ace 的普通中队以“单卡 + 数量”展示，其余单卡；舰船不套用此逻辑 ---- */
  function squadronGroup(data, group) {
    var card = data.squadron(group.cardId) || {};
    var count = group.instances.length;
    var generic = !card.unique && !card.ace;   // 普通中队可调节数量（仅受显式 card.limit 约束；无 limit = 不封顶）
    var pts = card.points == null ? "?" : (card.points * count);
    var stepper = "";
    if (generic) {
      var limit = card.limit;
      var atLimit = !!(limit && count >= limit);
      stepper =
        '<span class="sq-stepper">' +
        '<button class="sq-step" data-action="squadron-dec" data-id="' + escapeHtml(card.id) + '" aria-label="减少数量">−</button>' +
        '<span class="sq-count">' + count + "</span>" +
        '<button class="sq-step' + (atLimit ? " is-max" : "") + '" data-action="squadron-inc" data-id="' + escapeHtml(card.id) +
        '" aria-label="增加数量"' + (atLimit ? " disabled" : "") + ">＋</button>" +
        "</span>";
    }
    return (
      '<div class="squadron-chip" data-card="' + escapeHtml(card.id) + '">' +
      '<div class="sq-main">' +
      '<img class="sq-thumb" src="' + escapeHtml(card.image) + '" alt="' + escapeHtml(card.name) + '" loading="lazy" ' + lb() + ">" +
      '<div class="sq-info">' +
      '<span class="sq-name">' + escapeHtml(card.name || group.cardId) +
      (generic ? '<span class="sq-qty"> ×' + count + "</span>" : "") + "</span>" +
      '<span class="sq-pts">' + pts + " 分</span>" +
      "</div>" +
      '<button class="sq-del" data-action="squadron-del" data-id="' + escapeHtml(card.id) +
      '" aria-label="删除全部 ' + escapeHtml(card.name) + '">×</button>' +
      "</div>" +
      (generic ? '<div class="sq-foot"><span class="sq-foot-label">数量</span>' + stepper + "</div>" : "") +
      "</div>"
    );
  }

  // 同类型中队合并成一组（单卡 + 数量）
  function squadronGroups(fleet) {
    var map = {};
    fleet.squadrons.forEach(function (s) {
      (map[s.cardId] = map[s.cardId] || { cardId: s.cardId, instances: [] }).instances.push(s);
    });
    return Object.keys(map).map(function (id) { return map[id]; });
  }

  /* ---- 任务卡 ---- */
  function objectiveRow(data, fleet, category, label) {
    var card = data.objective(fleet.objectives[category]);
    var body = card
      ? '<button class="obj-chosen" data-action="open-objective" data-category="' + category + '">' +
        escapeHtml(card.name) + '<span class="obj-src">' + escapeHtml(card.source || "") + "</span></button>"
      : '<button class="obj-empty" data-action="open-objective" data-category="' + category + '">＋ 选择任务</button>';
    return (
      '<div class="objective-row">' +
      '<span class="objective-label">' + escapeHtml(label) + "</span>" +
      body +
      "</div>"
    );
  }

  /* ---- 主入口 ---- */
  function renderOverview(data, fleet, calc) {
    // 舰队指挥官显示在总览最顶部（总点数附近的上方中间区域）
    var commanderBlock = "";
    if (fleet.commander) {
      var cmd = data.upgrade(fleet.commander);
      if (cmd) commanderBlock = commanderHtml(data, fleet, cmd);
    }

    // 空态不再显示提示文案，仅保留列表末尾的「＋ 添加」按钮
    var shipSection = fleet.ships.length
      ? fleet.ships.map(function (s) {
          var per = calc.perShip.find(function (p) { return p.instanceId === s.instanceId; });
          return shipEntry(data, fleet, s, per ? per.total : 0);
        }).join("")
      : "";

    var squadSection = fleet.squadrons.length
      ? '<div class="squadron-list">' + squadronGroups(fleet).map(function (g) { return squadronGroup(data, g); }).join("") + "</div>"
      : "";

    // 中队分数软上限：舰队分数 1/3（向上取整），超限标红提示（不阻止添加）
    var sqPtsCls = calc.isOverSquadronLimit ? " over" : "";
    var sqPts = '<span class="section-pts' + sqPtsCls + '">' + calc.squadrons + " / " + calc.squadronLimit + "</span>";
    var sqWarn = calc.isOverSquadronLimit
      ? '<span class="section-hint over">超出中队上限（舰队分数 1/3）</span>'
      : "";

    return (
      commanderBlock +
      '<section class="overview-section">' +
      '<h2 class="section-title">舰船 <span class="section-pts">' + calc.ships + " / " + fleet.pointsLimit + "</span></h2>" +
      '<div class="ship-list">' + shipSection +
      '<button class="add-in-list" data-action="add-ship">＋ 添加舰船</button>' +
      "</div>" +
      "</section>" +
      '<section class="overview-section">' +
      '<h2 class="section-title">中队 ' + sqPts + sqWarn + "</h2>" +
      '<div class="squadron-area">' + squadSection +
      '<button class="add-in-list" data-action="add-squadron">＋ 添加中队</button>' +
      "</div>" +
      "</section>" +
      '<section class="overview-section">' +
      '<h2 class="section-title">任务卡 <span class="section-hint">每类各选 1 张</span></h2>' +
      objectiveRow(data, fleet, "assault", "进攻 Assault") +
      objectiveRow(data, fleet, "defense", "防御 Defense") +
      objectiveRow(data, fleet, "navigation", "导航 Navigation") +
      "</section>"
    );
  }

  function renderActionBar(calc) {
    var overCls = calc.isOverLimit ? " over" : "";
    return (
      '<div class="action-bar">' +
      '<div class="act-total' + overCls + '"><span>' + calc.total + " / " + calc.pointsLimit + " 分</span>" +
      (calc.isOverLimit ? '<span class="act-over-label">超出限制</span>' : "") +
      "</div>" +
      "</div>"
    );
  }

  function renderHeaderPoints(calc) {
    var cls = calc.isOverLimit ? " over" : "";
    return (
      '<span class="points-label">舰队分数</span>' +
      '<span class="points-value' + cls + '">' + calc.total + " / " + calc.pointsLimit + "</span>"
    );
  }

  return {
    renderOverview: renderOverview,
    renderActionBar: renderActionBar,
    renderHeaderPoints: renderHeaderPoints,
    setPrefs: setPrefs,
  };
})();
