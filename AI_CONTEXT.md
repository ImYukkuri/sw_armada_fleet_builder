# AI 上下文 · 星球大战：无敌舰队（Star Wars: Armada）写表器

> 本文是给后续 AI 会话快速建立上下文用的单一入口文档。读完本文 + 对照各源码文件的
> 中文头注释，即可无障碍继续开发。详细的开发历史见 `process.md`，某阶段的增量需求
> 见 `task.md`，面向人类的完整说明见 `README.md`（三者已存在，本文只做「AI 视角」的浓缩）。

---

## 1. 项目是什么

一个**纯静态、零构建依赖**的本地舰队写表器（list builder），主题是桌游
《星球大战：无敌舰队》（Star Wars: Armada）。技术栈：原生 HTML + 原生 JS
（IIFE 模块，全局挂 `window.XXX`）+ 原生 CSS；数据管线用 Python（`build_data.py`）。

**关键约束**：所有页面都要 `fetch` 本地 JSON，因此**必须通过本地 HTTP 服务器访问**，
`file://` 直接打开会失败。标准启动方式：

```bash
cd list-builder
python -m http.server 8000
# index.html → http://localhost:8000/
# 写表器   → http://localhost:8000/builder.html?faction=imperial
```

阵营参数取值：`imperial` / `rebel` / `republic` / `separatist`。

---

## 2. 四个页面

| 文件 | 作用 | 关键脚本 |
|------|------|----------|
| `index.html` | 主页：4 阵营选择卡片 | `js/factions.js` + `js/main.js` |
| `builder.html` | **核心**：舰队写表器 | `js/builder.js` + `js/fleet/*` |
| `objectives.html` | 任务卡一览（36 张） | `js/objectives/app.js` |
| `carddb.html` | 卡牌资料库：浏览/编辑/导出 | `js/carddb/data.js` + `app.js` |

---

## 3. 目录结构（要点）

```
list-builder/
├── index.html / builder.html / objectives.html / carddb.html
├── css/
│   ├── style.css           # 主页 + 通用暗色星战主题
│   ├── builder.css         # 写表器（移动全屏选择器 / 桌面抽屉）
│   ├── objectives.css      # 任务卡页
│   ├── carddb.css          # 资料库页
│   └── armada-icons.css    # 行内图标（CSS mask + currentColor）
├── js/
│   ├── factions.js         # FACTIONS 常量：4 阵营 名称/主题色/徽记 SVG（全局）
│   ├── main.js             # 主页渲染
│   ├── builder.js          # 写表器引导：读 ?faction=、加载、接线、渲染
│   ├── fleet/              # 写表器核心（见 §5 模块清单）
│   ├── carddb/{data,app}.js
│   └── objectives/app.js
├── icons/web/              # 12 个 64×64 Armada 图标 PNG（行内图标用）
├── data/
│   ├── config.json         # 阵营 / 13 升级槽 / 规模 枚举（唯一「不拆分」配置）
│   └── objectives.json     # 36 张任务卡
├── assets/                 # 卡牌数据 + 卡图（按阵营/槽位拆分，见 §7）
├── points_map.json         # 持久化点数表 id -> {points, en?, banned?}
├── build_data.py           # 数据管线（§7）
├── restrictions.py         # 「限定」子句解析 → restrictions
├── fleet_test.mjs          # 写表器冒烟测试（DOM stub，真实跑 builder.js）
├── objectives_test.mjs / smoke_test.mjs / dom_test.mjs
├── README.md / process.md / task.md / AI_CONTEXT.md（本文）
```

---

## 4. 核心数据流与架构

写表器遵循单向数据流（`task.md §27`）：

```
Fleet State（唯一数据真相）→ Render → User Action → Update State → Render
```

- **`FleetState`** 是唯一数据真相，存的是 `cardId` 引用，**绝不复制卡牌对象**。
- `JSON.stringify(fleet)` 即得可序列化军表。
- 渲染层是**纯函数**（`FleetRender.renderOverview(data, fleet, calc) -> HTML 字符串`）。
- 事件通过 `data-action` 委托分发，更新 state 后统一 `render()`。

### 军表（Fleet）结构

```js
{
  version: 1,
  id: null, name: "",
  faction: "imperial",
  pointsLimit: 400,
  commander: null,          // 舰队级指挥官卡 cardId（全舰队仅 1 名）
  commanderShipId: null,    // 装备指挥官的舰船 instanceId（即旗舰）
  ships: [],                // 舰船实例数组
  squadrons: [],            // 中队实例数组
  objectives: { assault: null, defense: null, navigation: null },
}
```

### 舰船实例结构

