/* 写表器 · 轻量图片大图查看（Lightbox）
 * 全局规则：除 SVG 槽位图标外，所有卡图都可点击放大（task：图片含完整卡面信息）。
 * 使用方式：渲染时给 <img> 加内联 onclick="event.stopPropagation(); Lightbox.open(this.src, this.alt)"，
 * 由本模块提供 open/close；点击遮罩 / 关闭按钮 / Esc 关闭。
 * 无任何外部依赖；在 DOM stub 测试环境下安全（不触发 ensure 不会触碰 document）。 */
window.Lightbox = (function () {
  let root = null;
  let imgEl = null;

  function ensure() {
    if (root) return;
    root = document.createElement("div");
    root.className = "lightbox";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<div class="lightbox-mask"></div>' +
      '<div class="lightbox-frame"><img alt=""><button class="lightbox-close" aria-label="关闭">×</button></div>';
    imgEl = root.querySelector(".lightbox-frame img");
    root.addEventListener("click", function (e) {
      if (e.target === root || e.target.closest(".lightbox-mask") || e.target.closest(".lightbox-close")) close();
    });
    document.body.appendChild(root);
  }

  function open(src, alt) {
    ensure();
    imgEl.src = src || "";
    imgEl.alt = alt || "";
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("lb-lock");
  }

  function close() {
    if (!root) return;
    root.classList.remove("open");
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lb-lock");
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  return { open: open, close: close };
})();
