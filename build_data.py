# -*- coding: utf-8 -*-
"""把 assets/（卡牌资料库）汇总为 data/ 下的统一 JSON，供 Card Database 模块加载。

- config.json     公共枚举（阵营 / 升级槽 / 规模）
- ships.json      舰船（type=ship）
- squadrons.json  中队（type=squadron）
- upgrades.json   升级卡（type=upgrade，带 slot 字段）
- titles.json     称号（type=title）
- objectives.json 任务卡（type=objective，由 assets/objectives/text.json 汇总）

兼容层说明：
- 舰船 JSON 已是增强结构（id/faction/nameEn/size/slots），直接采用；补 type/points/effect。
- 中队/升级卡/称号仍是原始 pages:{ID,name,content,image} 结构：
    * id      —— 按 "{来源}_{页码}" 生成稳定 id
    * faction —— 中队/称号取自目录（imperial/rebel）；升级卡从 content 开头推导（帝国/义军）
    * name    —— 去掉前导 "·" 并把换行折叠为空格
    * points  —— 缺失统一 null（未录入）
    * effect  —— 取自 content
图片路径改写为相对项目根目录（assets/<分类>/<叶>/images/...）。

不要在未记录的数据上填 0。null 表示“尚未录入”。
"""
import json
import os
import re

import restrictions

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ROOT, "assets")
DATA_DIR = os.path.join(ROOT, "data")
os.makedirs(DATA_DIR, exist_ok=True)

# ---------- Modification（改装 trait） ----------
# 经核对 assets/upgrades/*/text.json，以下升级卡属于 Modification（卡面含“改装”类型标签，
# 且不是“防御改装/进攻改装”等槽位名）。这是数据字段（task.md §4），不做运行时文本解析。
MODIFICATION_CARDS = {
    "defensive_retrofit_006", "ion_cannons_002",
    "offensive_retrofit_001", "offensive_retrofit_006", "offensive_retrofit_010",
    "offensive_retrofit_016",
    "ordnance_003", "ordnance_007",
    "superweapon_001", "superweapon_002",
    "turbolasers_001", "turbolasers_003", "turbolasers_004", "turbolasers_008",
    "turbolasers_009", "turbolasers_010", "turbolasers_011", "turbolasers_012",
}

# 双槽位升级卡（官方法则）：weapons_team 与 offensive_retrofit 皆可装备。
# 数据字段 slots = [主槽, 备槽]；装备时若舰船两槽皆空闲则同时占用（见 fleet-state setUpgrade）。
DUAL_SLOT_CARDS = {
    "weapons_team_002": ["weapons_team", "offensive_retrofit"],  # 达斯 维达
    "weapons_team_004": ["weapons_team", "offensive_retrofit"],  # 查姆 辛杜拉
    "weapons_team_005": ["weapons_team", "offensive_retrofit"],  # 琴 厄索
    "weapons_team_006": ["weapons_team", "offensive_retrofit"],  # 施里夫 苏尔加夫
    "weapons_team_016": ["weapons_team", "offensive_retrofit"],  # 登舰工兵
    "weapons_team_017": ["weapons_team", "offensive_retrofit"],  # 登舰步兵
}

# 增加槽位的升级卡：addsSlots = 装备后给战舰增加的升级槽位 id（字段说明增加哪些槽位）。
# addsSlotsReject（可选，仅卡面明确写“已有该槽则不能装备”的卡才带）：
#   { "slots": [槽位id], "sizes": [规模id, ...] } —— 舰船原生/已添加含 slots 中任一槽位
#   且规模在 sizes 内（sizes 空 = 全部规模）时不可装备。其余加槽卡允许重复（额外槽位）。
ADDS_SLOTS_CARDS = {
    "offensive_retrofit_006": {"addsSlots": ["fleet_command"]},                      # 旗舰舰桥
    "officer_021": {"addsSlots": ["defensive_retrofit"],                             # 图阿部长
                    "addsSlotsReject": {"slots": ["defensive_retrofit"],
                                        "sizes": ["medium", "large"]}},              #  仅中/大型已有防御改装时禁止
    "imperial_title_009": {"addsSlots": ["fleet_command"],                           # 喷火兽号
                           "addsSlotsReject": {"slots": ["fleet_command"]}},         #  已有舰队指挥则不能装备
    "imperial_title_029": {"addsSlots": ["support_team"]},                           # 蹂躏号
    "rebel_title_005": {"addsSlots": ["fleet_command"],                              # 解放者号
                        "addsSlotsReject": {"slots": ["fleet_command"]}},            #  已有舰队指挥则不能装备
    "rebel_title_025": {"addsSlots": ["weapons_team"]},                              # 前卫号
    "rebel_title_027": {"addsSlots": ["officer"]},                                   # 凤凰之巢号
}


