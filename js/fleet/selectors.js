/* Fleet Builder · 选择器（舰船 / 中队 / 升级 / 任务）
 * 同一份 DOM，由 CSS 断点决定形态：
 *   - 移动端（<768px）：100vw/100vh 全屏覆盖（task.md §32）
 *   - 桌面端（≥768px）：右侧 Drawer，总览常驻（task.md §33）
 * 选择器只做“选择”，选中后调用 FleetState 更新，再由 builder 的 onChange 重渲染。
 * 升级/称号列表默认只显示 canEquipUpgrade 允许的卡（§13/§35）。 */
window.FleetSelectors = (function () {
  let ctx = null;          // { data, fleet, onChange, onClose }
  let root = null;
  let state = null;        // { kind, shipInstanceId, slotId, slotIndex, category, query }
  let bodyEl = null;
  // 任务卡显示偏好：英文原文 / FAQ 是否显示（默认全关，选择器顶部开关控制）
  let objPrefs = { showEn: false, showFaq: false };

  function configure(cfg) {
    ctx = cfg;
    root = document.getElementById("selector-root");
  }

  /* ---- 打开 ---- */
  function openShip() { state = { kind: "ship", query: "" }; render(); }
  function openSquadron() { state = { kind: "squadron", query: "" }; render(); }
  function openUpgrade(shipInstanceId, slotId, slotIndex) {
    state = { kind: "upgrade", shipInstanceId: shipInstanceId, slotId: slotId, slotIndex: slotIndex, query: "" };
    render();
  }
  function openObjective(category) { state = { kind: "objective", category: category, query: "" }; render(); }

  function close() {
    state = null;
    if (root) root.innerHTML = "";
    if (ctx && ctx.onClose) ctx.onClose();
  }

  /* ---- 标题 ---- */
  function title() {
    if (!state) return "";
    if (state.kind === "ship") return "选择舰船";
    if (state.kind === "squadron") return "选择中队";
    if (state.kind === "objective") {
      var map = { assault: "选择进攻任务", defense: "选择防御任务", navigation: "选择导航任务" };
      return map[state.category] || "选择任务";
    }
    if (state.kind === "upgrade") {
      if (state.slotId === "commander") return "选择指挥官";
      if (state.slotId === "title") return "选择称号";
      var slot = ctx.data.slot(state.slotId);
      return "选择升级 · " + (slot ? slot.name : state.slotId);
    }
    return "";
  }

  function subtitle() {
    if (state && state.kind === "upgrade" && state.shipInstanceId) {
      var shipInstance = FleetState.findShip(state.shipInstanceId);
      var ship = shipInstance && ctx.data.ship(shipInstance.cardId);
      if (ship) return ship.name;
    }
    return "";
  }

  /* ---- 过滤 ---- */
  function matchesQuery(card, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return String(card.name || "").toLowerCase().indexOf(q) !== -1 ||
           String(card.nameEn || "").toLowerCase().indexOf(q) !== -1;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---- 卡片（大图版：左侧卡图 ~40% contain，右侧卡名/效果，最右侧独立分数） ---- */
  // 升级卡 / 称号 点击大图走「卡片详档」lightbox（左图 + 右详情），其余走普通大图
  function cardLightboxMeta(card) {
    if (!card) return "";
    if (card.type === "title") return "称号";
    if (card.type === "upgrade") return FleetRules.slotLabel(ctx.data, card.slot);
    return "";
  }
  function cardThumb(card, alt) {
    var onclick = (card && (card.type === "upgrade" || card.type === "title"))
      ? Lightbox.cardOnclick(card, cardLightboxMeta(card))
      : 'onclick="event.stopPropagation(); Lightbox.open(this.src, this.alt)"';
    return (
      '<img class="sel-thumb" src="' + escapeHtml(card.image) + '" alt="' + escapeHtml(alt) + '" loading="lazy" ' +
      onclick + ">"
    );
  }

  // blocked: 非法但需展示的卡（如已装改装后其它改装卡），传入提示文案 → 卡片标红且不可点选
  function cardItem(card, extra, slotIcons, effectOverride, blocked) {
    var effect = effectOverride !== undefined
      ? effectOverride
      : (card.effect ? ArmadaIcons.toHtml(card.effect) : "");   // 全文显示 + 行内图标（不缩减内容）
    // FAQ/勘误 段（独立 faq 字段）：仅“显示FAQ”勾选时展示；多行拆分逐行 toHtml（toHtml 默认压平换行）。
    // 任务卡（effectOverride = objectiveFullHtml）已内联 FAQ 段落，不再重复渲染通用 faq 块
    var faqHtml = "";
    if (effectOverride === undefined && objPrefs.showFaq && card.faq) {
      var faqLines = String(card.faq).split("\n").map(function (line) {
        return '<span class="sel-faq-line">' + ArmadaIcons.toHtml(line) + "</span>";
      }).join("");
      faqHtml = '<span class="sel-faq"><b>FAQ：</b>' + faqLines + "</span>";
    }
    var actionAttr = blocked
      ? ' data-blocked="1"'
      : ' data-action="sel-pick" data-id="' + escapeHtml(card.id) + '"';
    return (
      '<button class="sel-card' + (blocked ? " is-blocked" : "") + '"' + actionAttr + ">" +
      cardThumb(card, card.name) +
      '<span class="sel-main">' +
      '<span class="sel-name">' + escapeHtml(card.name || "未命名") + "</span>" +
      (card.nameEn ? '<span class="sel-en">' + escapeHtml(card.nameEn) + "</span>" : "") +
      (extra ? '<span class="sel-meta">' + extra + "</span>" : "") +
      (slotIcons ? slotIcons : "") +
      (effect ? '<span class="sel-effect">' + effect + "</span>" : "") +
      (faqHtml ? faqHtml : "") +
      (blocked ? '<span class="sel-warn">' + escapeHtml(blocked) + "</span>" : "") +
      "</span>" +
      '<span class="sel-pts">' + (card.points == null ? "" : card.points) + "</span>" +
      "</button>"
    );
  }

  /* ---- 中队卡片（关键词/防御标记 tag + 点开浮窗看全部规则） ---- */
  // 关键词 tag（醒目）+ 防御标记 tag（带图标）；点击任意 tag → 浮窗显示该单位全部关键词/防御标记/自定义效果
  function squadronTags(card) {
    var parts = [];
    (card.squadron_keyword || []).forEach(function (kw) {
      var rule = ctx.data.squadronKeyword(kw.key);
      var label = (rule ? rule.nameZh : kw.key) + (kw.value != null ? " " + kw.value : "");
      parts.push(
        '<span class="sq-tag sq-tag--keyword" data-action="squadron-keywords" data-id="' + escapeHtml(card.id) + '" role="button" tabindex="0">' +
        escapeHtml(label) + "</span>"
      );
    });
    (card.defense_token || []).forEach(function (tid) {
      var rule = FleetRules.defenseTokenRule(tid);
      var label = rule ? rule.nameZh : tid;
      parts.push(
        '<span class="sq-tag sq-tag--defense" data-action="squadron-keywords" data-id="' + escapeHtml(card.id) + '" role="button" tabindex="0" title="' + (rule ? escapeHtml(rule.effect) : "") + '">' +
        '<span class="armada-icon armada-icon--defense-' + escapeHtml(tid) + '" aria-hidden="true"></span>' + escapeHtml(label) + "</span>"
      );
    });
    return parts.length ? '<span class="sq-tags">' + parts.join("") + "</span>" : "";
  }

  // 中队选择卡：左大图 + 右侧 卡名(大字)/tag/自定义效果（effect 已清理，关键字与防御标记走 tag）
  function squadronCard(card, meta, blockedMsg) {
    var blocked = !!blockedMsg;
    var effect = card.effect ? ArmadaIcons.toHtml(card.effect) : "";
    var actionAttr = blocked
      ? ' data-blocked="1"'
      : ' data-action="sel-pick" data-id="' + escapeHtml(card.id) + '"';
    return (
      '<button class="sel-card sel-card--squadron' + (blocked ? " is-blocked" : "") + '"' + actionAttr + ">" +
      cardThumb(card, card.name) +
      '<span class="sel-main">' +
      '<span class="sel-name">' + escapeHtml(card.name || "未命名") + "</span>" +
      (card.nameEn ? '<span class="sel-en">' + escapeHtml(card.nameEn) + "</span>" : "") +
      squadronTags(card) +
      (effect ? '<span class="sel-effect">' + effect + "</span>" : "") +
      (meta ? '<span class="sel-meta">' + escapeHtml(meta) + "</span>" : "") +
      (blockedMsg ? '<span class="sel-warn">' + escapeHtml(blockedMsg) + "</span>" : "") +
      "</span>" +
      '<span class="sel-pts">' + (card.points == null ? "" : card.points) + "</span>" +
      "</button>"
    );
  }

  // 浮窗内容：该单位全部关键词规则 + 防御标记效果 + 剩余自定义效果
  function squadronKeywordsContent(card) {
    var html = "";
    (card.squadron_keyword || []).forEach(function (kw) {
      var rule = ctx.data.squadronKeyword(kw.key);
      if (!rule) return;
      var label = rule.nameZh + (kw.value != null ? " " + kw.value : "") + " " + rule.nameEn;
      var ruleText = kw.value != null ? rule.rule.split("X").join(String(kw.value)) : rule.rule;
      html +=
        '<div class="sq-popup-item sq-popup-item--keyword">' +
        '<b class="sq-popup-item-name">' + escapeHtml(label) + "</b>" +
        '<span class="sq-popup-item-rule">' + ArmadaIcons.toHtml(ruleText) + "</span>" +
        "</div>";
    });
    (card.defense_token || []).forEach(function (tid) {
      var rule = FleetRules.defenseTokenRule(tid);
      if (!rule) return;
      html +=
        '<div class="sq-popup-item sq-popup-item--defense">' +
        '<b class="sq-popup-item-name"><span class="armada-icon armada-icon--defense-' + escapeHtml(tid) + '" aria-hidden="true"></span>' + escapeHtml(rule.nameZh + " " + rule.nameEn) + "</b>" +
        '<span class="sq-popup-item-rule">' + escapeHtml(rule.effect) + "</span>" +
        "</div>";
    });
    if (card.effect) {
      html += '<div class="sq-popup-effect">' + ArmadaIcons.toHtml(card.effect) + "</div>";
    }
    return html;
  }

  function openSquadronKeywordsPopup(card) {
    var overlay = document.createElement("div");
    overlay.className = "overlay sq-popup-overlay";
    overlay.innerHTML =
      '<div class="sq-popup">' +
      '<div class="sq-popup-head">' +
      "<h3>" + escapeHtml(card.name || "") + "</h3>" +
      (card.nameEn ? '<span class="sq-popup-en">' + escapeHtml(card.nameEn) + "</span>" : "") +
      "</div>" +
      '<div class="sq-popup-body">' + squadronKeywordsContent(card) + "</div>" +
      '<button class="btn sq-popup-close" data-sq-close>关闭</button>' +
      "</div>";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || (e.target.closest && e.target.closest("[data-sq-close]"))) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  /* 舰船选择卡片：一行槽位图标（指挥官/称号为隐式特殊槽，随后是各升级槽，仅展示） */
  function shipSlotIcons(card) {
    var slots = ["commander", "title"].concat((card && card.slots) || []);
    if (!slots.length) return "";
    var cells = slots.map(function (slotId) {
      var meta = ctx.data.slot(slotId) || { name: slotId };
      var svg = ctx.data.slotIcon(slotId);
      return (
        '<span class="sel-slot" title="' + escapeHtml(meta.name) + '" aria-label="' + escapeHtml(meta.name) + '">' +
        (svg || escapeHtml(meta.name)) +
        "</span>"
      );
    });
    return '<span class="sel-slots">' + cells.join("") + "</span>";
  }

  /* 任务卡规则全文：布设/特殊规则/回合结束/游戏结束/FAQ 各段落都展示
   * （得分是数字，已显示在 meta 徽章里，不再重复）。中文正文过 ArmadaIcons.toHtml
   * 转义并渲染行内图标，英文原文以弱化样式整块展示；段落标题由本函数静态输出。
   * 顶部开关控制：英文原文（objPrefs.showEn）与 FAQ（objPrefs.showFaq）。 */
  function objectiveFullHtml(card) {
    var sections = [
      ["布设", card.setup, card.setupEn],
      ["特殊规则", card.special, card.specialEn],
      ["回合结束", card.endOfRound, card.endOfRoundEn],
      ["游戏结束", card.endOfGame, card.endOfGameEn],
      ["FAQ", card.faq, card.faqEn],
    ];
    return sections.map(function (sec) {
      var isFaq = sec[0] === "FAQ";
      if (isFaq && !objPrefs.showFaq) return "";
      if (!sec[1] && !sec[2]) return "";
      var html = '<div class="obj-sec"><b class="obj-sec-title">' + sec[0] + "：</b>";
      if (sec[1]) html += ArmadaIcons.toHtml(sec[1]);
      if (sec[2] && objPrefs.showEn) html += '<span class="obj-sec-en">' + escapeHtml(sec[2]) + "</span>";
      return html + "</div>";
    }).join("");
  }

  /* ---- 顶部点数条：当前军表分数 / 上限，实时随选择刷新 ---- */
  function pointsBar() {
    if (!ctx || !ctx.data || !ctx.fleet) return "";
    var calc = FleetCalculator.calculateFleetPoints(ctx.data, ctx.fleet);
    var over = calc.isOverLimit ? " over" : "";
    return (
      '<div class="selector-pts' + over + '">' +
      '<span class="sel-pts-label">当前舰队分数</span>' +
      '<b class="sel-pts-value">' + calc.total + " / " + calc.pointsLimit + " 分</b>" +
      (over ? '<span class="sel-pts-over">超出限制</span>' : "") +
      "</div>"
    );
  }

  /* ---- 列表数据 ---- */
  function listData() {
    var q = state.query;
    if (state.kind === "ship") {
      return ctx.data.shipsOf(ctx.fleet.faction)
        .filter(function (c) { return matchesQuery(c, q); })
        .map(function (c) {
          var size = ctx.data.size(c.size);
          return cardItem(c, (size ? size.name + " · " : "") + (c.points == null ? "?" : c.points) + " 分", shipSlotIcons(c));
        });
    }
    if (state.kind === "squadron") {
      var sqAllowed = [];
      var sqBlocked = [];
      ctx.data.squadronsOf(ctx.fleet.faction).forEach(function (c) {
        if (!matchesQuery(c, q)) return;
        var res = FleetRules.canEquipSquadron(ctx.data, ctx.fleet, c);
        if (res.allowed) { sqAllowed.push(c); return; }
        // 同名 unique 冲突（跨指挥官/升级/称号/中队/舰船）→ 标红 + 提示；
        // 数量上限（独特仅 1、显式 limit）等其余原因照旧过滤隐藏
        if (res.reasons.length === 1 && res.reasons[0] === "unique-name") {
          sqBlocked.push({ card: c, msg: FleetRules.uniqueNameHint(ctx.data, ctx.fleet, c, c.id) });
        }
      });
      var sqMeta = function (c) {
        var owned = ctx.fleet.squadrons.filter(function (s) { return s.cardId === c.id; }).length;
        var limit = c.limit;   // 无 limit 字段 = 不封顶
        var tags = [];
        if (c.unique) tags.push("独特");
        if (c.ace) tags.push("王牌");
        tags.push("已带 " + owned + (limit ? "/" + limit : ""));
        tags.push((c.points == null ? "?" : c.points) + " 分");
        return tags.join(" · ");
      };
      return sqAllowed.map(function (c) {
        return squadronCard(c, sqMeta(c));
      }).concat(sqBlocked.map(function (b) {
        return squadronCard(b.card, sqMeta(b.card), b.msg);
      }));
    }
    if (state.kind === "objective") {
      return ctx.data.objectivesOf(state.category)
        .filter(function (c) { return matchesQuery(c, q); })
        .map(function (c) {
          var src = c.source || "";
          var pts = c.score ? c.score + " 分" : "";
          return cardItem(c, [src, pts].filter(Boolean).join(" · "), "", objectiveFullHtml(c));
        });
    }
    if (state.kind === "upgrade") {
      var shipInstance = FleetState.findShip(state.shipInstanceId);
      var pool;
      if (state.slotId === "title") {
        pool = ctx.data.cards.titles;
      } else {
        // 指挥官槽：upgradesOfSlot("commander")；普通槽：该槽全部升级卡
        // （改装类按自身槽出现，非独立槽；双槽卡在自身任一槽的选择界面都出现）
        pool = ctx.data.upgradesOfSlot(state.slotId);
      }
      var allowed = [];
      var blocked = [];
      // 目标槽当前占用卡：unique 冲突提示时排除它，重选同一张卡不被自己挡住
      var currentCardId = FleetRules.currentOccupant(ctx.data, ctx.fleet, shipInstance, state.slotId, state.slotIndex);
      pool.forEach(function (card) {
        if (!matchesQuery(card, q)) return;
        var res = FleetRules.canEquipUpgrade(ctx.data, ctx.fleet, shipInstance, state.slotId, card, state.slotIndex);
        if (res.allowed) { allowed.push(card); return; }
        // 非法但仍需展示的卡：改装类“每舰最多 1 张”、同名 unique 冲突、双槽卡兄弟槽被占、
        // 加槽卡卡面限制 → 标红 + 提示
        var blockedMsg = "";
        if (card.modification && res.reasons.length === 1 && res.reasons[0] === "modification-limit") {
          blockedMsg = FleetRules.reasonLabel("modification-limit");
        } else if (res.reasons.length === 1 && res.reasons[0] === "unique-name") {
          blockedMsg = FleetRules.uniqueNameHint(ctx.data, ctx.fleet, card, currentCardId);
        } else if (res.reasons.length === 1 && res.reasons[0] === "dual-slot") {
          blockedMsg = FleetRules.dualSlotHint(ctx.data, shipInstance, card);
        } else if (res.reasons.length === 1 && res.reasons[0] === "adds-slots") {
          blockedMsg = FleetRules.addsSlotsHint(ctx.data, shipInstance, card, state.slotId, state.slotIndex) ||
            FleetRules.reasonLabel("adds-slots");
        }
        if (blockedMsg) blocked.push({ card: card, msg: blockedMsg });
      });
      var metaOf = function (c) {
        var meta = [];
        if (c.modification) meta.push("改装");   // 改装标签放 metadata 区（task.md §6）
        if (c.faction) meta.push(ctx.data.faction(c.faction).name);
        // 槽位：双槽卡显示“武器小组 / 进攻改装”，单槽卡照旧显示单槽名
        var slots = (c.slots && c.slots.length) ? c.slots : [c.slot];
        if (slots.length) {
          meta.push(slots.map(function (sid) {
            var s = ctx.data.slot(sid);
            return s ? s.name : sid;
          }).join(" / "));
        }
        // 加槽卡：说明装备后给战舰增加哪些槽位（字段 addsSlots）
        if (c.addsSlots && c.addsSlots.length) {
          meta.push("增加槽位:" + c.addsSlots.map(function (sid) {
            var s = ctx.data.slot(sid);
            return s ? s.name : sid;
          }).join("/"));
        }
        meta.push((c.points == null ? "?" : c.points) + " 分");
        return meta.join(" · ");
      };
      return allowed.map(function (c) {
        return cardItem(c, metaOf(c));
      }).concat(blocked.map(function (b) {
        return cardItem(b.card, metaOf(b.card), "", "", b.msg);
      }));
    }
    return [];
  }

  /* ---- 顶部偏好开关：控制 FAQ 显示（所有卡类选择器都显示“显示FAQ”，默认隐藏）；
   * “显示英文”仅任务选择显示（objective 卡有英文原文字段） ---- */
  function prefToggles() {
    if (!state) return "";
    var enChecked = objPrefs.showEn ? " checked" : "";
    var faqChecked = objPrefs.showFaq ? " checked" : "";
    var html = '<div class="sel-prefs" role="group" aria-label="显示偏好">';
    if (state.kind === "objective") {
      html += '<label class="sel-pref"><input type="checkbox" data-action="pref-en"' + enChecked + "> 显示英文</label>";
    }
    html += '<label class="sel-pref"><input type="checkbox" data-action="pref-faq"' + faqChecked + "> 显示FAQ</label>";
    return html + "</div>";
  }

  /* ---- 渲染 ---- */
  function render() {
    if (!root) return;
    var html =
      '<div class="selector" data-kind="' + (state && state.kind || "") + '">' +
      '<div class="selector-header">' +
      '<button class="sel-nav" data-action="sel-back" aria-label="返回">←</button>' +
      '<div class="sel-title"><h3>' + escapeHtml(title()) + "</h3>" +
      (subtitle() ? '<p class="sel-sub">' + escapeHtml(subtitle()) + "</p>" : "") + "</div>" +
      '<button class="sel-nav" data-action="sel-close" aria-label="关闭">×</button>' +
      "</div>" +
      pointsBar() +
      prefToggles() +
      '<div class="selector-search"><input data-action="sel-search" type="search" placeholder="搜索卡名 / 英文名" value="' +
      escapeHtml(state.query) + '"></div>' +
      '<div class="selector-body" data-sel-body></div>' +
      "</div>";
    root.innerHTML = html;
    bodyEl = root.querySelector("[data-sel-body]");
    renderBody();
  }

  function renderBody() {
    if (!bodyEl) return;
    var items = listData();
    bodyEl.innerHTML = items.length
      ? items.join("")
      : '<div class="sel-empty">' + (state.kind === "upgrade" ? "没有可装备的卡（限制过滤后为空）" : "没有符合条件的结果") + "</div>";
  }

  /* ---- 选择 ---- */
  function pick(cardId) {
    var card = ctx.data.anyCard(cardId);
    if (state.kind === "ship") {
      var slots = (ctx.data.ship(cardId) || {}).slots || [];
      FleetState.addShip(cardId, slots);
    } else if (state.kind === "squadron") {
      var sqCard = ctx.data.squadron(cardId) || {};
      var res = FleetRules.canEquipSquadron(ctx.data, ctx.fleet, sqCard);
      if (res.allowed) FleetState.addSquadron(cardId);
    } else if (state.kind === "objective") {
      FleetState.setObjective(state.category, cardId);
    } else if (state.kind === "upgrade") {
      var shipInstanceId = state.shipInstanceId;
      var shipInst = FleetState.findShip(shipInstanceId);
      // 二次校验：非法卡（含仅因“每舰最多 1 张”标红的改装卡、同名 unique 冲突卡）不执行装备
      if (shipInst && !FleetRules.canEquipUpgrade(ctx.data, ctx.fleet, shipInst, state.slotId, card, state.slotIndex).allowed) {
        return;
      }
      // 加槽卡：装备后给战舰追加槽位（addsSlots → setUpgrade/setTitle 的 addsSlots 参数）
      var addsSlots = (card.addsSlots && card.addsSlots.length) ? card.addsSlots : null;
      if (state.slotId === "commander") FleetState.setCommander(shipInstanceId, cardId);
      else if (state.slotId === "title") FleetState.setTitle(shipInstanceId, cardId, addsSlots);
      else {
        // 双槽卡（如 武器小组/进攻改装）：目标槽所在舰船若另一个槽位存在且空闲 →
        // 一并占用（setUpgrade 把兄弟槽写成 shared，点数只计一次，见 calculator/render）
        var shareIndex = null;
        var cardSlots = (card.slots && card.slots.length) ? card.slots : [card.slot];
        if (cardSlots.length > 1 && cardSlots.indexOf(state.slotId) !== -1) {
          var shipSlots = (ctx.data.ship(shipInst.cardId) || {}).slots || [];
          var otherSlot = cardSlots.find(function (sid) { return sid !== state.slotId; });
          var otherIndex = otherSlot != null ? shipSlots.indexOf(otherSlot) : -1;
          if (otherIndex !== -1) {
            var otherEntry = shipInst.upgrades.find(function (u) { return u.slotIndex === otherIndex; });
            if (otherEntry && !otherEntry.cardId) shareIndex = otherIndex;
          }
        }
        FleetState.setUpgrade(shipInstanceId, state.slotIndex, cardId, shareIndex, addsSlots);
      }
    }
    close();
  }

  /* ---- 事件 ---- */
  function bind() {
    if (!root) return;
    root.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === "sel-back" || action === "sel-close") close();
      else if (action === "sel-pick") pick(btn.dataset.id);
      else if (action === "squadron-keywords") {
        var sqCard = ctx.data.squadron(btn.dataset.id);
        if (sqCard) openSquadronKeywordsPopup(sqCard);
      }
    });
    root.addEventListener("input", function (e) {
      var inp = e.target.closest("[data-action='sel-search']");
      if (!inp) return;
      state.query = inp.value;
      renderBody();
    });
    root.addEventListener("change", function (e) {
      var cb = e.target.closest("[data-action='pref-en'],[data-action='pref-faq']");
      if (!cb) return;
      if (cb.dataset.action === "pref-en") objPrefs.showEn = cb.checked;
      else {
        objPrefs.showFaq = cb.checked;
        // 总览常驻表面（选中卡行 equipItem 的 FAQ 段）也随开关刷新；onChange 只碰
        // overview/action-bar/points-box，不会关掉当前选择器
        if (window.FleetRender && FleetRender.setPrefs) FleetRender.setPrefs({ showFaq: objPrefs.showFaq });
        if (ctx && ctx.onChange) ctx.onChange();
      }
      renderBody();
    });
  }

  return {
    configure: configure,
    bind: bind,
    openShip: openShip,
    openSquadron: openSquadron,
    openUpgrade: openUpgrade,
    openObjective: openObjective,
    close: close,
    isOpen: function () { return !!state; },
  };
})();
