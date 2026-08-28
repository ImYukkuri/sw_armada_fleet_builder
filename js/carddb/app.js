/* Card Database · 主应用
 * 纯 JS state + 重新 render；数据与 UI 解耦；移动优先。
 * 视图：home（分类）→ list（分组列表）→ edit（编辑表单）
 * 保存机制：读取 JSON → 内存编辑 → 导出 JSON（本阶段不写回文件） */
(function () {
  const app = document.getElementById("app");
  const DB = window.CardDB;

  const CATEGORIES = [
    { id: "ships", label: "舰船" },
    { id: "squadrons", label: "中队" },
    { id: "upgrades", label: "升级卡" },
    { id: "titles", label: "称号" },
  ];

  const state = {
    view: "home",        // home | list | edit
    category: null,      // ships | squadrons | upgrades | titles
    editingId: null,     // 正在编辑的卡牌 id
    dirty: false,
    showFaq: false,      // #pref-faq 复选框：编辑页是否渲染只读 FAQ 预览
  };

  /* ---------------- 工具 ---------------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function categoryLabel(type) {
    const map = { ship: "舰船", squadron: "中队", upgrade: "升级卡", title: "称号" };
    return map[type] || type || "";
  }

  function currentCard() {
    return DB.findCard(state.category, state.editingId);
  }

  /* ---------------- 视图 ---------------- */
  function header(title, sub, back) {
    return (
      '<header class="topbar">' +
      (back ? '<button class="btn" data-action="back">← 返回</button>' : "") +
      '<div class="topbar-title"><h1>' + escapeHtml(title) + "</h1>" +
      (sub ? '<p class="sub">' + escapeHtml(sub) + "</p>" : "") + "</div>" +
      '<button class="btn" data-action="export">导出 JSON</button>' +
      "</header>"
    );
  }

  function viewHome() {
    const cats = CATEGORIES.map(function (c) {
      const n = DB.categoryCards(c.id).length;
      return (
        '<button class="cat-card" data-action="open-cat" data-category="' + c.id + '">' +
        '<span class="cat-name">' + c.label + "</span>" +
        '<span class="cat-count">' + n + " 张</span>" +
        '<span class="cat-go">›</span>' +
        "</button>"
      );
    }).join("");
    return (
      header("卡牌资料库", "Star Wars: Armada · Card Database") +
      '<main class="home">' + cats +
      (state.dirty ? '<p class="dirty-note">有未导出的修改</p>' : "") +
      "</main>" +
      '<footer class="foot"><a href="index.html">← 写表器主页</a></footer>'
    );
  }

  /* 分组：升级卡按槽位，其余按阵营；顺序遵循 config 定义 */
  function groupsOf(category) {
    const cards = DB.categoryCards(category);
    if (category === "upgrades") {
      return DB.config.upgradeSlots
        .map(function (s) {
          return { header: s.name, sub: s.nameEn || "", cards: cards.filter(function (c) { return c.slot === s.id; }) };
        })
        .filter(function (g) { return g.cards.length > 0; });
    }
    return DB.config.factions
      .map(function (f) {
        return { header: f.name, sub: f.nameEn || "", cards: cards.filter(function (c) { return c.faction === f.id; }) };
      })
      .filter(function (g) { return g.cards.length > 0; });
  }

  function cardMeta(c) {
    const parts = [];
    if (c.type === "upgrade") {
      // 升级卡阵营 = 允许集合（镜像 cardFactionAllowed）：双阵营卡 faction 为空，派生态标签
      const fs = DB.upgradeFactions(c);
      const names = fs.map(function (f) { const x = DB.faction(f); return x ? x.name : f; });
      parts.push(fs.length >= DB.ALL_FACTIONS.length ? "通用" : names.join(" / "));
    } else if (c.faction) {
      const f = DB.faction(c.faction);
      parts.push(f ? f.name : c.faction);
    }
    if (c.type === "ship" && c.size) {
      const s = DB.size(c.size);
      parts.push(s ? s.nameEn + " " + s.name : c.size);
    }
    if (c.type === "upgrade" && c.slot) {
      const s = DB.slot(c.slot);
      parts.push(s ? s.name : c.slot);
    }
    parts.push(c.points == null ? "未录入分数" : c.points + " 分");
    return parts.join(" · ");
  }

  function cardItem(c) {
    return (
      '<button class="card-item" data-action="open-card" data-id="' + escapeHtml(c.id) + '">' +
      '<img class="thumb" src="' + escapeHtml(c.image) + '" alt="' + escapeHtml(c.name) + '" loading="lazy">' +
      '<span class="ci-main">' +
      '<span class="ci-name">' + escapeHtml(c.name || "未命名") + "</span>" +
      '<span class="ci-en">' + escapeHtml(c.nameEn || "") + "</span>" +
      '<span class="ci-meta">' + escapeHtml(cardMeta(c)) + "</span>" +
      "</span><span class='ci-go'>›</span>" +
      "</button>"
    );
  }

  function viewList() {
    const cat = CATEGORIES.find(function (c) { return c.id === state.category; });
    const label = cat ? cat.label : state.category;
    const groups = groupsOf(state.category);
    const total = DB.categoryCards(state.category).length;
    const body = groups.map(function (g) {
      return (
        '<section class="group">' +
        '<h2 class="group-h">' + escapeHtml(g.header) +
        (g.sub ? '<span class="group-en">' + escapeHtml(g.sub) + "</span>" : "") + "</h2>" +
        g.cards.map(cardItem).join("") +
        "</section>"
      );
    }).join("");
    return header(label, total + " 张", true) +
      (body ? '<main class="list">' + body + "</main>"
            : '<main class="empty"><p>该分类暂无卡牌</p></main>');
  }

  /* ---- 编辑表单 ---- */
  function editTypeField(c) {
    if (c.type === "upgrade") {
      const opts = DB.config.upgradeSlots.map(function (s) {
        return '<option value="' + s.id + '"' + (c.slot === s.id ? " selected" : "") + ">" + s.name + "</option>";
      }).join("");
      return '<label>升级类型<select data-field="slot">' + opts + "</select></label>";
    }
    return '<label>类型<input type="text" value="' + escapeHtml(categoryLabel(c.type)) + '" disabled></label>';
  }

  function factionField(c) {
    const opts = '<option value="">未指定 / 双阵营</option>' +
      DB.config.factions.map(function (f) {
        return '<option value="' + f.id + '"' + (c.faction === f.id ? " selected" : "") + ">" + f.name + "</option>";
      }).join("");
    return "<label>阵营<select data-field=\"faction\">" + opts + "</select></label>";
  }

  function shipExtras(c) {
    if (c.type !== "ship") return "";
    const sizeOpts = DB.config.sizes.map(function (s) {
      return '<option value="' + s.id + '"' + (c.size === s.id ? " selected" : "") + ">" + s.nameEn + " · " + s.name + "</option>";
    }).join("");
    const slotRows = c.slots.map(function (sl, i) {
      const s = DB.slot(sl);
      return (
        '<div class="slot-row">' +
        '<span class="slot-name">' + (s ? s.name : escapeHtml(sl)) + "</span>" +
        '<button type="button" class="btn-del" data-action="remove-slot" data-index="' + i + '" aria-label="删除">×</button>' +
        "</div>"
      );
    }).join("");
    return (
      '<label>舰船规模<select data-field="size">' + sizeOpts + "</select></label>" +
      '<fieldset class="slots-box"><legend>升级槽</legend>' +
      (slotRows || '<p class="slot-empty">无升级槽</p>') +
      '<button type="button" class="btn btn-add" data-action="add-slot">＋ 添加升级槽</button>' +
      "</fieldset>"
    );
  }

  // 只读 FAQ 预览（受 #pref-faq 复选框门控）：多行拆分后逐行 toHtml（toHtml 默认压平换行）
  function faqPreview(c) {
    if (!state.showFaq || !c.faq) return "";
    const lines = String(c.faq).split("\n");
    const body = lines.map(function (line) {
      const html = window.ArmadaIcons ? ArmadaIcons.toHtml(line) : escapeHtml(line);
      return '<div class="preview-faq-line">' + html + "</div>";
    }).join("");
    return '<div class="edit-faq"><h4>FAQ 预览（只读）</h4>' + body + "</div>";
  }

  function viewEdit() {
    const c = currentCard();
    if (!c) {
      state.view = "list";
      return viewList();
    }
    return (
      header("编辑卡牌", c.id, true) +
      '<main class="edit">' +
      '<img class="edit-img" src="' + escapeHtml(c.image) + '" alt="' + escapeHtml(c.name) + '">' +
      '<div class="form">' +
      '<label>中文名称<input data-field="name" type="text" value="' + escapeHtml(c.name || "") + '"></label>' +
      '<label>English Name<input data-field="nameEn" type="text" value="' + escapeHtml(c.nameEn || "") + '" placeholder="（未录入）"></label>' +
      editTypeField(c) +
      factionField(c) +
      '<label>分数<input data-field="points" type="number" min="0" step="1" value="' + (c.points == null ? "" : c.points) + '" placeholder="未录入"></label>' +
      '<label>中文效果<textarea data-field="effect" rows="8" placeholder="（暂无）">' + escapeHtml(c.effect || "") + "</textarea></label>" +
      '<label>FAQ / 勘误<textarea data-field="faq" rows="4" placeholder="（可选）effect 里的 [FAQ：/勘误：/1.5勘误： 注释已拆到此处，多段换行分隔）">' + escapeHtml(c.faq || "") + "</textarea></label>" +
      faqPreview(c) +
      shipExtras(c) +
      "</div></main>"
    );
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    let html;
    if (state.view === "home") html = viewHome();
    else if (state.view === "list") html = viewList();
    else html = viewEdit();
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  /* ---------------- 升级槽选择器 ---------------- */
  function openSlotPicker(c) {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML =
      '<div class="sheet">' +
      "<h3>添加升级槽</h3>" +
      '<div class="sheet-grid">' +
      DB.config.upgradeSlots.map(function (s) {
        return '<button class="sheet-btn" data-slot="' + s.id + '">' + s.name + "</button>";
      }).join("") +
      "</div>" +
      '<button class="btn" data-slot-cancel>取消</button>' +
      "</div>";
    overlay.addEventListener("click", function (e) {
      const sb = e.target.closest("[data-slot]");
      if (sb) {
        c.slots.push(sb.dataset.slot);
        state.dirty = true;
        overlay.remove();
        render();
      } else if (e.target.closest("[data-slot-cancel]") || e.target === overlay) {
        overlay.remove();
      }
    });
    document.body.appendChild(overlay);
  }

  /* ---------------- 导出 ---------------- */
  function download(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportAll() {
    const files = [];
    // config 仍是单文件
    files.push(["config.json", DB.config]);
    // ships/squadrons/titles 按 faction 拆分（对应 assets/<type>/<faction>/cards.json，空阵营跳过）
    ["ships", "squadrons", "titles"].forEach(function (cat) {
      DB.ALL_FACTIONS.forEach(function (f) {
        const sub = DB.cards[cat].filter(function (c) { return c.faction === f; });
        if (sub.length) files.push([cat + "_" + f + ".json", sub]);
      });
    });
    // upgrades 按允许阵营集合分桶（双阵营卡写两份，镜像 build_data.split_upgrades）
    ["neutral", "imperial", "rebel", "separatist", "republic"].forEach(function (b) {
      files.push([
        "upgrades_" + b + ".json",
        DB.cards.upgrades.filter(function (c) { return DB.upgradeFiles(c).indexOf("assets/upgrades/" + b + ".json") !== -1; }),
      ]);
    });
    files.forEach(function (pair, i) {
      setTimeout(function () { download(pair[0], JSON.stringify(pair[1], null, 2)); }, i * 350);
    });
    state.dirty = false;
    toast("已导出 " + files.length + " 个 JSON 文件：覆盖到对应 assets/ 目录（ships/squadrons/titles 重命名为 cards.json）后重新执行 build_data.py");
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    app.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "open-cat") {
        state.category = btn.dataset.category;
        state.view = "list";
      } else if (action === "open-card") {
        // 列表页内打开，state.category 已是当前分类
        state.editingId = btn.dataset.id;
        state.view = "edit";
      } else if (action === "back") {
        state.view = state.view === "edit" ? "list" : "home";
        if (state.view === "home") state.category = null;
      } else if (action === "export") {
        exportAll();
      } else if (action === "add-slot") {
        openSlotPicker(currentCard());
      } else if (action === "remove-slot") {
        const c = currentCard();
        c.slots.splice(Number(btn.dataset.index), 1);
        state.dirty = true;
      }
      render();
    });

    // 文本/数字输入：只更新 state，不重渲染（保持焦点）
    app.addEventListener("input", function (e) {
      const field = e.target.closest("[data-field]");
      if (!field) return;
      applyField(field);
    });
    // 下拉选择：同样更新 state
    app.addEventListener("change", function (e) {
      const field = e.target.closest("[data-field]");
      if (!field) return;
      applyField(field);
    });
  }

  function applyField(field) {
    const c = currentCard();
    if (!c) return;
    const f = field.dataset.field;
    if (f === "points") {
      const v = field.value.trim();
      c.points = v === "" ? null : Number(v);
    } else {
      c[f] = field.value;
    }
    state.dirty = true;
  }

  /* ---------------- 启动 ---------------- */
  (async function init() {
    try {
      await DB.load();
      // 编辑页 FAQ 预览开关（#pref-faq 在 #app 之外，单独绑定）
      const prefFaq = document.getElementById("pref-faq");
      if (prefFaq) {
        prefFaq.addEventListener("change", function () {
          state.showFaq = prefFaq.checked;
          render();
        });
      }
      bind();
      render();
    } catch (err) {
      app.innerHTML =
        '<div class="err-box"><h1>无法读取数据</h1>' +
        "<p>需要本地服务器才能加载 data/*.json。</p>" +
        "<p>请在 <b>list-builder</b> 目录运行：</p>" +
        "<pre>python -m http.server 8000</pre>" +
        "<p>然后访问 <b>http://localhost:8000/carddb.html</b></p>" +
        '<p class="err-detail">' + escapeHtml(String(err && err.message || err)) + "</p></div>";
    }
  })();
})();
