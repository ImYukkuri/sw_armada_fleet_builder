# 图标总表

> 汇总项目内全部图标，供开发与数据录入时查阅。本项目有**两套独立图标系统**，勿混用。

---

## 一、两套图标系统

| 系统 | 用途 | 文件位置 | 用法 |
|------|------|----------|------|
| **行内转义图标**（ArmadaIcons） | 卡面「效果文本」里的内嵌小图标（指令 / 防御标记 / 升级槽 / 骰子面等） | `icons/web/*.png`（RGBA 剪影）+ `assets/*.svg`（升级槽图标直接复用） | `[[icon:<id>]]` token |
| **槽位图标**（Slot SVG） | 写表器 UI 的槽位行、舰船选择卡的槽位图标 | `assets/*.svg`（`fill=currentColor`） | `data.slotIcon(slotId)` |

- 行内图标由 `js/fleet/armada-icons.js` 渲染：`[[icon:<id>]]` → `<span class="armada-icon armada-icon--<id>">`，用 CSS `mask-image` + `background-color: currentColor` 上色（跟随字体颜色）。
- 槽位图标由 `js/fleet/fleet-data.js` 的 `loadIcons()` 读入 `db.icons`，`slotIcon()` 返回内联 SVG。

---

## 二、行内转义图标（28 个）

### 指令 Command（5）

| id | 中文标签 | 图片文件 | token |
|----|----------|----------|-------|
| `command-squadron` | 中队指令 | `command-squadron.png` | `[[icon:command-squadron]]` |
| `command-concentrate-fire` | 集火指令 | `command-concentrate-fire.png` | `[[icon:command-concentrate-fire]]` |
| `command-repair` | 维修指令 | `command-repair.png` | `[[icon:command-repair]]` |
| `command-navigate` | 导航指令 | `command-navigate.png` | `[[icon:command-navigate]]` |
| `command-any` | 任意指令 | `command-any.png` | `[[icon:command-any]]` |

### 防御标记 Defense Token（6）

| id | 中文标签 | 图片文件 | token |
|----|----------|----------|-------|
| `defense-evade` | 回避防御标记 | `defense-evade.png` | `[[icon:defense-evade]]` |
| `defense-contain` | 防控防御标记 | `defense-contain.png` | `[[icon:defense-contain]]` |
| `defense-redirect` | 传导防御标记 | `defense-redirect.png` | `[[icon:defense-redirect]]` |
| `defense-salvo` | 奇袭防御标记 | `defense-salvo.png` | `[[icon:defense-salvo]]` |
| `defense-brace` | 抑制防御标记 | `defense-brace.png` | `[[icon:defense-brace]]` |
| `defense-scatter` | 驱散防御标记 | `defense-scatter.png` | `[[icon:defense-scatter]]` |

### 升级槽 Upgrade（14）

前 3 个用 PNG（`icons/web/*.png`），其余 11 个直接复用槽位 SVG（`assets/*.svg`）作 mask。

| id | 中文标签 | 图片文件 | token |
|----|----------|----------|-------|
| `upgrade-commander` | 指挥官升级 | `upgrade-commander.png` | `[[icon:upgrade-commander]]` |
| `upgrade-officer` | 士官升级 | `upgrade-officer.png` | `[[icon:upgrade-officer]]` |
| `upgrade-defensive-retrofit` | 防御改装升级 | `upgrade-defensive-retrofit.png` | `[[icon:upgrade-defensive-retrofit]]` |
| `upgrade-fleet-support` | 舰队支援升级 | `fleet-support.svg` | `[[icon:upgrade-fleet-support]]` |
| `upgrade-support-team` | 支援小组升级 | `support-team.svg` | `[[icon:upgrade-support-team]]` |
| `upgrade-fleet-command` | 舰队指挥升级 | `fleet-command.svg` | `[[icon:upgrade-fleet-command]]` |
| `upgrade-weapons-team` | 武器小组升级 | `weapons-team.svg` | `[[icon:upgrade-weapons-team]]` |
| `upgrade-ion-cannons` | 离子炮升级 | `ion-cannon.svg` | `[[icon:upgrade-ion-cannons]]` |
| `upgrade-offensive-retrofit` | 进攻改装升级 | `offensive-retro.svg` | `[[icon:upgrade-offensive-retrofit]]` |
| `upgrade-ordnance` | 军械升级 | `ordnance.svg` | `[[icon:upgrade-ordnance]]` |
| `upgrade-turbolasers` | 涡轮激光升级 | `turbolaser.svg` | `[[icon:upgrade-turbolasers]]` |
| `upgrade-experimental-retrofit` | 实验改装升级 | `experimental-retro.svg` | `[[icon:upgrade-experimental-retrofit]]` |
| `upgrade-superweapon` | 超级武器升级 | `super-weapon.svg` | `[[icon:upgrade-superweapon]]` |
| `upgrade-title` | 称号 | `title.svg` | `[[icon:upgrade-title]]` |

### 骰子面 Dice（3）

| id | 中文标签 | 图片文件 | token |
|----|----------|----------|-------|
| `attack-critical` | 暴击标志 | `attack-critical.png` | `[[icon:attack-critical]]` |
| `attack-hit` | 命中标志 | `attack-hit.png` | `[[icon:attack-hit]]` |
| `attack-accuracy` | 精确标志 | `attack-accuracy.png` | `[[icon:attack-accuracy]]` |

---

## 三、中文标签 → 图标 id（自动转换映射）

