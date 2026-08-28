# 星球大战：无敌舰队 · 写表器

本地舰队写表器（静态 HTML 项目，无构建依赖）。

## 当前阶段

- **主页面 `index.html`**：4 势力选择（帝国 / 义军 / 银河共和国 / 分离势力同盟）；卡片用官方阵营徽记（`assets/*.svg` 内联、`currentColor` 随卡片取色）与官方配色（共和红 `#C43030` / 分离蓝 `#305B91` / 帝国黑 `#373B3E` / 橙红 `#D25C30`，深色阵营提亮徽记保证可读），手机端一行 2 卡
- **写表页面 `builder.html`**：舰队构建器（选舰 / 指挥官 / 称号 / 升级 / 中队 / 任务卡，实时分数与合法性校验；指挥官上舰显示、双槽位升级卡、加槽位升级卡（装备后追加槽位、删除时清理）、全局 unique 同名拦截、转义图标随字体颜色）
- **任务卡一览 `objectives.html`**：全部任务卡检索（进攻 / 防御 / 导航三类，卡图 + 中文规则 + 英文原文）
- **卡牌资料库 `carddb.html`**：浏览 / 编辑 / 导出全部卡牌数据

## 目录结构

```
list-builder/
├── index.html          # 主页面：势力选择
├── builder.html        # 写表页面：舰队构建器
├── objectives.html     # 任务卡一览：按类别检索全部任务卡
├── carddb.html         # 卡牌资料库：浏览 / 编辑 / 导出 JSON
├── css/style.css       # 通用样式（暗色星战主题）
├── css/carddb.css      # 卡牌资料库样式（移动优先）
├── css/builder.css     # 写表器样式（移动全屏选择器 / 桌面抽屉）
├── css/objectives.css  # 任务卡一览样式
├── css/armada-icons.css # Armada 图标字库样式（行内小图标，CSS mask + currentColor 随字体上色）
├── icons/web/          # Armada 图标字库：12 类 64×64 图标（PDF 嵌入小图，web 版）
├── js/factions.js      # 阵营数据：名称 / 主题色 / 徽记
├── js/factions.js      # 阵营数据：名称 / 主题色 / 徽记
├── js/main.js          # 主页面渲染逻辑
├── js/builder.js       # 写表器引导：读 ?faction=、加载数据、接线选择器、渲染
├── js/fleet/           # 写表器核心模块（Fleet 数据流：State → Render → Action）
│   ├── lightbox.js         # 图片大图查看（全站卡图点击放大，svg 图标除外）
│   ├── armada-icons.js     # Armada 图标字库（PDF 提取占位 → 行内图标，一次提取的副本）：
│   │                       #   3+ 空格占位→token→<img>；toHtml 字符串式渲染 / render DOM 版
│   ├── fleet-data.js       # 加载 data/config+objectives + assets 拆分卡牌文件 + 槽位 SVG 图标 + 查找 API
│   ├── fleet-state.js      # Fleet State：唯一数据真相（可序列化，task.md §28）
│   ├── fleet-rules.js      # 规则引擎：canEquipUpgrade → {allowed, reasons}
│   ├── fleet-calculator.js # 点数计算（舰船+指挥官+称号+升级，任务卡不计）
│   ├── fleet-render.js     # 总览渲染（舰船 / 中队 / 任务卡三节）
│   └── selectors.js        # 选择器（移动全屏 / 桌面抽屉，同一 DOM）
├── js/carddb/data.js   # 数据加载层：fetch data/config + assets 拆分卡牌文件，按 id 去重
├── js/carddb/app.js    # 卡牌资料库：状态 + 渲染、编辑表单、JSON 导出（14 个拆分文件）
├── js/objectives/app.js    # 任务卡一览：分类 tab + 卡片网格 + 详情弹层
├── data/               # 不拆分 / 需要聚合的公共数据（其余卡牌已按阵营拆分到 assets/）
│   ├── config.json     #   阵营 / 升级槽 / 舰船规模 配置
│   └── objectives.json #   任务卡 36 张（规则 / 翻译 / 卡图路径）
├── points_map.json     # 持久化点数表（卡 id -> {points, en, banned?}），build_data.py 合并用
├── build_data.py       # 数据管线：assets/ 各 text.json → assets/ 拆分卡牌文件 + 合并点数 + 限定解析
├── restrictions.py     # 解析「限定」子句 → restrictions（阵营/规模/舰船/旗舰/称号）
├── fleet_test.mjs      # 写表器冒烟测试（DOM stub，真实跑 builder.js 全流程）
├── objectives_test.mjs # 任务卡一览冒烟测试
└── assets/             # 卡牌资料库源文件（全英文小写路径）
    ├── ships/          # 舰船（按阵营）
    │   ├── imperial/   #   帝国 24 艘
    │   └── rebel/      #   义军 22 艘
    ├── squadrons/      # 中队（按阵营）
    │   ├── imperial/   #   帝国 41 个
    │   └── rebel/      #   义军 41 个（含 unique/ace/nameEn，源自 BattleScribe）
    ├── upgrades/       # 升级卡（按槽位类型的 text.json 源 + 按阵营归属的拆分输出）
    │   ├── commander/ … superweapon/   # 13 种槽位源目录（text.json + images/）
    │   ├── neutral.json     #   101 张 通用（四阵营都允许）
    │   ├── imperial.json    #   42 张（银河帝国限定）
    │   ├── rebel.json       #   31 张（义军同盟限定）
    │   ├── separatist.json  #   7 张（含 3 张双阵营卡，与 republic 重复）
    │   └── republic.json    #   5 张（含 3 张双阵营卡，与 separatist 重复）
    ├── titles/         # 称号（与升级卡平级，按阵营）
    │   ├── imperial/   #   帝国 31
    │   └── rebel/      #   义军 30
    └── objectives/     # 任务卡（一次性提取，源脚本已清理）
        ├── text.json   #   规则 / 翻译
        └── images/     #   36 张卡图
```