```js
{
  instanceId: "ship-001",   // 区分同一卡牌的多个实例（task.md §4）
  cardId: "arquitens_command",
  title: null,              // 称号 cardId（独立于普通升级槽，UI 排最后）
  upgrades: [               // 按舰船升级槽顺序
    { slotIndex: 0, cardId: null },
    { slotIndex: 1, cardId: null, slotId: "fleet_command", addedBy: 0 },  // 加槽子槽
    { slotIndex: 2, cardId: "dual_card_id", shared: true },                // 双槽兄弟条目
  ],
}
```

- `slotId` + `addedBy` 仅出现在**加槽卡**产生的子槽上；`addedBy` = 加槽卡所在槽下标
  （普通升级槽为数字）或 `"title"`（称号加槽 sentinel）。
- `shared: true` 仅出现在**双槽卡**占用的兄弟槽上（点数只计一次，渲染只出一个条目）。

### 卡牌字段（card）

`type` 取值：`ship` / `squadron` / `upgrade` / `title` / `objective`。
通用字段：`id`、`type`、`faction`、`name`、`nameEn`、`points`、`image`、`effect`。
按类型扩展的字段：

- `ship`：`size`（small/medium/large/huge）、`slots`（升级槽 id 数组，**含 commander**）
- `squadron`：`unique`、`ace`、`limit`（unique=1；普通可能无 limit=不封顶）
- `upgrade`：`slot`（主槽）、`slots`（双槽卡数组）、`modification`、`addsSlots`、`addsSlotsReject`
- `title`：`shipId`（权威舰船匹配）、`unique`
- 通用扩展：`restrictions`（见 §8）、`faq`（独立 FAQ/勘误字段，多行换行）、`banned`

---

## 5. 写表器 JS 模块清单（均挂在 window）

| 模块 | 文件 | 职责 |
|------|------|------|
| `FACTIONS` | `js/factions.js` | 阵营常量（普通 const，非 IIFE）：`accent`/`glow`（写表页主题）、`card`（主页官方配色）、`emblem`（内联 SVG） |
| `Lightbox` | `js/fleet/lightbox.js` | 卡图点击放大（遮罩/关闭钮/Esc）；除 SVG 槽位图标外全站卡图接入 |
| `ArmadaIcons` | `js/fleet/armada-icons.js` | 行内图标：`toHtml(text)` 字符串渲染 + `render()` DOM 版 + `solidifyPdfMarkers()` |
| `FleetData` | `js/fleet/fleet-data.js` | 数据加载层：加载 config+objectives + assets 拆分文件 + 槽位 SVG 图标；查找 API |
| `FleetState` | `js/fleet/fleet-state.js` | 唯一数据真相；create/addShip/setUpgrade/setCommander/setTitle/setObjective/load/clear |
| `FleetRules` | `js/fleet/fleet-rules.js` | 规则引擎 `canEquipUpgrade` / `canEquipSquadron` / `canSetObjective` → `{allowed, reasons}` |
| `FleetCalculator` | `js/fleet/fleet-calculator.js` | 点数计算（舰船+指挥官+称号+升级；任务卡不计） |
| `FleetRender` | `js/fleet/fleet-render.js` | 总览/操作条/分数渲染（纯函数返回 HTML 字符串） |
| `FleetIO` | `js/fleet/fleet-io.js` | 序列化/压缩/导入/导出/自动存档（保存格式 v2） |
| `FleetSelectors` | `js/fleet/selectors.js` | 选择器（舰船/中队/升级/任务），移动全屏↔桌面抽屉 |

> 加载顺序（`builder.html`）：factions → lightbox → armada-icons → fleet-data →
> fleet-state → fleet-io → fleet-rules → fleet-calculator → fleet-render → selectors → builder.js。

---

## 6. 规则引擎（`FleetRules.canEquipUpgrade`）过滤顺序

`canEquipUpgrade(data, fleet, shipInstance, slotId, card, slotIndex)` → `{allowed, reasons}`。
`slotId` 取值：`"commander"` / `"title"` / 普通升级槽 id（如 `"officer"`）。
`slotIndex` 是目标普通槽下标，用于「重选同一张不误报」的排除。

按顺序校验（`reasons` 是英文 key，`reasonLabel()` 转中文）：

1. **slot** — 槽位类型（双槽卡可进自身任一槽；改装卡按自身槽进普通槽，无独立改装槽）
2. **faction** — 阵营（`restrictions.factions` 优先 → `faction` 字段 → 全阵营）
3. **dual-slot** — 双槽卡需两槽都在舰上**且都空闲**（防半占位 bug）
4. **size** — 规模
5. **ship** — 舰船 id / 名称限制
6. **flagship** — 需旗舰
7. **modification-limit** — 每舰最多 1 张改装（替换同一张允许）
8. **commander** — 舰队已有指挥官时，仅旗舰可更换
9. **unique-name** — 全局 unique（按 `nameEn` 的 `•` 前缀，跨类型同名）
10. **per-ship-duplicate** — 同一张升级卡同一艘舰最多一次（跨槽位）
11. **dual-locked** — 双槽卡占用的槽位不可替换（须先删除整组）
12. **adds-slots** — 加槽卡卡面「已有该槽则不能装备」时拒绝（`addsSlotsReject`）

