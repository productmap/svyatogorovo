import './style.scss'
import 'photoswipe/style.css'
import { initTopo } from './topo.js'

const topoCanvas = document.getElementById('topo-canvas');
const motionMatchMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
if (topoCanvas) initTopo(topoCanvas, motionMatchMedia.matches);

const map = document.querySelector(".map");

// ─── Map tilt ─────────────────────────────────────────────────────────────────

const THRESHOLD = 3;
const mapHeader = document.querySelector('.map-header');
const SPRING    = 'cubic-bezier(0.16, 1, 0.3, 1)';

// State written by mousemove, consumed by RAF
let tiltPending  = false;
let tiltTracking = false;
let tiltApplied  = false; // true only after at least one mousemove with actual tilt
let tiltState    = { rx: 0, ry: 0, w: 0, dx: 0, dy: 0 };

function flushTilt() {
  tiltPending = false;
  const { rx, ry, w, dx, dy } = tiltState;
  if (map)       map.style.transform      = `perspective(${w}px) rotateX(${ry}deg) rotateY(${rx}deg) scale3d(1,1,1)`;
  if (mapHeader) mapHeader.style.translate = `${dx}px ${dy}px`;
}

function handleHover(e) {
  const { clientX, clientY, currentTarget } = e;
  const { clientWidth, clientHeight } = currentTarget;
  const rect = currentTarget.getBoundingClientRect();
  const h = (clientX - rect.left) / clientWidth;
  const v = (clientY - rect.top)  / clientHeight;

  tiltState = {
    rx: +(THRESHOLD / 2 - h * THRESHOLD).toFixed(2),
    ry: +(v * THRESHOLD - THRESHOLD / 2).toFixed(2),
    w:  clientWidth,
    dx: +((h - 0.5) * -10).toFixed(1),
    dy: +((v - 0.5) * -7 ).toFixed(1),
  };

  if (!tiltTracking) {
    tiltTracking = true;
    map.style.transition = `transform 0.08s ease`;
    if (mapHeader) mapHeader.style.transition = `translate 0.08s ease`;
  }
  tiltApplied = true;
  if (!tiltPending) { tiltPending = true; requestAnimationFrame(flushTilt); }
}

function resetStyles() {
  tiltTracking = false;
  if (!tiltApplied) return; // touch tap fired enter+leave without mousemove — don't touch transform
  tiltApplied = false;
  const spring = `1.1s ${SPRING}`;
  if (map) {
    map.style.transition = `transform ${spring}`;
    map.style.transform  = `perspective(${map.clientWidth}px) rotateX(0deg) rotateY(0deg)`;
  }
  if (mapHeader) {
    mapHeader.style.transition = `translate ${spring}`;
    mapHeader.style.translate  = '0px 0px';
  }
}

// Only on pointer devices that can truly hover — excludes touch screens
const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (map && !motionMatchMedia.matches && canHover) {
  map.addEventListener('mouseenter', () => {
    const entry = `1.35s ${SPRING}`;
    map.style.transition = `transform ${entry}`;
    if (mapHeader) mapHeader.style.transition = `translate ${entry}`;
  });
  map.addEventListener('mousemove', handleHover);
  map.addEventListener('mouseleave', resetStyles);
}

// ─── Scroll to places ─────────────────────────────────────────────────────────

const placesButton = document.getElementById('places-button');
if (placesButton) {
  // Guard against re-entry: a second click while the smooth scroll is still
  // running restarts scrollIntoView from the current (barely-moved) position,
  // re-triggering the slow ease-in — so impatient double-clicks make the page
  // look frozen. Ignore clicks until we've arrived (or a 2s safety deadline).
  let scrollingToPlaces = false;

  placesButton.addEventListener('click', function (event) {
    event.preventDefault();
    if (scrollingToPlaces) return;
    const target = document.getElementById('places');
    if (!target) return;

    scrollingToPlaces = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const deadline = Date.now() + 2000;
    (function poll() {
      if (Math.abs(target.getBoundingClientRect().top) < 4 || Date.now() > deadline) {
        scrollingToPlaces = false;
      } else {
        requestAnimationFrame(poll);
      }
    }());
  });
}

// ─── Scroll animations ────────────────────────────────────────────────────────

if (!motionMatchMedia.matches) {
  const animObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        animObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

  document.querySelectorAll('.masonry-item, .faq__item').forEach(el => {
    el.classList.add('animate-in');
    animObserver.observe(el);
  });
}