def strip_modification_label(text):
    """去掉效果文本中作为“卡牌类型标签”的那一个“改装”，保留正文语义。

    - 大多数字面以“改装 ”或“改装位于/改装银河共和国…”开头（标签在最前）。
    - 旗舰舰桥等个别字面是“……限定 改装 在……”（标签紧跟在限定子句后，
      PDF 提取常残留空格占位“限定 改装”，用 \s* 容错）。
    - 不触碰“防御改装 / 攻击改装”等槽位名（不在开头，也不跟“限定”）。
    """
    text = text or ""
    if text.startswith("改装"):
        text = text[len("改装"):]
    else:
        m = re.search(r"限定\s*改装", text)
        if m:
            text = text[:m.start()] + "限定" + text[m.end():]
    # 剥除标签后清理多余前导空白（全角/半角空格/换行）
    return re.sub(r"^[\s　]+", "", text)


# ---------- 公共配置 ----------
CONFIG = {
    "factions": [
        {"id": "imperial", "name": "银河帝国", "nameEn": "Galactic Empire"},
        {"id": "rebel", "name": "义军同盟", "nameEn": "Rebel Alliance"},
        {"id": "separatist", "name": "分离势力同盟", "nameEn": "Separatist Alliance"},
        {"id": "republic", "name": "银河共和国", "nameEn": "Galactic Republic"},
    ],
    "upgradeSlots": [
        {"id": "commander", "name": "指挥官"},
        {"id": "defensive_retrofit", "name": "防御改装"},
        {"id": "officer", "name": "军官"},
        {"id": "fleet_support", "name": "舰队支援"},
        {"id": "support_team", "name": "支援小组"},
        {"id": "fleet_command", "name": "舰队指挥"},
        {"id": "weapons_team", "name": "武器小组"},
        {"id": "ion_cannons", "name": "离子炮"},
        {"id": "offensive_retrofit", "name": "进攻改装"},
        {"id": "ordnance", "name": "军械"},
        {"id": "turbolasers", "name": "涡轮激光"},
        {"id": "experimental_retrofit", "name": "实验改装"},
        {"id": "superweapon", "name": "超级武器"},
    ],
    "sizes": [
        {"id": "small", "name": "小型", "nameEn": "Small"},
        {"id": "medium", "name": "中型", "nameEn": "Medium"},
        {"id": "large", "name": "大型", "nameEn": "Large"},
        {"id": "huge", "name": "巨型", "nameEn": "Huge"},
    ],
}


def load_pages(text_path):
    """读取叶子 text.json，返回卡元素数组（兼容 ships/pages 两种键）。"""
    with open(text_path, encoding="utf-8") as f:
        data = json.load(f)
    if "ships" in data:
        return data["ships"]
    return data.get("pages", [])


def clean_name(raw):
    s = (raw or "").strip()
    if s.startswith("·"):
        s = s[1:].strip()
    parts = [p.strip() for p in s.splitlines() if p.strip()]
    return " ".join(parts)


# ---------- PDF 字体子集字形错位修正 ----------
# 中文卡牌 PDF 的字体子集把若干常用字映射成了形近字（如 动→劢、不→丌、与→不、
# 进→迚、方→斱、卫→卣）。各 PDF 子集不同，映射也不同；下表经全量扫描验证可逆
# （如 帝国中队里“动”从不以正字出现，则 劢→动 安全）。键为 (类别, 阵营) 或 "upgrades"。
GLYPH_FIX = {
    ("squadrons", "imperial"): {"劢": "动", "丌": "不", "不": "与", "迚": "进"},
    ("squadrons", "rebel"): {"劢": "动", "卣": "卫"},
    ("titles", "imperial"): {"劢": "动", "丌": "不", "不": "与", "迚": "进", "斱": "方"},
    ("titles", "rebel"): {"劢": "动", "丌": "不", "不": "与"},
    "upgrades": {"劢": "动", "丌": "不", "迚": "进"},
}


def fix_glyphs(text, key):
    """按来源 PDF 的字形错位表修正文本（一次遍历，无级联）。"""
    table = GLYPH_FIX.get(key)
    if not table or not text:
        return text
    return "".join(table.get(ch, ch) for ch in text)


