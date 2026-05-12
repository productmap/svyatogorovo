document.addEventListener("DOMContentLoaded", () => {
  const mapButton = document.getElementById("places-button");
  const headings = document.querySelectorAll(".path-point");
  const svg = document.getElementById("animation-svg");
  let isLineActive = false;
  let paths = [];

  function drawAnimatedPath() {
    // Очищаем SVG перед перерисовкой
    svg.innerHTML = "";
    paths = [];

    let currentStartElement = mapButton;

    headings.forEach((heading) => {
      const startRect = currentStartElement.getBoundingClientRect();
      const endRect = heading.getBoundingClientRect();

      // Центры элементов для начала и конца линии
      const startX = startRect.left + startRect.width / 2;
      const startY = startRect.top + startRect.height / 2;
      const endX = endRect.left + endRect.width / 2;
      const endY = endRect.top + endRect.height / 2;

      // Расчет контрольных точек для кривой Безье
      const controlPointOffset = Math.abs(endX - startX) * 0.5;
      const controlX1 = startX + controlPointOffset;
      const controlY1 = startY;
      const controlX2 = endX - controlPointOffset;
      const controlY2 = endY;

      // Создаем SVG path элемент
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute(
        "d",
        `M${startX},${startY} C${controlX1},${controlY1} ${controlX2},${controlY2} ${endX},${endY}`
      );

      // Добавляем линию в SVG
      svg.appendChild(path);
      paths.push(path);

      currentStartElement = heading; // Следующая линия начинается от текущего заголовка
    });

    // Анимируем линии
    animateLines();
  }

  function animateLines() {
    // Анимируем первую линию сразу
    if (paths.length > 0) {
      paths[0].classList.add("animated-path");
    }

    // Остальные линии анимируем при скролле
    updateLinesOnScroll();
  }

  function updateLinesOnScroll() {
    const scrollPosition = window.scrollY;
    const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    
    // Для каждой линии (кроме первой) определяем, нужно ли её показывать
    for (let i = 1; i < paths.length; i++) {
      const heading = headings[i - 1]; // Соответствующий заголовок
      const headingRect = heading.getBoundingClientRect();
      
      // Если заголовок виден на экране, показываем линию к следующему заголовку
      if (headingRect.top < window.innerHeight && headingRect.bottom > 0) {
        paths[i].classList.add("animated-path");
      }
    }
  }

  function updateSvgHeight() {
    // Устанавливаем высоту SVG равной высоте body
    svg.style.height =
      Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.documentElement.clientHeight
      ) + "px";
  }

  // Обработчик клика на кнопку
  mapButton.addEventListener('click', () => {
    if (window.innerWidth > 1024) { // Check if it's a desktop
      if (!isLineActive) {
        isLineActive = true;
        updateSvgHeight();
        drawAnimatedPath();
      }
    }
  });

  // Обработчик скролла
  window.addEventListener("scroll", () => {
    if (isLineActive) {
      updateLinesOnScroll();
    }
  });

  // Перерисовываем линии при изменении размера окна
  window.addEventListener("resize", () => {
    if (isLineActive) {
      updateSvgHeight();
      drawAnimatedPath();
    }
  });
});