每个叶子目录内含 `text.json`（卡牌数据，PDF 提取源）与 `images/`（卡图，`image` 字段为相对本目录的路径）。
`build_data.py` 从这些源**按阵营拆分**写出卡牌数据：
`ships/squadrons/titles` → `assets/<type>/<faction>/cards.json`；`upgrades` → `assets/upgrades/<neutral|阵营>.json`
（双阵营升级卡 `defensive_retrofit_008` / `fleet_command_003` / `turbolasers_012` 写两份，JS 加载器按 id 去重）。
`data/` 只保留 `config.json` 与 `objectives.json`。
舰船 `slots` 数组的取值与 `upgrades/` 目录名一一对应，可直接用文件名匹配槽位。

每个叶子目录内含 `text.json`（卡牌数据）与 `images/`（卡图，`image` 字段为相对本目录的路径）。
舰船 `slots` 数组的取值与 `upgrades/` 目录名一一对应，可直接用文件名匹配槽位。

## 使用

用浏览器直接打开 `index.html`，或本地起个静态服务（写表器 / 任务卡 / 资料库均需 fetch，**必须本地服务器**）：

```bash
cd list-builder
python -m http.server 8000
# 访问 http://localhost:8000/
```

写表页面通过 URL 参数传递阵营：`builder.html?faction=imperial`（取值：`imperial` / `rebel` / `republic` / `separatist`）。

## 卡牌资料库（carddb.html）

> 数据通过 `fetch` 加载，**必须本地起服务器**访问（`file://` 直接打开会失败）：

```bash
cd list-builder
python -m http.server 8000
# 打开 http://localhost:8000/carddb.html
```