此映射在**两处**维护，必须保持一致：
- `build_data.py` 的 `ICON_LABEL_MAP`（构建时把「3+ 空格 + 标签」固化为 token）
- `js/fleet/armada-icons.js` 的 `labelToIcon`（运行时兜底固化）

| 文本标签 | 图标 id |
|----------|---------|
| 中队 | `command-squadron` |
| 集火 | `command-concentrate-fire` |
| 维修 | `command-repair` |
| 导航 | `command-navigate` |
| 任意 | `command-any` |
| 回避 | `defense-evade` |
| 防控 | `defense-contain` |
| 抑制 | `defense-brace` |
| 传导 | `defense-redirect` |
| 奇袭 | `defense-salvo` |
| 驱散 | `defense-scatter` |
| 指挥官 | `upgrade-commander` |
| 士官 | `upgrade-officer` |
| 防御改装 | `upgrade-defensive-retrofit` |
| 舰队支援 | `upgrade-fleet-support` |
| 支援小组 | `upgrade-support-team` |
| 舰队指挥 | `upgrade-fleet-command` |
| 武器小组 | `upgrade-weapons-team` |
| 离子炮 | `upgrade-ion-cannons` |
| 进攻改装 | `upgrade-offensive-retrofit` |
| 军械 | `upgrade-ordnance` |
| 涡轮激光 | `upgrade-turbolasers` |
| 实验改装 | `upgrade-experimental-retrofit` |
| 超级武器 | `upgrade-superweapon` |
| 称号 | `upgrade-title` |
| 暴击 | `attack-critical` |
| 命中 | `attack-hit` |
| 精确 | `attack-accuracy` |

> ⚠️ 历史坑：`抑制` = **Brace**（减半伤害），`防控` = **Contain**（挡暴击效果），两者不同。此前「抑制」被误映射到 `defense-contain`，已修正为 `defense-brace`。

---

## 四、槽位图标（14 个 SVG）

`assets/<name>.svg`，通过 `data.slotIcon(slotId)` 取用（映射在 `fleet-data.js` 的 `SLOT_ICON_FILES`）。

| 槽位 id | 中文名 | SVG 文件 |
|---------|--------|----------|
| `commander` | 指挥官 | `commander.svg` |
| `defensive_retrofit` | 防御改装 | `defensive-retro.svg` |
| `experimental_retrofit` | 实验改装 | `experimental-retro.svg` |
| `fleet_command` | 舰队指挥 | `fleet-command.svg` |
| `fleet_support` | 舰队支援 | `fleet-support.svg` |
| `ion_cannons` | 离子炮 | `ion-cannon.svg` |
| `offensive_retrofit` | 进攻改装 | `offensive-retro.svg` |
| `officer` | 军官 | `officer.svg` |
| `ordnance` | 军械 | `ordnance.svg` |
| `superweapon` | 超级武器 | `super-weapon.svg` |
| `support_team` | 支援小组 | `support-team.svg` |
| `turbolasers` | 涡轮激光 | `turbolaser.svg` |
| `weapons_team` | 武器小组 | `weapons-team.svg` |
| `title` | 称号 | `title.svg` |

---

## 五、阵营徽记（4 个 SVG）

`assets/<id>.svg` 是徽记源文件，已内联进 `js/factions.js` 的 `FACTIONS.<id>.emblem`（运行时不再 fetch）。

| id | 中文名 | SVG 文件 |
|----|--------|----------|
| `imperial` | 帝国 | `empire.svg` |
| `rebel` | 义军 | `rebel.svg` |
| `republic` | 共和国 | `republic.svg` |
| `separatist` | 分离势力 | `separatist.svg` |

---

## 六、防御标记规则（`fleet-rules.js` 的 `DEFENSE_TOKEN_RULES`）

供中队 tag / 浮窗展示防御标记效果时查用。

| id | 中文 | 英文 | 效果 |
|----|------|------|------|
| `evade` | 回避 | Evade | 远射程时取消 1 颗攻击骰；中/近射程时重投 1 颗攻击骰。 |
| `redirect` | 传导 | Redirect | 选一个相邻船体区，先由该区护盾代扣伤害，余下由受击区承受。 |
| `contain` | 防控 | Contain | 攻击方无法结算标准暴击效果（仍可结算非标准暴击效果）。 |
| `salvo` | 奇袭 | Salvo | 防御方可在攻击「结算伤害」步骤后发起 1 次奇袭攻击。 |
| `brace` | 抑制 | Brace | 伤害在「结算伤害」步骤加总时减半（向上取整）。 |
| `scatter` | 驱散 | Scatter | 防御方取消所有攻击骰。 |

---

## 七、怎么用

### 行内转义图标（效果文本里）

任选一种：
1. JSON 里直接写 token：`…[[icon:attack-critical]]暴击…`
2. 源文本写「3+ 空格 + 中文标签」（如 `   暴击`），跑 `python build_data.py` 自动固化为 token。
3. 前端调用 `ArmadaIcons.toHtml(text)` 渲染成 `<span class="armada-icon armada-icon--attack-critical">`。

### 槽位图标（写表器 UI 里）

- `data.slotIcon("officer")` 返回内联 SVG，已用于 `fleet-render.js` 的 `slotRow()` 与 `selectors.js` 的 `shipSlotIcons()`。

### 防御标记规则（tag / 浮窗里）

- `FleetRules.defenseTokenRule("brace")` → `{ nameZh, nameEn, effect }`。

---

## 附：图标清单速查

- 行内转义图标：**28 个**（指令 5 + 防御标记 6 + 升级槽 14 + 骰子面 3）
- 槽位图标：**14 个** SVG
- 阵营徽记：**4 个** SVG
