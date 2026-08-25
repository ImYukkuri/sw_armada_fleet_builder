# -*- coding: utf-8 -*-
"""从卡面效果文本解析“限定”子句，生成 restrictions 字段。

数据模型（在 task.md §16-18 基础上补充 factions，因为阵营也是一种限制）：
  restrictions: {
    "factions": [],         # 允许的阵营 id 列表（空 = 不限）
    "sizes": [],            # 允许的规模（small/medium/large/huge）
    "shipIds": [],          # 允许的具体舰船卡 id（称号、特定舰船升级）
    "shipNames": [],        # 舰船描述原文（中文，用于展示；未解析到 id 时用于按卡名匹配）
    "shipTraits": [],       # 舰船特性（当前数据库暂无此数据，恒为 []）
    "requiresFlagship": false,  # 仅可装备于旗舰
    "requiredTitles": [],   # 需要特定称号（当前数据库无此限制，恒为 []）
  }

解析约定：
- 扫描 effect 全文所有“……限定”子句（不限于第一行）。
- 每子句依次剥离：阵营短语（词边界）→ 规模短语 → 剩余文本即舰船描述。
- “旗舰限定”→ requiresFlagship； “MK1限定”→ 收窄到 Mark I 变体。
- 阵营参与别名解析（“歼星舰”在帝国=帝国级，在共和国=共和国歼星舰）。

舰船别名表（TITLE_ALIAS）：称号中文描述 ≠ 舰船卡名（如“角斗士级”↔“斗士I级”）。
键为 “阵营:描述”。未收录的描述不会解析到 id，仅保留 shipNames 供展示/按名匹配。

本模块不触碰原始 assets，只读 data/*.json 做后处理（重建安全）。
"""
import re

# ---- 阵营短语（须先匹配长短语；词边界校验避免“帝国级”误判为“帝国”） ----
FACTIONS = [
    ("银河共和国", "republic"),
    ("分离势力同盟", "separatist"),
    ("义军", "rebel"),
    ("帝国", "imperial"),
]

# ---- 规模短语 -> 规模 id 列表（按特异性从高到低，避免“大型战舰”吃掉“中型与大型战舰”） ----
SIZE_CLAUSES = [
    ("非-巨型战舰", ["small", "medium", "large"]),
    ("中型不大型战舰", ["medium", "large"]),      # “不”为“和”之 OCR 误
    ("中型或大型战舰", ["medium", "large"]),
    ("中型与大型战舰", ["medium", "large"]),
    ("小型或中型战舰", ["small", "medium"]),
    ("大型战舰", ["large"]),
    ("巨型战舰", ["huge"]),
]

# ---- 舰船别名表：阵营:描述 -> 舰船卡 id 列表 ----
TITLE_ALIAS = {
    # —— 帝国 ——
    "imperial:阿奎腾斯级轻巡洋舰": ["arquitens_light"],
    "imperial:角斗士级歼星舰": ["gladiator_i", "gladiator_ii"],
    "imperial:戈赞蒂级突袭运输舰": ["gozanti_assault", "gozanti_cruiser"],
    "imperial:歼星舰": ["imperial_i", "imperial_ii", "imperial_kuat", "imperial_cymoon"],
    "imperial:帝国级歼星舰": ["imperial_i", "imperial_ii", "imperial_kuat", "imperial_cymoon"],
    "imperial:阻绝者级试验星舰": ["interdictor_combat", "interdictor_suppression"],
    "imperial:强弩级歼星舰": ["onager", "onager_testbed"],
    "imperial:类星体火级巡洋航母": ["quasar_i", "quasar_ii"],
    "imperial:袭击者级轻型护卫舰": ["raider_i", "raider_ii"],
    "imperial:超级歼星无畏舰": ["star_dreadnought_assault", "star_dreadnought_command"],
    "imperial:胜利级歼星舰": ["victory_i", "victory_ii"],
    # —— 义军 ——
    "rebel:突击护卫舰 Mark II": ["assault_frigate_ii_a", "assault_frigate_ii_b"],
    "rebel:CR90轻型护卫舰": ["cr90_a", "cr90_b"],
    "rebel:GR-75运输舰": ["gr75_combat", "gr75_transport"],
    "rebel:锤头级轻型护卫舰": ["hammerhead_scout", "hammerhead_torpedo"],
    "rebel:MC-30护卫舰": ["mc30c_scout", "mc30c_torpedo"],
    "rebel:MC-75巡洋舰": ["mc75_armored", "mc75_ordnance"],
    "rebel:MC": ["mc30c_scout", "mc30c_torpedo", "mc75_armored", "mc75_ordnance",
                 "mc80_assault", "mc80_battle", "mc80_command", "mc80_star"],
    "rebel:MC-80 突袭/指挥巡洋舰": ["mc80_assault", "mc80_command"],
    "rebel:MC-80 战斗巡洋舰": ["mc80_battle"],
    "rebel:内布伦-B 护卫舰": ["nebulon_b_escort", "nebulon_b_support"],
    "rebel:改修版轻盾级护卫舰": ["pelta_assault", "pelta_command"],
    "rebel:星鹰级战列舰": ["starhawk_i", "starhawk_ii"],
    "rebel:纳迪里星鹰级战列舰": ["starhawk_i", "starhawk_ii"],
    # —— 共和国（当前无对应舰船卡，明确解析为空，避免回退到帝国） ——
    "republic:歼星舰": [],
}