// ─── FAQ accordion ───────────────────────────────────────────────────────────
// Native <details> snaps open. Intercept the toggle and let CSS transition the
// answer's grid track (0fr ⇄ 1fr) — no pixel measurement, so nothing snaps at
// the end. `.is-open` drives the track and the +/× icon; the `open` attribute
// is kept so the answer stays in the accessibility tree and crawlable, and is
// only dropped once the collapse transition has finished. `.is-enhanced` lets
// the CSS know JS is on — without it the answers stay plain native <details>.

const faqList = document.querySelector('.faq__list');
if (faqList) {
  faqList.classList.add('is-enhanced');

  faqList.querySelectorAll('.faq__item').forEach(item => {
    const summary = item.querySelector('.faq__question');
    const wrap    = item.querySelector('.faq__answer-wrap');
    if (!summary || !wrap) return;

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      const opening = !item.classList.contains('is-open');

      if (motionMatchMedia.matches) {
        item.open = opening;
        item.classList.toggle('is-open', opening);
        return;
      }

      if (opening) {
        item.open = true;               // render the answer — track starts at 0fr
        void wrap.offsetHeight;          // flush layout so 0fr is the committed start
        item.classList.add('is-open');   // → 1fr, transition runs
      } else {
        item.classList.remove('is-open'); // → 0fr, transition runs
        wrap.addEventListener('transitionend', function done(ev) {
          if (ev.propertyName !== 'grid-template-rows' || ev.target !== wrap) return;
          wrap.removeEventListener('transitionend', done);
          // Skip if the user re-opened the item mid-collapse.
          if (!item.classList.contains('is-open')) item.open = false;
        });
      }
    });
  });
}

// ─── Section divider draw-on ─────────────────────────────────────────────────

const dividerObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      dividerObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.section-divider').forEach(el => {
  if (motionMatchMedia.matches) {
    el.classList.add('is-visible');
  } else {
    dividerObserver.observe(el);
  }
});

// ─── Back to top ─────────────────────────────────────────────────────────────

const backToTop = document.getElementById('back-to-top');
const siteNav   = document.querySelector('.site-nav');
if (backToTop) {
  let scrollingToTop = false;

  function updateScrollUI() {
    if (scrollingToTop) return;
    const show = window.scrollY > 500;
    backToTop.classList.toggle('is-visible', show);
    if (siteNav) siteNav.classList.toggle('is-visible', show);
  }

  window.addEventListener('scroll', updateScrollUI, { passive: true });

  backToTop.addEventListener('click', () => {
    history.replaceState(null, '', location.pathname + location.search);
    if (siteNav) siteNav.classList.remove('is-visible');
    backToTop.classList.remove('is-visible');

    scrollingToTop = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Release the guard once we reach the top (or after a 3s safety deadline)
    const deadline = Date.now() + 3000;
    (function poll() {
      if (window.scrollY < 1) {
        scrollingToTop = false;
      } else if (Date.now() < deadline) {
        requestAnimationFrame(poll);
      } else {
        scrollingToTop = false;
        updateScrollUI();
      }
    }());
  });
}

// ─── Active nav ───────────────────────────────────────────────────────────────

const navLinks = document.querySelectorAll('.site-nav__link');
// Derive sections from the nav itself — single source of truth, no marker class.
const sections = [...navLinks]
  .map(l => document.getElementById(l.getAttribute('href').slice(1)))
  .filter(Boolean);

if (navLinks.length && sections.length) {
  const navList = document.querySelector('.site-nav__list');

  function scrollNavToActive(activeLink) {
    if (!navList || !activeLink) return;
    const listRect = navList.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const target = navList.scrollLeft + linkRect.left - listRect.left
                   - (listRect.width - linkRect.width) / 2;
    navList.scrollTo({ left: target, behavior: 'smooth' });
  }

  function updateActiveNav() {
    let current = '';
    // Last section sits near the end of the document, so scrollIntoView can't
    // bring it to the top of the viewport — we land at doc-bottom instead.
    // Detect that case and force the last section as active.
    const atBottom = window.innerHeight + window.scrollY
                     >= document.documentElement.scrollHeight - 4;
    if (atBottom) {
      current = sections[sections.length - 1].id;
    } else {
      const scrollY = window.scrollY + 80;
      sections.forEach(section => {
        const docTop = section.getBoundingClientRect().top + window.scrollY;
        if (docTop <= scrollY) current = section.id;
      });
    }
    let activeLink = null;
    navLinks.forEach(link => {
      const isActive = link.getAttribute('href') === `#${current}`;
      link.classList.toggle('site-nav__link--active', isActive);
      if (isActive) activeLink = link;
    });
    scrollNavToActive(activeLink);
  }

  // Intercept nav clicks — use replaceState so each click doesn't push a new history entry
  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
      history.replaceState(null, '', `#${id}`);
    });
  });

  window.addEventListener('scroll', updateActiveNav, { passive: true });
  updateActiveNav();
}

