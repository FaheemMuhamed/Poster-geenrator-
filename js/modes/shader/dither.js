// Bit Dither: the picture reduced to two palette colours with a 1-bit screen
// (Bayer 4×4 / 8×8, clustered dot, line screen or noise), like an old risograph proof.
// The cursor carries a loupe where the screen gets finer and/or swaps colour pair;
// clicking sends rings of inverted dots rolling outward. Idle: the threshold breathes.
import { createFullscreenShader } from '../../shared/fullscreenShader.js';
import { THREE } from '../../shared/threeStage.js';

const params = {
  cell:       { value: 2.5, min: 1, max: 10, step: 0.5, label: 'Dot size' },
  pattern:    { value: 'Bayer 8×8', options: ['Bayer 4×4', 'Bayer 8×8', 'Clustered dot', 'Line screen', 'Noise'], label: 'Pattern' },
  colours:    { value: 'Ink on background', options: ['Ink on background', 'Accent on background', 'Ink on accent'], label: 'Colours' },
  contrast:   { value: 1.25, min: 0.2, max: 3, step: 0.01, label: 'Contrast' },
  brightness: { value: 0.02, min: -0.5, max: 0.5, step: 0.01, label: 'Brightness' },
  gamma:      { value: 1, min: 0.3, max: 3, step: 0.01, label: 'Gamma' },
  angle:      { value: 45, min: 0, max: 90, step: 1, label: 'Screen angle' },
  invert:     { value: false, label: 'Invert' },
  breathe:    { value: 0.6, min: 0, max: 2, step: 0.01, label: 'Breathing' },
  lens:       { value: 'Finer + swap', options: ['Finer', 'Swap colours', 'Finer + swap'], label: 'Lens' },
  lensSize:   { value: 0.17, min: 0.05, max: 0.45, step: 0.01, label: 'Lens size' },
  ripple:     { value: 1, min: 0, max: 2, step: 0.01, label: 'Click ripple' },
};

const RIPPLES = 4;

