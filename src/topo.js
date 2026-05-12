import { TOPO_ROWS, TOPO_COLS, TOPO_GRID } from './topo-data.js';

const N = 60;
const LEVELS = 16;
const THRESHOLDS = Array.from({ length: LEVELS }, (_, i) => 0.04 + i * (0.92 / (LEVELS - 1)));
const EXTRA = 220;
const PARALLAX = 0.042;

// Bilinear upsample 10×10 → N×N
const grid = new Float32Array(N * N);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const gx = (x / (N - 1)) * (TOPO_COLS - 1);
    const gy = (y / (N - 1)) * (TOPO_ROWS - 1);
    const x0 = Math.floor(gx), x1 = Math.min(x0 + 1, TOPO_COLS - 1);
    const y0 = Math.floor(gy), y1 = Math.min(y0 + 1, TOPO_ROWS - 1);
    const tx = gx - x0, ty = gy - y0;
    grid[y * N + x] =
      TOPO_GRID[y0][x0] * (1-tx)*(1-ty) + TOPO_GRID[y0][x1] * tx*(1-ty) +
      TOPO_GRID[y1][x0] * (1-tx)*ty     + TOPO_GRID[y1][x1] * tx*ty;
  }
}

// 2-pass box blur (≈ Gaussian σ≈1.2) smooths kinks at bilinear patch boundaries
{
  const tmp = new Float32Array(N * N);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let s = 0, w = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < N && ny >= 0 && ny < N) { s += grid[ny*N+nx]; w++; }
          }
        }
        tmp[y*N+x] = s / w;
      }
    }
    grid.set(tmp);
  }
}

// Marching squares → array of connected polylines (Float32Array [x0,y0,x1,y1,...])
function marchChains(threshold) {
  const e = 1e-9;
  const ax = [], ay = [], bx = [], by = [];

  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N - 1; c++) {
      const TL = grid[r*N+c], TR = grid[r*N+c+1];
      const BR = grid[(r+1)*N+c+1], BL = grid[(r+1)*N+c];
      const cas = (TL>threshold?8:0)|(TR>threshold?4:0)|(BR>threshold?2:0)|(BL>threshold?1:0);
      if (cas===0 || cas===15) continue;
      const tX = c+Math.max(0,Math.min(1,(threshold-TL)/(TR-TL+e)));
      const rY = r+Math.max(0,Math.min(1,(threshold-TR)/(BR-TR+e)));
      const bXv= c+Math.max(0,Math.min(1,(threshold-BL)/(BR-BL+e)));
      const lY = r+Math.max(0,Math.min(1,(threshold-TL)/(BL-TL+e)));
      function push(x1,y1,x2,y2){ax.push(x1);ay.push(y1);bx.push(x2);by.push(y2);}
      switch (cas) {
        case  1:case 14: push(c,lY,bXv,r+1); break;
        case  2:case 13: push(bXv,r+1,c+1,rY); break;
        case  3:case 12: push(c,lY,c+1,rY); break;
        case  4:case 11: push(tX,r,c+1,rY); break;
        case  6:case  9: push(tX,r,bXv,r+1); break;
        case  7:case  8: push(tX,r,c,lY); break;
        case  5: push(tX,r,c+1,rY); push(c,lY,bXv,r+1); break;
        case 10: push(tX,r,c,lY); push(c+1,rY,bXv,r+1); break;
      }
    }
  }

  const S = ax.length;

  // Build endpoint → segment-index adjacency
  const adj = new Map();
  function key(x, y) { return `${x.toFixed(2)},${y.toFixed(2)}`; }
  function addAdj(k, i) { const l = adj.get(k); if (l) l.push(i); else adj.set(k, [i]); }
  for (let i = 0; i < S; i++) { addAdj(key(ax[i],ay[i]),i); addAdj(key(bx[i],by[i]),i); }

  // Walk a chain starting from point (hx,hy), appending to pts[]
  const used = new Uint8Array(S);
  function walk(hx, hy, pts) {
    for (;;) {
      const neighbors = adj.get(key(hx, hy));
      if (!neighbors) break;
      let moved = false;
      for (const ni of neighbors) {
        if (used[ni]) continue;
        used[ni] = 1;
        if (Math.abs(ax[ni]-hx) < 0.01 && Math.abs(ay[ni]-hy) < 0.01) {
          hx = bx[ni]; hy = by[ni];
        } else {
          hx = ax[ni]; hy = ay[ni];
        }
        pts.push(hx, hy);
        moved = true;
        break;
      }
      if (!moved) break;
    }
  }

  const chains = [];
  for (let seed = 0; seed < S; seed++) {
    if (used[seed]) continue;
    used[seed] = 1;

    const fwd = [ax[seed], ay[seed], bx[seed], by[seed]];
    walk(bx[seed], by[seed], fwd);

    const bwd = [];
    walk(ax[seed], ay[seed], bwd);

    // Final chain = reversed(bwd) + fwd
    const chain = new Float32Array(bwd.length + fwd.length);
    for (let i = 0; i < bwd.length; i += 2) {
      chain[i]   = bwd[bwd.length - 2 - i];
      chain[i+1] = bwd[bwd.length - 1 - i];
    }
    chain.set(fwd, bwd.length);
    chains.push(chain);
  }
  return chains;
}

