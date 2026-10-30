// Rect Split: the picture broken into flat-colour rectangles, big where it's calm and tiny
// where it's busy (ref 33). An adaptive KD / quad tree splits a cell while its colour
// variance (read in O(1) from summed-area tables) is above a threshold. Splits open and
// close with a soft colour cross-fade; a slow wave nudges the threshold so the wall breathes,
// the cursor is a detail lens, and a click re-splits the picture outward from that point.
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain, hexA } from '../../shared/bloom2d.js';

const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumOf = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

function coverRect(sw, sh, W, H) {
  const sa = sw / sh, da = W / H;
  if (sa > da) { const w = sh * da; return [(sw - w) / 2, 0, w, sh]; }
  const h = sw / da;
  return [0, (sh - h) / 2, sw, h];
}

export default {
  id: 'subdivide',
  name: 'Rect Split',
  engine: 'p5',
  medium: 'image',
  hint: 'Hover for a detail lens · click to re-split from that point',
  params: {
    detail:   { value: 0.62, min: 0, max: 1, step: 0.01, label: 'Detail' },
    minSize:  { value: 4, min: 2, max: 40, step: 1, label: 'Min cell size' },
    maxDepth: { value: 13, min: 3, max: 18, step: 1, label: 'Max depth' },
    style:    { value: 'Binary', options: ['Binary', 'Quad'], label: 'Split style' },
    colour:   { value: 'Flat', options: ['Flat', 'Photo', 'Palette'], label: 'Colour' },
    outline:  { value: 0.6, min: 0, max: 2.5, step: 0.05, label: 'Outline' },
    bias:     { value: 0.35, min: -1, max: 1, step: 0.01, label: 'Tall ↔ wide bias' },
    lens:     { value: 0.18, min: 0.05, max: 0.5, step: 0.01, label: 'Lens size' },
    breathe:  { value: 0.35, min: 0, max: 1, step: 0.01, label: 'Breathe' },
  },
  controls: {
    essentials: ['detail', 'minSize', 'style', 'colour'],
    groups: { Structure: ['maxDepth', 'bias'], Look: ['outline'], Motion: ['lens', 'breathe'] },
  },

  create(ctx) {
    const P = ctx.params;
    const R = ctx.rand;
    const src = ctx.source;

    // ---------- Summed-area tables of the cover-cropped picture ----------
    const smp = document.createElement('canvas');
    const sctx = smp.getContext('2d', { willReadFrequently: true });
    let GC = 0, GR = 0, S = 0;
    let SR = null, SG = null, SB = null, SQ = null;
    let statVer = 0, anVer = -1, anW = 0, anH = 0, anAt = 0;
    let lumLo = 0, lumHi = 1;

    function analyse(W, H) {
      const cols = Math.max(16, Math.min(300, Math.round(W / 2)));
      const rows = Math.max(16, Math.round(cols * H / W));
      const resized = cols !== GC || rows !== GR;
      GC = cols; GR = rows; S = cols + 1;
      if (smp.width !== cols || smp.height !== rows) { smp.width = cols; smp.height = rows; }
      const [sx, sy, sw, sh] = coverRect(src.width, src.height, W, H);
      sctx.drawImage(src.canvas, sx, sy, sw, sh, 0, 0, cols, rows);
      const d = sctx.getImageData(0, 0, cols, rows).data;
      const n = S * (rows + 1);
      if (!SR || SR.length !== n) { SR = new Float64Array(n); SG = new Float64Array(n); SB = new Float64Array(n); SQ = new Float64Array(n); }
      const hist = new Uint32Array(64);
      for (let y = 0; y < rows; y++) {
        let rr = 0, rg = 0, rb = 0, rq = 0;
        for (let x = 0; x < cols; x++) {
          const o = (y * cols + x) * 4;
          const r = d[o], g = d[o + 1], b = d[o + 2];
          rr += r; rg += g; rb += b; rq += r * r + g * g + b * b;
          const k = (y + 1) * S + x + 1, up = y * S + x + 1;
          SR[k] = SR[up] + rr; SG[k] = SG[up] + rg; SB[k] = SB[up] + rb; SQ[k] = SQ[up] + rq;
          hist[Math.min(63, (lumOf(r, g, b) * 64) | 0)]++;
        }
      }
      // Tonal range (2nd–98th percentile), so palette mode uses every colour.
      const tot = cols * rows;
      let acc = 0; lumLo = 0; lumHi = 1;
      for (let i = 0; i < 64; i++) { acc += hist[i]; if (acc > tot * 0.02) { lumLo = i / 64; break; } }
      acc = 0;
      for (let i = 63; i >= 0; i--) { acc += hist[i]; if (acc > tot * 0.02) { lumHi = (i + 1) / 64; break; } }
      if (lumHi - lumLo < 0.1) { lumLo = Math.max(0, lumLo - 0.05); lumHi = Math.min(1, lumHi + 0.05); }
      statVer++;
      return resized;
    }

    const box = (A, x0, y0, x1, y1) => A[y1 * S + x1] - A[y0 * S + x1] - A[y1 * S + x0] + A[y0 * S + x0];
    // Sum of squared deviations from the mean colour (all three channels).
    function sse(x0, y0, x1, y1) {
      const n = (x1 - x0) * (y1 - y0);
      if (n <= 0) return 0;
      const r = box(SR, x0, y0, x1, y1), g = box(SG, x0, y0, x1, y1), b = box(SB, x0, y0, x1, y1);
      return Math.max(0, box(SQ, x0, y0, x1, y1) - (r * r + g * g + b * b) / n);
    }
    function stats(nd) {
      const n = (nd.x1 - nd.x0) * (nd.y1 - nd.y0);
      nd.r = box(SR, nd.x0, nd.y0, nd.x1, nd.y1) / n;
      nd.g = box(SG, nd.x0, nd.y0, nd.x1, nd.y1) / n;
      nd.b = box(SB, nd.x0, nd.y0, nd.x1, nd.y1) / n;
      nd.sse = sse(nd.x0, nd.y0, nd.x1, nd.y1);
      nd.std = Math.sqrt(nd.sse / (n * 3));
      nd.ver = statVer;
    }

    // ---------- The tree ----------
    let root = null;
    let jitter = 0.5, ratio = 0.5, clickBias = 0;    // re-rolled on click
    let cascade = { t0: 0, x: 0.5, y: 0.5 };
    let clock = 0, aspect = 1;

    const mk = (x0, y0, x1, y1, depth) => ({
      x0, y0, x1, y1, depth, kids: null, t: 0, ver: -1, r: 0, g: 0, b: 0, sse: 0, std: 0,
      cx: (x0 + x1) / 2 / GC, cy: (y0 + y1) / 2 / GR, rnd: R(),
    });
    function newTree(x, y) {
      root = mk(0, 0, GC, GR, 0);
      cascade = { t0: clock, x, y };
    }

    // Best cut along one axis among a few jittered candidates (least leftover variance).
    function bestCut(nd, vertical, minG) {
      const a0 = vertical ? nd.x0 : nd.y0, a1 = vertical ? nd.x1 : nd.y1;
      const span = a1 - a0;
      const lo = a0 + Math.max(1, Math.ceil(minG)), hi = a1 - Math.max(1, Math.ceil(minG));
      if (hi < lo) return null;
      let best = null, bc = Infinity;
      const K = 7;
      for (let k = 0; k < K; k++) {
        const f = 0.18 + 0.64 * (k + 0.5 + (R() - 0.5) * jitter) / K;
        const pos = Math.min(hi, Math.max(lo, Math.round(a0 + span * f)));
        const cost = vertical
          ? sse(nd.x0, nd.y0, pos, nd.y1) + sse(pos, nd.y0, nd.x1, nd.y1)
          : sse(nd.x0, nd.y0, nd.x1, pos) + sse(nd.x0, pos, nd.x1, nd.y1);
        if (cost < bc) { bc = cost; best = pos; }
      }
      return best === null ? null : { pos: best, cost: bc };
    }

    function split(nd, minG) {
      const w = nd.x1 - nd.x0, h = nd.y1 - nd.y0;
      const canV = w >= 2 * Math.max(1, minG), canH = h >= 2 * Math.max(1, minG);
      if (!canV && !canH) return null;
      if (P.style === 'Quad' && canV && canH) {
        const jx = ratio + (nd.rnd - 0.5) * 0.3 * jitter, jy = ratio + (((nd.rnd * 7.31) % 1) - 0.5) * 0.3 * jitter;
        const xm = Math.min(nd.x1 - 1, Math.max(nd.x0 + 1, Math.round(nd.x0 + w * jx)));
        const ym = Math.min(nd.y1 - 1, Math.max(nd.y0 + 1, Math.round(nd.y0 + h * jy)));
        const d = nd.depth + 1;
        return [mk(nd.x0, nd.y0, xm, ym, d), mk(xm, nd.y0, nd.x1, ym, d), mk(nd.x0, ym, xm, nd.y1, d), mk(xm, ym, nd.x1, nd.y1, d)];
      }
      const b = Math.max(-1, Math.min(1, P.bias + clickBias));
      const v = canV ? bestCut(nd, true, minG) : null;
      const hz = canH ? bestCut(nd, false, minG) : null;
      if (!v && !hz) return null;
      // Bias: vertical cuts make tall cells, horizontal cuts make wide ones. Keep shapes sane.
      const aspectPx = (w / GC * aspect) / (h / GR);
      let vc = v ? v.cost * (1 - 0.35 * b) * (aspectPx < 0.2 ? 1.5 : 1) : Infinity;
      let hc = hz ? hz.cost * (1 + 0.35 * b) * (aspectPx > 5 ? 1.5 : 1) : Infinity;
      if (nd.sse < 1) { vc = w * aspect / GC >= h / GR ? 0 : 1; hc = 1 - vc; }
      const d = nd.depth + 1;
      if (v && (vc <= hc || !hz)) return [mk(nd.x0, nd.y0, v.pos, nd.y1, d), mk(v.pos, nd.y0, nd.x1, nd.y1, d)];
      return [mk(nd.x0, nd.y0, nd.x1, hz.pos, d), mk(nd.x0, hz.pos, nd.x1, nd.y1, d)];
    }

    // ---------- Per-frame traversal: decide, animate, collect leaves ----------
    let leaves = [];   // flat list: x0, y0, x1, y1, r, g, b, edgeAlpha
    let changed = true;
    let frameInfo = null;

    function visit(nd, cr, cg, cb, edgeA) {
      const F = frameInfo;
      // Local threshold: global detail, a slow breathing wave, and the cursor lens.
      const dx = (nd.cx - F.px) * aspect, dy = nd.cy - F.py;
      const L = F.lens > 0 ? F.lens * Math.exp(-(dx * dx + dy * dy) / F.lr2) : 0;
      const br = F.breathe > 0
        ? 1 + F.breathe * 0.45 * Math.sin(F.ph + nd.cx * 4.1 + nd.cy * 2.7 + Math.sin(F.ph * 0.47 + nd.cy * 5.3))
        : 1;
      const thr = F.thr * br * (1 - 0.85 * Math.min(1, L));
      const minG = Math.max(1, F.minG * (1 - 0.65 * Math.min(1, L)));
      const maxD = F.maxD + Math.round(5 * Math.min(1, L));
      // Cascade: after a (re)split, cells may open only once the wave from the click reaches them.
      const cdx = (nd.cx - cascade.x) * aspect, cdy = nd.cy - cascade.y;
      const open = clock - cascade.t0 > Math.sqrt(cdx * cdx + cdy * cdy) * 1.1 + nd.depth * 0.035;
      const want = open && nd.depth < maxD && nd.std > thr && Math.max(nd.x1 - nd.x0, nd.y1 - nd.y0) >= 2 * minG;
      if (want && !nd.kids) {
        nd.kids = split(nd, minG);
        if (nd.kids) for (const k of nd.kids) stats(k);
      }
      const target = want && nd.kids ? 1 : 0;
      if (nd.t !== target) {
        nd.t += (target - nd.t) * F.k;
        if (Math.abs(target - nd.t) < 0.004) nd.t = target;
        changed = true;
      }
      if (nd.kids && nd.t > 0) {
        for (const k of nd.kids) {
          if (k.ver !== statVer) stats(k);
          visit(k, cr + (k.r - cr) * nd.t, cg + (k.g - cg) * nd.t, cb + (k.b - cb) * nd.t, nd.t);
        }
      } else {
        leaves.push(nd.x0, nd.y0, nd.x1, nd.y1, cr, cg, cb, edgeA);
      }
    }

    // ---------- Rendering (cached when nothing moves) ----------
    const cache = document.createElement('canvas');
    const cc = cache.getContext('2d');
    let palKey = '', ramp = [];

    function render(c, W, H, pal) {
      const sxk = W / GC, syk = H / GR;
      const mode = P.colour;
      c.save();
      c.fillStyle = pal.bg;
      c.fillRect(0, 0, W, H);
      let cut = 0;
      if (mode === 'Photo') {
        const [sx, sy, sw, sh] = coverRect(src.width, src.height, W, H);
        c.imageSmoothingEnabled = true;
        c.drawImage(src.canvas, sx, sy, sw, sh, 0, 0, W, H);
        cut = Math.max(10, P.minSize * 2.5);   // cells smaller than this keep the photo
      }
      const span = Math.max(0.05, lumHi - lumLo);
      for (let i = 0; i < leaves.length; i += 8) {
        const x0 = leaves[i] * sxk, y0 = leaves[i + 1] * syk, x1 = leaves[i + 2] * sxk, y1 = leaves[i + 3] * syk;
        if (cut && Math.min(x1 - x0, y1 - y0) < cut) continue;
        const r = leaves[i + 4], g = leaves[i + 5], b = leaves[i + 6];
        if (mode === 'Palette') {
          const v = Math.min(0.999, Math.max(0, (lumOf(r, g, b) - lumLo) / span));
          c.fillStyle = ramp[(v * ramp.length) | 0];
        } else c.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        // Slight overlap hides anti-aliasing seams between neighbours.
        c.fillRect(x0 - 0.35, y0 - 0.35, x1 - x0 + 0.7, y1 - y0 + 0.7);
      }
      if (P.outline > 0) {
        c.lineWidth = P.outline;
        // Bucket by edge alpha so freshly opened splits draw in faintly.
        for (const [lo, hi, a] of [[0.98, 2, 0.55], [0.6, 0.98, 0.38], [0.25, 0.6, 0.2], [0.02, 0.25, 0.08]]) {
          c.beginPath();
          let any = false;
          for (let i = 0; i < leaves.length; i += 8) {
            const e = leaves[i + 7];
            if (e < lo || e >= hi) continue;
            const x0 = leaves[i] * sxk, y0 = leaves[i + 1] * syk;
            c.rect(x0, y0, (leaves[i + 2] - leaves[i]) * sxk, (leaves[i + 3] - leaves[i + 1]) * syk);
            any = true;
          }
          if (any) { c.strokeStyle = hexA(pal.ink, a); c.stroke(); }
        }
      }
      c.restore();
    }

    let cacheOk = false, renderedVer = -1;
    let lastPtr = { x: -1, y: -1, on: 0 };

    const stage = createP5Stage(ctx, {
      draw(p, t, dt) {
        const W = p.width, H = p.height, d = p.pixelDensity(), c = p.drawingContext;
        const pal = ctx.palette;
        const ptr = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        clock += dt;
        aspect = W / H;

        // Picture changes: rebuild the tree for new images, refresh colours for webcam.
        const now = performance.now();
        if (src.version !== anVer || W !== anW || H !== anH || !root) {
          const sizeChange = W !== anW || H !== anH;
          if (src.kind !== 'webcam' || now - anAt > 60 || !root || sizeChange) {
            const gridChanged = analyse(W, H);
            if (!root || gridChanged || sizeChange || src.kind !== 'webcam') newTree(0.5, 0.5);
            anVer = src.version; anW = W; anH = H; anAt = now;
            cacheOk = false;
          }
        }
        const key = pal.bg + pal.ink + pal.c1 + pal.c2 + pal.c3 + pal.c4;
        if (key !== palKey) {
          palKey = key;
          ramp = [pal.bg, pal.ink, pal.c1, pal.c2, pal.c3, pal.c4]
            .map((h) => [h, lumOf(...rgbOf(h))])
            .sort((a, b) => a[1] - b[1])
            .map((a) => a[0]);
          cacheOk = false;
        }

        if (ptr.justPressed) {
          ratio = R.range(0.32, 0.68);
          jitter = R.range(0.3, 1);
          clickBias = R.range(-0.5, 0.5);
          newTree(ptr.x, ptr.y);
        }

        // Threshold: Detail 0 → only huge calm cells, 1 → almost every texture splits.
        const lens = ptr.inside ? Math.min(1.6, mPow) : 0;
        frameInfo = {
          thr: 4 + 56 * Math.pow(1 - P.detail, 1.6),
          minG: P.minSize * GC / W,
          maxD: P.maxDepth,
          lens,
          lr2: P.lens * P.lens * (0.6 + 0.4 * Math.min(1.5, lens)),
          px: ptr.x, py: ptr.y,
          breathe: P.breathe,
          ph: clock * 0.5,
          k: dt > 0 ? 1 - Math.exp(-dt * 7) : 0,
        };
        changed = false;
        leaves.length = 0;
        if (root.ver !== statVer) stats(root);
        visit(root, root.r, root.g, root.b, 1);

        // Redraw the cache only if something moved.
        const bw = Math.round(W * d), bh = Math.round(H * d);
        if (cache.width !== bw || cache.height !== bh) { cache.width = bw; cache.height = bh; cacheOk = false; }
        if (changed || !cacheOk || renderedVer !== statVer) {
          renderedVer = statVer;
          cc.setTransform(d, 0, 0, d, 0, 0);
          render(cc, W, H, pal);
          cacheOk = true;
        }
        c.save();
        c.drawImage(cache, 0, 0, W, H);
        // A hairline ring marks the lens while hovering.
        const on = lens > 0 ? 1 : 0;
        lastPtr.on += (on - lastPtr.on) * Math.min(1, dt * 6 || 0);
        if (lastPtr.on > 0.02) {
          c.strokeStyle = hexA(pal.ink, 0.22 * lastPtr.on);
          c.lineWidth = 1;
          c.setLineDash([3, 4]);
          c.beginPath();
          c.arc(ptr.x * W, ptr.y * H, P.lens * H * 0.9, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();
        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return {
      resize: stage.resize,
      frame: stage.frame,
      dispose() { stage.dispose(); cache.width = cache.height = 0; smp.width = smp.height = 0; },
      onParam(key) {
        cacheOk = false;
        if (key === 'style' || key === 'bias') newTree(0.5, 0.5);
        if (key === 'source' && src.kind !== 'webcam') anVer = -1;
      },
    };
  },
};
