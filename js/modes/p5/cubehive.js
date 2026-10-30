// Cube Hive: a honeycomb of isometric puzzle cubes. Every cube is a real N×N×N puzzle
// (cubies with stickers), so a twist is a true layer rotation drawn in 3D: the turning
// slab swings round in isometric view, exposing the dark core, and lands as a permutation.
// Most cubes are scrambled, a few are solved; twisted cubes slowly rewind to how they were.
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain, hexA } from '../../shared/bloom2d.js';

const C30 = Math.sqrt(3) / 2;
// Sticker directions: 0 +x (right face), 1 -x, 2 +y (left face), 3 -y, 4 +z (top), 5 -z.
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const LIGHT = (() => { const l = [0.25, 0.55, 1]; const m = Math.hypot(...l); return l.map((v) => v / m); })();
const K_STEPS = 64, K_MIN = -0.75, K_MAX = 0.45;

// Small seeded PRNG so a resize rebuilds the exact same hive.
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Continuous rotation of v about a cube axis (0 x, 1 y, 2 z).
function rotate(v, axis, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const x = v[0], y = v[1], z = v[2];
  if (axis === 0) return [x, y * c - z * s, y * s + z * c];
  if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}
const dirIndex = (v) => {
  const ax = Math.abs(v[0]) > 0.5 ? 0 : Math.abs(v[1]) > 0.5 ? 1 : 2;
  return ax * 2 + (v[ax] < 0 ? 1 : 0);
};

// A puzzle: N³ cubies, each with six sticker slots (-1 = no sticker).
function solvedCubies(N, faceCols) {
  const out = new Array(N * N * N);
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const s = new Int8Array(6).fill(-1);
    if (i === N - 1) s[0] = faceCols[0];
    if (i === 0) s[1] = faceCols[1];
    if (j === N - 1) s[2] = faceCols[2];
    if (j === 0) s[3] = faceCols[3];
    if (k === N - 1) s[4] = faceCols[4];
    if (k === 0) s[5] = faceCols[5];
    out[i + j * N + k * N * N] = s;
  }
  return out;
}

// Quarter turn of one layer (q = ±1), using the same rotation the renderer animates.
function applyTwist(cub, N, axis, layer, q) {
  const out = cub.slice();
  const h = (N - 1) / 2;
  const ang = q * Math.PI / 2;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const co = [i, j, k];
    if (co[axis] !== layer) continue;
    const r = rotate([i - h, j - h, k - h], axis, ang);
    const ni = Math.round(r[0] + h), nj = Math.round(r[1] + h), nk = Math.round(r[2] + h);
    const s = cub[i + j * N + k * N * N];
    const ns = new Int8Array(6).fill(-1);
    for (let d = 0; d < 6; d++) if (s[d] >= 0) ns[dirIndex(rotate(DIRS[d], axis, ang))] = s[d];
    out[ni + nj * N + nk * N * N] = ns;
  }
  return out;
}

// Anticipation + overshoot: the layer leans back, swings, and settles.
function easeTwist(t) {
  const c2 = 0.9 * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
}

