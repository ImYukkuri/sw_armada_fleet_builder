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
    "传导": "defense-redirect",
    "暴击": "attack-critical",
    "任意": "command-any"
  });

  const labels = Object.keys(labelToIcon).sort((a, b) => b.length - a.length);
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pdfMarkerPattern = new RegExp(` {4}(?:\\r?\\n)?(?=(${escapedLabels.join("|")}))`, "g");
  const tokenPattern = /\[\[icon:([a-z0-9-]+)\]\]/g;

  function solidifyPdfMarkers(text) {
    return String(text).replace(pdfMarkerPattern, (_marker, label) => {
      return `[[icon:${labelToIcon[label]}]]`;
    });
  }

  function createIcon(iconId, extraClass) {
    const definition = icons[iconId];
    if (!definition) return null;
    const image = document.createElement("img");
    image.className = `armada-icon${extraClass ? ` ${extraClass}` : ""}`;
    image.src = definition.src;
    image.alt = "";
    image.title = definition.label;
    image.setAttribute("aria-hidden", "true");
    image.dataset.icon = iconId;
    return image;
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
    solidifyPdfMarkers
  });
})(window);
