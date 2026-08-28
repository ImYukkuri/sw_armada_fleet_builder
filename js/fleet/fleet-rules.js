/* Fleet Builder · 规则引擎（纯逻辑，不依赖 DOM）
 * 检查一张升级/称号/中队/任务卡能否装备到当前舰队。
 *
 * canEquipUpgrade(data, fleet, shipInstance, slotId, card, slotIndex) -> { allowed, reasons }
 *   slotId: "commander" | "title" | 普通升级槽 id（如 "officer"）
 *   slotIndex: 目标普通槽下标（用于“当前占用卡”排除，unique 重选同一张不误报）
 *   reasons: 拒绝原因的英文 key（faction/size/ship/flagship/slot/unique-name…），UI 可翻译展示
 *
 * 过滤顺序（task.md §14）：slot -> faction -> size -> ship id/name -> flagship ->
 *   modification-limit（改装非独立槽，仅每舰 1 张限制）-> unique-name（全局同名唯一）
 *
 * 已实现：slot（含双槽卡 slots）/ faction / size / shipId / shipName / requiresFlagship /
 *   commander 舰队级唯一 / 全局 unique（按 nameEn "•" 前缀，跨指挥官/称号/升级/中队/舰船
 *   同名不可重复，uniqueNameConflict/uniqueNameHint）/ modification 每舰 1 张 /
 *   通用每舰升级卡唯一（per-ship-duplicate：同一张升级卡在同一艘舰上最多一次，跨槽位）/
 *   双槽卡 atomic（dual-slot/dual-locked，两槽都空闲才能装、占位不可直接替换）/
 *   加槽卡 adds-slots（卡面注明"已有该槽则不能装备"时拒绝，addsSlotsReject；其余加槽卡允许重复槽）
 * 预留（第一版不做，见 task.md §10）：
 *   - 中队王牌上限、轻型运输舰上限
 *   - 旗舰完整校验
 *   - 任务卡限制
 */
