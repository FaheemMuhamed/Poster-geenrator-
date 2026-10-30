// Bar Type: the title (or date) rebuilt from rows of vertical bars like a glitchy barcode:
// thin hairlines, wide blocks and half-height fragments in the palette, flickering and
// slipping sideways on a dark ground (ref: '2024' made of coloured bars).
// The text is drawn once into a low-res mask; each row of bars is generated only where the
// mask is inked, then animated cheaply per frame (batched rects, one fill per colour).
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain } from '../../shared/bloom2d.js';
import { fontCss, bodyCss } from '../../shared/typeLayer.js';

const MS = 0.5; // mask px per CSS px

const applyCase = (s, c) => (c === 'UPPERCASE' ? s.toUpperCase() : c === 'lowercase' ? s.toLowerCase() : s);

// Integer hash -> 0..1 (cheap, deterministic, for per-frame flicker decisions).
function hash2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Largest setting of `str` in a box: word wraps over 1..maxLines lines, or the string chopped
// into equal chunks when that is clearly bigger (how '2024' becomes '20 / 24').
function layoutTitle(c, T, str, boxW, boxH, maxLines) {
  str = str.trim() || ' ';
  c.font = fontCss(T, 100);
  const wOf = (s) => c.measureText(s).width || 1;
  const LH = 0.92;
  let best = null;
  const consider = (lines, penalty) => {
    const mw = Math.max(...lines.map(wOf));
    const size = Math.min((boxW / mw) * 100, boxH / (lines.length * LH));
    const score = size / penalty;
    if (!best || score > best.score) best = { lines, size, score, lh: LH };
  };
  const words = str.split(/\s+/);
  for (let L = 1; L <= Math.min(maxLines, words.length); L++) {
    const target = wOf(words.join(' ')) / L;
    const lines = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const next = cur ? cur + ' ' + words[i] : words[i];
      if (cur && wOf(next) > target * 1.08 && lines.length < L - 1) { lines.push(cur); cur = words[i]; }
      else cur = next;
    }
    lines.push(cur);
    consider(lines, 1);
  }
  // Chop into equal chunks only for numbers and symbols ('2024' → '20 / 24'), never real words.
  const flat = str.replace(/\s+/g, '');
  const chop = !/\p{L}/u.test(flat);
  for (let L = 2; chop && L <= maxLines; L++) {
    if (flat.length < L * 2) break;
    const n = Math.ceil(flat.length / L);
    const lines = [];
    for (let i = 0; i < flat.length; i += n) lines.push(flat.slice(i, i + n));
    consider(lines, 1.5);
  }
  return best;
}

