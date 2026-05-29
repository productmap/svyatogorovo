#!/usr/bin/env python3
"""
Build production-ready SVG signs from mockups.

For each composite mockup in `02-signage-system/mockups/signs/*.svg`:
- Add `width="Xmm" height="Ymm"` to the root `<svg>` (matching viewBox).
- Inject a production header comment with the per-sign physical size,
  Pantone color, font, and the AI workflow checklist.
- Generate and embed real QR codes (via the `qrcode` library) on top of the
  mockup's stylized placeholders. URLs and positions come from `SIGN_QRS`.
- Append a hidden `#construction-grid` layer (M = 25 mm) for inspection.

Output: `02-signage-system/production/<name>.svg`.

Requirements:
  pip3 install Pillow 'qrcode[pil]'

Run from repo root:
  python3 scripts/build-production-signs.py
"""

from __future__ import annotations
import re
import sys
from pathlib import Path
import qrcode

REPO = Path(__file__).resolve().parent.parent
MOCKUPS = REPO / "docs/trails/project/02-signage-system/mockups/signs"
OUT = REPO / "docs/trails/project/02-signage-system/production"

BASE_URL = "https://святогорово.рф"

# Per-sign QR placements. Each {url, x, y, size} positions the QR's white
# background at (x, y) in mm coords, sized to `size` mm × `size` mm. Sizes are
# chosen to overlay the mockup's placeholder exactly (or contain it).
SIGN_QRS: dict[str, list[dict]] = {
    "T1-entry-stand": [
        {"url": f"{BASE_URL}/", "x": 1740, "y": 1300, "size": 180},
    ],
    "T2-stela": [
        {"url": f"{BASE_URL}/#sergiy", "x": 430, "y": 980, "size": 120},
    ],
    "T3-indicator": [
        {"url": f"{BASE_URL}/#krest", "x": 796, "y": 235, "size": 60},
        {"url": f"{BASE_URL}/#church", "x": 796, "y": 515, "size": 60},
        {"url": f"{BASE_URL}/#guest", "x": 796, "y": 795, "size": 60},
    ],
    "T4-plaque-cross": [
        {"url": f"{BASE_URL}/#krest", "x": 680, "y": 510, "size": 80},
    ],
    "T4-plaque-chapel": [
        {"url": f"{BASE_URL}/#church", "x": 680, "y": 510, "size": 80},
    ],
    "T4-plaque-spring": [
        {"url": f"{BASE_URL}/#kupel", "x": 680, "y": 510, "size": 80},
    ],
    "T5-rest-area": [],  # no QR
    "T6-guesthouse": [
        {"url": f"{BASE_URL}/#guest", "x": 796, "y": 235, "size": 60},
    ],
}


# Per-sign descriptive header for the production comment block
SIGN_TITLES: dict[str, tuple[str, str]] = {
    "T1-entry-stand": ("T1 — Главный въездной стенд", "2000 × 1500 мм (80M × 60M @ M = 25 мм)"),
    "T2-stela": ("T2 — Стела маршрута", "600 × 1200 мм (24M × 48M @ M = 25 мм)"),
    "T3-indicator": ("T3 — Указатели направления (узел из 3 панелей)", "900 × 1300 мм (мачта + панели 780×220)"),
    "T4-plaque-cross": ("T4 — Интерпретационная табличка (Поклонный крест)", "800 × 600 мм (32M × 24M @ M = 25 мм)"),
    "T4-plaque-chapel": ("T4 — Интерпретационная табличка (Часовня свт. Николая)", "800 × 600 мм (32M × 24M @ M = 25 мм)"),
    "T4-plaque-spring": ("T4 — Интерпретационная табличка (Купель)", "800 × 600 мм (32M × 24M @ M = 25 мм)"),
    "T5-rest-area": ("T5 — Знак зоны отдыха", "400 × 400 мм (16M × 16M @ M = 25 мм)"),
    "T6-guesthouse": ("T6 — Опорный знак гостевого дома", "900 × 450 мм (мачта + панель 780×220)"),
}


