// Halftone Field: a regular dot grid whose dots swell over hidden, drifting brush strokes,
// with a soft ghost of the same strokes underneath and glowing cross-shaped flares (ref 4).
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawBloom, drawGrain, hexA } from '../../shared/bloom2d.js';

export default {
  id: 'halftone',
  name: 'Halftone Field',
  engine: 'p5',
  hint: 'The flare follows you · click to drop a new stroke',
  params: {
    spacing:   { value: 11, min: 6, max: 26, step: 0.5, label: 'Grid spacing' },
    dotSize:   { value: 0.95, min: 0.2, max: 1.5, step: 0.01, label: 'Max dot size' },
    blobs:     { value: 7, min: 2, max: 14, step: 1, label: 'Strokes', rebuild: true },
    blobSize:  { value: 1, min: 0.4, max: 2.2, step: 0.01, label: 'Stroke size' },
    flare:     { value: 1, min: 0, max: 2, step: 0.01, label: 'Flare intensity' },
    flares:    { value: 2, min: 0, max: 4, step: 1, label: 'Flares' },
    ghost:     { value: true, label: 'Ghost blur' },
    shape:     { value: 'Circle', options: ['Circle', 'Square', 'Plus'], label: 'Dot shape' },
  },

  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;

    // Hidden strokes: short bent capsules (3 points) that drift and slowly turn,
    // like the brushy numerals in the reference.
    const makeStroke = (x, y, life) => ({
      x, y,
      ang: r.range(0, Math.PI * 2),
      spin: r.range(-0.12, 0.12),
      len: r.range(0.05, 0.13),
      bend: r.range(-0.8, 0.8),
      rad: r.range(0.016, 0.034),
      ph: r.range(0, 100),
      sp: r.range(0.05, 0.16),
      life, // null = permanent, otherwise seconds remaining
      age: 0,
    });
    const strokes = [];
    for (let i = 0; i < P.blobs; i++) {
      // Keep strokes inside a generous margin so the composition breathes.
      strokes.push(makeStroke(r.range(0.12, 0.88), r.range(0.1, 0.9), null));
    }

    // Flares: index 0 is the "main" flare that tracks the cursor.
    const flares = Array.from({ length: 4 }, (_, i) => ({
      x: i === 0 ? 0.5 : r.range(0.2, 0.8),
      y: i === 0 ? 0.28 : r.range(0.2, 0.85),
      ph: r.range(0, 100),
      col: i % 2,
      s: r.range(0.75, 1.1),
    }));
    const main = { x: flares[0].x, y: flares[0].y };

    // Offscreen buffers for the ghost (field rendered at grid resolution, then blurred by upscaling).
    const ghostA = document.createElement('canvas');
    const ghostB = document.createElement('canvas');
    const gA = ghostA.getContext('2d');
    const gB = ghostB.getContext('2d');
    let field = new Float32Array(0);

    // Squared distance from point to segment.
    const segD2 = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - ax - dx * t, ey = py - ay - dy * t;
      return ex * ex + ey * ey;
    };
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, t, dt) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const d = p.pixelDensity();
        const pal = ctx.palette;
        const mouse = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        const asp = W / H;

        // Pale background with a very faint bloom.
        drawBloom(c, W, H, { palette: pal, seed: ctx.state.seed, time: t, amount: ctx.state.bloom.amount * 0.35, count: ctx.state.bloom.count });

        // Click: drop a temporary stroke where the user clicked.
        if (mouse.justPressed && mouse.inside) {
          strokes.push(makeStroke(mouse.x, mouse.y, 6));
          if (strokes.length > P.blobs + 8) strokes.splice(P.blobs, 1);
        }

        // Main flare eases toward the cursor, otherwise wanders slowly.
        const tx = mouse.inside && mPow > 0 ? mouse.x : 0.5 + Math.sin(t * 0.13) * 0.18;
        const ty = mouse.inside && mPow > 0 ? mouse.y : 0.3 + Math.sin(t * 0.09 + 1) * 0.12;
        const k = 1 - Math.pow(0.04, Math.max(dt, 0.016) * Math.min(1, mPow + 0.3));
        main.x += (tx - main.x) * k;
        main.y += (ty - main.y) * k;

        // Resolve stroke geometry for this frame (in 0..1 units, x scaled by aspect).
        const segs = [];
        for (let i = strokes.length - 1; i >= 0; i--) {
          const s = strokes[i];
          let grow = 1;
          if (s.life !== null) {
            s.age += dt;
            if (s.age > s.life) { strokes.splice(i, 1); continue; }
            grow = Math.min(1, s.age / 0.6) * Math.min(1, (s.life - s.age) / 1.5);
          }
          const cx = (s.x + Math.sin(t * s.sp + s.ph) * 0.06) * asp;
          const cy = s.y + Math.cos(t * s.sp * 0.8 + s.ph * 1.7) * 0.05;
          const a = s.ang + t * s.spin;
          const L = s.len * P.blobSize;
          const ux = Math.cos(a) * L, uy = Math.sin(a) * L;
          const b = s.bend + Math.sin(t * 0.3 + s.ph) * 0.3;
          const mx = cx - uy * b, my = cy + ux * b; // bent midpoint
          const rr = s.rad * P.blobSize * grow;
          segs.push([cx - ux, cy - uy, mx, my, cx + ux, cy + uy, rr]);
        }

        // Evaluate the field once per grid cell.
        const sp = P.spacing;
        const cols = Math.ceil(W / sp) + 1, rows = Math.ceil(H / sp) + 1;
        const ox = (W - (cols - 1) * sp) / 2, oy = (H - (rows - 1) * sp) / 2;
        if (field.length !== cols * rows) field = new Float32Array(cols * rows);
        const fmx = main.x * asp, fmy = main.y;
        const hover = mouse.inside ? mPow : 0;
        let n = 0;
        for (let j = 0; j < rows; j++) {
          const py = (oy + j * sp) / H;
          for (let i = 0; i < cols; i++) {
            const px = (ox + i * sp) / H;
            let v = 0;
            for (let q = 0; q < segs.length; q++) {
              const sg = segs[q];
              const rr = sg[6];
              if (rr <= 0) continue;
              // Nearest of the stroke's two halves, so the bend doesn't double up.
              const d2 = Math.min(segD2(px, py, sg[0], sg[1], sg[2], sg[3]), segD2(px, py, sg[2], sg[3], sg[4], sg[5]));
              v += Math.exp(-d2 / (rr * rr));
            }
            field[n++] = v;
          }
        }

        // Ghost: write the field into a tiny canvas, shrink it again, then upscale = soft blur.
        if (P.ghost) {
          if (ghostA.width !== cols || ghostA.height !== rows) { ghostA.width = cols; ghostA.height = rows; }
          const img = gA.createImageData(cols, rows);
          const ink = parseInt(pal.ink.slice(1), 16);
          const ir = (ink >> 16) & 255, ig = (ink >> 8) & 255, ib = ink & 255;
          for (let q = 0; q < field.length; q++) {
            const o = q * 4;
            img.data[o] = ir; img.data[o + 1] = ig; img.data[o + 2] = ib;
            img.data[o + 3] = Math.min(255, field[q] * 120);
          }
          gA.putImageData(img, 0, 0);
          const bw = Math.max(2, Math.round(cols / 3)), bh = Math.max(2, Math.round(rows / 3));
          if (ghostB.width !== bw || ghostB.height !== bh) { ghostB.width = bw; ghostB.height = bh; }
          gB.clearRect(0, 0, bw, bh);
          gB.imageSmoothingEnabled = true;
          gB.drawImage(ghostA, 0, 0, bw, bh);
          c.save();
          c.globalAlpha = 0.32;
          c.imageSmoothingEnabled = true;
          c.imageSmoothingQuality = 'high';
          const shift = sp * 1.6;
          c.drawImage(ghostB, ox - sp * 0.5 + shift, oy - sp * 0.5 + shift * 0.6, cols * sp, rows * sp);
          c.restore();
        }

        // Dots: one path for the whole grid (fast), radius from the field + cursor glow.
        const maxR = sp * 0.5 * P.dotSize;
        const baseR = Math.max(0.45, sp * 0.06);
        const shape = P.shape;
        c.fillStyle = pal.ink;
        c.beginPath();
        n = 0;
        for (let j = 0; j < rows; j++) {
          const y = oy + j * sp;
          for (let i = 0; i < cols; i++) {
            const x = ox + i * sp;
            let f = smooth(0.06, 1.25, field[n++]);
            if (hover > 0) {
              const dx = x / H - fmx, dy = y / H - fmy;
              f += Math.exp(-(dx * dx + dy * dy) / 0.006) * 0.45 * hover * (0.35 + f);
            }
            const rr = baseR + (maxR - baseR) * Math.min(1.3, f);
            if (shape === 'Square') c.rect(x - rr * 0.88, y - rr * 0.88, rr * 1.76, rr * 1.76);
            else if (shape === 'Plus') {
              const w = Math.max(0.6, rr * 0.55);
              c.rect(x - rr, y - w / 2, rr * 2, w);
              c.rect(x - w / 2, y - rr, w, rr * 2);
            } else { c.moveTo(x + rr, y); c.arc(x, y, rr, 0, Math.PI * 2); }
          }
        }
        c.fill();

        // Flares: thin vertical + horizontal glow lines crossing at a bright star.
        const count = P.flares;
        const I = P.flare;
        if (count > 0 && I > 0) {
          for (let i = 0; i < count; i++) {
            const fl = flares[i];
            const fx = (i === 0 ? main.x : fl.x + Math.sin(t * 0.07 + fl.ph) * 0.05) * W;
            const fy = (i === 0 ? main.y : fl.y + Math.cos(t * 0.05 + fl.ph) * 0.06) * H;
            const col = fl.col === 0 ? pal.c1 : pal.c2;
            const pulse = 0.85 + Math.sin(t * 1.3 + fl.ph) * 0.15;
            drawFlare(c, W, H, fx, fy, col, pal.c4, I * pulse * fl.s * (i === 0 ? 1.15 : 0.9), i === 0 || i === 2);
          }
        }
        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    // One flare: full-height vertical glow line, horizontal line, soft halo and a 4-point star.
    function drawFlare(c, W, H, x, y, col, hot, I, vertical) {
      c.save();
      const a = Math.min(1, I);
      // Vertical beam (the long one), fading toward top/bottom.
      if (vertical) {
        const bw = W * 0.035 * Math.max(0.6, I);
        const g = c.createLinearGradient(x - bw, 0, x + bw, 0);
        g.addColorStop(0, hexA(col, 0));
        g.addColorStop(0.5, hexA(col, 0.55 * a));
        g.addColorStop(1, hexA(col, 0));
        c.fillStyle = g;
        c.fillRect(x - bw, 0, bw * 2, H);
        const core = c.createLinearGradient(x - 2, 0, x + 2, 0);
        core.addColorStop(0, hexA(hot, 0));
        core.addColorStop(0.5, hexA(hot, 0.7 * a));
        core.addColorStop(1, hexA(hot, 0));
        c.fillStyle = core;
        c.fillRect(x - 2, 0, 4, H);
      }
      // Horizontal line, thinner and fainter.
      const hw = H * 0.006 * Math.max(0.6, I);
      const hg = c.createLinearGradient(0, y - hw, 0, y + hw);
      hg.addColorStop(0, hexA(col, 0));
      hg.addColorStop(0.5, hexA(col, 0.4 * a));
      hg.addColorStop(1, hexA(col, 0));
      c.fillStyle = hg;
      c.fillRect(0, y - hw, W, hw * 2);
      // Halo.
      const R = W * 0.16 * I;
      const rg = c.createRadialGradient(x, y, 0, x, y, R);
      rg.addColorStop(0, hexA(hot, 0.9 * a));
      rg.addColorStop(0.15, hexA(col, 0.6 * a));
      rg.addColorStop(1, hexA(col, 0));
      c.fillStyle = rg;
      c.fillRect(x - R, y - R, R * 2, R * 2);
      // 4-point star core, brightened with 'screen'.
      c.globalCompositeOperation = 'screen';
      const s = W * 0.05 * I, k = s * 0.12;
      c.fillStyle = hexA(hot, 0.95 * a);
      c.beginPath();
      c.moveTo(x, y - s * 1.6);
      c.quadraticCurveTo(x + k, y - k, x + s, y);
      c.quadraticCurveTo(x + k, y + k, x, y + s * 1.6);
      c.quadraticCurveTo(x - k, y + k, x - s, y);
      c.quadraticCurveTo(x - k, y - k, x, y - s * 1.6);
      c.fill();
      c.restore();
    }

    return { resize: stage.resize, frame: stage.frame, dispose: stage.dispose };
  },
};