def derive_faction(content):
    """从卡面文本推导阵营限定。出现“帝国/义军 + 附近限定”即视为该阵营限定。
    无限定词视为双阵营通用（None）。本数据中不存在同时含两者的卡。"""
    text = content or ""
    for fac, kw in (("imperial", "帝国"), ("rebel", "义军")):
        i = text.find(kw)
        if i >= 0 and "限定" in text[i:i + 20]:
            return fac
    return None


# 指挥官卡面无阵营文字，但游戏规则每个指挥官均专属某一阵营（ID 顺序按 PDF 排版）。
# 卡面未录入阵营，这里用权威阵营归属补全（001-013 帝国，014-024 义军）。
# 仅当卡面解析不出阵营限定（r["factions"] 为空）时才应用，避免覆盖卡面文字限制。
COMMANDER_FACTION = {
    "commander_001": "imperial", "commander_002": "imperial",
    "commander_003": "imperial", "commander_004": "imperial",
    "commander_005": "imperial", "commander_006": "imperial",
    "commander_007": "imperial", "commander_008": "imperial",
    "commander_009": "imperial", "commander_010": "imperial",
    "commander_011": "imperial", "commander_012": "imperial",
    "commander_013": "imperial",
    "commander_014": "rebel", "commander_015": "rebel",
    "commander_016": "rebel", "commander_017": "rebel",
    "commander_018": "rebel", "commander_019": "rebel",
    "commander_020": "rebel", "commander_021": "rebel",
    "commander_022": "rebel", "commander_023": "rebel",
    "commander_024": "rebel",
}


# ---------- Armada 图标转义（卡面效果文本中的“4 空格 + 中文标签”占位 → token） ----------
# 与 js/fleet/armada-icons.js 的 labelToIcon 保持一致；「抑制」= 中队版防控标记，同为 defense-contain。
ICON_LABEL_MAP = {
    "防御改装": "upgrade-defensive-retrofit",
    "指挥官": "upgrade-commander",
    "士官": "upgrade-officer",
    "中队": "command-squadron",
    "集火": "command-concentrate-fire",
    "维修": "command-repair",
    "导航": "command-navigate",
    "回避": "defense-evade",
    "防控": "defense-contain",
    "抑制": "defense-contain",
    "传导": "defense-redirect",
    "暴击": "attack-critical",
    "任意": "command-any",
}


# 中日韩统一表意文字 + CJK 标点/假名 + CJK 兼容表意文字 + 全角形式
CJK_RANGE = r"　-ヿ㐀-鿿豈-﫿＀-￯"


def _label_pattern(label):
    """把标签正则做成“每个字符后允许可选换行”，以匹配 PDF 折行拆开的词（如 回\n避）。"""
    return "".join("%s(?:\\r?\\n)?" % re.escape(ch) for ch in label)


# 已知标签 token 之后的“章节断头”：此处 \n 是段落/栏位分界，不是 PDF 拆词，
# 即便两边都是中日韩也不能吞掉（如“5个  集火\n重置费用”的“集火重置费用”）。
_SECTION_STARTS = ("重置", "自带")

# “X Y”→“XY” 拆词合并时的例外：空格后是这些字时不合并。
# 在/当/每/如/你/它/则/而/也/但/且/并/只 都是从句起始字（“限定 在攻击时”要保持空格，
# 否则会粘成“限定在攻击时”）；限 是“XX 限定”限制标记（“帝国 限定”保持空格）；
# 帝 避免“帝国 帝国级歼星舰”粘成“帝国帝国级”；重 避免“集火 重置费用”粘成“集火重置费用”。
_KEEP_SPACE_AFTER = frozenset("在当每如你它则而也但且并只限帝重")


def _is_cjk(ch):
    """单个字符是否属于中日韩（含全角标点/假名/兼容表意/全角形式）。"""
    return bool(re.match(r"[%s]" % CJK_RANGE, ch))


def _consume_cjk_run(text, i):
    """从位置 i 消费一段连续中日韩字符，并吞掉段内把词/词组拆开的换行。

    返回 (合并后的文本, 新位置)。只吞掉“\n 后仍是中日韩”的换行（这些是 PDF
    折行拆词，如 精确标\\n志、突袭攻\\n击、回\\n避、支援\\n组）；若 \n 后是
    “章节断头”（重置费用 / 自带 等）则不吞，留给后续把 \n 折叠为空格。
    """
    n = len(text)
    out = []
    while i < n and _is_cjk(text[i]):
        out.append(text[i])
        i += 1
        if text.startswith("\r\n", i):
            j = i + 2
        elif text[i:i + 1] == "\n":
            j = i + 1
        else:
            continue
        if j < n and _is_cjk(text[j]) and not text[j:j + 2].startswith(_SECTION_STARTS):
            i = j
    return "".join(out), i


