# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Russian-language single-page landing for the village Святогорово (Dmitrov district, Moscow oblast) — pilgrimage / spiritual tourism. Canonical host: `https://святогорово.рф/`. Deployed to GitHub Pages at `svyatogorovo/page` via `gh-pages -d dist`. SEO is a first-class concern (see `docs/strategy.md`): JSON-LD, sitemap, Yandex Turbo RSS, llms.txt, geo meta — preserve these when editing `index.html`.

## Commands

- `npm run dev` — Vite dev server on `0.0.0.0:3078`
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the built `dist/`
- `npm run deploy` — runs `predeploy` (build) then `gh-pages -d dist` to push to GitHub Pages
- `node scripts/gen-topo.js` — re-fetch the elevation grid from OpenTopoData and overwrite `src/topo-data.js`. Only run when you intend to regenerate the topographic data; the output file is auto-generated and must not be hand-edited.

There is no test suite, linter, or formatter configured.

## Architecture

### Single HTML, vanilla stack
All content lives in `index.html` (~800 lines, Russian copy + JSON-LD blocks + SEO meta). The JS layer is plain ES modules, no framework. Styles are organized as SCSS partials under `src/styles/` with `src/style.scss` as the entry point that `@use`s them in order (tokens → fonts → base → components). Entry point for JS is `src/main.js`, which imports `src/style.scss` and the topo canvas module.

### SCSS organization
- `src/styles/_variables.scss` — design tokens: colors (`$color-bg`, `$color-accent`, `$color-cta`, …), fonts (`$font-body` Arial, `$font-display` VezitsaCyrillic), breakpoints (`$bp-sm: 600px`, `$bp-md: 900px`), easings.
- `src/styles/_mixins.scss` — `@mixin up($bp)` for min-width queries and `@mixin reduced-motion` for `prefers-reduced-motion: reduce`. Use them instead of raw `@media` literals — keeps breakpoints consistent.
- Component partials: `_base`, `_fonts`, `_masonry`, `_map`, `_nav`, `_story`, `_faq`, `_footer`, `_animations`, `_topo`, `_photoswipe`.
- **Mobile-first**: each component declares mobile styles as defaults and uses `@include up($bp-sm) { ... }` to opt into desktop. Do not append a trailing `@media (max-width: 599px)` override block — that pattern was retired during the SCSS reorg.
- **Font cascade**: the old `* { font-family: VezitsaCyrillic }` rule was removed. `body` defaults to `$font-body`; headings and `button` opt into `$font-display` via `_base.scss`. If you add a text element that needs the display face, declare it explicitly — don't rely on a global.

### Vite build pipeline (`vite.config.js`)
Two notable things happen at build time:
1. `ViteImageOptimizer` re-encodes `jpg/jpeg/webp/png` at quality 75.
2. A small custom plugin `inlineCssPlugin` (defined in-file) **inlines the emitted CSS into the HTML `<style>` tag** and deletes the standalone CSS asset. This is intentional — it eliminates the render-blocking stylesheet for Lighthouse. Anything that assumes a separate `.css` file in production will break.

### JS modules
- `src/main.js` — all page UI behavior:
  - Map 3D-tilt on `.map` driven by `mousemove` → `requestAnimationFrame` (RAF batches writes); only enabled when `(hover: hover) and (pointer: fine)` matches and `prefers-reduced-motion` is not set. Touch devices are deliberately excluded — see comments in `main.js` around the `canHover` check.
  - Scroll spy that toggles `.site-nav__link--active` and centers the active link in the horizontally-scrollable mobile nav.
  - IntersectionObserver-driven `.is-visible` toggling for `.masonry-item`, `.faq__item`, and `.section-divider`. The matching `.animate-in` initial state is also added by JS.
  - Back-to-top button (`#back-to-top`) with a self-clearing guard against scroll-listener flicker.
  - PhotoSwipe v5 lightbox: lazy-imported, opens on click of any `.masonry-item_type_image`. Before opening, snapshots the topo canvas to a data URL and sets it as the PhotoSwipe `background-image` so contour lines bleed through.
  - Parallax: writes to the `translate` CSS property (separate from `transform`) so it never collides with the tilt or animate-in transforms.
  - All motion paths are gated on `matchMedia("(prefers-reduced-motion: reduce)")` — keep this when adding new effects.
- `src/topo.js` + `src/topo-data.js` — animated topographic contour-line background drawn on `#topo-canvas`. The data file is a 10×10 normalized elevation grid (real elevations around 56.404361, 37.821090). At runtime topo.js bilinearly upsamples to 60×60, box-blurs twice, then runs marching squares for 16 thresholds to produce contour polylines, which are drawn as smoothed quadratic curves with a sinusoidal opacity pulse. The canvas is taller than the viewport (`EXTRA = 220` on each side) and gets a slow CSS `translateY` parallax (`PARALLAX = 0.042`).
- `src/route.js` — appears to be older animated-path code referencing `#animation-svg` and `#dotted-line`. **It is not imported by `main.js`**, even though the matching DOM elements exist in `index.html`. Check before relying on it.

### Class naming
BEM-ish: block, `block__element`, `block_modifier`, `block_key_value`. Examples in markup: `masonry-item_type_image`, `masonry-item_wide`, `site-nav__link--active`. Match this convention when adding markup or styles.

### Mobile layout
Mobile is the default in each component partial; desktop styles are opt-in via `@include up($bp-sm)` (or `up($bp-md)`). Components with significantly different mobile shapes (e.g. `.site-nav` becomes a floating pill at the bottom on mobile vs. a sticky top bar on desktop) declare the mobile shape first and reset properties inside the `@include up(...)` block.

## Conventions

- Code comments and SCSS section headers are mostly in English; UI copy and `index.html` content is Russian. Keep that split.
- Always respect `prefers-reduced-motion` for any new animation.
- Use `history.replaceState` (not `pushState`) for in-page anchor navigation — established pattern in `main.js` to avoid polluting browser history with hash entries.
- Cursor rule from `.cursor/rules/project.mdc`: when writing code, be confident it works and does not break existing behavior.
