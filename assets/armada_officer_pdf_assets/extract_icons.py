#!/usr/bin/env python3
"""Extract one canonical copy of each inline Armada icon from the source PDF.

The PDF contains ordinary Chinese fonts. Its rules icons are small image
XObjects, so this script extracts selected canonical instances and also makes
transparent, square PNG variants intended for inline HTML use.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


CANONICAL_SOURCES = {
    "command-squadron": (26, "Image117"),
    "command-concentrate-fire": (53, "Image210"),
    "command-repair": (20, "Image94"),
    "command-navigate": (49, "Image196"),
    "command-any": (23, "Image107"),
    "defense-evade": (18, "Image86"),
    "defense-contain": (42, "Image169"),
    "defense-redirect": (45, "Image182"),
    "upgrade-commander": (13, "Image60"),
    "upgrade-officer": (13, "Image61"),
    "upgrade-defensive-retrofit": (21, "Image98"),
    "attack-critical": (32, "Image138"),
}


def make_web_icon(source: Image.Image, canvas_size: int = 64) -> Image.Image:
    """Turn the off-white raster icon into a transparent black inline icon."""

    rgb = source.convert("RGB")
    alpha = Image.new("L", rgb.size)
    pixels = list(rgb.get_flattened_data())

    alpha_pixels = []
    for red, green, blue in pixels:
        luminance = (299 * red + 587 * green + 114 * blue) // 1000
        opacity = max(0, min(255, round((205 - luminance) * 5)))
        alpha_pixels.append(opacity)
    alpha.putdata(alpha_pixels)

    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox:
        alpha = alpha.crop(bbox)

    target_extent = 52
    scale = min(target_extent / alpha.width, target_extent / alpha.height)
    size = (max(1, round(alpha.width * scale)), max(1, round(alpha.height * scale)))
    alpha = alpha.resize(size, Image.Resampling.LANCZOS)

    result = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    glyph = Image.new("RGBA", size, (20, 24, 28, 0))
    glyph.putalpha(alpha)
    result.alpha_composite(
        glyph,
        ((canvas_size - size[0]) // 2, (canvas_size - size[1]) // 2),
    )
    return result


def find_page_image(page, image_name: str):
    for image_file in page.images:
        if Path(image_file.name).stem == image_name:
            return image_file.image
    raise KeyError(f"Image {image_name!r} not found on page")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "icons",
    )
    args = parser.parse_args()

    original_dir = args.output / "original"
    web_dir = args.output / "web"
    original_dir.mkdir(parents=True, exist_ok=True)
    web_dir.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(str(args.pdf))
    for icon_id, (page_number, image_name) in CANONICAL_SOURCES.items():
        source = find_page_image(reader.pages[page_number - 1], image_name).convert("RGB")
        source.save(original_dir / f"{icon_id}.png")
        make_web_icon(source).save(web_dir / f"{icon_id}.png")
        print(f"{icon_id}: page {page_number}, {image_name}, {source.width}x{source.height}")


if __name__ == "__main__":
    main()
