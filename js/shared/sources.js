// The picture that image effects work on: a built-in sample, your own image, or the webcam.
//
// Modes read `ctx.source`:
//   canvas    always holds the current picture (drawn once, or every frame for webcam)
//   width, height, aspect
//   version   goes up whenever the picture changes, so a mode knows to re-read it
//   kind      'sample' | 'upload' | 'webcam'
// Samples are painted here in code (no image files), so they're free to use and tiny.
import { makeRandom } from './random.js';

// Photo samples live in public/samples/; the rest are painted in code below.
const PHOTO_SAMPLES = { Photo: 'samples/photo.jpg' };
export const SAMPLES = ['Photo', 'Portrait', 'Skyline', 'Still life', 'Garden', 'Type'];
export const DEFAULT_SAMPLE = 'Photo';
const W = 1024, H = 1280;

export function createSource(initialSample = DEFAULT_SAMPLE) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let video = null, stream = null;

  const src = {
    canvas, width: W, height: H, aspect: W / H, version: 0,
    kind: 'sample', sample: initialSample, name: initialSample,

    setSample(name) {
      stopWebcam();
      src.kind = 'sample'; src.sample = name; src.name = name;
      if (PHOTO_SAMPLES[name]) { loadPhoto(name); return; }
      resize(W, H);
      paintSample(ctx, name in PAINTERS ? name : 'Portrait', W, H);
      src.version++;
    },

    // Any image the browser can decode (from a file input, a drop, or a paste).
    async setFile(file) {
      if (!file || !file.type.startsWith('image/')) throw new Error('That file isn’t an image');
      const bmp = await createImageBitmap(file);
      stopWebcam();
      // Cap the long edge so big photos stay fast to process.
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      resize(Math.round(bmp.width * k), Math.round(bmp.height * k));
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close?.();
      src.kind = 'upload'; src.name = file.name || 'Your image';
      src.version++;
    },

    async startWebcam() {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, srcObject: stream });
      await video.play();
      resize(video.videoWidth || 1280, video.videoHeight || 720);
      src.kind = 'webcam'; src.name = 'Webcam';
      src.version++;
    },
    stopWebcam,

    // Called every frame by the engine; only does work while the webcam is live.
    tick() {
      if (src.kind !== 'webcam' || !video || video.readyState < 2) return;
      // Mirror it, like a mirror (and like every video call).
      ctx.save(); ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      src.version++;
    },

    // Pixel data at a given grid size, cached per version (handy for p5 / 2D modes).
    sample(cols, rows) {
      const key = `${cols}x${rows}:${src.version}`;
      if (cache.key === key) return cache.data;
      if (small.width !== cols || small.height !== rows) { small.width = cols; small.height = rows; }
      sctx.drawImage(canvas, 0, 0, cols, rows);
      cache.key = key;
      cache.data = sctx.getImageData(0, 0, cols, rows).data;
      return cache.data;
    },

    dispose() { stopWebcam(); },
  };

  const small = document.createElement('canvas');
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const cache = { key: '', data: null };

  // Photo samples load asynchronously; a neutral frame shows meanwhile. If the file is
  // missing, the painted Portrait stands in.
  const photos = {};
  function loadPhoto(name) {
    const show = (img) => {
      if (src.kind !== 'sample' || src.sample !== name) return; // something else was picked meanwhile
      resize(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);
      src.version++;
    };
    if (photos[name]) return show(photos[name]);
    resize(W, H);
    ctx.fillStyle = '#e9e9e6'; ctx.fillRect(0, 0, W, H);
    src.version++;
    const img = new Image();
    img.onload = () => { photos[name] = img; show(img); };
    img.onerror = () => { if (src.sample === name) { paintSample(ctx, 'Portrait', W, H); src.version++; } };
    img.src = (import.meta.env?.BASE_URL || './') + PHOTO_SAMPLES[name];
  }

  function resize(w, h) {
    canvas.width = w; canvas.height = h;
    src.width = w; src.height = h; src.aspect = w / h;
  }

  function stopWebcam() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null; video = null;
    if (src.kind === 'webcam') src.setSample(src.sample);
  }

  src.setSample(initialSample);
  return src;
}

// ---------- Sample pictures ----------
function paintSample(c, name, w, h) {
  c.save();
  c.clearRect(0, 0, w, h);
  PAINTERS[name](c, w, h, makeRandom(name.length * 977 + 13));
  c.restore();
}

const lin = (c, x0, y0, x1, y1, stops) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
};
const rad = (c, x, y, r0, r1, stops) => {
  const g = c.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
};

