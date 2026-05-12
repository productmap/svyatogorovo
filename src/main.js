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