功能：
- **浏览**：首页分「舰船 / 中队 / 升级卡 / 称号」四类；列表按阵营或升级槽位分组（升级卡按 13 种槽位，其余按 4 阵营）
- **编辑**：中文名 / 英文名 / 类型 / 阵营 / 分数 / 中文效果 / **FAQ·勘误**（独立 `faq` 字段，多行换行分隔）；舰船另有「舰船规模」与「升级槽」编辑器（可增、可删、可重复，不做去重）；升级卡可改槽位。编辑页顶部「显示 FAQ 预览」开关（默认关）控制只读 FAQ 预览块
- **保存机制**：读取 JSON → 内存编辑 → 导出 JSON。本阶段不改写服务器文件
- **导出**：顶栏「导出 JSON」按阵营拆分下载 **14 个文件**——`config.json` + `ships/squadrons` 各 2 个、`titles` 各 4 个（`<type>_<faction>.json`，空阵营跳过，覆盖到 `assets/<type>/<faction>/cards.json`）+ 升级卡 5 个（`upgrades_<neutral|imperial|rebel|separatist|republic>.json`，双阵营卡写两份）；覆盖到对应 `assets/` 目录即完成「保存」（覆盖后再跑 `build_data.py` 也会从这些文件继续，不会丢编辑）
- **分数约定**：328 张卡牌已全部录入 AMG Armada 1.5 最终官方点数（整数，存于 `points_map.json`，`build_data.py` 合并进拆分后的卡牌文件）。1.5 官方禁卡 2 张（战略顾问 / 贝尔·奥加纳）带 `banned: true`；普赖斯总督经 RRII（2023）再版效果重做已解禁（6 分）。未录入的分数仍为 `null`，导出时空字段不自动填 `0`

数据由 `build_data.py` 从 `assets/` 各 `text.json` 生成，改了源文件后重新执行即可（幂等，可重复运行）：

```bash
cd list-builder
python build_data.py
```

`build_data.py` 的职责：
- 把效果文本里的「3+ 空格 + 中文标签」占位（PDF 提取残留，宽度实测 3–5 空格，源文本从不出现 2 空格）固化为 `[[icon:<id>]]` token（`solidify_icons()`），供 `ArmadaIcons.toHtml` 渲染为行内图标；无图标标签（精确 / 驱散 / 命中 等）只清占位、保留自然中文。图标字库为一次提取的副本（源项目已随仓库清理删除）
- **FAQ / 勘误拆分**：把 effect 内嵌的编辑注释 `[FAQ：…]` / `[勘误：…]` / `[1.5勘误：…]`（86 处 / 85 张卡）剥离为独立 `faq` 字段，控制显示（对齐 `objectives.json` 已有的 `faq`）。段内 `[[icon:…]]` 双括号按 ±2 计深度找闭合，普通 `[` / `]` 按 ±1，图标 token 保留
- **按阵营拆分写出**：`ships/squadrons/titles` → `assets/<type>/<faction>/cards.json`（按 `faction` 字段）；升级卡按允许阵营集合（镜像 `cardFactionAllowed`：`restrictions.factions` 优先 → `faction` → 全阵营=neutral）写入 `assets/upgrades/` 各文件
- **数据源优先级**：`data/<cat>.json`（旧工作流）> 已拆分的 assets 文件（新工作流，carddb 导出覆盖处）> 从 text.json 再生（全新检出）。所以覆盖 assets 后再跑也不会丢手工卡 / 编辑；要彻底从 PDF 源重生成，先删除对应 assets 拆分文件再跑

## 写表器（builder.html）

舰队构建器，数据流遵循 `Fleet State → Render → User Action → Update State → Render`（task.md §27）。

### 功能