const PAINTERS = {
  // A head-and-shoulders profile lit from the side: strong light/dark shapes for dithering.
  Portrait(c, w, h) {
    c.fillStyle = lin(c, 0, 0, w, h, [[0, '#f2e9df'], [0.55, '#d9c2b0'], [1, '#8a6f62']]);
    c.fillRect(0, 0, w, h);
    c.fillStyle = rad(c, w * 0.78, h * 0.25, 10, w * 0.7, [[0, 'rgba(255,214,160,0.9)'], [1, 'rgba(255,214,160,0)']]);
    c.fillRect(0, 0, w, h);
    // Shoulders
    c.fillStyle = lin(c, 0, h * 0.7, w, h, [[0, '#2b2430'], [1, '#5b4a52']]);
    c.beginPath();
    c.moveTo(w * 0.05, h); c.bezierCurveTo(w * 0.1, h * 0.78, w * 0.3, h * 0.72, w * 0.45, h * 0.7);
    c.bezierCurveTo(w * 0.62, h * 0.7, w * 0.85, h * 0.74, w * 0.98, h); c.closePath(); c.fill();
    // Neck
    c.fillStyle = lin(c, w * 0.4, 0, w * 0.6, 0, [[0, '#7a5547'], [1, '#c58f74']]);
    c.fillRect(w * 0.4, h * 0.5, w * 0.17, h * 0.24);
    // Head (profile facing right)
    c.fillStyle = lin(c, w * 0.3, 0, w * 0.7, 0, [[0, '#6b4a3f'], [0.6, '#c99479'], [1, '#f0c3a2']]);
    c.beginPath();
    c.moveTo(w * 0.36, h * 0.52);
    c.bezierCurveTo(w * 0.28, h * 0.42, w * 0.3, h * 0.22, w * 0.47, h * 0.18);
    c.bezierCurveTo(w * 0.6, h * 0.15, w * 0.66, h * 0.24, w * 0.66, h * 0.31);
    c.lineTo(w * 0.7, h * 0.37); c.lineTo(w * 0.665, h * 0.39);
    c.bezierCurveTo(w * 0.67, h * 0.42, w * 0.66, h * 0.45, w * 0.64, h * 0.46);
    c.bezierCurveTo(w * 0.62, h * 0.5, w * 0.58, h * 0.52, w * 0.53, h * 0.52);
    c.closePath(); c.fill();
    // Hair, with a bun
    c.fillStyle = '#1d1719';
    c.beginPath();
    c.moveTo(w * 0.35, h * 0.44);
    c.bezierCurveTo(w * 0.27, h * 0.3, w * 0.33, h * 0.16, w * 0.48, h * 0.16);
    c.bezierCurveTo(w * 0.58, h * 0.16, w * 0.63, h * 0.2, w * 0.64, h * 0.25);
    c.bezierCurveTo(w * 0.55, h * 0.22, w * 0.47, h * 0.26, w * 0.44, h * 0.33);
    c.bezierCurveTo(w * 0.42, h * 0.38, w * 0.4, h * 0.42, w * 0.35, h * 0.44);
    c.fill();
    c.beginPath(); c.arc(w * 0.31, h * 0.25, w * 0.075, 0, Math.PI * 2); c.fill();
    // Rim light
    c.globalCompositeOperation = 'screen';
    c.fillStyle = rad(c, w * 0.7, h * 0.32, 0, w * 0.18, [[0, 'rgba(255,200,150,0.55)'], [1, 'rgba(255,200,150,0)']]);
    c.fillRect(0, 0, w, h);
  },

  // A street between towers: lots of straight edges and small windows for line and grid effects.
  Skyline(c, w, h, r) {
    c.fillStyle = lin(c, 0, 0, 0, h * 0.7, [[0, '#9cc3e8'], [0.7, '#f3d9c0'], [1, '#f6b38a']]);
    c.fillRect(0, 0, w, h);
    const vx = w * 0.52, vy = h * 0.55;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const x0 = side < 0 ? i * w * 0.07 : w - i * w * 0.07;
        const top = h * (0.04 + r.range(0, 0.25) + i * 0.02);
        const x1 = x0 + side * w * 0.07;
        const shade = 30 + i * 18 + r.int(0, 20);
        c.fillStyle = `rgb(${shade}, ${shade + 6}, ${shade + 20})`;
        c.beginPath(); c.moveTo(x0, top); c.lineTo(x1, top + h * 0.03); c.lineTo(x1, h); c.lineTo(x0, h); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255, 226, 170, 0.75)';
        for (let y = top + 20; y < h * 0.9; y += 26) for (let k = 0; k < 3; k++) if (r() > 0.45) c.fillRect(Math.min(x0, x1) + 8 + k * w * 0.02, y, w * 0.012, 12);
      }
    }
    c.fillStyle = '#3a3b44';
    c.beginPath(); c.moveTo(0, h); c.lineTo(vx - 20, vy); c.lineTo(vx + 20, vy); c.lineTo(w, h); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 4;
    for (let k = 0; k < 8; k++) { const t = k / 8; c.beginPath(); c.moveTo(vx, vy + (h - vy) * t * t); c.lineTo(vx, vy + (h - vy) * (t + 0.06) ** 2); c.stroke(); }
    // A red car, for a point of colour
    c.fillStyle = '#e0362c';
    c.beginPath(); c.roundRect(w * 0.42, h * 0.82, w * 0.2, h * 0.05, 14); c.fill();
    c.beginPath(); c.roundRect(w * 0.46, h * 0.795, w * 0.11, h * 0.035, 10); c.fill();
    c.fillStyle = '#111'; [0.46, 0.58].forEach((x) => { c.beginPath(); c.arc(w * x, h * 0.87, w * 0.022, 0, Math.PI * 2); c.fill(); });
  },

  // A sphere, a cube and a cone under a soft light: smooth tones for halftone and dither.
  'Still life'(c, w, h) {
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#e8e4dc'], [0.62, '#d2ccc0'], [0.63, '#bfb6a6'], [1, '#9c9282']]);
    c.fillRect(0, 0, w, h);
    const shadow = (x, y, rx) => { c.fillStyle = rad(c, x, y, 0, rx, [[0, 'rgba(40,30,20,0.45)'], [1, 'rgba(40,30,20,0)']]); c.beginPath(); c.ellipse(x, y, rx, rx * 0.22, 0, 0, Math.PI * 2); c.fill(); };
    shadow(w * 0.32, h * 0.76, w * 0.24); shadow(w * 0.72, h * 0.8, w * 0.18);
    c.fillStyle = rad(c, w * 0.26, h * 0.5, 10, w * 0.25, [[0, '#ffd6c2'], [0.5, '#e2584a'], [1, '#521b18']]);
    c.beginPath(); c.arc(w * 0.32, h * 0.57, w * 0.2, 0, Math.PI * 2); c.fill();
    // Cube
    const cx = w * 0.7, cy = h * 0.66, s = w * 0.15;
    c.fillStyle = '#e7dfcf'; c.beginPath(); c.moveTo(cx - s, cy - s * 0.5); c.lineTo(cx, cy - s); c.lineTo(cx + s, cy - s * 0.5); c.lineTo(cx, cy); c.closePath(); c.fill();
    c.fillStyle = '#b9ab92'; c.beginPath(); c.moveTo(cx - s, cy - s * 0.5); c.lineTo(cx, cy); c.lineTo(cx, cy + s * 1.1); c.lineTo(cx - s, cy + s * 0.6); c.closePath(); c.fill();
    c.fillStyle = '#6f6452'; c.beginPath(); c.moveTo(cx + s, cy - s * 0.5); c.lineTo(cx, cy); c.lineTo(cx, cy + s * 1.1); c.lineTo(cx + s, cy + s * 0.6); c.closePath(); c.fill();
    // Cone
    c.fillStyle = lin(c, w * 0.5, 0, w * 0.68, 0, [[0, '#2d5ea8'], [0.4, '#8fb6f0'], [1, '#183563']]);
    c.beginPath(); c.moveTo(w * 0.6, h * 0.22); c.lineTo(w * 0.72, h * 0.5); c.lineTo(w * 0.48, h * 0.5); c.closePath(); c.fill();
  },

  // Bright flowers and leaves: many colours for mosaics and pixel effects.
  Garden(c, w, h, r) {
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#123d2a'], [1, '#2f6b3a']]);
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      c.fillStyle = `hsla(${r.range(90, 150)}, 55%, ${r.range(20, 45)}%, 0.9)`;
      c.beginPath(); c.ellipse(r.range(0, w), r.range(0, h), r.range(20, 90), r.range(8, 30), r.range(0, Math.PI), 0, Math.PI * 2); c.fill();
    }
    const hues = [350, 20, 45, 280, 320, 200];
    for (let i = 0; i < 26; i++) {
      const x = r.range(0, w), y = r.range(0, h), R = r.range(28, 90), hue = r.pick(hues);
      for (let p = 0; p < 8; p++) {
        const a = (p / 8) * Math.PI * 2;
        c.fillStyle = `hsl(${hue}, 85%, ${r.range(55, 72)}%)`;
        c.beginPath(); c.ellipse(x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.6, R * 0.55, R * 0.28, a, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(x, y, R * 0.3, 0, Math.PI * 2); c.fill();
    }
  },

  // Big letters: for effects that read shapes and edges.
  Type(c, w, h) {
    c.fillStyle = lin(c, 0, 0, w, h, [[0, '#ff4a1c'], [0.5, '#ffb3c7'], [1, '#2d3cff']]);
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#111';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 ${w * 0.42}px "Archivo", "Inter", system-ui, sans-serif`;
    c.fillText('MO', w / 2, h * 0.33);
    c.fillText('RVA', w / 2, h * 0.68);
  },
};