def production_header(stem: str, width: float, height: float) -> str:
    title, size_desc = SIGN_TITLES.get(stem, (stem, f"{width:g} × {height:g} мм"))
    qrs = SIGN_QRS.get(stem, [])
    qr_block = "\n".join(
        f"                       · {q['url']}  ({q['size']}×{q['size']} мм @ {q['x']},{q['y']})"
        for q in qrs
    ) or "                       · нет"
    return f"""<!--
  {title}
  Production-ready SVG.

  Physical size: {size_desc}
  Color:         Pantone 731 C  (RGB 113,74,7  ·  CMYK 34,65,100,43  ·  RAL 8008 Olivebrown)
  Typeface:      Myriad Pro Bold Condensed (заголовок) + Condensed (вспомог.)
  Pictograms:    Официальные, извлечены из Метод-пособия Минкультуры РФ (2013),
                 векторизованы potrace. Согласно ГОСТ Р 57581-2017.
  QR codes:      Сгенерированы автоматически на URL'ы лендинга:
{qr_block}

  Импорт в Adobe Illustrator:
    File → Open (или Place). Артборд автоматически {size_desc.split(' (')[0]}.
    Все координаты внутри — в миллиметрах.

  Перед сдачей в печать:
    1. Type → Create Outlines  (все надписи в кривые).
    2. Проверить QR-коды сканером — должны открывать соответствующий якорь лендинга.
    3. Цвет: Pantone 731 C для офсета, CMYK 34/65/100/43 для цифровой.
-->
"""


def parse_viewbox(svg_text: str) -> tuple[float, float]:
    m = re.search(r'viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"', svg_text)
    if not m:
        raise ValueError("Failed to parse viewBox")
    return float(m.group(1)), float(m.group(2))


def add_root_dims(svg_text: str, width: float, height: float) -> str:
    # Replace the opening <svg ...> with one that has width/height in mm
    # Preserve all other attrs (xmlns, viewBox, role, aria-label, etc.)
    return re.sub(
        r'<svg\s+',
        f'<svg width="{width:g}mm" height="{height:g}mm" ',
        svg_text,
        count=1,
    )


# Strip debug labels (rendered as bottom-corner draft tags in the mockups).
# Matches any <text> whose content contains "DRAFT" or a "vN.N" version
# (e.g. T5's bare "T5 v0.1" label which has no DRAFT word). Useful while
# iterating but pollute the production file — the README's workflow
# checklist already covers their role.
_DRAFT_TEXT_RX = re.compile(
    r'\s*<text[^>]*>[^<]*(?:DRAFT|v\d+\.\d+)[^<]*</text>',
    re.IGNORECASE,
)


def strip_draft_labels(svg_text: str) -> tuple[str, int]:
    count = len(_DRAFT_TEXT_RX.findall(svg_text))
    return _DRAFT_TEXT_RX.sub("", svg_text), count


def generate_qr_svg(url: str, x: float, y: float, size: float) -> str:
    """Generate a real QR code as inline SVG content. Returns a `<g>` element
    positioned at (x, y) with total display size `size` × `size` mm."""
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        border=4,  # 4-module quiet zone, per QR spec
    )
    qr.add_data(url)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    n = len(matrix)  # total modules including quiet zone
    module_mm = size / n

    # Build a single compact path for all "on" modules.
    # Use M (absolute moveto) + h + v + h + z for each square.
    parts: list[str] = []
    for r, row in enumerate(matrix):
        for c, on in enumerate(row):
            if on:
                cx = c * module_mm
                cy = r * module_mm
                parts.append(
                    f"M{cx:.3f} {cy:.3f}h{module_mm:.3f}v{module_mm:.3f}h{-module_mm:.3f}z"
                )

    return (
        f'<g class="qr-code" data-url="{url}" '
        f'transform="translate({x:g} {y:g})">\n'
        f'    <rect width="{size:g}" height="{size:g}" fill="#FFFFFF"/>\n'
        f'    <path fill="#000000" d="{"".join(parts)}"/>\n'
        f"  </g>"
    )


