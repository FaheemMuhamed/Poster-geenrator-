// Dev-only capture tool (capture.html). Drives the real poster engine to produce:
//   public/previews/<mode>.mp4 + .jpg   short clips for the sidebar hover cards
//   public/examples/e-<n>.webp           example posters (512 px) for Explore
//   public/examples/atlas.webp           all examples packed into one texture
//   public/examples/examples.json        each example's full settings + atlas cell
// Keep this tab visible while it runs: hidden tabs pause animation.
import './fonts.css';
import { GOOGLE_FONTS_CSS, FONTS_LIBRARY } from '../js/shared/fonts.js';
import { createEngine, DEFAULT_STATE } from '../js/engine.js';
import { MODES, loadMode } from '../js/modes/index.js';
import { PALETTES } from '../js/shared/palettes.js';
import { LAYOUTS, loadFont } from '../js/shared/typeLayer.js';
import { composite, settingsOf } from '../js/shared/export.js';
import { makeRandom } from '../js/shared/random.js';

document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: GOOGLE_FONTS_CSS }));

const $ = (id) => document.getElementById(id);
const log = (m) => { $('log').textContent += m + '\n'; $('log').scrollTop = 1e9; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Atlas cell size; examples are always A-series portrait so every cell matches.
const CELL_W = 256, CELL_H = 362, ATLAS_COLS = 16;
const COUNT = 120;

const viewport = $('viewport');
function setViewport(w, h) { viewport.style.width = w + 'px'; viewport.style.height = h + 'px'; }

const engine = createEngine({
  els: { viewport, stage: $('stage'), scene: $('scene'), typeCanvas: $('type-layer') },
  notify: log,
  embed: true,
});
const sceneCanvas = () => $('scene').querySelector('canvas');

async function upload(dir, name, blob) {
  const r = await fetch(`/__capture?dir=${dir}&name=${name}`, { method: 'POST', body: blob });
  if (!r.ok) throw new Error(`upload failed: ${name}`);
}
const toBlob = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));

// A slow figure-eight "cursor" so previews show the mouse interaction.
function moveCursor(t) {
  const r = $('scene').getBoundingClientRect();
  const x = r.left + r.width * (0.5 + 0.3 * Math.sin(t * 1.3));
  const y = r.top + r.height * (0.5 + 0.22 * Math.sin(t * 2.6));
  $('scene').dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
}

async function settle(settings, ms) {
  engine.load(settings);
  await new Promise((r) => loadFont(engine.state.text, r));
  await sleep(ms);
}

// ---------- Mode preview clips ----------
const PREVIEW_PALETTE = {
  pills: 'Chromatography', halftone: 'Halftone Ice', collage: 'Lilac Sky', orbit: 'Sunset Bloom', ascii: 'Ink Wash',
  particles: 'Neuro Violet', blob: 'Neon Pulse', ribbons: 'Sunset Bloom', type3d: 'Lilac Sky', terrain: 'Night Petal',
  aura: 'Sunset Bloom', ink: 'Chromatography', liquidtype: 'Neon Pulse', rd: 'Halftone Ice', voronoi: 'Neuro Violet',
};