// ─── Lazy Yandex map ─────────────────────────────────────────────────────────
// The map widget is heavy. Native loading="lazy" only fires near the viewport,
// so it appears with a visible delay. Inject the src well ahead of time via an
// observer with a generous rootMargin, then fade the iframe in on `load`.

const footerMap = document.getElementById('footer-map');
if (footerMap) {
  const mapFrame = footerMap.querySelector('iframe');

  function loadMap() {
    if (!mapFrame || mapFrame.src) return;
    mapFrame.addEventListener('load', () => footerMap.classList.add('is-loaded'), { once: true });
    mapFrame.src = mapFrame.dataset.src;
  }

  if ('IntersectionObserver' in window) {
    const mapObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        mapObserver.disconnect();
        loadMap();
      }
    }, { rootMargin: '800px 0px' });
    mapObserver.observe(footerMap);
  } else {
    loadMap();
  }
}

// ─── Dynamic theme-color ─────────────────────────────────────────────────────
// Tint the browser chrome / status bar to match whatever section sits at the
// top of the viewport. Three dark surfaces: hero (.map-container), footer,
// and the open PhotoSwipe lightbox. Everything else falls back to parchment.

const themeMeta = document.querySelector('meta[name="theme-color"]');
const THEME = {
  light:  '#efead6',  // $color-bg — parchment
  hero:   '#080a07',  // .map-container background under the bg-1 photo
  footer: '#2a2620',  // $color-bg-dark
  pswp:   '#080a07',  // .pswp --pswp-bg (.91 opacity over topo snapshot)
};

const themeHero   = document.querySelector('.map-container');
const themeFooter = document.querySelector('.footer');

let themePswpLock = false;
let themeCurrent  = null;
let themeRafPending = false;

function setTheme(c) {
  if (!themeMeta || c === themeCurrent) return;
  themeCurrent = c;
  themeMeta.content = c;
}

// Fraction of the viewport vertically covered by `el` (0..1).
function visibilityRatio(el) {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  const visible = Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top);
  return Math.max(0, visible) / window.innerHeight;
}

function probeTheme() {
  themeRafPending = false;
  if (themePswpLock) return;
  let next = THEME.light;

  // Footer wins when it dominates the viewport (typical at page bottom,
  // where it occupies most of the screen but never touches the top edge).
  if (visibilityRatio(themeFooter) >= 0.5) {
    next = THEME.footer;
  } else {
    // Otherwise tint by whatever section sits at the top of the viewport —
    // that's what's actually adjacent to the browser address bar / chrome.
    // Probe at y=80 to stay clear of the sticky nav band (~47px desktop).
    const el = document.elementFromPoint(window.innerWidth / 2, 80);
    if (el) {
      if      (el.closest('.map-container')) next = THEME.hero;
      else if (el.closest('.footer'))        next = THEME.footer;
    }
  }
  setTheme(next);
}

function scheduleThemeProbe() {
  if (themeRafPending) return;
  themeRafPending = true;
  requestAnimationFrame(probeTheme);
}

if (themeMeta) {
  window.addEventListener('scroll', scheduleThemeProbe, { passive: true });
  window.addEventListener('resize', scheduleThemeProbe);
  probeTheme();
}

// ─── Lightbox (PhotoSwipe v5) ─────────────────────────────────────────────────

