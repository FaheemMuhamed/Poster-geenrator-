// Soft gradient "bloom" background and film grain for 2D canvases (used by the p5 modes).
// Works on a plain CanvasRenderingContext2D, so p5 modes pass `p.drawingContext`.
import { accents } from './palettes.js';
import { makeRandom } from './random.js';

const LOW = document.createElement('canvas');
const lowCtx = LOW.getContext('2d');

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  grainTile = document.createElement('canvas');
  grainTile.width = grainTile.height = 256;
  const g = grainTile.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return grainTile;
}

// Draws the background colour plus 2–5 drifting blurred colour blobs.
// amount 0..1 controls blob opacity; count = number of blobs.
export function drawBloom(ctx, w, h, { palette, seed, time, amount = 0.8, count = 3, mouse = null }) {
  ctx.save();
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, w, h);
  if (amount <= 0) { ctx.restore(); return; }

  // Render small, then scale up: the upscale gives a free, very soft blur.
  const lw = 64, lh = Math.max(8, Math.round(64 * h / w));
  if (LOW.width !== lw || LOW.height !== lh) { LOW.width = lw; LOW.height = lh; }
  lowCtx.clearRect(0, 0, lw, lh);
  const rand = makeRandom(seed * 7 + 3);
  const cols = accents(palette);
  for (let i = 0; i < count; i++) {
    const sp = rand.range(0.05, 0.15);
    let x = rand() + Math.sin(time * sp + i * 2.1) * 0.15;
    let y = rand() + Math.cos(time * sp * 0.8 + i * 1.3) * 0.15;
    if (mouse && mouse.inside && i === 0) { x += (mouse.x - x) * 0.35; y += (mouse.y - y) * 0.35; }
    const r = rand.range(0.35, 0.7) * lw;
    const g = lowCtx.createRadialGradient(x * lw, y * lh, 0, x * lw, y * lh, r);
    const c = cols[i % cols.length];
    g.addColorStop(0, hexA(c, amount));
    g.addColorStop(1, hexA(c, 0));
    lowCtx.fillStyle = g;
    lowCtx.fillRect(0, 0, lw, lh);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(LOW, 0, 0, w, h);
  ctx.restore();
}

// Overlays film grain. amount 0..1.
export function drawGrain(ctx, w, h, amount) {
  if (amount <= 0) return;
  const tile = getGrainTile();
  ctx.save();
  ctx.globalAlpha = Math.min(1, amount * 0.6);
  ctx.globalCompositeOperation = 'overlay';
  const ox = Math.floor(Math.random() * 256), oy = Math.floor(Math.random() * 256);
  ctx.translate(-ox, -oy);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(0, 0, w + 256, h + 256);
  ctx.restore();
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