- **总览**：指挥官块（若选了，顶部居中）→ 舰船 / 中队 / 任务卡三节；舰船条目 = 卡图 + 名称/规模 + 本舰总分 + 删除，升级槽**仅以图标集中成横排**——指挥官 + 普通升级槽 + 称号（永远最后），已装备的槽位图标变暗，已装备的升级卡/称号作为条目显示在舰船下方（指挥官也在**旗舰条目**里重复显示，带「指挥官」标签）。桌面端总览常驻（§5）
- **槽位式添加**：`＋ 添加舰船` / `＋ 添加中队` 按钮放在对应列表末尾；底部操作条显示总分
- **实时点数**：舰队总分显示在**标题下方、页面居中**；底部操作条、各选择器顶部点数条同步显示 `当前 / 400`；超限变红并提示「超出限制」（§24/25）。舰船 / 指挥官 / 称号 / 升级计入分数，**任务卡不计分**
- **中队分数软上限**：中队总分为舰队分数 **1/3（向上取整）**（400 分 → 134）。超限时中队节标题标红并提示「超出中队上限」，为软性限制——不阻止添加
- **选择器**：移动端 `position: fixed` 全屏覆盖（100vw/100vh），桌面端切换为右侧 400px 抽屉（§32/33）。选完即关并刷新
- **大图卡片**：选择器卡片左图右文——左侧卡图占比更高、最大 190px（`object-fit: contain` 全显示），右侧卡名/效果**全文显示不截断**，最右侧独立大号分数；舰船选择卡下方另有一行槽位图标（指挥官 / 称号 + 各升级槽）
- **行内图标**：效果文本中的指令 / 防御标记 / 升级槽 / 暴击等图标，以 `ArmadaIcons` 字库渲染为行内小图标（`[[icon:...]]` token → `<span class="armada-icon armada-icon--<id>">`，**颜色用 CSS mask + `background-color: currentColor` 跟随字体颜色**，深色/浅色主题都一致）；数据 JSON 的「3+ 空格+标签」占位已由 `build_data.py` 固化为 token，纯文本「暴击」（[crit] 骰面，无占位也按图标处理）同样无条件转 token，前端 `ArmadaIcons` 再兜底一次（179 个 token / 111 张卡）
- **卡图优先**：所有卡图（除 SVG 槽位图标外）`object-fit: contain` 全显示不变形，点击即放大（Lightbox，遮罩 / 关闭钮 / Esc 关闭）
- **规则引擎 `FleetRules.canEquipUpgrade`**（§14）：返回 `{allowed, reasons}`，按 槽位（双槽卡 `slots` 任一可进）→ 阵营 → **dual-slot（双槽卡需两槽都在舰船上且都空闲）** → 规模 → 舰船 id/名称 → 旗舰 → modification-limit（每舰 1 张改装）→ 指挥官（舰队级）→ unique-name（全局同名）→ **per-ship-duplicate（通用：同一张升级卡在同一艘舰上最多一次，跨槽位）** → **dual-locked（双槽卡占用的槽位不可替换，须先删除）** → **adds-slots（加槽卡卡面写明「已有该槽则不能装备」时拒绝）** 顺序校验
- **中队上限 `FleetRules.canEquipSquadron`**：阵营校验后按数量限制——**独特单位（unique）全舰队仅限 1 个**（reason `squadron-unique`），其余仅受**显式 `card.limit`** 约束（常规战机 JSON 已去掉 `limit` 字段 = 不封顶；王牌单位仍可写 `limit`）；选择器按 `allowed` 过滤并显示 `独特/王牌 · 已带 n(有 limit 时 /limit) · x 分`；跨卡牌类型同名 unique 冲突时该中队标红 + 提示
- **中队数量调节**：非 unique 非 ace 的普通中队在总览合并为**单卡 + `− 数量 ＋` 步进器**（仅当显式 `card.limit` 且达上限时 `＋` 禁用标红，无 limit 不封顶，点数按 点数×数量 显示），`×` 整组删除；unique / ace 单卡无步进器。舰船不套用此逻辑
- **限制数据 `restrictions`**：由 `restrictions.py` 从卡面「限定」子句解析（阵营 / 规模 / 舰船 / 舰船特性 / 需要旗舰 / 限定称号），写入每张升级卡 / 称号卡；title 的舰船限制以 `assets/titles/*/text.json` 的 **`shipId` 字段为权威**（用户维护，覆盖文本解析）
- **指挥官（舰队级 + 槽位图标 + 上舰）**：`fleet.commander` 全舰队仅 1 名，存舰队级（不塞入舰船）；选中它的舰船为**旗舰**，点数计入旗舰。未选时**每艘舰**的槽位横排都显示指挥官槽图标；选中后其它舰的指挥官槽**隐藏**（删除后恢复），旗舰槽图标变暗。指挥官块显示在**总览顶部居中**（卡图裁上半部分，点击 Lightbox 放大，可更换 / 删除）；同时指挥官卡也作为**旗舰的装备条目**显示（带「指挥官」标签，一眼看出在哪个船）。指挥官仅限阵营（无规模/舰船限制）
- **称号（槽位图标 + 独特）**：每舰最多 1 个，槽位图标**永远排在其他升级槽之后**（已装备变暗，舰船下方显示称号条目）；独特称号**舰队级唯一**（按 nameEn 全局同名，跨舰不可重选，删除后恢复）
- **全局 unique（按 nameEn）**：unique 卡对所有槽位生效——以 `nameEn` 的 `•` 前缀判定，跨 **指挥官 / 称号 / 升级 / 中队 / 舰船** 同名不可重复（如指挥官、军官、双槽武器小组 三个 `•Darth Vader` 互相挡住）。选择界面同名卡**标红不可用**并提示「舰队中已存在同名卡：[槽位名]中文名」；重选/替换本槽同一张不误报（排除当前占用卡）
- **双槽位升级卡**：6 张「武器小组 / 进攻改装」双槽卡（查姆 辛杜拉、琴 厄索、施里夫 苏尔加夫、登舰工兵、登舰步兵、达斯 维达）在自身任一槽的选择界面都出现（`metaOf` 显示「武器小组 / 进攻改装」）。舰船同时有这两个槽且**都空闲**时，装备后**同时占用两个槽位**（兄弟槽 `shared`，点数只计一次，条目只显示一次）；**任一侧被占则双槽卡不可选**（标红 + 提示另一槽已占用）。**双槽卡占用时两槽都不可替换**（槽位图标与更换按钮禁用，另一张双槽卡 / 单槽卡 / 同一张一律拒绝），只能先删除整组（两槽重新开放）再重新装备
- **改装（按自身槽 + 每舰 1 张）**：`modification: true/false` 为**数据字段**（`build_data.py` 标定 18 张，非运行时解析），卡面标签位「改装」前缀已在构建时剥离（正文语义保留）；改装卡按自身升级类型出现在对应槽位选择界面（`sel-meta` 显示「改装」徽章），**不是独立槽位**——每舰最多 1 张，已装改装的舰再开选择器时其它改装卡**边框变红**并提示「每艘船只能有一个改装类组件」（不可选），普通卡不受影响
- **加槽位升级卡**：7 张卡（旗舰舰桥→舰队指挥、图阿部长→防御改装、喷火兽号→舰队指挥、蹂躏号→支援小组、解放者号→舰队指挥、前卫号→武器小组、凤凰之巢号→军官）带 `addsSlots:[...]` 数据字段，装备后**给舰船追加对应升级槽位**（选择器 `sel-meta` 显示「增加槽位:XX」，槽位图标标注「（称号添加）/（升级添加）」），追加的槽位可正常装对应卡。**仅卡面写明「已有该槽则不能装备」的卡**（喷火兽号 / 解放者号 / 图阿部长，`addsSlotsReject`）拒绝已拥有该槽的战舰（标红 + 提示「该舰已有升级槽位：XX，此卡（卡面限制）不可装备」；图阿部长仅对中型/大型生效）；其余加槽卡允许额外/重复槽。**删除加槽卡时其添加的子槽连同槽内组件一并清理**，不留孤儿组件；称号换装时 `addedBy: "title"` 的子槽整组清理
- **任务卡**：每个军表 3 个任务槽（进攻 / 防御 / 导航），点槽后按类别筛选选择（assault / defense / navigation）；任务选择卡**内联全部规则段落**（布设/特殊规则/回合结束/游戏结束/FAQ，图标渲染）；选择器顶部有「显示英文 / 显示FAQ」两个开关（**默认关闭**，打开后才显示英文原文与 FAQ）
- **FAQ / 勘误显示开关**：所有卡类选择器（舰船 / 中队 / 升级 / 称号 / 任务）顶部都有「显示FAQ」复选框（**默认关闭**）——打开后卡上才显示独立 `faq` 段（含行内图标，多行换行分隔），任务卡另有「显示英文」开关。总览已装备条目也随开关刷新；「显示英文」仅任务选择器有
- **同舰重复**：用 `instanceId` 区分同一卡牌的多个实例（§4）
- **军表结构**：`JSON.stringify(fleet)` 即得可序列化军表（`version:1`，含 ships / squadrons / objectives / commander，§28）
- **军表存取（保存格式 v2 / `FleetIO`）**：底部操作栏「导出 JSON / 压缩分享 / 导入 / 清空」。保存格式 v2（`SAVE_VERSION=2`）只存已装备槽——原生槽 `{slotIndex, cardId}`、加槽子槽额外带 `slotId+addedBy`；不存 `instanceId`（导入重编号）、不存 `shared`（按双槽卡重新派生）、指挥官挂载用 `commanderShipIndex` 指向 ships 下标。压缩格式 = `"FA2:" + base64(gzip(json))` 可复制字符串。**导入**明文 JSON 与压缩串都能识别，走同一管线 `FleetIO.importFromText`：只做结构性校验（卡存在 / 阵营 / 槽位类型吻合），**不重跑规则引擎**；槽位按类型恢复（双槽、加槽子槽、称号子槽），文件意图槽位不满足时按类型归位并补 `slot-rematched` 警告；未知舰船整艘跳过、未知升级/阵营不符仅该卡跳过，均进警告清单。跨版本：`version>2` 拒绝并提示升级、`version<2` 自动归一。**localStorage 自动存档**：每次渲染后写 `armada.fleet.autosave.<faction>`（明文 JSON），刷新自动恢复；返回阵营选择页（index.html）或点「清空」时清除本阵营存档。**跨阵营导入**不拒绝——切到目标势力页（`builder.html?faction=<目标>`），通过 `sessionStorage` 中转原始文本，等目标页数据加载完（进度条）再载入；加载进度条由 `FleetData.load(onProgress)` 按类回调驱动

