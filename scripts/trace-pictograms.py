#!/usr/bin/env python3
"""
Trace official pictogram PNGs to clean vector SVGs.

Produces two outputs per pictogram:

1. vector/<name>.svg — full tile: white pictogram + baked caption on
   brown rounded background. Drop-in replacement for the PNG, infinite
   resolution.

2. vector/silhouette/<name>.svg — pictogram silhouette only (caption
   masked out before trace), white shape on transparent background.
   Use this in composite signs (T1-T6) where you place your own caption,
   arrow, distance, QR around the pictogram.

Pipeline per pictogram:
  PNG (white pict on brown bg, with caption)
   ↓ PIL: grayscale, [silhouette: mask out caption area], threshold + invert
  PBM (white shapes = dark for potrace)
   ↓ potrace -s --tight
  SVG (raw, black-on-white)
   ↓ wrap: extract paths, recolor white, place on brown bg or transparent
  Final SVG

Requirements: Pillow (`pip3 install Pillow`), potrace (`brew install potrace`).

Run from repo root:
    python3 scripts/trace-pictograms.py
"""

from __future__ import annotations
import re
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parent.parent
SRC_DIR = REPO / "docs/trails/project/02-signage-system/mockups/pictograms/official"
OUT_DIR = SRC_DIR / "vector"
SIL_DIR = OUT_DIR / "silhouette"
TMP_DIR = Path("/tmp/trace-pictograms")

# Threshold: pixels brighter than this become foreground (the white pictogram).
# Brown body is ~80 gray, white pictogram/text is 255. 200 sits comfortably above
# brown and below white — leaves room for anti-aliased edges on either side.
THRESHOLD = 200

# For silhouette mode: caption sits roughly y > 0.68 of the image. Anything below
# that line is masked with brown (gray ~80) so the trace ignores it. Lower values
# are safer (cleaner) but risk clipping pictograms that extend low (e.g. the
# hiker's feet sit around y = 0.62 on #38).
CAPTION_CUTOFF_Y = 0.68

# The source tiles have a thin (~2 px) white border around the brown rounded
# rect, separating it from the drop shadow. The trace picks this up as a giant
# rounded-rect path. We mask the outer N pixels with brown gray to suppress it.
BORDER_INSET_PX = 30

# potrace tuning. turdsize=2 removes single-pixel noise; alphamax controls
# corner smoothing (default 1.0); opttolerance is curve-fit slack (default 0.2).
POTRACE_ARGS = ["-s", "--tight", "--turdsize", "2"]


def png_to_pbm(src: Path, dst: Path, silhouette: bool = False) -> tuple[int, int]:
    """Threshold + invert so white in source → black in output (potrace foreground).

    silhouette=True: masks the white outer border (to kill the rounded-rect frame)
    AND masks the caption area at the bottom — keeps only the pictogram silhouette.
    """
    img = Image.open(src).convert("L")
    w, h = img.size
    if silhouette:
        draw = ImageDraw.Draw(img)
        # 1. Caption area at the bottom → brown
        y0 = int(h * CAPTION_CUTOFF_Y)
        draw.rectangle([0, y0, w, h], fill=80)
        # 2. Outer border frame → brown (paint a "C-shaped" mask around the inside)
        n = BORDER_INSET_PX
        # top strip
        draw.rectangle([0, 0, w, n], fill=80)
        # bottom strip (above caption cutoff)
        draw.rectangle([0, y0 - n, w, y0], fill=80)
        # left strip
        draw.rectangle([0, 0, n, h], fill=80)
        # right strip
        draw.rectangle([w - n, 0, w, h], fill=80)
    bw = img.point(lambda p: 0 if p > THRESHOLD else 255).convert("1")
    dst.parent.mkdir(parents=True, exist_ok=True)
    bw.save(dst)
    return bw.size


def run_potrace(pbm: Path, svg: Path) -> None:
    subprocess.run(
        ["potrace", *POTRACE_ARGS, "-o", str(svg), str(pbm)],
        check=True,
        capture_output=True,
    )


PATH_RX = re.compile(r"<path[^>]*d=\"[^\"]+\"[^/]*/>")
VB_RX = re.compile(r'viewBox="([^"]+)"')
INNER_G_RX = re.compile(
    r'<g\s+transform="([^"]+)"\s+fill="[^"]+"\s+stroke="[^"]+">(.*?)</g>',
    re.DOTALL,
)


