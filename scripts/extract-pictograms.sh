#!/usr/bin/env bash
# Extract pictogram PNGs from the Methodology booklet PDF.
#
# Source: docs/trails/Metod-Posobie.pdf (Минкультуры РФ, 2013).
# Pictograms live on pages 22-45 (раздел 3.5).
# Each page has 1-3 pictograms; each pictogram is stored as
# (RGB image + soft mask) — we only keep the RGB image; the mask is
# just a rounded-rect shape with drop shadow and is discarded.
#
# Requires Poppler tools: `brew install poppler` (provides pdfimages).
#
# Usage:
#   scripts/extract-pictograms.sh                 # default output: /tmp/picsfull
#   scripts/extract-pictograms.sh path/to/outdir  # custom output dir
#
# Output: PNG files named pNN-XXX.png where NN is page number,
# XXX is image index on that page (000 = first pictogram image,
# 002 = second, 004 = third; odd indices = soft masks).

set -euo pipefail

PDF="docs/trails/Metod-Posobie.pdf"
OUT="${1:-/tmp/picsfull}"

if [[ ! -f "$PDF" ]]; then
    echo "✗ PDF not found at $PDF" >&2
    echo "  Run this script from the repo root." >&2
    exit 1
fi

if ! command -v pdfimages >/dev/null 2>&1; then
    echo "✗ pdfimages not found. Install Poppler:" >&2
    echo "    brew install poppler" >&2
    exit 1
fi

mkdir -p "$OUT"
echo "→ extracting pages 22-45 of $PDF to $OUT"

for page in $(seq 22 45); do
    pdfimages -png -f $page -l $page "$PDF" "$OUT/p${page}"
    n=$(ls "$OUT"/p${page}-*.png 2>/dev/null | wc -l | tr -d ' ')
    printf "  p.%-2d → %s images\n" "$page" "$n"
done

echo
echo "✓ Done. Files in $OUT."
echo
echo "Mapping hint (only image indices, masks omitted):"
cat <<'HINT'
  page    pictograms (indices 000, 002, 004 = 1st/2nd/3rd on page)
  ------  ----------------------------------------------------------
  p.22    #01 Вокзал · #02 Аэропорт · #03 Морской вокзал
  p.23    #04 Речной вокзал · #05 Причал · #06 Стоянка судов
  p.24    #07 Автовокзал · #08 Туристский автобус · #09 Место отдыха
  p.25    #10 Гостиница · #11 Мотель · #12 Загородная гостиница
  p.26    #13 Горнолыжный курорт · #14 Спа курорт · #15 Ресторан
  p.27    #16 Театр · #17 Музей · #18 Концертный зал
  p.28    #19 Центр развлечений · #20 Детский центр · #21 Городской парк
  p.29    #22 Канатная дорога · #23 Высокоскоростное ж/д · #24 Галерея
  p.30    #25 Этнопарк · #26 Центр ремёсел · #27 Информация
  p.31    #28 ТИЦ · #29 Disabled access · #29.1 Disabled access (вариант)
  p.32    #30 Купание · #31 Летние спорт · #32 Зимние спорт
  p.33    #33 Водные спорт · #34 Спорт. объект · #35 Место мероприятия
  p.34    #36 Кемпинг
  p.35    #37 Нац. маршрут · #38 Пешеходный маршрут · #39 Велосипедный
  p.36    #40 Водный круиз · #41 Водный (малые) · #42 Рыбалка
  p.37    #43 Охотхозяйство · #44 Природная территория
  p.38    #45 Природная достоприм. · #46 Центр города · #47 Панорамный вид
  p.39    #48 Православный храм (a/b/c — 3 варианта по масштабу)
  p.40    #49 Костёл (a/b/c — 3 варианта)
  pp.41+  #50+ дальнейшие религ. объекты, дворцовые комплексы, памятники
HINT
