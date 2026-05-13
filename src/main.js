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
  placesButton.addEventListener('click', function (event) {
    event.preventDefault();
    const target = document.getElementById('places');
    if (target) target.scrollIntoView({behavior: 'smooth'});
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
if (backToTop) {
  window.addEventListener('scroll', () => {
    backToTop.classList.toggle('is-visible', window.scrollY > 500);
  }, { passive: true });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ─── Active nav ───────────────────────────────────────────────────────────────

const navLinks = document.querySelectorAll('.site-nav__link');
// Derive sections from the nav itself — single source of truth, no marker class.
const sections = [...navLinks]
  .map(l => document.getElementById(l.getAttribute('href').slice(1)))
  .filter(Boolean);

if (navLinks.length && sections.length) {
  function updateActiveNav() {
    const scrollY = window.scrollY + 120;
    let current = '';
    sections.forEach(section => {
      if (section.offsetTop <= scrollY) current = section.id;
    });
    navLinks.forEach(link => {
      link.classList.toggle('site-nav__link--active', link.getAttribute('href') === `#${current}`);
    });
  }

  window.addEventListener('scroll', updateActiveNav, { passive: true });
  updateActiveNav();
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

    // Snapshot topo canvas into PhotoSwipe background
    pswp.on('beforeOpen', () => {
      const topoEl = document.getElementById('topo-canvas');
      if (topoEl) {
        try {
          pswp.element.style.backgroundImage = `url(${topoEl.toDataURL()})`;
          pswp.element.style.backgroundSize  = 'cover';
          pswp.element.style.backgroundPosition = 'center top';
        } catch (e) { /* tainted canvas — skip */ }
      }
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