def solidify_icons(text):
    """把 PDF 提取残留的“3+ 空格 + 标签”占位替换为显式 token [[icon:<id>]]，并清理占位。

    1) 已知标签（允许内部换行的折行词，如 回\\n避）→ token；无对应图标的标签
       （精确 / 驱散 / 命中 / 舰队指挥 / 奇袭 / 突袭 / 武器组 / 支援组 /
       离子炮 / 激光炮 / 导弹 / 指令所 等）只吃掉占位与拆词换行，保留为自然中文。
    2) 仅在被 token 或“4+ 空格占位”锚定的连续中日韩段内吞掉换行（段内换行全是
       PDF 拆词）；非锚定的换行折叠为单个空格，避免把从句边界粘连
       （“限定\\n在攻击时”保持为“限定 在攻击时”，而不是“限定在攻击时”）。
    """
    if not text:
        return text
    ordered = sorted(ICON_LABEL_MAP, key=len, reverse=True)
    # 占位宽度实测为 3–5 空格（个别 3 空格，如 施里夫 的防御改装），2 空格从不出现在源文本，
    # 故 3+ 空格必为图片占位，可安全匹配
    pattern = re.compile(r" {3,}(?:\r?\n)?(?=(%s))" % "|".join(_label_pattern(l) for l in ordered))
    out = pattern.sub(lambda m: "[[icon:%s]]" % ICON_LABEL_MAP[m.group(1).replace("\r", "").replace("\n", "")], text)

    parts = []
    i, n = 0, len(out)
    while i < n:
        ch = out[i]
        # 残余占位：4+ 空格（已知标签已被替换，这里只剩无图标的标签，直接吃掉）
        if ch == " " and out.startswith("    ", i):
            i += 4
            while i < n and out[i] == " ":
                i += 1
            run, i = _consume_cjk_run(out, i)
            parts.append(run)
            continue
        # 已知标签 token：紧随其后的标签文本同属锚定段，段内换行也吞掉
        if ch == "[" and out.startswith("[[icon:", i):
            j = out.find("]]", i)
            parts.append(out[i:j + 2])
            i = j + 2
            run, i = _consume_cjk_run(out, i)
            parts.append(run)
            continue
        if ch in "\r\n":
            parts.append(" ")
            i += 2 if out.startswith("\r\n", i) else 1
            continue
        parts.append(ch)
        i += 1
    result = "".join(parts)
    result = re.sub(r"[ \t]{2,}", " ", result).strip()
    # token 前的多余空格（来自非锚定换行折叠）去掉，图标直接贴合上文
    result = re.sub(r"(?<![ /])\s+(\[\[icon:)", r"\1", result)
    # 标点后的折行空格去掉（“。 在” → “。在”，标点自身已分隔）
    result = re.sub(r"([。，：；、！？]) ", r"\1", result)
    # 修复非锚定拆词：“X Y”→“XY”（Y 不是从句起始字/限制标记时才合并，
    # 避免“限定 在攻击时”被粘成“限定在攻击时”；且不会拆开真正的词界）。
    join_re = re.compile(r"([%s]) ([%s])" % (CJK_RANGE, CJK_RANGE))
    for _ in range(8):
        new = join_re.sub(
            lambda m: m.group(1) + m.group(2) if m.group(2) not in _KEEP_SPACE_AFTER else m.group(1) + " " + m.group(2),
            result)
        if new == result:
            break
        result = new
    # 暴击（[crit] 骰面）在本库全部文本中永远指代骰面图标：即使 PDF 提取未留图片占位
    # （该处按文字排版），也一律转成图标 token，避免页面显示纯文本“暴击”。
    # 已带 token 的（[[icon:attack-critical]]暴击）用后顾断言跳过，不重复转换。
    result = re.sub(r"(?<!\[\[icon:attack-critical\]\])暴击", "[[icon:attack-critical]]暴击", result)
    return result


def solidify_all_icons(cards):
    """给一批卡的 effect 做图标转义；返回替换的卡数（用于打印统计）。"""
    changed = 0
    for c in cards:
        if not c.get("effect"):
            continue
        new = solidify_icons(c["effect"])
        if new != c.get("effect"):
            c["effect"] = new
            changed += 1
    return changed


