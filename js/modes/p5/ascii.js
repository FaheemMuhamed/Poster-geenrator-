// ASCII Lens: a drifting brightness field rendered as ASCII characters, with a magnifying
// lens that follows the cursor and sets the characters inside it bigger and brighter (ref 7).
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawBloom, drawGrain, hexA } from '../../shared/bloom2d.js';
import { accents } from '../../shared/palettes.js';
import { LINE_KEYS } from '../../shared/typeLayer.js';

const RAMPS = {
  'Classic  .:-=+*#%@': ' .:-=+*#%@',
  'Round  .oO0@': ' .oO0@',
  'Binary 01': ' 01',
  'Blocks ░▒▓█': ' ░▒▓█',
  'Custom': null,
};
const MONO = '"JetBrains Mono", "Space Mono", ui-monospace, Menlo, monospace';

export default {
  id: 'ascii',
  name: 'ASCII Lens',
  engine: 'p5',
  hint: 'Move to steer the lens · click to toggle its pulse',
  controls: {
    essentials: ['source', 'cols', 'lensSize', 'speed'],
    form: [],
    motion: ['jitter'],
    interaction: ['zoom'],
    colour: ['colour'],
    type: ['ramp', 'custom'],
  },
  presets: {
    'Fine': { cols: 110, jitter: 0, lensSize: 0.15, speed: 0.6 },
    'Glitch': { jitter: 0.8, speed: 2, ramp: 'Binary 01' },
    'Blocky': { cols: 48, ramp: 'Blocks ░▒▓█', zoom: 3, lensSize: 0.3 },
  },
  interactions: { hover: 'steers a magnifying lens that enlarges the characters under it', click: 'toggles a breathing pulse on the lens' },
  params: {
    cols:     { value: 72, min: 40, max: 120, step: 1, label: 'Column count' },
    ramp:     { value: 'Classic  .:-=+*#%@', options: Object.keys(RAMPS), label: 'Character set' },
    custom:   { value: ' .·:*◦○●', label: 'Custom characters', noShuffle: true },
    source:   { value: 'Blobs', options: ['Blobs', 'Waves', 'Rings', 'Text'], label: 'Source' },
    colour:   { value: 'Palette', options: ['Mono', 'Palette', 'Inverted'], label: 'Colour mode' },
    lensSize: { value: 0.22, min: 0, max: 0.5, step: 0.005, label: 'Lens size' },
    zoom:     { value: 2.2, min: 1, max: 4, step: 0.05, label: 'Lens zoom', unit: '×' },
    speed:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Speed' },
    jitter:   { value: 0.15, min: 0, max: 1, step: 0.01, label: 'Jitter amount' },
  },

  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;

    // Drifting soft blobs (in 0..1 poster space).
    const blobs = Array.from({ length: 6 }, () => ({
      x: r.range(0.15, 0.85), y: r.range(0.15, 0.85), r: r.range(0.12, 0.3),
      sp: r.range(0.08, 0.22), ph: r.range(0, 100), w: r.range(0.6, 1),
    }));
    const centres = [{ ph: r.range(0, 100) }, { ph: r.range(0, 100) }];

    const lens = { x: 0.5, y: 0.45, pulse: false, kick: 0 };

    // ---- Brightness sources: f(u, v, t) -> 0..1, with u, v in poster space (v = 0..1, u scaled by aspect) ----
    let asp = 0.7;
    const src = {
      Blobs(u, v, t) {
        let s = 0;
        for (let i = 0; i < blobs.length; i++) {
          const b = blobs[i]; // b.cx / b.cy are updated once per frame in prep()
          const dx = u - b.cx, dy = v - b.cy;
          s += b.w * Math.exp(-(dx * dx + dy * dy) * b.ir2);
        }
        s += 0.08 * Math.sin(u * 23 + t * 0.9) * Math.sin(v * 19 - t * 0.7);
        return 1 - Math.exp(-Math.max(0, s) * 1.25); // soft shoulder keeps gradation
      },
      Waves(u, v, t) {
        const a = Math.sin(u * 9 + Math.sin(v * 4 + t * 0.6) * 1.8 + t * 0.8);
        const b = Math.sin(v * 7 - t * 0.5 + Math.cos(u * 5 - t * 0.3) * 1.5);
        return 0.5 + 0.28 * a + 0.22 * b;
      },
      Rings(u, v, t) {
        let s = 0;
        centres.forEach((c, i) => {
          const cx = (0.5 + Math.sin(t * 0.13 + c.ph) * 0.25) * asp, cy = 0.5 + Math.cos(t * 0.1 + c.ph) * 0.3;
          const d = Math.hypot(u - cx, v - cy);
          s += (0.5 + 0.5 * Math.cos(d * 38 - t * 2 * (i ? -1 : 1))) * Math.exp(-d * 1.6);
        });
        return s * 0.85;
      },
      Text(u, v, t) {
        // Sample the title raster with a gentle wave displacement, plus a faint blob glow.
        if (!textBuf.data) return 0;
        const du = u / asp + Math.sin(v * 12 + t * 1.2) * 0.012;
        const dv = v + Math.sin(u * 9 - t) * 0.01;
        const x = Math.floor(du * textBuf.w), y = Math.floor(dv * textBuf.h);
        const tv = x >= 0 && y >= 0 && x < textBuf.w && y < textBuf.h ? textBuf.data[(y * textBuf.w + x) * 4] / 255 : 0;
        return tv * 0.9 + src.Blobs(u, v, t) * 0.25;
      },
    };

    // Per-frame blob positions (so the per-cell field stays cheap).
    function prep(t) {
      for (const b of blobs) {
        b.cx = (b.x + Math.sin(t * b.sp + b.ph) * 0.18) * asp;
        b.cy = b.y + Math.cos(t * b.sp * 0.8 + b.ph * 1.3) * 0.16;
        b.ir2 = 1 / (b.r * b.r);
      }
    }

    // ---- Text source: the poster title rendered into a small offscreen canvas ----
    const textBuf = { key: '', data: null, w: 160, h: 220 };
    const tc = document.createElement('canvas');
    const tctx = tc.getContext('2d', { willReadFrequently: true });
    function updateText(W, H) {
      const T = ctx.state.text;
      const words = LINE_KEYS.map((k) => T.lines[k]).filter(Boolean);
      const title = (T.lines.title || words[0] || 'ASCII').trim();
      const key = `${title}|${T.font}|${T.weight}|${Math.round(W)}x${Math.round(H)}`;
      if (key === textBuf.key) return;
      textBuf.key = key;
      textBuf.w = 160; textBuf.h = Math.round(160 * H / W);
      tc.width = textBuf.w; tc.height = textBuf.h;
      tctx.fillStyle = '#000';
      tctx.fillRect(0, 0, tc.width, tc.height);
      tctx.fillStyle = '#fff';
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';
      // Stack the title one word per line, as big as fits.
      const lines = title.split(/\s+/);
      let size = tc.height / (lines.length * 1.05 + 0.6);
      tctx.font = `${T.weight >= 700 ? T.weight : 900} ${size}px "${T.font}", Inter, sans-serif`;
      const widest = Math.max(...lines.map((l) => tctx.measureText(l).width));
      size = Math.min(size, size * (tc.width * 0.88) / widest);
      tctx.font = `${T.weight >= 700 ? T.weight : 900} ${size}px "${T.font}", Inter, sans-serif`;
      // Stretch vertically so even a single word fills a good part of the poster (condensed display type).
      const stretch = Math.max(1, Math.min(5, (tc.height * 0.62) / (lines.length * size * 1.02)));
      tctx.save();
      tctx.translate(tc.width / 2, tc.height / 2);
      tctx.scale(1, stretch);
      lines.forEach((l, i) => tctx.fillText(l, 0, (i - (lines.length - 1) / 2) * size * 1.02));
      tctx.restore();
      textBuf.data = tctx.getImageData(0, 0, tc.width, tc.height).data;
    }
    document.fonts?.ready.then(() => { textBuf.key = ''; atlas.key = ''; });

    // ---- Glyph atlas: each ramp level pre-rendered in its colour, then blitted with drawImage ----
    const atlas = { key: '', canvas: document.createElement('canvas'), cell: 0, n: 0, scale: 1 };
    function levelColours(n, pal, mode) {
      const A = accents(pal);
      const out = [];
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i / (n - 1) : 1;
        if (mode === 'Mono') out.push(hexA(pal.ink, 0.35 + 0.65 * k));
        else if (mode === 'Inverted') out.push(hexA(pal.bg, 0.3 + 0.7 * k));
        else {
          // Palette: visual weight rises with level — soft accent, warm accent, deep accent, ink.
          const stops = [A[1], A[0], A[2], pal.ink];
          const col = stops[Math.min(stops.length - 1, Math.floor(k * (stops.length - 0.01)))];
          out.push(hexA(col, 0.55 + 0.45 * k));
        }
      }
      return out;
    }
    function buildAtlas(chars, cw, ch, d, zoom, pal, mode) {
      const scale = d * Math.max(1, zoom * 1.1);
      const key = `${chars}|${cw.toFixed(2)}|${ch.toFixed(2)}|${scale.toFixed(2)}|${mode}|${pal.ink}${pal.bg}${pal.c1}${pal.c2}${pal.c3}${pal.c4}`;
      if (atlas.key === key) return;
      atlas.key = key;
      const n = chars.length;
      const cwp = Math.ceil(cw * scale), chp = Math.ceil(ch * scale);
      atlas.canvas.width = cwp * n;
      atlas.canvas.height = chp * 2; // row 0 normal, row 1 "bright" (lens)
      atlas.cw = cwp; atlas.ch = chp; atlas.n = n;
      const g = atlas.canvas.getContext('2d');
      g.clearRect(0, 0, atlas.canvas.width, atlas.canvas.height);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `500 ${ch * 0.82 * scale}px ${MONO}`;
      const cols = levelColours(n, pal, mode);
      const bright = mode === 'Inverted' ? pal.bg : mode === 'Mono' ? pal.ink : pal.c1;
      [...chars].forEach((chr, i) => {
        if (chr === ' ') return;
        g.fillStyle = cols[i];
        g.fillText(chr, cwp * (i + 0.5), chp * 0.52);
        g.fillStyle = i >= n - 2 ? (mode === 'Palette' ? pal.ink : bright) : bright;
        g.fillText(chr, cwp * (i + 0.5), chp * 1.52);
      });
    }

    // Cheap per-cell hash for jitter.
    const hash = (a, b, c) => {
      let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };

    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, time, dt) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const d = p.pixelDensity();
        const pal = ctx.palette;
        const mouse = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        const mode = P.colour;
        const t = time * P.speed;
        asp = W / H;

        // Background: bloom (on ink for Inverted).
        const bgPal = mode === 'Inverted' ? { ...pal, bg: pal.ink } : pal;
        drawBloom(c, W, H, { palette: bgPal, seed: ctx.state.seed, time, amount: ctx.state.bloom.amount * (mode === 'Mono' ? 0.35 : 0.8), count: ctx.state.bloom.count });

        let chars = RAMPS[P.ramp] ?? (' ' + (P.custom || '.:*#').replace(/^\s+/, ''));
        if (chars.length < 2) chars = ' .:-=+*#%@';
        const n = chars.length;

        // Grid geometry: columns set the cell width; cells are ~1.65× taller than wide.
        const cols = Math.round(P.cols);
        const cw = W / cols, ch = cw * 1.65;
        const rows = Math.ceil(H / ch);
        buildAtlas(chars, cw, ch, d, P.zoom, pal, mode);
        if (P.source === 'Text') updateText(W, H);
        const f = src[P.source] || src.Blobs;
        prep(t);

        // Lens: follows the cursor (lerp) or drifts on its own; click toggles a breathing pulse.
        if (mouse.justPressed && mouse.inside) { lens.pulse = !lens.pulse; lens.kick = 1; }
        lens.kick *= Math.pow(0.05, Math.max(dt, 0.016));
        const follow = mouse.inside && mPow > 0;
        const lx = follow ? mouse.x : 0.5 + Math.sin(time * 0.21) * 0.25;
        const ly = follow ? mouse.y : 0.45 + Math.sin(time * 0.15 + 1) * 0.2;
        const k = 1 - Math.pow(0.03, Math.max(dt, 0.016) * Math.min(2, 0.4 + mPow));
        lens.x += (lx - lens.x) * k; lens.y += (ly - lens.y) * k;
        const pulse = lens.pulse ? 1 + Math.sin(time * 2.4) * 0.18 : 1;
        const R = P.lensSize * W * pulse * (1 + lens.kick * 0.25) * (follow ? Math.min(1.4, 0.6 + mPow * 0.4) : 1);
        const LX = lens.x * W, LY = lens.y * H;
        const jit = P.jitter;
        const jt = Math.floor(time * 10);
        const AC = atlas.canvas, acw = atlas.cw, ach = atlas.ch;

        // ---- Main grid (skipping cells under the lens) ----
        c.imageSmoothingEnabled = true;
        for (let j = 0; j < rows; j++) {
          const y = j * ch;
          const v = (y + ch / 2) / H;
          for (let i = 0; i < cols; i++) {
            const x = i * cw;
            const cx = x + cw / 2, cy = y + ch / 2;
            if (R > 0) { const dx = cx - LX, dy = cy - LY; if (dx * dx + dy * dy < R * R) continue; }
            let b = f(cx / H, v, t);
            if (jit > 0) b += (hash(i, j, jt) - 0.5) * jit * 0.35;
            let lv = Math.floor(Math.min(0.999, Math.max(0, b)) * n);
            if (lv <= 0) continue;
            const ox = jit > 0.3 && hash(j, i, jt) < (jit - 0.3) * 0.3 ? (hash(i, jt, j) - 0.5) * cw * jit : 0;
            c.drawImage(AC, lv * acw, 0, acw, ach, x + ox, y, cw, ch);
          }
        }

        // ---- Lens: magnified view (sample a zoomed-in field, draw bigger, brighter chars) ----
        if (R > 1) {
          const z = P.zoom;
          const zw = cw * z, zh = ch * z;
          c.save();
          c.beginPath();
          c.arc(LX, LY, R, 0, Math.PI * 2);
          // Faint fill so the lens reads as glass.
          c.fillStyle = mode === 'Inverted' ? hexA(pal.bg, 0.06) : hexA(pal.bg, 0.55);
          c.fill();
          c.clip();
          const n0 = Math.ceil(R / zw) + 1, m0 = Math.ceil(R / zh) + 1;
          // Snap the zoomed grid to the lens centre's field position so it scrolls naturally.
          const fx = LX / zw - Math.floor(LX / zw), fy = LY / zh - Math.floor(LY / zh);
          for (let j = -m0; j <= m0; j++) {
            for (let i = -n0; i <= n0; i++) {
              const x = LX + (i - fx) * zw, y = LY + (j - fy) * zh;
              const cx = x + zw / 2, cy = y + zh / 2;
              const dx = cx - LX, dy = cy - LY;
              const dd = Math.sqrt(dx * dx + dy * dy) / R;
              if (dd > 1.05) continue;
              // Field position under this cell, pulled toward the lens centre (= magnified).
              const sx = LX + dx / z, sy = LY + dy / z;
              let b = f(sx / H, sy / H, t) * 1.06 + 0.05;
              if (jit > 0) b += (hash(i + 999, j, jt) - 0.5) * jit * 0.2;
              const lv = Math.floor(Math.min(0.999, Math.max(0, b)) * n);
              if (lv <= 0) continue;
              const row = dd < 0.8 ? 1 : 0; // bright glyphs in the middle of the glass
              c.drawImage(AC, lv * acw, row * ach, acw, ach, x, y, zw, zh);
            }
          }
          c.restore();
          // Ring outline, tick marks and a tiny readout.
          c.save();
          const ringCol = mode === 'Inverted' ? pal.bg : pal.ink;
          c.strokeStyle = ringCol;
          c.lineWidth = 1;
          c.beginPath(); c.arc(LX, LY, R, 0, Math.PI * 2); c.stroke();
          c.strokeStyle = hexA(ringCol, 0.4);
          c.setLineDash([2, 4]);
          c.beginPath(); c.arc(LX, LY, R + 5, 0, Math.PI * 2); c.stroke();
          c.setLineDash([]);
          c.strokeStyle = ringCol;
          c.beginPath();
          for (let q = 0; q < 4; q++) {
            const a = q * Math.PI / 2 + time * 0.2;
            c.moveTo(LX + Math.cos(a) * (R - 6), LY + Math.sin(a) * (R - 6));
            c.lineTo(LX + Math.cos(a) * (R + 9), LY + Math.sin(a) * (R + 9));
          }
          c.stroke();
          const fs = Math.max(8, W * 0.015);
          c.font = `400 ${fs}px ${MONO}`;
          c.fillStyle = ringCol;
          c.textAlign = 'left';
          c.textBaseline = 'middle';
          const lab = `×${P.zoom.toFixed(1)}  ${(lens.x * 100).toFixed(1).padStart(4, '0')},${(lens.y * 100).toFixed(1).padStart(4, '0')}`;
          const a = -Math.PI / 4;
          c.fillText(lab, LX + Math.cos(a) * (R + 14), LY + Math.sin(a) * (R + 14));
          c.restore();
        }
        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return { resize: stage.resize, frame: stage.frame, dispose: stage.dispose };
  },
};
