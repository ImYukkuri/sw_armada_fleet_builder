/* Fleet Builder · Fleet State（唯一数据真相，不依赖 DOM）
 * 军表只存 cardId 引用，绝不复制卡牌对象；舰船用 instanceId 区分重复实例。
 * JSON.stringify(fleet) 即得完整可序列化军表（为未来保存/导入/导出准备）。
 *
 * 舰队级字段：commander / commanderShipId（指挥官是 Fleet 层数据，全舰队 1 名；
 * 装备指挥官的舰船即旗舰，见 task.md §1）。
 *
 * 舰船实例结构（task.md §28）：
 *   {
 *     instanceId: "ship-001",
 *     cardId: "arquitens_command",
 *     title: null,                // 称号卡 cardId（独立于普通升级槽，UI 上排在槽位图标最后）
 *     upgrades: [{slotIndex, cardId}, ...]  // 按舰船升级槽顺序（含改装类升级，改装按普通槽装备）
 *   }
 * 改装不是独立槽位：改装升级卡按自身 slot 装进普通升级槽，仅限制每舰最多 1 张（fleet-rules）。
 */
window.FleetState = (function () {
  let fleet = null;
  let shipSeq = 0;
  let squadronSeq = 0;

  function makeId(prefix, seq) {
    return prefix + "-" + String(seq).padStart(3, "0");
  }

  /* ---- 初始化 ---- */
  function create(faction, pointsLimit) {
    fleet = {
      version: 1,
      id: null,
      name: "",
      faction: faction || null,
      pointsLimit: pointsLimit || 400,
      commander: null,          // 舰队级指挥官卡 cardId（全舰队仅 1 名）
      commanderShipId: null,    // 装备指挥官的舰船 instanceId（即旗舰）
      ships: [],
      squadrons: [],
      objectives: { assault: null, defense: null, navigation: null },
    };
    shipSeq = 0;
    squadronSeq = 0;
    return fleet;
  }

  function get() { return fleet; }

  /* ---- 舰船 ---- */
  // slots: 舰船卡槽位 id 数组（来自 Card Database），用于初始化 upgrades
  function addShip(cardId, slots) {
    shipSeq += 1;
    const ship = {
      instanceId: makeId("ship", shipSeq),
      cardId: cardId,
      title: null,
      upgrades: (slots || []).map(function (slot, i) {
        return { slotIndex: i, cardId: null };
      }),
    };
    fleet.ships.push(ship);
    return ship;
  }

  function findShip(instanceId) {
    return fleet.ships.find(function (s) { return s.instanceId === instanceId; }) || null;
  }

  function removeShip(instanceId) {
    fleet.ships = fleet.ships.filter(function (s) { return s.instanceId !== instanceId; });
    // 旗舰被删除则清除舰队指挥官（指挥官必须挂载在某艘舰上，见 task.md 隐患三）
    if (fleet.commanderShipId === instanceId) {
      fleet.commander = null;
      fleet.commanderShipId = null;
    }
  }

  /* ---- 指挥官 / 称号（特殊装备位） ---- */
  // 指挥官是 Fleet 级数据：cardId 存 fleet.commander，装备它的舰船成为旗舰。
  // shipInstanceId 用于记录旗舰（commanderShipId），删除时随卡一并清除。
  function setCommander(shipInstanceId, upgradeCardId) {
    fleet.commander = upgradeCardId || null;
    fleet.commanderShipId = upgradeCardId ? (shipInstanceId || null) : null;
  }

  function setTitle(instanceId, titleCardId, addsSlots) {
    const s = findShip(instanceId);
    if (!s) return;
    // 旧称号添加的槽位整组清理（称号只有 title 这一个加槽入口；子槽内组件一并移除）
    s.upgrades = s.upgrades.filter(function (u) { return u.addedBy !== "title"; });
    s.title = titleCardId || null;
    if (titleCardId && Array.isArray(addsSlots) && addsSlots.length) {
      appendAddedSlots(s, addsSlots, "title");
    }
  }

  /* ---- 普通升级槽 ---- */
  // upgradeCardId 为 null 时清除。shareSlotIndex：双槽卡（如 武器小组/进攻改装 双槽位）
  // 装备时若舰船兄弟槽空闲则一并占用（写入 shared 条目；点数只计一次，见 calculator）。
  // addsSlots：加槽卡（如 旗舰舰桥→舰队指挥）装备后给战舰追加的升级槽位 id 数组。
  function setUpgrade(instanceId, slotIndex, upgradeCardId, shareSlotIndex, addsSlots) {
    const s = findShip(instanceId);
    if (!s) return;
    slotIndex = Number(slotIndex);
    clearSlotOccupation(s, slotIndex);
    if (upgradeCardId == null) return;   // 清除只清 cardId，不删槽
    const slot = s.upgrades.find(function (u) { return u.slotIndex === slotIndex; });
    if (slot) slot.cardId = upgradeCardId;
    if (shareSlotIndex != null) {
      const sibling = s.upgrades.find(function (u) { return u.slotIndex === Number(shareSlotIndex); });
      if (sibling && !sibling.cardId) {
        sibling.cardId = upgradeCardId;
        sibling.shared = true;
      }
    }
    if (Array.isArray(addsSlots) && addsSlots.length) {
      appendAddedSlots(s, addsSlots, slotIndex);
    }
  }

  // 追加加槽卡产生的子槽位：{slotIndex, cardId:null, slotId, addedBy}。
  // addedBy = 加槽卡所在槽位（普通升级槽为数字下标；称号固定 "title"），
  // 删除加槽卡时按它整组清理。已存在的槽位类型不重复添加。
  function appendAddedSlots(s, slotIds, addedBy) {
    const have = new Set(s.upgrades.filter(function (u) { return u.slotId; }).map(function (u) { return u.slotId; }));
    slotIds.forEach(function (sid) {
      if (have.has(sid)) return;
      s.upgrades.push({ slotIndex: nextSlotIndex(s), cardId: null, slotId: sid, addedBy: addedBy });
      have.add(sid);
    });
  }

  function nextSlotIndex(s) {
    return s.upgrades.reduce(function (m, u) { return Math.max(m, u.slotIndex); }, -1) + 1;
  }

  // 清除某槽位：若该槽是双槽卡的共享条目，连同其主条目一起清掉；
  // 若主条目带共享条目，也一并清除（删除/替换时双槽整组处理）。
  // 若该槽位是加槽卡所在槽：该卡添加的子槽位整组删除（子槽内组件一并清除）。
  function clearSlotOccupation(s, slotIndex) {
    const entry = s.upgrades.find(function (u) { return u.slotIndex === slotIndex; });
    if (!entry) return;
    if (entry.addedBy === undefined) {
      // 加槽卡被移除/替换：其添加的子槽位从升级栏删掉，不留孤儿组件
      s.upgrades = s.upgrades.filter(function (u) { return u.addedBy !== entry.slotIndex; });
    }
    if (entry.shared) {
      const partner = s.upgrades.find(function (u) { return u.cardId === entry.cardId && !u.shared; });
      if (partner) partner.cardId = null;
    } else {
      const partner = s.upgrades.find(function (u) { return u.cardId === entry.cardId && u.shared; });
      if (partner) { partner.cardId = null; delete partner.shared; }
    }
    entry.cardId = null;
  }

  /* ---- 中队 ---- */
  function addSquadron(cardId) {
    squadronSeq += 1;
    const sq = { instanceId: makeId("squadron", squadronSeq), cardId: cardId };
    fleet.squadrons.push(sq);
    return sq;
  }

  function findSquadron(instanceId) {
    return fleet.squadrons.find(function (s) { return s.instanceId === instanceId; }) || null;
  }

  function removeSquadron(instanceId) {
    fleet.squadrons = fleet.squadrons.filter(function (s) { return s.instanceId !== instanceId; });
  }

  // 中队数量调节：非 unique 非 ace 的普通中队以“单卡 + 数量”展示（task.md 新需求）。
  // delta +1 加一个实例（上限由 FleetRules.canEquipSquadron 在 UI 层把关）；
  // delta -1 移除该类型的最后一个实例。count<=0 时不渲染，即为移除。
  function changeSquadronCount(cardId, delta) {
    const list = fleet.squadrons.filter(function (s) { return s.cardId === cardId; });
    if (delta > 0) {
      squadronSeq += 1;
      fleet.squadrons.push({ instanceId: makeId("squadron", squadronSeq), cardId: cardId });
    } else if (delta < 0 && list.length) {
      const last = list[list.length - 1];
      fleet.squadrons = fleet.squadrons.filter(function (s) { return s !== last; });
    }
  }

  // 删除某类中队的全部实例（单卡 + 数量里的 ×）
  function removeSquadronsByCard(cardId) {
    fleet.squadrons = fleet.squadrons.filter(function (s) { return s.cardId !== cardId; });
  }

  /* ---- 任务卡（每类各一） ---- */
  function setObjective(category, objectiveId) {
    if (!(category in fleet.objectives)) return;
    fleet.objectives[category] = objectiveId || null;
  }

  /* ---- 判定 ---- */
  // 该舰是否为旗舰：装备了指挥官（fleet.commanderShipId）或装备了“旗舰舰桥”
  function isFlagship(instanceId) {
    const s = findShip(instanceId);
    if (!s) return false;
    if (fleet.commanderShipId === instanceId) return true;
    return s.upgrades.some(function (u) { return u.cardId === "offensive_retrofit_006"; });
  }

  // 舰队内是否已有指挥官（指挥官全舰队唯一）
  function hasCommander() {
    return !!fleet.commander;
  }

  return {
    create: create,
    get: get,
    addShip: addShip,
    findShip: findShip,
    removeShip: removeShip,
    setCommander: setCommander,
    setTitle: setTitle,
    setUpgrade: setUpgrade,
    addSquadron: addSquadron,
    findSquadron: findSquadron,
    removeSquadron: removeSquadron,
    changeSquadronCount: changeSquadronCount,
    removeSquadronsByCard: removeSquadronsByCard,
    setObjective: setObjective,
    isFlagship: isFlagship,
    hasCommander: hasCommander,
  };
})();