# ---------- FAQ / 勘误 提取 ----------
# 卡面效果里内嵌的编辑注释（[FAQ：…] / [勘误：…] / [1.5勘误：…]）拆成独立 faq 字段，
# 控制显示（对齐 data/objectives.json 已有的 faq 字段）。段内可能含 [[icon:…]] 双括号
# token：`[[`/`]]` 按 ±2 计深度，单 `[`/`]` 按 ±1；深度回到 0 的 `]` 即段尾。
FAQ_MARKERS = ("[1.5勘误：", "[勘误：", "[FAQ：")  # 长标记在前，startswith 逐一匹配


def extract_faq_notes(text):
    """剥离 [FAQ：]/[勘误：]/[1.5勘误：] 段到 faq；返回 (cleaned_effect, faq_or_None)。

    只删方括号段，保留其余正文（中队卡 FAQ 段后有关键字块；正文里不带方括号的
    "1.5版FAQ中被官方禁掉" 等不会被误匹配）。多段（简奥斯 FAQ+勘误）换行拼接。
    """
    if not text:
        return text, None
    notes, out = [], []
    i, n, last_end = 0, len(text), None
    while i < n:
        if text[i] == "[":
            marker = next((m for m in FAQ_MARKERS if text.startswith(m, i)), None)
            if marker:
                depth, j = 1, i + len(marker)
                while j < n and depth > 0:
                    if text.startswith("[[", j):
                        depth += 2
                        j += 2
                    elif text.startswith("]]", j):
                        depth -= 2
                        j += 2
                    elif text[j] == "[":
                        depth += 1
                        j += 1
                    elif text[j] == "]":
                        depth -= 1
                        j += 1
                    else:
                        j += 1
                notes.append(text[i + len(marker):j - 1])  # 去 [标记： 前缀与末尾 ]
                last_end = j
                i = j
                continue
        out.append(text[i])
        i += 1
    if not notes:
        return text, None
    cleaned = "".join(out)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"([。，：；、！？]) ", r"\1", cleaned)
    # 段尾孤儿项目符号（仅 defensive_retrofit_004 的「] •」）：末段后只剩空白/一个 • 才剥
    if last_end is not None and re.fullmatch(r"[\s　]*[•·]?[\s　]*", text[last_end:]):
        cleaned = re.sub(r"\s*[•·]\s*$", "", cleaned).strip()
    return cleaned, "\n".join(notes)


# ---------- 升级卡阵营归属（镜像 cardFactionAllowed：restrictions.factions 优先，
# 其次 faction 字段，否则全部阵营 = neutral） ----------
ALL_FACTIONS = frozenset(f["id"] for f in CONFIG["factions"])
UPGRADE_BUCKETS = ("neutral", "imperial", "rebel", "separatist", "republic")
UPGRADE_FILES_BY_MEMBERSHIP = {
    ALL_FACTIONS: ["neutral"],
    frozenset(["imperial"]): ["imperial"],
    frozenset(["rebel"]): ["rebel"],
    frozenset(["separatist"]): ["separatist"],
    frozenset(["republic"]): ["republic"],
    frozenset(["separatist", "republic"]): ["separatist", "republic"],
}


def upgrade_membership(card):
    """返回升级卡的允许阵营集合（子集 of ALL_FACTIONS）。"""
    r = card.get("restrictions") or {}
    facs = r.get("factions") or []
    if facs:
        return frozenset(f for f in ALL_FACTIONS if f in facs)
    f = card.get("faction")
    if f:
        return frozenset([f]) if f in ALL_FACTIONS else frozenset()
    return ALL_FACTIONS


def split_upgrades(cards):
    """按允许阵营把升级卡分发到 neutral/各阵营桶；双阵营卡写两份。返回 (buckets, skipped)。"""
    buckets = {k: [] for k in UPGRADE_BUCKETS}
    skipped = []
    for c in cards:
        names = UPGRADE_FILES_BY_MEMBERSHIP.get(upgrade_membership(c))
        if names is None:
            skipped.append(c["id"])  # 数据守卫：无阵营归属（当前数据 0 张）
            continue
        for name in names:
            buckets[name].append(c)
    return buckets, skipped


def build_ships():
    cards = []
    for faction in ["imperial", "rebel"]:
        folder = os.path.join(ASSETS, "ships", faction)
        text = os.path.join(folder, "text.json")
        if not os.path.exists(text):
            continue
        for p in load_pages(text):
            cards.append({
                "id": p["id"],
                "type": "ship",
                "faction": p["faction"],
                "name": p["name"],
                "nameEn": p.get("nameEn"),
                "size": p.get("size"),
                "points": None,
                "image": os.path.join("assets", "ships", faction, p["image"]).replace("\\", "/"),
                "slots": list(p.get("slots", [])),
                "effect": "",
            })
    return cards


