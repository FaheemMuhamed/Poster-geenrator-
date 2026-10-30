// Halo Blur: the picture melted into soft glowing fields. A wide single-pass blur
// (golden-angle spiral taps) is mapped through a gradient made of the palette, with
// luminous bloom and halos where figures meet the background, plus soft grain.
// The cursor carries a tilt-shift focus spot where the picture sharpens back to its
// natural colours; clicking pulses the glow outward. Idle: the colours slowly drift.
import { createFullscreenShader } from '../../shared/fullscreenShader.js';
import { THREE } from '../../shared/threeStage.js';

const params = {
  blur:        { value: 0.09, min: 0.01, max: 0.25, step: 0.001, label: 'Blur size' },
  gradientMix: { value: 0.85, min: 0, max: 1, step: 0.01, label: 'Gradient mix' },
  glow:        { value: 0.8, min: 0, max: 2, step: 0.01, label: 'Glow amount' },
  colourShift: { value: 0, min: 0, max: 1, step: 0.01, label: 'Colour shift' },
  contrast:    { value: 1.15, min: 0.3, max: 2.5, step: 0.01, label: 'Contrast', unit: '×' },
  haze:        { value: 0.3, min: 0, max: 1, step: 0.01, label: 'Haze amount' },
  drift:       { value: 1, min: 0, max: 4, step: 0.01, label: 'Speed', unit: '×' },
  focusSize:   { value: 0.22, min: 0.05, max: 0.5, step: 0.01, label: 'Lens size' },
  grain:       { value: 0.4, min: 0, max: 1.5, step: 0.01, label: 'Grain amount' },
};

const TAPS = 36;

