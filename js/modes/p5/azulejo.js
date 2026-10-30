// Tile Mosaic: a picture hidden in a wall of glazed ornamental tiles (ref 36).
// Each square tile shows its piece of the picture tinted toward the palette (blue-and-white
// azulejo style), or, where the picture is darkest, a procedural ornament (Truchet arcs,
// florets, scrolls, stars) whose density follows the tone so the image still reads.
// Both faces of every tile are pre-painted into two wall canvases; a frame is one blit plus
// the few tiles that are mid-flip. Hover flips tiles over; a click re-deals the ornaments in
// a wave of flips from the click point.
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain, hexA } from '../../shared/bloom2d.js';

const STYLES = ['Arcs', 'Florets', 'Scrolls', 'Stars'];

const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumOf = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const mixHex = (a, b, t) => {
  const A = rgbOf(a), B = rgbOf(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
};
const ease = (x) => x * x * (3 - 2 * x);

function coverRect(sw, sh, W, H) {
  const sa = sw / sh, da = W / H;
  if (sa > da) { const w = sh * da; return [(sw - w) / 2, 0, w, sh]; }
  const h = sw / da;
  return [0, (sh - h) / 2, sw, h];
}

// Small deterministic generator per tile, so repainting a tile gives the same specks.
function localRand(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hue in degrees and saturation 0..1 of a hex colour.
function hueSat(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return [0, 0];
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, mx > 0 ? d / mx : 0];
}

export default {
  id: 'azulejo',
  name: 'Tile Mosaic',
  engine: 'p5',
  medium: 'image',
  hint: 'Hover to flip tiles · click to re-deal the ornaments in a wave',
  params: {
    tiles:    { value: 13, min: 5, max: 40, step: 1, label: 'Tiles across', rebuild: true },
    ornament: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'Ornament amount' },
    tint:     { value: 0.85, min: 0, max: 1, step: 0.01, label: 'Tint' },
    style:    { value: 'Mixed', options: ['Mixed', 'Arcs', 'Florets', 'Scrolls', 'Stars'], label: 'Ornament style' },
    colours:  { value: 'Accents', options: ['Accents', 'Mono'], label: 'Ornament colours' },
    grout:    { value: 0.45, min: 0, max: 1, step: 0.01, label: 'Grout' },
    glaze:    { value: 0.55, min: 0, max: 1, step: 0.01, label: 'Glaze' },
    wear:     { value: 0.35, min: 0, max: 1, step: 0.01, label: 'Wear' },
    flip:     { value: 0.14, min: 0.04, max: 0.4, step: 0.01, label: 'Flip radius' },
  },
  controls: {
    essentials: ['tiles', 'ornament', 'tint', 'style'],
    groups: { Ornament: ['colours'], Surface: ['grout', 'glaze', 'wear'], Interaction: ['flip'] },
  },

  create(ctx) {
    const P = ctx.params;
    const R = ctx.rand;
    const src = ctx.source;
    const across = Math.round(P.tiles);

    // ---------- Layout ----------
    let W = 0, H = 0, D = 1, s = 1, rows = 0, oy = 0;
    let tiles = [];
    let cover = [0, 0, 1, 1];
    const srcRect = (x, y, w, h) => [cover[0] + x / W * cover[2], cover[1] + y / H * cover[3], w / W * cover[2], h / H * cover[3]];

    const newTile = (i, j) => ({
      i, j, x: 0, y: 0, lum: 0.5, dn: 0.5, orn: false,
      jit: R.range(-0.06, 0.06), style: P.style === 'Mixed' ? R.pick(STYLES) : P.style,
      rot: R.int(0, 3), seed: R.int(1, 1e9), cpick: R(), apick: R.int(0, 3), wear: R(),
      f: 0, hold: 0, wave: null,
    });
    function layout() {
      s = W / across;
      rows = Math.ceil(H / s);
      oy = (H - rows * s) / 2;
      cover = coverRect(src.width, src.height, W, H);
      const old = tiles;
      tiles = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < across; i++) {
        const t = old[j * across + i] && old[j * across + i].j === j ? old[j * across + i] : newTile(i, j);
        t.x = i * s; t.y = oy + j * s;
        tiles.push(t);
      }
    }

    // ---------- Tones per tile ----------
    const smp = document.createElement('canvas');
    const sctx = smp.getContext('2d', { willReadFrequently: true });
    let thr = 0;
    function sampleTones(hysteresis) {
      cover = coverRect(src.width, src.height, W, H);
      const k = 4, cw = across * k, ch = rows * k;
      if (smp.width !== cw || smp.height !== ch) { smp.width = cw; smp.height = ch; }
      const [sx, sy, sw, sh] = srcRect(0, oy, W, rows * s);
      sctx.clearRect(0, 0, cw, ch);
      sctx.drawImage(src.canvas, sx, sy, sw, sh, 0, 0, cw, ch);
      const d = sctx.getImageData(0, 0, cw, ch).data;
      for (const t of tiles) {
        let sum = 0;
        for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) {
          const o = ((t.j * k + y) * cw + t.i * k + x) * 4;
          sum += lumOf(d[o], d[o + 1], d[o + 2]);
        }
        t.lum = sum / (k * k);
        t.dn = Math.min(1, Math.max(0, (0.85 - t.lum) / 0.7));
      }
      assign(hysteresis);
    }
    // The darkest share of tiles (Ornament amount) become ornaments.
    function assign(hysteresis) {
      const a = P.ornament;
      if (a <= 0.001) thr = -Infinity;
      else if (a >= 0.999) thr = Infinity;
      else {
        const sorted = tiles.map((t) => t.lum).sort((x, y) => x - y);
        thr = sorted[Math.min(sorted.length - 1, Math.floor(a * sorted.length))];
      }
      for (const t of tiles) {
        const v = t.lum + t.jit;
        if (!hysteresis) t.orn = v < thr;
        else if (t.orn && v > thr + 0.05) t.orn = false;
        else if (!t.orn && v < thr - 0.05) t.orn = true;
      }
    }

    // ---------- Colours ----------
    let C = null, palKey = '';
    function readPalette() {
      const pal = ctx.palette;
      const key = pal.bg + pal.ink + pal.c1 + pal.c2 + pal.c3 + pal.c4;
      if (key === palKey) return false;
      palKey = key;
      // Tint: the deepest, most saturated accent, with a bonus for cool blues (it's azulejo).
      const acc = [pal.c1, pal.c2, pal.c3, pal.c4];
      let tint = pal.ink, best = 0.12;
      for (const h of acc) {
        const [hue, sat] = hueSat(h);
        const score = sat * (1 - lumOf(...rgbOf(h))) * (hue > 160 && hue < 270 ? 1.4 : 1);
        if (score > best) { best = score; tint = h; }
      }
      const others = acc.filter((h) => h !== tint);
      const bgL = lumOf(...rgbOf(pal.bg));
      C = {
        bg: pal.bg, ink: pal.ink, tint, others: others.length ? others : [pal.ink],
        light: bgL > 0.45,
        grout: mixHex(pal.bg, pal.ink, 0.38),
        recess: mixHex(pal.bg, pal.ink, 0.62),
      };
      return true;
    }

    // ---------- Walls: face A (resting) and face B (flipped) for every tile ----------
    const wa = document.createElement('canvas'), wb = document.createElement('canvas');
    const xa = wa.getContext('2d'), xb = wb.getContext('2d');

    function paintTile(w, t, isOrn) {
      const g = P.grout * s * 0.045 + 0.25;
      const fx = t.x + g, fy = t.y + g, fs = s - 2 * g;
      w.save();
      w.beginPath(); w.rect(t.x, t.y, s, s); w.clip();
      w.fillStyle = C.grout;
      w.fillRect(t.x, t.y, s, s);
      if (!isOrn) {
        const [a, b, cw, chh] = srcRect(fx, fy, fs, fs);
        w.drawImage(src.canvas, a, b, cw, chh, fx, fy, fs, fs);
        if (P.tint > 0) {
          // Keep the picture's light and shade, take the hue of the glaze colour.
          w.globalCompositeOperation = 'color';
          w.globalAlpha = P.tint;
          w.fillStyle = C.tint;
          w.fillRect(fx, fy, fs, fs);
          w.globalCompositeOperation = C.light ? 'multiply' : 'screen';
          w.globalAlpha = P.tint * (C.light ? 0.5 : 0.2);
          w.fillStyle = C.bg;
          w.fillRect(fx, fy, fs, fs);
          w.globalCompositeOperation = 'source-over';
          w.globalAlpha = 1;
        }
      } else {
        drawOrnament(w, t, fx, fy, fs);
      }
      const lr = localRand(t.seed);
      // Wear: each tile a touch lighter or darker, a few specks, the odd chipped corner.
      if (P.wear > 0) {
        const v = t.wear - 0.5;
        w.fillStyle = v > 0 ? `rgba(255,255,255,${(v * 0.28 * P.wear).toFixed(3)})` : hexA(C.ink, -v * 0.2 * P.wear);
        w.fillRect(fx, fy, fs, fs);
        const n = Math.floor(P.wear * 7 * lr());
        w.fillStyle = hexA(C.ink, 0.22);
        for (let k = 0; k < n; k++) {
          w.beginPath();
          w.arc(fx + lr() * fs, fy + lr() * fs, 0.4 + lr() * fs * 0.012, 0, Math.PI * 2);
          w.fill();
        }
        if (lr() < P.wear * 0.3) {
          const cs = fs * (0.06 + lr() * 0.1), corner = Math.floor(lr() * 4);
          const cx = corner & 1 ? fx + fs : fx, cy = corner & 2 ? fy + fs : fy;
          const sx = corner & 1 ? -1 : 1, sy = corner & 2 ? -1 : 1;
          w.fillStyle = C.grout;
          w.beginPath(); w.moveTo(cx, cy); w.lineTo(cx + sx * cs, cy); w.lineTo(cx, cy + sy * cs * (0.6 + lr() * 0.8)); w.closePath(); w.fill();
        }
      }
      // Glaze: a soft sheen in one corner and a bevelled edge.
      if (P.glaze > 0) {
        const gl = P.glaze;
        const hx = fx + fs * (0.22 + lr() * 0.15), hy = fy + fs * (0.18 + lr() * 0.12);
        const rg = w.createRadialGradient(hx, hy, 0, hx, hy, fs * 0.8);
        rg.addColorStop(0, `rgba(255,255,255,${(0.3 * gl).toFixed(3)})`);
        rg.addColorStop(0.4, `rgba(255,255,255,${(0.07 * gl).toFixed(3)})`);
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        w.fillStyle = rg;
        w.fillRect(fx, fy, fs, fs);
        const bv = Math.max(0.6, fs * 0.022);
        w.fillStyle = `rgba(255,255,255,${(0.35 * gl).toFixed(3)})`;
        w.fillRect(fx, fy, fs, bv); w.fillRect(fx, fy, bv, fs);
        w.fillStyle = hexA(C.ink, 0.2 * gl);
        w.fillRect(fx, fy + fs - bv, fs, bv); w.fillRect(fx + fs - bv, fy, bv, fs);
      }
      w.restore();
    }

    // ---------- Ornaments (drawn around the tile centre, rotated in quarter turns) ----------
    function drawOrnament(w, t, fx, fy, fs) {
      const lr = localRand(t.seed * 3 + 7);
      const dn = t.dn;
      const mono = P.colours === 'Mono';
      const main = mono || t.cpick < 0.7 ? C.tint : C.others[t.apick % C.others.length];
      const acc = mono ? C.ink : (main === C.tint ? C.others[t.apick % C.others.length] : C.tint);
      const ground = mixHex(C.bg, C.tint, 0.04 + dn * 0.28);
      w.fillStyle = ground;
      w.fillRect(fx, fy, fs, fs);
      w.save();
      w.translate(fx + fs / 2, fy + fs / 2);
      w.rotate(t.rot * Math.PI / 2);
      const h = fs / 2;
      // Engraved shading on dark tiles keeps the picture readable.
      if (dn > 0.3) {
        const sp = fs * (0.15 - 0.09 * dn);
        w.strokeStyle = hexA(main, 0.12 + 0.3 * (dn - 0.3));
        w.lineWidth = Math.max(0.5, fs * 0.012);
        w.beginPath();
        for (let k = -fs * 1.5; k < fs * 1.5; k += sp) { w.moveTo(k - h, -h); w.lineTo(k + h, h); }
        w.stroke();
      }
      w.lineCap = 'round';
      w.lineJoin = 'round';
      const style = t.style;
      if (style === 'Arcs') {
        // Truchet: banded quarter discs at two opposite corners; rotations join across tiles.
        const n = 2 + Math.round(dn * 3);
        for (const [cx, cy, a0] of [[-h, -h, 0], [h, h, Math.PI]]) {
          for (let k = n; k >= 1; k--) {
            const r = h * (0.25 + 0.95 * k / n);
            w.fillStyle = k % 2 === n % 2 ? main : (k === 1 ? acc : ground);
            w.beginPath(); w.moveTo(cx, cy); w.arc(cx, cy, r, a0, a0 + Math.PI / 2); w.closePath(); w.fill();
          }
        }
        w.fillStyle = acc;
        for (const [cx, cy, a0] of [[h, -h, Math.PI / 2], [-h, h, -Math.PI / 2]]) {
          w.beginPath(); w.moveTo(cx, cy); w.arc(cx, cy, h * 0.32, a0, a0 + Math.PI / 2); w.closePath(); w.fill();
        }
      } else if (style === 'Florets') {
        // Corner quarter-florets meet their neighbours; a diamond lattice; an 8-petal centre.
        w.strokeStyle = main;
        w.lineWidth = fs * 0.03;
        w.beginPath(); w.moveTo(0, -h); w.lineTo(h, 0); w.lineTo(0, h); w.lineTo(-h, 0); w.closePath(); w.stroke();
        for (const [cx, cy] of [[-h, -h], [h, -h], [h, h], [-h, h]]) {
          w.fillStyle = main; w.beginPath(); w.arc(cx, cy, h * (0.36 + 0.12 * dn), 0, Math.PI * 2); w.fill();
          w.fillStyle = ground; w.beginPath(); w.arc(cx, cy, h * 0.2, 0, Math.PI * 2); w.fill();
          w.fillStyle = acc; w.beginPath(); w.arc(cx, cy, h * 0.09, 0, Math.PI * 2); w.fill();
        }
        const petals = dn > 0.55 ? 12 : 8;
        for (let k = 0; k < petals; k++) {
          const a = k / petals * Math.PI * 2;
          w.fillStyle = k % 2 && dn > 0.4 ? acc : main;
          w.beginPath();
          w.ellipse(Math.sin(a) * h * 0.34, -Math.cos(a) * h * 0.34, h * (petals > 8 ? 0.09 : 0.12), h * 0.27, a, 0, Math.PI * 2);
          w.fill();
        }
        w.fillStyle = acc; w.beginPath(); w.arc(0, 0, h * 0.15, 0, Math.PI * 2); w.fill();
        w.fillStyle = ground; w.beginPath(); w.arc(0, 0, h * 0.06, 0, Math.PI * 2); w.fill();
      } else if (style === 'Scrolls') {
        // Baroque curls: two mirrored spirals joined by an S-curve, with leaves along it.
        w.strokeStyle = main;
        w.lineWidth = fs * (0.035 + 0.03 * dn);
        const spiral = (cx, cy, r0, dir, ph) => {
          w.beginPath();
          for (let k = 0; k <= 48; k++) {
            const u = k / 48, a = ph + dir * u * Math.PI * 3.2, r = r0 * (1 - 0.82 * u);
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            if (k === 0) w.moveTo(x, y); else w.lineTo(x, y);
          }
          w.stroke();
        };
        w.beginPath();
        w.moveTo(-h, h * 0.55);
        w.bezierCurveTo(-h * 0.2, h * 0.9, h * 0.2, -h * 0.9, h, -h * 0.55);
        w.stroke();
        spiral(-h * 0.38, -h * 0.18, h * 0.46, 1, Math.PI * 0.5);
        spiral(h * 0.38, h * 0.18, h * 0.46, 1, -Math.PI * 0.5);
        const leaves = 3 + Math.round(dn * 3);
        w.fillStyle = acc;
        for (let k = 0; k < leaves; k++) {
          const u = (k + 0.5) / leaves;
          const x = -h + 2 * h * u, y = h * 0.55 - 1.1 * h * u + Math.sin(u * Math.PI * 2) * h * 0.25;
          const a = (lr() - 0.5) * 2 + (k % 2 ? 0.8 : -0.8);
          const L = h * (0.22 + 0.1 * lr());
          w.save(); w.translate(x, y); w.rotate(a);
          w.beginPath(); w.moveTo(0, 0); w.quadraticCurveTo(L * 0.5, -L * 0.45, L, 0); w.quadraticCurveTo(L * 0.5, L * 0.45, 0, 0); w.fill();
          w.restore();
        }
        if (dn > 0.45) {
          // Sea-wave strokes in the background of dark tiles.
          w.strokeStyle = hexA(main, 0.55);
          w.lineWidth = fs * 0.015;
          for (let k = 0; k < 3; k++) {
            const yy = h * (0.55 + k * 0.14);
            w.beginPath();
            for (let x = -h; x <= h; x += h / 8) w.lineTo(x, yy - h * 0.06 * Math.sin(x / h * 6 + k));
            w.stroke();
          }
        }
      } else {
        // Stars: an eight-point star from two squares, a window of ground, corner diamonds.
        const q = h * (0.62 + 0.1 * dn);
        w.fillStyle = main;
        w.fillRect(-q, -q, q * 2, q * 2);
        w.save(); w.rotate(Math.PI / 4); w.fillRect(-q, -q, q * 2, q * 2); w.restore();
        w.fillStyle = ground; w.beginPath(); w.arc(0, 0, q * 0.68, 0, Math.PI * 2); w.fill();
        w.fillStyle = acc;
        w.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * Math.PI * 2, r = k % 2 ? q * 0.22 : q * 0.6;
          w.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        w.closePath(); w.fill();
        w.fillStyle = main; w.beginPath(); w.arc(0, 0, q * 0.12, 0, Math.PI * 2); w.fill();
        const cd = h * 0.36;
        w.fillStyle = acc;
        for (const [cx, cy] of [[-h, -h], [h, -h], [h, h], [-h, h]]) {
          w.beginPath(); w.moveTo(cx, cy - Math.sign(cy) * cd); w.lineTo(cx - Math.sign(cx) * cd, cy); w.lineTo(cx, cy); w.closePath(); w.fill();
        }
        if (dn > 0.4) {
          w.strokeStyle = main; w.lineWidth = fs * 0.02;
          w.strokeRect(-h * 0.9, -h * 0.9, h * 1.8, h * 1.8);
        }
      }
      w.restore();
    }

    let needWalls = true;
    function renderWalls() {
      const bw = Math.round(W * D), bh = Math.round(H * D);
      for (const cv of [wa, wb]) if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      for (const w of [xa, xb]) { w.setTransform(D, 0, 0, D, 0, 0); w.fillStyle = C.grout; w.fillRect(0, 0, W, H); }
      for (const t of tiles) { paintTile(xa, t, t.orn); paintTile(xb, t, !t.orn); }
      needWalls = false;
    }
    function repaint(t) { paintTile(xa, t, t.orn); paintTile(xb, t, !t.orn); }

    // Click: new ornament, rotation and colour; ornament / picture choice re-rolled near the cut-off.
    function redeal(t) {
      t.style = P.style === 'Mixed' ? R.pick(STYLES) : P.style;
      t.rot = R.int(0, 3); t.seed = R.int(1, 1e9); t.cpick = R(); t.apick = R.int(0, 3);
      t.jit = R.range(-0.08, 0.08);
      if (Number.isFinite(thr)) t.orn = t.lum + t.jit < thr;
    }

    // ---------- Frame ----------
    let clock = 0, idleT = 1.2, anVer = -1, anAt = 0, glint = 0;
    const WAVE = 0.6;

    const stage = createP5Stage(ctx, {
      draw(p, time, dt) {
        const pw = p.width, ph = p.height, d = p.pixelDensity(), c = p.drawingContext;
        const ptr = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        clock += dt;

        if (pw !== W || ph !== H || d !== D || !tiles.length) {
          W = pw; H = ph; D = d;
          layout();
          sampleTones(false);
          anVer = src.version;
          needWalls = true;
        }
        if (readPalette()) needWalls = true;
        const now = performance.now();
        if (src.version !== anVer && (src.kind !== 'webcam' || now - anAt > 100 + tiles.length * 0.15)) {
          sampleTones(src.kind === 'webcam');
          anVer = src.version; anAt = now;
          needWalls = true;
        }
        if (needWalls) renderWalls();

        // Hover: tiles near the cursor flip and stay over for a moment.
        const hover = ptr.inside ? Math.min(2, mPow) : 0;
        const rr = P.flip * (0.6 + 0.4 * Math.min(1.5, hover)) * W;
        const px = ptr.x * W, py = ptr.y * H;
        if (ptr.justPressed) {
          for (const t of tiles) {
            const dd = Math.hypot(t.x + s / 2 - px, t.y + s / 2 - py) / W;
            t.wave = { start: clock + dd * 0.9, swapped: false };
          }
        }
        idleT -= dt;
        if (idleT <= 0 && tiles.length) {
          // Idle life: now and then a single tile turns over and back.
          R.pick(tiles).hold = R.range(1.5, 3);
          idleT = R.range(0.6, 1.8);
        }
        const moving = [];
        for (const t of tiles) {
          if (hover > 0) {
            const dd = Math.hypot(t.x + s / 2 - px, t.y + s / 2 - py);
            if (dd < rr) t.hold = Math.max(t.hold, 0.5 + 0.25 * hover);
          }
          t.hold -= dt;
          const target = t.hold > 0 ? 1 : 0;
          t.f += Math.max(-dt * 2.4, Math.min(dt * 2.4, target - t.f));
          let wu = -1;
          if (t.wave) {
            wu = (clock - t.wave.start) / WAVE;
            if (wu >= 0.5 && !t.wave.swapped) { redeal(t); repaint(t); t.wave.swapped = true; }
            if (wu >= 1) { t.wave = null; wu = -1; }
          }
          t.wu = wu;
          if (t.f > 0.001 || wu >= 0) moving.push(t);
        }

        c.save();
        c.drawImage(wa, 0, 0, W, H);
        // Flipping tiles: an empty recess, a soft shadow, then the squashed face.
        for (const t of moving) {
          const a = ease(Math.min(1, Math.max(0, t.f))) * Math.PI;
          let sx = Math.abs(Math.cos(a)), lift = Math.sin(a);
          if (t.wu >= 0) { sx *= Math.abs(Math.cos(t.wu * Math.PI)); lift = Math.max(lift, Math.sin(t.wu * Math.PI)); }
          const face = a < Math.PI / 2 ? wa : wb;
          const cx = t.x + s / 2, cy = t.y + s / 2;
          const sc = 1 + 0.12 * lift;
          const dw = Math.max(0.5, s * sx * sc), dh = s * sc;
          c.fillStyle = C.recess;
          c.fillRect(t.x, t.y, s, s);
          if (lift > 0.01) {
            c.fillStyle = `rgba(0,0,0,${(0.22 * lift).toFixed(3)})`;
            c.fillRect(cx - dw / 2 + s * 0.06 * lift, cy - dh / 2 + s * 0.09 * lift, dw, dh);
          }
          c.drawImage(face, t.x * D, t.y * D, s * D, s * D, cx - dw / 2, cy - dh / 2, dw, dh);
          if (lift > 0.01) {
            c.fillStyle = `rgba(0,0,0,${(0.3 * lift * (1 - sx)).toFixed(3)})`;
            c.fillRect(cx - dw / 2, cy - dh / 2, dw, dh);
          }
        }
        // A slow band of light travelling across the glaze, and a glint under the cursor.
        if (P.glaze > 0) {
          c.globalCompositeOperation = 'screen';
          const m = (clock * 0.045) % 1.5 - 0.25;
          const g = c.createLinearGradient(0, 0, W, H * 0.5);
          const cl = (v) => Math.min(1, Math.max(0, v));
          g.addColorStop(cl(m - 0.14), 'rgba(255,255,255,0)');
          g.addColorStop(cl(m), `rgba(255,255,255,${(0.16 * P.glaze).toFixed(3)})`);
          g.addColorStop(cl(m + 0.14), 'rgba(255,255,255,0)');
          c.fillStyle = g;
          c.fillRect(0, 0, W, H);
          glint += ((hover > 0 ? 1 : 0) - glint) * Math.min(1, dt * 5);
          if (glint > 0.02) {
            const gr = c.createRadialGradient(px, py, 0, px, py, s * 2.2);
            gr.addColorStop(0, `rgba(255,255,255,${(0.28 * P.glaze * glint).toFixed(3)})`);
            gr.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = gr;
            c.fillRect(px - s * 2.2, py - s * 2.2, s * 4.4, s * 4.4);
          }
          c.globalCompositeOperation = 'source-over';
        }
        c.restore();
        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return {
      resize: stage.resize,
      frame: stage.frame,
      dispose() { stage.dispose(); wa.width = wa.height = 0; wb.width = wb.height = 0; smp.width = smp.height = 0; },
      onParam(key) {
        if (!tiles.length) return;
        if (key === 'ornament') assign(false);
        if (key === 'style') for (const t of tiles) t.style = P.style === 'Mixed' ? R.pick(STYLES) : P.style;
        if (key === 'source') anVer = -1;
        if (key !== 'flip') needWalls = true;
      },
    };
  },
};
