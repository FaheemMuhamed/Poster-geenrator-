// The poster engine: holds all settings ("state"), runs the animation loop, swaps poster
// modes, and exposes actions the interface calls. It knows nothing about React; the UI
// subscribes to changes and calls the methods below.
import { MODES, loadMode } from './modes/index.js';
import { PALETTES } from './shared/palettes.js';
import { drawType, loadFont } from './shared/typeLayer.js';
import { FX_DEFAULTS } from './shared/postfx.js';
import {
  EXPORT_SIZES, exportPNG, copyPNG, startRecording, encodeState, decodeState,
  settingsOf, embedCode, downloadStandaloneHTML, BLEND_CSS,
} from './shared/export.js';
import { makeRandom } from './shared/random.js';

export { MODES, PALETTES, EXPORT_SIZES };

export const FORMATS = {
  'A-series (portrait)': 1 / Math.SQRT2,
  '4:5 (Instagram)': 0.8,
  '9:16 (Story)': 9 / 16,
  '1:1 (Square)': 1,
  '16:9 (Landscape)': 16 / 9,
};

export const DEFAULT_STATE = {
  mode: 'pills',
  seed: 2026,
  format: 'A-series (portrait)',
  palette: 'Chromatography',
  colors: { ...PALETTES['Chromatography'] },
  bloom: { amount: 0.7, count: 3 },
  grain: 0.25,
  fx: { ...FX_DEFAULTS },
  motion: { speed: 1, mouse: 1, paused: false },
  ui: { ambient: true },
  text: {
    show: true,
    lines: { title: 'Sleepwalker', subtitle: 'Release Party', date: '03.26.26', venue: 'Plot Gallery', footer: 'Los Angeles · 7–10 PM' },
    // font/weight = title face; bodyFont/bodyWeight = everything else.
    font: 'Inter', weight: 600, bodyFont: 'Inter', bodyWeight: 400,
    size: 1, layout: '12-field', color: 'ink', grid: false,
    tracking: 0, bodyTracking: 0,   // in 1/1000 em
    leading: 1,                     // multiplier on each layout's line spacing
    textCase: 'As typed',           // 'As typed' | 'UPPERCASE' | 'lowercase'
    titleStyle: 'Fill',             // 'Fill' | 'Outline'
    blend: 'Normal',                // 'Normal' | 'Difference' | 'Multiply'
  },
  params: {},
};

// Upgrades settings saved by older versions (share links, HTML files, examples).
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const t = raw.text;
  if (t && t.font && !t.bodyFont) { t.bodyFont = t.font; t.bodyWeight = 400; }
  return raw;
}

export function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
  }
  return out;
}

