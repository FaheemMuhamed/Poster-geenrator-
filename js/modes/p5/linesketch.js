// Line Sketch: the picture redrawn as thousands of loose ink lines (refs 34, 35).
// Each frame adds a batch of strokes onto a persistent paper buffer. Strokes start where the
// picture is dark or busy, then bend along its edges (a Sobel field from a low-res sample),
// with long straight construction lines running to a vanishing point. Old ink slowly fades,
// so the drawing keeps renewing itself. The pen follows the cursor; a click starts over.
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain, hexA } from '../../shared/bloom2d.js';

const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumOf = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// The part of a sw×sh picture that covers a W×H poster (centre crop).
function coverRect(sw, sh, W, H) {
  const sa = sw / sh, da = W / H;
  if (sa > da) { const w = sh * da; return [(sw - w) / 2, 0, w, sh]; }
  const h = sw / da;
  return [0, (sh - h) / 2, sw, h];
}

const GC = 150;          // analysis grid columns
const FLURRY = 1.8;      // seconds of fast drawing after a restart
const CYCLE = 60;        // seconds before the drawing quietly wipes and starts over

export default {
  id: 'linesketch',
  name: 'Line Sketch',
  engine: 'p5',
  medium: 'image',
  hint: 'Hover to sketch with the pen · click to start a fresh drawing',
  params: {
    strokes:     { value: 70, min: 10, max: 300, step: 5, label: 'Strokes per frame' },
    length:      { value: 1, min: 0.2, max: 3, step: 0.05, label: 'Stroke length' },
    weight:      { value: 0.8, min: 0.2, max: 3, step: 0.05, label: 'Line weight' },
    follow:      { value: 0.75, min: 0, max: 1, step: 0.01, label: 'Edge follow' },
    jitter:      { value: 0.5, min: 0, max: 1, step: 0.01, label: 'Looseness' },
    colour:      { value: 'Photo', options: ['Photo', 'Ink', 'Palette'], label: 'Colour' },
    perspective: { value: 0.45, min: 0, max: 1, step: 0.01, label: 'Perspective lines' },
    paper:       { value: 0.3, min: 0, max: 1, step: 0.01, label: 'Paper show-through' },
    wash:        { value: 0.25, min: 0, max: 1, step: 0.01, label: 'Colour wash' },
  },
  controls: {
    essentials: ['strokes', 'length', 'colour', 'perspective'],
    groups: { Line: ['weight', 'follow', 'jitter'], Paper: ['paper', 'wash'] },
  },

  create(ctx) {
    const P = ctx.params;
    const R = ctx.rand;
    const src = ctx.source;

    // ---------- Picture analysis (once per source version) ----------
    const an = document.createElement('canvas');
    const anx = an.getContext('2d', { willReadFrequently: true });
    const wash = document.createElement('canvas');
    const wx = wash.getContext('2d');
    let GR = 0, rgb = null, lum = null, blur = null, gxA = null, gyA = null, mag = null, cdf = null, total = 1;
    let colE = new Float32Array(GC), colCdf = new Float64Array(GC), colTotal = 1;
    let anVer = -1, anW = 0, anH = 0, anAt = 0, cdfBg = '';

    function analyse(W, H) {
      const rows = Math.max(8, Math.round(GC * H / W));
      if (an.width !== GC || an.height !== rows) { an.width = GC; an.height = rows; }
      const [sx, sy, sw, sh] = coverRect(src.width, src.height, W, H);
      anx.drawImage(src.canvas, sx, sy, sw, sh, 0, 0, GC, rows);
      rgb = anx.getImageData(0, 0, GC, rows).data;
      const n = GC * rows;
      if (!lum || lum.length !== n) {
        lum = new Float32Array(n); blur = new Float32Array(n);
        gxA = new Float32Array(n); gyA = new Float32Array(n); mag = new Float32Array(n);
        cdf = new Float64Array(n);
      }
      GR = rows;
      for (let i = 0; i < n; i++) lum[i] = lumOf(rgb[i * 4], rgb[i * 4 + 1], rgb[i * 4 + 2]);
      // 3×3 box blur, so the edge directions are calmer.
      const at = (a, x, y) => a[(y < 0 ? 0 : y >= rows ? rows - 1 : y) * GC + (x < 0 ? 0 : x >= GC ? GC - 1 : x)];
      for (let y = 0; y < rows; y++) for (let x = 0; x < GC; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += at(lum, x + dx, y + dy);
        blur[y * GC + x] = s / 9;
      }
      // Sobel gradient.
      colE.fill(0);
      for (let y = 0; y < rows; y++) for (let x = 0; x < GC; x++) {
        const tl = at(blur, x - 1, y - 1), tm = at(blur, x, y - 1), tr = at(blur, x + 1, y - 1);
        const ml = at(blur, x - 1, y), mr = at(blur, x + 1, y);
        const bl = at(blur, x - 1, y + 1), bm = at(blur, x, y + 1), br = at(blur, x + 1, y + 1);
        const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        const gy = (bl + 2 * bm + br) - (tl + 2 * tm + tr);
        const i = y * GC + x;
        gxA[i] = gx; gyA[i] = gy;
        mag[i] = Math.min(1, Math.hypot(gx, gy) * 1.2);
        colE[x] += Math.abs(gx);
      }
      // A tiny copy of the picture: upscaled, it's a soft watercolour wash.
      const ww = 36, wh = Math.max(4, Math.round(36 * rows / GC));
      if (wash.width !== ww || wash.height !== wh) { wash.width = ww; wash.height = wh; }
      wx.imageSmoothingEnabled = true;
      wx.drawImage(an, 0, 0, ww, wh);
      cdfBg = '';
    }

    // Where strokes start: more where the picture differs from the paper or has edges.
    function buildCdf() {
      const bl = lumOf(...rgbOf(ctx.palette.bg));
      let acc = 0;
      for (let i = 0; i < lum.length; i++) {
        const contrast = Math.min(1, Math.abs(lum[i] - bl) * 1.35);
        acc += Math.pow(contrast, 1.6) + mag[i] * 0.9 + 0.02;
        cdf[i] = acc;
      }
      total = acc;
      let ca = 0;
      for (let x = 0; x < GC; x++) { ca += colE[x] * colE[x] + 0.05; colCdf[x] = ca; }
      colTotal = ca;
      cdfBg = ctx.palette.bg;
    }
    const pickFrom = (arr, tot, len) => {
      const u = R() * tot;
      let lo = 0, hi = len - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < u) lo = mid + 1; else hi = mid; }
      return lo;
    };
    const cellAt = (x, y, W, H) => {
      let cx = Math.floor(x / W * GC), cy = Math.floor(y / H * GR);
      cx = cx < 0 ? 0 : cx >= GC ? GC - 1 : cx;
      cy = cy < 0 ? 0 : cy >= GR ? GR - 1 : cy;
      return cy * GC + cx;
    };

    // ---------- Colours ----------
    let C = null, palKey = '';
    function readPalette() {
      const pal = ctx.palette;
      const key = pal.bg + pal.ink + pal.c1 + pal.c2 + pal.c3 + pal.c4;
      if (key === palKey) return false;
      palKey = key;
      C = { bg: rgbOf(pal.bg), ink: rgbOf(pal.ink), list: [pal.ink, pal.c1, pal.c2, pal.c3, pal.c4].map(rgbOf) };
      C.bgL = lumOf(...C.bg);
      return true;
    }
    function strokeColour(i, darken, a) {
      let r = rgb[i * 4], g = rgb[i * 4 + 1], b = rgb[i * 4 + 2];
      const ink = C.ink;
      const contrast = Math.min(1, Math.abs(lum[i] - C.bgL) * 1.4);
      const mode = P.colour;
      if (mode === 'Ink') {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx > 0 ? (mx - mn) / mx : 0;
        // Ink, except strongly coloured spots (a red car, a sign) which get the first accent.
        if (sat > 0.45 && mx > 70 && R() < sat) [r, g, b] = C.list[1];
        else [r, g, b] = ink;
      } else if (mode === 'Palette') {
        let best = 0, bd = Infinity;
        for (let k = 0; k < C.list.length; k++) {
          const q = C.list[k];
          const d = ((r - q[0]) ** 2 + (g - q[1]) ** 2 + (b - q[2]) ** 2) * (k === 0 ? 0.6 : 1);
          if (d < bd) { bd = d; best = k; }
        }
        [r, g, b] = C.list[best];
      } else {
        // Photo: many lines pulled toward ink (the dark scaffold), the rest saturated photo colour.
        if (R() < 0.08 + 0.62 * contrast * contrast) {
          const k = 0.55 + R() * 0.4;
          r += (ink[0] - r) * k; g += (ink[1] - g) * k; b += (ink[2] - b) * k;
        } else {
          const m = (r + g + b) / 3;
          r = m + (r - m) * 1.55; g = m + (g - m) * 1.55; b = m + (b - m) * 1.55;
          r += (ink[0] - r) * 0.18; g += (ink[1] - g) * 0.18; b += (ink[2] - b) * 0.18;
        }
      }
      if (darken > 0) { r += (ink[0] - r) * darken; g += (ink[1] - g) * darken; b += (ink[2] - b) * darken; }
      return `rgba(${clamp255(r)},${clamp255(g)},${clamp255(b)},${a.toFixed(3)})`;
    }

    // ---------- The drawing buffer ----------
    const buf = document.createElement('canvas');
    const bctx = buf.getContext('2d');
    let restart = { x: 0.5, y: 0.55 };   // pending restart (flurry origin), or null
    let flurry = null;                    // { t, x, y }
    let fadeAcc = 0, cycleT = 0;
    let lastPen = null;
    const vp = { x: R.range(0.44, 0.56), y: R.range(0.46, 0.6) };
    let ring = 0;

    function clearBuffer() {
      bctx.save();
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, buf.width, buf.height);
      bctx.restore();
    }

    // One loose stroke from (x, y), bending along the picture's edges.
    function drawStroke(c, W, H, x, y, darken, alphaMul, widthMul, lenMul) {
      const i0 = cellAt(x, y, W, H);
      const unit = W / 600;
      // Some strokes are straight ruled hatching that ignores the edges.
      const straight = R() < 0.38;
      const len = unit * P.length * lenMul * (6 + 80 * Math.pow(R(), 2)) * (straight ? 1.6 : 1);
      const step = unit * (3.5 + R() * 2.5);
      const steps = Math.max(2, Math.min(32, Math.ceil(len / step)));
      const fol = straight ? 0 : P.follow, jit = P.jitter;
      let h, turn = 0;
      if (R() < fol * smooth(0.04, 0.22, mag[i0])) {
        h = Math.atan2(gyA[i0], gxA[i0]) + Math.PI / 2 + (R() < 0.5 ? 0 : Math.PI);
      } else {
        // Architectural hatching: mostly verticals, some horizontals.
        h = (R() < 0.62 ? Math.PI / 2 : 0) + (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.3 * (0.4 + jit);
      }
      c.beginPath();
      c.moveTo(x, y);
      let px = x, py = y;
      const l0 = lum[i0];
      for (let s = 0; s < steps; s++) {
        const j = cellAt(px, py, W, H);
        // Lift the pen when the stroke wanders into a clearly different tone: keeps shapes crisp.
        if (s > 1 && Math.abs(lum[j] - l0) > 0.22) break;
        const f = fol * smooth(0.04, 0.22, mag[j]) * 0.55;
        if (f > 0) {
          let tg = Math.atan2(gyA[j], gxA[j]) + Math.PI / 2;
          let d = angDiff(tg, h);
          if (Math.abs(d) > Math.PI / 2) { tg += Math.PI; d = angDiff(tg, h); }
          h += d * f;
        }
        // Lines close to vertical / horizontal snap a little, like a draughtsman's hand.
        const q = Math.round(h / (Math.PI / 2)) * (Math.PI / 2);
        const dq = h - q;
        if (Math.abs(dq) < 0.22) h -= dq * 0.4;
        // Wobble with momentum: gentle bends, not curls.
        turn = turn * 0.8 + (R() - 0.5) * 0.12 * jit;
        h += turn + (R() - 0.5) * (straight ? 0.04 : 0.12) * jit;
        const nx = px + Math.cos(h) * step, ny = py + Math.sin(h) * step;
        c.quadraticCurveTo(px, py, (px + nx) / 2, (py + ny) / 2);
        px = nx; py = ny;
      }
      c.lineTo(px, py);
      c.lineWidth = P.weight * widthMul * (0.35 + R() * 0.85) * Math.max(0.75, unit);
      const contrast = Math.min(1, Math.abs(l0 - C.bgL) * 1.4);
      c.strokeStyle = strokeColour(i0, darken, Math.min(1, (0.3 + R() * 0.55) * (0.35 + 0.65 * contrast) * alphaMul));
      c.stroke();
    }

    // A long, nearly straight construction line: to the vanishing point, or a plumb / level line.
    function constructionLine(c, W, H) {
      const k = R();
      let x0, y0, x1, y1;
      const vx = vp.x * W, vy = vp.y * H;
      if (k < 0.5) {
        let tx, ty;
        const e = R();
        if (e < 0.55) { tx = R() * W * 1.6 - W * 0.3; ty = H; }
        else if (e < 0.8) { tx = R() < 0.5 ? 0 : W; ty = vy + R() * (H - vy); }
        else { tx = R() * W; ty = 0; }
        const s0 = R() * 0.45;
        x0 = vx + (tx - vx) * s0; y0 = vy + (ty - vy) * s0;
        x1 = tx + (tx - vx) * 0.2; y1 = ty + (ty - vy) * 0.2;
      } else if (k < 0.8) {
        const col = pickFrom(colCdf, colTotal, GC);
        x0 = x1 = (col + R()) / GC * W;
        y0 = R() * H * 0.7; y1 = y0 + H * (0.25 + R() * 0.8);
        x1 += (R() - 0.5) * W * 0.012;
      } else {
        y0 = y1 = R() * H;
        x0 = R() * W * 0.6 - W * 0.1; x1 = x0 + W * (0.3 + R() * 0.8);
        y1 += (R() - 0.5) * H * 0.01;
      }
      // Two slight wobbles along the way.
      const wob = W * 0.004 * (0.5 + P.jitter);
      c.beginPath();
      c.moveTo(x0, y0);
      for (let s = 1; s <= 3; s++) {
        const t = s / 3;
        c.lineTo(x0 + (x1 - x0) * t + (s < 3 ? (R() - 0.5) * wob : 0), y0 + (y1 - y0) * t + (s < 3 ? (R() - 0.5) * wob : 0));
      }
      const mi = cellAt((x0 + x1) / 2, (y0 + y1) / 2, W, H);
      c.lineWidth = P.weight * (0.3 + R() * 0.45) * Math.max(0.75, W / 600);
      c.strokeStyle = P.colour === 'Photo' && R() < 0.3
        ? strokeColour(mi, 0.2, 0.18 + R() * 0.2)
        : hexA(ctx.palette.ink, 0.1 + R() * 0.22);
      c.stroke();
    }

    const stage = createP5Stage(ctx, {
      draw(p, t, dt) {
        const W = p.width, H = p.height, d = p.pixelDensity(), c = p.drawingContext;
        const pal = ctx.palette;
        const ptr = ctx.pointer;
        const mPow = ctx.state.motion.mouse;

        // Buffer at device resolution; resizing clears it, so start over.
        const bw = Math.round(W * d), bh = Math.round(H * d);
        if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; restart = restart || { x: 0.5, y: 0.55 }; }
        bctx.setTransform(d, 0, 0, d, 0, 0);

        // Re-read the picture when it changes (webcam: at most ~12 times a second).
        const now = performance.now();
        if (src.version !== anVer || W !== anW || H !== anH) {
          if (src.kind !== 'webcam' || now - anAt > 80 || anVer < 0 || W !== anW || H !== anH) {
            analyse(W, H);
            anVer = src.version; anW = W; anH = H; anAt = now;
          }
        }
        if (readPalette()) restart = restart || { x: 0.5, y: 0.55 };
        if (cdfBg !== pal.bg) buildCdf();

        if (ptr.justPressed) restart = { x: ptr.x, y: ptr.y };
        cycleT += dt;
        if (cycleT > CYCLE) restart = { x: R.range(0.25, 0.75), y: R.range(0.3, 0.7) };
        if (restart) {
          clearBuffer();
          flurry = { t: 0, x: restart.x, y: restart.y };
          restart = null; cycleT = 0; fadeAcc = 0;
        }

        if (dt > 0) {
          // Fade old ink (in steps, so tiny alphas don't get lost to rounding).
          const wipe = cycleT > CYCLE - 5 ? 0.45 : 0;
          fadeAcc += dt * (0.03 + P.paper * 0.28 + wipe);
          if (fadeAcc >= 0.035) {
            bctx.save();
            bctx.globalCompositeOperation = 'destination-out';
            bctx.fillStyle = `rgba(0,0,0,${Math.min(1, fadeAcc).toFixed(3)})`;
            bctx.fillRect(0, 0, W, H);
            bctx.restore();
            fadeAcc = 0;
          }

          bctx.save();
          bctx.lineCap = 'round';
          bctx.lineJoin = 'round';
          const frameMul = Math.min(2.5, dt * 60);
          let count = P.strokes * frameMul;
          let radius = Infinity, fx = 0, fy = 0;
          if (flurry) {
            flurry.t += dt;
            const u = flurry.t / FLURRY;
            if (u >= 1) flurry = null;
            else {
              count *= 1 + 6 * (1 - u);
              radius = u * 1.3 * Math.hypot(W, H);
              fx = flurry.x * W; fy = flurry.y * H;
            }
          }
          count = Math.min(1500, Math.round(count));
          // Main batch: start points drawn from the importance map.
          let drawn = 0;
          for (let a = 0; a < count * 3 && drawn < count; a++) {
            const cell = pickFrom(cdf, total, lum.length);
            const x = ((cell % GC) + R()) / GC * W;
            const y = (Math.floor(cell / GC) + R()) / GR * H;
            if (radius !== Infinity && Math.hypot(x - fx, y - fy) > radius) continue;
            drawStroke(bctx, W, H, x, y, 0, 1, 1, 1);
            drawn++;
          }
          // Construction lines.
          const nCon = P.perspective * P.perspective * 4 * (P.strokes / 70) * frameMul * (flurry ? 3 : 1);
          let cn = Math.floor(nCon) + (R() < nCon % 1 ? 1 : 0);
          while (cn-- > 0) constructionLine(bctx, W, H);

          // The pen: dense, darker strokes around the cursor, plus its own scribbled trail.
          const hover = ptr.inside ? mPow : 0;
          if (hover > 0) {
            const px = ptr.x * W, py = ptr.y * H;
            const rad = W * 0.045 * (0.75 + 0.25 * Math.min(2, hover));
            const n = Math.round(P.strokes * 0.6 * Math.min(2, hover) * frameMul) + 2;
            for (let k = 0; k < n; k++) {
              const g1 = (R() + R() + R() - 1.5) * rad, g2 = (R() + R() + R() - 1.5) * rad;
              drawStroke(bctx, W, H, px + g1, py + g2, 0.35, 1.25, 1.15, 0.8);
            }
            if (lastPen) {
              const dist = Math.hypot(px - lastPen.x, py - lastPen.y);
              if (dist > 1.5) {
                bctx.strokeStyle = hexA(pal.ink, 0.55);
                bctx.lineWidth = P.weight * 0.7 * Math.max(0.75, W / 600);
                for (let k = 0; k < 2; k++) {
                  const j = Math.min(6, dist * 0.25) * P.jitter + 0.5;
                  bctx.beginPath();
                  bctx.moveTo(lastPen.x + (R() - 0.5) * j, lastPen.y + (R() - 0.5) * j);
                  bctx.quadraticCurveTo((lastPen.x + px) / 2 + (R() - 0.5) * j * 2, (lastPen.y + py) / 2 + (R() - 0.5) * j * 2, px + (R() - 0.5) * j, py + (R() - 0.5) * j);
                  bctx.stroke();
                }
              }
            }
            lastPen = { x: px, y: py };
          } else lastPen = null;
          bctx.restore();
          ring += ((hover > 0 ? 1 : 0) - ring) * Math.min(1, dt * 8);
        }

        // Compose: paper, a soft colour wash, then the ink.
        c.save();
        c.fillStyle = pal.bg;
        c.fillRect(0, 0, W, H);
        if (P.wash > 0) {
          c.globalAlpha = P.wash * 0.8;
          c.imageSmoothingEnabled = true;
          c.imageSmoothingQuality = 'high';
          c.drawImage(wash, 0, 0, W, H);
          c.globalAlpha = 1;
        }
        c.drawImage(buf, 0, 0, W, H);
        // A faint nib ring shows where the pen is.
        if (ring > 0.02 && ptr.inside) {
          c.strokeStyle = hexA(pal.ink, 0.3 * ring);
          c.lineWidth = 1;
          c.beginPath();
          c.arc(ptr.x * W, ptr.y * H, W * 0.045 * ring, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();
        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return {
      resize: stage.resize,
      frame: stage.frame,
      dispose() { stage.dispose(); buf.width = buf.height = 0; an.width = an.height = 0; },
      onParam(key) {
        if (key === 'source' && src.kind !== 'webcam') { anVer = -1; restart = { x: 0.5, y: 0.55 }; }
        if (key === 'colour') restart = { x: 0.5, y: 0.55 };
      },
    };
  },
};
