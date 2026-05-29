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

# The source tiles have a thin white border around the brown rounded rect.
# A straight-edge mask covers the outer band; what survives are picked up by
# the post-trace artifact filter (drops paths that are thin + long, i.e.
# slivers along the source's frame edge).
BORDER_INSET_PX = 30

# Post-trace artifact filter thresholds, in potrace coords (10× source pixels):
# drop paths whose bbox is <6 px in one dimension and >200 px in the other.
# Pictogram features (limbs, dots, lines) are always thicker or shorter than
# these bounds; frame-edge slivers reliably match.
ARTIFACT_THIN = 60
ARTIFACT_LONG = 2000

# potrace tuning. turdsize=2 removes single-pixel noise; alphamax controls
# corner smoothing (default 1.0); opttolerance is curve-fit slack (default 0.2).
POTRACE_ARGS = ["-s", "--tight", "--turdsize", "2"]


def png_to_pbm(src: Path, dst: Path, silhouette: bool = False) -> tuple[int, int]:
    """Threshold + invert so white in source → black in output (potrace foreground).

    silhouette=True: masks the white outer border AND the caption.
    """
    img = Image.open(src).convert("L")
    w, h = img.size
    if silhouette:
        draw = ImageDraw.Draw(img)
        # Caption area at the bottom → brown
        y0 = int(h * CAPTION_CUTOFF_Y)
        draw.rectangle([0, y0, w, h], fill=80)
        # Outer border frame → brown (rectangular strips)
        n = BORDER_INSET_PX
        draw.rectangle([0, 0, w, n], fill=80)
        draw.rectangle([0, y0 - n, w, y0], fill=80)
        draw.rectangle([0, 0, n, h], fill=80)
        draw.rectangle([w - n, 0, w, h], fill=80)
    bw = img.point(lambda p: 0 if p > THRESHOLD else 255).convert("1")
    dst.parent.mkdir(parents=True, exist_ok=True)
    bw.save(dst)
    return bw.size


# Path bbox parser — supports the subset of SVG d-commands potrace emits
# (M/m, L/l, C/c, Z/z, plus implicit lineto after moveto).
_TOKEN_RX = re.compile(r"[A-Za-z]|-?\d*\.?\d+(?:[eE]-?\d+)?")


def path_bbox(d: str) -> tuple[float, float, float, float] | None:
    """Return (xmin, ymin, xmax, ymax) of an SVG path's d-attribute."""
    tokens = _TOKEN_RX.findall(d.replace("\n", " "))
    if not tokens:
        return None
    x = y = sx = sy = 0.0
    xs: list[float] = []
    ys: list[float] = []
    cmd = ""
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                x, y = sx, sy
            continue
        if cmd in "Mm":
            dx, dy = float(tokens[i]), float(tokens[i + 1])
            x = dx if cmd == "M" else x + dx
            y = dy if cmd == "M" else y + dy
            sx, sy = x, y
            xs.append(x); ys.append(y)
            i += 2
            cmd = "L" if cmd == "M" else "l"
        elif cmd in "Ll":
            dx, dy = float(tokens[i]), float(tokens[i + 1])
            x = dx if cmd == "L" else x + dx
            y = dy if cmd == "L" else y + dy
            xs.append(x); ys.append(y)
            i += 2
        elif cmd in "Cc":
            for k in range(3):
                dx, dy = float(tokens[i]), float(tokens[i + 1])
                nx = dx if cmd == "C" else x + dx
                ny = dy if cmd == "C" else y + dy
                xs.append(nx); ys.append(ny)
                i += 2
                if k == 2:
                    x, y = nx, ny
        elif cmd in "Hh":
            dx = float(tokens[i])
            x = dx if cmd == "H" else x + dx
            xs.append(x); ys.append(y)
            i += 1
        elif cmd in "Vv":
            dy = float(tokens[i])
            y = dy if cmd == "V" else y + dy
            xs.append(x); ys.append(y)
            i += 1
        else:
            i += 1
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def _is_artifact(d: str) -> bool:
    """True if path's bbox is the thin-long-sliver shape of a frame-edge artifact."""
    bbox = path_bbox(d)
    if bbox is None:
        return False
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    return (bw < ARTIFACT_THIN and bh > ARTIFACT_LONG) or (
        bh < ARTIFACT_THIN and bw > ARTIFACT_LONG
    )


_PATH_RX = re.compile(r'<path\s+d="([^"]+)"\s*/>', re.DOTALL)


def filter_artifacts(paths_text: str) -> tuple[str, int]:
    """Drop any <path/> whose d-attribute is an artifact sliver. Returns (new_text, dropped_count)."""
    kept: list[str] = []
    dropped = 0
    for m in _PATH_RX.finditer(paths_text):
        if _is_artifact(m.group(1)):
            dropped += 1
        else:
            kept.append(m.group(0))
    return "\n".join(kept), dropped


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


def wrap_silhouette(raw_svg: Path, dst: Path) -> tuple[int, int]:
    """Re-emit as white shapes on transparent background, normalized to a
    1000×1000 viewBox with content scaled to fit (preserving aspect) and centered.
    Filters out frame-edge artifact slivers before emitting.

    Returns (output_bytes, dropped_paths_count).
    """
    w, h, transform, paths = _parse_potrace(raw_svg)
    paths, dropped = filter_artifacts(paths)
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
    return len(out), dropped


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

    total_in = total_full = total_sil = total_dropped = 0
    print(f"  {'name':<24} {'size':>9}  {'full':>8}  {'silhouette':>10}  artifacts")
    print(f"  {'-'*24} {'-'*9}  {'-'*8}  {'-'*10}  {'-'*9}")
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

        # Silhouette (border + caption masked, artifact paths filtered)
        pbm_s = TMP_DIR / f"{stem}.sil.pbm"
        raw_svg_s = TMP_DIR / f"{stem}.sil.raw.svg"
        out_svg_s = SIL_DIR / f"{stem}.svg"
        png_to_pbm(png, pbm_s, silhouette=True)
        run_potrace(pbm_s, raw_svg_s)
        sil_size, dropped = wrap_silhouette(raw_svg_s, out_svg_s)
        total_sil += sil_size
        total_dropped += dropped

        marker = f"-{dropped}" if dropped else ""
        print(f"  {stem:<24} {in_size:>7} B  {full_size:>6} B  {sil_size:>8} B  {marker}")

    print()
    print(f"  Total in: {total_in} B")
    print(f"  Total full SVGs: {total_full} B ({100 * total_full / total_in:.0f}% of PNG)")
    print(f"  Total silhouette SVGs: {total_sil} B")
    print(f"  Artifact paths dropped: {total_dropped}")
    print(f"  Raw potrace SVGs kept in {TMP_DIR} (outside repo).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