const fragment = /* glsl */ `
uniform vec3 uFocus; // xy: focus centre (aspect space, centre origin, y up), z: strength 0..1
uniform vec4 uPulse; // xy: click centre (aspect space), z: start time, w: strength

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float ign(vec2 a) { return fract(52.9829189 * fract(dot(a, vec2(0.06711056, 0.00583715)))); }
vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - clamp(b, 0.0, 1.0)); }

void main() {
  float t = uTime;
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);

  // Tilt-shift focus: a wide ellipse around the cursor where the blur falls away.
  vec2 fd = (q - uFocus.xy) * vec2(0.55, 1.0);
  float focus = (1.0 - smoothstep(p_focusSize * 0.3, p_focusSize, length(fd))) * uFocus.z;

  // Click pulse: a fading boost plus a soft ring of light rolling outward.
  float age = t - uPulse.z;
  float pulse = 0.0, ring = 0.0;
  if (uPulse.w > 0.0 && age >= 0.0 && age < 4.0) {
    pulse = uPulse.w * exp(-age * 2.2);
    float k = (length(q - uPulse.xy) - age * 0.65) / (0.05 + age * 0.05);
    ring = uPulse.w * exp(-k * k) * exp(-age * 1.2);
  }

  // Spiral blur: taps on a golden-angle spiral, rotated per pixel so the pattern becomes fine noise.
  float R = p_blur * (1.0 - 0.96 * focus) * (1.0 + 0.15 * pulse);
  float a0 = ign(gl_FragCoord.xy) * 6.2832;
  vec2 dir = vec2(cos(a0), sin(a0));
  const float GA = 2.39996323;
  mat2 turn = mat2(cos(GA), sin(GA), -sin(GA), cos(GA));
  vec2 scale = vec2(1.0 / uAspect, 1.0) * R;
  vec3 acc = vec3(0.0), accIn = vec3(0.0);
  float ws = 0.0, wsIn = 0.0;
  for (int i = 0; i < ${TAPS}; i++) {
    float r = sqrt((float(i) + 0.5) / ${TAPS}.0);
    vec3 s = sourceAt(vUv + dir * r * scale);
    dir = turn * dir;
    float w = exp(-r * r * 1.6);
    float inner = step(r, 0.45);
    acc += s * w; ws += w;
    accIn += s * w * inner; wsIn += w * inner;
  }
  vec3 blur = acc / ws;
  vec3 tight = accIn / max(wsIn, 1e-4);

  // Gradient from the palette: the darker of bg/ink for shadows, c1..c4 through the middle,
  // the lighter one for highlights. Source hue nudges the ramp so differently coloured
  // areas pick up different palette colours.
  bool bgLight = lum(uPal[0]) >= lum(uPal[1]);
  vec3 darkEnd = bgLight ? uPal[1] : uPal[0];
  vec3 lightEnd = bgLight ? uPal[0] : uPal[1];
  float L = clamp((lum(blur) - 0.5) * p_contrast + 0.5, 0.0, 1.0);
  float hueish = (blur.r - blur.b) * 0.35 + (blur.g - 0.5 * (blur.r + blur.b)) * 0.2;
  float drift = t * 0.02 * p_drift;
  float n = snoise(vec3(q * 0.9, t * 0.035 * p_drift + uSeed * 10.0)) * 0.18;
  float idx = L * 0.7 + hueish + n + p_colourShift + drift;
  vec3 mid = paletteRamp(idx);
  vec3 g = mix(darkEnd, mid, smoothstep(0.02, 0.4, L));
  g = mix(g, lightEnd, smoothstep(0.62, 1.0, L));
  g = mix(g, lightEnd, p_haze * 0.4 * smoothstep(0.1, 0.9, L));

  // In focus the picture returns to its own colours.
  vec3 col = mix(blur, g, p_gradientMix * (1.0 - 0.9 * focus));

  // Halos: where the tight and wide blurs disagree (figure edges) the light glows.
  float glowAmt = p_glow * (1.0 + 1.8 * pulse) * (1.0 - 0.6 * focus);
  float edge = clamp(length(tight - blur) * 3.2, 0.0, 1.0);
  vec3 glowC = mix(paletteRamp(idx + 0.25), lightEnd, 0.25);
  col = screen(col, glowC * edge * glowAmt * 0.9);
  // Bloom: highlights spill a soft coloured light.
  float bright = smoothstep(0.45, 1.0, lum(blur));
  col = screen(col, mix(mid, lightEnd, 0.4) * bright * glowAmt * 0.35);
  col = screen(col, glowC * ring * 0.6 * max(p_glow, 0.3));

  // Soft, slowly shimmering grain.
  float gr = hash21(gl_FragCoord.xy + fract(floor(t * 24.0) * 0.173) * 911.0) - 0.5;
  col += gr * 0.07 * p_grain;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default {
  id: 'halo',
  name: 'Halo Blur',
  engine: 'three',
  medium: 'image',
  hint: 'Hover to bring a spot into focus, click to pulse the glow',
  params,
  controls: {
    essentials: ['blur', 'glow', 'haze', 'drift'],
    form: ['grain'],
    motion: [],
    interaction: ['focusSize'],
    image: ['contrast'],
    colour: ['gradientMix', 'colourShift'],
  },
  presets: {
    'Dreamy': { blur: 0.18, glow: 1.4, haze: 0.6, gradientMix: 1 },
    'Subtle': { blur: 0.04, gradientMix: 0.4, glow: 0.4, grain: 0.2 },
    'Neon': { glow: 2, contrast: 1.8, haze: 0.1, colourShift: 0.5 },
  },
  interactions: { hover: 'brings a spot back into sharp natural colour', click: 'pulses the glow outward' },
  create(ctx) {
    const focus = new THREE.Vector3(0, 0, 0);
    const pulse = new THREE.Vector4(0, 0, -99, 0);
    const fs = createFullscreenShader(ctx, params, fragment, {
      source: true,
      extraUniforms: { uFocus: { value: focus }, uPulse: { value: pulse } },
    });

    return {
      ...fs,
      frame(time, dt = 0) {
        const p = ctx.pointer;
        const { w, h } = fs.stage.size;
        const aspect = w / h;
        const pow = ctx.state.motion.mouse;
        const on = p.inside && pow > 0;
        const k = 1 - Math.exp(-dt * 6);
        if (on) {
          const tx = (p.x - 0.5) * aspect, ty = 0.5 - p.y;
          // Snap when the focus was off, glide otherwise.
          if (focus.z < 0.02) focus.set(tx, ty, focus.z);
          focus.x += (tx - focus.x) * k;
          focus.y += (ty - focus.y) * k;
        }
        focus.z += ((on ? Math.min(1, pow) : 0) - focus.z) * (1 - Math.exp(-dt * 3));
        if (p.justPressed && p.inside && pow > 0) {
          pulse.set((p.x - 0.5) * aspect, 0.5 - p.y, time, Math.min(1.5, pow));
        }
        fs.frame(time);
      },
    };
  },
};
