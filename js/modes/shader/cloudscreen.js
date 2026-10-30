// Cloud Screen: fBm clouds drawn as a square halftone dot grid on a flat screen colour,
// with faint grid lines (ref 21). One or two rectangular "windows" show the same cloud in
// another colour pair, as solid fills and a fine dither. One window follows the cursor;
// hold to stir the clouds; click sends a puff ring through the dots.
import { createFullscreenShader } from '../../shared/fullscreenShader.js';
import { shaderSketch } from '../../shared/codegen.js';
import { THREE } from '../../shared/threeStage.js';

const params = {
  dot:     { value: 0.9, min: 0.4, max: 3, step: 0.01, label: 'Dot size' },
  scale:   { value: 1.6, min: 0.4, max: 5, step: 0.01, label: 'Cloud scale', unit: '×' },
  cover:   { value: 0.58, min: 0, max: 1, step: 0.01, label: 'Cloud cover' },
  wind:    { value: 1, min: 0, max: 5, step: 0.01, label: 'Speed' },
  grid:    { value: 3, min: 0, max: 8, step: 1, label: 'Grid count' },
  windows: { value: 2, min: 0, max: 2, step: 1, label: 'Window count' },
  pair:    { value: 'Accent', options: ['Accent', 'Ink', 'Paper'], label: 'Colour pair' },
  stir:    { value: 1, min: 0, max: 2, step: 0.01, label: 'Stir strength' },
};

