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
// Native <details> snaps open. Intercept the toggle and animate the answer's
// height with the Web Animations API. `.is-open` is the source of truth for
// intent (and drives the +/× icon); the `open` attribute is kept so the answer
// stays in the accessibility tree and crawlable. Falls back to an instant
// toggle under prefers-reduced-motion.

document.querySelectorAll('.faq__item').forEach(item => {
  const summary = item.querySelector('.faq__question');
  const answer  = item.querySelector('.faq__answer');
  if (!summary || !answer) return;

  let anim = null;

  summary.addEventListener('click', (e) => {
    e.preventDefault();
    const opening = !item.classList.contains('is-open');

    if (motionMatchMedia.matches) {
      item.open = opening;
      item.classList.toggle('is-open', opening);
      return;
    }

    // Current rendered height — lets a mid-flight toggle resume smoothly.
    const from = item.open ? answer.getBoundingClientRect().height : 0;
    if (anim) anim.cancel();

    if (opening) {
      item.open = true;
      item.classList.add('is-open');
      const to = answer.offsetHeight;
      anim = answer.animate(
        [{ height: from + 'px', opacity: from ? 1 : 0 }, { height: to + 'px', opacity: 1 }],
        { duration: 280, easing: 'ease' }
      );
      anim.onfinish = () => { anim = null; };
    } else {
      item.classList.remove('is-open');
      anim = answer.animate(
        [{ height: from + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
        { duration: 240, easing: 'ease', fill: 'forwards' }
      );
      anim.onfinish = () => {
        // fill:forwards pins the answer at height 0 past the active phase —
        // drop `open` while it's still pinned, *then* clear the animation.
        // With fill:none the element would snap back to full height for one
        // frame between finish and this callback (the visible end-jump).
        item.open = false;
        anim.cancel();
        anim = null;
      };
    }
  });
});

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
  const imgEls = [...document.querySelectorAll('.masonry-item_type_image img.masonry-item__image')];
  if (!imgEls.length) return;

  const dataSource = imgEls.map(img => {
    // Prefer webp source if the browser resolved it
    const src = img.currentSrc || img.src;
    return {
      src,
      width:  parseInt(img.getAttribute('width'),  10) || img.naturalWidth  || 1200,
      height: parseInt(img.getAttribute('height'), 10) || img.naturalHeight || 900,
      alt: img.alt,
    };
  });

  function openAt(index) {
    const pswp = new PhotoSwipe({ dataSource, index, zoom: true });

    // Snapshot topo canvas into PhotoSwipe background + lock theme-color dark
    pswp.on('beforeOpen', () => {
      themePswpLock = true;
      setTheme(THEME.pswp);
      const topoEl = document.getElementById('topo-canvas');
      if (topoEl) {
        try {
          pswp.element.style.backgroundImage = `url(${topoEl.toDataURL()})`;
          pswp.element.style.backgroundSize  = 'cover';
          pswp.element.style.backgroundPosition = 'center top';
        } catch (e) { /* tainted canvas — skip */ }
      }
    });

    // `close` fires when the close animation begins — release the theme
    // lock so the underlying section re-takes over while the dialog fades.
    pswp.on('close', () => {
      themePswpLock = false;
      probeTheme();
    });

    pswp.init();
  }

  imgEls.forEach((img, i) => {
    img.closest('.masonry-item_type_image').addEventListener('click', () => openAt(i));
  });
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