async function recordPreviews() {
  setViewport(240, 340);
  // capture.html?only=dither,prism records just those entries.
  const only = new URLSearchParams(location.search).get('only')?.split(',').filter(Boolean);
  for (const m of MODES.filter((x) => !only || only.includes(x.id))) {
    const palette = PREVIEW_PALETTE[m.id] || 'Chromatography';
    await settle({ mode: m.id, seed: 7, palette, colors: PALETTES[palette], ui: { ambient: false },
      text: { ...DEFAULT_STATE.text, layout: '12-field', lines: { title: m.name, subtitle: '', date: '', venue: '', footer: '' } } }, 1500);
    const { w, h } = { w: $('stage').offsetWidth, h: $('stage').offsetHeight };
    const out = document.createElement('canvas');
    composite(out, sceneCanvas(), w, h, 2, engine.state);
    await upload('previews', `${m.id}.jpg`, await toBlob(out, 'image/jpeg', 0.82));

    const rec = new MediaRecorder(out.captureStream(30), { mimeType: 'video/mp4;codecs=avc1', videoBitsPerSecond: 700_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => { rec.onstop = r; });
    rec.start();
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        moveCursor(t);
        composite(out, sceneCanvas(), w, h, 2, engine.state);
        if (t < 3) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/mp4' });
    await upload('previews', `${m.id}.mp4`, blob);
    log(`✓ ${m.id}  ${(blob.size / 1024).toFixed(0)} KB`);
  }
  log('Previews done.');
}

// ---------- Example posters ----------
const COPY = [
  ['Night Signals', 'Audiovisual live set', '14.02.27', 'Halle 3', 'Doors 21:00'],
  ['Soft Machines', 'Group exhibition', '03.05 → 28.05', 'Kunsthalle Ost', 'Free entry'],
  ['Field Notes', 'A talk on generative form', 'Thu 19:30', 'Room 204', 'Design School'],
  ['Afterglow', 'Album release', '09.09.26', 'The Lantern', 'With guests'],
  ['Open Studio', 'Printmaking weekend', 'Sat–Sun', 'Atelier Nord', '10–18h'],
  ['Parallel', 'Film series', 'Every Friday', 'Cinema Lumen', '35mm'],
  ['Slow Light', 'Photography', '12 → 30 Nov', 'Gallery Mira', 'Opening 6pm'],
  ['Noise Garden', 'Experimental music', '22.04.27', 'Botanic Hall', 'Tickets at the door'],
  ['Type Club', 'Lettering meetup', 'Monthly', 'Studio Kern', 'Bring a pen'],
  ['Wavelength', 'Festival of sound', '06–08 Jul', 'Riverside', '3 days · 40 acts'],
  ['Loose Ends', 'Graduation show', '15.06.27', 'Main Building', 'Class of 2027'],
  ['Common Ground', 'Panel discussion', 'Wed 18:00', 'Library Hall', 'Open to all'],
  ['Prism', 'Light installation', 'Dusk till late', 'Harbour Front', 'Winter edition'],
  ['Hidden Rooms', 'Architecture tour', 'Sundays', 'Old Town', 'Meet at the clock'],
  ['Echo Chamber', 'Club night', '31.12.26', 'Basement', 'Until sunrise'],
  ['Material Matters', 'Craft biennale', '01 → 20 Oct', 'Design Museum', 'Workshops daily'],
];
const SERIOUS = FONTS_LIBRARY.filter((f) => ['Sans', 'Serif', 'Display', 'Experimental'].includes(f.category)).map((f) => f.name);
const BODY = FONTS_LIBRARY.filter((f) => ['Sans', 'Mono'].includes(f.category)).map((f) => f.name);
const FX_LOOKS = [{}, { grain: 0.15 }, { soft: 0.5, grain: 0.2 }, { halftone: true, halftoneSize: 6 }, { dither: true, ditherLevels: 3, grain: 0.2 }, { bloom: 0.8, grain: 0.12 }];

async function makeExample(i, r) {
  const meta = MODES[i % MODES.length];
  const def = await loadMode(meta.id);
  // Nudge the essentials away from defaults, but stay in the middle of each range.
  const params = {};
  for (const [k, p] of Object.entries(def.params)) {
    if (p.rebuild && /count|grid|quality|tiles|rows|lanes/i.test(k)) continue;
    if (typeof p.value === 'number' && p.min !== undefined && r() < 0.5) {
      const v = p.min + (p.max - p.min) * r.range(0.25, 0.75);
      params[k] = p.step ? Math.round(v / p.step) * p.step : v;
    } else if (p.options && r() < 0.3) params[k] = r.pick(p.options);
  }
  const palette = r.pick(Object.keys(PALETTES));
  const [title, subtitle, date, venue, footer] = r.pick(COPY);
  return {
    mode: meta.id, seed: r.int(1, 99999), format: 'A-series (portrait)', palette, colors: { ...PALETTES[palette] },
    ui: { ambient: false },
    fx: { ...DEFAULT_STATE.fx, ...r.pick(FX_LOOKS) },
    text: {
      ...DEFAULT_STATE.text, lines: { title, subtitle, date, venue, footer },
      font: r.pick(SERIOUS), bodyFont: r.pick(BODY), weight: r.pick([400, 600, 700, 900]),
      layout: r.pick(LAYOUTS), textCase: r.pick(['As typed', 'As typed', 'UPPERCASE']),
      size: r.range(0.85, 1.25), tracking: r.pick([0, 0, -20, 40]),
    },
    params: { [meta.id]: params },
  };
}

async function renderExamples() {
  setViewport(CELL_W * 2, CELL_H * 2);
  const r = makeRandom(20261030);
  const rows = Math.ceil(COUNT / ATLAS_COLS);
  const atlas = document.createElement('canvas');
  atlas.width = CELL_W * ATLAS_COLS; atlas.height = CELL_H * rows;
  const actx = atlas.getContext('2d');
  const list = [];
  for (let i = 0; i < COUNT; i++) {
    const s = await makeExample(i, r);
    await settle(s, s.mode === 'type3d' || s.mode === 'rd' ? 2200 : 1300);
    moveCursor(i * 0.7);
    await sleep(120);
    const w = $('stage').offsetWidth, h = $('stage').offsetHeight;
    const big = composite(document.createElement('canvas'), sceneCanvas(), w, h, 512 / w, engine.state);
    await upload('examples', `e-${i}.webp`, await toBlob(big, 'image/webp', 0.86));
    actx.drawImage(big, (i % ATLAS_COLS) * CELL_W, Math.floor(i / ATLAS_COLS) * CELL_H, CELL_W, CELL_H);
    const meta = MODES.find((m) => m.id === s.mode);
    list.push({ id: i, cell: i, mode: s.mode, name: meta.name, group: meta.group, tags: meta.tags,
      title: s.text.lines.title, palette: s.palette, colors: s.colors, settings: settingsOf(engine.state) });
    log(`✓ ${i + 1}/${COUNT}  ${meta.name} · ${s.palette} · ${s.text.layout}`);
  }
  await upload('examples', 'atlas.webp', await toBlob(atlas, 'image/webp', 0.82));
  const json = { cell: [CELL_W, CELL_H], cols: ATLAS_COLS, rows, examples: list };
  await upload('examples', 'examples.json', new Blob([JSON.stringify(json)], { type: 'application/json' }));
  log('Examples done.');
}

// One job at a time: two runs would fight over the same poster.
let busy = false;
const run = (job) => async () => {
  if (busy) return log('Already running. Wait for it to finish.');
  busy = true;
  document.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try { await job(); } catch (e) { log('✗ ' + e.message); }
  busy = false;
  document.querySelectorAll('button').forEach((b) => { b.disabled = false; });
};
$('run-previews').onclick = run(recordPreviews);
$('run-examples').onclick = run(renderExamples);
window.capture = { recordPreviews: run(recordPreviews), renderExamples: run(renderExamples), all: run(async () => { await recordPreviews(); await renderExamples(); }), engine };
