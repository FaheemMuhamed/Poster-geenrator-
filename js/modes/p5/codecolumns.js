// Code Columns: the poster's words, spelled down columns of monospace letter tiles, stream in
// from the top, stack on a grey ground and shed tiles that tumble and pile up beside them.
// After a while the floor opens, the pile drops out and the next wave rains in (ref: falling
// columns of code on coloured tiles). Tiles are simple 1D stacks per slot plus free bodies.
import { createP5Stage } from '../../shared/p5Stage.js';
import { drawGrain } from '../../shared/bloom2d.js';
import { fontCss } from '../../shared/typeLayer.js';

const MONO = (px) => `700 ${px}px "JetBrains Mono", "Martian Mono", ui-monospace, Menlo, monospace`;
const SEPS = ['(', ')', ';', '=', '.', ',', '{', '}', '&', '!', '"', ':', '[', ']', '<', '>', '?', '+', '|', '*'];
const CODE = ['FUNCTION', 'RETURN', 'NULL', 'VOID', 'CONST', 'TYPEOF', 'ONLOAD', 'PUSH', 'SLICE', 'TRUE',
  'ELSE', 'VAR', 'NEW', 'THIS', 'ASYNC', 'AWAIT', 'LOOP', 'MAP', 'ERROR', 'STRING', 'OBJECT'];
const MAX_TILES = 1800;

