# 开发进度 · Card Database 模块

> 每次开发完成一个阶段后在此追加进度。对应需求见同目录 `task.md`。

---

## 2026-08-23 · 阶段一完成：卡牌资料库 v1 全部功能落地

### 完成内容

**数据管线**
- `build_data.py`：把 `assets/` 下全部 `text.json` 汇总为 `data/*.json`（幂等，可重复运行）。
  - `config.json`：4 阵营（帝国/义军/分离势力/共和国）+ 13 升级槽 + 舰船规模枚举
  - `ships.json`：46 张（帝国 24 / 义军 22）
  - `squadrons.json`：39 个（帝国）
  - `upgrades.json`：183 张（指挥官 24 / 防御改装 8 / 军官 56 / 舰队支援 7 / 支援小组 8 / 舰队指挥 8 / 武器小组 17 / 离子炮 9 / 进攻改装 16 / 军械 8 / 涡轮激光 15 / 实验改装 4 / 超级武器 3）
  - `titles.json`：60 个（帝国 30 / 义军 30）
- 兼容层：为无稳定 id 的卡生成 id（`{slot}_{ID:03d}` / `{faction}_squadron_{ID:03d}` / `{faction}_title_{ID:03d}`），清洗中文名（去掉「·」、折叠换行）。
- 分数一律 `points: null`，不自动填 0。

**前端**
- `carddb.html` + `css/carddb.css`：移动优先、桌面 max-width 768px 居中。
- `js/carddb/data.js`：`fetch` 加载 `data/*.json`，提供 `faction/slot/size/categoryCards/findCard` 查询 API。
- `js/carddb/app.js`：纯 JS state + 重新 render。
  - 首页 4 分类（舰船/中队/升级卡/称号，称号与升级卡平级）
  - 列表分组：升级卡按 13 槽位、其余按阵营；分组顺序由 config 驱动
  - 编辑表单按类型动态生成字段；舰船额外有规模下拉 + 升级槽增删（允许重复，不用 Set 去重）
  - 升级槽选择器为底部弹层，保存只存 slug
  - 顶栏「导出 JSON」一次性下载 5 个 data 文件；编辑不写回服务器文件，导出即保存
  - 中文显示名全部来自 config，HTML 不硬编码阵营/槽位文案
- `index.html` 页脚加入「卡牌资料库 →」入口。

### 验证

- `node --check` 全部 JS 语法通过。
- 冒烟测试（`smoke_test.mjs`，本地服务器）通过：分组数量、id 唯一、槽位合法、328 张卡图全部可访问。
- DOM 冒烟测试（`dom_test.mjs`，DOM stub 真实跑 app.js）通过：
  首页渲染 → 舰船分组 → 打开卡牌 → 改名/改槽 → 增删升级槽（弹层点选）→ 返回列表改名持久化 → 导出 5 个文件。
- 测试中发现并修复 **导航不渲染 bug**：点击分类/卡牌/返回只改 state 未调用 `render()`，导致页面无反应；已在点击事件末尾统一 `render()`。

### 已知待办 / 坑

- 升级卡阵营仅 49/183 可自动识别（帝国 29 / 义军 20），其余 134 张为「双阵营通用」，但其中有部分是**内容中后部才写明阵营限定**的，自动判定会漏。需要的话用编辑页逐张人工核对阵营。
- 大部分卡牌 `points` 为 `null`，分数规则属后续 Army Builder 阶段录入。
- `data/*.json` 需本地服务器访问（`python -m http.server 8000`），`file://` 直接打开无法 fetch。
- 导出文件需手动覆盖到 `data/` 目录才算真正保存到项目。

### 产出文件清单

```
list-builder/
├── carddb.html
├── build_data.py
├── data/{config,ships,squadrons,upgrades,titles}.json
├── css/carddb.css
├── js/carddb/{data,app}.js
└── README.md 更新（新增卡牌资料库章节）
```

---

## 2026-08-23 · 阶段二完成：328 张卡牌全部录入最新点数

### 任务

为现有 `data/*.json` 全部 328 张卡赋值官方最新点数（AMG Armada 1.5 最终点数，2025-01-21），
且保证重新运行 `build_data.py` 后点数不丢。

### 点数来源（已保留在 `_research/` 供参考）

- **BSData/star-wars-armada**（BattleScribe 数据仓库，更新至 2026-02-03，反映 AMG 1.5 最终官方点数）——
  权威点数来源，已 git clone 到 `../_research/star-wars-armada/`。
- 交叉验证：XX-9=2、阿奎腾斯 55/52、MC75 99/95 等与官方 1.5 改动一致。
- **1.5 官方禁卡 3 张**（战略顾问 / 贝尔·奥加纳 / 普赖斯总督）不在 BSData 卡池；
  战略顾问与贝尔·奥加纳取最后一次合法点数 4（联网核实），普赖斯取 BSData 值 6，均在 `points_map.json` 中标记 `banned`。

### 完成内容

- `_research/extract_bsdata.py`：解析 4 个阵营 `.cat`，产出机器可查的 `_research/bsdata_lookup.json`
  （按「槽位 → 英文卡名 → 点数/阵营」组织）。
- `_research/points_map_data.py`：手工建立 282 张中文名卡（39 中队 + 183 升级 + 60 称号）→ BSData 英文卡名映射。
  同名多卡按槽位/阵营/效果消歧，见文件头注释（达斯维达 5 变体、奥泽尔 2 变体等）。
- `_research/gen_points_map.py`：按 id 查点数，生成持久化 `list-builder/points_map.json`（328 条，全部命中）。
- `build_data.py`：写出前合并 `points_map.json`，把 `points` 写进每张卡的字段（整数），
  `banned` 卡附带 `banned: true`；未命中的卡保持 `null`（不自动填 0）。
- 重新生成 `data/*.json`：328/328 卡全部有整数点数。

### 验证

- 全量抽查 50+ 关键卡值全部正确，包括：达斯维达 4 变体（指挥官 34 / 军官 4 / 武器组 3 / 中队 21）、
  奥泽尔（指挥官 20 / 军官 2）、阿索卡·塔诺（义军军官 2，阵营分歧按义军取）、
  星无畏舰（BSData 拼写 Dreadought，别名匹配 250/220）、曼达洛铁手套（帝国 18）、
  双类型卡（登舰工兵 2 / 登舰步兵 3 / 查姆辛杜拉 5）、禁卡（4/4/6）、旗舰舰桥 0 分。
- `dom_test.mjs` 全绿：带点数数据渲染、编辑、导出无回归。

### 已知待办 / 坑

- 禁卡 3 张点数（战略顾问 4 / 贝尔·奥加纳 4）为「最后一次合法值」，官方 1.5 禁用后无在役点数；
  若后续要严格按「不可装备」处理，写表器需读取 `banned` 字段禁用。
- 升级卡阵营仍有一批自动判定为通用（134 张 neutral），其中含共和国/分离势力的卡
  （战斗机器人备品、突袭着陆、绝地人质、救灾任务、B2火箭机器人士兵、超波段信号增强、SPHA-T、
  热能护盾、舰载旋回炮组 等），本次只补点数未改阵营，属已知待办。
- `data/*.json` 需本地服务器访问。

### 产出文件清单

```
list-builder/
├── points_map.json       # 持久化点数表（id -> {points, en, banned?}），重建不丢
├── build_data.py         # 增加：写出前合并 points_map.json
├── data/*.json           # 328 卡全部带整数 points
└── ../_research/         # 参考项目与脚本（BSData 克隆 / lookup / 映射 / 生成脚本）
```

---

## 2026-08-23 · 禁卡状态复核：普赖斯解禁，禁卡减为 2 张

### 任务

用户指出禁卡中普赖斯总督的点数与效果都应已更改，需核实；并按规则
「若是效果更改则解禁」处理。

### 核实结论（联网 + BSData 交叉验证）