def build_category(category, factions):
    """中队/称号：阵营从目录名取。"""
    cards = []
    for faction in factions:
        folder = os.path.join(ASSETS, category, faction)
        text = os.path.join(folder, "text.json")
        if not os.path.exists(text):
            continue
        for p in load_pages(text):
            slug = category if category == "squadrons" else "title"
            card = {
                "id": "%s_%s_%03d" % (faction, slug, p["ID"]),
                "type": "squadron" if category == "squadrons" else "title",
                "faction": faction,
                "name": clean_name(p["name"]),
                "nameEn": None,
                "size": None,
                "points": None,
                "image": os.path.join("assets", category, faction, p["image"]).replace("\\", "/"),
                "slots": [],
                "effect": fix_glyphs(p.get("content", ""), (category, faction)),
            }
            # 称号卡：资产 text.json 的 shipId 是权威舰船匹配依据（用户维护），
            # 随卡带出，apply_restrictions 用它覆盖文本解析结果
            if slug == "title" and p.get("shipId"):
                card["shipId"] = list(p["shipId"])
            # 中队：unique（·前缀）/ ace（自带防御标记）优先取资产字段（义军为
            # BattleScribe 权威值），缺失时回退卡面文本检测（帝国资产即走此回退，
            # 结果与 BattleScribe 一致）。limit：unique 全舰队限 1，否则默认 4。
            if category == "squadrons":
                unique = p.get("unique")
                if unique is None:
                    unique = (p.get("name") or "").split("\n")[0].startswith("·")
                ace = p.get("ace")
                if ace is None:
                    ace = "自带防御标记" in (p.get("content") or "")
                card["unique"] = bool(unique)
                card["ace"] = bool(ace)
                card["limit"] = 1 if unique else 4
                card["nameEn"] = p.get("nameEn")
            # 增加槽位的称号：addsSlots / addsSlotsReject（见 ADDS_SLOTS_CARDS）
            cid = "%s_%s_%03d" % (faction, slug, p["ID"])
            if cid in ADDS_SLOTS_CARDS:
                card.update(ADDS_SLOTS_CARDS[cid])
            cards.append(card)
    return cards


def build_upgrades():
    cards = []
    stat = {}
    up_dir = os.path.join(ASSETS, "upgrades")
    if not os.path.isdir(up_dir):
        return cards
    for slot in sorted(os.listdir(up_dir)):
        text = os.path.join(up_dir, slot, "text.json")
        if not os.path.exists(text):
            continue
        for p in load_pages(text):
            fac = derive_faction(p.get("content", ""))
            stat[fac if fac else "neutral"] = stat.get(fac if fac else "neutral", 0) + 1
            cid = "%s_%03d" % (slot, p["ID"])
            card = {
                "id": cid,
                "type": "upgrade",
                "slot": slot,
                "faction": fac,
                "name": clean_name(p["name"]),
                "nameEn": None,
                "size": None,
                "points": None,
                "image": os.path.join("assets", "upgrades", slot, p["image"]).replace("\\", "/"),
                "slots": list(DUAL_SLOT_CARDS.get(cid, [])),
                "effect": fix_glyphs(p.get("content", ""), "upgrades"),
                # Modification trait：数据字段，运行时不做 effect.includes("改装") 判断
                "modification": cid in MODIFICATION_CARDS,
            }
            if card["modification"]:
                card["effect"] = strip_modification_label(card["effect"])
            # Commander 卡均为 Armada 独特（unique）卡；本轮 unique 规则对 Title 生效，
            # Commander 由舰队级单一字段（fleet.commander）限制，此字段供数据统一/未来扩展。
            if slot == "commander":
                card["unique"] = True
            # 增加槽位的升级卡：addsSlots / addsSlotsReject（见 ADDS_SLOTS_CARDS）
            if cid in ADDS_SLOTS_CARDS:
                card.update(ADDS_SLOTS_CARDS[cid])
            cards.append(card)
    print("升级卡阵营推导: %s（neutral=未判定，可后续人工编辑）" % stat)
    return cards


