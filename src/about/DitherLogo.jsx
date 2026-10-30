import { useEffect, useRef } from 'react';
import { themeColor, useTheme } from '../useTheme.js';

// The homepage wordmark, printed rather than typeset: the seal + "Morva" are rasterised
// into a coarse grid, ordered-dithered (Bayer 4×4), and a signal-orange layer bleeds out
// slightly off-register underneath. Near the cursor the ink spreads and the bleed widens.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const CELL = 2.5; // css px per dither cell
const ASPECT = 0.3; // height / width

export default function DitherLogo({ className = '' }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const theme = useTheme();

  useEffect(() => {
    const box = boxRef.current, canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Low-res masks: sharp letters, a slightly soft version, and a wide bleed.
    const mk = () => { const c = document.createElement('canvas'); return [c, c.getContext('2d', { willReadFrequently: true })]; };
    const [sharpC, sharpX] = mk(), [softC, softX] = mk(), [wideC, wideX] = mk(), [sealC, sealX] = mk();
    let cols = 0, rows = 0, dpr = 1, raf = 0, alive = true;
    let ink = '#111', signal = '#ff4a1c';
    const pointer = { x: -1, y: -1, over: 0, amt: 0 };

    const readColors = () => { ink = themeColor('--foreground') || ink; signal = themeColor('--signal') || signal; };

    function resize() {
      const w = box.clientWidth, h = Math.round(w * ASPECT);
      dpr = Math.min(devicePixelRatio, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
      cols = Math.ceil(w / CELL); rows = Math.ceil(h / CELL);
      for (const c of [sharpC, softC, wideC, sealC]) { c.width = cols; c.height = rows; }
    }

    // Draws the letters into the sharp mask, and the seal (a disc that morphs into a square) into its own.
    function drawMask(t) {
      const x = sharpX;
      x.clearRect(0, 0, cols, rows);
      x.fillStyle = '#000';
      const fs = rows * 0.86;
      const s = rows * 0.3, sx = rows * 0.06, sy = rows * 0.42 - s * 0.1;
      const r = (s / 2) * (0.5 + 0.5 * Math.cos(t * 0.7));
      sealX.clearRect(0, 0, cols, rows);
      sealX.fillStyle = '#000';
      sealX.beginPath(); sealX.roundRect(sx, sy, s, s, Math.max(0.5, r)); sealX.fill();
      x.font = `italic 400 ${fs}px Newsreader, Georgia, serif`;
      x.textBaseline = 'alphabetic';
      x.fillText('Morva', sx + s + rows * 0.12, rows * 0.74);
      softX.clearRect(0, 0, cols, rows); softX.filter = 'blur(0.6px)'; softX.drawImage(sharpC, 0, 0); softX.filter = 'none';
      wideX.clearRect(0, 0, cols, rows); wideX.filter = `blur(${rows * 0.05}px)`; wideX.drawImage(sharpC, 0, 0); wideX.filter = 'none';
    }

    function render(t) {
      drawMask(t);
      const soft = softX.getImageData(0, 0, cols, rows).data;
      const wide = wideX.getImageData(0, 0, cols, rows).data;
      const seal = sealX.getImageData(0, 0, cols, rows).data;
      pointer.amt += (pointer.over - pointer.amt) * 0.08;
      const pc = pointer.x / CELL, pr = pointer.y / CELL, rad = rows * 0.55;
      const c = CELL * dpr;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Bleed layer, off-register by a couple of cells (more under the cursor).
      const off = 2 + pointer.amt * 2;
      ctx.fillStyle = signal;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const si = Math.round(i - off), sj = Math.round(j - off * 0.5);
          if (si < 0 || sj < 0 || si >= cols || sj >= rows) continue;
          const d = Math.hypot(i - pc, j - pr) / rad;
          const near = pointer.amt * Math.exp(-d * d);
          const v = (wide[(sj * cols + si) * 4 + 3] / 255) * (0.55 + near * 0.9);
          if (v > BAYER[((j + 2) & 3) * 4 + ((i + 1) & 3)]) ctx.rect(i * c, j * c, c, c);
        }
      }
      ctx.fill();

      // The seal, always signal orange, dithered at full strength.
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          if (seal[(j * cols + i) * 4 + 3] / 255 > BAYER[(j & 3) * 4 + (i & 3)]) ctx.rect(i * c, j * c, c * 0.92, c * 0.92);
        }
      }
      ctx.fill();

      // Ink layer: mostly crisp, spreading into the wide mask near the cursor.
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = (j * cols + i) * 4 + 3;
          const d = Math.hypot(i - pc, j - pr) / rad;
          const near = pointer.amt * Math.exp(-d * d);
          // A light tonal gradient (paler at the top) lets the dither show inside the letters.
          const tone = 0.62 + 0.5 * (j / rows);
          const v = ((soft[k] / 255) * (1 - near * 0.6) + (wide[k] / 255) * near * 1.1) * tone;
          if (v > BAYER[(j & 3) * 4 + (i & 3)]) ctx.rect(i * c, j * c, c * 0.92, c * 0.92);
        }
      }
      ctx.fill();
    }

    const loop = (now) => {
      if (!alive) return;
      render(now / 1000);
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e) => { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.over = 1; };
    const onLeave = () => { pointer.over = 0; };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    const ro = new ResizeObserver(() => { resize(); if (reduced) render(0); });

    readColors();
    document.fonts.load('italic 400 64px Newsreader').finally(() => {
      if (!alive) return;
      resize();
      ro.observe(box);
      if (reduced) render(0); else raf = requestAnimationFrame(loop);
    });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [theme]);

  return (
    <div ref={boxRef} className={className}>
      <h1 className="sr-only">Morva</h1>
      <canvas ref={canvasRef} aria-hidden="true" className="block w-full" />
    </div>
  );
}