def _parse_potrace(raw_svg: Path) -> tuple[float, float, str, str]:
    src = raw_svg.read_text()
    m_vb = VB_RX.search(src)
    m_inner = INNER_G_RX.search(src)
    if not (m_vb and m_inner):
        raise RuntimeError(f"Failed to parse {raw_svg}")
    vb = m_vb.group(1).split()
    return float(vb[2]), float(vb[3]), m_inner.group(1), m_inner.group(2).strip()


def wrap_white_on_brown(raw_svg: Path, dst: Path) -> int:
    """Re-emit as white shapes on brown rounded background."""
    w, h, transform, paths = _parse_potrace(raw_svg)
    rx = round(w * 0.08, 2)  # matches the source tile's corner radius
    out = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {w:g} {h:g}" role="img">\n'
        f'  <rect width="{w:g}" height="{h:g}" rx="{rx}" fill="#714A07"/>\n'
        f'  <g transform="{transform}" fill="#fff">\n'
        f"    {paths}\n"
        f"  </g>\n"
        f"</svg>\n"
    )
    dst.write_text(out)
    return len(out)


def wrap_silhouette(raw_svg: Path, dst: Path) -> int:
    """Re-emit as white shapes on transparent background, normalized to a
    1000×1000 viewBox with content scaled to fit (preserving aspect) and centered.

    Consistent viewBox lets composite signs (T1-T6) embed any silhouette and
    scale it with the same factor — a `<use … width="160" height="160">`
    always renders 160×160, regardless of the source pictogram's aspect ratio.
    """
    w, h, transform, paths = _parse_potrace(raw_svg)
    target = 1000.0
    scale = target / max(w, h)
    sw, sh = w * scale, h * scale
    tx, ty = (target - sw) / 2, (target - sh) / 2
    out = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {target:g} {target:g}" role="img">\n'
        f'  <g transform="translate({tx:g} {ty:g}) scale({scale:g})">\n'
        f'    <g transform="{transform}" fill="#fff">\n'
        f"      {paths}\n"
        f"    </g>\n"
        f"  </g>\n"
        f"</svg>\n"
    )
    dst.write_text(out)
    return len(out)


def main() -> int:
    if not SRC_DIR.exists():
        print(f"✗ source dir not found: {SRC_DIR}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SIL_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    pngs = sorted(SRC_DIR.glob("*.png"))
    if not pngs:
        print(f"✗ no PNGs in {SRC_DIR}", file=sys.stderr)
        return 1

    print(f"→ tracing {len(pngs)} pictograms from {SRC_DIR.relative_to(REPO)}")
    print(f"  full tiles    → {OUT_DIR.relative_to(REPO)}")
    print(f"  silhouettes   → {SIL_DIR.relative_to(REPO)}")
    print()

    total_in = total_full = total_sil = 0
    print(f"  {'name':<24} {'size':>9}  {'full SVG':>10}  {'silhouette':>10}")
    print(f"  {'-'*24} {'-'*9}  {'-'*10}  {'-'*10}")
    for png in pngs:
        stem = png.stem
        in_size = png.stat().st_size
        total_in += in_size

        # Full tile (with caption)
        pbm = TMP_DIR / f"{stem}.full.pbm"
        raw_svg = TMP_DIR / f"{stem}.full.raw.svg"
        out_svg = OUT_DIR / f"{stem}.svg"
        png_to_pbm(png, pbm, silhouette=False)
        run_potrace(pbm, raw_svg)
        full_size = wrap_white_on_brown(raw_svg, out_svg)
        total_full += full_size

        # Silhouette (border + caption masked out)
        pbm_s = TMP_DIR / f"{stem}.sil.pbm"
        raw_svg_s = TMP_DIR / f"{stem}.sil.raw.svg"
        out_svg_s = SIL_DIR / f"{stem}.svg"
        png_to_pbm(png, pbm_s, silhouette=True)
        run_potrace(pbm_s, raw_svg_s)
        sil_size = wrap_silhouette(raw_svg_s, out_svg_s)
        total_sil += sil_size

        print(f"  {stem:<24} {in_size:>7} B  {full_size:>8} B  {sil_size:>8} B")

    print()
    print(f"  Total in: {total_in} B")
    print(f"  Total full SVGs: {total_full} B ({100 * total_full / total_in:.0f}% of PNG)")
    print(f"  Total silhouette SVGs: {total_sil} B")
    print(f"  Raw potrace SVGs kept in {TMP_DIR} (outside repo).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
