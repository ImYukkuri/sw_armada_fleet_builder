/* Armada 图标字库（从 assets/armada_officer_pdf_assets 引入，扩展）。
 *
 * 背景：卡牌 PDF 的图标是内嵌小图 XObject，文本提取后变成“4 空格 + 中文标签”
 * 占位（如 “    中队”“    暴击”）。本模块把这类占位固化为显式 token
 * `[[icon:<id>]]`，再渲染为行内 <img>。
 *
 * 原库（demo）提供：ArmadaIcons.render(element, content) —— 直接操作 DOM。
 * 本项目为字符串式渲染，新增：ArmadaIcons.toHtml(text) —— 返回已转义 HTML 字符串，
 * 可直接拼进 innerHTML（对文本做 HTML 转义，仅将 token 替换为图标，无注入风险）。
 * 另补充中队防御标记“抑制”→ defense-contain（同种标记的舰队用名）。
 *
 * 图标文件位于项目根 `icons/web/`。渲染结果为 <span class="armada-icon armada-icon--<id>">，
 * 颜色由 css/armada-icons.css 的 background-color: currentColor + mask-image 控制，
 * 因此图标颜色跟随所在文本字体颜色（与正文一致）。
 */
(function armadaIconLibrary(global) {
  "use strict";

  const basePath = "icons/web/";
  const icons = Object.freeze({
    "command-squadron": {label: "中队指令", src: `${basePath}command-squadron.png`},
    "command-concentrate-fire": {label: "集火指令", src: `${basePath}command-concentrate-fire.png`},
    "command-repair": {label: "维修指令", src: `${basePath}command-repair.png`},
    "command-navigate": {label: "导航指令", src: `${basePath}command-navigate.png`},
    "command-any": {label: "任意指令", src: `${basePath}command-any.png`},
    "defense-evade": {label: "回避防御标记", src: `${basePath}defense-evade.png`},
    "defense-contain": {label: "防控防御标记", src: `${basePath}defense-contain.png`},
    "defense-redirect": {label: "传导防御标记", src: `${basePath}defense-redirect.png`},
    "upgrade-commander": {label: "指挥官升级", src: `${basePath}upgrade-commander.png`},
    "upgrade-officer": {label: "士官升级", src: `${basePath}upgrade-officer.png`},
    "upgrade-defensive-retrofit": {label: "防御改装升级", src: `${basePath}upgrade-defensive-retrofit.png`},
    "attack-critical": {label: "暴击标志", src: `${basePath}attack-critical.png`}
  });

  const labelToIcon = Object.freeze({
    "防御改装": "upgrade-defensive-retrofit",
    "指挥官": "upgrade-commander",
    "士官": "upgrade-officer",
    "中队": "command-squadron",
    "集火": "command-concentrate-fire",
    "维修": "command-repair",
    "导航": "command-navigate",
    "回避": "defense-evade",
    "防控": "defense-contain",
    "抑制": "defense-contain",     // 中队版“防控防御标记”（同一种标记）
    "传导": "defense-redirect",
    "暴击": "attack-critical",
    "任意": "command-any"
  });

  const labels = Object.keys(labelToIcon).sort((a, b) => b.length - a.length);
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // 占位宽度实测 3–5 空格（源文本从不出现 2 空格），故 3+ 必为图片占位
  const pdfMarkerPattern = new RegExp(` {3,}(?:\\r?\\n)?(?=(${escapedLabels.join("|")}))`, "g");
  const tokenPattern = /\[\[icon:([a-z0-9-]+)\]\]/g;

  function solidifyPdfMarkers(text) {
    let t = String(text).replace(pdfMarkerPattern, (_marker, label) => {
      return `[[icon:${labelToIcon[label]}]]`;
    });
    // 暴击 = [crit] 骰面，本库文本中永远指代该图标：无占位文字也转成 token
    //（已带 token 的用后顾断言跳过，不重复转换）
    t = t.replace(/(?<!\[\[icon:attack-critical\]\])暴击/g, "[[icon:attack-critical]]暴击");
    return t;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function createIcon(iconId, extraClass) {
    const definition = icons[iconId];
    if (!definition) return null;
    // 渲染为 <span>，用 CSS mask + currentColor 上色（颜色跟随字体，见 armada-icons.css）
    const span = document.createElement("span");
    span.className = `armada-icon armada-icon--${iconId}${extraClass ? ` ${extraClass}` : ""}`;
    span.title = definition.label;
    span.setAttribute("aria-hidden", "true");
    span.dataset.icon = iconId;
    return span;
  }

  /* 字符串式渲染：先固化 4 空格占位 → token，再统一空白为单空格，
   * 最后把 token 替换为 <span class="armada-icon armada-icon--<id>">，其余文本全部 HTML 转义。
   * 可直接拼入 innerHTML；图标颜色由 CSS（mask + currentColor）随字体颜色渲染。 */
  function toHtml(sourceText, options) {
    const settings = Object.assign({solidifyPdfMarkers: true, normalizeWhitespace: true}, options);
    let text = settings.solidifyPdfMarkers ? solidifyPdfMarkers(sourceText) : String(sourceText);
    if (settings.normalizeWhitespace) text = text.replace(/\s+/g, " ").trim();
    let out = "";
    let cursor = 0;
    let match;
    tokenPattern.lastIndex = 0;
    while ((match = tokenPattern.exec(text))) {
      if (match.index > cursor) out += escapeHtml(text.slice(cursor, match.index));
      const def = icons[match[1]];
      if (def) {
        out += '<span class="armada-icon armada-icon--' + match[1] +
          '" title="' + escapeHtml(def.label) + '" aria-hidden="true" data-icon="' + match[1] + '"></span>';
      } else {
        out += escapeHtml(match[0]);
      }
      cursor = tokenPattern.lastIndex;
    }
    if (cursor < text.length) out += escapeHtml(text.slice(cursor));
    return out;
  }

  function render(container, sourceText, options) {
    const settings = Object.assign({solidifyPdfMarkers: true}, options);
    const text = settings.solidifyPdfMarkers
      ? solidifyPdfMarkers(sourceText)
      : String(sourceText);
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match;

    tokenPattern.lastIndex = 0;
    while ((match = tokenPattern.exec(text))) {
      if (match.index > cursor) {
        fragment.append(document.createTextNode(text.slice(cursor, match.index)));
      }
      const icon = createIcon(match[1]);
      fragment.append(icon || document.createTextNode(match[0]));
      cursor = tokenPattern.lastIndex;
    }
    if (cursor < text.length) {
      fragment.append(document.createTextNode(text.slice(cursor)));
    }

    container.replaceChildren(fragment);
    return text;
  }

  global.ArmadaIcons = Object.freeze({
    icons,
    createIcon,
    render,
    toHtml,
    solidifyPdfMarkers
  });
})(window);
