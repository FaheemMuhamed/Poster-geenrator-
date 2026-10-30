// Age Map: an imaginary city where every lot is coloured by the year it was built.
// A meandering river, a few boulevards and a ring road cut the land; districts at their own
// angles are split into blocks and the blocks into lots. Age grows outward from an old core,
// with absorbed villages, riverside redevelopment and the odd new infill.
// The map is drawn once into an offscreen buffer; each frame only adds overlays.
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain } from '../../shared/bloom2d.js';
import { fontCss, bodyCss } from '../../shared/typeLayer.js';

const UW = 600; // the map is generated in units where the poster is 600 wide
const BINS = 9;

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded 2D value noise + a three-octave fbm.
function makeNoise(seed) {
  const h = (x, y) => {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  };
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y) => vn(x, y) * 0.55 + vn(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.3 + vn(x * 4.3 + 9.1, y * 4.3 + 7.7) * 0.15;
  return { vn, fbm };
}

// ---------- convex polygon helpers ----------
// Keep the part of a convex polygon where n·p <= c.
function clipHalf(poly, nx, ny, c) {
  const out = [];
  const L = poly.length;
  for (let i = 0; i < L; i++) {
    const a = poly[i], b = poly[(i + 1) % L];
    const da = a[0] * nx + a[1] * ny - c, db = b[0] * nx + b[1] * ny - c;
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
// Where the line n·p = c crosses a convex polygon (the visible stretch of a road).
function chord(poly, nx, ny, c) {
  const pts = [];
  const L = poly.length;
  for (let i = 0; i < L; i++) {
    const a = poly[i], b = poly[(i + 1) % L];
    const da = a[0] * nx + a[1] * ny - c, db = b[0] * nx + b[1] * ny - c;
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return pts.length >= 2 ? pts : null;
}
function area(poly) {
  let s = 0;
  for (let i = 0, L = poly.length; i < L; i++) {
    const a = poly[i], b = poly[(i + 1) % L];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}
function centroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}
function span(poly, nx, ny) {
  let lo = Infinity, hi = -Infinity;
  for (const p of poly) { const d = p[0] * nx + p[1] * ny; if (d < lo) lo = d; if (d > hi) hi = d; }
  return [lo, hi];
}
function inConvex(poly, x, y) {
  let sign = 0;
  for (let i = 0, L = poly.length; i < L; i++) {
    const a = poly[i], b = poly[(i + 1) % L];
    const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cr !== 0) {
      const s = cr > 0 ? 1 : -1;
      if (sign === 0) sign = s; else if (s !== sign) return false;
    }
  }
  return true;
}
// Distance from a point to a polyline; returns { d, i } (nearest segment index).
function polyDist(pts, x, y) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let t = ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - a[0] - dx * t, ey = y - a[1] - dy * t;
    const d = ex * ex + ey * ey;
    if (d < best) { best = d; bi = i; }
  }
  return { d: Math.sqrt(best), i: bi };
}

const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const smooth = (t) => t * t * (3 - 2 * t);
const applyCase = (s, c) => (c === 'UPPERCASE' ? s.toUpperCase() : c === 'lowercase' ? s.toLowerCase() : s);

