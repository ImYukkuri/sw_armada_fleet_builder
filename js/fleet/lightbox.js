/* 写表器 · 图片大图查看（Lightbox）
 * 两种形态：
 *   1) 普通大图（舰船 / 中队 / 任务卡等）：居中显示整卡图
 *   2) 卡片详档（升级卡 / 称号 / 指挥官）：左侧卡图（占大部分）+ 右侧详情
 *      （卡名 / 英文名 / 槽位 / 分数 / 效果 / FAQ，小字号，中文）
 * 全局规则：除 SVG 槽位图标外，所有卡图点击放大（task：图片含完整卡面信息）。
 * 使用方式：
 *   - 普通图：渲染时给 <img> 加 onclick="event.stopPropagation(); Lightbox.open(this.src, this.alt)"
 *   - 卡片详档：用 Lightbox.cardOnclick(card, meta) 生成 onclick（把卡牌详情登记到
 *     cardId 注册表，onclick 里只放短 cardId，避免把完整效果/FAQ 文本塞进 DOM）
 * 点击遮罩 / 关闭按钮 / Esc 关闭。无任何外部依赖；DOM stub 测试环境下安全
 * （不触发 open 不会触碰 document）。 */
window.Lightbox = (function () {
  let root = null;
  let frameEl = null;
  let registry = {};   // cardId -> 卡牌详情（渲染时由 cardOnclick 登记）

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // 效果文本：有 ArmadaIcons 时走 toHtml（行内图标 + 转义），否则纯转义
  function effectToHtml(text) {
    if (window.ArmadaIcons && ArmadaIcons.toHtml) return ArmadaIcons.toHtml(text);
    return escapeHtml(text);
  }

  function ensure() {
    if (root) return;
    root = document.createElement("div");
    root.className = "lightbox";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<div class="lightbox-mask"></div>' +
      '<div class="lightbox-frame"></div>' +
      '<button class="lightbox-close" aria-label="关闭">×</button>';
    frameEl = root.querySelector(".lightbox-frame");
    root.addEventListener("click", function (e) {
      if (e.target === root || e.target.closest(".lightbox-mask") || e.target.closest(".lightbox-close")) close();
    });
    document.body.appendChild(root);
  }

  function showRoot() {
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("lb-lock");
  }

  /* ---- 普通大图模式 ---- */
  function renderImage(src, alt) {
    frameEl.className = "lightbox-frame";
    frameEl.innerHTML =
      '<img class="lb-img" src="' + escapeHtml(src || "") + '" alt="' + escapeHtml(alt || "") + '">';
  }

  /* ---- 卡片详档模式：左侧卡图（占大部分）+ 右侧详情（小字号） ---- */
  function renderCard(src, alt, detail) {
    frameEl.className = "lightbox-frame lightbox-frame--card";
    const name = escapeHtml(detail.name || alt || "");
    const nameEn = detail.nameEn ? '<div class="lb-card-en">' + escapeHtml(detail.nameEn) + "</div>" : "";
    const meta = detail.meta ? '<div class="lb-card-meta">' + escapeHtml(detail.meta) + "</div>" : "";
    const pts = detail.points != null ? '<div class="lb-card-pts">' + escapeHtml(String(detail.points)) + " 分</div>" : "";
    const effect = detail.effect ? '<div class="lb-card-effect">' + effectToHtml(detail.effect) + "</div>" : "";
    let faq = "";
    if (detail.faq) {
      const lines = String(detail.faq).split("\n").map(function (line) {
        return '<span class="lb-card-faq-line">' + effectToHtml(line) + "</span>";
      }).join("");
      faq = '<div class="lb-card-faq"><b>FAQ / 勘误：</b>' + lines + "</div>";
    }
    frameEl.innerHTML =
      '<div class="lb-card">' +
      '<img class="lb-card-art" src="' + escapeHtml(src || "") + '" alt="' + name + '">' +
      '<div class="lb-card-info">' +
      '<div class="lb-card-name">' + name + "</div>" +
      nameEn + meta + pts + effect + faq +
      "</div>" +
      "</div>";
  }

  // 普通大图（兼容旧调用：open(src, alt) 两个参数）
  function open(src, alt, detailJson) {
    ensure();
    let detail = null;
    if (detailJson) {
      try { detail = typeof detailJson === "string" ? JSON.parse(detailJson) : detailJson; } catch (e) { detail = null; }
    }
    if (detail && (detail.name || detail.effect)) {
      renderCard(src, alt, detail);
    } else {
      renderImage(src, alt);
    }
    showRoot();
  }

  // 卡片详档：按 cardId 从注册表取详情（onclick 只携带短 id）
  function openCard(src, alt, cardId) {
    ensure();
    const detail = registry[cardId];
    if (detail && (detail.name || detail.effect)) {
      renderCard(src, alt, detail);
    } else {
      renderImage(src, alt);
    }
    showRoot();
  }

  function close() {
    if (!root) return;
    root.classList.remove("open");
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lb-lock");
  }

  // 生成带卡牌详情的 onclick（供 fleet-render / selectors 在渲染 <img> 时使用）。
  // card: {id, name, nameEn, effect, faq, points, type, slot}；meta: 可选短标签（如槽位名）。
  // 详情登记到 cardId 注册表，返回的 onclick 里只放 cardId（短字符串），不污染 DOM 文本。
  function cardOnclick(card, meta) {
    const id = (card && card.id) || "";
    if (id) {
      registry[id] = {
        name: (card && card.name) || "",
        nameEn: (card && card.nameEn) || "",
        effect: (card && card.effect) || "",
        faq: (card && card.faq) || "",
        points: card && card.points != null ? card.points : null,
        type: (card && card.type) || "",
        slot: (card && card.slot) || "",
        meta: meta || "",
      };
    }
    return 'onclick="event.stopPropagation(); Lightbox.openCard(this.src, this.alt, ' +
      escapeHtml(JSON.stringify(id)) + ')"';
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  return { open: open, openCard: openCard, close: close, cardOnclick: cardOnclick };
})();