// Mix two #rrggbb colours.
function mixHex(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function roundRectPath(g, x, y, w, h, rad) {
  const r = Math.min(rad, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export default {
  id: 'codecolumns',
  name: 'Code Columns',
  engine: 'p5',
  ownsText: true,
  hint: 'Hover to scatter the tiles · click to knock a column over',
  params: {
    columns:  { value: 16, min: 4, max: 36, step: 1, label: 'Columns', rebuild: true },
    tile:     { value: 1, min: 0.6, max: 1.6, step: 0.01, label: 'Tile size' },
    fall:     { value: 1, min: 0.2, max: 3, step: 0.01, label: 'Fall speed' },
    scatter:  { value: 0.6, min: 0, max: 1.5, step: 0.01, label: 'Scatter' },
    variety:  { value: 0.75, min: 0, max: 1, step: 0.01, label: 'Colour variety' },
    length:   { value: 1, min: 0.3, max: 1.4, step: 0.01, label: 'Column length' },
    ground:   { value: 0.05, min: 0, max: 0.25, step: 0.005, label: 'Ground offset' },
    hold:     { value: 7, min: 2, max: 20, step: 0.5, label: 'Hold time' },
    face:     { value: 'Mono', options: ['Mono', 'Poster font'], label: 'Letter font' },
  },
  controls: {
    essentials: ['columns', 'tile', 'fall', 'scatter'],
    groups: { Columns: ['length', 'variety', 'face'], Ground: ['ground', 'hold'] },
  },

  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;

    let tiles = [];
    let slots = [];
    const G = { W: 0, H: 0, s: 20, pitch: 21, x0: 0, n: 0, from: 0, floorY: 0 };
    let waveT = 0, waveEnd = 1e9, pendingWave = -1;
    let geomKey = '';

    // ---- Words: the poster's lines broken into tokens, plus code words ----
    function caseOf(s) {
      const c = ctx.state.text.textCase;
      return c === 'lowercase' ? s.toLowerCase() : s.toUpperCase();
    }
    function userWords() {
      const L = ctx.state.text.lines;
      const out = [];
      for (const k of ['title', 'subtitle', 'date', 'venue', 'footer']) {
        String(L[k] || '').split(/\s+/).forEach((w) => { if (w) out.push(caseOf(w)); });
      }
      return out;
    }
    const titleWord = () => caseOf(String(ctx.state.text.lines.title || '').replace(/\s+/g, ''));

    // Colour pool by variety: fills 0..3 = c1..c4, 4 = ink, 5 = bg.
    function pickFill(pool) { return pool[(r() * pool.length) | 0]; }
    function poolNow() {
      const order = [0, 4, 1, 2, 5, 3];
      const n = 1 + Math.round(P.variety * 5);
      return order.slice(0, n);
    }

    // A column's characters, top to bottom, each with a tile colour.
    function streamSeq(n, withTitle) {
      const words = userWords();
      const pool = poolNow();
      const seq = [];
      const addTok = (tok, sep) => {
        let fill = pickFill(pool);
        for (const ch of tok) {
          if (r() < P.variety * (sep ? 0.8 : 0.28)) fill = pickFill(pool);
          seq.push({ ch, fill });
        }
      };
      if (withTitle && titleWord()) { addTok(titleWord(), false); addTok(r.pick(SEPS), true); }
      while (seq.length < n) {
        addTok(words.length && r() < 0.6 ? r.pick(words) : caseOf(r.pick(CODE)), false);
        const k = r.int(0, 2);
        for (let i = 0; i < k; i++) addTok(r.pick(SEPS), true);
      }
      return seq.slice(0, n);
    }

    function geometry(W, H) {
      let s = H * 0.032 * P.tile;
      let pitch = s * 1.06;
      if (P.columns * pitch > W * 0.92) { pitch = (W * 0.92) / P.columns; s = pitch / 1.06; }
      const n = Math.max(P.columns, Math.floor((W - pitch * 0.2) / pitch));
      Object.assign(G, {
        W, H, s, pitch, n,
        x0: (W - n * pitch) / 2 + pitch / 2,
        from: Math.floor((n - P.columns) / 2),
        floorY: H * (1 - P.ground),
      });
      slots = Array.from({ length: n }, (_, i) => ({ x: G.x0 + i * pitch, list: [], restTop: G.floorY }));
    }

    function spawnStream(slot, delayPx, withTitle, lenScale = 1) {
      const { s, floorY } = G;
      const n = Math.max(4, Math.round(P.length * lenScale * (floorY / s) * r.range(0.5, 1)));
      const seq = streamSeq(n, withTitle);
      const y0 = -s / 2 - delayPx;
      const vmax = G.H * 0.9 * P.fall;
      for (let k = 0; k < n; k++) {
        const it = seq[n - 1 - k];
        tiles.push({ ch: it.ch, fill: it.fill, x: slots[slot].x, y: y0 - k * s, vx: 0, vy: vmax * 0.7, a: 0, va: 0,
          loose: false, slot, old: false, rest: 0, glitch: 0, gch: '' });
      }
      return (delayPx + n * s + floorY) / vmax;
    }

    function newWave() {
      const cols = P.columns;
      const mid = (cols - 1) / 2;
      let longest = 0;
      for (let i = 0; i < cols; i++) {
        // Centre columns arrive first, the outer ones trail in.
        const delay = (Math.abs(i - mid) / Math.max(1, mid)) * G.H * 0.45 + r.range(0, G.H * 0.3);
        longest = Math.max(longest, spawnStream(G.from + i, delay, i % 3 === 1));
      }
      waveT = 0;
      waveEnd = longest + 1.2;
      pendingWave = -1;
    }

    function reset(W, H) {
      tiles = [];
      geometry(W, H);
      newWave();
    }

    function loosen(t) { t.loose = true; t.rest = 0; }

    // ---- Tile sprites (rounded tile + letter), cached per char/colour ----
    const cache = new Map();
    let cacheKey = '';
    function sprite(ch, fill, s, d, pal, T) {
      const key = ch + '\u0001' + fill;
      let cv = cache.get(key);
      if (cv) return cv;
      if (cache.size > 900) cache.clear();
      const px = Math.max(4, Math.ceil(s * d));
      cv = document.createElement('canvas');
      cv.width = cv.height = px;
      const g = cv.getContext('2d');
      g.scale(px / s, px / s);
      const fills = [pal.c1, pal.c2, pal.c3, pal.c4, pal.ink, pal.bg];
      roundRectPath(g, 0.5, 0.5, s - 1, s - 1, s * 0.14);
      g.fillStyle = fills[fill];
      g.fill();
      g.fillStyle = fill === 4 ? pal.bg : pal.ink;
      g.font = P.face === 'Mono' ? MONO(s * 0.7) : fontCss(T, s * 0.68);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, s / 2, s * 0.54);
      cache.set(key, cv);
      return cv;
    }

    let alive = true;
    document.fonts?.ready.then(() => { if (alive) cache.clear(); });

    const stage = createP5Stage(ctx, {
      setup(p) { p.noStroke(); },
      draw(p, t, dt) {
        const W = p.width, H = p.height, c = p.drawingContext;
        const d = p.pixelDensity();
        const pal = ctx.palette;
        const T = ctx.state.text;
        const mouse = ctx.pointer;
        const mPow = ctx.state.motion.mouse;
        const step = Math.min(dt, 1 / 30);

        const gk = [W, H, P.tile].join('|');
        if (gk !== geomKey) { geomKey = gk; reset(W, H); }
        G.floorY = H * (1 - P.ground);
        const { s, floorY } = G;
        const g = H * 2.4 * P.fall;
        const vmax = H * 0.9 * P.fall;

        // ---- Wave cycle: hold, then open the floor and rain in the next wave ----
        waveT += step;
        if (pendingWave < 0 && waveT > waveEnd + P.hold) {
          for (const tl of tiles) tl.old = true;
          pendingWave = 0.45;
        }
        if (pendingWave >= 0) { pendingWave -= step; if (pendingWave < 0) newWave(); }

        // ---- Click: knock the nearest column over and drop a fresh word into it ----
        if (mouse.justPressed && mouse.inside) {
          const mx = mouse.x * W;
          const si = Math.max(0, Math.min(G.n - 1, Math.round((mx - G.x0) / G.pitch)));
          for (let k = -1; k <= 1; k++) {
            const sl = si + k;
            if (sl < 0 || sl >= G.n) continue;
            const str = k === 0 ? 1 : 0.55;
            const dir = k !== 0 ? Math.sign(k) : (r() < 0.5 ? -1 : 1);
            for (const tl of tiles) {
              if (tl.loose || tl.slot !== sl || tl.old || tl.y > floorY) continue;
              const h = (floorY - tl.y) / H; // taller = faster, like a falling pole
              loosen(tl);
              tl.vx = dir * (s * 3 + h * H * 2.2) * str * r.range(0.8, 1.2);
              tl.vy = -r.range(0, s * 7) * str;
              tl.va = dir * r.range(2, 7) * (0.4 + h);
            }
          }
          if (si >= G.from && si < G.from + P.columns) spawnStream(si, H * 0.08, true, 0.8);
          else spawnStream(G.from + r.int(0, P.columns - 1), H * 0.08, true, 0.8);
          waveT = Math.min(waveT, waveEnd - 1);
        }

        // ---- Column stacks ----
        for (const sl of slots) { sl.list.length = 0; sl.restTop = floorY; }
        for (const tl of tiles) if (!tl.loose) slots[tl.slot].list.push(tl);
        const knock = [];
        const breakRate = P.scatter * 0.014 * step;
        for (const sl of slots) {
          const L = sl.list;
          L.sort((a, b) => b.y - a.y);
          let surf = Infinity, belowV = 0, resting = true;
          const ease = 1 - Math.exp(-step * 10);
          for (const tl of L) {
            tl.vy = Math.min(tl.vy + g * step, vmax);
            tl.y += tl.vy * step;
            const fl = tl.old ? Infinity : floorY;
            const onTile = surf <= fl;
            const top = onTile ? surf : fl;
            let landed = false;
            if (tl.y + s / 2 >= top) {
              const impact = tl.vy - (onTile ? belowV : 0);
              tl.y = top - s / 2;
              tl.vy = onTile ? belowV : 0;
              landed = true;
              if (impact > H * 0.45 && r() < P.scatter * 0.06) knock.push([tl, impact]);
            } else if (tl.vy > vmax * 0.5 && tl.y > 0 && r() < breakRate) knock.push([tl, 0]);
            if (resting && landed && !tl.old) sl.restTop = tl.y - s / 2; else resting = false;
            surf = tl.y - s / 2;
            belowV = tl.vy;
            tl.x += (sl.x - tl.x) * ease;
            const q = Math.round(tl.a / (Math.PI / 2)) * (Math.PI / 2);
            tl.a += (q - tl.a) * ease;
          }
        }
        // Splashes and break-offs: tiles leap out sideways and tumble.
        for (const [tl, impact] of knock) {
          loosen(tl);
          const dir = r() < 0.5 ? -1 : 1;
          tl.vx = dir * s * r.range(2, 12) * (0.5 + P.scatter * 0.5);
          tl.vy = impact > 0 ? -impact * r.range(0.15, 0.45) : tl.vy * 0.5;
          tl.va = dir * r.range(2, 9);
        }

        // ---- Hover: tiles near the cursor get shoved aside ----
        const hov = mouse.inside && mPow > 0 && step > 0;
        if (hov) {
          const mx = mouse.x * W, my = mouse.y * H;
          const Rh = s * (1.3 + 0.9 * Math.min(2, mPow));
          const spd = Math.hypot(mouse.vx * W, mouse.vy * H);
          const pK = Math.min(1, (0.03 + spd * 0.05) * mPow);
          for (const tl of tiles) {
            const dx = tl.x - mx, dy = tl.y - my;
            const d2 = dx * dx + dy * dy;
            if (d2 > Rh * Rh) continue;
            const dd = Math.sqrt(d2) || 1;
            if (!tl.loose) {
              if (r() < pK) {
                loosen(tl);
                const dir = Math.sign(dx) || (r() < 0.5 ? -1 : 1);
                tl.vx = dir * s * r.range(5, 14) * Math.min(2, mPow) + mouse.vx * W * 25;
                tl.vy = -s * r.range(2, 8) + mouse.vy * H * 20;
                tl.va = dir * r.range(3, 10);
              }
            } else {
              const f = (1 - dd / Rh) * s * 60 * mPow * step;
              tl.vx += (dx / dd) * f;
              tl.vy += (dy / dd) * f;
            }
          }
        }

        // ---- Loose tiles: free fall, bounce, then settle into the nearest slot ----
        for (const tl of tiles) {
          if (!tl.loose) continue;
          const px = tl.x, py = tl.y;
          tl.vy = Math.min(tl.vy + g * step, vmax * 1.5);
          tl.x += tl.vx * step;
          tl.y += tl.vy * step;
          tl.a += tl.va * step;
          if (tl.x < s / 2) { tl.x = s / 2; tl.vx = Math.abs(tl.vx) * 0.5; }
          if (tl.x > W - s / 2) { tl.x = W - s / 2; tl.vx = -Math.abs(tl.vx) * 0.5; }
          if (tl.old) continue;
          const si = Math.max(0, Math.min(G.n - 1, Math.round((tl.x - G.x0) / G.pitch)));
          const surf = slots[si].restTop;
          if (tl.y + s / 2 > surf && tl.vy >= 0) {
            if (surf >= floorY - 0.5 || py + s / 2 <= surf + 2) {
              // Came from above: bounce, lose energy, roll a little.
              tl.y = surf - s / 2;
              tl.vy = -tl.vy * 0.3;
              tl.vx *= 0.7;
              tl.va = tl.va * 0.5 + (tl.vx / s) * 0.2;
              if (Math.abs(tl.vy) < s * 4) { tl.vy = 0; tl.rest += step; tl.vx *= Math.exp(-step * 8); }
            } else {
              // Hit the side of a taller stack: bounce back sideways.
              tl.x = px;
              tl.vx = -tl.vx * 0.45;
            }
          }
          if (tl.rest > 0.12 && Math.abs(tl.vx) < s * 3) {
            tl.loose = false;
            tl.slot = si;
            tl.vy = 0;
            tl.va = 0;
          }
        }

        // Idle detail: a tile now and then flickers to another glyph.
        for (const tl of tiles) {
          if (tl.glitch > 0) tl.glitch -= step;
          else if (step > 0 && r() < 0.0012) { tl.glitch = r.range(0.08, 0.25); tl.gch = r() < 0.5 ? r.pick(SEPS) : String.fromCharCode(65 + r.int(0, 25)); }
        }

        // Retire tiles that fell out; cap the total.
        tiles = tiles.filter((tl) => tl.y < H + s * 2);
        if (tiles.length > MAX_TILES) tiles.splice(0, tiles.length - MAX_TILES);

        // ---- Draw ----
        const ck = [s, d, pal.bg, pal.ink, pal.c1, pal.c2, pal.c3, pal.c4, P.face, T.font, T.weight].join('|');
        if (ck !== cacheKey) { cacheKey = ck; cache.clear(); }
        c.save();
        c.fillStyle = mixHex(pal.bg, pal.ink, 0.1);
        c.fillRect(0, 0, W, H);
        // Ground band.
        if (floorY < H) {
          c.fillStyle = mixHex(pal.bg, pal.ink, 0.2);
          c.fillRect(0, floorY, W, H - floorY);
          c.fillStyle = mixHex(pal.bg, pal.ink, 0.35);
          c.fillRect(0, floorY, W, 1);
        }
        c.imageSmoothingEnabled = true;
        const drawTile = (tl) => {
          if (tl.y < -s || tl.y > H + s) return;
          const img = sprite(tl.glitch > 0 ? tl.gch : tl.ch, tl.fill, s, d, pal, T);
          if (Math.abs(tl.a) < 0.005) c.drawImage(img, tl.x - s / 2, tl.y - s / 2, s, s);
          else {
            c.save();
            c.translate(tl.x, tl.y);
            c.rotate(tl.a);
            c.drawImage(img, -s / 2, -s / 2, s, s);
            c.restore();
          }
        };
        for (const tl of tiles) if (!tl.loose) drawTile(tl);
        for (const tl of tiles) if (tl.loose) drawTile(tl);

        // Small caption in the ground band.
        const band = H - floorY;
        if (T.show && band > 14) {
          const L = T.lines;
          const fs = Math.min(band * 0.38, Math.min(W, H) * 0.022);
          const m = Math.min(W, H) * 0.045;
          c.font = MONO(fs);
          c.fillStyle = pal.ink;
          c.textBaseline = 'middle';
          const y = floorY + band / 2;
          const left = [L.date, L.venue].filter(Boolean).map(caseOf).join('  ·  ');
          c.textAlign = 'left';
          if (left) c.fillText(left, m, y);
          c.textAlign = 'right';
          if (L.footer) c.fillText(caseOf(String(L.footer)), W - m, y);
        }
        c.restore();

        drawGrain(c, W, H, ctx.state.grain);
      },
    });

    return {
      resize(w, h, dpr) { stage.resize(w, h, dpr); },
      frame: stage.frame,
      onParam(key) {
        if (key === 'palette' || key === 'text' || key === 'face') cache.clear();
      },
      dispose() { alive = false; cache.clear(); stage.dispose(); },
    };
  },
};