`canEquipSquadron`：faction → unique 全舰队限 1（`squadron-unique`）→ 显式 `card.limit`
（`limit`）→ 跨类型同名 unique（`unique-name`）。
`canSetObjective`：仅校验 `category` 匹配。

---

## 7. 数据管线（`build_data.py`）

**职责**：从 `assets/` 各 `text.json`（PDF 提取源）生成拆分后的卡牌文件。幂等、可重复运行。

```bash
python build_data.py
```

处理步骤（按序）：

1. **图标固化** `solidify_icons()`：把「3+ 空格 + 中文标签」占位 → `[[icon:<id>]]` token；
   纯文本「暴击」无条件转 token（它永远指 [crit] 骰面图标）。
2. **字形修正** `fix_glyphs()`：修 PDF 字体子集错位字（劢→动、丌→不、迚→进 等，按来源分表）。
3. **FAQ/勘误拆分** `extract_faq_notes()`：把 `[FAQ：]/[勘误：]/[1.5勘误：]` 段剥离为独立
   `faq` 字段（深度括号扫描，`[[`/`]]` 计 ±2）。
4. **限制解析** `apply_restrictions()`：调 `restrictions.py` 解析「限定」子句 → `restrictions`。
5. **合并点数**：从 `points_map.json` 读 `id -> {points, en?, banned?}` 写进卡字段。
6. **称号 unique 判定**：`nameEn` 带 `•` 前缀 → `unique: true`。
7. **按阵营拆分写出**：
   - `ships/squadrons/titles` → `assets/<type>/<faction>/cards.json`
   - `upgrades` → `assets/upgrades/<neutral|imperial|rebel|separatist|republic>.json`（双阵营卡写两份）
   - `data/` 只保留 `config.json` + `objectives.json`

**数据源优先级**（`authoritative_cards`，防止丢手工卡/编辑）：
`data/<cat>.json`（旧工作流）> 已拆分的 assets 文件（新工作流，carddb 导出覆盖处）>
从 `text.json` 再生（全新检出）。

**硬编码在 build_data.py 里的数据集合**（改动时注意）：
- `MODIFICATION_CARDS`（18 张改装卡 id）
- `DUAL_SLOT_CARDS`（6 张双槽卡 id → `[weapons_team, offensive_retrofit]`）
- `ADDS_SLOTS_CARDS`（7 张加槽卡 id → addsSlots / addsSlotsReject）
- `COMMANDER_FACTION`（24 张指挥官的权威阵营归属）
- `ICON_LABEL_MAP`（与 `armada-icons.js` 的 `labelToIcon` 保持一致）

**当前卡池规模**（以 `assets/` 实际文件为准）：舰船 60（帝国 24 / 义军 23 / 共和国 13，
分离势力 0）、中队 82（帝国 41 / 义军 41，其余 0）、称号 81（帝国 31 / 义军 31 /
分离 10 / 共和国 9）、升级 225 张去重（neutral 101 / 帝国 42 / 义军 31 / 分离 29 /
共和国 25；盘上共 228 条，因 3 张双阵营卡在分离+共和国写两份，加载时按 id 去重）。

---

## 8. `restrictions.py` — 「限定」子句解析

产出 `restrictions` 结构：

```js
{
  factions: [],            // 允许阵营 id 列表（空=不限）
  sizes: [],               // small/medium/large/huge
  shipIds: [],             // 具体舰船卡 id
  shipNames: [],           // 舰船描述原文（未解析到 id 时的展示/按名匹配）
  shipTraits: [],          // 恒 []（数据库暂无此数据）
  requiresFlagship: false,
  requiredTitles: [],      // 恒 []
}
```

要点：
- 扫描 effect 全文所有「……限定」子句（不限于首行）。
- `TITLE_ALIAS`：称号中文描述 ≠ 舰船卡名时的别名映射（键为 `阵营:描述`）。
- **称号的舰船限制以 `assets/titles/*/text.json` 的 `shipId` 字段为权威**（用户维护），
  覆盖文本解析结果（`apply_restrictions` 里处理）。

---

## 9. 保存 / 导入 / 导出（`FleetIO`，保存格式 v2）

- `SAVE_VERSION = 2`；压缩格式 `"FA2:" + base64(gzip(json))`。
- `serializePlain(fleet)`：只存已装备槽；**不存** `instanceId`（导入重编号）、`shared`
  （按双槽卡重新派生）；指挥官用 `commanderShipIndex`（ships 下标，-1=无）。