window.FleetRules = (function () {
  const COMMANDER_SLOT = "commander";
  const TITLE_SLOT = "title";

  // 槽位/类别中文名（commander / title / 舰船 / 中队 为特殊位，其余查 config）
  function slotLabel(data, slotIdOrKind) {
    if (!slotIdOrKind) return "";
    if (slotIdOrKind === "commander") return "指挥官";
    if (slotIdOrKind === "title") return "称号";
    if (slotIdOrKind === "ship") return "舰船";
    if (slotIdOrKind === "squadron") return "中队";
    const m = data.slot(slotIdOrKind);
    return m ? m.name : slotIdOrKind;
  }

  // unique 卡判定：nameEn 以 "•" 开头（指挥官 / 称号 / 升级 / 中队统一标记，数据已固化）
  function isUniqueName(card) {
    return !!(card && card.nameEn && card.nameEn.charAt(0) === "•");
  }

  // 舰队内所有已选 unique 卡的 nameEn -> { slotKey, name }（全局唯一，跨卡牌类型同名）。
  // excludeCardId：排除某张卡（“替换/重选同一张”场景不被自己挡住）。
  // 扫描范围：舰队指挥官 + 各舰（舰船卡 / 称号 / 全部升级槽）+ 全部中队。
  function uniqueNamesInFleet(data, fleet, excludeCardId) {
    const map = {};
    function add(card, slotKey) {
      if (!card || !isUniqueName(card)) return;
      if (excludeCardId && card.id === excludeCardId) return;
      map[card.nameEn] = { slotKey: slotKey, name: card.name };
    }
    if (fleet.commander) add(data.upgrade(fleet.commander), "commander");
    fleet.ships.forEach(function (s) {
      add(data.ship(s.cardId), "ship");
      add(data.title(s.title), "title");
      (s.upgrades || []).forEach(function (u) {
        const c = data.anyCard(u.cardId);
        add(c, c ? (c.slot || null) : null);
      });
    });
    fleet.squadrons.forEach(function (sq) { add(data.squadron(sq.cardId), "squadron"); });
    return map;
  }

  // card 与舰队已有 unique 卡同名 → 返回已存在的那张 {slotKey, name}，否则 null
  function uniqueNameConflict(data, fleet, card, excludeCardId) {
    if (!isUniqueName(card)) return null;
    return uniqueNamesInFleet(data, fleet, excludeCardId)[card.nameEn] || null;
  }

  // 同名冲突提示文案：舰队中已存在同名卡：[槽位名称]中文名
  function uniqueNameHint(data, fleet, card, excludeCardId) {
    const conflict = uniqueNameConflict(data, fleet, card, excludeCardId);
    return conflict ? "舰队中已存在同名卡：" + slotLabel(data, conflict.slotKey) + " " + conflict.name : "";
  }

  // 双槽卡被拒提示：指出哪个兄弟槽已有升级卡（双槽卡需两个槽位都空闲）
  function dualSlotHint(data, shipInstance, card) {
    const cardSlots = (card.slots && card.slots.length) ? card.slots : [card.slot];
    if (cardSlots.length <= 1) return "";
    const shipSlots = (data.ship(shipInstance.cardId) || {}).slots || [];
    const occupied = cardSlots.filter(function (sid) {
      const idx = shipSlots.indexOf(sid);
      if (idx === -1) return false;
      const entry = (shipInstance.upgrades || []).find(function (u) { return u.slotIndex === idx; });
      return !!(entry && entry.cardId);
    });
    if (!occupied.length) return "";
    return "双槽位卡需两个槽位都空闲：另一槽位" + occupied.map(function (sid) {
      const m = data.slot(sid);
      return m ? m.name : sid;
    }).join("、") + "已有升级卡";
  }

  // 加槽卡被拒提示：列出舰船上已存在、且卡面禁止重复的槽位（addsSlotsHint）
  function addsSlotsHint(data, shipInstance, card, slotId, slotIndex) {
    const addsReject = card.addsSlotsReject;
    if (!addsReject || !Array.isArray(addsReject.slots) || !addsReject.slots.length) return "";
    const shipCard = data.ship(shipInstance.cardId) || {};
    const sizeOk = !Array.isArray(addsReject.sizes) || !addsReject.sizes.length ||
      (shipCard.size && addsReject.sizes.indexOf(shipCard.size) !== -1);
    if (!sizeOk) return "";
    const excludeKey = slotId === TITLE_SLOT ? "title" : (slotIndex != null ? Number(slotIndex) : null);
    const have = addsReject.slots.filter(function (sid) { return shipHasSlot(data, shipInstance, sid, excludeKey); });
    if (!have.length) return "";
    const names = have.map(function (sid) {
      const m = data.slot(sid);
      return m ? m.name : sid;
    }).join("、");
    return "该舰已有升级槽位：" + names + "，此卡（卡面限制）不可装备";
  }

  // 目标槽位当前占用的卡（用于 unique 替换排除 / 前端 blocked 提示）
  function currentOccupant(data, fleet, shipInstance, slotId, slotIndex) {
    if (slotId === COMMANDER_SLOT) return fleet.commander;
    if (slotId === TITLE_SLOT) return shipInstance.title;
    if (slotIndex != null) {
      const u = (shipInstance.upgrades || []).find(function (x) { return x.slotIndex === Number(slotIndex); });
      return u ? u.cardId : null;
    }
    return null;
  }

  // 该舰是否已装备一张“改装”类升级卡（排除正在更换的那张）。
  // 改装不是独立槽位：改装卡按自身 slot 装进普通升级槽，规则上每舰最多 1 张。
  function shipHasModification(data, shipInstance, excludeCardId) {
    return (shipInstance.upgrades || []).some(function (u) {
      if (!u.cardId || u.cardId === excludeCardId) return false;
      const c = data.upgrade(u.cardId);
      return !!(c && c.modification);
    });
  }

  function cardFactionAllowed(card, fleet) {
    const r = card.restrictions || {};
    // 优先用解析出的 factions（支持双阵营，如 共和国/分离势力）
    if (Array.isArray(r.factions) && r.factions.length) {
      return r.factions.indexOf(fleet.faction) !== -1;
    }
    // 回退到单值 faction 字段（null = 无阵营限制）
    if (card.faction) return card.faction === fleet.faction;
    return true;
  }

  function shipCardFor(data, shipInstance) {
    return data.ship(shipInstance.cardId) || {};
  }

  // 舰船当前是否拥有该槽位：原生升级栏有，或已被某张加槽卡添加（addedBy 对应其加槽入口）。
  // excludeAddedBy：排除某个加槽入口产生的子槽（重选/替换同一张加槽卡时不被自己挡住），
  //   普通升级槽传数字下标；称号槽传 "title"；null = 不排除。
  function shipHasSlot(data, shipInstance, slotId, excludeAddedBy) {
    const shipCard = data.ship(shipInstance.cardId) || {};
    if ((shipCard.slots || []).indexOf(slotId) !== -1) return true;
    return (shipInstance.upgrades || []).some(function (u) {
      return u.slotId === slotId && u.addedBy !== excludeAddedBy;
    });
  }

  // 舰船该槽位的实际下标（原生或加槽卡添加的；-1 = 舰船无此槽）
  function effectiveSlotIndex(data, shipInstance, slotId) {
    const shipCard = data.ship(shipInstance.cardId) || {};
    const n = (shipCard.slots || []).indexOf(slotId);
    if (n !== -1) return n;
    const u = (shipInstance.upgrades || []).find(function (x) { return x.slotId === slotId; });
    return u ? u.slotIndex : -1;
  }

  /* ---- 升级 / 称号 / 改装合法性 ---- */
  // slotIndex：目标普通槽下标，用于“当前占用卡”排除（unique 重选同一张不误报）
  function canEquipUpgrade(data, fleet, shipInstance, slotId, card, slotIndex) {
    const reasons = [];

    // 1. 槽位类型（双槽卡可进自身任一槽；改装卡按自身槽进普通升级槽，没有独立“改装槽”）
    const cardSlots = (card.slots && card.slots.length) ? card.slots : [card.slot];
    if (slotId === COMMANDER_SLOT) {
      if (card.slot !== "commander") reasons.push("slot");
    } else if (slotId === TITLE_SLOT) {
      if (card.type !== "title") reasons.push("slot");
    } else {
      if (cardSlots.indexOf(slotId) === -1) reasons.push("slot");
    }

    // 2. 阵营
    if (!cardFactionAllowed(card, fleet)) reasons.push("faction");

    const shipCard = shipCardFor(data, shipInstance);
    const r = card.restrictions || {};

    // 2b. 双槽卡（如 武器小组/进攻改装）：两个槽位必须都在舰船上（原生或加槽卡添加），且**都空闲**才能装备。
    //     任一槽被占用（含被同一张双槽卡占着）→ 不可选（req：占用双槽需原子，防半占位 bug）
    if (cardSlots.length > 1 && slotId !== COMMANDER_SLOT && slotId !== TITLE_SLOT) {
      if (cardSlots.some(function (sid) { return effectiveSlotIndex(data, shipInstance, sid) === -1; })) {
        reasons.push("slot");   // 舰船缺少其中一个槽位 → 过滤隐藏
      } else {
        const dualOccupied = cardSlots.some(function (sid) {
          const idx = effectiveSlotIndex(data, shipInstance, sid);
          const entry = (shipInstance.upgrades || []).find(function (u) { return u.slotIndex === idx; });
          return !!(entry && entry.cardId);
        });
        if (dualOccupied) reasons.push("dual-slot");
      }
    }

    // 3. 舰船规模
    if (r.sizes && r.sizes.length && shipCard.size && r.sizes.indexOf(shipCard.size) === -1) {
      reasons.push("size");
    }

    // 4. 舰船 ID / 名称限制
    if (r.shipIds && r.shipIds.length) {
      if (r.shipIds.indexOf(shipInstance.cardId) === -1) reasons.push("ship");
    } else if (r.shipNames && r.shipNames.length) {
      const nameOk = r.shipNames.some(function (n) {
        return shipCard.name === n;
      });
      if (!nameOk) reasons.push("ship");
    }

    // 5. 需要旗舰
    if (r.requiresFlagship && !isFlagship(data, fleet, shipInstance)) {
      reasons.push("flagship");
    }

    // 6. 改装数量限制：每舰最多 1 张改装类升级（替换同一张允许，改装走普通槽）
    if (card.modification && shipHasModification(data, shipInstance, card.id)) {
      reasons.push("modification-limit");
    }

    // 7. Commander 舰队级唯一：舰队已有指挥官时，只有旗舰（其挂载舰）可更换
    if (slotId === COMMANDER_SLOT && card.slot === "commander") {
      if (fleet.commander && fleet.commanderShipId !== shipInstance.instanceId) {
        reasons.push("commander");
      }
    }

    // 8. Unique 全局唯一（按 nameEn "•" 前缀，跨指挥官 / 称号 / 升级 / 中队 / 舰船同名不可重复）
    const currentCardId = currentOccupant(data, fleet, shipInstance, slotId, slotIndex);
    if (uniqueNameConflict(data, fleet, card, currentCardId)) {
      reasons.push("unique-name");
    }

    // 9. 通用限制：同一张升级卡在同一艘舰上最多装备一次（跨槽位；正在替换/重选自身的槽位不算）。
    //    覆盖双槽卡（占两槽）与舰船重复同类型槽位装同一张卡的情况。
    //    仅当 slotIndex 给定（能定位目标槽）时判定；目标槽正被该卡占用 = 替换/重选自身，不算重复。
    if (slotId !== COMMANDER_SLOT && slotId !== TITLE_SLOT && slotIndex != null) {
      if (currentCardId !== card.id) {
        const dup = (shipInstance.upgrades || []).some(function (u) { return u.cardId === card.id; });
        if (dup) reasons.push("per-ship-duplicate");
      }
    }

    // 10. 双槽卡占用的槽位不可替换（须先删除整组，再重新装备）——防止双槽半占位 bug
    if (slotId !== COMMANDER_SLOT && slotId !== TITLE_SLOT && currentCardId) {
      const curCard = data.anyCard(currentCardId);
      if (curCard && curCard.slots && curCard.slots.length > 1) {
        reasons.push("dual-locked");
      }
    }

    // 11. 加槽卡：仅卡面明确写“已有该槽则不能装备”时限制（addsSlotsReject）。
    //     舰船原生/其它卡已含限制槽位且规模符合 → 拒绝（重选/替换本卡自身时排除自己加的槽）。
    const addsReject = card.addsSlotsReject;
    if (addsReject && Array.isArray(addsReject.slots) && addsReject.slots.length) {
      const sizeOk = !Array.isArray(addsReject.sizes) || !addsReject.sizes.length ||
        (shipCard.size && addsReject.sizes.indexOf(shipCard.size) !== -1);
      if (sizeOk) {
        const excludeKey = slotId === TITLE_SLOT ? "title" : (slotIndex != null ? Number(slotIndex) : null);
        if (addsReject.slots.some(function (sid) { return shipHasSlot(data, shipInstance, sid, excludeKey); })) {
          reasons.push("adds-slots");
        }
      }
    }

    return { allowed: reasons.length === 0, reasons: reasons };
  }

  /* ---- 中队 ---- */
  function canEquipSquadron(data, fleet, card) {
    const reasons = [];
    if (!cardFactionAllowed(card, fleet)) reasons.push("faction");
    if (reasons.length) {
      return { allowed: false, reasons: reasons };
    }
    // 数量上限：unique 单位全舰队仅限 1 个；其余仅受显式 card.limit 约束
    // （常规战机 JSON 已去掉 limit 字段 = 不封顶；王牌单位仍可写 limit）。
    const owned = fleet.squadrons.filter(function (s) { return s.cardId === card.id; }).length;
    if (card.unique && owned >= 1) {
      reasons.push("squadron-unique");
    } else if (card.limit && owned >= card.limit) {
      reasons.push("limit");
    }
    // 跨类型同名 unique（如 中队“•XXX”与升级/指挥官同名）也不可重复；
    // 排除自身 cardId，使“已带 n/limit”的计数限制仍由上面两分支负责。
    if (uniqueNameConflict(data, fleet, card, card.id)) {
      reasons.push("unique-name");
    }
    return { allowed: reasons.length === 0, reasons: reasons };
  }

  /* ---- 任务卡 ---- */
  function canSetObjective(data, fleet, category, card) {
    const reasons = [];
    if (card.category !== category) reasons.push("category");
    // 任务卡不限制阵营；预留：任务卡专属限制
    return { allowed: reasons.length === 0, reasons: reasons };
  }

  /* ---- 旗舰判定 ---- */
  function isFlagship(data, fleet, shipInstance) {
    if (!shipInstance) return false;
    if (fleet.commanderShipId === shipInstance.instanceId) return true;
    // 旗舰舰桥（offensive_retrofit_006）使该舰成为旗舰
    return shipInstance.upgrades.some(function (u) { return u.cardId === "offensive_retrofit_006"; });
  }

  // reasons 的中文说明（§35 预留展示）
  function reasonLabel(reason) {
    const map = {
      slot: "升级槽位不符",
      faction: "阵营不符",
      size: "舰船规模不符",
      ship: "该舰船不满足名称/舰船限制",
      flagship: "需要旗舰",
      commander: "舰队已有指挥官（全舰队仅 1 名）",
      "unique-name": "舰队中已存在同名卡",
      "dual-slot": "双槽位卡需两个槽位都空闲",
      "dual-locked": "双槽位卡占用的槽位不可替换（请先删除）",
      "adds-slots": "该舰已有此卡要增加的升级槽位（卡面限制）",
      "modification-limit": "每艘船只能有一个改装类组件",
      "per-ship-duplicate": "同一张升级卡在同一艘舰上只能装一次",
      "squadron-unique": "独特单位全舰队仅限 1 个",
      limit: "该中队已达携带上限",
      category: "任务类别不符",
    };
    return map[reason] || reason;
  }

  return {
    canEquipUpgrade: canEquipUpgrade,
    canEquipSquadron: canEquipSquadron,
    canSetObjective: canSetObjective,
    isFlagship: isFlagship,
    reasonLabel: reasonLabel,
    slotLabel: slotLabel,
    isUniqueName: isUniqueName,
    uniqueNameConflict: uniqueNameConflict,
    uniqueNameHint: uniqueNameHint,
    dualSlotHint: dualSlotHint,
    addsSlotsHint: addsSlotsHint,
    currentOccupant: currentOccupant,
  };
})();
