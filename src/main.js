import './style.scss'
import './fonts.css'
import './flexmasonry.css'
import { initTopo } from './topo.js'

const topoCanvas = document.getElementById('topo-canvas');
const motionMatchMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
if (topoCanvas) initTopo(topoCanvas, motionMatchMedia.matches);

const map = document.querySelector(".map");

// ─── Map tilt ─────────────────────────────────────────────────────────────────

const THRESHOLD = 3;

function handleHover(e) {
  const {clientX, clientY, currentTarget} = e;
  const {clientWidth, clientHeight} = currentTarget;
  const offsetLeft = currentTarget.getBoundingClientRect().left;
  const offsetTop = currentTarget.getBoundingClientRect().top;
  const horizontal = (clientX - offsetLeft) / clientWidth;
  const vertical = (clientY - offsetTop) / clientHeight;
  const rotateX = (THRESHOLD / 2 - horizontal * THRESHOLD).toFixed(2);
  const rotateY = (vertical * THRESHOLD - THRESHOLD / 2).toFixed(2);
  if (map) {
    map.style.transform = `perspective(${clientWidth}px) rotateX(${rotateY}deg) rotateY(${rotateX}deg) scale3d(1, 1, 1)`;
  }
}

function resetStyles(e) {
  if (map) {
    map.style.transform = `perspective(${e.currentTarget.clientWidth}px) rotateX(0deg) rotateY(0deg)`;
  }
}

if (map && !motionMatchMedia.matches) {
  map.addEventListener("mousemove", handleHover);
  map.addEventListener("mouseleave", resetStyles);
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
const sections = document.querySelectorAll('.path-point[id]');

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

// ─── Lightbox ─────────────────────────────────────────────────────────────────

(function () {
  const images = [...document.querySelectorAll('.masonry-item_type_image img.masonry-item__image')];
  if (!images.length) return;

  const lb     = document.createElement('div');
  lb.className = 'lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Просмотр фото');

  lb.innerHTML = `
    <button class="lightbox__close" aria-label="Закрыть">&#x2715;</button>
    <button class="lightbox__nav lightbox__nav--prev" aria-label="Предыдущее фото">&#8249;</button>
    <img class="lightbox__img" alt="" />
    <button class="lightbox__nav lightbox__nav--next" aria-label="Следующее фото">&#8250;</button>
    <span class="lightbox__counter"></span>
  `;
  document.body.appendChild(lb);

  const img     = lb.querySelector('.lightbox__img');
  const counter = lb.querySelector('.lightbox__counter');
  let current = 0;

  function show(index) {
    current = (index + images.length) % images.length;
    const src = images[current].src;
    const alt = images[current].alt;
    img.classList.add('is-loading');
    img.src = src;
    img.alt = alt;
    img.onload = () => img.classList.remove('is-loading');
    counter.textContent = `${current + 1} / ${images.length}`;
  }

  function open(index) {
    show(index);
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    lb.querySelector('.lightbox__close').focus();
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  images.forEach((el, i) => {
    el.closest('.masonry-item_type_image').addEventListener('click', () => open(i));
  });

  lb.querySelector('.lightbox__close').addEventListener('click', close);
  lb.querySelector('.lightbox__nav--prev').addEventListener('click', () => show(current - 1));
  lb.querySelector('.lightbox__nav--next').addEventListener('click', () => show(current + 1));

  lb.addEventListener('click', e => { if (e.target === lb) close(); });

  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft')  show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
})();

// ─── Parallax system ──────────────────────────────────────────────────────────
// Uses CSS `translate` (separate from `transform`) so it never conflicts
// with animate-in transitions or the map 3D-tilt effect.

if (!motionMatchMedia.matches) {
  const mapContainer = document.querySelector('.map-container');
  const scrollHint   = document.querySelector('.scroll-hint');

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

    // Scroll hint fade-out
    if (scrollHint) {
      scrollHint.style.opacity = sy > 60 ? '0' : '';
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