const fragment = /* glsl */ `
uniform vec4 uPulse; // click: xy point (poster space), z strength (decays), w seconds since the click
uniform vec2 uHold;  // x: eased press 0..1, y: 1 when the app drives it (otherwise uDown is used)
uniform vec3 uWin;   // xy: eased cursor (poster space), z: 1 when the app drives it

float gT, gHold;
vec2 gM;

// Ordered (Bayer) dither thresholds, 4x4, in 0..1.
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

// Cloud density 0..1 at a poster point.
float cloud(vec2 p) {
  vec2 d = p - gM;
  float near = exp(-dot(d, d) / 0.05);
  // Hover swirls a little; holding churns the air hard.
  float a = (0.35 * uInside * uMousePow + 1.6 * gHold) * p_stir * near;
  p = gM + mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
  vec2 q = p * p_scale + vec2(gT, gT * 0.15) + uSeed * 30.0;
  q += gHold * p_stir * near * 0.9 * vec2(snoise(q * 1.5 + uTime * 0.9), snoise(q * 1.5 + 5.0 - uTime * 0.9));
  q += 0.45 * vec2(snoise(q * 0.6 + gT * 0.1), snoise(q * 0.6 + 7.3 - gT * 0.1));
  float n = snoise(q * 0.5 + 50.0) * 0.15 + snoise(q) * 0.5 + snoise(q * 2.1 + 3.3) * 0.22
          + snoise(q * 4.4 + 8.1) * 0.11 + snoise(q * 9.0 + 1.1) * 0.05;
  float c = n * 0.5 + 0.5;
  float th = 0.95 - p_cover * 0.7;
  return smoothstep(th - 0.07, th + 0.12, c);
}

// Click: a ring of puffed-up dots travelling outward.
float puff(vec2 c) {
  float rr = (length(c - uPulse.xy) - uPulse.w * 0.6) / 0.05;
  return uPulse.z * exp(-rr * rr) * 0.9;
}

bool inRect(vec2 p, vec2 c, vec2 h) { return abs(p.x - c.x) < h.x && abs(p.y - c.y) < h.y; }

// Window look: the same cloud in another colour pair, finer dither, solid where dense.
vec3 windowLook(vec2 p, float cell, vec3 back, vec3 fill, vec3 top) {
  float c2 = cell * 0.5;
  vec2 id = floor(p / c2);
  float d = max(cloud((id + 0.5) * c2), puff((id + 0.5) * c2));
  float b = bayer4(id);
  vec3 col = back;
  if (d > 0.85) col = top;
  else if (d > 0.5) col = fill;
  else if (b < (d - 0.2) / 0.3) col = fill;           // dithered fringe
  else if (b < 0.02) col = mix(back, fill, 0.8); // sparse specks
  if (d > 0.72 && d <= 0.85 && b < (d - 0.72) / 0.13) col = top;
  return col;
}

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float px = 1.0 / uRes.y;
  gHold = uHold.y > 0.5 ? uHold.x : uDown;
  gT = uTime * 0.04 * p_wind;
  gM = vec2(uMouse.x * uAspect, uMouse.y);

  vec3 scr = uPal[2], dotc = uPal[0];
  if (p_pair > 1.5) { scr = uPal[0]; dotc = uPal[1]; }
  else if (p_pair > 0.5) { scr = uPal[1]; dotc = uPal[0]; }

  // Halftone: square dots, one cloud sample per cell; ordered dither decides sparse dots.
  float cell = p_dot * 0.01;
  vec2 g = p / cell;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 cc = (id + 0.5) * cell;
  float d = max(cloud(cc), puff(cc));
  float on = step(bayer4(id), d * 1.5 + 0.06);
  float side = mix(0.38, 1.04, smoothstep(0.3, 0.9, d));
  float aa = px / cell;
  float dotA = on * (1.0 - smoothstep(side * 0.5 - aa, side * 0.5 + aa, max(abs(f.x), abs(f.y))));
  vec3 col = mix(scr, dotc, dotA);

  // Windows sit on the grid; the first one rides with the cursor (eased).
  float gs = p_grid > 0.5 ? uAspect / p_grid : 0.24;
  vec2 hw = vec2(gs * 0.5);
  vec2 cells = max(floor(vec2(uAspect, 1.0) / gs), vec2(1.0));
  vec2 rest1 = (floor(hash22(vec2(uSeed * 19.0, 3.1)) * cells) + 0.5) * gs;
  vec2 rest2 = (floor(hash22(vec2(uSeed * 23.0, 8.7)) * cells) + 0.5) * gs;
  if (distance(rest1, rest2) < gs * 0.5) rest2 = rest1 + vec2(rest1.x + gs < uAspect ? gs : -gs, rest1.y - gs > 0.0 ? -gs : gs);
  vec2 cur = uWin.z > 0.5 ? uWin.xy : gM;
  vec2 w1 = mix(rest1, cur, uInside * min(uMousePow, 1.0));
  float frame = 0.0;
  if (p_windows > 1.5 && inRect(p, rest2, hw)) {
    col = windowLook(p, cell, uPal[4], uPal[5], dotc);
  }
  if (p_windows > 0.5 && inRect(p, w1, hw)) {
    col = windowLook(p, cell, uPal[3], uPal[4], dotc);
  }
  if (p_windows > 0.5) {
    vec2 e1 = abs(p - w1) - hw;
    frame = max(frame, 1.0 - smoothstep(px * 0.8, px * 2.0, abs(max(e1.x, e1.y))));
  }

  // Faint grid lines.
  if (p_grid > 0.5) {
    vec2 gf = fract(p / gs);
    vec2 gd = min(gf, 1.0 - gf) * gs;
    float gl = 1.0 - smoothstep(px * 0.6, px * 1.8, min(gd.x, gd.y));
    col = mix(col, dotc, gl * 0.8);
  }
  col = mix(col, dotc, frame);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default {
  id: 'cloudscreen',
  name: 'Cloud Screen',
  engine: 'three',
  hint: 'Hover to move the window, hold to stir the clouds, click to puff',
  params,
  controls: {
    essentials: ['dot', 'scale', 'cover', 'wind'],
    form: ['grid', 'windows'],
    motion: [],
    interaction: ['stir'],
    colour: ['pair'],
  },
  presets: {
    'Fine print': { dot: 0.55, scale: 2.4, cover: 0.5, grid: 5 },
    'Overcast': { dot: 1.3, scale: 1.1, cover: 0.85, wind: 0.5, windows: 1 },
    'Storm': { dot: 1.6, scale: 2, cover: 0.7, wind: 3.5, stir: 2, pair: 'Ink' },
  },
  interactions: { hover: 'drags a window along and swirls the clouds', click: 'sends a ring of puffed dots outward' },
  create(ctx) {
    const pulse = new THREE.Vector4(-10, -10, 0, 0);
    const hold = new THREE.Vector2(0, 1);
    const win = new THREE.Vector3(0.5, 0.5, 1);
    const fs = createFullscreenShader(ctx, params, fragment, {
      extraUniforms: { uPulse: { value: pulse }, uHold: { value: hold }, uWin: { value: win } },
    });
    return {
      ...fs,
      frame(time, dt) {
        const p = ctx.pointer;
        const { w, h } = fs.stage.size;
        const a = w / h;
        const d = Math.min(Math.max(dt || 0, 0), 0.1);
        if (p.justPressed && p.inside) pulse.set(p.x * a, 1 - p.y, 1, 0);
        pulse.w += d;
        pulse.z *= Math.exp(-d * 1.0);
        hold.x += ((p.down && p.inside ? 1 : 0) - hold.x) * (1 - Math.exp(-d * 4));
        if (p.inside) {
          const k = 1 - Math.exp(-d * 6);
          win.x += (p.x * a - win.x) * k;
          win.y += (1 - p.y - win.y) * k;
        }
        fs.frame(time);
      },
    };
  },
  code: (values, colors, seed) => shaderSketch({ id: 'cloudscreen', name: 'Cloud Screen', params, values, colors, seed, fragment }),
};
