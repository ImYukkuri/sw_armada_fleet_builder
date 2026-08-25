/* Fleet Builder · 点数计算（纯逻辑）
 * 军表总点数 = 舰船 + 舰船上的称号/升级（改装类升级按普通槽计）+ 舰队指挥官（计入旗舰）+ 中队。
 * 任务卡不计入（task.md §24）。点数由数据实时计算，不写死在 Fleet state 中。 */
window.FleetCalculator = (function () {
  function pointsOf(data, cardId) {
    if (!cardId) return 0;
    const c = data.anyCard(cardId);
    return c && c.points != null ? c.points : 0;
  }

  function shipTotal(data, shipInstance) {
    const shipCard = data.ship(shipInstance.cardId) || {};
    let total = shipCard.points != null ? shipCard.points : 0;
    total += pointsOf(data, shipInstance.title);
    shipInstance.upgrades.forEach(function (u) {
      if (u.shared) return;   // 双槽卡占用的兄弟槽位是同一张卡，点数只计一次
      total += pointsOf(data, u.cardId);
    });
    return total;
  }

  function calculateFleetPoints(data, fleet) {
    const perShip = fleet.ships.map(function (s) {
      return { instanceId: s.instanceId, cardId: s.cardId, total: shipTotal(data, s) };
    });
    // 指挥官是 Fleet 级卡，点数计入旗舰（装备指挥官的舰船）
    if (fleet.commander) {
      const flag = perShip.find(function (p) { return p.instanceId === fleet.commanderShipId; });
      if (flag) flag.total += pointsOf(data, fleet.commander);
    }
    let ships = perShip.reduce(function (sum, p) { return sum + p.total; }, 0);

    let squadrons = 0;
    fleet.squadrons.forEach(function (sq) {
      squadrons += pointsOf(data, sq.cardId);
    });

    const total = ships + squadrons;
    // 中队软上限：舰队分数的 1/3（向上取整，如 400 分 → 134）。超限仅提示，不阻止添加。
    const squadronLimit = Math.ceil(fleet.pointsLimit / 3);
    return {
      ships: ships,
      squadrons: squadrons,
      total: total,
      perShip: perShip,
      pointsLimit: fleet.pointsLimit,
      squadronLimit: squadronLimit,
      isOverLimit: total > fleet.pointsLimit,
      isOverSquadronLimit: squadrons > squadronLimit,
      remaining: fleet.pointsLimit - total,
    };
  }

  return {
    shipTotal: shipTotal,
    calculateFleetPoints: calculateFleetPoints,
  };
})();
