/* 主页面：渲染 4 个阵营卡片 */
(function () {
  const grid = document.getElementById("faction-grid");
  if (!grid) return;

  const html = Object.values(FACTIONS).map(function (f) {
    return (
      '<a class="faction-card" href="builder.html?faction=' + f.id + '"' +
      ' style="--card-accent:' + f.card.accent + ';--card-glow:' + f.card.glow + ';--card-ink:' + (f.card.ink || f.card.accent) + '">' +
      '  <div class="emblem">' + f.emblem + '</div>' +
      '  <h2 class="faction-name">' + f.name + '</h2>' +
      '  <p class="faction-en">' + f.nameEn + '</p>' +
      '  <p class="faction-tagline">' + f.tagline + '</p>' +
      '  <span class="enter-hint">进入写表 →</span>' +
      '</a>'
    );
  }).join("");

  grid.innerHTML = html;
})();