const fragment = /* glsl */ `
uniform float uDpr;
uniform vec4 uRip[${RIPPLES}]; // xy: centre (aspect space), z: start time, w: strength

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Ordered-dither matrices built by interleaving 2×2 Bayer levels.
float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
// Interleaved gradient noise: an even, grain-free random threshold.
float ign(vec2 a) { return fract(52.9829189 * fract(dot(a, vec2(0.06711056, 0.00583715)))); }

// Threshold (0..1) for the dither pixel at integer index id.
float threshold(vec2 id, float ang, float t) {
  if (p_pattern < 0.5) return bayer4(id) + 0.5 / 16.0;
  if (p_pattern < 1.5) return bayer8(id) + 0.5 / 64.0;
  float tie = (bayer4(id) - 0.47) * 0.09; // extra tonal steps inside each screen cell
  if (p_pattern < 2.5) {
    vec2 r = rot(ang) * id / 5.0;
    return clamp(0.5 + 0.25 * (cos(6.2832 * r.x) + cos(6.2832 * r.y)) + tie, 0.0, 1.0);
  }
  if (p_pattern < 3.5) {
    vec2 r = rot(ang) * id / 4.0;
    return clamp(0.5 + 0.5 * cos(6.2832 * r.y) + tie, 0.0, 1.0);
  }
  // Noise: slowly crawling, so the grain drifts like film.
  return ign(id + vec2(floor(t * 2.0) * 7.0, floor(t * 1.3) * 3.0));
}

// The accent (c1..c4) that contrasts most with another colour.
vec3 accentFor(vec3 other) {
  vec3 best = uPal[2]; float bd = -1.0;
  for (int i = 2; i < 6; i++) {
    float d = abs(lum(uPal[i]) - lum(other));
    if (d > bd) { bd = d; best = uPal[i]; }
  }
  return best;
}
// Returns the pair as (dark, light) so the picture always reads the right way round.
void pairColours(float pair, out vec3 dark, out vec3 light) {
  vec3 a, b;
  if (pair < 0.5) { a = uPal[1]; b = uPal[0]; }
  else if (pair < 1.5) { b = uPal[0]; a = accentFor(b); }
  else { a = uPal[1]; b = accentFor(a); }
  bool aLight = lum(a) > lum(b);
  dark = aLight ? b : a;
  light = aLight ? a : b;
  if (p_invert > 0.5) { vec3 k = dark; dark = light; light = k; }
}

// Cells snap to whole device pixels so every dot is the same crisp size.
float cellPx(float cell) { return max(1.0, floor(cell * uDpr + 0.5)); }

// One dither layer: quantise to cells of 'cell' CSS px, sample the picture there, compare to the screen.
// zc/zoom magnify the picture around zc (uv), disp nudges the sample (uv).
float ditherLayer(float cell, float ang, vec2 zc, float zoom, vec2 disp, float t, out vec2 idOut) {
  float c = cellPx(cell);
  vec2 id = floor(gl_FragCoord.xy / c);
  idOut = id;
  vec2 uvC = (id + 0.5) * c / uRes;
  uvC = zc + (uvC - zc) / zoom + disp;
  vec2 px = c / uRes;
  float L = lum(sourceAt(uvC));
  float n = lum(sourceAt(uvC + vec2(px.x, 0.0))) + lum(sourceAt(uvC - vec2(px.x, 0.0)))
          + lum(sourceAt(uvC + vec2(0.0, px.y))) + lum(sourceAt(uvC - vec2(0.0, px.y)));
  L += (L - n * 0.25) * 0.9; // unsharp mask: crisper edges survive the 1-bit squeeze
  float v = clamp((L - 0.5) * p_contrast + 0.5 + p_brightness, 0.0, 1.0);
  v = pow(v, 1.0 / p_gamma);
  // Idle breathing: a slow global swell plus drifting patches where the tone lifts and sinks.
  vec2 qc = (uvC - 0.5) * vec2(uAspect, 1.0);
  v += p_breathe * (0.03 * sin(t * 0.7) + 0.055 * snoise(vec3(qc * 2.2, t * 0.11 + uSeed * 20.0)));
  return step(threshold(id, ang, t), v);
}

void main() {
  float t = uTime;
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 mq = (uMouse - 0.5) * vec2(uAspect, 1.0);
  float mp = clamp(uMousePow, 0.0, 3.0);
  float ang = radians(p_angle);

  // Click ripples, measured at the coarse cell centre so each dot flips as a whole.
  float cp = cellPx(p_cell);
  vec2 qc = ((floor(gl_FragCoord.xy / cp) + 0.5) * cp / uRes - 0.5) * vec2(uAspect, 1.0);
  float rip = 0.0; vec2 disp = vec2(0.0);
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRip[i];
    float age = t - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 4.0) continue;
    vec2 d = qc - r.xy;
    float dist = length(d);
    float front = age * 0.5;
    float width = 0.025 + age * 0.02;
    float fade = r.w * exp(-age * 0.9);
    float k1 = (dist - front) / width, k2 = (dist - front * 0.62) / (width * 0.7);
    float band = exp(-k1 * k1) * fade;
    float echo = exp(-k2 * k2) * fade * 0.6;
    rip += band + echo;
    disp += (dist > 1e-4 ? d / dist : vec2(0.0)) * band * 0.012;
  }
  disp /= vec2(uAspect, 1.0);

  // The loupe: a circle around the cursor, slightly magnified, with a finer or recoloured screen.
  float lr = p_lensSize * (0.6 + 0.4 * min(mp, 2.0));
  float dl = length(q - mq);
  float lensOn = uInside * step(0.001, mp);
  float lensMask = lensOn * (1.0 - smoothstep(lr * 0.82, lr, dl));
  bool finer = p_lens < 0.5 || p_lens > 1.5;
  bool swap = p_lens > 0.5;
  float zoom = 1.0 + 0.22 * lensMask;

  vec2 idO, idI;
  float bitO = ditherLayer(p_cell, ang, uMouse, 1.0, disp, t, idO);
  float innerCell = finer ? max(0.5, p_cell * 0.5) : p_cell;
  float bitI = ditherLayer(innerCell, ang + (finer ? 0.52 : 0.0), uMouse, 1.0 + 0.22 * lensOn, disp, t, idI);
  // The lens edge is dithered too, so the circle dissolves into the screen.
  float inLens = step(bayer4(idI) + 0.03, lensMask);

  float bit = mix(bitO, bitI, inLens);
  // Ripples flip dots inside their bands (dithered so the ring edges stay soft).
  float flip = step(bayer8(idO) + 0.01, rip * 1.4);
  bit = abs(bit - flip);

  vec3 dark, light;
  pairColours(p_colours, dark, light);
  vec3 col = mix(dark, light, bit);
  if (swap && inLens > 0.5) {
    vec3 d2, l2;
    pairColours(mod(p_colours + 1.0, 3.0), d2, l2);
    col = mix(d2, l2, bit);
  }

  // A dashed ring traces the lens, one dot wide, slowly turning.
  float ringW = 1.2 * cellPx(innerCell) / uRes.y;
  float ring = (1.0 - step(ringW, abs(dl - lr * 1.04))) * lensOn;
  float dash = step(0.45, fract(atan(q.y - mq.y, q.x - mq.x) / 6.2832 * 48.0 + t * 0.25));
  col = mix(col, dark, ring * dash);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default {
  id: 'dither',
  name: 'Bit Dither',
  engine: 'three',
  medium: 'image',
  hint: 'Hover for a fine-screen loupe, click to send a ripple of inverted dots',
  params,
  controls: {
    essentials: ['cell', 'pattern', 'colours', 'contrast'],
    groups: {
      Tone: ['brightness', 'gamma', 'invert'],
      Screen: ['angle', 'breathe'],
      Interaction: ['lens', 'lensSize', 'ripple'],
    },
  },
  create(ctx) {
    const rips = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
    const uDpr = { value: 1 };
    const fs = createFullscreenShader(ctx, params, fragment, {
      source: true,
      extraUniforms: { uDpr, uRip: { value: rips } },
    });
    let next = 0;

    return {
      ...fs,
      frame(time) {
        const p = ctx.pointer;
        const { w, h, dpr } = fs.stage.size;
        uDpr.value = dpr;
        const strength = ctx.params.ripple * Math.min(1.5, ctx.state.motion.mouse);
        if (p.justPressed && p.inside && strength > 0) {
          rips[next].set((p.x - 0.5) * (w / h), 0.5 - p.y, time, strength);
          next = (next + 1) % RIPPLES;
        }
        fs.frame(time);
      },
    };
  },
};