### 数据覆盖

- 帝国：舰船 24 / 称号 31 / 中队 41 / 全部升级（另有独立 42 张帝国升级卡）
- 义军：舰船 22 / 称号 30 / 中队 41 / 部分升级（另有独立 31 张义军升级卡）
- 共和国：舰船 13（手工录入，含 猎兵/欢呼者/领事级/阿奎腾斯/佩尔塔/胜利I，图片 13 张）/ 称号 9 / 升级 25 张（含 3 张双阵营卡）；分离势力：称号 10 / 升级 29 张（含 3 张双阵营卡）；通用升级卡 neutral 101 张（四阵营都允许）
- **缺口**：分离势力舰船与中队、共和国中队（加载器已容错：缺失的阵营文件自动跳过，录入后自动出现）；升级卡图片已全部关联（同名克隆→共享页、新增页→扫描图）；部分升级阵营仍为通用，待人工核对
- 1.5 禁卡 2 张（战略顾问 / 贝尔·奥加纳）带 `banned: true`，写表器暂未接入禁用逻辑

## 任务卡一览（objectives.html）

- 顶部 3 个分类 tab（进攻 / 防御 / 导航，各 12 张），点击切换；tab 下方有「显示英文 / 显示FAQ」两个开关（**默认关闭**，控制网格卡与详情弹层的英文原文 / FAQ 显示）
- 卡片网格内联全部规则段落（布设 / 特殊规则 / 回合结束 / 游戏结束 / FAQ，图标渲染）+ 英文原文；详情弹层展示中文规则与英文原文（可折叠）
- 数据来自 `assets/objectives/text.json`（从 `Armada_规则简述和任务卡翻译_BY_Remo.xlsx` 一次性提取，源脚本已清理）

## 下一阶段规划（待定）

- 1.5 禁卡（`banned`）与重复卡唯一性接入写表器规则（§37 预留项）
- 补充共和国 / 分离势力舰船与中队数据（称号已完成：分离势力 10 / 共和国 9）
- 升级卡阵营 101 张 neutral 待人工核对（部分实为共和国/分离势力卡）
