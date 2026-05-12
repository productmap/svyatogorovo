import './style.scss'
import './fonts.css'
import './flexmasonry.css'
// import './route.js';

const map = document.querySelector(".map");
const motionMatchMedia = window.matchMedia("(prefers-reduced-motion)");
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

const placesButton = document.getElementById('places-button');
if (placesButton) {
  placesButton.addEventListener('click', function (event) {
    event.preventDefault();
    const target = document.getElementById('places');
    if (target) {
      target.scrollIntoView({behavior: 'smooth'});
    }
  });
}