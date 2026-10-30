// Ring Type: the title engraved with thick concentric ring strokes around a drifting centre,
// inside a halo of coloured dashes that orbit on the same rings (ref: concentric-stroke type).
// The letters are a low-res mask; every frame each ring is walked around and only the stretches
// inside a letter are stroked, so the engraving bends live as the centre moves.
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain } from '../../shared/bloom2d.js';
import { fontCss, bodyCss } from '../../shared/typeLayer.js';

const TAU = Math.PI * 2;
const MS = 0.5; // mask scale (mask px per CSS px)

const applyCase = (s, c) => (c === 'UPPERCASE' ? s.toUpperCase() : c === 'lowercase' ? s.toLowerCase() : s);

// Pick the largest setting of `str` in a box: 1..maxLines word-wrapped lines, or (if allowed)
// a single word chopped into equal letter chunks when that is much bigger.
function layoutTitle(c, T, str, boxW, boxH, maxLines) {
  str = str.trim() || ' ';
  c.font = fontCss(T, 100);
  const wOf = (s) => c.measureText(s).width || 1;
  const LH = 0.95;
  let best = null;
  const consider = (lines, penalty) => {
    const mw = Math.max(...lines.map(wOf));
    const size = Math.min((boxW / mw) * 100, boxH / (lines.length * LH));
    const score = size / penalty;
    if (!best || score > best.score) best = { lines, size, score, lh: LH };
  };
  const words = str.split(/\s+/);
  for (let L = 1; L <= Math.min(maxLines, words.length); L++) {
    // Greedy balanced wrap toward an even width per line.
    const target = wOf(words.join(' ')) / L;
    const lines = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const next = cur ? cur + ' ' + words[i] : words[i];
      const left = words.length - i;
      if (cur && wOf(next) > target * 1.08 && lines.length < L - 1 && left >= L - lines.length - 1) { lines.push(cur); cur = words[i]; }
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
  id: 'ringtype',
  name: 'Ring Type',
  engine: 'p5',
  ownsText: true,
  hint: 'The rings centre on you · click to fling the dashes',
  params: {
    spacing:  { value: 10, min: 6, max: 24, step: 0.5, label: 'Ring spacing' },
    weight:   { value: 0.62, min: 0.2, max: 0.95, step: 0.01, label: 'Stroke weight' },
    dashes:   { value: 8, min: 0, max: 20, step: 1, label: 'Dash count', rebuild: true },
    orbit:    { value: 1, min: 0, max: 4, step: 0.01, label: 'Orbit speed' },
    wobble:   { value: 0.35, min: 0, max: 1.5, step: 0.01, label: 'Wobble' },
    flow:     { value: 0.3, min: 0, max: 2, step: 0.01, label: 'Ripple flow' },
    textSize: { value: 1, min: 0.5, max: 1.4, step: 0.01, label: 'Text size' },
    halo:     { value: 1, min: 0.4, max: 1.6, step: 0.01, label: 'Halo size' },
    letters:  { value: 'Ink', options: ['Ink', 'Rings'], label: 'Letter colour' },
    details:  { value: true, label: 'Small text' },
  },
  controls: {
    essentials: ['spacing', 'weight', 'dashes', 'wobble'],
    groups: { Rings: ['flow', 'letters'], Orbit: ['orbit', 'halo'], Type: ['textSize', 'details'] },
  },

  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;

    // ---- Title mask (letters) and a dilated copy (keeps dashes off the letters) ----
    const mc = document.createElement('canvas');
    const mg = mc.getContext('2d', { willReadFrequently: true });
    let mw = 1, mh = 1;
    let mask = new Uint8Array(1), dil = new Uint8Array(1);
    let box = { x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0 };
    let dirty = true, builtW = 0, builtH = 0, builtSp = 0, builtSize = 0;
    let reveal = 0; // seconds since the type was (re)built, drives the draw-on

    function buildMask(W, H) {
      const T = ctx.state.text;
      mw = Math.max(1, Math.ceil(W * MS)); mh = Math.max(1, Math.ceil(H * MS));
      mc.width = mw; mc.height = mh;
      const str = applyCase(String(T.lines.title || ''), T.textCase);
      mg.setTransform(1, 0, 0, 1, 0, 0);
      const lay = layoutTitle(mg, T, str, W * 0.84 * P.textSize, H * 0.5 * P.textSize, 2);
      const cx = W / 2, cy = H * 0.46;
      const draw = (stroke) => {
        mg.setTransform(1, 0, 0, 1, 0, 0);
        mg.clearRect(0, 0, mw, mh);
        mg.setTransform(MS, 0, 0, MS, 0, 0);
        mg.font = fontCss(T, lay.size);
        mg.textAlign = 'center';
        mg.textBaseline = 'middle';
        mg.fillStyle = '#fff';
        mg.strokeStyle = '#fff';
        mg.lineJoin = 'round';
        mg.lineWidth = P.spacing * 1.3;
        lay.lines.forEach((ln, i) => {
          const y = cy + (i - (lay.lines.length - 1) / 2) * lay.lh * lay.size;
          if (stroke) mg.strokeText(ln, cx, y);
          mg.fillText(ln, cx, y);
        });
        const d = mg.getImageData(0, 0, mw, mh).data;
        const out = new Uint8Array(mw * mh);
        for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] > 110 ? 1 : 0;
        return out;
      };
      dil = draw(true);
      mask = draw(false);
      let x0 = mw, y0 = mh, x1 = -1, y1 = -1;
      for (let y = 0; y < mh; y++) {
        const row = y * mw;
        for (let x = 0; x < mw; x++) if (mask[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) { x0 = mw / 2; x1 = mw / 2; y0 = mh / 2; y1 = mh / 2; }
      box = { x0: x0 / MS, y0: y0 / MS, x1: (x1 + 1) / MS, y1: (y1 + 1) / MS };
      box.cx = (box.x0 + box.x1) / 2; box.cy = (box.y0 + box.y1) / 2;
      builtW = W; builtH = H; builtSp = P.spacing; builtSize = P.textSize;
      dirty = false;
      reveal = 0;
    }
    const inMask = (m, x, y) => {
      const mx = (x * MS) | 0, my = (y * MS) | 0;
      return mx >= 0 && my >= 0 && mx < mw && my < mh && m[my * mw + mx] === 1;
    };

    // ---- Orbiting dashes: ring slots, each with a few dashes, its own speed and a radial spring ----
    const RINGS = 64;
    const rings = Array.from({ length: RINGS }, (_, k) => {
      const dir = r() < 0.5 ? -1 : 1;
      const dashes = [];
      const empty = r() < 0.22;
      const n = empty ? 0 : Math.max(1, Math.round(P.dashes * r.range(0.4, 1.4)));
      for (let i = 0; i < n; i++) {
        dashes.push({ a: r.range(0, TAU), len: r.range(1.2, 6.5), col: r.int(0, 3), show: r.range(0.3, 1) });
      }
      return { k, dir, speed: r.range(0.04, 0.22) * dir, ph: r.range(0, TAU), off: 0, vel: 0, kick: r.range(0.5, 1.2), dashes };
    });
    let boost = 0;     // click: orbit speed burst, decays
    let flowPh = 0;    // ripple flow phase (in ring spacings)

    // Ring centre: eased toward a drifting target or the cursor.
    const centre = { x: 0, y: 0, init: false };
    let hoverAmt = 0;

    let alive = true;
    document.fonts?.ready.then(() => { if (alive) dirty = true; });

    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, t, dt) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const pal = ctx.palette;
        const mouse = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        const T = ctx.state.text;
        const step = Math.min(dt, 1 / 30);
        if (dirty || W !== builtW || H !== builtH || P.spacing !== builtSp || P.textSize !== builtSize) buildMask(W, H);
        reveal += step;

        // ---- Centre motion ----
        const hovering = mouse.inside && mPow > 0;
        hoverAmt += ((hovering ? Math.min(1, mPow) : 0) - hoverAmt) * (1 - Math.exp(-step * 3));
        const dx0 = Math.sin(t * 0.21) * W * 0.13 + Math.sin(t * 0.47 + 1.3) * W * 0.04;
        const dy0 = Math.cos(t * 0.16 + 0.4) * H * 0.07;
        let tx = box.cx + dx0, ty = box.cy + dy0;
        if (hovering) { tx = mouse.x * W; ty = mouse.y * H; }
        if (!centre.init) { centre.x = tx; centre.y = ty; centre.init = true; }
        const ease = 1 - Math.exp(-step * (hovering ? 2.2 + 2 * Math.min(1.5, mPow) : 0.8));
        centre.x += (tx - centre.x) * ease;
        centre.y += (ty - centre.y) * ease;
        const Cx = centre.x, Cy = centre.y;

        // ---- Click: fling the dashes outward and spin them up ----
        if (mouse.justPressed && mouse.inside) {
          boost = 1;
          for (const rg of rings) rg.vel += (260 + rg.k * 22) * rg.kick * (0.6 + 0.4 * Math.min(2, mPow + 0.5));
        }
        boost *= Math.exp(-step * 1.4);
        for (const rg of rings) {
          // Damped spring back to the ring's home radius.
          rg.vel += (-60 * rg.off - 5.5 * rg.vel) * step;
          rg.off += rg.vel * step;
          rg.ph += rg.speed * P.orbit * (1 + boost * 9) * step;
        }
        flowPh = (flowPh + P.flow * 0.35 * step) % 1;

        const sp = P.spacing;
        const lw = Math.max(1, sp * P.weight);
        const wobA = P.wobble * sp;
        // Wobble: a few slow lobes per ring, phase-shifted ring to ring, so the engraving breathes.
        const wob = (th, k) => wobA * (0.85 * Math.sin(3 * th + t * 0.55 + k * 0.23) + 0.5 * Math.sin(5 * th - t * 0.8 + k * 0.11));
        // Draw-on reveal: rings appear outward from the centre after a (re)build.
        const rv = Math.min(1, reveal / 1.8);
        const revealR = (1 - Math.pow(1 - rv, 3)) * Math.hypot(W, H) * 1.05 + 1;

        // ---- Background ----
        c.save();
        c.fillStyle = pal.bg;
        c.fillRect(0, 0, W, H);
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.lineWidth = lw;

        // ---- Letters: ring stretches inside the mask ----
        const ringsCol = P.letters === 'Rings';
        const paths = ringsCol ? [new Path2D(), new Path2D(), new Path2D(), new Path2D()] : [new Path2D()];
        const ddx = [box.x0 - Cx, box.x1 - Cx], ddy = [box.y0 - Cy, box.y1 - Cy];
        const inside = ddx[0] <= 0 && ddx[1] >= 0 && ddy[0] <= 0 && ddy[1] >= 0;
        const nearX = Math.max(box.x0 - Cx, 0, Cx - box.x1), nearY = Math.max(box.y0 - Cy, 0, Cy - box.y1);
        const rMin = Math.max(0, Math.hypot(nearX, nearY) - wobA * 1.5 - sp);
        let rMax = 0;
        for (const ax of ddx) for (const ay of ddy) rMax = Math.max(rMax, Math.hypot(ax, ay));
        rMax = Math.min(rMax + wobA * 1.5 + sp, revealR);
        // Angular window covering the text box (whole circle when the centre is inside it).
        let aLo = 0, aHi = TAU;
        if (!inside) {
          const ac = Math.atan2(box.cy - Cy, box.cx - Cx);
          let lo = 0, hi = 0;
          for (const ax of ddx) for (const ay of ddy) {
            let d = Math.atan2(ay, ax) - ac;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            lo = Math.min(lo, d); hi = Math.max(hi, d);
          }
          aLo = ac + lo - 0.25; aHi = ac + hi + 0.25;
        }
        const kFrom = Math.max(0, Math.floor(rMin / sp - flowPh));
        const kTo = Math.ceil(rMax / sp - flowPh);
        const STEP = 2.2; // px between samples along a ring
        for (let k = kFrom; k <= kTo; k++) {
          const R = (k + flowPh) * sp;
          if (R < sp * 0.6) continue;
          const path = paths[ringsCol ? ((k % 4) + 4) % 4 : 0];
          const n = Math.max(8, Math.ceil(((aHi - aLo) * R) / STEP));
          const da = (aHi - aLo) / n;
          let on = false;
          for (let i = 0; i <= n; i++) {
            const th = aLo + i * da;
            const rr = R + wob(th, k);
            const x = Cx + Math.cos(th) * rr, y = Cy + Math.sin(th) * rr;
            const hit = rr < revealR && inMask(mask, x, y);
            if (hit) {
              if (!on) { path.moveTo(x, y); path.lineTo(x + 0.01, y); on = true; }
              else path.lineTo(x, y);
            } else on = false;
          }
        }

        // ---- Dashes: arcs on outer rings, broken wherever they would touch a letter ----
        const haloR = Math.max(box.x1 - box.x0, (box.y1 - box.y0) * 1.4) * 0.62 * P.halo + sp * 4;
        const dashPaths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
        const kMaxD = Math.min(RINGS - 1, Math.ceil(haloR / sp));
        if (P.dashes > 0) {
          for (let k = 3; k <= kMaxD; k++) {
            const rg = rings[k];
            const R0 = k * sp;
            // Thin out the inner rings so the halo gathers toward its rim.
            const frac = R0 / haloR;
            const keep = 0.25 + 0.75 * Math.min(1, frac * 1.15);
            const R = R0 + rg.off * (0.4 + frac);
            if (R > revealR) continue;
            for (let j = 0; j < rg.dashes.length; j++) {
              const ds = rg.dashes[j];
              if (ds.show > keep + 0.1) continue;
              const len = ds.len * sp * (1 + boost * 0.8); // px along the ring
              const a0 = ds.a + rg.ph;
              const span = len / R;
              const n = Math.max(2, Math.ceil(len / 4));
              const path = dashPaths[ds.col];
              let on = false;
              for (let i = 0; i <= n; i++) {
                const th = a0 + (i / n) * span;
                const rr = R + wob(th, k);
                const x = Cx + Math.cos(th) * rr, y = Cy + Math.sin(th) * rr;
                if (!inMask(dil, x, y)) {
                  if (!on) { path.moveTo(x, y); path.lineTo(x + 0.01, y); on = true; }
                  else path.lineTo(x, y);
                } else on = false;
              }
            }
          }
          const cols = [pal.c1, pal.c2, pal.c3, pal.c4];
          for (let i = 0; i < 4; i++) { c.strokeStyle = cols[i]; c.stroke(dashPaths[i]); }
        }

        if (ringsCol) {
          const cols = [pal.ink, pal.c1, pal.ink, pal.c2];
          for (let i = 0; i < 4; i++) { c.strokeStyle = cols[i]; c.stroke(paths[i]); }
        } else {
          c.strokeStyle = pal.ink;
          c.stroke(paths[0]);
        }

        // Tiny marker at the ring centre while hovering.
        if (hoverAmt > 0.02) {
          c.globalAlpha = hoverAmt;
          c.fillStyle = pal.ink;
          c.beginPath();
          c.arc(Cx, Cy, Math.max(2, lw * 0.35), 0, TAU);
          c.fill();
          c.globalAlpha = 1;
        }

        // ---- Small text in the corners ----
        if (P.details && T.show) {
          const L = T.lines;
          const fs = Math.max(9, Math.min(W, H) * 0.024);
          const m = Math.min(W, H) * 0.06;
          c.font = bodyCss(T, fs);
          c.fillStyle = pal.ink;
          c.textBaseline = 'alphabetic';
          const put = (s, x, y, align) => { s = applyCase(String(s || ''), T.textCase); if (s) { c.textAlign = align; c.fillText(s, x, y); } };
          put(L.subtitle, m, m + fs, 'left');
          put(L.date, W - m, m + fs, 'right');
          put(L.venue, m, H - m, 'left');
          put(L.footer, W - m, H - m, 'right');
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