def generate_construction_grid(w: float, h: float, module: float = 25) -> str:
    """Build a hidden grid layer (M-step lines)."""
    nx = int(w / module) + 1
    ny = int(h / module) + 1

    def _vline(i: int) -> str:
        x = i * module
        extra = ' stroke-width="0.6"' if abs(x - w / 2) < 0.01 else ""
        return f'<line x1="{x:g}" y1="0" x2="{x:g}" y2="{h:g}"{extra}/>'

    def _hline(i: int) -> str:
        y = i * module
        extra = ' stroke-width="0.6"' if abs(y - h / 2) < 0.01 else ""
        return f'<line x1="0" y1="{y:g}" x2="{w:g}" y2="{y:g}"{extra}/>'

    vlines = "".join(_vline(i) for i in range(nx))
    hlines = "".join(_hline(i) for i in range(ny))
    return f"""
  <!-- Construction grid (M = {module:g} mm). Hidden; unhide in AI to inspect ГОСТ 52290 modularity. -->
  <g id="construction-grid" display="none" stroke="#FFFFFF" stroke-width="0.3" opacity="0.4">
    {vlines}
    {hlines}
  </g>
"""


def build_one(mockup: Path) -> dict:
    stem = mockup.stem
    text = mockup.read_text()
    w, h = parse_viewbox(text)

    # 1. Add width/height in mm
    text = add_root_dims(text, w, h)

    # 1a. Drop DRAFT debug labels from the bottom of mockups
    text, draft_count = strip_draft_labels(text)

    # 2. Inject production header right after <?xml...> if present, or at top
    header = production_header(stem, w, h)
    if text.startswith("<?xml"):
        end = text.index("?>") + 2
        text = text[:end] + "\n" + header + text[end:]
    else:
        text = '<?xml version="1.0" encoding="UTF-8"?>\n' + header + text

    # 3. Find </svg> closing tag — inject QR codes and grid right before it
    qr_section = ""
    for qr in SIGN_QRS.get(stem, []):
        qr_section += "  " + generate_qr_svg(qr["url"], qr["x"], qr["y"], qr["size"]) + "\n"
    grid_section = generate_construction_grid(w, h)

    insertion = ""
    if qr_section:
        insertion += "\n  <!-- ══════════════ Real QR codes (overlay on placeholders) ══════════════ -->\n"
        insertion += qr_section
    insertion += grid_section

    text = text.replace("</svg>", insertion + "\n</svg>", 1)

    # 4. Write
    out_path = OUT / mockup.name
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text)

    return {
        "name": stem,
        "size_mm": (w, h),
        "qrs": len(SIGN_QRS.get(stem, [])),
        "drafts_stripped": draft_count,
        "out_bytes": len(text),
    }


def main() -> int:
    if not MOCKUPS.exists():
        print(f"✗ mockups dir not found: {MOCKUPS}", file=sys.stderr)
        return 1

    mockups = sorted(MOCKUPS.glob("*.svg"))
    print(f"→ building {len(mockups)} production signs → {OUT.relative_to(REPO)}")
    print()
    print(f"  {'name':<22}  {'physical size':<14}  {'QRs':>3}  {'drafts':>6}  {'output':>8}")
    print(f"  {'-'*22}  {'-'*14}  {'-'*3}  {'-'*6}  {'-'*8}")
    for mockup in mockups:
        info = build_one(mockup)
        w, h = info["size_mm"]
        drafts = f"-{info['drafts_stripped']}" if info["drafts_stripped"] else ""
        print(
            f"  {info['name']:<22}  {w:g} × {h:g} mm{' ' * (8 - len(f'{w:g} × {h:g}'))}  "
            f"{info['qrs']:>3}  {drafts:>6}  {info['out_bytes']:>6} B"
        )
    print()
    print(f"✓ Production signs written to {OUT.relative_to(REPO)}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