export const isLocal = () =>
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// `els`: { viewport, stage, scene, typeCanvas }. `notify(msg)` shows a toast. `embed`: poster only.
export function createEngine({ els, notify = () => {}, embed = false }) {
  // Settings come from (in order): the link, a downloaded HTML file's baked-in settings, defaults.
  const state = merge(structuredClone(DEFAULT_STATE), migrate(decodeState(location.hash) || window.POSTER_STATE));
  state.textHidden = false;

  // ---------- Change notifications for the UI ----------
  const listeners = new Set();
  let version = 0;
  const emit = () => { version++; listeners.forEach((fn) => fn()); };
  let active = true;
  const saveUrlNow = () => { if (!embed && active && !preview) history.replaceState(null, '', '#' + encodeState(state)); };
  const saveUrl = debounce(saveUrlNow, 300);
  const changed = () => { typeDirty = true; emit(); saveUrl(); };

  // Hover previews keep a copy of what they changed and put it back afterwards.
  let preview = null;
  function beginPreview() {
    if (!preview) preview = { fx: { ...state.fx }, colors: { ...state.colors } };
  }
  function endPreview() {
    if (!preview) return;
    const p = preview;
    preview = null;
    Object.assign(state.fx, p.fx);
    const paletteChanged = Object.keys(p.colors).some((k) => p.colors[k] !== state.colors[k]);
    Object.assign(state.colors, p.colors);
    if (paletteChanged) { typeDirty = true; instance?.onParam?.('palette'); }
    emit();
  }

  // ---------- Pointer (shared with modes) ----------
  // x, y are 0..1 across the poster (y down). vx, vy is the movement since last frame.
  const pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, vx: 0, vy: 0, down: false, inside: false, justPressed: false, justReleased: false };
  const setPointer = (e) => {
    const r = els.stage.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) / r.width;
    pointer.y = (e.clientY - r.top) / r.height;
  };
  // All listeners are removed together on destroy().
  const life = new AbortController();
  const on = { signal: life.signal };
  let destroyed = false;
  els.scene.addEventListener('pointermove', (e) => { setPointer(e); pointer.inside = true; }, on);
  els.scene.addEventListener('pointerenter', () => { pointer.inside = true; }, on);
  els.scene.addEventListener('pointerleave', () => { pointer.inside = false; pointer.down = false; }, on);
  els.scene.addEventListener('pointerdown', (e) => { setPointer(e); pointer.down = true; pointer.justPressed = true; }, on);
  window.addEventListener('pointerup', () => { if (pointer.down) pointer.justReleased = true; pointer.down = false; }, on);

  // ---------- Stage sizing ----------
  let size = { w: 400, h: 566, dpr: 1 };
  let typeDirty = true;
  function fitStage() {
    const r = els.viewport.getBoundingClientRect();
    const pad = embed ? 0 : r.width < 600 ? 16 : 48;
    const aw = r.width - pad * 2, ah = r.height - pad * 2;
    const aspect = FORMATS[state.format] || FORMATS['A-series (portrait)'];
    let w = aw, h = aw / aspect;
    if (h > ah) { h = ah; w = ah * aspect; }
    w = Math.max(80, Math.floor(w)); h = Math.max(80, Math.floor(h));
    size = { w, h, dpr: Math.min(window.devicePixelRatio || 1, 2) };
    els.stage.style.width = w + 'px';
    els.stage.style.height = h + 'px';
    els.typeCanvas.width = w * size.dpr;
    els.typeCanvas.height = h * size.dpr;
    typeDirty = true;
    instance?.resize(w, h, size.dpr);
  }
  const ro = new ResizeObserver(() => fitStage());
  ro.observe(els.viewport);

  function drawTypeLayer() {
    const c = els.typeCanvas.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, els.typeCanvas.width, els.typeCanvas.height);
    els.typeCanvas.style.mixBlendMode = BLEND_CSS[state.text.blend] || 'normal';
    if (state.textHidden && !state.text.grid) return;
    c.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    // Modes that draw their own text still get the grid guides.
    const text = state.textHidden ? { ...state.text, show: false } : state.text;
    drawType(c, size.w, size.h, text, state.colors, { showGrid: state.text.grid && !embed });
  }

  // ---------- Modes ----------
  let mode = null;      // the mode definition (params, create…)
  let instance = null;  // the running poster

  function makeCtx() {
    const id = mode.id;
    return {
      container: els.scene,
      state,
      pointer,
      get params() { return state.params[id]; },
      get palette() { return state.colors; },
      rand: makeRandom(state.seed),
      get time() { return time; },
      markTypeDirty: () => { typeDirty = true; },
    };
  }

  function buildInstance() {
    if (instance) { try { instance.dispose(); } catch (e) { console.warn(e); } }
    els.scene.innerHTML = '';
    instance = mode.create(makeCtx());
    instance.resize(size.w, size.h, size.dpr);
    state.textHidden = !!mode.ownsText;
    typeDirty = true;
  }
  const rebuildSoon = debounce(() => { if (!destroyed) buildInstance(); }, 120);

  let switching = null;
  async function setMode(id) {
    const token = (switching = Symbol());
    let def;
    try { def = await loadMode(id); }
    catch (e) {
      console.error(e);
      notify(`Couldn't load "${MODES.find((m) => m.id === id)?.name || id}"`);
      return;
    }
    if (token !== switching || destroyed) return;
    mode = def;
    state.mode = def.id;
    const defaults = Object.fromEntries(Object.entries(def.params || {}).map(([k, p]) => [k, p.value]));
    state.params[def.id] = { ...defaults, ...(state.params[def.id] || {}) };
    buildInstance();
    changed();
  }

  // ---------- Ambient glow ----------
  // A tiny copy of the poster that CSS blurs and scales into a glow around it
  // (like a TV's ambient light). Never part of exports.
  let frameCount = 0;
  function drawAmbient() {
    const a = els.ambient;
    if (!a || embed) return;
    a.style.opacity = state.ui.ambient ? '' : '0';
    if (!state.ui.ambient) return;
    const w = 32, h = Math.max(8, Math.round(32 * size.h / size.w));
    if (a.width !== w || a.height !== h) { a.width = w; a.height = h; }
    const c = a.getContext('2d');
    const sc = sceneCanvas();
    try {
      c.fillStyle = state.colors.bg;
      c.fillRect(0, 0, w, h);
      if (sc) c.drawImage(sc, 0, 0, w, h);
      c.drawImage(els.typeCanvas, 0, 0, w, h);
    } catch { /* canvas not ready yet */ }
  }

  // ---------- Animation loop ----------
  let time = 0, last = performance.now(), recorder = null, raf = 0;
  const sceneCanvas = () => els.scene.querySelector('canvas');
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const step = state.motion.paused ? 0 : dt * state.motion.speed;
    time += step;
    pointer.vx = pointer.vx * 0.6 + (pointer.x - pointer.px) * 0.4;
    pointer.vy = pointer.vy * 0.6 + (pointer.y - pointer.py) * 0.4;
    pointer.px = pointer.x; pointer.py = pointer.y;

    if (instance) {
      try { instance.frame(time, step); }
      catch (e) { console.error(e); notify('This mode hit an error, see console'); instance = null; }
    }
    if (typeDirty) { drawTypeLayer(); typeDirty = false; }
    if (++frameCount % 4 === 0) drawAmbient();
    if (recorder) {
      recorder.tick(sceneCanvas(), size.w, size.h, size.dpr);
      if (!recorder.active) { recorder = null; emit(); }
    }
    pointer.justPressed = pointer.justReleased = false;
    raf = requestAnimationFrame(loop);
  }

  // ---------- Public API ----------
  const api = {
    state,
    get mode() { return mode; },
    get recording() { return !!recorder; },
    get instance() { return instance; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getVersion: () => version,

    setMode,
    stepMode(dir) {
      const i = MODES.findIndex((m) => m.id === state.mode);
      setMode(MODES[(i + dir + MODES.length) % MODES.length].id);
    },

    setParam(key, value) {
      state.params[mode.id][key] = value;
      const def = mode.params[key];
      if (def?.rebuild) rebuildSoon();
      instance?.onParam?.(key);
      changed();
    },
    setSeed(seed) { state.seed = seed; rebuildSoon(); changed(); },
    randomise() { state.seed = Math.floor(Math.random() * 99999); buildInstance(); changed(); },
    surprise() {
      const r = Math.random;
      const pals = Object.keys(PALETTES);
      state.palette = pals[Math.floor(r() * pals.length)];
      Object.assign(state.colors, PALETTES[state.palette]);
      const values = state.params[mode.id];
      for (const [k, def] of Object.entries(mode.params || {})) {
        if (def.noShuffle) continue;
        if (def.options) values[k] = def.options[Math.floor(r() * def.options.length)];
        else if (typeof def.value === 'number' && def.min !== undefined) {
          const v = def.min + r() * (def.max - def.min);
          values[k] = def.step ? Math.round(v / def.step) * def.step : v;
        } else if (typeof def.value === 'boolean') values[k] = r() > 0.5;
      }
      state.seed = Math.floor(r() * 99999);
      buildInstance();
      changed();
    },

    setPalette(name) {
      preview = null; // clicking commits whatever is being previewed
      state.palette = name;
      Object.assign(state.colors, PALETTES[name]);
      typeDirty = true;
      instance?.onParam?.('palette');
      changed();
    },
    setColor(key, hex) {
      state.colors[key] = hex;
      typeDirty = true;
      instance?.onParam?.('palette');
      changed();
    },
    setBloom(key, v) { state.bloom[key] = v; changed(); },
    setGrain(v) { state.grain = v; changed(); },
    setFx(key, v) { state.fx[key] = v; changed(); },
    applyFx(values) { preview = null; Object.assign(state.fx, values); changed(); },
    setMotion(key, v) { state.motion[key] = v; changed(); },
    togglePause() { state.motion.paused = !state.motion.paused; changed(); },
    // Sleep while another view (Explore) covers the editor.
    setActive(on) {
      if (on === active || destroyed) return;
      active = on;
      cancelAnimationFrame(raf);
      if (on) { last = performance.now(); raf = requestAnimationFrame(loop); saveUrlNow(); }
    },
    saveUrlNow,

    // Replace all settings (e.g. opening an example from Explore).
    load(settings) {
      endPreview();
      // Stop the running poster first: its settings are about to be replaced.
      if (instance) { try { instance.dispose(); } catch (e) { console.warn(e); } instance = null; }
      const next = merge(structuredClone(DEFAULT_STATE), migrate(structuredClone(settings)));
      for (const k of Object.keys(state)) if (!(k in next)) delete state[k];
      Object.assign(state, next, { textHidden: false });
      loadFont(state.text, () => { typeDirty = true; });
      fitStage();
      setMode(state.mode);
    },

    // Hover previews: try a look on the live poster without committing it.
    previewFx(values) { beginPreview(); Object.assign(state.fx, values); emit(); },
    previewPalette(name) {
      beginPreview();
      Object.assign(state.colors, PALETTES[name]);
      typeDirty = true;
      instance?.onParam?.('palette');
      emit();
    },
    endPreview,

    toggleAmbient() { state.ui.ambient = !state.ui.ambient; drawAmbient(); changed(); },
    setFormat(f) { state.format = f; fitStage(); changed(); },

    setText(key, v) {
      if (key in state.text.lines) state.text.lines[key] = v;
      else state.text[key] = v;
      const redraw = () => { typeDirty = true; instance?.onParam?.('text'); emit(); };
      if (['font', 'weight', 'bodyFont', 'bodyWeight'].includes(key)) loadFont(state.text, redraw);
      redraw();
      saveUrl();
    },

    // ---------- Export ----------
    async savePNG(sizeName) {
      if (!instance) return;
      notify('Rendering PNG…');
      await new Promise((r) => setTimeout(r, 30));
      try {
        const out = await exportPNG({ instance, sceneCanvas, size, state, time, longEdge: EXPORT_SIZES[sizeName] });
        notify(`Saved ${out.width} × ${out.height} PNG`);
      } catch (e) { console.error(e); notify('PNG export failed'); }
    },
    async copyImage(sizeName) {
      if (!instance) return;
      try {
        const out = await copyPNG({ instance, sceneCanvas, size, state, time, longEdge: EXPORT_SIZES[sizeName] });
        notify(`Image copied (${out.width} × ${out.height})`);
      } catch (e) { console.error(e); notify('Copy failed, use Save PNG instead'); }
    },
    recordVideo(seconds) {
      if (recorder) return;
      try {
        recorder = startRecording({ seconds, state, onDone: () => notify('Video saved') });
        notify(`Recording ${seconds} seconds… keep interacting!`);
        emit();
      } catch (e) { notify(e.message); }
    },
    async copyLink() {
      history.replaceState(null, '', '#' + encodeState(state));
      await copyText(location.href, 'Share link copied');
    },
    copyEmbed() {
      copyText(embedCode(state, FORMATS[state.format]),
        isLocal() ? 'Embed code copied. It works on other sites once published' : 'Embed code copied');
    },
    async downloadHTML() {
      try {
        await downloadStandaloneHTML(state);
        notify(isLocal() ? 'HTML saved. It loads from this computer until published' : 'HTML file saved');
      } catch (e) { console.error(e); notify('HTML export failed'); }
    },
    copySettings() { copyText(JSON.stringify(settingsOf(state), null, 2), 'Settings JSON copied'); },
    async pasteSettings() {
      let text;
      try { text = await navigator.clipboard.readText(); }
      catch { text = window.prompt('Paste settings JSON:'); }
      if (!text) return;
      try {
        const loaded = merge(structuredClone(DEFAULT_STATE), JSON.parse(text));
        location.hash = encodeState(loaded);
        location.reload();
      } catch { notify("That doesn't look like settings JSON"); }
    },

    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      life.abort();
      try { instance?.dispose(); } catch (e) { console.warn(e); }
      instance = null;
      els.scene.innerHTML = '';
    },
  };

  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); notify(msg); }
    catch { window.prompt('Copy this:', text); }
  }

  // ---------- Start ----------
  fitStage();
  loadFont(state.text, () => { typeDirty = true; });
  document.fonts.ready.then(() => { typeDirty = true; });
  setMode(state.mode);
  raf = requestAnimationFrame(loop);

  // Handy for debugging in the browser console.
  window.poster = api;
  return api;
}