# ---- 描述未被收录时，进 shipNames（按卡名匹配，通常无卡命中） ----
_UNRESOLVED = {"机器人士官", "歼星舰"}

_CJK = re.compile(r"[一-鿿]")


def find_clauses(effect):
    """提取 effect 中所有“……限定”子句（不限于第一行）。"""
    clauses = []
    for line in (effect or "").split("\n"):
        start = 0
        while True:
            i = line.find("限定", start)
            if i < 0:
                break
            clause = line[:i].strip()
            if clause:
                clauses.append(clause)
            start = i + 2
    return clauses


def _extract_factions(clause):
    """词边界匹配阵营短语，返回 (阵营id列表, 剩余文本)。"""
    ids, rest = [], clause
    for phrase, fid in FACTIONS:
        pat = re.compile(r"(?<![0-9A-Za-z一-鿿])" + re.escape(phrase) + r"(?![0-9A-Za-z一-鿿])")
        if pat.search(rest):
            ids.append(fid)
            rest = pat.sub(" ", rest)
    return ids, rest


def _extract_sizes(clause):
    sizes, rest = [], clause
    for phrase, siz in SIZE_CLAUSES:
        if phrase in rest:
            sizes.extend(siz)
            rest = rest.replace(phrase, " ")
    return sorted(set(sizes)), rest


def resolve_ship(desc, faction):
    """按 (阵营, 描述) 查别名表；未收录返回 []。"""
    key = "%s:%s" % (faction, desc)
    if key in TITLE_ALIAS:
        return list(TITLE_ALIAS[key])
    return []


def parse_card_restrictions(effect, card_faction):
    """解析一张卡的完整限制。card_faction 为已推导阵营（文件夹/文本），用于别名解析。

    返回 (restrictions, faction)：
      restrictions 见模块 docstring；
      faction —— 若限制子句含唯一阵营，返回该阵营（可能补全 card_faction 的空值）。
    """
    clauses = find_clauses(effect)
    factions, sizes, desc = [], [], None
    requires_flagship, mk1 = False, False

    for clause in clauses:
        c = clause.strip()
        if c == "旗舰":
            requires_flagship = True
            continue
        if c in ("MK1", "MK I", "MK-I", "MKI", "Mark I", "马克1"):
            mk1 = True
            continue
        fs, rest = _extract_factions(c)
        factions.extend(fs)
        sz, rest = _extract_sizes(rest)
        sizes.extend(sz)
        # 剥离首尾空白/引号/斜杠（“银河共和国/分离势力同盟”剥离阵营后残留的 "/"）
        rest = re.sub(r"\s+", " ", rest).strip(" \t\"'“”/")
        if rest:
            desc = rest if desc is None else desc + " " + rest

    fset = sorted(set(factions))
    faction = fset[0] if len(fset) == 1 else card_faction

    ship_ids, ship_names = [], []
    if desc:
        ship_ids = resolve_ship(desc, faction or "")
        if mk1:
            ship_ids = [i for i in ship_ids if i.endswith("_i") or i.endswith("I")]
        ship_names = [desc]

    return {
        "factions": fset,
        "sizes": sorted(set(sizes)),
        "shipIds": ship_ids,
        "shipNames": ship_names,
        "shipTraits": [],
        "requiresFlagship": requires_flagship,
        "requiredTitles": [],
    }, faction


def empty_restrictions():
    return {
        "factions": [],
        "sizes": [],
        "shipIds": [],
        "shipNames": [],
        "shipTraits": [],
        "requiresFlagship": False,
        "requiredTitles": [],
    }


if __name__ == "__main__":
    # 自检样例
    import json
    samples = [
        ("帝国 角斗士级歼星舰 限定", "imperial"),
        ("义军\"MC\"限定", "rebel"),
        ("银河共和国/分离势力同盟 中型或大型战舰 限定", None),
        ("中型不大型战舰限定\n旗舰限定", "imperial"),
        ("义军 星鹰级战列舰 限定\nMK1限定", "rebel"),
        ("银河共和国 歼星舰 限定", None),
        ("分离势力同盟 机器人士官 限定", "separatist"),
        ("帝国限定", "imperial"),
        ("大型战舰 限定", "rebel"),
    ]
    for eff, fac in samples:
        r, f = parse_card_restrictions(eff, fac)
        print("effect:", repr(eff))
        print("  ->", json.dumps(r, ensure_ascii=False), "| faction:", f)
