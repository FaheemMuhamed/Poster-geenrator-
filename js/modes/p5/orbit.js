// Orbit Glyphs: a sequence of numbers set along a curling spline, a few circled in ink,
// with fine outlined geometry scattered and drifting around it over the bloom (ref 5).
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawBloom, drawGrain, hexA } from '../../shared/bloom2d.js';
import { fontCss } from '../../shared/typeLayer.js';

const SHAPES = ['rect', 'bar', 'stripes', 'wave', 'cross', 'cluster', 'solid', 'dot', 'square', 'ring'];

export default {
  id: 'orbit',
  name: 'Orbit Glyphs',
  engine: 'p5',
  ownsText: false,
  hint: 'The curve bends toward you · click to re-scatter the shapes',
  controls: {
    essentials: ['amplitude', 'turns', 'shapes', 'drift'],
    form: ['sparkles', 'weight'],
    motion: [],
    interaction: [],
    colour: [],
    type: ['sequence', 'textSize', 'highlights'],
  },
  presets: {
    'Calm': { drift: 0.3, amplitude: 0.2, sparkles: 1 },
    'Tight curl': { turns: 1.6, amplitude: 0.8, textSize: 0.8 },
    'Busy': { drift: 2.5, amplitude: 1.2, sparkles: 10, weight: 1.6 },
  },
  interactions: { hover: 'bends the curve toward the cursor and enlarges nearby glyphs', click: 're-scatters the shapes' },
  params: {
    sequence:   { value: 'August 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31', label: 'Curve text', noShuffle: true },
    amplitude:  { value: 0.5, min: 0, max: 1.5, step: 0.01, label: 'Wobble amount' },
    turns:      { value: 0.8, min: 0.1, max: 1.8, step: 0.01, label: 'Curve turns' },
    textSize:   { value: 1, min: 0.5, max: 2, step: 0.01, label: 'Text size', unit: '×' },
    highlights: { value: 8, min: 0, max: 20, step: 1, label: 'Circled numbers', rebuild: true },
    shapes:     { value: 34, min: 0, max: 70, step: 1, label: 'Shape count', rebuild: true },
    sparkles:   { value: 3, min: 0, max: 12, step: 1, label: 'Sparkle count' },
    weight:     { value: 1, min: 0.4, max: 3, step: 0.05, label: 'Line thickness', unit: '×' },
    drift:      { value: 1, min: 0, max: 4, step: 0.01, label: 'Speed' },
  },

  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;

    // ---- Base curve: a clothoid (straight start that curls tighter and tighter), fit to a box ----
    const NCP = 9;
    function basePoints(turns, count = NCP) {
      const pts = [];
      let x = 0, y = 0, a = 0;
      const N = 120;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        pts.push([x, y]);
        a = -turns * Math.PI * 2 * t * t * 0.9;
        x += Math.cos(a) / N; y += Math.sin(a) / N;
      }
      // Fit into the poster with generous margins (x 0.12–0.86, y 0.22–0.62).
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [px, py] of pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
      const s = Math.min(0.74 / (x1 - x0 || 1), 0.42 / (y1 - y0 || 1));
      const ox = 0.12 + (0.74 - (x1 - x0) * s) * 0.5 - x0 * s;
      const oy = 0.62 - (y1 - y0) * s * 0.5 - (y1 + y0) * 0.5 * s;
      return Array.from({ length: count }, (_, i) => {
        const [px, py] = pts[Math.round((i / (count - 1)) * N)];
        return [ox + px * s, oy + py * s];
      });
    }
    const cps = Array.from({ length: NCP }, (_, i) => ({ x: 0.5, y: 0.5, ph: r.range(0, 100), init: false }));

    // Highlighted tokens (indices into the numeric tokens).
    const hiSeed = Array.from({ length: 64 }, () => r());

    // ---- Shapes ----
    function scatter(shapeList, rand) {
      const n = P.shapes;
      for (let i = 0; i < n; i++) {
        let x, y, tries = 0;
        do { x = rand.range(0.06, 0.94); y = rand.range(0.1, 0.88); tries++; }
        // Keep clear of the curve and of the title corner.
        while (tries < 16 && (nearCurve(x, y, 0.08) || (x < 0.6 && y < 0.14)));
        const type = rand() < 0.12 ? 'solid' : rand.pick(SHAPES);
        const old = shapeList[i];
        shapeList[i] = {
          type,
          tx: x, ty: y, x: old ? old.x : x, y: old ? old.y : y,
          s: rand.range(0.5, 1.4) * (type === 'bar' ? 1.8 : 1),
          rot: type === 'bar' ? rand.range(-1.2, -0.5) : type === 'solid' || type === 'wave' ? 0 : rand() < 0.7 ? 0 : rand.range(-0.4, 0.4),
          aspect: rand.range(0.4, 2.2),
          ph: rand.range(0, 100), sp: rand.range(0.4, 1.2),
          spin: rand() < 0.3 ? rand.range(-0.08, 0.08) : 0,
        };
      }
      shapeList.length = n;
    }
    let curvePts = basePoints(P.turns);
    let densePts = basePoints(P.turns, 40);
    const nearCurve = (x, y, dmin) => densePts.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < dmin);
    const shapes = [];
    scatter(shapes, r);
    const sparkles = Array.from({ length: 12 }, () => ({ x: r.range(0.08, 0.92), y: r.range(0.16, 0.86), s: r.range(0.6, 1.4), ph: r.range(0, 100) }));

    // Catmull-Rom through the live control points, sampled densely with arc length.
    function spline(pts, W, H, per = 24) {
      const out = [];
      const P2 = [pts[0], ...pts, pts[pts.length - 1]];
      for (let i = 1; i < P2.length - 2; i++) {
        const [p0, p1, p2, p3] = [P2[i - 1], P2[i], P2[i + 1], P2[i + 2]];
        for (let k = 0; k < per; k++) {
          const t = k / per, t2 = t * t, t3 = t2 * t;
          const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
          out.push({ x: f(p0.x, p1.x, p2.x, p3.x) * W, y: f(p0.y, p1.y, p2.y, p3.y) * H });
        }
      }
      const last = pts[pts.length - 1];
      out.push({ x: last.x * W, y: last.y * H });
      let L = 0;
      out.forEach((p, i) => { if (i) L += Math.hypot(p.x - out[i - 1].x, p.y - out[i - 1].y); p.l = L; });
      return out;
    }
    function at(samples, l) {
      let lo = 0, hi = samples.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].l < l) lo = m; else hi = m; }
      const a = samples[lo], b = samples[hi];
      const t = (l - a.l) / (b.l - a.l || 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x) };
    }

    let lastTurns = P.turns;
    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, t, dt) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const pal = ctx.palette;
        const mouse = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        const T = ctx.state.text;
        const dr = t * P.drift;
        drawBloom(c, W, H, { palette: pal, seed: ctx.state.seed, time: t, amount: ctx.state.bloom.amount, count: ctx.state.bloom.count, mouse });

        if (P.turns !== lastTurns) { lastTurns = P.turns; curvePts = basePoints(P.turns); densePts = basePoints(P.turns, 40); }
        if (mouse.justPressed && mouse.inside) scatter(shapes, mkRand());

        // ---- Update control points: base + wobble + pull toward the cursor ----
        const ease = 1 - Math.pow(0.02, Math.max(dt, 0.016));
        cps.forEach((cp, i) => {
          const [bx, by] = curvePts[i];
          const amp = P.amplitude * 0.05 * (0.3 + i / NCP);
          let x = bx + Math.sin(dr * 0.35 + cp.ph) * amp;
          let y = by + Math.cos(dr * 0.28 + cp.ph * 1.3) * amp;
          if (mouse.inside && mPow > 0) {
            const dx = mouse.x - x, dy = mouse.y - y;
            const w = Math.exp(-(dx * dx * (W / H) ** 2 + dy * dy) / 0.045) * 0.28 * Math.min(1.5, mPow);
            x += dx * w; y += dy * w;
          }
          if (!cp.init) { cp.x = x; cp.y = y; cp.init = true; }
          cp.x += (x - cp.x) * ease; cp.y += (y - cp.y) * ease;
        });

        // ---- Shapes (drawn first, under the type) ----
        const lw = P.weight;
        const u = Math.min(W, H) * 0.04; // base shape unit
        c.save();
        c.strokeStyle = pal.ink;
        c.fillStyle = pal.ink;
        c.lineWidth = lw;
        const sEase = 1 - Math.pow(0.05, Math.max(dt, 0.016));
        for (const s of shapes) {
          s.x += (s.tx - s.x) * sEase; s.y += (s.ty - s.y) * sEase;
          const x = (s.x + Math.sin(dr * 0.11 * s.sp + s.ph) * 0.012) * W;
          const y = (s.y + Math.cos(dr * 0.09 * s.sp + s.ph) * 0.012) * H;
          c.save();
          c.translate(x, y);
          c.rotate(s.rot + Math.sin(dr * 0.1 + s.ph) * 0.05 + dr * s.spin);
          drawShape(c, s, u * s.s, lw, dr);
          c.restore();
        }
        // Sparkles: 4-point stars that twinkle.
        for (let i = 0; i < P.sparkles; i++) {
          const sp = sparkles[i];
          const k = 0.75 + 0.25 * Math.sin(t * 1.6 + sp.ph);
          star(c, (sp.x + Math.sin(dr * 0.05 + sp.ph) * 0.01) * W, (sp.y + Math.cos(dr * 0.04 + sp.ph) * 0.01) * H, u * 0.55 * sp.s * k);
        }
        c.restore();

        // ---- Glyphs along the spline ----
        const samples = spline(cps, W, H);
        const total = samples[samples.length - 1].l;
        const tokens = (P.sequence || '').trim().split(/\s+/).filter(Boolean);
        if (tokens.length) {
          let size = W * 0.027 * P.textSize;
          c.font = fontCss(T, size, 500);
          // Numbers to circle (a seeded random subset of the numeric tokens).
          const numIdx = tokens.map((tk, i) => (/^\d+$/.test(tk) ? i : -1)).filter((i) => i >= 0);
          const hi = new Set(numIdx.map((i, n) => [hiSeed[n % 64], i]).sort((a, b) => a[0] - b[0]).slice(0, P.highlights).map((e) => e[1]));
          let widths = tokens.map((tk) => c.measureText(tk).width);
          // Each token occupies a "slot"; circled ones get room for their disc.
          const slotsFor = (sz, ws) => ws.map((w, i) => (hi.has(i) ? Math.max(w + sz * 0.44, sz * 1.44) + sz * 0.12 : w));
          let slots = slotsFor(size, widths);
          const sumOf = (a) => a.reduce((x, y) => x + y, 0);
          let gap = (total - sumOf(slots)) / Math.max(1, tokens.length - 1);
          if (gap < size * 0.3) { // too long for the curve: shrink to fit
            const f = total / (sumOf(slots) + size * 0.3 * (tokens.length - 1));
            size *= f; widths = widths.map((w) => w * f); slots = slotsFor(size, widths);
            c.font = fontCss(T, size, 500);
            gap = (total - sumOf(slots)) / Math.max(1, tokens.length - 1);
          }
          gap = Math.min(gap, size * 1.4);
          let l = Math.max(0, (total - (sumOf(slots) + gap * (tokens.length - 1))) * 0.1);
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          tokens.forEach((tk, i) => {
            const pt = at(samples, l + slots[i] / 2);
            let sc = 1;
            if (mouse.inside && mPow > 0) {
              const dx = pt.x - mouse.x * W, dy = pt.y - mouse.y * H;
              sc += Math.exp(-(dx * dx + dy * dy) / (W * W * 0.006)) * 0.45 * Math.min(2, mPow);
            }
            c.save();
            c.translate(pt.x, pt.y);
            c.rotate(pt.ang);
            c.scale(sc, sc);
            if (hi.has(i)) {
              c.fillStyle = pal.ink;
              c.beginPath();
              c.arc(0, 0, Math.max(widths[i] * 0.5 + size * 0.22, size * 0.72), 0, Math.PI * 2);
              c.fill();
              c.fillStyle = pal.bg;
              c.font = fontCss(T, size, 700);
            } else {
              c.fillStyle = pal.ink;
              c.font = fontCss(T, size, 500);
            }
            c.fillText(tk, 0, size * 0.04);
            c.restore();
            l += slots[i] + gap;
          });
        }
        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    // Fresh (unseeded) random for click re-scatter, with the same helpers as ctx.rand.
    function mkRand() {
      const f = Math.random;
      const g = () => f();
      g.range = (a, b) => a + f() * (b - a);
      g.int = (a, b) => Math.floor(g.range(a, b + 1));
      g.pick = (arr) => arr[Math.floor(f() * arr.length)];
      return g;
    }

    function star(c, x, y, s) {
      const k = s * 0.14;
      c.beginPath();
      c.moveTo(x, y - s * 1.5);
      c.quadraticCurveTo(x + k, y - k, x + s, y);
      c.quadraticCurveTo(x + k, y + k, x, y + s * 1.5);
      c.quadraticCurveTo(x - k, y + k, x - s, y);
      c.quadraticCurveTo(x - k, y - k, x, y - s * 1.5);
      c.fill();
    }

    // Draws one shape centred on the origin; `u` is its size unit.
    function drawShape(c, s, u, lw, t) {
      switch (s.type) {
        case 'rect': c.strokeRect(-u * s.aspect * 0.6, -u * 0.6, u * s.aspect * 1.2, u * 1.2); break;
        case 'bar': c.strokeRect(-u * 1.8, -u * 0.13, u * 3.6, u * 0.26); break;
        case 'solid': c.fillRect(-u * 1.5 * s.aspect, -u * 0.18, u * 3 * s.aspect, u * 0.36); break;
        case 'square': c.fillRect(-u * 0.14, -u * 0.14, u * 0.28, u * 0.28); break;
        case 'dot': c.beginPath(); c.arc(0, 0, Math.max(1, u * 0.07), 0, Math.PI * 2); c.fill(); break;
        case 'ring': c.beginPath(); c.arc(0, 0, u * 0.16, 0, Math.PI * 2); c.stroke(); break;
        case 'stripes': {
          const R = u * 0.5;
          c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke();
          c.save(); c.clip();
          c.beginPath();
          const off = (t * 3) % (R * 0.25);
          for (let x = -R + off; x < R; x += R * 0.25) { c.moveTo(x, -R); c.lineTo(x, R); }
          c.lineWidth = lw * 0.8; c.stroke();
          c.restore();
          break;
        }
        case 'wave': {
          c.beginPath();
          for (let row = 0; row < 2; row++) {
            for (let i = 0; i <= 40; i++) {
              const x = -u * 1.4 + (i / 40) * u * 2.8;
              const y = row * u * 0.28 + Math.sin(i / 40 * Math.PI * 8 + t * 1.2 + s.ph) * u * 0.06;
              i ? c.lineTo(x, y) : c.moveTo(x, y);
            }
          }
          c.stroke();
          break;
        }
        case 'cross': {
          const k = u * 0.14;
          c.beginPath(); c.moveTo(-k, -k); c.lineTo(k, k); c.moveTo(k, -k); c.lineTo(-k, k); c.stroke();
          break;
        }
        case 'cluster': {
          // Three or a small honeycomb of tiny outlined circles.
          const rr = u * 0.12;
          const pts = s.aspect > 1.3 ? [[-2, 0], [0, 0], [2, 0]] : [[-1, 0], [1, 0], [0, 1.73], [-2, 1.73], [2, 1.73], [-1, 3.46], [1, 3.46]];
          c.beginPath();
          for (const [a, b] of pts) { c.moveTo(a * rr + rr, b * rr); c.arc(a * rr, b * rr, rr, 0, Math.PI * 2); }
          c.stroke();
          break;
        }
        default: break;
      }
    }

    return { resize: stage.resize, frame: stage.frame, dispose: stage.dispose };
  },
};