- **普赖斯总督** ✅ 效果确实更改 → **解禁**
  - 旧版（1.5 禁卡）：中型/大型战舰限定，部署舰队后放轮数标记、指定轮最后激活，点数 6。
  - 新版 **Governor Pryce (RRII)**（2023-05-06 再版）：效果重做为
    「每次激活时，攻击敌方战舰时可从攻击舰体区消耗 1 个护盾，将 1 个骰面改为任意结果」，
    **无舰船规模限制**，点数 6。已替换资产正文、去禁卡说明、去规模限定，并移除 `banned`。
  - 来源：[Governor Pryce (RRII) — 星战军刀维基](https://starwars-armada.fandom.com/wiki/Governor_Pryce_(RRII))（WebFetch 受限，经 WebSearch 交叉确认）。
- **战略顾问** ❌ 效果未更改 → **保持禁卡**
  - 全量检索无 RRII / 再版 / 重做记录，自 2020-12 1.5 禁赛至今仍是原效果（大舰限定、跳过激活）。未解禁。
- **贝尔·奥加纳**（义军军官）→ 确认从卡池删除，保持禁卡
  - BSData 中义军军官版已不存在，仅存共和国指挥官版（28 分）。

### 改动

- `assets/upgrades/officer/text.json`：ID=17 普赖斯正文换为 RRII 新版效果（帝国限定，无规模限制，无禁卡说明）。
- `_research/gen_points_map.py`：`BANNED_IDS` 去掉 `officer_017`（普赖斯走 BSData 正常匹配 6 分）。
- `_research/points_map_data.py`：注释更新（普赖斯改列「已解禁」）。
- 重新生成 `points_map.json` 与 `data/*.json`。

### 验证

- `points_map.json`：`officer_017={points:6}`（无 banned）；`officer_028`/`officer_051` 仍 `banned:true`。
- `upgrades.json`：仅 `officer_028`/`officer_051` 带 `banned`；普赖斯 effect 已是 RRII 新文案。
- `dom_test.mjs` 全绿，无回归。

---

## 2026-08-24 · 阶段三完成：任务卡一览页面

### 任务

从 `assets/Armada_规则简述和任务卡翻译_BY_Remo.xlsx` 提取任务卡的名称 / 规则 / 翻译 / 卡图，
做一个方便查看的任务列表页面；并按规则实现「每个军表 3 个任务槽，点槽后按对应类别选择」。

### 完成内容

**数据提取**
- `extract_objectives.py`：openpyxl 读取 xlsx → 36 张任务卡，输出 `assets/objectives/text.json`
  （id / category / name / source / setup / setupEn / special / specialEn / endOfRound / endOfRoundEn / endOfGame / endOfGameEn / score / faq / image）。
- zipfile + ElementTree 从 xlsx 提取嵌入卡图 → `assets/objectives/images/*.png`（drawing 锚点 → 单元格映射）。
- `build_data.py` 新增 `build_objectives()`，产出 `data/objectives.json`（36 张，进攻 / 防御 / 导航各 12）。

**前端**
- `objectives.html` + `css/objectives.css` + `js/objectives/app.js`：3 分类 tab（含计数）、卡片网格（1/2/3 列响应式）、
  详情弹层（移动端底部弹出 / 桌面居中），中文规则 + 可折叠英文原文。

**验证**
- `objectives_test.mjs`（DOM stub）：3 tab、每类 12 张、切换、详情弹层开/关、empty 隐藏，全部通过。

---

## 2026-08-24 · 阶段四完成：写表器 Fleet Builder（按 task.md）

### 任务

按 `task.md` 40 节规格实现舰队构建器。核心要求：Fleet State 为唯一数据真相（§27/28）、instanceId 区分同舰重复（§4）、
`canEquipUpgrade` 规则引擎返回 `{allowed, reasons}`（§14）、指挥官特殊槽（§19）、称号独立槽（§20）、4 阵营（附录）、
移动全屏 / 桌面抽屉选择器（§32/33）、总览常驻（§5）、超限显示（§24/25）、任务卡 3 槽（进攻/防御/导航）。

### 完成内容

**数据 / 规则**
- `restrictions.py`：解析卡面「限定」子句 → `restrictions {factions, sizes, shipIds, shipNames, shipTraits, requiresFlagship, requiredTitles}`。
  全量扫描（非仅首行）；阵营词边界正则；尺寸短语；「旗舰限定」→ requiresFlagship；「MK1」→ 窄化到 Mark I。
  阵营感知别名表（`阵营:描述` → shipIds，如 帝国「歼星舰」→ imperial_i/ii/kuat/cymoon，义军「MC」→ 全部 MC 舰）。
- `build_data.py` 新增 `apply_restrictions()`：给 183 升级 + 60 称号附加 restrictions，并更新阵营字段。
  结果：124 张受限，2 条未解析（offensive_retrofit_016 歼星舰、support_team_002 机器人士官，均为预期）。
- **指挥官阵营补全**：指挥官卡面无阵营文字且无「限定」子句，但游戏规则每名指挥官专属某一阵营。
  按权威归属补全 `COMMANDER_FACTION`（commander_001-013 帝国、014-024 义军），仅当卡面解析不出阵营时应用。

**前端（js/fleet/）**
- `fleet-data.js`：加载 config/ships/squadrons/upgrades/titles/objectives + 槽位 SVG 图标（fill=black → currentColor），
  faction/slot/size/ship/squadron/upgrade/title/objective/anyCard 查找 + shipsOf/squadronsOf/upgradesOfSlot/objectivesOf + slotIcon。
- `fleet-state.js`：`FleetState` 单例，`create(faction, 400)` → `{version, id, name, faction, pointsLimit, ships, squadrons, objectives}`；
  `addShip` 生成 `{instanceId:"ship-001", cardId, commander:null, title:null, upgrades:[{slotIndex, cardId}]}`（§28）。
- `fleet-rules.js`：`canEquipUpgrade(data, fleet, shipInstance, slotId, card)` → `{allowed, reasons}`，
  顺序 slot → faction → size → shipIds/shipNames → requiresFlagship → 指挥官唯一（§14）。
- `fleet-calculator.js`：舰船 + 指挥官 + 称号 + 升级计分，任务卡不计分；返回 perShip / total / isOverLimit / remaining。
- `fleet-render.js`：总览 SHIPS → SQUADRONS → OBJECTIVES 三节；舰船条目含指挥官 / 称号 / 升级槽（duplicate slot 用 slotIndex 区分）。
- `selectors.js`：同一 DOM，CSS 断点切换全屏（100vw/100vh fixed）↔ 桌面抽屉（400px 右拉）；升级/称号列表按 canEquipUpgrade 过滤。
- `builder.html` + `css/builder.css` + `js/builder.js`：读 `?faction=` 设主题，接线选择器与操作条。

### 修复的关键 bug

- `selectors.js` 两处 `ctx.fleet.findShip(...)`：`ctx.fleet` 是军表对象而非 FleetState，改为 `FleetState.findShip(...)`（subtitle 与 listData 各一处）。

### 验证

- `fleet_test.mjs`（DOM stub 真实跑 builder.js 全流程）33 项全过：阵营主题、初始分数、纯规则
  （阵营 / 规模 / 舰船 / 旗舰桥 / 指挥官唯一 + 阵营过滤）、加舰重复实例、军官槽装备与义军过滤、称号按舰船过滤、
  任务卡三槽选择且不计分、删除、点数计算、JSON 序列化。
- `objectives_test.mjs` 无回归。
- 冒烟中发现并修正点数断言：阿奎腾斯指挥巡洋舰实为 55（非 58），军官 10，两舰+军官 = 120。

### 已知待办 / 坑

- **数据缺口**：共和国 / 分离势力舰船、称号、中队，以及义军中队均无数据（UI 支持 4 阵营但卡池为空）。
- 升级卡阵营仍有一批 neutral 待人工核对。
- 1.5 禁卡（`banned`）、同卡全舰队唯一、中队 1/3 上限、旗舰完整校验等 §37 预留规则未接入。

---

## 2026-08-24 · 阶段五完成：样式大调整（卡图优先 / 槽位式添加 / 槽位图标行）

### 任务

视觉重构：添加改「槽位式」（按钮放列表末尾）；舰船升级槽仅以图标集中成横排、已装备变暗、
已装备卡作条目显示在舰船下方；全面加强卡图展示（contain 全显示、大图卡片、点击放大、选择器点数条）。

### 完成内容

**槽位式添加**
- 舰船 / 中队区块列表末尾各放 `＋ 添加舰船` / `＋ 添加中队`（`.add-in-list`，虚线按钮）。
  底部操作条只保留总分显示（移除 + 舰船 / + 中队 按钮）。

**舰船条目新结构**
- `ship-head`：卡图（74px，`object-fit: contain`）+ 名称/规模 + 本舰总分 + 删除。
- `slot-row`：指挥官 / 称号 / 各升级槽**仅以 SVG 图标集中成横排**；已装备槽位 `is-equipped` 变暗（opacity .32）。
- `ship-equips`：已装备的升级卡（指挥官/称号/升级）作为条目显示在舰船下方，每条含缩略图 + 名称 + 效果 + 分数 + 卸下。

**选择器大图化 + 点数条**
- `.sel-card` 改为 grid 左图右文最右分数：左侧卡图 ~40%（contain，保证全显示）、右侧卡名/英文名/元信息/效果（3 行截断）、
  最右侧独立分数列（大号、描边分隔、accent 色）。
- 选择器顶部新增点数条（`.selector-pts`）：当前军表 `总分 / 上限`，实时变化，超限标红。

**卡图全面强化（全局规则）**
- 所有卡图 `object-fit: contain`（舰船 / 中队 / 装备条目 / 选择器卡片 / 任务卡网格 / 详情 / 大图框），全显示不变形。
- 新增 `js/fleet/lightbox.js`：除 SVG 槽位图标外，所有卡图点击放大（`Lightbox.open(src,alt)`，遮罩/关闭钮/Esc 关闭）。
  - 总览舰船图 / 中队图 / 装备条目图 / 选择器卡图 / 任务卡网格与详情图均接入（按钮内图片 stopPropagation，避免误触选择）。

**验证**
- `fleet_test.mjs` 新增断言全过（38 项）：`slot-row` / `add-in-list` / `equip-item` / `slot-btn is-equipped` /
  `Lightbox.open` / `selector-pts` 等。
- `objectives_test.mjs` 无回归；`node --check` 全部通过。

---

## 2026-08-24 · 阶段六完成：卡片再放大 + 全文显示 + 战舰槽位行 + 图标字库引入

### 任务

1. 卡图与整张卡片继续加大（加大加大加大）；
2. 卡牌文本不缩减内容，全文显示、留足空间；
3. 战舰卡显示升级槽（一行槽位图标）；
4. 引入 `armada_officer_pdf_assets` 的嵌入图标 demo（12 类图标），转换卡牌数据 JSON 中未转换的图标占位（中队部分）。

### 完成内容

**图标字库引入（ArmadaIcons）**
- 拷贝 `icons/web/*.png`（12 个 64×64 RGBA 图标）到项目根 `icons/web/`。
- 新增 `css/armada-icons.css` 与 `js/fleet/armada-icons.js`：后者为原库扩展版，
  - 新增字符串式渲染 `ArmadaIcons.toHtml(text)`：先固化「4 空格+标签」占位 → `[[icon:...]]` token，
    再统一空白、HTML 转义文本、把 token 替换为 `<img class="armada-icon">`（无注入风险，可拼 innerHTML）；
  - `labelToIcon` 补充「抑制」→ `defense-contain`（中队版防控标记，同一种标记）；
  - 保留原 `render()` DOM 版与 `solidifyPdfMarkers()`。
- `builder.html` 引入 `armada-icons.css` 与 `armada-icons.js`。

**数据图标转换（build_data.py）**
- 新增 `ICON_LABEL_MAP` + `solidify_icons()`：与 JS 同规则，把效果文本中「4 空格 + 已知标签」
  替换为 `[[icon:<id>]]` token（只替换紧跟已知标签的占位，未收录的「精确/驱散/命中」保持原样）。
- `main()` 写出前对中队 / 升级 / 称号的 `effect` 做转义：共修改 **96 张**卡面文本
  （`中队`/`集火`/`维修`/`导航`/`任意`/`回避`/`防控`/`抑制`/`传导`/`指挥官`/`士官`/`防御改装`/`暴击` 等标记）。

**渲染接入（全文显示 + 行内图标）**
- `selectors.js` `cardItem`：效果文本由 `slice(0,96)` 截断改为 `ArmadaIcons.toHtml(card.effect)` 全文显示；
  新增 `shipSlotIcons()`，舰船选择卡片下方显示一行槽位图标（指挥官 / 称号 + 各升级槽 SVG，仅展示）。
- `fleet-render.js` `equipItem`：移除 `shortEffect(card.effect, 56)` 截断，改用 `ArmadaIcons.toHtml()` 全文显示。

**卡片加大（css/builder.css）**
- `.sel-card`：网格改 `5fr 6fr auto`（卡图占比更高，最大 190px）、padding/gap 加大、圆角 14px；
  `.sel-thumb` 更大；`.sel-name` 16px / `.sel-effect` 13px 全文显示（移除 `-webkit-line-clamp: 3`）；`.sel-pts` 26px。
- 新增 `.sel-slots` / `.sel-slot`（30px 槽位图标方块，SVG 20px）。
- 总览卡图加大：`.ship-thumb` 88px、`.equip-thumb` 54px、`.sq-thumb` 58px；`.equip-effect` 移除 2 行截断全文显示。
- 桌面抽屉加宽 400→460px、`.ship-thumb` 84→100px。

**验证**
- `fleet_test.mjs` 新增断言全过（48 项）：`sel-slots`/`sel-slot`（舰船选择卡槽位行）、
  中队卡图标渲染为 `<img>`（`icons/web/defense-contain.png` / `attack-critical.png`）、无残留 `[[icon:` token、
  中队卡与已装备条目效果全文显示（不截断）。
- `objectives_test.mjs` 无回归；`node --check` 全部通过。
- DOM 转储核对：舰船选择卡槽位行（指挥官/称号+升级 SVG）、中队卡 `暴击`/`抑制` 图标正常渲染。

## 2026-08-24 · 阶段七完成：图标占位清理 + 中队/升级卡文本转换复核

### 任务

1. 转换中队与舰船升级卡全文（上一阶段仅做了占位替换骨架）；
2. 排查「留了空格却没被改成图标」的异常文本（用户反馈）；
3. 有转换代码问题改代码，没有问题则直接改 JSON 源文本。

### 转换规则（`build_data.py` `solidify_icons()`，重构后）

- **占位宽度 3–5 空格均可**（实测直方图：3×3 / 4×94 / 5×1，源文本**从不出现 2 空格**，
  故 3+ 空格必为 PDF 图片占位，` {3,}` 安全匹配；施里夫卡 防御改装 即 3 空格占位）。
- **已知标签 → token** `[[icon:<id>]]`：`指挥中队/集中火力/修复/导航/任意/回避/抑制/传导/指挥官/军官/防御改装/暴击`
  （13 个，含 抑制→defense-contain）；标签内部允许折行（`_label_pattern` 每字符后可选换行，修 `回\n避`）。
- **无图标标签只清占位**：`精确/驱散/命中/舰队指挥/奇袭/突袭/武器组/支援组/离子炮/激光炮/导弹/指令所`
  （PDF 以文本排版，无图片，保持自然中文）。
- **锚定段吞换行**：仅在被 token 或占位锚定的连续中日韩段内，把 PDF 折行拆词换行吞掉
  （`_consume_cjk_run`，段内换行全是拆词）；`重置费用/自带` 章节断头不吞。
- **非锚定换行折叠为空格**；`X Y`→`XY` 合并时 Y 为从句起始字则保留空格
  （`_KEEP_SPACE_AFTER = 在当每如你它则而也但且并只限帝重`）——防 `限定在`/`帝国帝国级`/`集火重置费用` 粘连。
- **修复的转换代码 bug**：占位正则 ` {4,}` → ` {3,}`（1 处 3 空格已知标签此前漏转）。

### 直接修改的 JSON 源文本

- **`assets/squadrons/imperial/text.json` 轰炸模板修复（10 张）**：提取器把轰炸关键字里的
  `暴击` 图标整体静默丢弃（连占位都没留），`你的每个\n标志将增加` 缺字。
  按同卡维达文「你的每个    暴击标志」的官方排印补回 `你的每个    暴击标志将增加`，
  转换后渲染为 `你的每个[[icon:attack-critical]]暴击标志将增加…`（`结算暴击效果` 保持文本，
  与全游戏一致——PDF 该处本就无图片占位）。
- 其余疑点经查源**均为忠实文本**，不动：`限定导航：`/`维修：`/`Nav Team导航`/各类
  `结算暴击效果`/`任意数量/任意颜色/任意面`（无占位=PDF 文本排版）。

### 验证

- 全库 328 卡：**0 处 3+ 空格残留、0 处换行残留、0 处粘连**（`限定在/帝国帝国级/集火重置费用/…`）。
- 图标 token **152 个 / 104 张卡**（原 141/98，新增 10 个轰炸 `暴击` + 1 个 `防御改装`）。
- 10 张轰炸卡与施里夫卡转储复核通过。
- `fleet_test.mjs` 50 项全过；`objectives_test.mjs` 冒烟通过。

## 2026-08-24 · 阶段八完成：纯文本「暴击」转图标 + title 限制改用 shipId 权威

### 任务

1. **核心问题**：页面中「暴击」等字样仍显示为纯文本而非图标；
2. 页面 title 限制有误——改用用户在 title 的 `text.json` 里加的 `shipId` 字段做匹配依据。

### 修复一：纯文本「暴击」无条件转图标

- **根因排查**：渲染路径（`selectors.js` 第 83-84 行、`fleet-render.js` 第 88 行）本就走
  `ArmadaIcons.toHtml`，问题出在**数据**——PDF 提取在部分卡面把 `暴击` 按文字排版（无图片占位），
  阶段七只转换了「有占位的暴击」，纯文本暴击漏网（轰炸卡是其中 10 张，其余分散在武器/离子炮等卡）。
- **判定**：本库全部文本中「暴击」**永远指 [crit] 骰面图标**，无歧义 → 可无条件转换。
- **`build_data.py` `solidify_icons()` 末尾**追加：
  `re.sub(r"(?<!\[\[icon:attack-critical\]\])暴击", "[[icon:attack-critical]]暴击", result)`
  —— 负向后顾跳过已带 token 的 `[[icon:attack-critical]]暴击`，防重复转换。
- **前端兜底**：`armada-icons.js` `solidifyPdfMarkers()` 同步加同款规则（双保险，
  防手工改 data json / 旧缓存直接进渲染）。
- **验证**：数据中 **0 处纯文本「暴击」**；`attack-critical` token 共 57 个；
  全库图标 token **179 个 / 111 张卡**（原 152/104）。端到端渲染确认
  `turbolasers_013` 输出 `attack-critical.png` 的 `<img>`、无 `[[icon:` 残留。

### 修复二：title 限制以 `shipId` 为权威

- **根因**：title 限制原先靠 `restrictions.py` 解析卡面「限定」子句的舰船**名称**匹配
  （`shipNames`），名称解析脆弱、易漏。
- **权威字段**：用户在 `assets/titles/{imperial,rebel}/text.json` 每张 title 加了 `shipId` 数组
  （如 `"shipId": ["arquitens_command", "arquitens_light"]`），60 张全覆盖、id 全部有效。
- **`build_data.py`**：
  - `build_category()`：`slug == "title"` 且资产带 `shipId` 时，把 `list(p["shipId"])` 写入 `card["shipId"]`；
  - `apply_restrictions()`：对 titles，若 `card["shipId"]` 存在则**覆盖**解析出的
    `r["shipIds"]` 并清空 `r["shipNames"]`（舰船限制以 shipId 为准，不再依赖文本解析）。
- **消费端**：`fleet-rules.js` `canEquipUpgrade` 第 62-63 行本就按
  `shipInstance.cardId not in r.shipIds → reason "ship"` 拒绝，**无需改动**。
- **验证**：60/60 title 的 `shipId` 与 `restrictions.shipIds` 完全一致，0 个未解析舰船名；
  `fleet_test.mjs` 更新两条断言全过——阿奎腾斯称号（shipId 含 `arquitens_command`）可装指挥巡洋舰，
  称号选择器按舰船过滤（含「半牛马号」、排除角斗士限定「破坏者号」）。

### 测试结果

- `fleet_test.mjs` 50 项全过；`objectives_test.mjs` 冒烟通过；`node --check` 全部通过。

## 2026-08-24 · 阶段九完成：义军中队列入 + unique/ace 上限执行 + 任务卡全规则展示

### 任务

1. 从 `assets/rebsquad.pdf`（02义军中队中文卡牌 v0.2，37 页）提取义军中队；
2. 区分 unique / 非unique / ace 单位：unique 全舰队限 1 个；有防御标记 = 王牌(ace)，上限 4 个；并应用到帝国中队；
3. 点数 / unique / ace 以 BattleScribe 项目（`_research/star-wars-armada/`）为准；
4. 任务卡页把任务所有规则展示完全。

### 1. 义军中队提取

- 新脚本 `extract_rebel_squadrons.py`：pymupdf 渲染 37 页 → `assets/squadrons/rebel/images/page_XXX_img_1.jpeg`；
  pypdf 逐行 strip、去空行提取文本 → `assets/squadrons/rebel/text.json`（镜像帝国格式，每页额外带
  `unique`/`ace`/`nameEn`，来源 BattleScribe `Rebel Fleet.cat`）。
- 内嵌 37 条映射表（PDF 页 → bsdata 英文名/点数，逐页核对），脚本自带卡面文本检测自检（·前缀 = unique、
  「自带防御标记」= ace）——全部一致。
- `points_map.json` 新增 37 条 `rebel_squadrons_001..037`（含英文名与点数，如 比格斯 19、匕首 15、X翼 13、YT-2400 16）。

### 2. unique / ace / limit

- **判定规则**（两阵营统一，经 PDF 与 BattleScribe 双重核对）：
  - `·` 前缀 = unique（独特单位）→ `limit: 1`；
  - 卡面「自带防御标记」/ BattleScribe `Defense Tokens` 非空 = ace（王牌）；
  - 普通单位 `limit: 4`。
- **unique 但非 ace 的命名中队**（4+4）：帝国 黑色/伽马/军刀/暴风，义军 匕首/金色/绿色/侠盗。
- `build_data.py` `build_category()`：squadrons 改为 `["imperial", "rebel"]`；每张中队卡写
  `unique`/`ace`/`limit`（`1 if unique else 4`）/`nameEn`。帝国资产无 `unique`/`ace` 字段 → 走卡面文本检测回退，
  结果与 BattleScribe 一致。
- `fleet-rules.js` `canEquipSquadron()`：阵营检查后加计数限制——unique 已 1 个 → reason `squadron-unique`
  （独立 key，与指挥官唯一 `unique` 区分）；已达 `limit` → reason `limit`。`reasonLabel` 增补中文说明。
- `selectors.js`：中队列表按 `canEquipSquadron` 过滤，meta 显示 `独特/王牌 · 已带 n/limit · x 分`；
  `pick()` 添加前守卫。

### 3. PDF 字形错位修正

- 两张卡牌 PDF 的字体子集把常用字映射成形近字（如 动→劢、不→丌、与→不、进→迚、方→斱、卫→卣），
  经全量扫描验证各来源 PDF 的交换**可逆**后，`build_data.py` 新增 `GLYPH_FIX` 表 + `fix_glyphs()`，
  在构建时按来源（类别+阵营 / upgrades）修正卡面文本。
- 例：帝国「移劢」→「移动」、「不你交战」→「与你交战」、「迚行」→「进行」；义军「护卣Escort」→「护卫Escort」。
- 修正后全库 0 处残留错位字（劢/丌/不你/迚/卣/斱 全部为 0）。

### 4. 任务卡全规则展示

- `objectives.html`：网格卡片内联全部规则段落（布设/特殊规则/回合结束/游戏结束 + FAQ，得分已在 meta 徽章），
  正文过 `ArmadaIcons.toHtml`（转义 + 行内图标）；引入 `armada-icons.js` + `armada-icons.css`。
- `js/objectives/app.js`：新增 `inlineSection()`，`card()` 渲染内联规则；详情弹层保持不变。
- `css/objectives.css`：新增 `.card-rules`/`.card-sec` 样式；`.card` 改 `align-items: stretch`。
- `js/fleet/selectors.js`：任务选择卡同样内联全部规则段落（`objectiveFullHtml()`），`cardItem` 增加
  effect 覆盖参数。
- `extract_objectives.py`：`field()` 把 Excel 空栏 `--` 视为空字符串，重跑后英文原文字段不再带 `--` 噪音。

### 数据与测试

- `build_data.py` 重跑：squadrons.json 76 张（39 帝国 + 37 义军），点数 365/365 全合并，图片校验全过。
- `fleet_test.mjs` 新增 15 条断言：义军 37 张列入 + 点数、unique/ace/limit 字段、unique 第 2 个被拒
  (`squadron-unique`)、普通第 5 个被拒 (`limit`)、任务选择卡内联规则——全部通过；
  `objectives_test.mjs` 补充网格卡内联规则断言（含 armada-icons 加载）——通过。

## 2026-08-24 · 阶段十完成：任务卡英文 + 中队 1/3 软上限 + 去掉空态提示 + 分数居中 + 显示开关

### 任务

1. 任务卡显示英文原文（此前网格卡只内联中文规则）；
2. 中队分数上限为舰队分数 1/3（向上取整），做软性限制，超分与舰船超分一样显示红字；
3. 去掉「还没有舰船/还没有中队」两处空态提示文案；
4. 整个舰队分数放到标题下方、页面居中（不再放右上角）；
5. 任务卡选择页（含写表器任务选择器 + 任务卡一览页）顶部增加两个开关：显示英文 / 显示FAQ。

### 1. 任务卡英文原文

- `js/objectives/app.js`：`inlineSection()` 增加 `enText`，中文规则下方渲染
  `<div class="card-sec-en">英文原文</div>`（escapeHtml 转义）；`card()` 传入 `setupEn`/`specialEn`/
  `endOfRoundEn`/`endOfGameEn`；FAQ 无英文，保持中文。
- `js/fleet/selectors.js`：`objectiveFullHtml()` 各段落 `[标题, 中文, 英文]`，英文以
  `<span class="obj-sec-en">` 整块展示。
- `css/objectives.css` 新增 `.card-sec-en`；`css/builder.css` 新增 `.obj-sec*`（标题/正文/英文）。

### 2. 中队分数 1/3 软上限

- `fleet-calculator.js`：返回新增 `squadronLimit = Math.ceil(pointsLimit / 3)`（400 分 → 134）、
  `isOverSquadronLimit = squadrons > squadronLimit`。
- `fleet-render.js`：中队节标题右侧显示 `当前 / 上限`，超限时 `.section-pts.over` 红字 +
  `<span class="section-hint over">超出中队上限（舰队分数 1/3）</span>`（软限制，不阻止添加）。
- `css/builder.css`：`.section-pts.over` / `.section-hint.over` 沿用 `--danger` 红。

### 3. 去掉空态提示

- `fleet-render.js`：空舰船/空中队 section 内不再输出 `section-empty` 提示，仅保留列表末尾
  「＋ 添加」按钮。

### 4. 舰队分数居中

- `builder.html`：`points-box` 从 `.builder-header` 移到独立的 `<div class="fb-points">`。
- `css/builder.css`：`.fb-points` 水平居中；`.builder-title` 绝对定位水平居中（避免 space-between
  把标题顶到右侧），≤820px 回退 static 不覆盖。

### 5. 显示开关（显示英文 / 显示FAQ）

- **写表器任务选择器**（`js/fleet/selectors.js`）：仅 objective 类型渲染 `.sel-prefs` 两个 checkbox
  （`pref-en`/`pref-faq`），module 级 `objPrefs` 跨开关持久；`objectiveFullHtml()` 按偏好过滤英文/FAQ；
  `change` 事件更新后重渲染 body。
- **任务卡一览页**（`objectives.html` + `js/objectives/app.js`）：tabs 下方新增 `.obj-controls` 两个
  checkbox；`state.showEn`/`showFaq` 控制网格卡 `inlineSection()` 的英文与 FAQ 段，详情弹层
  `section()`/FAQ 同样生效。
- `css/objectives.css` 新增 `.obj-controls`/`.obj-pref`；`css/builder.css` 新增 `.sel-prefs`/`.sel-pref`。

### 测试

- `fleet_test.mjs` 新增断言并全过：空态提示文案不存在、`0 / 134`、`squadronLimit===134`、超限
  `isOverSquadronLimit`+红字渲染、任务选择卡英文原文、选择器偏好开关开/关/恢复。
- `objectives_test.mjs` 新增：网格卡英文原文、顶部两个开关、关英文/关 FAQ/恢复。全部通过。
- `node fleet_test.mjs` 77 项全过；`node objectives_test.mjs` 冒烟通过。

## 2026-08-25 · 阶段十一完成：英文/FAQ 开关默认关闭 + 任务卡中文文本清洗

### 任务

1. 写表器任务选择器与任务卡一览页的「显示英文」「显示FAQ」开关改为**默认关闭**；
2. `assets/objectives/text.json` 的 `special` 等中文字段应是纯汉化文本，但出现中英同义并存——
   剔除与中文同义的英文重复行，并把原汉化者漏译的英文游戏术语（如 dust field）翻译成中文。

### 1. 英文/FAQ 开关默认关闭

- `js/fleet/selectors.js`：`objPrefs = { showEn: false, showFaq: false }`（选择器顶部开关默认不勾选）。
- `js/objectives/app.js`：`state = { ... showEn: false, showFaq: false }`。
- `objectives.html`：去掉 `pref-en`/`pref-faq` 两个 checkbox 的 `checked` 属性。
- 网格/选择器默认只显示中文规则段落；用户打开开关后才出现英文原文与 FAQ。

### 2. 任务卡中文文本清洗（根因修复在提取器）

- `extract_objectives.py` `split_zh_en()` 重写：原实现「从首个中文行截断」，把中文行之后夹带的
  同义英文行漏进 `zh` 字段（special 等出现中英并存）。改为**按行拆分**——含中文的行归 `zh`，
  其余归 `en`，`*En` 字段因此也更完整。
- **FAQ 拆分**：`faq` 字段原先中英混排且带 `[FAQ]` 前缀。现在拆成 `faq`（纯中文）与新增
  `faqEn`（英文），并剥离 `[FAQ]` 前缀。界面侧：`app.js` 网格 `inlineSection("FAQ", o.faq, o.faqEn)`、
  详情 FAQ 段增加可折叠「英文原文」（受「显示英文」开关控制）；`selectors.js` `objectiveFullHtml()`
  的 FAQ 段同样传入 `card.faqEn`。
- **漏译术语汉化**（`TERM_FIXES`，仅作用于中文字段；英文原文保持原样）：
  `station→空间站`、`dust field→尘埃云`、`asteroid field/asteroid→小行星带`、`debris field→碎片带`、
  `gravity rift→引力裂缝`、`purrgil→鲸兽`、`exogorth→太空蛞蝓`、`strategic→（去掉，与「策略特性」
  同义冗余）`。升级/称号卡名（Gunnery Team 等）为专有名词，保留英文。
- 重跑 `extract_objectives.py && build_data.py` → `assets/objectives/text.json` 与
  `data/objectives.json` 同步（36 张，字段无差异）。

### 测试

- `fleet_test.mjs`：任务选择器改为断言「默认不显示英文与FAQ → 打开开关出现 → 再关闭隐藏」。
- `objectives_test.mjs`：网格同理（默认纯中文 → 开英文/FAQ 出现 → 关隐藏），详情断言保持。
- `node fleet_test.mjs` 77 项全过；`node objectives_test.mjs` 冒烟通过。

## 2026-08-25 · 阶段十二完成：指挥官 / 称号 / 独特 / 改装（不动数据库与总览既有结构）

### 任务

按 `task.md` 实现舰队构建器的 Commander（舰队级）、Title（独立行+舰队级独特）、Modification
（独立装备位+数据字段），**不重构**既有 Card Database / Selector / Fleet Overview 结构。

### 1. 指挥官 Commander（舰队级）

- `fleet-state.js`：`fleet.commander`（卡 id）+ `fleet.commanderShipId`（旗舰）——存舰队级，
  **绝不塞进第一艘船**。选指挥官的那艘船即旗舰；删除旗舰会清空 commander 双字段。
- `fleet-render.js`：未选指挥官时**每艘舰**都渲染「指挥官 Commander ＋选择指挥官」入口行
  （`commanderEntryRow`，位于 ship-extra 最前）；选中后：
  - 各舰入口行全部隐藏（`fleet.commander` 非空即返回 ""），不删除任何舰船槽位；
  - 总览顶部（舰队总点数附近）渲染 `.fleet-commander` 块：卡图用 `object-position: 50% 6%`
    裁切**上半部分**主体区域、指挥官名/英文名/分数、「更换」「删除」按钮；
  - 点击卡图走既有 Lightbox 放大。
- 指挥官选择器过滤：指挥官无规模/舰船限制，仅阵营限制 → 复用既有 `canEquipUpgrade` 阵营过滤，
  列表只列合法指挥官卡。
- `fleet-calculator.js`：指挥官点数计入**旗舰**（`fleet.commanderShipId` 对应的那艘），
  非塞进第一艘。
- 删除（`clear-upgrade` slot=commander）：清 `fleet.commander`/`commanderShipId`，各舰入口恢复。

### 2. 称号 Title（独立行 + 永远最后）

- 舰船条目顺序：舰船本体 → 普通升级槽 → 指挥官入口（未选时）→ **Modification → Title**（Title 永远最后）。
- Title 不是普通升级槽：`extraRow(data, ship, "title", "称号 Title")`，每舰最多 1 个。
- 选择器：`slotId === "title"` 时池 = `data.cards.titles`；`pick()` 走 `FleetState.setTitle`。

### 3. 独特 Unique（舰队级，通用函数）

- 数据：所有称号带显式 `unique: true/false`（56 true / 4 false，依据 nameEn「•」前缀判定，
  在 points 合并后由 main() 统一标记）；指挥官 24 张全部 `unique: true`。
- 规则：**一个通用** `uniqueInFleet(fleet, card, excludeCardId, excludeInstanceId)`——扫全舰队
  （commander + 各舰 title/modification/upgrades），查同 id 是否已存在且非当前装备位。
  **不**拆 `checkUniqueTitle()/checkUniqueUpgrade()/checkUniqueCommander()`。
- 称号跨舰再选同 unique → 拒绝（reason `"unique"`，label「独特卡已在舰队其他位置」）。
- 删除该称号后同卡可在另一舰重选（排除自身位）。

### 4. 改装 Modification（数据字段 + 独立装备位）

- **数据**（`build_data.py`，非运行时解析）：`MODIFICATION_CARDS` 集合标定 18 张改装卡，
  `build_upgrades()` 写 `"modification": true`（其余 165 张 false）。指挥官 24 张 `unique: true`。
- **中文效果文本处理**：`strip_modification_label()` 只删**卡类型/标签位**的「改装」前缀
  （`startswith("改装")` 或 `限定\s*改装` 中间标签，含空格容忍），**不** `replaceAll("改装","")`——
  正文语义性「改装」（如军官卡的「防御改装」槽位名）原样保留。已核对全部 18 张剥离后限制不变。
- **选择器**：`modification === true` 的卡在 `sel-meta` 显示「改装」徽章；普通 Upgrade Selector
  **排除** `modification===true`（独立装备位）；新增「选择改装」选择器只列 `modification===true`。
- **槽位**：`ship.modification = null/cardId`，每舰最多 1 个（reason `"modification-limit"`）；
  已装备后选择器过滤掉其他改装（`canEquipUpgrade` modification-limit 步骤），删除后恢复。
- **UI**：舰船内独立「改装 Modification」行（`extraRow`），低视觉权重、从属舰船；
  旗舰舰桥（offensive_retrofit_006，中型/大型 + 旗舰限定）作为改装走此位。
- `fleet-rules.js` `canEquipUpgrade` 步骤：改装槽专用 slot 校验 → 普通槽排除改装卡（reason
  `"modification"`，label「改装为独立装备位（非普通升级槽）」）→ modification-limit → commander
  舰队级限制（reason `"commander"`，label「舰队已有指挥官（全舰队仅 1 名）」）→ title unique。

### 数据与测试

- 重跑 `python build_data.py`：183 升级全带 `modification`（18 true）、24 指挥官 `unique: true`、
  60 称号 `unique` 显式化、18 张改装效果已剥标签（`_verify_data.mjs` 核对全部字段 + 限制无回归）。
- `fleet_test.mjs` 新增：指挥官 UI 全流程（入口→选择器→舰队级存储→顶部展示→点数 78=55+23→
  Lightbox→删除恢复入口）、旗舰桥改走改装位（flagship 规则保留）、称号 unique 跨舰拒绝/删除恢复、
  改装数据字段/徽章/普通槽排除/modification-limit/替换同一改装。
- `node fleet_test.mjs` 全部通过（80+ 项）；`node objectives_test.mjs` 冒烟通过。

## 2026-08-25 · 阶段十三完成：按反馈修正——槽位图标选择方式 + 改装按自身槽 + 中队数量调节

### 任务（用户反馈）

1. 指挥官 / 称号 / 改装的选择方式**改回槽位图标**：每艘舰显示自己的升级槽图标（含指挥官）；
   某舰选了指挥官后其它舰的指挥官槽隐藏，删除后重新显示。
2. **改装不是独立槽位**：只是"每舰限制 1 张"改装类升级。改装卡按自身升级类型出现在对应槽位的
   选择界面；该舰已装改装时，其它改装卡**边框变红**并提示「每艘船只能有一个改装类组件」。
3. 称号同样回到槽位图标，**排在其他升级槽图标之后**。
4. 中队：非 unique 非 ace 的普通中队**单卡 + 数量调节（±）**，不再每加一个就产生一张卡
   （4 个上限校验落实到数量显示）；舰船不套用此逻辑。
5. `data/*.json` 等固化数据全部保留（`modification` / `unique` 字段、去标签效果不动）。

### 1. 槽位图标选择方式（fleet-render.js `slotRow`）

- `slot-row` = 指挥官图标 + 普通升级槽图标 + 称号图标（永远最后）。
- 指挥官：`fleet.commander` 为空时每艘舰都显示空槽图标；选了指挥官后**只有旗舰**（commanderShipId）
  显示（已装备变暗），其余舰槽位隐藏；`clear-upgrade slot=commander` 后全部恢复。
- 称号：`ship.title` 装备后图标变暗，舰船下方 `equip-item` 显示称号（可更换/删除）。
- 删除了上版的 `commanderEntryRow` / `extraRow`（ship-extra）及对应 CSS。

### 2. 改装按自身槽（fleet-rules.js / selectors.js）

- 移除 `MODIFICATION_SLOT` 概念。`canEquipUpgrade` 槽位校验回到「卡 slot 必须等于槽位」；
  改装卡正常装进 `turbolasers` / `offensive_retrofit` 等自身槽。
- 新增 `shipHasModification(data, ship, excludeCardId)`：扫描舰船 `upgrades` 中 `modification===true`
  的卡（排除正在更换的那张），命中 → reason `modification-limit`（label「每艘船只能有一个改装类组件」）。
- 选择器普通槽池**不再排除** `modification===true`；改装卡在 `sel-meta` 保留「改装」徽章。
- 已装改装的舰再开同槽选择器：其它改装卡**仍展示**但 `sel-card is-blocked`（红边）+ `.sel-warn`
  提示文案；`pick()` 二次校验拦截（blocked 卡不装备）。其余非法卡照旧过滤隐藏。
- 点数/计算随之简化：`shipTotal` 只按 `upgrades` 计，改装卡点位自然计入。

### 3. 中队数量调节（fleet-render.js `squadronGroup` + fleet-state.js）

- 渲染：`fleet.squadrons` 按 `cardId` 分组，同类型合并为**一个 chip**；非 unique 非 ace 的普通中队
  显示 `− 数量 ＋` 步进器（上限 `card.limit`，默认 4，达上限 `＋` 禁用并标红 `is-max`），分数为
  点数 × 数量；unique / ace 单卡无步进器。
- 状态：`changeSquadronCount(cardId, ±1)`（+1 受 `canEquipSquadron` 守卫，即 4 个上限校验落实到 UI）、
  `removeSquadronsByCard(cardId)`（× 删除整组）；builder.js 新增 `squadron-inc/dec/del` 分支。
- 舰船不套用（舰船仍按实例单独条目 + 槽位）。

### 测试

- `fleet_test.mjs` 重写 Commander/Title/Modification 段为槽位图标行为（`cmdSlotCount` 统计、
  称号槽在 officer 之后、改装自然槽装备 + 标红提示 + pick 守卫）；新增中队数量段（单 chip ×3、
  + 到 4、第 5 个被拒、− 回 3、× 整组删、unique 无步进器、舰船不套用）。
- `node fleet_test.mjs` 全部通过（90+ 项）；`node objectives_test.mjs` 冒烟通过。
- JS 全 `node --check` 通过；新 CSS（`.sq-stepper`/`.sq-step`/`.sq-count`/`.sq-qty`/`.sel-warn`/
  `.sel-card.is-blocked`）齐全，旧 extra-row 样式已清。

## 2026-08-25 · 阶段十四：主页阵营卡片——手机适配 + 官方徽记 + 官方配色

### 需求

- 主页 4 张阵营卡片适配手机屏幕（一行 2 个）。
- 势力图标换成 `assets/*.svg`（帝国 cog / 义军 starbird / 共和国 cog / 分离势力六边形）。
- 仅主页配色改为官方阵营色：共和国 共和红 `#C43030`、分离势力 分离蓝 `#305B91`、
  帝国 帝国黑 `#373B3E`、义军 橙红 `#D25C30`。

### 实现

- `js/factions.js`：徽记改为**内联 `assets/*.svg` 的 path 数据**（Python 脚本 `_gen_factions.py`
  解析取 path，`fill:#000000 → currentColor`，保留 `fill-rule` / `transform`；文件开箱即用且
  `file://` 不依赖 fetch）。新增 `card: {accent, glow, ink}` —— 官方配色**仅主页**使用；
  原 `accent`/`glow`（写表页 badge 主题色）不动。
  - `ink`（徽记 / 进入写表 / hover 边框的可读色）：义军、共和国 = 官方色；分离势力提亮
    `#5b8cc2`；帝国因 `#373B3E` 近黑，提亮为浅灰 `#c9d0d6`。
- `js/main.js`：卡片行内样式新增 `--card-ink`（`f.card.ink || f.card.accent`）。
- `css/style.css`（仅主页类）：
  - 卡片顶边 `3px solid var(--card-accent)`（官方色条）；`.emblem` / `.enter-hint` / hover 边框
    改用 `--card-ink` 保证深色（帝国/分离）下的可读性；hover 辉光沿用 `--card-glow`。
  - 新增 `@media (max-width: 560px)`：`faction-grid` → `repeat(2, 1fr)`，卡面压缩、徽记 52px、
    简介两行截断（`-webkit-line-clamp: 2`），标题/字号相应缩小。

### 验证

- Python `ET.fromstring` 对 4 个生成的 `<svg>` 全部通过（良构）。
- `_home.mjs`（DOM stub 渲染 main.js）：4 卡片、每张含对应官方 `--card-accent/--card-glow/--card-ink`、
  无残留 `#000000` / `xlink` / `<use>`、4 个 `fill="currentColor"` `<svg>`。
- `node fleet_test.mjs` 全部通过（factions.js 语法与写表页 badge 不受影响）。

## 2026-08-25 · 阶段十五：指挥官上舰 + 双槽位卡 + 全局 unique（按 nameEn 同名）

### 需求

1. **指挥官在舰船上显示**：指挥官是升级卡，舰队顶部已有 commander 块，但仍需在旗舰的舰船条目里
   重复显示，一眼看出在哪条船上。
2. **双槽位升级卡**：6 张「武器小组 / 进攻改装」双槽卡（查姆 辛杜拉、琴 厄索、施里夫 苏尔加夫、
   登舰工兵、登舰步兵、达斯 维达）。舰船同时有这两个槽且都空闲时，卡在两个槽中都显示；
   选中后**同时占用两个槽位**。
3. **全局 unique（按 nameEn）**：unique 卡对所有槽位生效，用「全局」记录当前已选 unique 卡的
   nameEn（如 `•Darth Vader`），跨 指挥官/称号/升级/中队/舰船 同名不可重复。选择界面同名卡
   **不可用**（复用 `is-blocked` 机制）并提示「舰队中已存在同名卡：[槽位名]中文名」。

### 数据

- `build_data.py` 新增 `DUAL_SLOT_CARDS`（6 张卡 id → `["weapons_team","offensive_retrofit"]`），
  `build_upgrades` 把占位 `"slots":[]` 改为实际数组；重跑后 `data/upgrades.json` 这 6 张带
  `slots`，其余卡 `slots` 仍为空数组（`upgradesOfSlot` 双槽命中依赖它）。

### 实现

- **fleet-rules.js**（全局 unique 核心）：
  - 移除旧的 id-based `uniqueInFleet`，改为按 **nameEn**（`•` 前缀）判定的
    `uniqueNamesInFleet(data, fleet, excludeCardId)` —— 扫描 指挥官 / 各舰（舰船卡、称号、全部
    升级槽）/ 全部中队，产出 `nameEn -> {slotKey, name}`。
  - `uniqueNameConflict` / `uniqueNameHint`（提示文案 `舰队中已存在同名卡：[槽位名]中文名`）、
    `slotLabel`（commander/title/ship/squadron 特殊名，其余查 config）、`currentOccupant`
    （目标槽当前卡，用于「重选同一张」排除自己）。
  - `canEquipUpgrade`：槽位校验改走 `card.slots || [card.slot]`（双槽卡可进自身任一槽）；
    第 8 步 unique 检查改为 `uniqueNameConflict`，排除 `currentOccupant`；`canEquipSquadron`
    加同名检查；reason 改为 `unique-name`（label「舰队中已存在同名卡」）。
- **fleet-state.js**：`setUpgrade(instanceId, slotIndex, upgradeCardId, shareSlotIndex)` ——
  双槽卡装备时若兄弟槽空闲则一并写入（兄弟槽 `shared: true`）；`clearSlotOccupation` 按
  shared/主条目联动清除（删除或替换任一侧，双槽整组处理）。
- **fleet-calculator.js**：`shipTotal` 跳过 `shared` 条目（同一张双槽卡点数只计一次）。
- **fleet-data.js**：`upgradesOfSlot` 双槽感知（`c.slot === slotId || slots.includes(slotId)`）。
- **fleet-render.js**：
  - `shipEntry`：旗舰条目顶部插入**指挥官 equip-item**（带「指挥官」标签）；跳过 `shared` 条目
    （双槽卡只在主槽下显示一次）。
  - `equipItem` 新增槽位标签 `.equip-tag`（`slotLabel`）；`slotRow` 共享槽标题标注「双槽共用」。
- **selectors.js**：
  - 升级分支：`canEquipUpgrade` 传 `slotIndex`；非法卡中**仅因 `modification-limit`**（每舰 1 张
    改装）或 **`unique-name`**（同名冲突，提示用 `uniqueNameHint`）的卡仍展示、标红不可选，
    其余原因照旧过滤；`metaOf` 双槽卡显示「武器小组 / 进攻改装」。
  - 中队分支：同名 unique 冲突卡同样标红 + 提示（数量上限等照旧过滤）。
  - `pick()`：传 `slotIndex`；普通槽选双槽卡时计算 `shareIndex`（兄弟槽存在且空闲才共享）→
    `setUpgrade(id, slotIndex, cardId, shareIndex)`；守卫拦截标红卡。
- **builder.css**：新增 `.equip-tag`（小徽章式槽位标签）。

### 验证

- `node fleet_test.mjs` 全部通过（148 项）：指挥官在旗舰条目显示（`equip-item" data-slot="commander"`
  + 指挥官标签）；双槽卡可进 武器小组/进攻改装 任一槽、装后两槽占用且 `shared`、点数只计一次、
  渲染只出一个条目 + 两槽图标变暗 + 双槽共用标注、删共享槽/替换主槽整组清除、兄弟槽占用时不共享、
  UI 选双槽卡两槽占用；同名 unique（指挥官/军官/双槽 三个 `•Darth Vader`）互相挡住、提示
  `舰队中已存在同名卡：指挥官 达斯 维达`、替换本槽同一张不误报、UI 标红 + pick 守卫。
- `node objectives_test.mjs` 冒烟通过。

### 缺陷修复（双槽卡占用原子化）

**报告**：双槽卡在替换/删除后出现「只占一个槽位」的半占位 bug —— 剩下一侧槽（如进攻改装）可选中，
但实际逻辑乱套。

**根因**：`selectors.js pick()` 里 `shareIndex` 用**清除前**的状态计算 —— 替换一张双槽卡时兄弟槽
仍显示被占用 → `shareIndex=null` → 新双槽卡只占自身一个槽。

**修法（把双槽卡占用变成原子操作）**：

- **fleet-rules.js**：
  - 规则 2b `dual-slot`：双槽卡要求两个槽位**都在舰船上且都空闲**才能装备 —— 任一侧被占（含被
    同一张双槽卡占着）都拒绝，杜绝半占位入口。
  - 规则 9 `dual-locked`：被双槽卡占用的槽位**不可替换**（另一张双槽卡 / 单槽卡 / 同一张 一律拒），
    须先删除整组再重新装备。
  - 新增 `dualSlotHint`：提示「双槽位卡需两个槽位都空闲：另一槽位XX已有升级卡」。
- **fleet-render.js**：`equipItem` 双槽卡条目的**更换按钮禁用**（`equip-open is-locked`，提示
  「双槽位卡占用两个槽位，需先删除才能更换」）；`slotRow` 被双槽卡占用的两个槽位图标都渲染成
  `slot-btn is-equipped is-locked`（disabled、无 open-upgrade action，保留 data-slot/data-slot-index）。
- **selectors.js**：升级分支对仅因 `dual-slot` 被拒的卡**标红 + 提示**（用 `dualSlotHint`），pick 守卫拦截。
- **builder.css**：`.equip-open.is-locked` / `.slot-btn.is-locked` 禁用样式。

**验证**（`node fleet_test.mjs` 157 项全过）：双槽卡占用时两槽按钮锁定、条目更换按钮禁用；替换为
另一双槽卡/单槽卡/同一张都拒 `dual-locked`；删共享槽双槽整组清除且槽位重新开放；兄弟槽被单槽卡
占用时双槽卡拒 `dual-slot` + 提示「另一槽位武器小组已有升级卡」+ UI 标红不可选；清空后 UI 选双槽卡
仍两槽占用。

## 2026-08-25 · 阶段十六：转义图标随字体颜色 + 加槽位升级卡（addsSlots / 清理逻辑）

### 需求

1. **转义图标颜色改成字体相同颜色**：效果文本里 `[[icon:...]]` token 渲染出的行内小图标
   （暴击 / 防御标记 / 指令等）颜色跟随所在文本字体颜色（正文为浅色 / 深色主题下图标不再是黑底 PNG）。
2. **加槽位升级卡**：找出「会给舰船增加升级槽位」的卡（共 7 张：旗舰舰桥、图阿部长、喷火兽号、
   蹂躏号、解放者号、前卫号、凤凰之巢号）。给这些卡增加字段说明增加哪些槽位；仅卡面明确写
   「已有该槽则不能装备」的卡（喷火兽号 / 解放者号 / 图阿部长）才**拒绝**已拥有该槽的战舰，
   其余加槽卡允许额外/重复槽。装备这些卡后舰船**增加对应槽位**，删除时**该槽及其内组件一并清理**，
   不留孤儿组件。

### 1. 图标改色（CSS mask + currentColor）

- **armada-icons.js**：`toHtml` / `createIcon` 由 `<img src="icons/web/x.png">` 改为渲染
  `<span class="armada-icon armada-icon--<id>" title="..." aria-hidden="true" data-icon="<id>">`。
- **armada-icons.css**：`.armada-icon` 用 `background-color: currentColor` + `mask-image`
  （`repeat:no-repeat; size:contain; position:center`）给 PNG 剪影上色，图标颜色跟随字体；
  12 个 `.armada-icon--<id>` 各一条 mask-image 规则（URL 相对 `css/` → `../icons/web/x.png`）。
- 12 个 PNG 均为 RGBA（含 alpha 通道），mask 剪影正确。
- 内联 SVG 槽位图标（`.slot-ico`）本就是 `fill="currentColor"`，无需改动。

### 2. 加槽卡数据（build_data.py）

- 新增 `ADDS_SLOTS_CARDS`（卡 id → 字段）：
  - `offensive_retrofit_006` 旗舰舰桥 → `addsSlots:["fleet_command"]`
  - `officer_021` 图阿部长 → `addsSlots:["defensive_retrofit"]` + `addsSlotsReject:{slots:["defensive_retrofit"],sizes:["medium","large"]}`
  - `imperial_title_009` 喷火兽号 → `addsSlots:["fleet_command"]` + `addsSlotsReject:{slots:["fleet_command"]}`
  - `imperial_title_029` 蹂躏号 → `addsSlots:["support_team"]`
  - `rebel_title_005` 解放者号 → `addsSlots:["fleet_command"]` + `addsSlotsReject:{slots:["fleet_command"]}`
  - `rebel_title_025` 前卫号 → `addsSlots:["weapons_team"]`
  - `rebel_title_027` 凤凰之巢号 → `addsSlots:["officer"]`
- 在 `build_upgrades` / `build_category`（称号）里把字段写进卡 JSON，重跑 `build_data.py`
  （183 升级 / 60 称号）。

### 3. 加槽状态模型（fleet-state.js）

- 加槽卡装备后在舰船 `upgrades` 里**追加**子槽条目：
  `{slotIndex: <下一个>, cardId: null, slotId: <槽id>, addedBy: <来源>}`。
  - `addedBy` = 加槽卡所在槽位（普通升级槽为数字下标；称号固定 `"title"` sentinel）。
- `appendAddedSlots(s, slotIds, addedBy)`：同类型子槽不重复追加（只在**已添加**的子槽间去重；
  native 槽不在去重范围——允许重复槽的加槽卡即使原生已有该槽也再开一个）。
- `clearSlotOccupation`：加槽卡被移除/替换（`entry.addedBy === undefined`）时，把
  `u.addedBy === entry.slotIndex` 的子槽整组从升级栏删掉（子槽内已装的卡一并清除）。
- `setTitle`：换称号时先把 `addedBy === "title"` 的子槽整组清理，再按新称号追加。

### 4. 加槽规则（fleet-rules.js）

- `shipHasSlot(data, shipInstance, slotId, excludeAddedBy)`：该舰当前是否拥有某槽位
  （原生升级栏有，或某张加槽卡添加过；`excludeAddedBy` 用于重选同一张卡时排除自身添加的槽）。
- `effectiveSlotIndex(data, shipInstance, slotId)`：槽位实际下标（原生优先，其次加槽卡添加的）。
- 双槽卡规则 2b 改走 `effectiveSlotIndex`：双槽卡的两个槽位可以是 native **或**加槽卡添加的。
- 规则 10 `adds-slots`（在 dual-locked 之后）：仅当 `addsSlotsReject` 存在且规模匹配时，
  舰船已含限制槽位 → 拒绝（reason `adds-slots`）；`addsSlotsHint` 给出中文提示。
- `reasonLabel` 增加 `adds-slots`；导出 `addsSlotsHint`。

### 5. 渲染 / 选择器

- **fleet-render.js** `slotRow` / `shipEntry`：追加的子槽取 `slot.slotId`，标题标注
  「（称号添加）」/「（升级添加）」。
- **selectors.js**：
  - `metaOf` 对 `addsSlots` 卡显示「增加槽位:<槽名>」。
  - 升级分支对**仅因** `adds-slots` 被拒的卡**标红 + 提示**（`addsSlotsHint`）。
  - `pick()`：装备加槽卡时把 `card.addsSlots` 传给 `setUpgrade` / `setTitle`（双槽卡仍先算 shareIndex）。

### 测试与验证

- `fleet_test.mjs` 图标断言改为 `armada-icon--defense-contain"` / `armada-icon--attack-critical"`；
  新增加槽卡测试（全过，共 157+ 项）：7 张卡 addsSlots 字段与 3 张 reject 数据正确；
  旗舰舰桥(大型旗舰) UI 装备 → 追加 fleet_command 子槽 → 子槽装舰队指挥卡 → 卸下加槽卡后子槽与子卡
  一并清理；称号加槽 setTitle 追加/重设/清空；喷火兽号 native 已有舰队指挥被拒 `adds-slots`、
  重选同一张不误报；图阿部长中/大型已有防御改装被拒、小型允许；蹂躏号无 reject 已有支援小组仍可装；
  UI 标红 + pick 守卫。
- `node fleet_test.mjs` / `node objectives_test.mjs` 全部通过。

## 2026-08-26 · 阶段十七：FAQ/勘误 拆独立字段 + 卡牌数据按阵营拆分到 assets

### 1. FAQ/勘误 提取（build_data.py）

- 新增 `FAQ_MARKERS = ("[1.5勘误：", "[勘误：", "[FAQ：")`（长标记在前）与
  `extract_faq_notes(effect)`（深度括号扫描器）：遇命中标记即提取，`[[`/`]]` 按 ±2、
  单 `[`/`]` 按 ±1 计深度，深度回 0 的 `]` 为段尾；段内 `[[icon:…]]` token 保留
  （10 张升级卡 FAQ 内含图标，普通正则必错）。多段 newline 拼接。
- 剥离后归一空白（多空格→单、标点后去空格、strip）；`defensive_retrofit_004` 段尾
  游离 ` •` 在「末段后仅剩空白/一个 •」时剥掉。
- 只删方括号段、保留其余正文：中队卡 FAQ 段后的关键字块（`反击Counter`/`自带防御标记`）、
  `officer_028` 正文不带方括号的「1.5版FAQ中被官方禁掉」不被误匹配。
- 结果：86 处注释 → 85 张卡带独立 `faq` 字段（ships effect 为空跳过）。

### 2. 按阵营拆分落盘（build_data.py）

- 新增 `upgrade_membership(card)`（镜像 `cardFactionAllowed`：`restrictions.factions`
  非空数组优先 → `faction` 字段 → 全阵营=neutral）与 `split_upgrades(cards)`
  （按 `UPGRADE_FILES_BY_MEMBERSHIP` 分桶；{separatist, republic} 双阵营卡写两份）。
- 写循环改为：ships/squadrons/titles 按 `faction` 写 `assets/<type>/<faction>/cards.json`
  （unknown 卡打印守卫）；upgrades 写 `assets/upgrades/<neutral|阵营>.json`；
  `data/` 只留 `config.json` + `objectives.json`，旧的 4 个单文件不再生成（一次性迁移提示）。
- 目标计数（对真实数据锁定）：ships 24/22、squadrons 41/41、titles 31/30、
  upgrades neutral 101 / imperial 42 / rebel 31 / separatist 7 / republic 5（盘上 186 = 183 去重；
  3 张双阵营卡 `defensive_retrofit_008` / `fleet_command_003` / `turbolasers_012` 两份重复）。
- 数据源优先级 `authoritative_cards`：`data/<cat>.json`（旧工作流）> 已拆分 assets 文件
  （新工作流，carddb 导出覆盖处）> text.json 再生（全新检出）。删除单文件后重建不会丢
  7 张手工录入卡（帝国 040/041、义军 038-041、帝国称号 031）与 carddb 编辑。

### 3. 加载器（fleet-data.js / carddb/data.js）

- `FILES` / `CATEGORY_FILES` 改为每类文件数组；新增 `loadCategory(fileList)` 并发加载 +
  **按 id 去重**（双阵营卡两份合并为一张）；`db.cards.*` 保持扁平数组，公开 API 不变。
- carddb 暴露 `upgradeFactions(card)` / `upgradeFiles(card)` / `ALL_FACTIONS`（导出切分 + 阵营显示用）。
- 注意：文件头注释里的 `assets/*/cards.json` 含 `*/` 会提前终结块注释，改写成「assets 各阵营目录」。

### 4. Card Database 对接新布局（app.js / carddb.html / carddb.css）

- `exportAll` 改为切分导出 **12 个文件**：`config.json` + ships/squadrons/titles 各
  `ships_imperial.json` 等 6 个（按 `faction`）+ upgrades `upgrades_<bucket>.json` 5 个
  （`DB.upgradeFiles(c)` 分桶，双阵营卡写两份）；toast 提示覆盖对应 assets/ 目录。
- `viewEdit` 增加 `data-field="faq"` 文本框（`applyField` 通用赋值自动持久化）+
  门控只读 FAQ 预览（`#pref-faq` 复选框，多行逐行 `ArmadaIcons.toHtml`）。
- `cardMeta` 升级卡阵营用 `upgradeFactions` 派生标签（双阵营卡 faction 为 null，显示
  「分离势力 / 共和国」；四阵营允许显示「通用」）。
- carddb.html 在 #app 前加 `.obj-controls` 复选框，加载 `js/fleet/armada-icons.js`。

### 5. 构建器 FAQ 显示（selectors.js / fleet-render.js / builder.css）

- `prefToggles()` 去掉 objective 早退：**所有卡类选择器**都显示「显示FAQ」（默认关闭）；
  「显示英文」仅 objective 有。
- `cardItem` 在 effect 后追加 `<span class="sel-faq">`（`objPrefs.showFaq && card.faq`，
  多行按 linesOf 拆分逐行 toHtml）；`fleet-render.js` `equipItem` 同样追加 `.equip-faq`，
  新增模块级 `prefs` + 导出 `setPrefs({showFaq})`。
- change 委托：pref-faq 更新 `objPrefs.showFaq` + `FleetRender.setPrefs` + `ctx.onChange()`
  （builder render 只碰 overview/action-bar/points-box，不会关掉选择器）。

### 6. 一次性迁移

- 删除 `data/ships.json` / `data/squadrons.json` / `data/upgrades.json` / `data/titles.json`
  （data/ 只剩 config + objectives）；git 记为 `D`。
- `build_data.py` 迁移后重建验证：计数全部匹配上表、85 个 faq 字段与 7 张手工卡保留。

### 测试与验证

- `fleet_test.mjs`：mock 的 assets 分支补 `.json()`；新断言（46/82/61/183 总数、双阵营去重、
  `commander_002.faq` 含莫蒂且 effect 无 `[FAQ：`、`rebel_squadrons_010` faq 2 行且 effect 保留
  关键字块、`officer_028` 正文「1.5版FAQ」未被误拆）；指挥官选择器 FAQ 开关 UI 断言；修 37→41。
- `smoke_test.mjs` 按文件列表并发加载 + 去重；`dom_test.mjs` 导出数改 12 并校验 FAQ 编辑框。
- `node fleet_test.mjs` / `node objectives_test.mjs` / `node smoke_test.mjs`（8123 起服务）/
  `node dom_test.mjs` 全部通过；`grep data/(ships|squadrons|upgrades|titles).json` 无代码残留。

## 2026-08-26 · 清理：删除一次性提取源与脚本

- 删除 `assets/rebsquad.pdf`（义军中队 PDF 提取源，数据已存 `assets/squadrons/rebel/text.json`）。
- 删除 `assets/armada_officer_pdf_assets/`（图标嵌入参考源项目：extract_icons.py / armada-icons.js/css /
  demo.html / icon-map.json / icons/ 原图与 web 版），运行时图标库为 `js/fleet/armada-icons.js` + `icons/web/` 副本。
- 删除 `extract_rebel_squadrons.py`（依赖已删的 rebsquad.pdf）、`extract_objectives.py`（xlsx 源不在仓库）。
- 保留 `build_data.py` / `restrictions.py`（`build_data.py` import `restrictions`，构建活依赖）。
- 同步：`build_data.py` `build_objectives` docstring、README 目录树与 4 处引用改为「一次性提取，源脚本已清理」；
  `process.md` 历史条目保留不动。

## 2026-08-26 · 共和国/分离势力数据整理（去重 + 重编号 + 图片 + title 迁移）

用户更新了 `assets/upgrades/republic.json` / `separatist.json`（新增共和国/分离势力卡），要求：
(1) 确认 text.json 引用；(2) 查重复项；(3) 新卡图片链接关联到新增图片。

### 去重与重编号
- text.json 仍被 `build_data.py`（payloads 兜底）引用，保留。
- 重复项：separatist 46→39（去 7 张：8 张同名去 1 张占位 + 双阵营卡重排序），republic 35→34（去 1 张）。
- **关键 bug**：新卡沿用了帝国/义军/通用 id（commander_001-006、officer_001-008 等），
  合并去重按 id 丢卡 → `build_data.py` 曾把 sep 写成 14、rep 写成 5。恢复备份后重编号 63 张为全局唯一 id：
  sep commander_025-030 / officer_057-064 / defensive_retrofit_009 / ion_cannons_010-011 / fleet_support_008-009 /
  offensive_retrofit_017-019 / support_team_009 / fleet_command_009 / turbolasers_016 / title_011-020；
  rep commander_031-036 / officer_065-071 / defensive_retrofit_010 / fleet_support_010-011 / offensive_retrofit_020 /
  ordnance_009 / support_team_010 / weapons_team_018 / title_020-028。
  3 张双阵营卡（defensive_retrofit_008 / fleet_command_003 / turbolasers_012）保留两份按 id 去重。

### 图片链接
- 用户新增 46 张图：`assets/upgrades/{commander,officer}/{separatist,republic}/`（27 张）+ `assets/titles/{separatist,republic}/images/`（19 张）。
- 27 张指挥官/军官图已全部关联；`ion_cannons_010`/`turbolasers_016` 为同名克隆卡，共享图本就正确。
- 仍缺：7 张共和国非指挥官/军官/称号升级卡（指向 `assets/upgrades/<槽位>/republic/`，用户未提供）；
  另 ~10 张分离势力非指挥官/军官卡指向共享槽位图但卡名不同（占位，待用户给图）。

### title 卡迁移（结构修正）
- 19 张 title 卡原为 `type:"upgrade"`+`slot:"title"` 混在升级桶里——config 无 title 槽、title 从 `assets/titles/` 单独加载，
  两条路径都不可达（死数据）。按用户图片放置位置（`assets/titles/{sep,rep}/images/`）确认归属，
  迁移为 `type:"title"`、去掉 slot、图片指向 `assets/titles/<faction>/images/page_NNN_img_1.jpeg`（保留原页号）。
- 同步：`fleet-data.js` / `carddb/data.js` / `smoke_test.mjs` 的 titles 文件列表加 sep/rep；
  `build_data.py` `authoritative_cards` 与写出循环支持 4 阵营（写循环按实际存在的阵营、空阵营跳过）；
  `carddb/app.js` exportAll 按 `DB.ALL_FACTIONS` 切分、空阵营跳过，toast 计数动态。
- 计数变化：升级 244→225，称号 61→80；`fleet_test.mjs` 断言同步更新（升级总数 225、称号 80、
  title_011/title_028 是称号而非升级、title 图链接断言）；`dom_test.mjs` 导出 12→14 文件。
- 验证：`fleet_test.mjs` / `objectives_test.mjs` / `smoke_test.mjs`（服务器 8123）全绿；
  `build_data.py` 幂等（titles 31+30+10+9=80，upgrades 101+42+31+29+25=225，图片校验全过）。

### 2026-08-26 · 升级卡图回退修复（克隆共享页 / 用户补图）

用户指出：反应炮组/弹药补充/备件补充/超空间环/突击震荡导弹/辅助护盾机组/克隆人炮手 的卡图原本就有。
排查确认后统一修复 16 张图（separatist 9 + republic 7）：

- **同名克隆**（10 张）：卡为 neutral/imperial/rebel 已有卡的同名克隆，图指向克隆卡所在共享页——
  反应炮组→defensive_retrofit/005、弹药补充→fleet_support/004、备件补充→fleet_support/005、
  预备机库→offensive_retrofit/015、点防御离子炮→ion_cannons/008、防空炮→offensive_retrofit/007、
  突击震荡导弹→ordnance/001、辅助护盾机组→support_team/001（sep/rep 同名各一张）。
- **用户补图**（2 张）：超空间环→offensive_retrofit/images/page_017、克隆人炮手→weapons_team/images/page_018。
- **推断未引用页**（3 张，待用户目验）：超波段信号增强→offensive_retrofit/009、
  战斗机器人备品→support_team/002、绝地人质→fleet_command/005（该槽唯一未被现有卡引用的页，即新卡扫描位）。
- **保留不动**：commander_031 贝尔·奥加纳、officer_068 阿索卡·塔诺（与军官槽同名但为指挥官/共和国专属新图，非错图）；
  B2火箭→offensive_retrofit/003、SPHA-T→016、救灾任务→fleet_command/006 本就指向自身扫描页。
- 修复后 smoke_test `图片缺失: 无`；`build_data.py` 幂等保留改动；fleet_test 新增 7 条图关联断言。

### 2026-08-28 · 每舰升级卡唯一（通用规则）+ 常规战机去掉 4 架上限

用户要求：不改 JSON 直接加通用规则「同一张升级卡同一艘舰只能装一次」；常规战机 JSON 去掉 `limit:4`（unique 保持原样）。

- **每舰升级卡唯一（fleet-rules.js 代码层，不改数据）**：`canEquipUpgrade` 新增第 9 步
  `per-ship-duplicate`——目标槽（slotIndex）非指挥官/称号、且当前占用卡不是该卡（替换/重选自身不算重复）时，
  舰上 upgrades 已存在同 cardId 即拒绝，reason 文案「同一张升级卡在同一艘舰上只能装一次」。
  双槽卡两槽共享同 cardId 按一次安装计（兄弟槽 shared 不误报）；无 slotIndex（无法定位目标槽）时不判定，
  避免把重选已有卡误判为重复。文档注释、过滤顺序、reasonLabel 同步更新。
- **常规战机不封顶**：25 张普通（unique=false）中队 JSON 删除 `limit: 4`（imperial_squadrons_027-039、
  rebel_squadrons_026-037）；unique 保持 `limit: 1` 不动（规则仍走 squadron-unique 分支）。
  - `fleet-rules.js` `canEquipSquadron`：`const limit = card.limit || (card.unique ? 1 : 4)` → 仅 `card.limit`
    显式上限，无字段即不封顶。
  - `fleet-render.js`：`var limit = card.limit`，`atLimit = limit && count >= limit`（无 limit 不出现 is-max/禁用）。
  - `selectors.js`：`var limit = c.limit`，meta 显示「已带 n」（有 limit 才 `/limit`）。
- **测试**：fleet_test 更新（A翼/帝国普通中队无 limit、X翼第 6 个仍允许、数量步进器到 5 仍可继续、
  新增 per-ship 三断言：同舰第二同类型槽装同卡被拒 / 不同卡可装 / 重选自身槽位不误报；改装「可替换同一张」补 slotIndex）；
  计数断言随先前新增数据更新（舰船 46→47、称号 80→81，rebel 新增 神意级航母 + 诺提利安 称号）。
- 验证：`fleet_test.mjs` / `objectives_test.mjs` 全绿；`smoke_test.mjs`（8124）`图片缺失: 无`（47/82/225/81）；
  `dom_test.mjs`（8124）导出 14 文件。
