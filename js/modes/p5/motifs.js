// Motif Mosaic: the picture rebuilt from a grid of graphic motifs (discs, rings, squares,
// quarter circles, stripes, dot clusters, crosses). Each cell's colour is snapped to the
// palette (or kept from the photo) and its motif follows its tone and colour (refs 10, 32).
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain } from '../../shared/bloom2d.js';

// Motif ids.
const DISC = 0, RING = 1, SQUARE = 2, QUARTER = 3, STRIPES = 4, DOTS = 5, CROSS = 6, TARGET = 7, HALF = 8;
const ALL = [DISC, RING, SQUARE, QUARTER, STRIPES, DOTS, CROSS, TARGET, HALF];
// Pop mosaic: which motifs suit dark, mid and light cells.
const BANDS = [
  [SQUARE, DISC, HALF, QUARTER],
  [STRIPES, CROSS, TARGET, DOTS, RING],
  [DISC, RING, DOTS, CROSS],
];
// Grid study: a calmer set, one per block.
const STUDY = [DISC, SQUARE, STRIPES, DOTS, HALF, TARGET, DISC, SQUARE, STRIPES];

function hash(a, b, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mixHex = (a, b, k) => {
  const A = rgbOf(a), B = rgbOf(b);
  return `rgb(${Math.round((A[0] + (B[0] - A[0]) * k) * 255)},${Math.round((A[1] + (B[1] - A[1]) * k) * 255)},${Math.round((A[2] + (B[2] - A[2]) * k) * 255)})`;
};

// Draws one motif centred on the origin, half-size h. A = main colour, B = second colour, G = ground.
function drawMotif(c, kind, h, A, B, G) {
  const TAU = Math.PI * 2;
  c.fillStyle = A;
  c.beginPath();
  switch (kind) {
    case DISC:
      c.arc(0, 0, h, 0, TAU); c.fill();
      break;
    case RING:
      c.arc(0, 0, h, 0, TAU); c.moveTo(h * 0.52, 0); c.arc(0, 0, h * 0.52, 0, TAU, true); c.fill();
      c.fillStyle = B; c.beginPath(); c.arc(0, 0, h * 0.24, 0, TAU); c.fill();
      break;
    case SQUARE:
      c.rect(-h, -h, h * 2, h * 2); c.fill();
      break;
    case QUARTER:
      c.moveTo(-h, -h); c.arc(-h, -h, h * 2, 0, Math.PI / 2); c.closePath(); c.fill();
      c.fillStyle = B; c.beginPath(); c.moveTo(h, h); c.arc(h, h, h * 0.7, Math.PI, Math.PI * 1.5); c.closePath(); c.fill();
      break;
    case STRIPES: {
      const w = (h * 2) / 7;
      for (let k = 0; k < 4; k++) c.rect(-h + k * w * 2, -h, w, h * 2);
      c.fill();
      break;
    }
    case DOTS: {
      const n = h > 9 ? 3 : 2;
      const st = (h * 2) / n, r = st * 0.36;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const x = -h + st * (a + 0.5), y = -h + st * (b + 0.5);
        c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
      }
      c.fill();
      break;
    }
    case CROSS: {
      c.fillStyle = B; c.arc(0, 0, h, 0, TAU); c.fill();
      const w = h * 0.36;
      c.fillStyle = A; c.beginPath();
      c.rect(-h * 0.82, -w / 2, h * 1.64, w); c.rect(-w / 2, -h * 0.82, w, h * 1.64);
      c.fill();
      break;
    }
    case TARGET:
      c.arc(0, 0, h, 0, TAU); c.fill();
      c.fillStyle = B; c.beginPath(); c.arc(0, 0, h * 0.46, 0, TAU); c.fill();
      break;
    case HALF:
      c.rect(-h, -h, h * 2, h * 2); c.fill();
      c.fillStyle = G; c.beginPath(); c.arc(0, h, h * 0.92, Math.PI, TAU); c.closePath(); c.fill();
      c.fillStyle = B; c.beginPath(); c.arc(0, h, h * 0.5, Math.PI, TAU); c.closePath(); c.fill();
      break;
    default: break;
  }
}