const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export default {
  id: 'cubehive',
  name: 'Cube Hive',
  engine: 'p5',
  hint: 'Hover to twist a cube (move to steer it) · click to send a wave of twists',
  params: {
    size:     { value: 84, min: 44, max: 170, step: 1, label: 'Cube size', rebuild: true },
    facets:   { value: 3, min: 2, max: 4, step: 1, label: 'Facets per side', rebuild: true },
    scramble: { value: 12, min: 1, max: 30, step: 1, label: 'Scramble depth', rebuild: true },
    gap:      { value: 0.11, min: 0, max: 0.3, step: 0.005, label: 'Facet gap' },
    colors:   { value: 4, min: 1, max: 6, step: 1, label: 'Colours per cube', rebuild: true },
    solved:   { value: 0.1, min: 0, max: 1, step: 0.01, label: 'Solved chance', rebuild: true },
    shading:  { value: 1, min: 0, max: 1.6, step: 0.01, label: 'Face shading' },
    speed:    { value: 1, min: 0.25, max: 3, step: 0.05, label: 'Twist speed' },
    idle:     { value: 1, min: 0, max: 3, step: 0.05, label: 'Idle twists' },
  },
  controls: {
    essentials: ['size', 'facets', 'scramble', 'gap'],
    groups: { Look: ['colors', 'solved', 'shading'], Motion: ['speed', 'idle'] },
  },

  create(ctx) {
    const P = ctx.params;
    const seed = ctx.rand.int(1, 2 ** 30);

    let W = 100, H = 100, DPR = 1;
    let cubes = [];
    let D = 80, R = 40, N = 3;
    let lattice = { ox: 0, oy: 0, rowH: 1, rows: 0, cols: 0, map: new Map() };
    const waves = [];

    // Offscreen buffer holding every cube that isn't moving.
    const buf = document.createElement('canvas');
    const bc = buf.getContext('2d');
    let fullDirty = true;
    const dirty = new Set();

    // ---------- colours ----------
    // Index 0..3 = c1..c4, 4 = ink, 5 = bg, 6 = cube body. Each colour is pre-shaded into
    // K_STEPS levels (negative = toward black, positive = toward white).
    let palSig = '';
    let fills = [];
    let bodyHex = '#000';
    function buildColours() {
      const pal = ctx.palette;
      palSig = pal.bg + pal.ink + pal.c1 + pal.c2 + pal.c3 + pal.c4;
      const ink = hexRgb(pal.ink), bg = hexRgb(pal.bg);
      const body = lum(ink) < lum(bg) ? ink : bg; // the darker of the two is the plastic
      const other = body === ink ? bg : ink;
      bodyHex = body === ink ? pal.ink : pal.bg;
      const base = [hexRgb(pal.c1), hexRgb(pal.c2), hexRgb(pal.c3), hexRgb(pal.c4), ink, bg, mixRgb(body, other, 0.04)];
      // Stickers that match the body or the background get nudged so they still read.
      for (let i = 0; i < 6; i++) {
        const c = base[i];
        const dBody = Math.abs(lum(c) - lum(body)), dBg = Math.abs(lum(c) - lum(bg));
        if (dBody < 0.08) base[i] = mixRgb(c, other, 0.2);
        else if (i === 5 || dBg < 0.03) base[i] = mixRgb(c, other, 0.07);
      }
      fills = base.map((c) => {
        const row = [];
        for (let q = 0; q <= K_STEPS; q++) {
          const k = K_MIN + (K_MAX - K_MIN) * (q / K_STEPS);
          const r = k >= 0 ? mixRgb(c, [255, 255, 255], k) : mixRgb(c, [0, 0, 0], -k);
          row.push(`rgb(${r[0] | 0},${r[1] | 0},${r[2] | 0})`);
        }
        return row;
      });
    }
    const fillOf = (ci, k) => {
      const q = Math.round(((k - K_MIN) / (K_MAX - K_MIN)) * K_STEPS);
      return fills[ci][q < 0 ? 0 : q > K_STEPS ? K_STEPS : q];
    };

    // ---------- the hive ----------
    function build() {
      const rng = makeRng(seed);
      const rf = (a, b) => a + (b - a) * rng();
      const ri = (a, b) => Math.floor(rf(a, b + 1));
      N = Math.round(P.facets);
      D = Math.max(20, P.size * W / 600);
      R = (D / Math.sqrt(3)) * 0.84;
      const rowH = D * C30;
      const rows = Math.ceil(H / rowH) + 3, cols = Math.ceil(W / D) + 3;
      const ox = W / 2 - ((cols - 1) / 2) * D, oy = H / 2 - ((rows - 1) / 2) * rowH;
      lattice = { ox, oy, rowH, rows, cols, map: new Map() };
      cubes = [];
      for (let r = 0; r < rows; r++) {
        for (let q = 0; q < cols; q++) {
          const x = ox + q * D + (r % 2 ? D / 2 : 0) - D / 4;
          const y = oy + r * rowH;
          if (x < -R * 1.2 || x > W + R * 1.2 || y < -R * 1.2 || y > H + R * 1.2) continue;
          // Each cube gets its own small colour set, like a box of mismatched puzzles.
          const k = Math.max(1, Math.min(6, Math.round(P.colors) + ri(-1, 1)));
          // Weighted pick without replacement: accents are favoured over ink and paper.
          const cand = [0, 1, 2, 3, 4, 5], wts = [3, 3, 3, 3, 1.1, 1.5];
          const set = [];
          while (set.length < k) {
            let sum = 0;
            for (const w of wts) sum += w;
            let x = rng() * sum, pick = 0;
            while (pick < wts.length - 1 && x >= wts[pick]) { x -= wts[pick]; pick++; }
            set.push(cand[pick]);
            cand.splice(pick, 1); wts.splice(pick, 1);
          }
          const faceCols = [];
          for (let f = 0; f < 6; f++) faceCols.push(set[f % set.length]);
          for (let f = 5; f > 0; f--) { const j = Math.floor(rng() * (f + 1)); [faceCols[f], faceCols[j]] = [faceCols[j], faceCols[f]]; }
          let cub = solvedCubies(N, faceCols);
          const solved = rng() < P.solved;
          if (!solved) {
            const depth = Math.round(P.scramble);
            const moves = ri(Math.max(1, Math.ceil(depth / 3)), depth);
            for (let m = 0; m < moves; m++) cub = applyTwist(cub, N, ri(0, 2), ri(0, N - 1), rng() < 0.5 ? 1 : -1);
          }
          const cube = { x, y, r, q, cub, anim: null, queue: [], extra: [], last: -10, heal: rf(2.2, 5), nb: [] };
          lattice.map.set(r * 1000 + q, cubes.length);
          cubes.push(cube);
        }
      }
      for (const a of cubes) {
        for (const b of cubes) if (a !== b && Math.hypot(a.x - b.x, a.y - b.y) < D * 1.1) a.nb.push(b);
      }
      fullDirty = true;
    }

    // ---------- drawing ----------
    // One box-shaped slab of a cube: cubie range [lo, hi) along `axis`, full on the others,
    // rotated by `ang` about that axis. A convex box, so its visible faces never overlap.
    function drawSlab(c, cube, cx, cy, sc, axis, lo, hi, ang, gap, shade) {
      const cub = cube.cub;
      const h = N / 2;
      const proj = (v) => {
        const r = ang ? rotate(v, axis, ang) : v;
        return [cx + (r[0] - r[1]) * C30 * sc, cy + ((r[0] + r[1]) * 0.5 - r[2]) * sc];
      };
      for (let f = 0; f < 6; f++) {
        const A = f >> 1, s = f & 1 ? -1 : 1;
        const n = ang ? rotate(DIRS[f], axis, ang) : DIRS[f];
        if (n[0] + n[1] + n[2] <= 0.001) continue; // faces away from the viewer
        const B = (A + 1) % 3, Cx = (A + 2) % 3;
        const b0 = B === axis ? lo : 0, b1 = B === axis ? hi : N;
        const c0 = Cx === axis ? lo : 0, c1 = Cx === axis ? hi : N;
        const plane = A === axis ? (s > 0 ? hi : lo) : (s > 0 ? N : 0);
        const surface = A !== axis || (s > 0 ? hi === N : lo === 0);
        const pt = (b, cc) => { const v = [0, 0, 0]; v[A] = plane - h; v[B] = b - h; v[Cx] = cc - h; return proj(v); };
        const O = pt(b0, c0), PB = pt(b0 + 1, c0), PC = pt(b0, c0 + 1);
        const eBx = PB[0] - O[0], eBy = PB[1] - O[1], eCx = PC[0] - O[0], eCy = PC[1] - O[1];
        const nb = b1 - b0, nc = c1 - c0;
        const k = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2] - 0.62) * 0.75 * shade;
        // Body (also what shows through the gaps).
        c.fillStyle = fillOf(6, surface ? k * 0.6 - 0.05 : k * 0.6 - 0.18);
        c.beginPath();
        c.moveTo(O[0], O[1]);
        c.lineTo(O[0] + eBx * nb, O[1] + eBy * nb);
        c.lineTo(O[0] + eBx * nb + eCx * nc, O[1] + eBy * nb + eCy * nc);
        c.lineTo(O[0] + eCx * nc, O[1] + eCy * nc);
        c.closePath();
        c.fill();
        if (!surface) continue;
        const co = [0, 0, 0];
        co[A] = s > 0 ? N - 1 : 0;
        const g = gap, g1 = 1 - gap;
        for (let bi = 0; bi < nb; bi++) {
          for (let ci = 0; ci < nc; ci++) {
            co[B] = b0 + bi; co[Cx] = c0 + ci;
            const col = cub[co[0] + co[1] * N + co[2] * N * N][f];
            if (col < 0) continue;
            const ax = O[0] + eBx * bi + eCx * ci, ay = O[1] + eBy * bi + eCy * ci;
            c.fillStyle = fillOf(col, k);
            c.beginPath();
            c.moveTo(ax + eBx * g + eCx * g, ay + eBy * g + eCy * g);
            c.lineTo(ax + eBx * g1 + eCx * g, ay + eBy * g1 + eCy * g);
            c.lineTo(ax + eBx * g1 + eCx * g1, ay + eBy * g1 + eCy * g1);
            c.lineTo(ax + eBx * g + eCx * g1, ay + eBy * g + eCy * g1);
            c.closePath();
            c.fill();
          }
        }
      }
    }

    const hexPath = (c, x, y, r) => {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      c.closePath();
    };

    function drawCube(c, cube) {
      const gap = P.gap * 0.5, shade = P.shading;
      const sc = R / N;
      const a = cube.anim;
      let lift = 0;
      if (a) lift = Math.sin(Math.PI * Math.min(1, a.t)) * R * 0.07 * a.lift;
      // Soft contact shadow; it widens a touch as the cube lifts.
      c.fillStyle = hexA(bodyHex, 0.09);
      hexPath(c, cube.x + R * 0.04, cube.y + R * 0.09, R * (1 + lift / R * 0.4));
      c.fill();
      const cx = cube.x, cy = cube.y - lift;
      if (!a) { drawSlab(c, cube, cx, cy, sc, 2, 0, N, 0, gap, shade); return; }
      const ang = easeTwist(Math.min(1, a.t)) * a.q * Math.PI / 2;
      // Slabs from far to near along the twist axis (the viewer sits on the + side of every axis).
      if (a.layer > 0) drawSlab(c, cube, cx, cy, sc, a.axis, 0, a.layer, 0, gap, shade);
      drawSlab(c, cube, cx, cy, sc, a.axis, a.layer, a.layer + 1, ang, gap, shade);
      if (a.layer < N - 1) drawSlab(c, cube, cx, cy, sc, a.axis, a.layer + 1, N, 0, gap, shade);
    }

    function renderAll() {
      const w = Math.max(1, Math.round(W * DPR)), h = Math.max(1, Math.round(H * DPR));
      if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
      bc.setTransform(DPR, 0, 0, DPR, 0, 0);
      bc.fillStyle = ctx.palette.bg;
      bc.fillRect(0, 0, W, H);
      for (const cube of cubes) if (!cube.anim) drawCube(bc, cube);
      fullDirty = false;
      dirty.clear();
    }

    function renderCell(cube) {
      bc.setTransform(DPR, 0, 0, DPR, 0, 0);
      bc.fillStyle = ctx.palette.bg;
      hexPath(bc, cube.x, cube.y, D / Math.sqrt(3) + 0.75);
      bc.fill();
      if (!cube.anim) drawCube(bc, cube);
    }

    // ---------- twisting ----------
    // Turn a motion direction into a twist: sideways spins a horizontal layer, up/down on the
    // left half rolls about x, on the right half about y, always following the hand.
    function twistFromMotion(mx, my, side) {
      if (Math.abs(mx) > Math.abs(my) * 1.15) return { axis: 2, q: mx > 0 ? -1 : 1 };
      if (side < 0) return { axis: 0, q: my < 0 ? 1 : -1 };
      return { axis: 1, q: my < 0 ? -1 : 1 };
    }
    function layerUnder(cube, px, py, axis) {
      const lx = (px - cube.x) / R, ly = (py - cube.y) / R;
      let frac;
      if (axis === 2) frac = 1 - (ly + 1) / 2;
      else if (axis === 0) frac = (lx + C30) / C30;
      else frac = 1 - lx / C30;
      return Math.max(0, Math.min(N - 1, Math.floor(frac * N)));
    }
    function queue(cube, at, move) {
      if (cube.queue.length >= 3) return;
      cube.queue.push({ at, ...move });
    }
    function start(cube, mv, now) {
      cube.anim = { axis: mv.axis, layer: mv.layer, q: mv.q, t: 0, dur: mv.dur, lift: mv.lift ?? 1, undo: !!mv.undo };
      cube.last = now;
      dirty.add(cube);
    }
    function finish(cube, now) {
      const a = cube.anim;
      cube.cub = applyTwist(cube.cub, N, a.axis, a.layer, a.q);
      if (a.undo) cube.extra.pop();
      else cube.extra.push({ axis: a.axis, layer: a.layer, q: a.q });
      cube.anim = null;
      cube.last = now;
      dirty.add(cube);
    }

    function cubeAt(px, py) {
      const { ox, oy, rowH, map } = lattice;
      const r0 = Math.round((py - oy) / rowH);
      let best = null, bd = Infinity;
      for (let r = r0 - 1; r <= r0 + 1; r++) {
        const q0 = Math.round((px - ox + D / 4 - (r % 2 ? D / 2 : 0)) / D);
        for (let q = q0 - 1; q <= q0 + 1; q++) {
          const i = map.get(r * 1000 + q);
          if (i === undefined) continue;
          const cb = cubes[i];
          const d = Math.hypot(cb.x - px, cb.y - py);
          if (d < bd) { bd = d; best = cb; }
        }
      }
      return best && bd < R * 1.05 ? best : null;
    }

    let hovered = null, lastPX = 0, lastPY = 0, trigX = 0, trigY = 0;

    const stage = createP5Stage(ctx, {
      setup() {},
      draw(p, t, dt) {
        const c = p.drawingContext;
        const pal = ctx.palette;
        if (pal.bg + pal.ink + pal.c1 + pal.c2 + pal.c3 + pal.c4 !== palSig) { buildColours(); fullDirty = true; }
        if (!cubes.length) build();
        const speed = P.speed;
        const mouse = ctx.state.motion.mouse;
        const ptr = ctx.pointer;
        const px = ptr.x * W, py = ptr.y * H;

        // Hover: the cube under the cursor twists the way you move; neighbours echo it, weaker.
        if (ptr.inside && mouse > 0) {
          const cb = cubeAt(px, py);
          const mx = px - lastPX, my = py - lastPY;
          const moved = Math.hypot(px - trigX, py - trigY);
          if (cb && !cb.anim && !cb.queue.length && (cb !== hovered || moved > R * 0.45)) {
            const still = Math.hypot(mx, my) < 0.3;
            const tw = still
              ? { axis: Math.floor(Math.random() * 3), q: Math.random() < 0.5 ? 1 : -1 }
              : twistFromMotion(mx, my, px < cb.x ? -1 : 1);
            const dur = 0.5 / (speed * (0.75 + 0.25 * Math.min(2, mouse)));
            queue(cb, t, { ...tw, layer: layerUnder(cb, px, py, tw.axis), dur, lift: 1.3 });
            const echo = Math.min(1, 0.45 * mouse);
            for (const nb of cb.nb) {
              if (Math.random() < echo) {
                queue(nb, t + 0.1 + Math.random() * 0.18, { ...tw, layer: Math.floor(Math.random() * N), dur: dur * 1.25, lift: 0.6 });
              }
            }
            trigX = px; trigY = py;
          }
          if (cb !== hovered) { trigX = px; trigY = py; }
          hovered = cb;
        } else hovered = null;
        lastPX = px; lastPY = py;

        // Click: a ring of twists rolls outward from the click.
        if (ptr.justPressed && ptr.inside) {
          const vel = 620 * (W / 600) * Math.min(2, Math.max(0.5, speed));
          waves.push({ x: px, y: py, t0: t, vel });
          for (const cb of cubes) {
            const dx = cb.x - px, dy = cb.y - py;
            const dist = Math.hypot(dx, dy);
            const tw = twistFromMotion(dx, dy, dx < 0 ? -1 : 1);
            const ring = Math.floor(dist / D);
            cb.queue.length = 0;
            queue(cb, t + dist / vel, { ...tw, layer: ring % N, dur: 0.55 / speed, lift: 2.4 });
          }
        }

        // Idle: now and then a random cube makes a move.
        const rate = P.idle * cubes.length * 0.012;
        if (rate > 0 && Math.random() < rate * dt) {
          const cb = cubes[Math.floor(Math.random() * cubes.length)];
          if (!cb.anim && !cb.queue.length) {
            queue(cb, t, { axis: Math.floor(Math.random() * 3), layer: Math.floor(Math.random() * N), q: Math.random() < 0.5 ? 1 : -1, dur: 0.7 / speed, lift: 0.8 });
          }
        }

        // Advance animations, start queued twists, and let disturbed cubes rewind.
        for (const cb of cubes) {
          if (cb.anim) {
            cb.anim.t += dt / cb.anim.dur;
            if (cb.anim.t >= 1) finish(cb, t);
          }
          if (!cb.anim && cb.queue.length && cb.queue[0].at <= t) start(cb, cb.queue.shift(), t);
          if (!cb.anim && !cb.queue.length && cb.extra.length && t - cb.last > cb.heal && cb !== hovered) {
            const m = cb.extra[cb.extra.length - 1];
            start(cb, { axis: m.axis, layer: m.layer, q: -m.q, dur: 0.85 / speed, lift: 0.5, undo: true }, t);
            cb.heal = 0.35 + Math.random() * 0.6; // once rewinding, keep going at a steady pace
          }
          if (!cb.extra.length && !cb.anim && cb.heal < 1) cb.heal = 2.2 + Math.random() * 3;
        }

        // Buffer: full redraw when needed, otherwise only the cells that changed.
        if (fullDirty) renderAll();
        else if (dirty.size) { for (const cb of dirty) renderCell(cb); dirty.clear(); }

        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(buf, 0, 0, c.canvas.width, c.canvas.height);
        c.restore();

        // Moving cubes, live, lower ones last so they overlap correctly.
        c.save();
        const live = cubes.filter((cb) => cb.anim);
        live.sort((a, b) => a.y - b.y);
        for (const cb of live) drawCube(c, cb);

        // Wave rings.
        for (let i = waves.length - 1; i >= 0; i--) {
          const wv = waves[i];
          const age = t - wv.t0;
          const rad = age * wv.vel;
          if (rad > Math.hypot(W, H)) { waves.splice(i, 1); continue; }
          const a = Math.max(0, 0.35 - age * 0.18);
          if (a <= 0) continue;
          c.strokeStyle = hexA(bodyHex, a);
          c.lineWidth = Math.max(1, D * 0.02);
          c.beginPath();
          c.arc(wv.x, wv.y, rad, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();

        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return {
      resize(w, h, dpr) {
        const changed = w !== W || h !== H;
        W = w; H = h; DPR = dpr;
        stage.resize(w, h, dpr);
        if (changed || !cubes.length) build();
        fullDirty = true;
      },
      frame: stage.frame,
      onParam(key) {
        if (key === 'palette') buildColours();
        if (key === 'palette' || key === 'gap' || key === 'shading') fullDirty = true;
      },
      dispose() {
        stage.dispose();
        buf.width = buf.height = 0;
      },
    };
  },
};
