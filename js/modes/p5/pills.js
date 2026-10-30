// Pill Stream: rows of capsules flowing sideways with chromatic colour bleed.
// The poster text is set inside dark pills, word by word (refs 1–3).
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawBloom, drawGrain } from '../../shared/bloom2d.js';
import { accents } from '../../shared/palettes.js';
import { LINE_KEYS, fontCss } from '../../shared/typeLayer.js';

export default {
  id: 'pills',
  name: 'Pill Stream',
  engine: 'p5',
  ownsText: true,
  hint: 'Hover to swell and smear the pills',
  controls: {
    essentials: ['rows', 'density', 'bleed', 'flow'],
    form: ['fill', 'shape', 'empty', 'blur'],
    motion: [],
    interaction: [],
    colour: ['inkRatio'],
    type: ['textPills'],
  },
  presets: {
    'Soft glow': { blur: 32, bleed: 1.1, fill: 0.7, flow: 0.4 },
    'Crisp': { blur: 0, bleed: 0, fill: 0.92, flow: 0.8 },
    'Rush': { flow: 2.6, bleed: 1.3, blur: 22, fill: 0.6 },
  },
  interactions: { hover: 'swells the pills near the cursor and smears them with its movement' },
  params: {
    rows:     { value: 22, min: 6, max: 48, step: 1, label: 'Row count', rebuild: true },
    density:  { value: 0.65, min: 0.1, max: 1, step: 0.01, label: 'Density', rebuild: true },
    empty:    { value: 0.35, min: 0, max: 0.85, step: 0.01, label: 'Empty rows', rebuild: true },
    inkRatio: { value: 0.18, min: 0, max: 1, step: 0.01, label: 'Dark pills', rebuild: true },
    fill:     { value: 0.82, min: 0.3, max: 1, step: 0.01, label: 'Pill height' },
    shape:    { value: 'Pill', options: ['Pill', 'Square', 'Mixed'], label: 'Shape', rebuild: true },
    blur:     { value: 14, min: 0, max: 50, step: 0.5, label: 'Glow softness', unit: 'px' },
    bleed:    { value: 0.5, min: 0, max: 1.5, step: 0.01, label: 'Colour bleed' },
    flow:     { value: 0.6, min: 0, max: 4, step: 0.01, label: 'Speed' },
    textPills:{ value: true, label: 'Text in pills' },
  },

  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;

    // Build rows. Lengths are in "pill heights", so 1 = a perfect circle.
    const rows = [];
    for (let i = 0; i < P.rows; i++) {
      const row = { i, empty: r() < P.empty, speed: r.range(0.3, 1.4) * (r() < 0.5 ? -1 : 1), pills: [], total: 0 };
      let x = 0;
      const target = r.range(30, 70);
      while (x < target) {
        if (r() > P.density) { x += r.range(0.5, 4); continue; }
        const len = r() < 0.55 ? 1 : r.range(1.2, 6);
        const ink = r() < P.inkRatio;
        row.pills.push({
          x, len, ink,
          col: r.int(0, 3), alt: r.int(0, 3),
          radius: P.shape === 'Pill' ? 1 : P.shape === 'Square' ? 0 : (r() < 0.6 ? 1 : 0.15),
        });
        x += len + r.range(0.08, 0.5);
      }
      row.total = x;
      rows.push(row);
    }

    // Spread the text lines across the rows.
    const lineKeys = LINE_KEYS;
    lineKeys.forEach((k, n) => {
      const idx = Math.min(P.rows - 1, Math.floor(((n + 0.3) / lineKeys.length) * P.rows + r.range(-1, 1)));
      const row = rows[Math.max(0, idx)];
      row.text = k;
      row.empty = false;
      row.textX = r.range(0.02, 0.5);
      row.dots = Array.from({ length: 8 }, () => ({ show: r() < 0.5, col: r.int(0, 3) }));
    });

    const pal = () => ctx.palette;
    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, t) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const d = p.pixelDensity();
        const palette = pal();
        const A = accents(palette);
        const mouse = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        drawBloom(c, W, H, { palette, seed: ctx.state.seed, time: t, amount: ctx.state.bloom.amount, count: ctx.state.bloom.count, mouse });

        const rowH = H / P.rows;
        const ph = rowH * P.fill;
        const swellAt = (x, y) => {
          if (!mouse.inside || mPow === 0) return 0;
          const dx = (x / W - mouse.x) * (W / H), dy = y / H - mouse.y;
          return Math.exp(-(dx * dx + dy * dy) / 0.012) * mPow;
        };
        const pill = (x, y, len, hgt, radius, fill, glow) => {
          c.shadowColor = glow;
          c.shadowBlur = P.blur * d;
          c.shadowOffsetX = P.bleed * hgt * 0.35 * d;
          c.shadowOffsetY = 0;
          p.fill(fill);
          p.rect(x, y - hgt / 2, Math.max(len, hgt * 0.2), hgt, hgt / 2 * radius);
        };

        for (const row of rows) {
          if (row.empty) continue;
          const y = (row.i + 0.5) * rowH;
          const L = row.total * ph;
          const off = t * P.flow * row.speed * ph * 2;
          for (const pl of row.pills) {
            const len = pl.len * ph;
            const start = (((pl.x * ph + off) % L) + L) % L;
            for (let x = start - L; x < W; x += L) {
              if (x + len < -ph * 2) continue;
              const s = swellAt(x + len / 2, y);
              const hh = ph * (1 + s * 0.9);
              const ll = len * (1 + s * 1.2);
              const xx = x - (ll - len) / 2 + mouse.vx * W * s * 6;
              pill(xx, y, ll, hh, pl.radius, pl.ink ? palette.ink : A[pl.col], A[pl.alt]);
            }
          }
        }

        // Text, word by word, inside ink pills.
        if (P.textPills && ctx.state.text.show) {
          const T = ctx.state.text;
          for (const row of rows) {
            if (!row.text) continue;
            const str = (T.lines[row.text] || '').trim();
            if (!str) continue;
            const y = (row.i + 0.5) * rowH;
            const size = ph * 0.72 * T.size;
            const hh = Math.max(ph, size * 1.25);
            c.font = fontCss(T, size);
            const words = str.split(/\s+/);
            const gap = hh * 0.22;
            const widths = words.map((w) => c.measureText(w).width + hh * 0.7);
            const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1) * 2 + hh * 2;
            let x = Math.min(row.textX * W, W - total - W * 0.03);
            x = Math.max(W * 0.03, x);
            words.forEach((w, i) => {
              const s = swellAt(x + widths[i] / 2, y);
              pill(x, y, widths[i], hh * (1 + s * 0.3), 1, palette.ink, A[row.dots[i % 8].col]);
              c.shadowColor = 'transparent';
              p.fill(T.color === 'ink' ? palette.bg : palette[T.color]);
              c.font = fontCss(T, size);
              c.textAlign = 'center';
              c.textBaseline = 'middle';
              c.fillText(w, x + widths[i] / 2, y + size * 0.04);
              x += widths[i] + gap;
              if (i < words.length - 1 && row.dots[i].show) {
                pill(x, y, hh, hh, 1, A[row.dots[i].col], A[row.dots[(i + 1) % 8].col]);
                x += hh + gap;
              }
            });
          }
        }
        c.shadowColor = 'transparent';
        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return { resize: stage.resize, frame: stage.frame, dispose: stage.dispose };
  },
};