def apply_restrictions(upgrades, titles):
    """为升级卡与称号卡附加 restrictions（解析“限定”子句）。

    - 升级卡：faction 从文本推导（仅帝国/义军），此处用解析结果补全
      共和国/分离势力/双阵营限定。
    - 称号卡：阵营取自目录，解析其舰船限制。
    统计返回给调用方打印。
    """
    stats = {"restricted": 0, "unresolved": []}
    for c in upgrades:
        r, fac = restrictions.parse_card_restrictions(c.get("effect", ""), c.get("faction"))
        c["restrictions"] = r
        if r["factions"] and not c.get("faction"):
            c["faction"] = fac if fac and len(r["factions"]) == 1 else None
        elif c.get("slot") == "commander" and not r["factions"]:
            # 指挥官卡面无阵营文字：用权威阵营归属补全（COMMANDER_FACTION）
            c["faction"] = COMMANDER_FACTION.get(c["id"]) or c.get("faction")
        if any([r["factions"], r["sizes"], r["shipIds"], r["shipNames"], r["requiresFlagship"]]):
            stats["restricted"] += 1
            if r["shipNames"] and not r["shipIds"]:
                stats["unresolved"].append("%s %s" % (c["id"], r["shipNames"]))
    for c in titles:
        r, fac = restrictions.parse_card_restrictions(c.get("effect", ""), c.get("faction"))
        # 以资产 text.json 的 shipId 为权威（用户维护），覆盖文本解析出的舰船限制
        if c.get("shipId"):
            r["shipIds"] = list(c["shipId"])
            r["shipNames"] = []
        c["restrictions"] = r
        stats["restricted"] += 1
        if r["shipNames"] and not r["shipIds"]:
            stats["unresolved"].append("%s %s" % (c["id"], r["shipNames"]))
    return stats


def build_objectives():
    """任务卡：直接采用 extract_objectives.py 生成的规范结构。"""
    src = os.path.join(ASSETS, "objectives", "text.json")
    if not os.path.exists(src):
        return []
    with open(src, encoding="utf-8") as f:
        return json.load(f)