// Pre-compute all contour chains once at module load
const contours = THRESHOLDS.map(marchChains);

// Draw a polyline as a smooth quadratic-bezier curve (midpoint algorithm)
function drawSmooth(ctx, chain, sx, sy) {
  const n = chain.length / 2;
  if (n < 2) return;
  if (n === 2) {
    ctx.moveTo(chain[0]*sx, chain[1]*sy);
    ctx.lineTo(chain[2]*sx, chain[3]*sy);
    return;
  }
  const x0 = chain[0]*sx, y0 = chain[1]*sy;
  const x1 = chain[2]*sx, y1 = chain[3]*sy;
  ctx.moveTo((x0+x1)/2, (y0+y1)/2);
  for (let i = 0; i < n - 2; i++) {
    const cx = chain[(i+1)*2]*sx, cy = chain[(i+1)*2+1]*sy;
    const nx = chain[(i+2)*2]*sx, ny = chain[(i+2)*2+1]*sy;
    ctx.quadraticCurveTo(cx, cy, (cx+nx)/2, (cy+ny)/2);
  }
  ctx.lineTo(chain[(n-1)*2]*sx, chain[(n-1)*2+1]*sy);
}

export function initTopo(canvas, noMotion) {
  const ctx = canvas.getContext('2d');
  let raf = null;

  function setSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const h = window.innerHeight + EXTRA * 2;
    canvas.width  = window.innerWidth * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function applyParallax() {
    canvas.style.transform = `translateY(${-(window.scrollY * PARALLAX).toFixed(2)}px)`;
  }

  function render(ts) {
    const W = window.innerWidth;
    const H = window.innerHeight + EXTRA * 2;
    ctx.clearRect(0, 0, W, H);
    const sx = W / (N - 1), sy = H / (N - 1);
    const t = ts / 1000;
    const wf = (2 * Math.PI) / 24;

    for (let li = 0; li < LEVELS; li++) {
      const phase = (li / LEVELS) * Math.PI * 2;
      const amp = noMotion ? 0 : 0.042;
      const opacity = 0.075 + amp * Math.sin(t * wf + phase);
      ctx.strokeStyle = `rgba(75,48,30,${opacity.toFixed(3)})`;
      ctx.lineWidth = 0.85;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (const chain of contours[li]) drawSmooth(ctx, chain, sx, sy);
      ctx.stroke();
    }

    if (!noMotion) raf = requestAnimationFrame(render);
  }

  setSize();
  applyParallax();

  window.addEventListener('resize', () => { setSize(); if (noMotion) render(0); }, { passive: true });
  if (!noMotion) window.addEventListener('scroll', applyParallax, { passive: true });

  raf = requestAnimationFrame(render);
}