- `importFromText(text, data)` → `{ok, faction, fleet, warnings}`：只做**结构性校验**
  （卡存在/阵营/槽位类型），**不重跑规则引擎**。
- `autosave`：每次渲染后写 `localStorage` 键 `armada.fleet.autosave.<faction>`（明文 JSON）；
  空表清键；返回阵营选择页或点「清空」时清除。
- 跨阵营导入：`sessionStorage` 中转原始文本 → 跳 `builder.html?faction=<目标>` → 加载完后重跑管线。

---

## 10. 关键概念与「坑」（改动前必读）

1. **指挥官是舰队级数据**（`fleet.commander` + `fleet.commanderShipId`），**绝不塞进某艘船**。
   选指挥官的船即旗舰；未选时每艘舰都显示指挥官槽图标，选了只旗舰显示（UI 隐藏而非删除槽位）。
2. **称号是独立装备位**，UI 上永远排在其它升级槽图标之后；每舰最多 1 个。
3. **改装不是独立槽位**：`modification: true/false` 是**数据字段**（build_data.py 标定），
   改装卡按自身槽装进普通槽，仅限制「每舰最多 1 张」。**不要**用 `effect.includes("改装")` 运行时判断。
4. **全局 unique 按 `nameEn` 的 `•` 前缀**判定，跨 指挥官/称号/升级/中队/舰船 同名不可重复。
   有通用函数 `uniqueNameConflict` / `uniqueNamesInFleet`，**不要**再造 Title-only 版。
5. **双槽卡**（6 张武器小组/进攻改装）：两槽都空闲才能装、同时占两槽（`shared`）、点数只计一次、
   占用时不可替换（`dual-locked`），须先删除整组。
6. **加槽卡**（7 张）：装备后追加子槽（`addedBy`），删除时子槽连同子槽内组件**一并清理**；
   仅 `addsSlotsReject` 的卡（喷火兽号/解放者号/图阿部长）拒绝已有该槽的舰船。
7. **图标渲染**：`[[icon:<id>]]` token → `<span class="armada-icon armada-icon--<id>">`，
   颜色靠 CSS `mask + currentColor` 跟随字体（不要用 `<img>` 黑底 PNG）。
8. **任务卡不计分**；每个军表 3 个任务槽（进攻/防御/导航）。
9. **中队 1/3 软上限**（`squadronLimit = ceil(pointsLimit/3)`，400→134）：超限只标红提示，不阻止。
10. **不要重新赋值模块级 `fleet`**：`builder.js` 的 `const fleet` 与 selectors 的 `ctx.fleet`
    都持有同一引用；清空/载入须**原地变更**（`resetShell`）。
11. **数据缺失容错**：`FleetData.loadCategory` 用 `fetchJSONOrEmpty` 跳过缺失的阵营文件
    （404→空列表），所以分离势力舰船/中队、共和国中队「录入后自动出现」。

---

## 11. 测试

```bash
node fleet_test.mjs        # 写表器全流程冒烟（DOM stub，真实跑 builder.js），90+ 项
node objectives_test.mjs    # 任务卡页
node smoke_test.mjs         # 卡图/数据完整性（需起本地服务器 8123/8124）
node dom_test.mjs           # carddb 页（需本地服务器）
node --check <file>.js      # 语法检查（各 JS 单独跑）
```

测试用 DOM stub + 可注入的依赖（如 `FleetIO.setCodec` 注入 node:zlib、`setStorage` 注入 Map 桩）。

---

## 12. 已知待办 / 缺口（README 与 process.md 汇总）

- **1.5 禁卡**：战略顾问 / 贝尔·奥加纳 带 `banned: true`，写表器**尚未接入禁用逻辑**（`task.md §37` 预留）。
- **数据缺口**：分离势力舰船与中队、共和国中队均无数据（加载器已容错，录入后自动出现）。
- **升级卡阵营**：101 张 neutral 待人工核对（部分实为共和国/分离势力卡）。
- 预留规则未接入：中队王牌上限、轻型运输舰上限、旗舰完整校验、任务卡专属限制、`banned` 接入。

---

## 13. 快速上手（给新 AI 会话的阅读顺序）

1. 本文（`AI_CONTEXT.md`）—— 5 分钟建立全局认知。
2. `README.md` —— 人类视角的完整功能清单（含各功能的精确行为）。
3. `js/fleet/fleet-state.js` + `fleet-rules.js` —— 状态模型 + 规则引擎（核心）。
4. `js/fleet/fleet-render.js` + `selectors.js` —— 渲染与交互。
5. `build_data.py` + `restrictions.py` —— 数据管线（改数据字段时看）。
6. 需要了解某功能历史决策时，查 `process.md` 对应阶段条目。