import('photoswipe').then(({ default: PhotoSwipe }) => {
  // Theme hooks shared by every lightbox instance: lock the dark theme-color
  // while open and paint the backdrop. `opts.backdrop` sets a cover image (the
  // map lightbox rides on the hero background, so the zoom lands on the same
  // scene as the cropped card); without it the backdrop is just the near-opaque
  // --pswp-bg veil. `opts.dim` overrides that veil alpha.
  function attachPswpTheme(pswp, opts = {}) {
    pswp.on('beforeOpen', () => {
      themePswpLock = true;
      setTheme(THEME.pswp);
    });

    // Paint the backdrop on `firstUpdate`: it is the first hook after
    // `pswp.element` exists (`beforeOpen` fires before _createMainStructure),
    // yet still runs before the opening animation, so the backdrop is in
    // place from the first frame.
    pswp.on('firstUpdate', () => {
      if (opts.backdrop) {
        pswp.element.style.backgroundImage = `url(${opts.backdrop})`;
        pswp.element.style.backgroundSize  = 'cover';
        pswp.element.style.backgroundPosition = 'center center';
      }
      // Veil alpha set inline — the library's own `.pswp { --pswp-bg: #000 }`
      // is bundled after our stylesheet and would win the cascade. With no
      // backdrop image (the gallery) the veil IS the backdrop, so it's fully
      // opaque dark: a topo snapshot here read as a second contour layer over
      // the page's own topo background showing through the translucent veil.
      // The map rides on its opaque bg-1 image instead, at a lighter veil.
      pswp.element.style.setProperty('--pswp-bg', opts.dim || 'rgba(8, 10, 7, 1)');
    });

    // `close` fires when the close animation begins — release the theme
    // lock so the underlying section re-takes over while the dialog fades.
    pswp.on('close', () => {
      themePswpLock = false;
      probeTheme();
    });
  }

  // On touch every tap routes through `tapAction` (default 'toggle-controls'),
  // so a tap outside the photo hid the chrome instead of closing — unlike the
  // mouse path, where `bgClickAction` closes. Restore the expected behaviour:
  // a tap on the photo still toggles the controls, a tap on the backdrop closes.
  // Invoked as fn.call(pswp, …), so `this` is the PhotoSwipe instance.
  function tapAction(point, originalEvent) {
    if (originalEvent.target.classList.contains('pswp__img')) {
      this.element?.classList.toggle('pswp--ui-visible');
    } else {
      this.close();
    }
  }

  // Masonry photo gallery — swipeable set of all `.masonry-item_type_image`.
  const imgEls = [...document.querySelectorAll('.masonry-item_type_image img.masonry-item__image')];
  if (imgEls.length) {
    const dataSource = imgEls.map(img => {
      // Prefer webp source if the browser resolved it
      const src = img.currentSrc || img.src;
      // Carry the on-image banner caption (only the few banner photos have one).
      const captionEl = img.closest('.masonry-item_type_image')?.querySelector('.masonry-item__banner-caption');
      return {
        src,
        // Same src as msrc: the browser has already decoded it for the on-page
        // thumb, so PhotoSwipe paints the morph from frame 1 instead of
        // showing its empty placeholder while the slide image decodes again.
        msrc: src,
        // Hand PhotoSwipe the thumbnail so it can morph open/close from this
        // photo's actual on-page rectangle (uses getBoundsByElement — masonry
        // shows the full image, no cropping, so we don't need the custom
        // thumbBounds filter the map lightbox uses).
        element: img,
        width:  parseInt(img.getAttribute('width'),  10) || img.naturalWidth  || 1200,
        height: parseInt(img.getAttribute('height'), 10) || img.naturalHeight || 900,
        alt: img.alt,
        caption: captionEl ? captionEl.textContent.trim() : '',
      };
    });

    const openAt = (index) => {
      // `pswp--rounded` rounds the photo to echo the page's card corners
      // (scoped to the gallery — see _photoswipe.scss).
      const pswp = new PhotoSwipe({ dataSource, index, zoom: true, tapAction, mainClass: 'pswp--rounded' });
      attachPswpTheme(pswp);

      // Mirror the on-image banner captions into the lightbox. The caption
      // lives INSIDE each slide's holder (.pswp__item), so it travels with its
      // photo during swipes instead of floating over the viewport. Pinned to
      // the photo's bottom edge at fit zoom (like the on-page banner caption);
      // hidden once zoomed in, since it sits outside the zooming wrapper.
      const placeCaption = (slide) => {
        const holder = slide?.holderElement;
        if (!holder) return;
        let el = holder.querySelector('.pswp__custom-caption');
        const text = slide.data?.caption || '';
        const atFit = Math.abs(slide.currZoomLevel - slide.zoomLevels.initial) < 0.01;
        if (!text || !atFit) { if (el) el.style.display = 'none'; return; }
        if (!el) {
          el = document.createElement('div');
          el.className = 'pswp__custom-caption';
          el.setAttribute('aria-hidden', 'true');
          holder.appendChild(el);
        }
        const w = slide.width  * slide.zoomLevels.initial;
        const h = slide.height * slide.zoomLevels.initial;
        el.textContent  = text;
        el.style.left   = `${(pswp.viewportSize.x - w) / 2}px`;
        el.style.width  = `${w}px`;
        el.style.bottom = `${(pswp.viewportSize.y - h) / 2}px`;
        el.style.display = 'block';
      };
      pswp.on('afterSetContent', (e) => placeCaption(e.slide));        // per slide, as content lands
      pswp.on('zoomPanUpdate', () => placeCaption(pswp.currSlide));     // hide on zoom-in, re-show at fit
      pswp.on('resize', () => pswp.mainScroll.itemHolders.forEach(h => placeCaption(h.slide)));

      pswp.init();
    };

    imgEls.forEach((img, i) => {
      img.closest('.masonry-item_type_image').addEventListener('click', () => openAt(i));
    });
  }

  // Hero map — its own single-image lightbox, opened from the author credit.
  // The map is a CSS background (no <img>) painted at natural size and
  // centered, so the hero shows a 1:1 center crop of the source file
  // (map-1.webp, 1701×1319). We morph the lightbox out of that crop.
  const mapZoom = document.getElementById('map-zoom');
  if (mapZoom && map) {
    const MAP_W = 1701;
    const MAP_H = 1319;

    mapZoom.addEventListener('click', () => {
      const reduce = motionMatchMedia.matches;
      const pswp = new PhotoSwipe({
        dataSource: [{
          src: '/images/map-1.webp',
          msrc: '/images/map-1.webp', // preloaded → placeholder paints from frame 1 of the morph
          width: MAP_W,
          height: MAP_H,
          alt: 'Карта деревни Святогорово. Автор: Блажевич В.С.',
        }],
        index: 0,
        zoom: true,
        showHideAnimationType: reduce ? 'none' : 'zoom',
        tapAction,
      });

      // Morph open/close out of the hero card's center crop so it reads as
      // one continuous image. The card paints the map at natural scale
      // (background-size:auto, centered), so we build the cropped bounds by
      // hand with fillZoomLevel pinned to 1 — PhotoSwipe's own
      // getCroppedBoundsByElement assumes object-fit:cover and would start
      // the morph at the wrong zoom. bounds.w = MAP_W ⇒ start zoom level 1,
      // pixel-matching the background; innerRect carries the visible crop.
      pswp.addFilter('thumbBounds', () => {
        const r = map.getBoundingClientRect();
        const offsetX = (r.width  - MAP_W) / 2;
        const offsetY = (r.height - MAP_H) / 2;
        return {
          x: r.left + offsetX,
          y: r.top  + offsetY,
          w: MAP_W,
          innerRect: { w: r.width, h: r.height, x: offsetX, y: offsetY },
        };
      });

      // Backdrop = the hero's own background, so the zoomed map sits on the
      // same scene as the cropped card (not the topo snapshot used elsewhere).
      attachPswpTheme(pswp, { backdrop: '/images/bg-1.webp', dim: 'rgba(8, 10, 7, 0.2)' });

      // Fade the hero's dark overlay + text away as the morph grows and back
      // in as it collapses, so only the map itself appears to travel.
      if (!reduce) {
        pswp.on('beforeOpen', () => map.classList.add('is-zooming'));
        pswp.on('close',      () => map.classList.remove('is-zooming'));
      }

      pswp.init();
    });
  }
});