export default {
  id: 'agemap',
  name: 'Age Map',
  engine: 'p5',
  ownsText: true,
  hint: 'Hover a lot to see its year and its neighbours in time · click to replay the city growing',
  params: {
    blockSize: { value: 36, min: 22, max: 90, step: 1, label: 'Block size', rebuild: true },
    density:   { value: 1.2, min: 0, max: 2, step: 0.05, label: 'Lot density', rebuild: true },
    circle:    { value: false, label: 'Circle crop' },
    light:     { value: false, label: 'Light map' },
    river:     { value: true, label: 'River', rebuild: true },
    roads:     { value: 1, min: 0, max: 2.5, step: 0.05, label: 'Roads weight', rebuild: true },
    spread:    { value: 0.5, min: 0, max: 1, step: 0.01, label: 'Age noise', rebuild: true },
    yearStart: { value: 1850, min: 1700, max: 1950, step: 5, label: 'First year' },
    yearEnd:   { value: 2020, min: 1950, max: 2030, step: 5, label: 'Last year' },
    window:    { value: 12, min: 2, max: 60, step: 1, label: 'Hover window (years)' },
  },
  controls: {
    essentials: ['blockSize', 'density', 'circle', 'light'],
    groups: { City: ['river', 'roads', 'spread'], Years: ['yearStart', 'yearEnd', 'window'] },
  },

  create(ctx) {
    const P = ctx.params;
    const seed = ctx.rand.int(1, 2 ** 30);

    let W = 100, H = 100, DPR = 1, S = 1, HU = 100;
    let city = null;
    let mapDirty = true;
    const buf = document.createElement('canvas');
    const bc = buf.getContext('2d');

    // ---------- generation (all in map units) ----------
    function generate() {
      const rng = makeRng(seed);
      const rf = (a, b) => a + (b - a) * rng();
      const noise = makeNoise(Math.floor(rng() * 1e6));
      const Wu = UW, Hu = HU;
      const diag = Math.hypot(Wu, Hu);
      const roadW = 6 * P.roads + 0.6;
      const streetW = 1 + 1.7 * P.roads;
      const lotGap = 0.55;

      // A meandering centre line: base direction plus two sine bends and a little noise.
      const meander = (p0, ang, amp, len, step, nz) => {
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const A1 = amp * rf(0.6, 1), f1 = rf(0.005, 0.011), ph1 = rf(0, 6.28);
        const A2 = amp * rf(0.15, 0.3), f2 = rf(0.018, 0.035), ph2 = rf(0, 6.28);
        const pts = [];
        for (let s = -len; s <= len; s += step) {
          const off = A1 * Math.sin(s * f1 + ph1) + A2 * Math.sin(s * f2 + ph2) + (noise.vn(s * 0.02, nz) - 0.5) * amp * 0.2;
          pts.push([p0[0] + dx * s - dy * off, p0[1] + dy * s + dx * off]);
        }
        return pts;
      };

      // River.
      let river = null;
      let core;
      if (P.river) {
        const ang = rf(1.15, 1.95) + (Wu > Hu ? -Math.PI / 2 : 0);
        const p0 = [Wu * rf(0.38, 0.62), Hu * rf(0.4, 0.6)];
        const pts = meander(p0, ang, rf(40, 75), diag * 0.75, 5, 3.7);
        const base = 11 + rf(0, 6);
        const hw = pts.map((_, i) => base * (0.75 + 0.6 * noise.vn(i * 0.06, 9.1)));
        const mid = pts[Math.floor(pts.length / 2)];
        const nb = pts[Math.floor(pts.length / 2) + 1];
        const tx = nb[0] - mid[0], ty = nb[1] - mid[1], tl = Math.hypot(tx, ty) || 1;
        const side = rng() < 0.5 ? 1 : -1;
        const off = base + rf(28, 60);
        core = [mid[0] - (ty / tl) * off * side, mid[1] + (tx / tl) * off * side];
        river = { pts, hw, bank: 2.5 + roadW * 0.35 };
      } else {
        core = [Wu * rf(0.4, 0.6), Hu * rf(0.42, 0.55)];
      }
      core[0] = Math.min(Wu * 0.75, Math.max(Wu * 0.25, core[0]));
      core[1] = Math.min(Hu * 0.72, Math.max(Hu * 0.3, core[1]));

      // Ring road around the old core, and a freeway sweeping across.
      const roadsOn = P.roads > 0.05;
      const curves = [];
      if (roadsOn) {
        const rr = Math.min(Wu, Hu) * rf(0.3, 0.38);
        const ring = [];
        const ex = rf(0.9, 1.25);
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2;
          const k = 1 + (noise.vn(Math.cos(a) * 1.4 + 20, Math.sin(a) * 1.4 + 20) - 0.5) * 0.35;
          ring.push([core[0] + Math.cos(a) * rr * k * ex, core[1] + Math.sin(a) * rr * k / ex]);
        }
        curves.push({ pts: ring, hw: roadW * 0.55 });
        const fang = (river ? Math.atan2(river.pts[1][1] - river.pts[0][1], river.pts[1][0] - river.pts[0][0]) : rf(0, 3.14)) + Math.PI / 2 + rf(-0.45, 0.45);
        const fp = [core[0] + rf(-1, 1) * rr * 0.5, core[1] + (rng() < 0.5 ? -1 : 1) * rr * rf(0.5, 0.9)];
        curves.push({ pts: meander(fp, fang, rf(10, 30), diag * 0.75, 6, 12.3), hw: roadW * 0.5 });
      }

      // Absorbed villages: little old cores of their own.
      const villages = [];
      for (let i = 0; i < 3; i++) {
        villages.push({ x: rf(0.1, 0.9) * Wu, y: rf(0.1, 0.9) * Hu, r: rf(35, 70), age: rf(0.12, 0.4) });
      }

      const spread = P.spread;
      const riverD = (x, y) => (river ? polyDist(river.pts, x, y) : { d: Infinity, i: 0 });
      const baseAge = (x, y) => {
        const d = Math.hypot(x - core[0], y - core[1]) / (diag * 0.55);
        let a = 0.04 + 0.92 * Math.pow(Math.min(1.3, d), 0.8);
        a += (noise.fbm(x * 0.006 + 3, y * 0.006 + 8) - 0.5) * (0.2 + 0.7 * spread);
        for (const v of villages) {
          const dv = Math.hypot(x - v.x, y - v.y) / v.r;
          if (dv < 1.6) a = Math.min(a, v.age + dv * 0.32);
        }
        if (river) {
          const rd = riverD(x, y).d;
          if (rd < 55 && noise.vn(x * 0.012 + 40, y * 0.012 + 2) > 0.52) a = Math.max(a, 0.8 + rf(0, 0.18));
        }
        return Math.max(0, Math.min(0.999, a));
      };

      const lots = [], parks = [], roads = [];
      const theta0 = rf(-0.35, 0.35);
      const blockS = P.blockSize;
      const lotS = blockS / (0.85 + P.density * 1.5);
      const districtS = Math.max(190, blockS * 5.5);
      const coreR = Math.min(Wu, Hu) * rf(0.13, 0.18);

      const split = (poly, nx, ny, c, gap) => [clipHalf(poly, nx, ny, c - gap / 2), clipHalf(poly, -nx, -ny, -(c + gap / 2))];
      const ok = (p) => p.length >= 3 && area(p) > 2;

      function lotsOf(poly, th, blockAge, depth) {
        const ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
        const [u0, u1] = span(poly, ux, uy), [v0, v1] = span(poly, vx, vy);
        const eu = u1 - u0, ev = v1 - v0;
        const long = Math.max(eu, ev), short = Math.min(eu, ev);
        let nx, ny, c;
        if (depth === 0 && long > short * 1.45 && short > lotS * 1.3) {
          // First cut along the block's spine: two rows of lots back to back.
          if (eu >= ev) { nx = vx; ny = vy; c = v0 + ev * (0.5 + rf(-0.08, 0.08)); }
          else { nx = ux; ny = uy; c = u0 + eu * (0.5 + rf(-0.08, 0.08)); }
        } else if (long > lotS * rf(0.75, 1.35) && depth < 18) {
          if (eu >= ev) { nx = ux; ny = uy; c = u0 + eu * (0.5 + rf(-0.28, 0.28)); }
          else { nx = vx; ny = vy; c = v0 + ev * (0.5 + rf(-0.28, 0.28)); }
        } else {
          if (rng() < 0.035) return; // no data
          const [cx, cy] = centroid(poly);
          let a = blockAge + rf(-0.035, 0.035);
          const r = rng();
          if (r < 0.06) a = rf(0.7, 0.999); // new infill
          else if (r < 0.08) a = rf(0, 0.22); // a survivor
          lots.push({ poly, cx, cy, a: Math.max(0, Math.min(0.999, a)), v: Math.floor(rng() * 3) });
          return;
        }
        for (const h of split(poly, nx, ny, c, lotGap)) if (ok(h)) lotsOf(h, th, blockAge, depth + 1);
      }

      function block(poly, th, inCore, depth) {
        const [cx, cy] = centroid(poly);
        const jt = inCore ? rf(-0.4, 0.4) : 0;
        const ux = Math.cos(th + jt), uy = Math.sin(th + jt), vx = -uy, vy = ux;
        const [u0, u1] = span(poly, ux, uy), [v0, v1] = span(poly, vx, vy);
        const eu = u1 - u0, ev = v1 - v0;
        const bs = blockS * (inCore ? 0.62 : 1) * (0.85 + 0.35 * noise.vn(cx * 0.01, cy * 0.01));
        if (Math.max(eu, ev) > bs * rf(0.95, 1.35) && depth < 16) {
          const g = streetW * (inCore ? 0.7 : 1);
          let nx, ny, c;
          if (eu >= ev) { nx = ux; ny = uy; c = u0 + eu * (0.5 + rf(-0.15, 0.15)); }
          else { nx = vx; ny = vy; c = v0 + ev * (0.5 + rf(-0.15, 0.15)); }
          for (const h of split(poly, nx, ny, c, g)) if (ok(h)) block(h, th, inCore, depth + 1);
          return;
        }
        if (area(poly) < 12) return;
        const r = rng();
        if (r < 0.045 && !inCore) { parks.push(poly); return; }
        const blockAge = baseAge(cx, cy) + rf(-0.06, 0.06);
        if (r < 0.1) { // one big lot: a factory, a school, a depot
          lots.push({ poly, cx, cy, a: Math.max(0, Math.min(0.999, blockAge + rf(-0.1, 0.25))), v: Math.floor(rng() * 3) });
          return;
        }
        lotsOf(poly, th + (inCore ? rf(-0.2, 0.2) : 0), blockAge, 0);
      }

      const angles = [0, 0, 0, 0.42, -0.6, Math.PI / 4, 0.2];
      function district(poly) {
        const [cx, cy] = centroid(poly);
        const inCore = Math.hypot(cx - core[0], cy - core[1]) < coreR * 1.25;
        const th = theta0 + angles[Math.floor(rng() * angles.length)] + rf(-0.05, 0.05);
        block(poly, th, inCore, 0);
      }

      function cityCut(poly, depth) {
        const [u0, u1] = span(poly, Math.cos(theta0), Math.sin(theta0));
        const [v0, v1] = span(poly, -Math.sin(theta0), Math.cos(theta0));
        const long = Math.max(u1 - u0, v1 - v0);
        if (long < districtS || depth > 7) { district(poly); return; }
        let ang = (u1 - u0 >= v1 - v0 ? theta0 : theta0 + Math.PI / 2) + rf(-0.3, 0.3);
        if (rng() < 0.22) ang += (rng() < 0.5 ? -1 : 1) * rf(0.5, 0.8); // a diagonal boulevard
        const nx = Math.cos(ang), ny = Math.sin(ang);
        const [lo, hi] = span(poly, nx, ny);
        const c = (lo + hi) / 2 + rf(-0.18, 0.18) * (hi - lo);
        const ch = chord(poly, nx, ny, c);
        const rw = roadW * (depth < 2 ? 1 : 0.7);
        if (ch) roads.push({ a: ch[0], b: ch[1], w: rw });
        for (const h of split(poly, nx, ny, c, rw)) if (ok(h)) cityCut(h, depth + 1);
      }

      cityCut([[-12, -12], [Wu + 12, -12], [Wu + 12, Hu + 12], [-12, Hu + 12]], 0);

      // Clear lots that sit in the river or under the curved roads.
      const kept = [];
      for (const L of lots) {
        if (river) {
          const { d, i } = polyDist(river.pts, L.cx, L.cy);
          if (d < river.hw[i] + river.bank + 2) continue;
        }
        let hit = false;
        for (const cv of curves) if (polyDist(cv.pts, L.cx, L.cy).d < cv.hw + 1.5) { hit = true; break; }
        if (hit) continue;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of L.poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
        L.box = [x0, y0, x1, y1];
        kept.push(L);
      }

      // River outline polygons (water + a ground-coloured embankment).
      let riverPoly = null, bankPoly = null;
      if (river) {
        const left = [], right = [], bl = [], br = [];
        const pts = river.pts;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
          const nx = -ty / tl, ny = tx / tl;
          const hw = river.hw[i], hb = hw + river.bank;
          left.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]);
          right.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
          bl.push([pts[i][0] + nx * hb, pts[i][1] + ny * hb]);
          br.push([pts[i][0] - nx * hb, pts[i][1] - ny * hb]);
        }
        riverPoly = left.concat(right.reverse());
        bankPoly = bl.concat(br.reverse());
      }

      // Spatial hash for hover, and the lots ordered by age for sweeps.
      const cell = 24;
      const gw = Math.ceil(Wu / cell) + 1, gh = Math.ceil(Hu / cell) + 1;
      const grid = Array.from({ length: gw * gh }, () => []);
      kept.forEach((L, idx) => {
        const [x0, y0, x1, y1] = L.box;
        for (let gy = Math.max(0, Math.floor(y0 / cell)); gy <= Math.min(gh - 1, Math.floor(y1 / cell)); gy++) {
          for (let gx = Math.max(0, Math.floor(x0 / cell)); gx <= Math.min(gw - 1, Math.floor(x1 / cell)); gx++) grid[gy * gw + gx].push(idx);
        }
      });
      const order = kept.map((_, i) => i).sort((a, b) => kept[a].a - kept[b].a);
      const ages = Float32Array.from(order.map((i) => kept[i].a));

      return { lots: kept, parks, roads, curves, river, riverPoly, bankPoly, grid, cell, gw, gh, order, ages, core };
    }

    // ---------- colours ----------
    let cols = null;
    function colours() {
      const pal = ctx.palette;
      const ink = hexRgb(pal.ink), bg = hexRgb(pal.bg);
      const darkFirst = lum(ink) < lum(bg);
      const dark = darkFirst ? ink : bg, light = darkFirst ? bg : ink;
      const ground = P.light ? light : dark;
      const text = P.light ? dark : light;
      const gl = lum(ground);
      // Ramp stops from the accents, pushed away from the ground until they read.
      const stops = [pal.c1, pal.c2, pal.c3, pal.c4].map((h) => {
        let c = hexRgb(h);
        for (let k = 0; k < 12 && Math.abs(lum(c) - gl) < 0.28; k++) c = mixRgb(c, P.light ? [0, 0, 0] : [255, 255, 255], 0.1);
        return c;
      });
      const ramp = (t) => {
        const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
        const i = Math.floor(x);
        return mixRgb(stops[i], stops[i + 1], smooth(x - i));
      };
      const bins = [];
      for (let i = 0; i < BINS; i++) {
        const c = ramp((i + 0.5) / BINS);
        bins.push([css(c), css(mixRgb(c, ground, 0.09)), css(mixRgb(c, text, 0.07))]);
      }
      return {
        ground, text, ramp,
        groundCss: css(ground), textCss: css(text),
        water: css(mixRgb(mixRgb(ground, text, 0.13), stops[2], 0.08)),
        park: css(mixRgb(ground, text, 0.075)),
        road: css(mixRgb(ground, text, 0.2)),
        bins,
        binRgb: Array.from({ length: BINS }, (_, i) => ramp((i + 0.5) / BINS)),
      };
    }

    // ---------- layout ----------
    function crop() {
      if (W / H > 1.1) {
        const r = Math.min(HU * 0.44, UW * 0.32);
        return { x: UW * 0.6, y: HU * 0.52, r };
      }
      const r = Math.min(UW * 0.46, HU * 0.4);
      return { x: UW / 2, y: Math.min(HU - r - HU * 0.07, Math.max(HU * 0.55, 175 + r)), r };
    }
    const yearSpan = () => {
      const a = P.yearStart, b = Math.max(P.yearEnd, P.yearStart + 10);
      return [a, b];
    };
    const yearOf = (a) => { const [y0, y1] = yearSpan(); return Math.round(y0 + a * (y1 - y0)); };

    function renderMap() {
      if (!city) return;
      cols = colours();
      const w = Math.max(1, Math.round(W * DPR)), h = Math.max(1, Math.round(H * DPR));
      if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
      const g = bc;
      g.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
      g.fillStyle = cols.groundCss;
      g.fillRect(-2, -2, UW + 4, HU + 4);
      // Circle crop keeps whole lots whose centre is inside, so the edge stays ragged like
      // a real cut-out of the city; roads and water are clipped clean.
      const cr = P.circle ? crop() : null;
      const inC = (x, y) => !cr || Math.hypot(x - cr.x, y - cr.y) < cr.r;
      for (const L of city.lots) L.vis = inC(L.cx, L.cy);
      const poly = (path, pts) => {
        path.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
        path.closePath();
      };
      // Parks and empty ground.
      g.fillStyle = cols.park;
      g.beginPath();
      for (const pk of city.parks) { const [x, y] = centroid(pk); if (inC(x, y)) poly(g, pk); }
      g.fill();
      // Lots, batched by colour.
      const paths = Array.from({ length: BINS * 3 }, () => new Path2D());
      for (const L of city.lots) if (L.vis) poly(paths[Math.floor(L.a * BINS) * 3 + L.v], L.poly);
      for (let i = 0; i < paths.length; i++) { g.fillStyle = cols.bins[Math.floor(i / 3)][i % 3]; g.fill(paths[i]); }
      g.save();
      if (cr) { g.beginPath(); g.arc(cr.x, cr.y, cr.r + 3, 0, Math.PI * 2); g.clip(); }
      // Boulevards: faint centre lines in the wide gaps.
      g.strokeStyle = cols.road;
      g.lineCap = 'round';
      for (const r of city.roads) {
        g.lineWidth = Math.max(0.4, r.w * 0.22);
        g.beginPath(); g.moveTo(r.a[0], r.a[1]); g.lineTo(r.b[0], r.b[1]); g.stroke();
      }
      // Ring road and freeway: cut through, then a lane line.
      g.lineJoin = 'round';
      for (const cv of city.curves) {
        g.strokeStyle = cols.groundCss;
        g.lineWidth = cv.hw * 2;
        g.beginPath();
        cv.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.stroke();
        g.strokeStyle = cols.road;
        g.lineWidth = Math.max(0.5, cv.hw * 0.45);
        g.stroke();
      }
      // River.
      if (city.riverPoly) {
        g.fillStyle = cols.groundCss;
        g.beginPath(); poly(g, city.bankPoly); g.fill();
        g.fillStyle = cols.water;
        g.beginPath(); poly(g, city.riverPoly); g.fill();
      }
      g.restore();
      mapDirty = false;
      dimCache = { key: -2, path: null, near: null };
    }

    // ---------- interaction state ----------
    let hover = -1, dimAmt = 0, lastHover = -1, hold = 0;
    let dimCache = { key: -2, path: null, near: null };
    let sweep = -1; // seconds since a sweep started, -1 = none
    const SWEEP_LEN = 4.2;

    const lowerBound = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; };
    const pathOf = (idxs) => {
      const p = new Path2D();
      for (const i of idxs) {
        if (!city.lots[i].vis) continue;
        const pts = city.lots[i].poly;
        p.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) p.lineTo(pts[k][0], pts[k][1]);
        p.closePath();
      }
      return p;
    };
    const titleBox = { x0: 0, y0: 0, x1: 0, y1: 0 };

    function lotAt(ux, uy) {
      if (!city) return -1;
      if (!P.circle && ux < titleBox.x1 && uy < titleBox.y1) return -1;
      if (city.river) {
        const { d, i } = polyDist(city.river.pts, ux, uy);
        if (d < city.river.hw[i] + city.river.bank) return -1;
      }
      const gx = Math.floor(ux / city.cell), gy = Math.floor(uy / city.cell);
      if (gx < 0 || gy < 0 || gx >= city.gw || gy >= city.gh) return -1;
      for (const i of city.grid[gy * city.gw + gx]) {
        const L = city.lots[i];
        if (ux < L.box[0] || ux > L.box[2] || uy < L.box[1] || uy > L.box[3]) continue;
        if (L.vis && inConvex(L.poly, ux, uy)) return i;
      }
      return -1;
    }

    // ---------- type ----------
    function drawText(c, t, markers) {
      const T = ctx.state.text;
      const show = T.show !== false;
      const m = 26;
      const [y0, y1] = yearSpan();
      const panelW = Math.min(250, UW * 0.46);
      let y = m;
      const textCss = cols.textCss;
      const lines = [];
      if (show) {
        const title = applyCase((T.lines.title || '').trim(), T.textCase);
        const ts = 24 * (T.size || 1);
        if (title) lines.push({ kind: 'title', s: title, size: ts });
        const sub = (T.lines.subtitle || '').trim();
        if (sub) lines.push({ kind: 'sub', s: sub, size: 10.5 });
      }
      lines.push({ kind: 'cap', s: `Every lot coloured by the year it was built, ${y0}–${y1}.`, size: 8.5 });

      // Measure first so the backing panel fits the block.
      let h = 0;
      for (const L of lines) h += L.kind === 'title' ? L.size * 1.15 : L.size * 1.55;
      const legendH = 40;
      const blockH = 10 + h + 10 + legendH;
      titleBox.x1 = m + panelW + 16; titleBox.y1 = m + blockH + 10;
      if (!P.circle) {
        c.fillStyle = cols.groundCss;
        c.fillRect(-2, -2, titleBox.x1 + 2, titleBox.y1 + 2);
      }
      // Hairline rule above the title, like a map sheet.
      c.fillStyle = textCss;
      c.fillRect(m, y, panelW, 0.8);
      y += 10;
      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';
      for (const L of lines) {
        if (L.kind === 'title') {
          c.font = fontCss(T, L.size);
          c.fillStyle = textCss;
          y += L.size * 0.95;
          c.fillText(L.s, m, y, panelW);
          y += L.size * 0.2;
        } else {
          c.font = bodyCss(T, L.size);
          c.fillStyle = L.kind === 'cap' ? css(cols.text, 0.62) : textCss;
          y += L.size * 1.4;
          c.fillText(L.s, m, y, panelW);
          y += L.size * 0.15;
        }
      }
      y += 20;

      // Legend: a segmented bar with year labels.
      const bx = m, bw = panelW, bh = 6, gap = 1.5;
      const segW = (bw - gap * (BINS - 1)) / BINS;
      const lx = (a) => bx + a * bw;
      if (markers.band) {
        c.fillStyle = css(cols.text, 0.16 * markers.band.k);
        c.fillRect(lx(markers.band.a0), y - 4, Math.max(1, lx(markers.band.a1) - lx(markers.band.a0)), bh + 8);
      }
      for (let i = 0; i < BINS; i++) {
        c.fillStyle = cols.bins[i][0];
        c.fillRect(bx + i * (segW + gap), y, segW, bh);
      }
      if (markers.sweep !== undefined) {
        c.fillStyle = css(cols.ground, 0.75);
        const sx = lx(Math.max(0, Math.min(1, markers.sweep)));
        c.fillRect(sx, y, bx + bw - sx, bh);
      }
      c.font = bodyCss(T, 7.5);
      c.fillStyle = css(cols.text, 0.7);
      const every = BINS > 6 ? 3 : 1;
      for (let i = 0; i <= BINS; i += every) {
        const yr = Math.round((y0 + (i / BINS) * (y1 - y0)) / 5) * 5;
        c.textAlign = i === 0 ? 'left' : i === BINS ? 'right' : 'center';
        c.fillText(i === 0 ? `–${yr}` : i === BINS ? `${yr}–` : `${yr}`, lx(i / BINS), y + bh + 11);
      }
      // Marker for the hovered year / sweep / idle pulse.
      for (const mk of markers.ticks) {
        const x = lx(mk.a);
        c.fillStyle = css(cols.text, mk.alpha);
        c.beginPath();
        c.moveTo(x, y - 1.5); c.lineTo(x - 3.2, y - 6.5); c.lineTo(x + 3.2, y - 6.5); c.closePath();
        c.fill();
        if (mk.label) {
          c.font = bodyCss(T, 7.5);
          c.textAlign = 'center';
          c.fillText(mk.label, Math.max(bx + 8, Math.min(bx + bw - 8, x)), y - 9);
        }
      }

      // Footer: the remaining lines, bottom right.
      if (show) {
        const foot = [T.lines.date, T.lines.venue, T.lines.footer].map((s) => (s || '').trim()).filter(Boolean).join('   ·   ');
        if (foot) {
          c.font = bodyCss(T, 7.5);
          const fw = c.measureText(foot).width;
          if (!P.circle) { c.fillStyle = cols.groundCss; c.fillRect(UW - m - fw - 8, HU - m - 12, fw + 8 + m + 2, m + 14); }
          c.fillStyle = css(cols.text, 0.75);
          c.textAlign = 'right';
          c.fillText(foot, UW - m, HU - m + 1);
        }
      }
    }

    // ---------- frame ----------
    let palSig = '';
    const stage = createP5Stage(ctx, {
      setup() {},
      draw(p, t, dt) {
        const c = p.drawingContext;
        const pal = ctx.palette;
        const sig = pal.bg + pal.ink + pal.c1 + pal.c2 + pal.c3 + pal.c4;
        if (sig !== palSig) { palSig = sig; mapDirty = true; }
        if (!city) city = generate();
        if (mapDirty) renderMap();

        const ptr = ctx.pointer;
        const mouse = ctx.state.motion.mouse;
        const ux = (ptr.x * W) / S, uy = (ptr.y * H) / S;

        // Hover target.
        // Crossing a street keeps the last lot for a moment, so the dimming doesn't flicker.
        const hit = ptr.inside && mouse > 0 && sweep < 0 ? lotAt(ux, uy) : -1;
        if (hit >= 0) { lastHover = hit; hold = 0.3; }
        else hold = ptr.inside && sweep < 0 ? hold - dt : 0;
        hover = hit >= 0 ? hit : hold > 0 ? lastHover : -1;
        const target = hover >= 0 ? Math.min(1, 0.55 + 0.3 * mouse) : 0;
        dimAmt += (target - dimAmt) * (1 - Math.pow(0.0015, dt));
        if (ptr.justPressed && ptr.inside) sweep = 0;
        if (sweep >= 0) { sweep += dt; if (sweep > SWEEP_LEN + 1.2) sweep = -1; }

        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(buf, 0, 0, c.canvas.width, c.canvas.height);
        c.restore();

        c.save();
        c.scale(S, S);

        const [y0, y1] = yearSpan();
        const winA = P.window / (y1 - y0);
        const markers = { ticks: [], band: null };
        const ages = city.ages, order = city.order;

        // River current: dashes drifting downstream.
        if (city.river) {
          c.save();
          if (P.circle) { const cr = crop(); c.beginPath(); c.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2); c.clip(); }
          c.strokeStyle = css(cols.text, 0.16);
          c.lineWidth = 0.8;
          c.setLineDash([5, 11]);
          c.lineDashOffset = -t * 9;
          c.beginPath();
          city.river.pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
          c.stroke();
          c.restore();
        }

        // Idle: a slow glow passes through the decades, lighting each era in turn.
        const quiet = Math.max(0, 1 - dimAmt * 1.6) * (sweep >= 0 ? 0 : 1);
        if (quiet > 0.01) {
          const pa = 0.5 - 0.5 * Math.cos(t * 0.16);
          const w = 0.035;
          const i0 = lowerBound(ages, pa - w), i1 = lowerBound(ages, pa + w);
          c.fillStyle = css(cols.text, 0.28 * quiet);
          c.beginPath();
          for (let k = i0; k < i1; k++) {
            const Lp = city.lots[order[k]];
            if (!Lp.vis) continue;
            const pts = Lp.poly;
            c.moveTo(pts[0][0], pts[0][1]);
            for (let j = 1; j < pts.length; j++) c.lineTo(pts[j][0], pts[j][1]);
            c.closePath();
          }
          c.fill();
          markers.ticks.push({ a: pa, alpha: 0.45 * quiet, label: '' });
        }

        // Hover: dim everything outside a window of years, outline the era, mark the lot.
        if (dimAmt > 0.01 && lastHover >= 0) {
          const L = city.lots[lastHover];
          if (dimCache.key !== lastHover) {
            const i0 = lowerBound(ages, L.a - winA), i1 = lowerBound(ages, L.a + winA);
            const out = [], near = [];
            for (let k = 0; k < order.length; k++) (k >= i0 && k < i1 ? near : out).push(order[k]);
            dimCache = { key: lastHover, path: pathOf(out), near: pathOf(near) };
          }
          c.fillStyle = css(cols.ground, 0.78 * dimAmt);
          c.fill(dimCache.path);
          c.strokeStyle = css(cols.text, 0.35 * dimAmt);
          c.lineWidth = 0.45;
          c.stroke(dimCache.near);
          // The lot itself.
          const pts = L.poly;
          c.beginPath();
          c.moveTo(pts[0][0], pts[0][1]);
          for (let j = 1; j < pts.length; j++) c.lineTo(pts[j][0], pts[j][1]);
          c.closePath();
          c.fillStyle = css(mixRgb(cols.binRgb[Math.floor(L.a * BINS)], cols.text, 0.25), dimAmt);
          c.fill();
          c.strokeStyle = css(cols.text, dimAmt);
          c.lineWidth = 1.4;
          c.stroke();
          markers.band = { a0: Math.max(0, L.a - winA), a1: Math.min(1, L.a + winA), k: dimAmt };
          markers.ticks.push({ a: L.a, alpha: dimAmt, label: String(yearOf(L.a)) });
        }

        // Click: time sweep. Lots appear in order of their year, each with a brief flash.
        let sweepA;
        if (sweep >= 0) {
          sweepA = Math.min(1.06, (sweep / SWEEP_LEN) * 1.06);
          const fade = sweep > SWEEP_LEN ? Math.max(0, 1 - (sweep - SWEEP_LEN) / 1.2) : 1;
          const iHide = lowerBound(ages, sweepA);
          if (iHide < order.length) {
            c.fillStyle = cols.groundCss;
            c.beginPath();
            for (let k = iHide; k < order.length; k++) {
              if (!city.lots[order[k]].vis) continue;
              const pts = city.lots[order[k]].poly;
              c.moveTo(pts[0][0], pts[0][1]);
              for (let j = 1; j < pts.length; j++) c.lineTo(pts[j][0], pts[j][1]);
              c.closePath();
            }
            c.fill();
          }
          const flashW = 0.05;
          const iNew = lowerBound(ages, sweepA - flashW);
          for (let k = iNew; k < iHide; k++) {
            const L = city.lots[order[k]];
            if (!L.vis) continue;
            const f = 1 - (sweepA - L.a) / flashW;
            const pts = L.poly;
            c.beginPath();
            c.moveTo(pts[0][0], pts[0][1]);
            for (let j = 1; j < pts.length; j++) c.lineTo(pts[j][0], pts[j][1]);
            c.closePath();
            c.fillStyle = css(cols.text, 0.75 * f * f);
            c.fill();
          }
          if (fade > 0) markers.ticks.push({ a: Math.min(1, sweepA), alpha: fade, label: String(yearOf(Math.min(0.999, sweepA))) });
          markers.sweep = sweepA < 1 ? sweepA : undefined;
        }

        drawText(c, t, markers);

        // Big running year during a sweep.
        if (sweep >= 0) {
          const fade = sweep > SWEEP_LEN ? Math.max(0, 1 - (sweep - SWEEP_LEN) / 1.2) : Math.min(1, sweep * 3);
          const T = ctx.state.text;
          const yr = String(yearOf(Math.min(0.999, sweepA)));
          c.font = fontCss(T, 58);
          c.textAlign = 'left';
          c.textBaseline = 'alphabetic';
          c.lineJoin = 'round';
          c.strokeStyle = css(cols.ground, 0.9 * fade);
          c.lineWidth = 8;
          c.strokeText(yr, 24, HU - 30);
          c.fillStyle = css(cols.text, fade);
          c.fillText(yr, 24, HU - 30);
        }

        // Hover label beside the cursor.
        if (hover >= 0 && dimAmt > 0.05) {
          const L = city.lots[hover];
          const T = ctx.state.text;
          const yr = yearOf(L.a);
          const age = Math.max(0, y1 - yr);
          const big = String(yr), small = age > 0 ? `${age} years before ${y1}` : 'newest';
          c.font = fontCss(T, 15);
          const bw1 = c.measureText(big).width;
          c.font = bodyCss(T, 7);
          const bw2 = c.measureText(small).width;
          const bw = Math.max(bw1, bw2) + 22, bh = 34;
          let lx = ux + 12, ly = uy + 12;
          if (lx + bw > UW - 6) lx = ux - 12 - bw;
          if (ly + bh > HU - 6) ly = uy - 12 - bh;
          c.fillStyle = css(cols.ground, 0.92 * dimAmt);
          c.fillRect(lx, ly, bw, bh);
          c.strokeStyle = css(cols.text, 0.8 * dimAmt);
          c.lineWidth = 0.7;
          c.strokeRect(lx, ly, bw, bh);
          c.fillStyle = cols.bins[Math.floor(L.a * BINS)][0];
          c.fillRect(lx + 7, ly + 8, 5, 5);
          c.fillStyle = css(cols.text, dimAmt);
          c.textAlign = 'left';
          c.textBaseline = 'alphabetic';
          c.font = fontCss(T, 15);
          c.fillText(big, lx + 16, ly + 17);
          c.font = bodyCss(T, 7);
          c.fillStyle = css(cols.text, 0.65 * dimAmt);
          c.fillText(small, lx + 7, ly + 28);
        }
        c.restore();

        drawGrain(c, W, H, ctx.state.grain * 0.7);
      },
    });

    return {
      resize(w, h, dpr) {
        const hu = (UW * h) / w;
        const regen = Math.abs(hu - HU) > 0.5 || !city;
        W = w; H = h; DPR = dpr; S = w / UW; HU = hu;
        stage.resize(w, h, dpr);
        if (regen) { city = generate(); dimCache = { key: -2, path: null, near: null }; lastHover = -1; }
        mapDirty = true;
      },
      frame: stage.frame,
      onParam(key) {
        if (['palette', 'light', 'circle'].includes(key)) mapDirty = true;
      },
      dispose() {
        stage.dispose();
        buf.width = buf.height = 0;
      },
    };
  },
};
