// Pattern Collage: a guillotine-cut grid of overlapping tiles over the bloom, each filled with a
// different print pattern: ASCII, dots, hatching, repeated words, crosses, blurred windows, mosaics
// (refs 7–8). Hover a tile to animate and lift it; click to reshuffle the patterns.
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawBloom, drawGrain, hexA } from '../../shared/bloom2d.js';
import { accents } from '../../shared/palettes.js';
import { makeRandom } from '../../shared/random.js';

const TYPES = ['ascii', 'dots', 'hatch', 'word', 'cross', 'window', 'mosaic'];
const RAMP = ' .:-=+*x#%@0';
const MONO = '"JetBrains Mono", "Space Mono", ui-monospace, Menlo, monospace';

export default {
  id: 'collage',
  name: 'Pattern Collage',
  engine: 'p5',
  hint: 'Hover a tile to animate it · click to reshuffle patterns',
  params: {
    tiles:     { value: 9, min: 4, max: 24, step: 1, label: 'Tiles', rebuild: true },
    darkRatio: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'Dark tiles' },
    scale:     { value: 1, min: 0.5, max: 2.5, step: 0.01, label: 'Pattern scale' },
    weight:    { value: 1, min: 0.4, max: 3, step: 0.05, label: 'Line weight' },
    word:      { value: 'SUPER', label: 'Word' },
    labels:    { value: true, label: 'Coordinate labels' },
    guides:    { value: true, label: 'Guide lines' },
    ascii:     { value: true, label: 'ASCII' },
    dots:      { value: true, label: 'Dot grid' },
    hatch:     { value: true, label: 'Hatching' },
    words:     { value: true, label: 'Word grid' },
    cross:     { value: true, label: 'Crosses' },
    window:    { value: true, label: 'Blur windows' },
    mosaic:    { value: true, label: 'Mosaic' },
  },

  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;

    // ---- Layout: recursive guillotine cuts in 0..1 space ----
    const cells = [{ x: 0, y: 0, w: 1, h: 1 }];
    while (cells.length < P.tiles + 3) {
      // Split the largest cell (with a little randomness) so sizes stay varied but balanced.
      cells.sort((a, b) => b.w * b.h * (0.7 + r() * 0.6) - a.w * a.h * (0.7 + r() * 0.6));
      const c = cells.shift();
      const vert = c.w / c.h > 1.4 ? true : c.h / c.w > 1.4 ? false : r() < 0.5;
      const k = r.range(0.3, 0.7);
      if (vert) cells.push({ x: c.x, y: c.y, w: c.w * k, h: c.h }, { x: c.x + c.w * k, y: c.y, w: c.w * (1 - k), h: c.h });
      else cells.push({ x: c.x, y: c.y, w: c.w, h: c.h * k }, { x: c.x, y: c.y + c.h * k, w: c.w, h: c.h * (1 - k) });
    }
    // Skip a few cells so the bloom shows through, then nudge/expand the rest so they overlap.
    const tiles = [];
    cells.forEach((c, i) => {
      if (tiles.length >= P.tiles || (r() < 0.22 && cells.length - i > P.tiles - tiles.length)) return;
      const g = 0.012;
      const grow = r() < 0.35 ? r.range(0.04, 0.12) : 0;
      const t = {
        x: c.x + g + r.range(-0.03, 0.03) - grow * r(),
        y: c.y + g + r.range(-0.03, 0.03) - grow * r(),
        w: c.w - g * 2 + grow,
        h: c.h - g * 2 + grow,
        z: r(), seed: r.int(1, 1e6), lift: 0, hover: 0,
        corner: r.int(0, 3), label: r() < 0.5, tag: r() < 0.2 ? `S0${r.int(1, 9)}` : null,
        mode: 'light', type: 'dots', acc: 0,
      };
      t.x = Math.max(-0.02, t.x); t.y = Math.max(-0.02, t.y);
      tiles.push(t);
    });
    tiles.sort((a, b) => a.z - b.z);

    // ---- Fill assignment (re-run on click or when the enabled types change) ----
    let shuffles = 0;
    let sig = '';
    const enabled = () => TYPES.filter((k) => P[k === 'word' ? 'words' : k]);
    function assign() {
      const rr = makeRandom(ctx.state.seed * 13 + shuffles * 101 + 7);
      const list = enabled();
      tiles.forEach((t, i) => {
        t.type = list.length ? list[(i + rr.int(0, list.length)) % list.length] : 'none';
        // Mix it up beyond simple cycling.
        if (list.length > 2 && rr() < 0.5) t.type = rr.pick(list);
        t.dark = rr();
        t.clear = rr() < 0.25 && t.type !== 'window' && t.type !== 'mosaic';
        t.acc = rr.int(0, 3);
        t.ang = rr.pick([-0.9, -0.6, 0.6, 0.9, 1.2]);
        t.plus = rr() < 0.5;
        t.rseed = rr.int(1, 1e6);
      });
      // The biggest tile becomes a hero "window" (if windows are enabled) to anchor the layout.
      if (list.includes('window')) {
        const big = tiles.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a), tiles[0]);
        if (big) big.type = 'window';
      }
    }

    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, time, dt) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const d = p.pixelDensity();
        const pal = ctx.palette;
        const A = accents(pal);
        const mouse = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        drawBloom(c, W, H, { palette: pal, seed: ctx.state.seed, time, amount: ctx.state.bloom.amount, count: ctx.state.bloom.count, mouse });

        const s = enabled().join(',');
        if (s !== sig) { sig = s; assign(); }
        if (mouse.justPressed && mouse.inside) { shuffles++; assign(); }

        // Which tile is under the cursor (topmost wins)?
        let hot = null;
        if (mouse.inside && mPow > 0) {
          for (const t of tiles) if (mouse.x > t.x && mouse.x < t.x + t.w && mouse.y > t.y && mouse.y < t.y + t.h) hot = t;
        }

        // Faint dashed guides along tile edges, extended across the whole poster.
        if (P.guides) {
          c.save();
          c.strokeStyle = hexA(pal.ink, 0.22);
          c.lineWidth = 0.6 * P.weight;
          c.setLineDash([3, 4]);
          c.lineDashOffset = -time * 6;
          c.beginPath();
          tiles.forEach((t, i) => {
            if (i % 2 === 0) { const x = Math.round(t.x * W) + 0.5; c.moveTo(x, 0); c.lineTo(x, H); }
            else { const y = Math.round((t.y + t.h) * H) + 0.5; c.moveTo(0, y); c.lineTo(W, y); }
          });
          c.stroke();
          c.restore();
        }

        const k = 1 - Math.pow(0.002, Math.max(dt, 0.016));
        for (const t of tiles) {
          t.hover += ((t === hot ? 1 : 0) - t.hover) * k;
          drawTile(c, t, W, H, d, time, pal, A, mouse, mPow);
        }
        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    // ---- One tile ----
    function drawTile(c, t, W, H, d, time, pal, A, mouse, mPow) {
      const lift = t.hover * 5 * Math.min(1.5, mPow);
      const x = Math.round(t.x * W) - lift, y = Math.round(t.y * H) - lift;
      const w = Math.round(t.w * W), h = Math.round(t.h * H);
      const dark = t.dark < P.darkRatio;
      const bg = dark ? pal.ink : pal.bg;
      const fg = dark ? pal.bg : pal.ink;
      const acc = A[t.acc];
      const hv = t.hover;
      const lw = P.weight;
      const cs = Math.max(7, W * 0.026) * P.scale; // pattern cell size, relative to poster width

      c.save();
      // Drop shadow while lifted.
      if (lift > 0.2) {
        c.shadowColor = hexA(pal.ink, 0.35 * t.hover);
        c.shadowBlur = 18 * t.hover * d;
        c.shadowOffsetY = lift * 0.8 * d;
      }
      if (t.type === 'window') {
        c.fillStyle = acc;
        c.fillRect(x, y, w, h);
      } else if (!t.clear) {
        c.fillStyle = bg;
        c.fillRect(x, y, w, h);
      } else {
        c.fillStyle = hexA(pal.bg, 0.18);
        c.fillRect(x, y, w, h);
      }
      c.shadowColor = 'transparent';
      c.beginPath();
      c.rect(x, y, w, h);
      c.clip();
      const ink = t.clear ? pal.ink : fg;
      const lmx = (mouse.x * W - x) / w, lmy = (mouse.y * H - y) / h; // mouse in tile 0..1

      switch (t.type) {
        case 'ascii': {
          // Characters forming soft clouds of density, scrambled while hovered.
          const fs = cs * 0.95;
          c.font = `400 ${fs}px ${MONO}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          const cols = Math.ceil(w / (fs * 0.72)), rows = Math.ceil(h / (fs * 1.1));
          const R = makeRandom(t.rseed + (hv > 0.3 ? Math.floor(time * 14) : 0));
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const u = i / cols, v = j / rows;
            let b = 0.5 + 0.5 * Math.sin(u * 5.1 + t.rseed % 7 + time * 0.25) * Math.cos(v * 4.3 - time * 0.2 + t.rseed % 3);
            b = b * b * 1.15;
            const scr = hv > 0.05 ? R() < hv * 0.6 : false;
            const ch = scr ? RAMP[1 + Math.floor(R() * (RAMP.length - 1))] : RAMP[Math.min(RAMP.length - 1, Math.floor(b * RAMP.length))];
            if (ch === ' ') continue;
            c.fillStyle = (i * 7 + j * 3 + t.acc) % 11 === 0 ? acc : ink;
            c.fillText(ch, x + (i + 0.5) * fs * 0.72, y + (j + 0.5) * fs * 1.1);
          }
          break;
        }
        case 'dots': {
          // Graded dot grid; ripples out from the cursor when hovered.
          const sp = cs * 0.9;
          const cols = Math.ceil(w / sp), rows = Math.ceil(h / sp);
          c.fillStyle = ink;
          c.beginPath();
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const u = (i + 0.5) / cols, v = (j + 0.5) / rows;
            let rr = sp * 0.42 * (0.25 + 0.75 * v) * (0.85 + 0.15 * Math.sin(time * 0.8 + u * 6));
            if (hv > 0.01) {
              const dd = Math.hypot((u - lmx) * w, (v - lmy) * h) / sp;
              rr *= 1 + hv * 0.5 * Math.sin(dd * 0.9 - time * 6) * Math.exp(-dd * 0.08);
            }
            rr = Math.max(0.4, rr);
            const px = x + (i + 0.5) * sp, py = y + (j + 0.5) * sp;
            c.moveTo(px + rr, py);
            c.arc(px, py, rr, 0, Math.PI * 2);
          }
          c.fill();
          break;
        }
        case 'hatch': {
          // Short parallel dashes in a grid; they rotate while hovered.
          const sp = cs * 0.85;
          const a = t.ang + Math.sin(time * 0.4 + t.rseed) * 0.08 + hv * time * 1.5;
          const L = sp * 0.48;
          c.strokeStyle = ink;
          c.lineWidth = 0.9 * lw;
          c.lineCap = 'round';
          c.beginPath();
          const cols = Math.ceil(w / sp) + 1, rows = Math.ceil(h / sp) + 1;
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const px = x + i * sp, py = y + j * sp;
            const aa = a + (hv > 0.01 ? Math.sin(i * 0.4 + j * 0.3 + time * 3) * hv * 0.5 : 0);
            const dx = Math.cos(aa) * L, dy = Math.sin(aa) * L;
            c.moveTo(px - dx, py - dy);
            c.lineTo(px + dx, py + dy);
          }
          c.stroke();
          break;
        }
        case 'word': {
          // The word repeated letter by letter in reading order; letters march while hovered.
          const word = (P.word || 'SUPER').toUpperCase().replace(/\s+/g, '') || 'SUPER';
          const sp = cs * 1.25;
          c.font = `500 ${sp * 0.62}px ${MONO}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillStyle = ink;
          const cols = Math.ceil(w / sp), rows = Math.ceil(h / sp);
          const shift = Math.floor(time * 0.6 + hv * time * 6);
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const n = j * cols + i + shift;
            c.fillText(word[((n % word.length) + word.length) % word.length], x + (i + 0.5) * sp, y + (j + 0.5) * sp);
          }
          break;
        }
        case 'cross': {
          // A grid of tiny × or + marks that spin while hovered.
          const sp = cs * 1.1, L = sp * 0.22 * (t.plus ? 1 : 1.3);
          c.strokeStyle = ink;
          c.lineWidth = 0.9 * lw;
          c.beginPath();
          const cols = Math.ceil(w / sp), rows = Math.ceil(h / sp);
          const base = (t.plus ? 0 : Math.PI / 4);
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const px = x + (i + 0.5) * sp, py = y + (j + 0.5) * sp;
            const a = base + hv * (time * 2 + i * 0.2);
            const ca = Math.cos(a) * L, sa = Math.sin(a) * L;
            c.moveTo(px - ca, py - sa); c.lineTo(px + ca, py + sa);
            c.moveTo(px + sa, py - ca); c.lineTo(px - sa, py + ca);
          }
          c.stroke();
          break;
        }
        case 'window': {
          // A little blurred-gradient "photo": an inner bloom with its own colours.
          const sub = { bg: acc, ink: pal.ink, c1: A[(t.acc + 1) % 4], c2: A[(t.acc + 2) % 4], c3: pal.bg, c4: A[(t.acc + 3) % 4] };
          const m = { x: lmx, y: lmy, inside: hv > 0.2 };
          c.translate(x, y);
          drawBloom(c, w, h, { palette: sub, seed: t.rseed % 9973, time: time * (1 + hv * 2), amount: 0.95, count: 3, mouse: m });
          c.translate(-x, -y);
          // A sparse pixel-dot overlay like the ref's "sky" window.
          c.fillStyle = hexA(pal.bg, 0.55);
          const sp = cs * 0.6;
          const R = makeRandom(t.rseed);
          const cols = Math.ceil(w / sp), rows = Math.ceil(h / sp);
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            if (R() > 0.12 * (1 - j / rows)) continue;
            c.fillRect(x + i * sp, y + j * sp, 1.4, 1.4);
          }
          break;
        }
        case 'mosaic': {
          // Pixel squares in palette tints; shimmer, faster under the cursor.
          const sp = cs * 1.6;
          const cols = Math.ceil(w / sp), rows = Math.ceil(h / sp);
          const R = makeRandom(t.rseed);
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const ph = R() * 6.28, ci = R() < 0.6 ? t.acc : (t.acc + 1) % 4;
            const a = 0.15 + 0.45 * (0.5 + 0.5 * Math.sin(time * (0.6 + hv * 5) + ph));
            c.fillStyle = hexA(A[ci], a);
            c.fillRect(x + i * sp + 1, y + j * sp + 1, sp - 2, sp - 2);
          }
          break;
        }
        default: break;
      }
      c.restore();

      // Thin frame + corner marks.
      c.save();
      c.strokeStyle = hexA(pal.ink, t.clear ? 0.5 : 0.25);
      c.lineWidth = 0.6 * lw;
      c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      c.fillStyle = pal.ink;
      const m = 3;
      [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => c.fillRect(cx - m / 2, cy - m / 2, m, m));
      if (P.labels && t.label) drawLabel(c, t, x, y, w, h, W, H, pal, A);
      c.restore();
    }

    // Small mono coordinate box at one corner of the tile, e.g. "C2  12.1,03.2".
    function drawLabel(c, t, x, y, w, h, W, H, pal, A) {
      const fs = Math.max(7, W * 0.014);
      c.font = `400 ${fs}px ${MONO}`;
      c.textBaseline = 'middle';
      const cx = t.corner % 2 ? x + w : x, cy = t.corner > 1 ? y + h : y;
      const coord = `${(cx / W * 16).toFixed(1).padStart(4, '0')},${(cy / H * 16).toFixed(1).padStart(4, '0')}`;
      const id = `C${t.acc + 1}`;
      const draw = (str, bx, by, accent) => {
        const tw = c.measureText(str).width + 8;
        const lx = Math.min(W - tw - 4, Math.max(4, t.corner % 2 ? bx - tw - 4 : bx + 4));
        const ly = Math.min(H - 16, Math.max(4, by));
        c.fillStyle = hexA(pal.ink, 0.85);
        c.fillRect(lx, ly, tw, fs * 1.45);
        c.fillStyle = accent ? A[t.acc] : pal.bg;
        c.textAlign = 'left';
        c.fillText(str, lx + 4, ly + fs * 0.76);
        return ly;
      };
      const base = t.corner > 1 ? cy - fs * 3.6 : cy + 4;
      draw(id, cx, base, true);
      draw(coord, cx, base + fs * 1.65, false);
      if (t.tag) draw(t.tag, t.corner % 2 ? x + w : x, t.corner > 1 ? y + 4 : y + h - fs * 1.9, false);
    }

    return { resize: stage.resize, frame: stage.frame, dispose: stage.dispose };
  },
};
