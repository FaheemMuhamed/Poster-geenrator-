// Glyph Field: rows of one repeated glyph whose spacing follows a density field. Every row keeps
// its two edge glyphs and spreads the rest by the field's inverse CDF, so sparse regions open up
// into shapes: an hourglass, a diamond, waves, or the poster title itself (ref 23).
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain } from '../../shared/bloom2d.js';
import { fontCss, bodyCss } from '../../shared/typeLayer.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const COLOR_KEYS = { 'Accent 1': 'c1', 'Accent 2': 'c2', 'Accent 3': 'c3', 'Accent 4': 'c4', Ink: 'ink' };
const caseOf = (s, c) => (c === 'UPPERCASE' ? s.toUpperCase() : c === 'lowercase' ? s.toLowerCase() : s);

export default {
  id: 'glyphfield',
  name: 'Glyph Field',
  engine: 'p5',
  ownsText: true,
  hint: 'Hover to scatter the glyphs · click to burst them',
  params: {
    shape:     { value: 'Hourglass', options: ['Hourglass', 'Diamond', 'Waves', 'Title'], label: 'Shape' },
    glyph:     { value: 'oo', label: 'Glyph', noShuffle: true },
    grid:      { value: 15, min: 6, max: 30, step: 1, label: 'Grid size', rebuild: true },
    glyphSize: { value: 1, min: 0.4, max: 1.6, step: 0.01, label: 'Glyph size' },
    contrast:  { value: 1, min: 0.2, max: 1, step: 0.01, label: 'Shape contrast' },
    colour:    { value: 'Accent 1', options: ['Accent 1', 'Accent 2', 'Accent 3', 'Accent 4', 'Ink', 'Mixed'], label: 'Colour' },
    wobble:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Wobble' },
    repel:     { value: 1, min: 0, max: 3, step: 0.01, label: 'Repel strength' },
  },
  controls: {
    essentials: ['shape', 'glyph', 'grid', 'colour'],
    groups: { Form: ['glyphSize', 'contrast'], Motion: ['wobble', 'repel'] },
  },

  create(ctx) {
    const P = ctx.params;
    const T = () => ctx.state.text;

    let glyphs = [];
    let layoutKey = '';
    let titleVer = 0;      // bumps when text or fonts change
    let mask = null, maskW = 0, maskH = 0, maskKey = '';
    const sprites = new Map();
    const cur = { x: 0.5, y: 0.5, hov: 0 };
    let geo = { mx: 0, top: 0, fw: 1, fh: 1, cellW: 10, rowH: 10, capH: 0 };

    const maskCanvas = document.createElement('canvas');
    const mctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const blurCanvas = document.createElement('canvas');
    const bctx = blurCanvas.getContext('2d');

    // ---- The title as a soft mask (for Shape = Title) ----
    function buildMask(fw, fh) {
      const key = `${fw | 0}x${fh | 0}:${titleVer}`;
      if (key === maskKey && mask) return;
      maskKey = key;
      maskW = 120; maskH = Math.max(8, Math.round(120 * fh / fw));
      maskCanvas.width = maskW; maskCanvas.height = maskH;
      mctx.clearRect(0, 0, maskW, maskH);
      const text = T();
      // Upper case reads best at this resolution; long words are broken into short lines.
      const words = [];
      for (const w of ((text.lines.title || '').trim() || 'Title').toUpperCase().split(/\s+/)) {
        const parts = Math.ceil(w.length / 5), per = Math.ceil(w.length / parts);
        for (let q = 0; q < w.length; q += per) words.push(w.slice(q, q + per));
      }
      words.splice(5);
      // Fit each word to the width, stack them, then scale the stack to fit the height.
      mctx.fillStyle = '#fff';
      mctx.textAlign = 'center';
      mctx.textBaseline = 'middle';
      const base = 40;
      mctx.font = fontCss(text, base, 800);
      const sizes = words.map((w) => base * (maskW * 0.9) / Math.max(1, mctx.measureText(w).width));
      const total = sizes.reduce((a, b) => a + b * 0.92, 0);
      const k = Math.min(1, (maskH * 0.9) / total);
      let y = (maskH - total * k) / 2;
      words.forEach((w, n) => {
        const sz = sizes[n] * k;
        mctx.font = fontCss(text, sz, 800);
        mctx.fillText(w, maskW / 2, y + sz * 0.46);
        y += sz * 0.92;
      });
      // Soften: shrink and grow back.
      const bw = Math.round(maskW / 2.5), bh = Math.round(maskH / 2.5);
      blurCanvas.width = bw; blurCanvas.height = bh;
      bctx.imageSmoothingEnabled = true;
      bctx.drawImage(maskCanvas, 0, 0, bw, bh);
      mctx.clearRect(0, 0, maskW, maskH);
      mctx.imageSmoothingEnabled = true;
      mctx.drawImage(blurCanvas, 0, 0, maskW, maskH);
      const d = mctx.getImageData(0, 0, maskW, maskH).data;
      mask = new Float32Array(maskW * maskH);
      for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] / 255;
    }
    const maskAt = (u, v) => {
      if (!mask) return 0;
      const x = Math.min(maskW - 1, Math.max(0, Math.round(u * (maskW - 1))));
      const y = Math.min(maskH - 1, Math.max(0, Math.round(v * (maskH - 1))));
      return mask[y * maskW + x];
    };

    // Density 0..1 at (u, v) in the field box (0..1 both ways); asp = width / height of the box.
    function density(shape, u, v, asp) {
      if (shape === 'Diamond') {
        const m = Math.abs(u - 0.5) * asp + Math.abs(v - 0.5);
        return smooth(0.18, 0.42, m);
      }
      if (shape === 'Waves') {
        const w = Math.sin(Math.PI * 2 * (v * 2.6 + 0.22 * Math.sin(Math.PI * 2 * u * 1.1)));
        return smooth(-0.6, 0.9, w);
      }
      // Hourglass: full at top and bottom, narrowing to a waist in the middle.
      return Math.pow(Math.abs(v * 2 - 1), 1.1);
    }

    function layout(W, H) {
      const text = T();
      const capH = text.show ? Math.max(28, H * 0.07) : 0;
      const mx = W * 0.055, top = H * 0.045;
      const fw = W - mx * 2, fh = H - top - Math.max(H * 0.045, capH);
      // Title spells words, so it needs a finer grid than the row-spacing shapes.
      const isTitle = P.shape === 'Title';
      const cols = isTitle ? Math.round(P.grid * 1.7) : Math.round(P.grid);
      const cellW = fw / (cols - 1);
      const rows = Math.max(3, Math.round(fh / (cellW * (isTitle ? 0.68 : 0.56))) + 1);
      const rowH = fh / (rows - 1);
      const key = `${W}x${H}:${P.shape}:${cols}:${P.contrast}:${text.show}:${P.shape === 'Title' ? titleVer : 0}`;
      geo = { mx, top, fw, fh, cellW, rowH, capH, cols, rows };
      if (key === layoutKey) return;
      layoutKey = key;
      const asp = fw / fh;
      const floor = 1 - P.contrast;
      const out = [];
      const mk = (hx, hy, j, k, n) => ({
        hx, hy, ox: 0, oy: 0, vx: 0, vy: 0, rot: 0, vr: 0,
        ph: (j * 7.13 + k * 3.71) % 6.283, row: j, k, n,
      });

      if (isTitle) {
        // Full grid; a glyph sits wherever the title mask is (plus the frame columns,
        // and a sprinkle outside when contrast is lowered).
        buildMask(fw, fh);
        for (let j = 0; j < rows; j++) {
          for (let k = 0; k < cols; k++) {
            const u = k / (cols - 1), v = j / (rows - 1);
            const m = maskAt(u, v);
            const sprinkle = ((Math.sin(j * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1 < floor * 0.45;
            if (k === 0 || k === cols - 1 || m > 0.42 || sprinkle) out.push(mk(mx + u * fw, top + j * rowH, j, k, cols));
          }
        }
        glyphs = out;
        return;
      }

      const M = 96;
      const cdf = new Float32Array(M + 1);
      for (let j = 0; j < rows; j++) {
        const v = j / (rows - 1);
        // Cumulative density along the row.
        cdf[0] = 0;
        for (let m = 0; m < M; m++) {
          const u = (m + 0.5) / M;
          const d = floor + (1 - floor) * density(P.shape, u, v, asp);
          cdf[m + 1] = cdf[m] + Math.max(0.004, d) / M;
        }
        const total = cdf[M];
        const n = Math.max(2, Math.round(1 + total * (cols - 1)));
        // Place glyph k where the cumulative density reaches k / (n - 1): inverse CDF.
        let m = 0;
        for (let k = 0; k < n; k++) {
          const target = (k / (n - 1)) * total;
          while (m < M - 1 && cdf[m + 1] < target) m++;
          const seg = cdf[m + 1] - cdf[m];
          const u = (m + (seg > 0 ? (target - cdf[m]) / seg : 0)) / M;
          const uu = k === 0 ? 0 : k === n - 1 ? 1 : u;
          out.push(mk(mx + uu * fw, top + j * rowH, j, k, n));
        }
      }
      glyphs = out;
    }

    // ---- Glyph sprite (pre-rendered, so hundreds of glyphs draw as cheap images) ----
    function sprite(colour, h, dpr) {
      const text = T();
      const g = (P.glyph || '').trim() || 'oo';
      const key = `${g}|${colour}|${h.toFixed(1)}|${dpr}|${text.font}|${text.weight}|${titleVer}`;
      let s = sprites.get(key);
      if (s) return s;
      if (sprites.size > 24) sprites.clear();
      const sc = dpr * 1.8; // headroom for swelling
      const cnv = document.createElement('canvas');
      const cx = cnv.getContext('2d');
      let wCss;
      if (g === 'oo') {
        // Two interlinked rings.
        const r = h * 0.4, lw = h * 0.16, gap = r * 1.55;
        wCss = gap + r * 2 + lw * 2;
        cnv.width = Math.ceil(wCss * sc); cnv.height = Math.ceil(h * 1.2 * sc);
        cx.scale(sc, sc);
        const cy = h * 0.6, x1 = wCss / 2 - gap / 2, x2 = wCss / 2 + gap / 2;
        cx.strokeStyle = colour; cx.lineWidth = lw; cx.lineCap = 'butt';
        cx.beginPath(); cx.arc(x1, cy, r, 0, Math.PI * 2); cx.stroke();
        cx.beginPath(); cx.arc(x2, cy, r, 0, Math.PI * 2); cx.stroke();
        // Re-draw the left ring's lower crossing on top, cutting a hairline gap, so they interlock.
        const a = Math.acos(Math.min(1, gap / 2 / r));
        cx.save();
        cx.globalCompositeOperation = 'destination-out';
        cx.lineWidth = lw * 1.9;
        cx.beginPath(); cx.arc(x1, cy, r, a - 0.32, a + 0.32); cx.stroke();
        cx.restore();
        cx.beginPath(); cx.arc(x1, cy, r, a - 0.36, a + 0.36); cx.stroke();
      } else {
        const fs = h;
        cx.font = fontCss(text, fs, Math.max(600, text.weight || 600));
        wCss = Math.max(h * 0.5, cx.measureText(g).width + h * 0.1);
        cnv.width = Math.ceil(wCss * sc); cnv.height = Math.ceil(h * 1.2 * sc);
        cx.scale(sc, sc);
        cx.font = fontCss(text, fs, Math.max(600, text.weight || 600));
        cx.fillStyle = colour;
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.fillText(g, wCss / 2, h * 0.62);
      }
      s = { cnv, w: wCss, h: h * 1.2 };
      sprites.set(key, s);
      return s;
    }

    const refresh = () => { titleVer++; sprites.clear(); };
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) refresh(); });

    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, t, dt) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const dpr = p.pixelDensity();
        const pal = ctx.palette;
        const ptr = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        const text = T();
        dt = Math.min(0.05, dt || 0.016);

        layout(W, H);
        const { cellW, rowH } = geo;

        // Cursor.
        cur.hov += ((ptr.inside ? 1 : 0) - cur.hov) * Math.min(1, dt * 6);
        if (ptr.inside) { cur.x = ptr.x; cur.y = ptr.y; }
        const mx = cur.x * W, my = cur.y * H;
        const hover = cur.hov * mPow * P.repel;
        const R = Math.min(W, H) * 0.17;

        // Click: an outward impulse that fades with distance.
        if (ptr.justPressed && ptr.inside) {
          const bx = ptr.x * W, by = ptr.y * H, RB = Math.hypot(W, H) * 0.55;
          for (const g of glyphs) {
            const dx = g.hx + g.ox - bx, dy = g.hy + g.oy - by;
            const d = Math.hypot(dx, dy) || 1;
            if (d > RB) continue;
            const f = Math.pow(1 - d / RB, 1.5) * 1900 * Math.max(0.3, mPow);
            g.vx += (dx / d) * f; g.vy += (dy / d) * f;
            g.vr += (g.k % 2 ? 1 : -1) * f * 0.004;
          }
        }

        // Springs: pull home, damp, push away from the cursor.
        const K = 70, DAMP = 9;
        const steps = dt > 0.02 ? 2 : 1, h = dt / steps;
        for (let st = 0; st < steps; st++) {
          for (const g of glyphs) {
            let ax = -K * g.ox - DAMP * g.vx, ay = -K * g.oy - DAMP * g.vy;
            if (hover > 0.01) {
              const dx = g.hx + g.ox - mx, dy = g.hy + g.oy - my;
              const d2 = dx * dx + dy * dy;
              if (d2 < R * R) {
                const d = Math.sqrt(d2) || 1;
                const f = Math.pow(1 - d / R, 2) * 5200 * hover;
                ax += (dx / d) * f; ay += (dy / d) * f;
              }
            }
            g.vx += ax * h; g.vy += ay * h;
            g.ox += g.vx * h; g.oy += g.vy * h;
            g.vr += (-K * 0.6 * g.rot - DAMP * 0.8 * g.vr) * h;
            g.rot += g.vr * h;
          }
        }

        c.save();
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = pal.bg;
        c.fillRect(0, 0, W, H);

        // Glyph colour(s).
        const mixed = P.colour === 'Mixed';
        const col = pal[COLOR_KEYS[P.colour] || 'c1'] || pal.c1;
        const mixCols = [pal.c1, pal.c2, pal.c3, pal.c4];
        const gh = Math.min(rowH * 0.62, cellW * 0.46) * P.glyphSize;
        const spr = mixed ? mixCols.map((m) => sprite(m, gh, dpr)) : [sprite(col, gh, dpr)];

        const wob = P.wobble;
        for (const g of glyphs) {
          const s0 = mixed ? spr[(g.row + g.k) % 4] : spr[0];
          const off = Math.hypot(g.ox, g.oy);
          // Idle: a slow travelling swell down the field plus a small drift and tilt per glyph.
          const swell = 1 + 0.09 * wob * Math.sin(t * 1.4 - g.row * 0.35 + g.k * 0.2);
          const sc = swell * (1 + Math.min(0.5, off / (cellW * 4)));
          const x = g.hx + g.ox + Math.sin(t * 0.8 + g.ph) * cellW * 0.05 * wob;
          const y = g.hy + g.oy + Math.cos(t * 0.7 + g.ph * 1.3) * rowH * 0.06 * wob;
          const a = g.rot + Math.sin(t * 0.6 + g.ph) * 0.07 * wob + g.vx * 0.0004;
          const co = Math.cos(a) * sc, si = Math.sin(a) * sc;
          c.setTransform(dpr * co, dpr * si, -dpr * si, dpr * co, dpr * x, dpr * y);
          c.drawImage(s0.cnv, -s0.w / 2, -s0.h / 2, s0.w, s0.h);
        }
        c.setTransform(dpr, 0, 0, dpr, 0, 0);

        // ---- Caption: the title small at the foot, details on the right ----
        if (text.show) {
          const L = text.lines;
          const tc = pal[text.color] || pal.ink;
          const baseY = H - Math.max(H * 0.03, 14);
          const size = Math.max(11, H * 0.026) * (text.size || 1);
          c.fillStyle = tc;
          c.strokeStyle = tc;
          c.globalAlpha = 0.9;
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(geo.mx, baseY - size * 1.55); c.lineTo(W - geo.mx, baseY - size * 1.55);
          c.stroke();
          c.globalAlpha = 1;
          c.textBaseline = 'alphabetic';
          c.textAlign = 'left';
          c.font = fontCss(text, size);
          const title = caseOf(L.title || '', text.textCase);
          c.fillText(title, geo.mx, baseY);
          const tw = c.measureText(title).width;
          const small = size * 0.62;
          c.font = bodyCss(text, small);
          if (L.subtitle) c.fillText(caseOf(L.subtitle, text.textCase), geo.mx + tw + size * 0.6, baseY);
          c.textAlign = 'right';
          const right = [L.date, L.venue].filter(Boolean).join('  ·  ');
          if (right) c.fillText(caseOf(right, text.textCase), W - geo.mx, baseY);
        }
        c.restore();

        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return {
      resize: stage.resize,
      frame: stage.frame,
      dispose() { alive = false; sprites.clear(); stage.dispose(); },
      onParam(k) {
        if (k === 'text') refresh();
        if (k === 'glyph' || k === 'palette') sprites.clear();
      },
    };
  },
};
