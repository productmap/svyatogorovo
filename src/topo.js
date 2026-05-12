import { TOPO_ROWS, TOPO_COLS, TOPO_GRID } from './topo-data.js';

const N = 60;
const LEVELS = 16;
const THRESHOLDS = Array.from({ length: LEVELS }, (_, i) => 0.04 + i * (0.92 / (LEVELS - 1)));

// Bilinear upsample from 10×10 grid to N×N
const grid = new Float32Array(N * N);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const gx = (x / (N - 1)) * (TOPO_COLS - 1);
    const gy = (y / (N - 1)) * (TOPO_ROWS - 1);
    const x0 = Math.floor(gx), x1 = Math.min(x0 + 1, TOPO_COLS - 1);
    const y0 = Math.floor(gy), y1 = Math.min(y0 + 1, TOPO_ROWS - 1);
    const tx = gx - x0, ty = gy - y0;
    grid[y * N + x] =
      TOPO_GRID[y0][x0] * (1 - tx) * (1 - ty) +
      TOPO_GRID[y0][x1] * tx * (1 - ty) +
      TOPO_GRID[y1][x0] * (1 - tx) * ty +
      TOPO_GRID[y1][x1] * tx * ty;
  }
}

// Marching squares → flat Float32Array [x1,y1,x2,y2,...] in grid coordinates
function march(threshold) {
  const s = [];
  const e = 1e-9;
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N - 1; c++) {
      const TL = grid[r * N + c],       TR = grid[r * N + c + 1];
      const BR = grid[(r+1) * N + c+1], BL = grid[(r+1) * N + c];
      const cas = (TL > threshold ? 8 : 0) | (TR > threshold ? 4 : 0) |
                  (BR > threshold ? 2 : 0) | (BL > threshold ? 1 : 0);
      if (cas === 0 || cas === 15) continue;
      const tX = c + Math.max(0, Math.min(1, (threshold - TL) / (TR - TL + e)));
      const rY = r + Math.max(0, Math.min(1, (threshold - TR) / (BR - TR + e)));
      const bX = c + Math.max(0, Math.min(1, (threshold - BL) / (BR - BL + e)));
      const lY = r + Math.max(0, Math.min(1, (threshold - TL) / (BL - TL + e)));
      switch (cas) {
        case  1: case 14: s.push(c, lY, bX, r+1); break;
        case  2: case 13: s.push(bX, r+1, c+1, rY); break;
        case  3: case 12: s.push(c, lY, c+1, rY); break;
        case  4: case 11: s.push(tX, r, c+1, rY); break;
        case  6: case  9: s.push(tX, r, bX, r+1); break;
        case  7: case  8: s.push(tX, r, c, lY); break;
        case  5: s.push(tX, r, c+1, rY, c, lY, bX, r+1); break;
        case 10: s.push(tX, r, c, lY, c+1, rY, bX, r+1); break;
      }
    }
  }
  return new Float32Array(s);
}

const contours = THRESHOLDS.map(march);

export function initTopo(canvas, noMotion) {
  const ctx = canvas.getContext('2d');
  let raf = null;

  function setSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render(ts) {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    const sx = W / (N - 1), sy = H / (N - 1);
    const t = ts / 1000;
    const wf = (2 * Math.PI) / 24;  // one wave cycle = 24 s

    for (let li = 0; li < LEVELS; li++) {
      const phase = (li / LEVELS) * Math.PI * 2;
      const amp = noMotion ? 0 : 0.042;
      const opacity = 0.075 + amp * Math.sin(t * wf + phase);
      ctx.strokeStyle = `rgba(75,48,30,${opacity.toFixed(3)})`;
      ctx.lineWidth = 0.85;
      ctx.lineCap = 'round';
      const s = contours[li];
      ctx.beginPath();
      for (let i = 0; i < s.length; i += 4) {
        ctx.moveTo(s[i] * sx, s[i+1] * sy);
        ctx.lineTo(s[i+2] * sx, s[i+3] * sy);
      }
      ctx.stroke();
    }

    if (!noMotion) raf = requestAnimationFrame(render);
  }

  setSize();
  window.addEventListener('resize', () => {
    setSize();
    if (noMotion) render(0);
  }, { passive: true });

  raf = requestAnimationFrame(render);
}