export default {
  id: 'motifs',
  name: 'Motif Mosaic',
  engine: 'p5',
  medium: 'image',
  hint: 'Hover to swell and turn the motifs · click to ripple them',
  params: {
    cells:    { value: 26, min: 8, max: 52, step: 1, label: 'Cells across' },
    style:    { value: 'Pop mosaic', options: ['Pop mosaic', 'Grid study'], label: 'Style' },
    variety:  { value: 0.45, min: 0, max: 1, step: 0.01, label: 'Motif variety' },
    colorMap: { value: 'Palette', options: ['Palette', 'Photo'], label: 'Colour mapping' },
    gap:      { value: 0.1, min: 0, max: 0.45, step: 0.01, label: 'Gap' },
    rotation: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'Rotation' },
    drift:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Idle motion' },
  },
  controls: {
    essentials: ['cells', 'style', 'variety', 'colorMap'],
    groups: { Shape: ['gap', 'rotation'], Motion: ['drift'] },
  },

  create(ctx) {
    const P = ctx.params;
    const seed = ctx.rand.int(1, 1e6);

    const small = document.createElement('canvas');
    const sctx = small.getContext('2d', { willReadFrequently: true });

    // Grid geometry.
    let cols = 0, rows = 0, s = 10, ox = 0, oy = 0, geoKey = '';
    // Per-cell picture data (recomputed when the source or palette changes).
    let colIdx = new Int8Array(0), lum = new Float32Array(0), photo = [];
    let mapKey = '';
    // Per-cell animation state.
    let shift = new Int16Array(0), prevShift = new Int16Array(0), flip = new Float32Array(0), inside = new Uint8Array(0);
    let rotQ = new Uint8Array(0), block = new Int16Array(0);
    let blocks = [];

    const ripples = [];
    let lastIdle = -1;
    const cur = { x: 0.5, y: 0.5, hov: 0 };

    function layout(W, H) {
      const study = P.style === 'Grid study';
      const n = Math.round(P.cells);
      let aw = W, ah = H, ax = 0, ay = 0;
      if (study) { ax = W * 0.1; ay = H * 0.08; aw = W * 0.8; ah = H * 0.78; }
      s = aw / n;
      cols = n;
      rows = study ? Math.max(1, Math.floor(ah / s)) : Math.ceil(ah / s);
      ox = ax;
      oy = study ? ay + (ah - rows * s) * 0.5 : (H - rows * s) / 2;
      const k = `${cols}x${rows}:${study}`;
      if (k === geoKey) return;
      geoKey = k; mapKey = '';
      const N = cols * rows;
      shift = new Int16Array(N); prevShift = new Int16Array(N); flip = new Float32Array(N); inside = new Uint8Array(N);
      rotQ = new Uint8Array(N); block = new Int16Array(N);
      colIdx = new Int8Array(N); lum = new Float32Array(N); photo = new Array(N);
      for (let i = 0; i < N; i++) rotQ[i] = Math.floor(hash(i, 5, seed) * 4);

      // Grid study: split the grid into rectangular blocks, each with its own motif.
      const rnd = mulberry(seed + cols * 31 + rows);
      blocks = [];
      const split = (x, y, w, h, depth) => {
        const big = w * h;
        if (depth > 6 || big <= 6 || (depth > 1 && rnd() < 0.22)) {
          const id = blocks.length;
          blocks.push({ kind: STUDY[Math.floor(rnd() * STUDY.length)], rot: rnd() < 0.5 ? 0 : 1 });
          for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) block[yy * cols + xx] = id;
          return;
        }
        const vert = w > h ? rnd() < 0.75 : rnd() < 0.25;
        if (vert && w >= 2) {
          const a = Math.max(1, Math.min(w - 1, Math.round(w * (0.25 + rnd() * 0.5))));
          split(x, y, a, h, depth + 1); split(x + a, y, w - a, h, depth + 1);
        } else if (h >= 2) {
          const a = Math.max(1, Math.min(h - 1, Math.round(h * (0.2 + rnd() * 0.6))));
          split(x, y, w, a, depth + 1); split(x, y + a, w, h - a, depth + 1);
        } else {
          split(x, y, w, h, 99);
        }
      };
      split(0, 0, cols, rows, 0);
    }

    // Read the picture (cover-fitted) and snap every cell to the palette.
    function mapColours(pal) {
      const src = ctx.source;
      const k = `${geoKey}:${src.version}:${pal.bg}${pal.ink}${pal.c1}${pal.c2}${pal.c3}${pal.c4}`;
      if (k === mapKey) return;
      mapKey = k;
      if (small.width !== cols || small.height !== rows) { small.width = cols; small.height = rows; }
      const sw0 = src.canvas.width, sh0 = src.canvas.height, ga = cols / rows;
      let sx = 0, sy = 0, sw = sw0, sh = sh0;
      if (sw0 / sh0 > ga) { sw = sh0 * ga; sx = (sw0 - sw) / 2; } else { sh = sw0 / ga; sy = (sh0 - sh) / 2; }
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(src.canvas, sx, sy, sw, sh, 0, 0, cols, rows);
      const d = sctx.getImageData(0, 0, cols, rows).data;
      const N = cols * rows;

      // Contrast stretch from a luminance histogram (2nd–98th percentile).
      const hist = new Uint32Array(64);
      for (let i = 0; i < N; i++) {
        const o = i * 4;
        hist[Math.min(63, Math.floor((0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) / 4))]++;
      }
      let acc = 0, lo = 0, hi = 63;
      for (let b = 0; b < 64; b++) { acc += hist[b]; if (acc >= N * 0.02) { lo = b; break; } }
      acc = 0;
      for (let b = 63; b >= 0; b--) { acc += hist[b]; if (acc >= N * 0.02) { hi = b; break; } }
      const L0 = lo / 64, L1 = Math.max(L0 + 0.1, (hi + 1) / 64);

      // Palette: 0 = bg, 1 = ink, 2..5 = c1..c4.
      const pc = [pal.bg, pal.ink, pal.c1, pal.c2, pal.c3, pal.c4].map(rgbOf);
      for (let i = 0; i < N; i++) {
        const o = i * 4;
        let r = (d[o] / 255 - L0) / (L1 - L0), g = (d[o + 1] / 255 - L0) / (L1 - L0), b = (d[o + 2] / 255 - L0) / (L1 - L0);
        const m = (r + g + b) / 3;
        r = m + (r - m) * 1.5; g = m + (g - m) * 1.5; b = m + (b - m) * 1.5;
        r = Math.max(0, Math.min(1, r)); g = Math.max(0, Math.min(1, g)); b = Math.max(0, Math.min(1, b));
        lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        photo[i] = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        let best = 0, bd = 1e9;
        for (let q = 0; q < 6; q++) {
          const P2 = pc[q];
          const dr = r - P2[0], dg = g - P2[1], db = b - P2[2];
          const dd = dr * dr * 2 + dg * dg * 4 + db * db * 3;
          if (dd < bd) { bd = dd; best = q; }
        }
        colIdx[i] = best;
      }
    }

    function trigger(i) {
      prevShift[i] = flip[i] > 0 ? shift[i] : prevShift[i];
      shift[i]++;
      flip[i] = 1;
    }

    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, t, dt) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const dpr = p.pixelDensity();
        const pal = ctx.palette;
        const ptr = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        dt = Math.min(0.05, dt || 0.016);

        layout(W, H);
        mapColours(pal);
        const N = cols * rows;
        const study = P.style === 'Grid study';
        const photoMode = P.colorMap === 'Photo';
        const palCols = [pal.bg, pal.ink, pal.c1, pal.c2, pal.c3, pal.c4];
        const paper = mixHex(pal.bg, pal.ink, 0.07);
        const dotTone = mixHex(pal.bg, pal.ink, 0.22);

        // Cursor.
        cur.hov += ((ptr.inside ? 1 : 0) - cur.hov) * Math.min(1, dt * 6);
        if (ptr.inside) { cur.x = ptr.x; cur.y = ptr.y; }
        const mx = cur.x * W, my = cur.y * H;
        const hover = cur.hov * mPow;
        const R = s * (2.2 + 1.6 * Math.min(1, mPow));

        // Click: a ripple that flips every motif it passes.
        if (ptr.justPressed && ptr.inside) ripples.push({ x: ptr.x * W, y: ptr.y * H, front: 0 });
        const rippleSpeed = s * 16;
        const diag = Math.hypot(W, H);

        c.save();
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = pal.bg;
        c.fillRect(0, 0, W, H);

        // Advance ripples first so each cell sees the old and new fronts.
        const rip = ripples.map((r) => { const a = r.front; r.front += rippleSpeed * dt; return [r.x, r.y, a, r.front]; });
        for (let k = ripples.length - 1; k >= 0; k--) if (ripples[k].front > diag) ripples.splice(k, 1);

        // Idle: every quarter second a few random motifs flip on their own.
        const idleEpoch = Math.floor(t * 4);
        const idleTick = idleEpoch !== lastIdle && P.drift > 0;
        lastIdle = idleEpoch;
        const idleRate = 0.003 * P.drift;
        const gapK = 1 - P.gap - (study ? 0.06 : 0);
        const late = [];

        for (let pass = 0; pass < 2; pass++) {
          const list = pass === 0 ? null : late;
          const count = pass === 0 ? N : late.length;
          for (let n = 0; n < count; n++) {
            const i = pass === 0 ? n : list[n];
            const x = i % cols, y = (i - x) / cols;
            const cx = ox + (x + 0.5) * s, cy = oy + (y + 0.5) * s;

            let fall = 0;
            if (pass === 0) {
              // Hover: enter → flip to the next motif; nearby cells swell.
              if (hover > 0.01) {
                const dd = Math.hypot(cx - mx, cy - my);
                if (dd < R) fall = Math.pow(1 - dd / R, 2) * hover;
                const isIn = ptr.inside && dd < s * 1.25 && mPow > 0 ? 1 : 0;
                if (isIn && !inside[i]) trigger(i);
                inside[i] = isIn;
              } else inside[i] = 0;
              for (let k = 0; k < rip.length; k++) {
                const dd = Math.hypot(cx - rip[k][0], cy - rip[k][1]);
                if (dd > rip[k][2] && dd <= rip[k][3]) trigger(i);
              }
              if (idleTick && hash(i, idleEpoch, seed) < idleRate) trigger(i);
              if (flip[i] > 0) { flip[i] = Math.max(0, flip[i] - dt * 3.2); if (flip[i] === 0) prevShift[i] = shift[i]; }
              if (fall > 0.02) { late.push(i); continue; }
            } else {
              const dd = Math.hypot(cx - mx, cy - my);
              fall = dd < R ? Math.pow(1 - dd / R, 2) * hover : 0;
            }

            // Colour.
            const ci = colIdx[i];
            const L = lum[i];
            const shown = flip[i] > 0.5 ? prevShift[i] : shift[i];
            const empty = ci === 0 && !photoMode;
            const bl = blocks[block[i]] || { kind: DISC, rot: 0 };

            // Motif choice.
            let kind;
            if (study) kind = bl.kind;
            else {
              const band = L < 0.36 ? 0 : L < 0.7 ? 1 : 2;
              const set = BANDS[band];
              kind = set[(ci + band) % set.length];
              const hv = hash(i, 11, seed);
              if (hv < P.variety * 0.7) kind = set[(ci + 1 + Math.floor(hash(i, 12, seed) * 7)) % set.length];
              if (hv < P.variety * 0.18) kind = ALL[Math.floor(hash(i, 13, seed) * ALL.length)];
            }
            if (shown) kind = ALL[(ALL.indexOf(kind) + shown) % ALL.length];

            let A, B;
            let reveal = 1;
            if (photoMode) { A = photo[i]; B = L > 0.55 ? pal.ink : pal.bg; }
            else if (empty) {
              if (study) {
                // Grid study: open cells are quiet paper-tone squares.
                A = paper; B = pal.bg;
                if (!shown) kind = SQUARE;
              } else {
                // Pop mosaic: open ground, where motifs only surface briefly (flip, hover).
                reveal = Math.max(flip[i] > 0 ? Math.sin((1 - flip[i]) * Math.PI) : 0, Math.min(1, fall * 1.6));
                if (reveal < 0.2) {
                  // A small pin-dot keeps the open ground woven into the grid.
                  c.setTransform(dpr, 0, 0, dpr, 0, 0);
                  c.fillStyle = dotTone;
                  c.beginPath(); c.arc(cx, cy, s * 0.09, 0, Math.PI * 2); c.fill();
                  if (reveal < 0.03) continue;
                }
                A = palCols[1 + ((x + y + shift[i]) % 5)];
                B = pal.bg;
              }
            } else {
              A = palCols[ci];
              B = palCols[2 + ((ci + 1 + (hash(i, 21, seed) < 0.5 ? 1 : 0)) % 4)];
              if (B === A) B = pal.bg;
              if (hash(i, 22, seed) < 0.45) B = pal.bg;
            }

            // Transform: swell + turn under the cursor, card-flip when changing, gentle breath.
            const breath = 1 + 0.05 * P.drift * Math.sin(t * 1.1 - (x * 0.35 + y * 0.22));
            const fp = 1 - flip[i];
            const sx = reveal < 1 ? 1 : flip[i] > 0 ? Math.max(0.04, Math.abs(Math.cos(fp * Math.PI))) : 1;
            const sc = breath * (1 + 0.6 * fall) * reveal;
            const quarter = study ? bl.rot + (hash(i, 31, seed) < P.rotation * 0.3 ? rotQ[i] : 0)
              : (hash(i, 32, seed) < P.rotation ? rotQ[i] : 0);
            const ang = quarter * Math.PI / 2 + fall * Math.PI * 0.5 * (0.4 + P.rotation)
              + (flip[i] > 0 ? (1 - flip[i]) * P.rotation * Math.PI * 0.5 : 0);
            const co = Math.cos(ang), si = Math.sin(ang);
            c.setTransform(dpr * co * sx * sc, dpr * si * sx * sc, -dpr * si * sc, dpr * co * sc, dpr * cx, dpr * cy);
            drawMotif(c, kind, s * 0.5 * gapK, A, B, pal.bg);
          }
        }
        c.restore();

        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return {
      resize: stage.resize,
      frame: stage.frame,
      dispose: stage.dispose,
      onParam(k) { if (k === 'source' || k === 'palette') mapKey = ''; },
    };
  },
};