// ─── Parallax system ──────────────────────────────────────────────────────────
// Uses CSS `translate` (separate from `transform`) so it never conflicts
// with animate-in transitions or the map 3D-tilt effect.

if (!motionMatchMedia.matches) {
  const mapContainer = document.querySelector('.map-container');

  // Collect parallax targets: [element, depthPx]
  // depthPx = max vertical travel at the edge of the viewport
  const parallaxTargets = [
    ...[...document.querySelectorAll('.masonry-item_type_header')].map(el => [el, 20]),
    ...[...document.querySelectorAll('.masonry-item_type_pullquote')].map(el => [el, 14]),
    ...[...document.querySelectorAll('.masonry-item_wide')].map(el => [el, 10]),
  ];

  parallaxTargets.forEach(([el]) => { el.style.willChange = 'translate'; });

  let rafPending = false;

  function tickParallax() {
    rafPending = false;
    const vh = window.innerHeight;
    const sy = window.scrollY;

    // Hero background: shift bg-1.webp slower than scroll (classic parallax)
    if (mapContainer) {
      const rect = mapContainer.getBoundingClientRect();
      if (rect.bottom > 0) {
        const progress = Math.max(0, -rect.top) / rect.height;
        mapContainer.style.backgroundPositionY = `calc(50% + ${(progress * 80).toFixed(1)}px)`;
      }
    }

    // Element parallax via separate CSS translate property
    for (const [el, depth] of parallaxTargets) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < -300 || rect.top > vh + 300) continue;
      const cy = rect.top + rect.height / 2;
      const offset = ((cy / vh - 0.5) * depth).toFixed(1);
      el.style.translate = `0 ${offset}px`;
    }
  }

  window.addEventListener('scroll', () => {
    if (!rafPending) { rafPending = true; requestAnimationFrame(tickParallax); }
  }, { passive: true });

  window.addEventListener('resize', tickParallax, { passive: true });
  tickParallax();
}
