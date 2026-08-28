/* Fleet Builder · 军表存取（纯逻辑，不依赖 DOM，挂 window.FleetIO）
 * 序列化 / 压缩 / 导入重建 / localStorage 自动存档。
 *
 * 保存格式 v2（SAVE_VERSION）：
 *   只存已装备槽；原生槽 {slotIndex, cardId}，加槽子槽额外带 slotId+addedBy；
 *   不存 instanceId（load 时重编号）、不存 shared（重建时按双槽卡派生）；
 *   commanderShipIndex 指明指挥官挂载舰在 ships 数组中的下标（-1 = 无）。
 * 压缩格式：MAGIC("FA2:") + base64(gzip(utf8(json)))——可复制的字符串。
 *
 * importFromText 只解析+校验+重建（buildNormalized），**不落地 state**：
 * UI 拿到 {ok, faction, fleet, warnings} 后自行判断（同阵营→FleetState.load，
 * 异阵营→切页重跑同一管线）。导入只做结构性校验（卡存在、阵营、槽位类型），
 * 不重跑规则引擎（per-ship-duplicate / unique / 改装上限等不管）。 */
window.FleetIO = (function () {
  const SAVE_VERSION = 2;
  const MAGIC = "FA2:";
  const AUTOSAVE_PREFIX = "armada.fleet.autosave.";

  let codec = null;    // {gzip(bytes)->bytes, gunzip(bytes)->bytes} 同步；测试注入 node:zlib
  let storage = null;  // setStorage 注入的适配器；默认惰性取浏览器 localStorage

  /* ---- 存储 ---- */
  function getStorage() {
    if (storage) return storage;
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; }
  }
  function setStorage(adapter) { storage = adapter; }

  function isEmptyFleet(f) {
    return !((f.ships && f.ships.length) || (f.squadrons && f.squadrons.length) || f.commander);
  }

  // 自动存档：非空表写明文 JSON，空表（清空后）清键，不留残留档。
  // try/catch 包裹：file:// 或隐私模式下 localStorage 不可用时静默跳过。
  function autosave(fleet) {
    if (!fleet || !fleet.faction) return;
    if (isEmptyFleet(fleet)) { clearStorage(fleet.faction); return; }
    try {
      const s = getStorage();
      if (s) s.setItem(AUTOSAVE_PREFIX + fleet.faction, serializePlain(fleet));
    } catch (e) { /* 静默 */ }
  }
  function readAutosave(faction) {
    try {
      const s = getStorage();
      return (s && s.getItem(AUTOSAVE_PREFIX + faction)) || null;
    } catch (e) { return null; }
  }
  function clearStorage(faction) {
    try {
      const s = getStorage();
      if (s) s.removeItem(AUTOSAVE_PREFIX + faction);
    } catch (e) { /* 静默 */ }
  }

  /* ---- 序列化（保存格式 v2） ---- */
  function serializePlain(fleet) {
    const ships = (fleet.ships || []).map(function (s) {
      const upgrades = (s.upgrades || [])
        .filter(function (u) { return u.cardId; })
        .map(function (u) {
          const out = { slotIndex: u.slotIndex, cardId: u.cardId };
          if (u.slotId) { out.slotId = u.slotId; out.addedBy = u.addedBy; }
          return out;   // 不存 shared：重建时按双槽卡重新派生
        });
      return { cardId: s.cardId, title: s.title || null, upgrades: upgrades };
    });
    let commanderShipIndex = -1;
    if (fleet.commanderShipId) {
      commanderShipIndex = fleet.ships.findIndex(function (s) { return s.instanceId === fleet.commanderShipId; });
    }
    return JSON.stringify({
      version: SAVE_VERSION,
      app: "sw-armada-fleet-builder",
      name: fleet.name || "",
      faction: fleet.faction || null,
      pointsLimit: fleet.pointsLimit || 400,
      commander: fleet.commander || null,
      commanderShipIndex: commanderShipIndex,
      ships: ships,
      squadrons: (fleet.squadrons || []).map(function (q) { return { cardId: q.cardId }; }),
      objectives: Object.assign(
        { assault: null, defense: null, navigation: null },
        (fleet.objectives && typeof fleet.objectives === "object") ? fleet.objectives : {}
      ),
    }, null, 2);
  }

  /* ---- base64 / gzip（浏览器 CompressionStream；测试注入同步 codec） ---- */
  function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function base64ToBytes(b64) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function supportsCompression() {
    return !!codec || typeof CompressionStream !== "undefined";
  }
  function setCodec(c) { codec = c; }

  async function compressToBase64(jsonText) {
    if (codec) return bytesToBase64(codec.gzip(new TextEncoder().encode(jsonText)));
    const cs = new CompressionStream("gzip");
    const stream = new Blob([new TextEncoder().encode(jsonText)]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    return bytesToBase64(new Uint8Array(buf));
  }
  async function decompressFromBase64(b64) {
    const bytes = base64ToBytes(b64);
    if (codec) return new TextDecoder().decode(codec.gunzip(bytes));
    const ds = new DecompressionStream("gzip");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).text();
  }
  async function exportCompressed(fleet) {
    return MAGIC + (await compressToBase64(serializePlain(fleet)));
  }

  /* ---- 导入管线 ---- */
  function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  // 轻量阵营检查（镜像 fleet-rules 的 cardFactionAllowed，导入层自含避免耦合）
  function cardFactionAllowed(card, faction) {
    const r = card.restrictions || {};
    if (Array.isArray(r.factions) && r.factions.length) return r.factions.indexOf(faction) !== -1;
    if (card.faction) return card.faction === faction;
    return true;
  }

  async function importFromText(text, data) {
    // 1. 格式识别 + 解压
    let jsonText = String(text == null ? "" : text).trim();
    if (!jsonText) return { ok: false, error: { code: "parse-error", message: "内容为空" } };
    if (jsonText.indexOf(MAGIC) === 0) {
      try {
        jsonText = await decompressFromBase64(jsonText.slice(MAGIC.length));
      } catch (e) {
        return { ok: false, error: { code: "parse-error", message: "压缩数据无法解析" } };
      }
    }
    // 2. JSON.parse + 信封解开
    let obj;
    try { obj = JSON.parse(jsonText); } catch (e) {
      return { ok: false, error: { code: "parse-error", message: "不是有效的 JSON 数据" } };
    }
    if (isPlainObject(obj) && obj.app && isPlainObject(obj.fleet)) obj = obj.fleet;
    if (!isPlainObject(obj)) return { ok: false, error: { code: "not-a-fleet", message: "数据不是军表结构" } };

    // 3. 版本检查
    const v = typeof obj.version === "number" ? obj.version : 1;
    if (v > SAVE_VERSION) {
      return {
        ok: false,
        error: {
          code: "newer-version", version: v,
          message: "此军表由更新版本导出（v" + v + "），当前版本仅支持到 v" + SAVE_VERSION + "，请升级后再导入",
        },
      };
    }
    if (v < SAVE_VERSION) obj = migrateToCurrent(obj, v);

    // 4. 重建（收集警告，不落地 state）
    const built = buildNormalized(obj, data);
    return { ok: true, faction: built.faction, fleet: built.normalized, warnings: built.warnings };
  }

  function migrateToCurrent(obj, fromVersion) {
    // v1 → v2：v1 形状是 v2 子集（无 slotId / commanderShipIndex），无需改动。
    // 未来版本迁移按 fromVersion 分档在此挂接。
    return obj;
  }

  /* ---- 重建（槽位恢复核心） ---- */
  function buildNormalized(obj, data) {
    const warnings = [];
    const faction = typeof obj.faction === "string" ? obj.faction : null;
    const normalized = {
      version: SAVE_VERSION,
      name: obj.name || "",
      faction: faction,
      pointsLimit: typeof obj.pointsLimit === "number" ? obj.pointsLimit : 400,
      commander: null,
      commanderShipIndex: -1,
      ships: [],
      squadrons: [],
      objectives: {},
    };

    // 任务卡（每类各一）
    ["assault", "defense", "navigation"].forEach(function (cat) {
      const id = (obj.objectives && obj.objectives[cat]) || null;
      if (!id) return;
      const c = data.objective(id);
      if (c && c.category === cat) normalized.objectives[cat] = id;
      else warnings.push({ type: "objective", name: id, reason: "未知任务卡，已跳过" });
    });

    // 舰船（整艘跳过 → 只警告；升级逐条跳过 → 该升级警告）
    (Array.isArray(obj.ships) ? obj.ships : []).forEach(function (shipRaw) {
      if (!shipRaw || typeof shipRaw.cardId !== "string") {
        warnings.push({ type: "ship", name: "(无 cardId)", reason: "无效舰船条目，已跳过" });
        return;
      }
      const shipCard = data.ship(shipRaw.cardId);
      if (!shipCard) {
        warnings.push({ type: "ship", name: shipRaw.cardId, reason: "未知舰船，整艘跳过" });
        return;
      }
      normalized.ships.push(rebuildShip(shipRaw, shipCard, faction, data, warnings));
    });

    // 指挥官（卡需存在且为 commander 槽；挂载舰越界在 load 时丢弃并在此告警）
    if (obj.commander) {
      const c = data.upgrade(obj.commander);
      if (c && c.slot === "commander") {
        const idx = typeof obj.commanderShipIndex === "number" ? obj.commanderShipIndex : -1;
        if (idx >= 0 && idx < normalized.ships.length) {
          normalized.commander = obj.commander;
          normalized.commanderShipIndex = idx;
        } else {
          warnings.push({ type: "commander", name: obj.commander, reason: "指挥官挂载的舰船缺失，已移除" });
        }
      } else {
        warnings.push({ type: "commander", name: obj.commander, reason: "不是有效的指挥官卡，已忽略" });
      }
    }

    // 中队
    (Array.isArray(obj.squadrons) ? obj.squadrons : []).forEach(function (q) {
      if (!q || typeof q.cardId !== "string") {
        warnings.push({ type: "squadron", name: "(无 cardId)", reason: "无效中队条目，已跳过" });
        return;
      }
      if (!data.squadron(q.cardId)) {
        warnings.push({ type: "squadron", name: q.cardId, reason: "未知中队，已跳过" });
        return;
      }
      normalized.squadrons.push({ cardId: q.cardId });
    });

    return { faction: faction, normalized: normalized, warnings: warnings };
  }

  // 槽位恢复：按文件 slotIndex/slotId 意图 + 槽位类型匹配重建一艘舰。
  // 镜像 fleet-state 的槽语义（原生槽无 slotId、双槽 shared、加槽子槽 addedBy），
  // 但**不跑规则引擎**，只做结构性恢复。
  function rebuildShip(shipRaw, shipCard, faction, data, warnings) {
    const nativeSlots = shipCard.slots || [];
    const upgrades = nativeSlots.map(function (sid, i) { return { slotIndex: i, cardId: null }; });
    const occ = {};   // slotIndex -> cardId

    function warn(entry, type, reason) {
      warnings.push({ type: type, name: entry && entry.cardId, reason: reason });
    }

    // 找一个空闲的同类型槽：prefer 合法且类型对且空 → 用它（原生槽入口传 entry.slotIndex，
    // 子槽入口不传 prefer，靠 type 匹配 slotId）；否则按原生槽顺序扫；再否则找 slotId 子槽。
    function findFreeSlot(sid, prefer) {
      if (prefer != null) {
        const p = Number(prefer);
        if (p >= 0 && p < nativeSlots.length && nativeSlots[p] === sid && !occ[p]) return p;
      }
      for (let i = 0; i < nativeSlots.length; i++) {
        if (nativeSlots[i] === sid && !occ[i]) return i;
      }
      for (let i = 0; i < upgrades.length; i++) {
        if (upgrades[i].slotId === sid && !upgrades[i].cardId) return upgrades[i].slotIndex;
      }
      return null;
    }
    function placeAt(idx, cardId, shared) {
      const entry = upgrades.find(function (u) { return u.slotIndex === idx; });
      if (!entry) return;
      entry.cardId = cardId;
      if (shared) entry.shared = true;
      occ[idx] = cardId;
    }
    // 追加加槽卡/称号产生的子槽（不重复）
    function appendAdded(slotIds, addedBy) {
      (slotIds || []).forEach(function (sid) {
        if (upgrades.some(function (u) { return u.slotId === sid; })) return;
        const idx = upgrades.reduce(function (m, u) { return Math.max(m, u.slotIndex); }, -1) + 1;
        upgrades.push({ slotIndex: idx, cardId: null, slotId: sid, addedBy: addedBy });
      });
    }
    // 同一卡是否已占用本船任意槽（双槽兄弟条目 / 重复条目 → 静默跳过）
    function alreadyPlaced(cardId) {
      return Object.keys(occ).some(function (k) { return occ[k] === cardId; });
    }
    // 放置一张升级卡（含双槽）
    function placeCard(entry) {
      const card = data.upgrade(entry.cardId);
      if (!card) { warn(entry, "upgrade", "未知升级卡，已跳过"); return; }
      if (!cardFactionAllowed(card, faction)) { warn(entry, "upgrade", "阵营不符，已跳过"); return; }
      const cardSlots = (card.slots && card.slots.length) ? card.slots : [card.slot];
      if (alreadyPlaced(card.id)) return;   // 双槽兄弟条目 / 重复条目：静默跳过

      if (cardSlots.length > 1) {
        // 双槽卡：每个槽位类型各占一个空闲槽
        const targets = cardSlots.map(function (sid) { return findFreeSlot(sid, entry.slotIndex); });
        if (targets.some(function (t) { return t === null; })) {
          warn(entry, "upgrade", "双槽位卡所需槽位不足/被占用，已跳过");
          return;
        }
        targets.forEach(function (idx, i) { placeAt(idx, card.id, i > 0); });
        appendAdded(card.addsSlots, targets[0]);
      } else {
        const idx = findFreeSlot(card.slot, entry.slotIndex);
        if (idx === null) { warn(entry, "upgrade", "无匹配的空闲槽位，已跳过"); return; }
        // 文件意图槽位未被满足（越界/类型不对/被占）→ 补槽位重匹配警告（加槽子槽除外：其 slotIndex 是派生的）
        if (!entry.slotId && entry.slotIndex != null && Number(entry.slotIndex) !== idx) {
          warn(entry, "slot-rematched", "槽位已按类型重新匹配");
        }
        placeAt(idx, card.id, false);
        appendAdded(card.addsSlots, idx);
      }
    }

    // 1. title 先处理（其 addsSlots 子槽先铺好）
    let title = null;
    if (shipRaw.title) {
      const tc = data.title(shipRaw.title);
      if (tc) {
        title = shipRaw.title;
        appendAdded(tc.addsSlots, "title");
      } else {
        warnings.push({ type: "title", name: shipRaw.title, reason: "未知称号，已忽略" });
      }
    }
    // 2. 升级（文件顺序；子槽条目可能在父卡之前，由 type 匹配兜底）
    (Array.isArray(shipRaw.upgrades) ? shipRaw.upgrades : []).forEach(function (entry) {
      if (!entry || !entry.cardId) return;
      placeCard(entry);
    });

    return { cardId: shipCard.id, title: title, upgrades: upgrades };
  }

  /* ---- 剪贴板 ---- */
  async function copyText(s) {
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(s);
        return true;
      }
    } catch (e) { /* 降级 */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }

  return {
    SAVE_VERSION: SAVE_VERSION,
    MAGIC: MAGIC,
    serializePlain: serializePlain,
    exportCompressed: exportCompressed,
    compressToBase64: compressToBase64,
    decompressFromBase64: decompressFromBase64,
    importFromText: importFromText,
    supportsCompression: supportsCompression,
    setCodec: setCodec,
    setStorage: setStorage,
    autosave: autosave,
    readAutosave: readAutosave,
    clearStorage: clearStorage,
    copyText: copyText,
  };
})();
