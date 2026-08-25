# -*- coding: utf-8 -*-
"""从 rebsquad.pdf（星球大战：无敌舰队 02义军中队中文卡牌 v0.2）提取义军中队数据。

产出：
- assets/squadrons/rebel/text.json   镜像帝国中队资产结构，每页额外带 unique/ace/nameEn
- assets/squadrons/rebel/images/*.jpeg  37 张卡图（pymupdf 渲染，命名 page_XXX_img_1.jpeg）

文本用 pypdf 提取（与帝国资产同法：逐行 strip、去空行）。
unique / ace / 点数 / 英文名 以 BattleScribe 项目为准
（armada/_research/star-wars-armada/Rebel Fleet.cat，name 带 • = unique，
Defense Tokens 非空 = ace），映射表已逐页核对。

用法：
  python extract_rebel_squadrons.py
"""
import io
import json
import os
import sys

import fitz  # pymupdf：渲染卡图
from pypdf import PdfReader

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
OUT_DIR = os.path.join(ASSETS, "squadrons", "rebel")
IMG_DIR = os.path.join(OUT_DIR, "images")
PDF = os.path.join(ASSETS, "rebsquad.pdf")

# 页面下标(0 基) -> {en, pts, unique, ace}。en 名取自 BattleScribe（含 • 前缀表示 unique）。
META = [
    ("•Biggs Darklighter", 19, True, True),            # 0 比格斯 夜明者
    ("•Corran Horn", 22, True, True),                  # 1 科兰 霍恩
    ("•Dagger Squadron", 15, True, False),             # 2 匕首中队（unique 非 ace）
    ("•Dash Rendar (Outrider)", 24, True, True),       # 3 达什 伦达
    ("•\"Dutch\" Vander", 16, True, True),             # 4 达奇 范德
    ("•Gold Squadron", 12, True, False),               # 5 金色中队
    ("•Green Squadron", 12, True, False),              # 6 绿色中队
    ("•Han Solo (Millennium Falcon)", 26, True, True), # 7 汉 索罗
    ("•Hera Syndulla (Ghost)", 28, True, True),        # 8 赫拉 辛杜拉
    ("•Jan Ors (Moldy Crow)", 19, True, True),         # 9 简 奥斯
    ("•Kanan Jarrus", 19, True, True),                 # 10 凯南 贾勒斯
    ("•Ketsu Onyo (Shadow Caster)", 22, True, True),   # 11 凯楚 奥尼奥
    ("•Keyan Farlander", 18, True, True),              # 12 凯恩 法兰德
    ("•Lando Calrissian (Millennium Falcon)", 24, True, True),  # 13 兰多 卡瑞辛
    ("•Lieutenant Blount", 14, True, True),            # 14 布朗特中校
    ("•Luke Skywalker", 20, True, True),               # 15 卢克 天行者
    ("•Malee Hurra", 21, True, True),                  # 16 马雷 霍拉
    ("•Mart Mattin (Sato's Hammer)", 22, True, True),  # 17 马特 马丁
    ("•Norra Wexley", 17, True, True),                 # 18 诺拉 韦克斯利
    ("•Nym (Havoc)", 21, True, True),                  # 19 尼姆
    ("•Rogue Squadron", 14, True, False),              # 20 侠盗中队
    ("•Shara Bey", 17, True, True),                    # 21 莎拉 贝
    ("•Ten Numb", 19, True, True),                     # 22 坦 农布
    ("•Tycho Celchu", 16, True, True),                 # 23 泰科 塞尔楚
    ("•Wedge Antilles", 19, True, True),               # 24 韦奇 安蒂列斯
    ("A-Wing Squadron", 11, False, False),             # 25
    ("B-Wing Squadron", 14, False, False),             # 26
    ("E-Wing Squadron", 14, False, False),             # 27
    ("HWK-290", 12, False, False),                     # 28
    ("Lancer-class Pursuit Craft", 14, False, False),  # 29 枪骑兵级
    ("Scurrg H-6 Bomber", 16, False, False),           # 30
    ("VCX-100 Freighter", 15, False, False),           # 31
    ("X-Wing Squadron", 13, False, False),             # 32
    ("Y-Wing Squadron", 10, False, False),             # 33
    ("YT-1300", 13, False, False),                     # 34
    ("Z-95 Headhunter Squadron", 7, False, False),     # 35
    ("YT-2400", 16, False, False),                     # 36
]


def clean_lines(text):
    """逐行 strip、去空行。"""
    return [ln.strip() for ln in (text or "").split("\n") if ln.strip()]


def split_name_content(lines):
    """首行以 · 开头 => 名字两行（飞行员 + 机型），否则一行。"""
    if lines and lines[0].startswith("·"):
        return lines[0:2], lines[2:]
    return lines[0:1], lines[1:]


def render_images(doc, count):
    os.makedirs(IMG_DIR, exist_ok=True)
    for i in range(count):
        pix = doc[i].get_pixmap(matrix=fitz.Matrix(1.7, 1.7))
        path = os.path.join(IMG_DIR, "page_%03d_img_1.jpeg" % (i + 1))
        pix.save(path, jpg_quality=88)
    print("渲染卡图 %d 张 -> %s" % (count, IMG_DIR))


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    pdf = fitz.open(PDF)
    count = pdf.page_count
    print("rebsquad.pdf 页数:", count)
    assert count == len(META), "页数与映射表不一致: %d vs %d" % (count, len(META))

    reader = PdfReader(PDF)
    pages = []
    for i in range(count):
        text = reader.pages[i].extract_text() or ""
        lines = clean_lines(text)
        name_lines, content_lines = split_name_content(lines)
        en, pts, unique, ace = META[i]
        pages.append({
            "ID": i + 1,
            "name": "\n".join(name_lines),
            "content": "\n".join(content_lines),
            "image": "images/page_%03d_img_1.jpeg" % (i + 1),
            "nameEn": en,
            "unique": unique,
            "ace": ace,
        })

    render_images(pdf, count)

    out = {
        "file": os.path.basename(PDF),
        "total_pages": count,
        "total_images": count,
        "pages": pages,
    }
    out_path = os.path.join(OUT_DIR, "text.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("写出", out_path)

    # 简单自检：unique/ace 与卡面文本检测一致
    mism = 0
    for p in pages:
        det_u = p["name"].split("\n")[0].startswith("·")
        det_a = "自带防御标记" in p["content"]
        if det_u != p["unique"] or det_a != p["ace"]:
            mism += 1
            print("!! 不一致 page", p["ID"], p["nameEn"], "unique asset=%s detect=%s ace asset=%s detect=%s"
                  % (p["unique"], det_u, p["ace"], det_a))
    print("卡面文本检测自检: %s" % ("全部一致" if mism == 0 else "%d 处不一致" % mism))


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    main()