def main():
    ships = build_ships()
    squadrons = build_category("squadrons", ["imperial", "rebel"])
    titles = build_category("titles", ["imperial", "rebel"])
    upgrades = build_upgrades()
    objectives = build_objectives()

    payloads = {
        "config.json": CONFIG,
        "ships.json": ships,
        "squadrons.json": squadrons,
        "upgrades.json": upgrades,
        "titles.json": titles,
        "objectives.json": objectives,
    }

    rstats = apply_restrictions(upgrades, titles)
    print("限定解析: 受限卡 %d 张，未解析舰船描述 %d 条: %s"
          % (rstats["restricted"], len(rstats["unresolved"]), rstats["unresolved"]))

    # Armada 图标转义：把卡面效果文本中的“4 空格 + 标签”占位固化为 [[icon:...]] token。
    # 限在写出前执行（影响 effect 字段，不依赖点数/限制）。
    changed_icons = sum(solidify_all_icons(payloads[n]) for n in ("squadrons.json", "upgrades.json", "titles.json"))
    print("图标转义: 修改卡面文本 %d 张（中队/升级/称号）" % changed_icons)

    # 合并点数：points_map.json（id -> {points, en?, banned?}），
    # 找不到的卡保持 null（不自动填 0）。须在写出之前执行。
    pm_path = os.path.join(ROOT, "points_map.json")
    pm = {}
    if os.path.exists(pm_path):
        with open(pm_path, encoding="utf-8") as f:
            pm = json.load(f)
    merged = 0
    for name in ("ships", "squadrons", "upgrades", "titles"):
        for c in payloads[name + ".json"]:
            info = pm.get(c["id"])
            if not info:
                continue
            c["points"] = info.get("points")
            # 帝国中队 assets 无 nameEn 字段，从 points_map 回填英文名（义军已内嵌）
            if info.get("en") and not c.get("nameEn"):
                c["nameEn"] = info.get("en")
            if info.get("banned"):
                c["banned"] = True
            merged += 1
    print("合并点数 %d/%d 卡（%s）" % (merged, sum(len(payloads[n + '.json']) for n in ("ships", "squadrons", "upgrades", "titles")),
                                       os.path.basename(pm_path)))

    # 称号 unique：nameEn 带 "•" 前缀 = Armada 官方独特记号（BattleScribe 约定，同中队 "·"）。
    # nameEn 由上方点数合并回填，故必须在此之后判定；所有称号都必须有明确 true/false。
    for c in payloads["titles.json"]:
        c["unique"] = bool((c.get("nameEn") or "").startswith("•"))

    # ---- 数据源优先级（data/ 可能含 carddb 手工新增的卡，如 帝国 040/041、义军
    # 038-041 中队、帝国称号 031；拆分必须原样保留，否则会丢数据）：
    #   1) data/<cat>.json（旧工作流：carddb 导出覆盖 data/ 后这里优先读取）
    #   2) 已拆分的 assets 文件（迁移后的工作流：carddb 导出覆盖对应 assets/，
    #      重建从这里继续，手工卡/编辑都保留）
    #   3) 本次从 text.json 再生的 payloads（全新检出 / 首次构建）
    # 注意：每个分类只读一次并复用同一批卡对象（FAQ 提取会就地改写 effect/faq，
    # 分布写出必须用提取后的同一批对象）。----
    def authoritative_cards(category):
        src = os.path.join(DATA_DIR, category + ".json")
        if os.path.exists(src):
            with open(src, encoding="utf-8") as fh:
                return json.load(fh)
        if category == "upgrades":
            files = [os.path.join(ASSETS, "upgrades", b + ".json") for b in UPGRADE_BUCKETS]
        else:
            files = [os.path.join(ASSETS, category, f, "cards.json") for f in ("imperial", "rebel")]
        if any(os.path.exists(p) for p in files):
            seen, merged = set(), []
            for p in files:
                if not os.path.exists(p):
                    continue
                with open(p, encoding="utf-8") as fh:
                    for c in json.load(fh):
                        if not c or (c.get("id") and c["id"] in seen):
                            continue
                        if c.get("id"):
                            seen.add(c["id"])
                        merged.append(c)
            if merged:
                return merged
        return payloads[category + ".json"]

    card_sources = {name: authoritative_cards(name) for name in ("ships", "squadrons", "upgrades", "titles")}

    # FAQ/勘误 提取：把 [FAQ：]/[勘误：]/[1.5勘误：] 从 effect 剥离为 faq 字段。
    # 先固化图标（手工卡也可能含 PDF 占位），保证 faq 内图标 token；ships effect 为空跳过。
    faq_count = 0
    for name in ("squadrons", "upgrades", "titles"):
        cards = card_sources[name]
        solidify_all_icons(cards)
        for c in cards:
            c["effect"], faq = extract_faq_notes(c.get("effect") or "")
            if faq is not None:
                c["faq"] = faq
                faq_count += 1
    print("FAQ 提取: %d 张卡 带 faq 字段" % faq_count)

    # 按阵营分布写出：ships/squadrons/titles → assets/<type>/<faction>/cards.json
    for category in ("ships", "squadrons", "titles"):
        cards = card_sources[category]
        unknown = [c["id"] for c in cards if c.get("faction") not in ("imperial", "rebel")]
        if unknown:
            print("!! 未归类 %s: %s" % (category, ", ".join(unknown)))
        for faction in ("imperial", "rebel"):
            sub = [c for c in cards if c.get("faction") == faction]
            path = os.path.join(ASSETS, category, faction, "cards.json")
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(sub, fh, ensure_ascii=False, indent=2)
            print("写出 %-38s %d 条" % (os.path.relpath(path, ROOT), len(sub)))

    # 升级卡 → assets/upgrades/neutral.json + 各阵营文件（双阵营卡写两份）
    buckets, skipped = split_upgrades(card_sources["upgrades"])
    if skipped:
        print("!! 升级卡无阵营归属被跳过: %s" % ", ".join(skipped))
    for name in UPGRADE_BUCKETS:
        path = os.path.join(ASSETS, "upgrades", name + ".json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(buckets[name], fh, ensure_ascii=False, indent=2)
        print("写出 %-38s %d 条" % (os.path.relpath(path, ROOT), len(buckets[name])))

    # config / objectives 仍写 data/（不拆分）
    for name in ("config", "objectives"):
        obj = payloads[name + ".json"]
        with open(os.path.join(DATA_DIR, name + ".json"), "w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False, indent=2)
        count = len(obj) if isinstance(obj, list) else "-"
        print("写出 %-16s %s 条" % (name + ".json", count))

    # 一次性迁移提示：旧的 4 个单文件不再生成
    for stale in ("ships", "squadrons", "upgrades", "titles"):
        p = os.path.join(DATA_DIR, stale + ".json")
        if os.path.exists(p):
            print("提示: 旧单体 %s 不再生成，请手动删除（一次性迁移）" % p)

    # 校验：图片路径存在
    missing = 0
    for name in ("ships", "squadrons", "upgrades", "titles", "objectives"):
        for c in payloads[name + ".json"]:
            if c.get("image") and not os.path.exists(os.path.join(ROOT, c["image"])):
                missing += 1
                print("!! 缺图", c["id"], c["image"])
    print("图片校验: %s" % ("全部存在" if missing == 0 else "%d 处缺失" % missing))
    print("完成")


if __name__ == "__main__":
    main()