export default {
  id: 'bartype',
  name: 'Bar Type',
  engine: 'p5',
  ownsText: true,
  hint: 'Hover to scramble the bars · click to slice the type',
  params: {
    density:   { value: 1, min: 0.4, max: 2, step: 0.01, label: 'Bar density' },
    variety:   { value: 0.6, min: 0, max: 1, step: 0.01, label: 'Bar width variety' },
    rows:      { value: 10, min: 5, max: 24, step: 1, label: 'Rows per letter' },
    bold:      { value: 0.06, min: 0, max: 0.14, step: 0.005, label: 'Letter weight' },
    stretch:   { value: 1.35, min: 1, max: 2.2, step: 0.01, label: 'Vertical stretch' },
    jitter:    { value: 0.4, min: 0, max: 1.5, step: 0.01, label: 'Jitter' },
    flicker:   { value: 0.35, min: 0, max: 1, step: 0.01, label: 'Flicker' },
    fragments: { value: 0.45, min: 0, max: 1, step: 0.01, label: 'Fragments' },
    textSize:  { value: 1, min: 0.5, max: 1.3, step: 0.01, label: 'Text size' },
    source:    { value: 'Title', options: ['Title', 'Date', 'Both'], label: 'Source line' },
    dark:      { value: true, label: 'Dark ground' },
    details:   { value: true, label: 'Small text' },
  },
  controls: {
    essentials: ['density', 'variety', 'jitter', 'source'],
    groups: { Bars: ['rows', 'fragments', 'flicker'], Type: ['textSize', 'bold', 'stretch', 'dark', 'details'] },
  },

  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;

    const mc = document.createElement('canvas');
    const mg = mc.getContext('2d', { willReadFrequently: true });
    let rows = [];      // { y, h, bars: [...], slice }
    let slices = [];    // { off, vel, dir, mag }
    let built = '';     // signature of what the bars were built from
    let dirty = true;
    let revealT = 0;
    let unitPx = 2;
    let burst = 0;      // click glitch, 1 → 0
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) dirty = true; });

    // ---- Build: text → mask → rows of bars ----
    function build(W, H) {
      const T = ctx.state.text;
      const mw = Math.max(1, Math.ceil(W * MS)), mh = Math.max(1, Math.ceil(H * MS));
      mc.width = mw; mc.height = mh;
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.clearRect(0, 0, mw, mh);
      const title = applyCase(String(T.lines.title || ''), T.textCase);
      const date = String(T.lines.date || '').replace(/[./\-–]+/g, ' ');
      const src = P.source;
      const s = P.textSize;
      const blocks = [];
      if (src === 'Both') {
        blocks.push({ str: title, x: W / 2, y: H * 0.33, bw: W * 0.86 * s, bh: H * 0.34 * s, max: 2 });
        blocks.push({ str: date, x: W / 2, y: H * 0.68, bw: W * 0.7 * s, bh: H * 0.24 * s, max: 2 });
      } else if (src === 'Date') {
        blocks.push({ str: date, x: W / 2, y: H * 0.47, bw: W * 0.82 * s, bh: H * 0.62 * s, max: 3 });
      } else {
        blocks.push({ str: title, x: W / 2, y: H * 0.47, bw: W * 0.82 * s, bh: H * 0.58 * s, max: 2 });
      }

      const newRows = [];
      for (const b of blocks) {
        const st = P.stretch; // letters drawn taller than wide: bars read like a barcode
        const lay = layoutTitle(mg, T, b.str, b.bw, b.bh / st, b.max);
        mg.setTransform(1, 0, 0, 1, 0, 0);
        mg.clearRect(0, 0, mw, mh);
        mg.setTransform(MS, 0, 0, MS * st, 0, 0);
        mg.font = fontCss(T, lay.size);
        mg.textAlign = 'center';
        mg.textBaseline = 'middle';
        mg.fillStyle = '#fff';
        mg.strokeStyle = '#fff';
        mg.lineJoin = 'round';
        mg.lineWidth = lay.size * P.bold;
        const lineYs = lay.lines.map((_, i) => b.y + (i - (lay.lines.length - 1) / 2) * lay.lh * lay.size * st);
        lay.lines.forEach((ln, i) => { if (P.bold > 0) mg.strokeText(ln, b.x, lineYs[i] / st); mg.fillText(ln, b.x, lineYs[i] / st); });
        const d = mg.getImageData(0, 0, mw, mh).data;
        const on = (mx, my) => mx >= 0 && my >= 0 && mx < mw && my < mh && d[(my * mw + mx) * 4 + 3] > 110;

        // Row height from the cap height (~0.7 em) divided into the requested rows.
        const bh = Math.max(3, (lay.size * 0.7 * st) / P.rows);
        const u = Math.max(1, (lay.size * 0.7) / P.rows / 4.5); // bar unit width
        unitPx = u;
        for (const ly of lineYs) {
          // Scan the line's band for inked rows.
          const top = ly - lay.size * 0.62 * st, bot = ly + lay.size * 0.62 * st;
          let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
          for (let my = Math.max(0, Math.floor(top * MS)); my < Math.min(mh, Math.ceil(bot * MS)); my++) {
            for (let mx = 0; mx < mw; mx++) if (d[(my * mw + mx) * 4 + 3] > 110) {
              if (my < y0) y0 = my; if (my > y1) y1 = my; if (mx < x0) x0 = mx; if (mx > x1) x1 = mx;
            }
          }
          if (y1 < y0) continue;
          const yA = y0 / MS, yB = (y1 + 1) / MS;
          const nRows = Math.max(1, Math.round((yB - yA) / bh));
          const rh = (yB - yA) / nRows;
          for (let j = 0; j < nRows; j++) {
            const ry = yA + j * rh;
            // Coverage per mask column: 3 samples down the row, inked if 2 of 3 hit.
            const sy = [0.22, 0.5, 0.78].map((f) => Math.floor((ry + rh * f) * MS));
            const inside = (xCss) => {
              const mx = Math.floor(xCss * MS);
              return (on(mx, sy[0]) ? 1 : 0) + (on(mx, sy[1]) ? 1 : 0) + (on(mx, sy[2]) ? 1 : 0) >= 2;
            };
            const cover = (xa, w) => {
              let n = 0, k = 0;
              for (let x = xa; x < xa + w; x += 1 / MS) { k++; if (inside(x)) n++; }
              return k ? n / k : 0;
            };
            const bars = [];
            let x = x0 / MS;
            const xEnd = (x1 + 1) / MS;
            while (x < xEnd) {
              if (!inside(x)) { x += 1 / MS; continue; }
              const wide = r() < P.variety * 0.32;
              let w = wide ? u * r.range(4, 15) : u * r.range(0.6, 2.4) * (0.6 + P.variety * 0.6);
              if (wide && cover(x, w) < 0.8) w = u * r.range(0.6, 2.2);
              if (cover(x, w) < 0.5) { x += 1 / MS; continue; }
              // Colour: the light tone is the most common, then the four accents.
              const cr = r();
              const col = cr < (wide ? 0.5 : 0.34) ? 0 : 1 + r.int(0, 3);
              let f0 = 0, f1 = 1;
              if (r() < P.fragments * 0.3) {
                const kind = r();
                if (kind < 0.4) { f0 = 0; f1 = 0.5; } else if (kind < 0.8) { f0 = 0.5; f1 = 1; } else { f0 = r.range(0.2, 0.6); f1 = f0 + 0.22; }
              }
              bars.push({ x, w, col, alt: 1 + r.int(0, 3), f0, f1, ph: r(), id: r.int(0, 1e6), str: r.range(0.4, 1) });
              x += w;
              // Gaps shrink with density.
              if (r() < 0.75) x += (u * r.range(0.25, 1.6)) / P.density;
            }
            newRows.push({ y: ry, h: rh, bars, seed: r.int(0, 1e6), slice: 0, delay: 0, x0: x0 / MS, x1: xEnd });
          }
        }
      }
      // Group rows into horizontal slices (1–4 rows each) for the click glitch.
      slices = [];
      let i = 0;
      while (i < newRows.length) {
        const n = r.int(1, 4);
        const sIdx = slices.length;
        slices.push({ off: 0, vel: 0, dir: r() < 0.5 ? -1 : 1, mag: r.range(0.3, 1), vy: r.range(-1, 1) });
        for (let k = 0; k < n && i < newRows.length; k++, i++) newRows[i].slice = sIdx;
      }
      newRows.forEach((row, j) => { row.delay = j * 0.03 + r.range(0, 0.25); });
      rows = newRows;
      revealT = 0;
      dirty = false;
    }
    const signature = (W, H) => [W, H, P.density, P.variety, P.rows, P.fragments, P.textSize, P.source, P.bold, P.stretch].join('|');

    const paths = [];
    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, t, dt) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const d = p.pixelDensity();
        const pal = ctx.palette;
        const mouse = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        const T = ctx.state.text;
        const step = Math.min(dt, 1 / 30);
        const sig = signature(W, H);
        if (dirty || sig !== built) { build(W, H); built = sig; }
        revealT += step;

        const ground = P.dark ? pal.ink : pal.bg;
        const light = P.dark ? pal.bg : pal.ink;
        const cols = [light, pal.c1, pal.c2, pal.c3, pal.c4];
        const u = unitPx;

        // ---- Click: slice the type, then let each slice spring home ----
        if (mouse.justPressed && mouse.inside) {
          burst = 1;
          for (const s of slices) s.vel += s.dir * s.mag * W * (2.2 + Math.random() * 2) * (0.5 + 0.5 * Math.min(2, mPow + 0.3));
        }
        burst *= Math.exp(-step * 1.8);
        for (const s of slices) {
          s.vel += (-110 * s.off - 11 * s.vel) * step;
          s.off += s.vel * step;
        }

        // Hover field.
        const hov = mouse.inside && mPow > 0;
        const mx = mouse.x * W, my = mouse.y * H;
        const R = Math.min(W, H) * 0.16;
        const R2 = R * R;
        const q = Math.floor(t * 14); // quantised time for glitch decisions

        for (let i = 0; i < 5; i++) paths[i] = new Path2D();
        const fl = P.flicker;
        const jit = P.jitter;
        const snap = (v) => Math.round(v * d) / d;

        for (let j = 0; j < rows.length; j++) {
          const row = rows[j];
          // Reveal: each row wipes in from the left after its delay.
          const rp = Math.min(1, Math.max(0, (revealT - row.delay) / 0.45));
          if (rp <= 0) continue;
          const ease = 1 - Math.pow(1 - rp, 3);
          const xLim = row.x0 + (row.x1 - row.x0) * ease;
          // Row slip: an occasional sideways jump of a few units.
          let shift = 0;
          const hj = hash2(q >> 1, row.seed);
          if (hj < 0.12 * jit + burst * 0.4) shift = (hash2(q, row.seed + 7) - 0.5) * u * 10 * (jit + burst);
          const sl = slices[row.slice];
          shift += sl.off;
          const vy = sl.vy * burst * row.h * 0.8;
          const dyRow = row.y + row.h * 0.5 - my;
          const rowNear = hov && Math.abs(dyRow) < R * 1.6;

          for (let b = 0; b < row.bars.length; b++) {
            const bar = row.bars[b];
            if (bar.x > xLim) break;
            // Flicker: some bars drop out or swap colour for a few frames.
            const h = hash2(q + ((bar.ph * 9) | 0), bar.id);
            if (h < fl * 0.07 + burst * 0.15) continue;
            let col = h < fl * 0.2 + burst * 0.3 ? bar.alt : bar.col;
            let x = bar.x + shift;
            let y0 = row.y + row.h * bar.f0 + vy, y1 = row.y + row.h * bar.f1 + vy;
            let w = bar.w;
            if (rowNear) {
              const dx = x + w * 0.5 - mx;
              const g2 = (dx * dx + dyRow * dyRow) / R2;
              if (g2 < 2.6) {
                const g = Math.exp(-g2 * 1.6) * Math.min(2, mPow);
                // Stretch vertically (each bar its own amount), scramble sideways, cycle colours.
                const s = g * row.h * (0.5 + bar.str * 3.2);
                y0 -= s * (0.4 + bar.ph * 0.6);
                y1 += s * (1 - bar.ph * 0.6);
                x += (hash2(q, bar.id) - 0.5) * u * 5 * g;
                if (g > 0.25) col = (col + 1 + ((t * 8 + bar.ph * 5) | 0)) % 5;
              }
            }
            // Pixel jitter on top.
            if (jit > 0 && hash2(q + 3, bar.id) < 0.05 * jit) x += (hash2(q + 5, bar.id) < 0.5 ? -1 : 1) * u;
            const sx = snap(x), ex = snap(x + w);
            paths[col].rect(sx, snap(y0), Math.max(1 / d, ex - sx), snap(y1) - snap(y0));
          }
        }

        c.save();
        c.fillStyle = ground;
        c.fillRect(0, 0, W, H);
        for (let i = 0; i < 5; i++) { c.fillStyle = cols[i]; c.fill(paths[i]); }

        // Burst afterimage: thin horizontal scan fragments in the accents.
        if (burst > 0.05) {
          c.globalAlpha = Math.min(1, burst * 1.4);
          for (let k = 0; k < 14; k++) {
            const hy = hash2(q, k * 31 + 1), hx = hash2(q + 1, k * 17 + 3), hw = hash2(q + 2, k * 13 + 5);
            c.fillStyle = cols[1 + (k % 4)];
            c.fillRect(hx * W * 0.9, hy * H, W * (0.05 + hw * 0.3) * burst, Math.max(1, u * 0.6));
          }
          c.globalAlpha = 1;
        }

        // ---- Small text: the other lines in the light tone ----
        if (P.details && T.show) {
          const L = T.lines;
          const fs = Math.max(9, Math.min(W, H) * 0.024);
          const m = Math.min(W, H) * 0.06;
          c.font = bodyCss(T, fs);
          c.fillStyle = light;
          c.textBaseline = 'alphabetic';
          const put = (s, x, y, align) => { s = applyCase(String(s || ''), T.textCase); if (s) { c.textAlign = align; c.fillText(s, x, y); } };
          put(L.subtitle, m, m + fs, 'left');
          put(P.source === 'Title' ? L.date : L.title, W - m, m + fs, 'right');
          put(L.venue, m, H - m, 'left');
          put(L.footer, W - m, H - m, 'right');
          // A thin barcode rule above the footer, a nod to the letters.
          const ry = H - m - fs * 1.9;
          let x = m;
          let k = 0;
          while (x < W - m) {
            const w = Math.max(1, u * (hash2(k, 99) < 0.2 ? 3 : 0.7));
            c.fillStyle = cols[hash2(k, 7) < 0.6 ? 0 : 1 + (k % 4)];
            c.fillRect(snap(x), ry, w, fs * 0.5);
            x += w + u * (0.6 + hash2(k, 3) * 1.6);
            k++;
          }
        }
        c.restore();

        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return {
      resize(w, h, dpr) { stage.resize(w, h, dpr); dirty = true; },
      frame: stage.frame,
      onParam(key) { if (key === 'text') dirty = true; },
      dispose() { alive = false; stage.dispose(); mc.width = mc.height = 0; },
    };
  },
};
