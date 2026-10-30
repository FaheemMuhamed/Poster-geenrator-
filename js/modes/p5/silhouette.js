// Contour Figure: the picture is thresholded into a figure built from flickering pixel squares,
// and the space around it is drawn as concentric dashed contour lines taken from the figure's
// distance field (a two-pass chamfer transform), with dashes that flow along each line (ref 31).
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain } from '../../shared/bloom2d.js';

// Integer hash -> 0..1 (stable per cell, so flicker is deterministic).
function hash(a, b, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumOf = (hex) => { const [r, g, b] = rgbOf(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

// Tangent directions quantised to 45° steps (a segment is symmetric, so 4 are enough).
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1]];

export default {
  id: 'silhouette',
  name: 'Contour Figure',
  engine: 'p5',
  medium: 'image',
  hint: 'Hover to bend the contours · click to send a pulse',
  params: {
    threshold:  { value: 0.6, min: 0.05, max: 0.95, step: 0.01, label: 'Threshold' },
    invert:     { value: false, label: 'Light subject' },
    pixel:      { value: 9, min: 5, max: 20, step: 1, label: 'Pixel size' },
    spacing:    { value: 26, min: 12, max: 64, step: 1, label: 'Contour spacing' },
    dash:       { value: 48, min: 3, max: 90, step: 1, label: 'Dash length' },
    flow:       { value: 1, min: 0, max: 4, step: 0.01, label: 'Flow speed' },
    colorMode:  { value: 'Palette', options: ['Palette', 'Tone', 'Photo'], label: 'Figure colour' },
    flicker:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Flicker' },
    bend:       { value: 1, min: 0, max: 3, step: 0.01, label: 'Cursor bend' },
    darkGround: { value: true, label: 'Dark ground' },
  },
  controls: {
    essentials: ['threshold', 'pixel', 'spacing', 'colorMode'],
    groups: { Figure: ['invert', 'flicker'], Contours: ['dash', 'flow', 'bend'], Ground: ['darkGround'] },
  },

  create(ctx) {
    const P = ctx.params;
    const seed = ctx.rand.int(1, 1e6);

    // Low-res copy of the picture, cover-fitted to the pixel grid.
    const small = document.createElement('canvas');
    const sctx = small.getContext('2d', { willReadFrequently: true });

    let cols = 0, rows = 0, cell = 9, ox = 0, oy = 0;
    let raw = new Uint8Array(0), mask = new Uint8Array(0);
    let dist = new Float32Array(0), field = new Float32Array(0), lumA = new Float32Array(0);
    let pix = new Uint8ClampedArray(0);
    let key = '';
    let cenX = 0, cenY = 0, R0 = 100; // figure centroid and radius (CSS px)

    const pulses = [];
    const cur = { x: 0.5, y: 0.5, hov: 0 };

    // Dash buckets: 0 = contrast colour, 1..4 = accents, 5 = pulse.
    const buckets = Array.from({ length: 6 }, () => []);
    const dots = [];

    function rebuild(W, H) {
      const src = ctx.source;
      cell = P.pixel;
      const nc = Math.max(4, Math.ceil(W / cell)), nr = Math.max(4, Math.ceil(H / cell));
      const k = `${nc}x${nr}:${src.version}:${P.threshold}:${P.invert}:${cell}`;
      cols = nc; rows = nr;
      ox = (W - cols * cell) / 2; oy = (H - rows * cell) / 2;
      if (k === key) return;
      key = k;
      const N = cols * rows;
      if (mask.length !== N) {
        raw = new Uint8Array(N); mask = new Uint8Array(N);
        dist = new Float32Array(N); field = new Float32Array(N); lumA = new Float32Array(N);
      }

      // Cover-fit the source into a cols × rows image.
      if (small.width !== cols || small.height !== rows) { small.width = cols; small.height = rows; }
      const sw0 = src.canvas.width, sh0 = src.canvas.height;
      const ga = cols / rows;
      let sx = 0, sy = 0, sw = sw0, sh = sh0;
      if (sw0 / sh0 > ga) { sw = sh0 * ga; sx = (sw0 - sw) / 2; } else { sh = sw0 / ga; sy = (sh0 - sh) / 2; }
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.clearRect(0, 0, cols, rows);
      sctx.drawImage(src.canvas, sx, sy, sw, sh, 0, 0, cols, rows);
      pix = sctx.getImageData(0, 0, cols, rows).data;

      // Threshold.
      const thr = P.threshold;
      for (let i = 0; i < N; i++) {
        const o = i * 4;
        const L = (0.299 * pix[o] + 0.587 * pix[o + 1] + 0.114 * pix[o + 2]) / 255;
        lumA[i] = L;
        raw[i] = P.invert ? (L > thr ? 1 : 0) : (L < thr ? 1 : 0);
      }
      // One majority-filter pass to clean speckles.
      let area = 0, sxm = 0, sym = 0;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let n = 0, m = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy; if (yy < 0 || yy >= rows) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx; if (xx < 0 || xx >= cols) continue;
              n++; m += raw[yy * cols + xx];
            }
          }
          const v = m * 2 > n ? 1 : 0;
          mask[y * cols + x] = v;
          if (v) { area++; sxm += x; sym += y; }
        }
      }

      // Distance field: two-pass chamfer (1 for edges, √2 for diagonals), in cells.
      const INF = 1e9, D2 = Math.SQRT2;
      if (area === 0) {
        // No figure: rings around the centre instead.
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) dist[y * cols + x] = Math.hypot(x - cols / 2, y - rows / 2);
        cenX = W / 2; cenY = H / 2; R0 = Math.min(W, H) * 0.2;
        return;
      }
      for (let i = 0; i < N; i++) dist[i] = mask[i] ? 0 : INF;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          let v = dist[i];
          if (v === 0) continue;
          if (x > 0) v = Math.min(v, dist[i - 1] + 1);
          if (y > 0) {
            v = Math.min(v, dist[i - cols] + 1);
            if (x > 0) v = Math.min(v, dist[i - cols - 1] + D2);
            if (x < cols - 1) v = Math.min(v, dist[i - cols + 1] + D2);
          }
          dist[i] = v;
        }
      }
      for (let y = rows - 1; y >= 0; y--) {
        for (let x = cols - 1; x >= 0; x--) {
          const i = y * cols + x;
          let v = dist[i];
          if (v === 0) continue;
          if (x < cols - 1) v = Math.min(v, dist[i + 1] + 1);
          if (y < rows - 1) {
            v = Math.min(v, dist[i + cols] + 1);
            if (x < cols - 1) v = Math.min(v, dist[i + cols + 1] + D2);
            if (x > 0) v = Math.min(v, dist[i + cols - 1] + D2);
          }
          dist[i] = v;
        }
      }
      cenX = ox + (sxm / area + 0.5) * cell;
      cenY = oy + (sym / area + 0.5) * cell;
      R0 = Math.sqrt(area / Math.PI) * cell;
    }

    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, t, dt) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const pal = ctx.palette;
        const ptr = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        dt = Math.min(0.05, dt || 0.016);

        rebuild(W, H);
        const N = cols * rows;

        // Ground and contrast colours.
        const bgDark = lumOf(pal.bg) < lumOf(pal.ink);
        const darkC = bgDark ? pal.bg : pal.ink, lightC = bgDark ? pal.ink : pal.bg;
        const ground = P.darkGround ? darkC : pal.bg;
        const contrast = P.darkGround ? lightC : pal.ink;
        const acc = [pal.c1, pal.c2, pal.c3, pal.c4];

        // Cursor (eased) and hover strength.
        const hovT = ptr.inside ? 1 : 0;
        cur.hov += (hovT - cur.hov) * Math.min(1, dt * 5);
        if (ptr.inside) {
          const k = Math.min(1, dt * 10);
          cur.x += (ptr.x - cur.x) * k; cur.y += (ptr.y - cur.y) * k;
        }
        const mx = cur.x * W, my = cur.y * H;
        const hover = cur.hov * mPow;

        // Click: a pulse ring that runs out from the click point and lights the contours.
        if (ptr.justPressed && ptr.inside) {
          pulses.push({ x: ptr.x * W, y: ptr.y * H, age: 0 });
          if (pulses.length > 6) pulses.shift();
        }
        const pulseSpeed = Math.max(W, H) * 0.55, pulseW = Math.max(28, P.spacing * 1.2);
        for (let i = pulses.length - 1; i >= 0; i--) {
          pulses[i].age += dt;
          if (pulses[i].age > 3) pulses.splice(i, 1);
        }

        // Field = distance to the figure (px) minus a radial bump under the cursor,
        // so contour lines bulge away around it. A slow breath keeps them alive.
        const sp = P.spacing;
        const bendA = sp * 1.8 * P.bend * hover;
        const bendR2 = Math.pow(Math.min(W, H) * 0.17, 2);
        for (let y = 0; y < rows; y++) {
          const py = oy + (y + 0.5) * cell;
          for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            const px = ox + (x + 0.5) * cell;
            let f = dist[i] * cell;
            f += Math.sin(t * 0.35 + Math.atan2(py - cenY, px - cenX) * 3 + f * 0.01) * sp * 0.1;
            if (bendA > 0) {
              const dx = px - mx, dy = py - my;
              f -= bendA * Math.exp(-(dx * dx + dy * dy) / bendR2);
            }
            field[i] = f;
          }
        }

        c.save();
        c.fillStyle = ground;
        c.fillRect(0, 0, W, H);

        // ---- Contours: cells that sit on a band line draw one tangent segment each ----
        for (const b of buckets) b.length = 0;
        dots.length = 0;
        const dash = P.dash;
        const gap = Math.max(cell * 1.1, dash * 0.3);
        const period = dash + gap;
        const flow = t * P.flow * 38;
        const half = cell * 0.5;
        for (let y = 0; y < rows; y++) {
          const py = oy + (y + 0.5) * cell;
          for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            if (mask[i]) continue;
            const f = field[i];
            const ph = f / sp;
            const band = Math.round(ph);
            if (band < 1) continue;
            const off = (ph - band) * sp;
            if (off > half || off < -half) continue;
            // Gradient: the line's normal. Diagonal lines need a narrower acceptance band,
            // otherwise two neighbouring cells both claim the same step and the line doubles.
            const xl = x > 0 ? field[i - 1] : f, xr = x < cols - 1 ? field[i + 1] : f;
            const yu = y > 0 ? field[i - cols] : f, yd = y < rows - 1 ? field[i + cols] : f;
            const gx = xr - xl, gy = yd - yu;
            const gl = Math.hypot(gx, gy) || 1;
            const bandW = half * 1.06 * Math.max(Math.abs(gx), Math.abs(gy)) / gl;
            if (off > bandW || off < -bandW) continue;
            const px = ox + (x + 0.5) * cell;

            // Pulse energy at this cell.
            let pe = 0;
            for (let q = 0; q < pulses.length; q++) {
              const pu = pulses[q];
              const rr = Math.hypot(px - pu.x, py - pu.y);
              const e = (rr - pu.age * pulseSpeed) / pulseW;
              if (e > -3 && e < 3) pe += Math.exp(-e * e) * (1 - pu.age / 3);
            }

            // Dash pattern along the line: arc-length-ish coordinate around the figure.
            const s = Math.atan2(py - cenY, px - cenX) * (f + R0);
            const dir = band & 1 ? 1 : -1;
            let u = (s + dir * flow + band * 37.3) / period;
            u -= Math.floor(u);
            const on = u < dash / period;
            if (!on && pe < 0.3) continue;

            const hh = hash(i, band, seed);
            // Occasional isolated square instead of a dash (pixel sparkle).
            if (hh < 0.02 && pe < 0.3) { dots.push(px, py); continue; }

            // Tangent = normal turned 90°, snapped to 45°.
            const ang = Math.atan2(gy, gx) + Math.PI / 2;
            let qd = Math.round(ang / (Math.PI / 4)) % 4;
            if (qd < 0) qd += 4;
            const d = DIRS[qd];
            const bi = pe >= 0.3 ? 5 : hh < 0.74 ? 0 : 1 + Math.floor((hh - 0.74) / 0.26 * 4) % 4;
            buckets[bi].push(px - d[0] * half, py - d[1] * half, px + d[0] * half, py + d[1] * half);
          }
        }
        c.lineCap = 'square';
        const lw = Math.max(1, cell * 0.2);
        const bucketCol = [contrast, acc[0], acc[1], acc[2], acc[3], acc[0]];
        for (let b = 0; b < 6; b++) {
          const arr = buckets[b];
          if (!arr.length) continue;
          c.strokeStyle = bucketCol[b];
          c.lineWidth = b === 5 ? lw * 2.2 : lw;
          c.globalAlpha = 1;
          c.beginPath();
          for (let k = 0; k < arr.length; k += 4) { c.moveTo(arr[k], arr[k + 1]); c.lineTo(arr[k + 2], arr[k + 3]); }
          c.stroke();
        }
        c.globalAlpha = 1;
        if (dots.length) {
          c.fillStyle = contrast;
          const ds = cell * 0.42;
          c.beginPath();
          for (let k = 0; k < dots.length; k += 2) c.rect(dots[k] - ds / 2, dots[k + 1] - ds / 2, ds, ds);
          c.fill();
        }

        // ---- Figure: one pixel square per mask cell ----
        const mode = P.colorMode;
        const tonePal = [...acc, contrast].sort((a, b) => lumOf(a) - lumOf(b));
        const figPal = [acc[0], acc[1], acc[2], acc[3], contrast];
        const rate = 0.35 * P.flicker;
        const g = Math.max(0.5, cell * 0.08);
        const q = cell - g * 2;
        const pushR2 = Math.pow(Math.min(W, H) * 0.12, 2);
        c.lineWidth = Math.max(1, cell * 0.14);
        for (let i = 0; i < N; i++) {
          if (!mask[i]) continue;
          const x = i % cols, y = (i - x) / cols;
          let px = ox + x * cell, py = oy + y * cell;
          const pcx = px + cell / 2, pcy = py + cell / 2;

          // Cursor: squares near it scatter outward and flicker faster.
          let near = 0;
          if (hover > 0) {
            const dx = pcx - mx, dy = pcy - my;
            near = Math.exp(-(dx * dx + dy * dy) / pushR2) * hover;
            if (near > 0.02) {
              const r = Math.hypot(dx, dy) || 1;
              px += (dx / r) * near * cell * 1.6;
              py += (dy / r) * near * cell * 1.6;
            }
          }
          let pe = 0;
          for (let k = 0; k < pulses.length; k++) {
            const pu = pulses[k];
            const e = (Math.hypot(pcx - pu.x, pcy - pu.y) - pu.age * pulseSpeed) / pulseW;
            if (e > -3 && e < 3) pe += Math.exp(-e * e) * (1 - pu.age / 3);
          }

          const epoch = Math.floor(t * rate * (1 + near * 6) + hash(i, 1, seed) * 9);
          const h1 = hash(i, epoch, seed), h2 = hash(i, epoch + 911, seed + 3);
          let col;
          if (pe > 0.4) col = contrast;
          else if (mode === 'Photo') { const o = i * 4; col = `rgb(${pix[o]},${pix[o + 1]},${pix[o + 2]})`; }
          else if (mode === 'Tone') {
            // Brightness within the figure's own range (0 = darkest, 1 = threshold edge).
            const thr = P.threshold;
            const L = P.invert ? (lumA[i] - thr) / Math.max(0.05, 1 - thr) : lumA[i] / Math.max(0.05, thr);
            let k = Math.floor(L * tonePal.length + (h1 - 0.5) * 1.4);
            k = Math.max(0, Math.min(tonePal.length - 1, k));
            col = tonePal[k];
          } else col = figPal[Math.floor(h1 * 5)];
          const alt = figPal[Math.floor(h2 * 97) % 5];

          if (h2 < 0.5) {
            c.fillStyle = col; c.fillRect(px + g, py + g, q, q);
          } else if (h2 < 0.63) {
            c.strokeStyle = col; c.strokeRect(px + g * 1.5, py + g * 1.5, q - g, q - g);
          } else if (h2 < 0.75) {
            c.fillStyle = col; c.fillRect(px + g, py + g, q, q);
            c.fillStyle = ground; c.fillRect(px + cell * 0.32, py + cell * 0.32, cell * 0.36, cell * 0.36);
          } else if (h2 < 0.87) {
            c.fillStyle = col; c.fillRect(px + g, py + g, q, q);
            c.strokeStyle = alt === col ? ground : alt;
            c.beginPath();
            c.moveTo(px + g, py + cell * 0.5); c.lineTo(px + cell * 0.5, py + g);
            c.moveTo(px + g, py + cell - g); c.lineTo(px + cell - g, py + g);
            c.moveTo(px + cell * 0.5, py + cell - g); c.lineTo(px + cell - g, py + cell * 0.5);
            c.stroke();
          } else if (h2 < 0.95) {
            c.fillStyle = col; c.fillRect(px + cell * 0.25, py + cell * 0.25, cell * 0.5, cell * 0.5);
          }
          // else: a gap, a little window of ground inside the figure
        }
        c.restore();

        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return {
      resize: stage.resize,
      frame: stage.frame,
      dispose: stage.dispose,
      onParam(k) { if (k === 'source' || k === 'threshold' || k === 'invert' || k === 'pixel') key = ''; },
    };
  },
};
