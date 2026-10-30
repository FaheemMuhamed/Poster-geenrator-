// Ellipse Loom: rows of coloured ellipses woven into a mirrored perspective tunnel (ref 11).
// Rows thin out toward a horizon, each row wraps around a drum (ellipses squeeze toward its
// ends), rows step in and out like a stepped pyramid, and alternate rows turn in opposite
// directions like threads on a loom. Hover moves the vanishing point; hold to speed the flow;
// click sends a swelling pulse out from the horizon.
import { createFullscreenShader } from '../../shared/fullscreenShader.js';
import { shaderSketch } from '../../shared/codegen.js';
import { THREE } from '../../shared/threeStage.js';

const params = {
  rows:     { value: 12, min: 3, max: 40, step: 1, label: 'Row count' },
  cols:     { value: 9, min: 3, max: 30, step: 1, label: 'Column count' },
  persp:    { value: 0.55, min: 0, max: 1, step: 0.01, label: 'Perspective' },
  sym:      { value: 'Vertical', options: ['Vertical', 'Both', 'None'], label: 'Symmetry' },
  steps:    { value: 6, min: 0, max: 16, step: 1, label: 'Rows per step' },
  size:     { value: 0.9, min: 0.3, max: 1.3, step: 0.01, label: 'Ellipse size' },
  gap:      { value: 0.08, min: 0, max: 0.6, step: 0.01, label: 'Row gap' },
  flow:     { value: 1, min: -3, max: 3, step: 0.01, label: 'Speed' },
  hueShift: { value: 0, min: 0, max: 1, step: 0.01, label: 'Hue shift' },
};

const fragment = /* glsl */ `
uniform vec4 uPulse; // click: z strength (decays), w seconds since the click
uniform vec2 uHold;  // x: eased press 0..1, y: 1 when the app drives it (otherwise uDown is used)
uniform vec3 uVan;   // xy: eased vanishing point (0..1, y up), z: 1 when the app drives it
uniform vec2 uPhase; // x: flow phase integrated by the app, y: 1 when the app drives it

void main() {
  float px = 1.0 / uRes.y;
  float hold = uHold.y > 0.5 ? uHold.x : uDown;
  vec2 van = uVan.z > 0.5 ? uVan.xy : uMouse;
  vec2 vp = mix(vec2(0.5), van, uInside * min(uMousePow, 1.0) * 0.85);
  vp.y = clamp(vp.y, 0.12, 0.88);
  float phase = uPhase.y > 0.5 ? uPhase.x : uTime * 0.25 * p_flow;

  // Rows: a power mapping away from the horizon packs rows tighter as they recede.
  float yd = vUv.y - vp.y;
  float side = yd < 0.0 ? -1.0 : 1.0;
  float s = max(abs(yd) * 2.0, 1e-4);
  float gam = 1.0 / (1.0 + 1.6 * p_persp);
  float rc = p_rows * pow(s, gam);
  float drc = 2.0 * p_rows * gam * pow(s, gam - 1.0); // rows per poster unit, for anti-aliasing
  float dir = (p_sym > 1.5 && side < 0.0) ? -1.0 : 1.0;
  float rcf = rc - phase * dir;
  float rid = floor(rcf);
  float rf = fract(rcf);

  // Row width: stepped like a pyramid, and narrower toward the horizon.
  float k = p_steps > 0.5 ? mod(rid, p_steps) / max(p_steps - 1.0, 1.0) : 1.0;
  float sRow = pow(max(rid + 0.5 + phase * dir, 0.0) / p_rows, 1.0 / gam);
  float W = uAspect * 0.5 * (0.3 + 0.78 * k) * mix(1.0, 0.3 + 0.7 * min(sRow, 1.0), 0.7 * p_persp);
  float xr = (vUv.x - vp.x) * uAspect;
  float ux = xr / W;

  // Columns wrap around a drum: ellipses squeeze toward the row ends. Alternate rows turn opposite ways.
  float th = asin(clamp(ux, -1.0, 1.0));
  float spin = phase * 0.15 * (mod(rid, 2.0) * 2.0 - 1.0);
  float cc = p_sym > 0.5 && p_sym < 1.5
    ? abs(th) / 3.14159 * p_cols + 0.5 + spin
    : (th / 3.14159 + 0.5) * p_cols + spin;
  float cid = floor(cc);
  float cu = fract(cc);
  float dcc = p_cols / 3.14159 / max(sqrt(max(1.0 - ux * ux, 0.0)), 1e-3) / W; // columns per poster unit

  // Click: a pulse travelling out from the horizon swells the rows it passes.
  float wv = rc - uPulse.w * 9.0;
  float wave = uPulse.z * exp(-wv * wv * 0.35);
  float size = p_size * (1.0 + 0.2 * hold + 0.35 * wave);

  // Ellipse in cell space, with a pixel-footprint estimate for smooth edges.
  float band = 1.0 - p_gap;
  float ry = (rf - 0.5) / band;
  vec2 e = vec2((cu - 0.5) / (0.5 * size), ry / (0.5 * size));
  float el = length(e);
  float fx = px * dcc / (0.5 * size);
  float fy = px * drc / (band * 0.5 * size);
  float aaw = length(vec2(fx * e.x, fy * e.y)) / max(el, 1e-3) + 1e-4;
  float ellA = 1.0 - smoothstep(1.0 - aaw, 1.0 + aaw, el);
  float cov = min(0.785 * size * size * band, 1.0);
  ellA = mix(ellA, cov, smoothstep(0.3, 1.0, aaw)); // far away: average out instead of shimmering

  // Colours: per ellipse from the palette (mirrored by the symmetry), some dark.
  float sideKey = p_sym > 1.5 ? side : 0.0;
  float h = hash21(vec2(cid * 1.731 + sideKey * 57.0, rid * 0.917 + uSeed * 13.0));
  float h2 = hash21(vec2(cid * 3.1 + 0.7, rid * 2.3 + sideKey * 11.0 + uSeed * 5.0));
  vec3 ec = paletteRamp(floor(h * 8.0) / 8.0 + p_hueShift);
  if (h2 < 0.12) ec = mix(uPal[1], uPal[0], 0.08);
  else if (h2 < 0.22) ec = mix(ec, uPal[1], 0.45);
  ec *= 0.9 + 0.18 * h2;
  ec = mix(ec, uPal[0], 0.3 * wave);

  vec3 fill = mix(uPal[1], uPal[5], 0.35);
  fill *= 0.85 + 0.22 * hash21(vec2(cid + 5.0, rid + 3.0));
  vec3 rowCol = mix(fill, ec, ellA);

  // Masks: row extent (with soft ends) and the gaps between rows.
  float wx = px / W;
  float rowMask = 1.0 - smoothstep(1.0 - wx, 1.0 + wx, abs(ux));
  float bw = px * drc / band;
  float bandA = p_gap < 0.001 ? 1.0 : 1.0 - smoothstep(0.5 - bw, 0.5 + bw, abs(ry));
  bandA = mix(bandA, band, smoothstep(0.3, 1.0, bw));
  vec3 col = mix(uPal[0], rowCol, rowMask * bandA);

  // A hairline at the horizon.
  col = mix(col, uPal[1], (1.0 - smoothstep(px * 0.5, px * 1.5, abs(yd))) * 0.6);

  col += (hash21(gl_FragCoord.xy) - 0.5) * 0.02;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default {
  id: 'ellipseloom',
  name: 'Ellipse Loom',
  engine: 'three',
  hint: 'Hover to move the horizon, hold to speed the loom, click to pulse',
  params,
  controls: {
    essentials: ['rows', 'cols', 'persp', 'flow'],
    form: ['sym', 'steps', 'size', 'gap'],
    motion: [],
    interaction: [],
    colour: ['hueShift'],
  },
  presets: {
    'Deep tunnel': { rows: 28, cols: 18, persp: 0.95, sym: 'Both', size: 0.8 },
    'Flat weave': { rows: 8, cols: 6, persp: 0.1, steps: 0, gap: 0.2 },
    'Fast loom': { rows: 16, flow: 2.5, steps: 4, size: 1.1, sym: 'None' },
  },
  interactions: { hover: 'moves the vanishing point', click: 'sends a swelling pulse out from the horizon' },
  create(ctx) {
    const pulse = new THREE.Vector4(0, 0, 0, 0);
    const hold = new THREE.Vector2(0, 1);
    const van = new THREE.Vector3(0.5, 0.5, 1);
    const phase = new THREE.Vector2(0, 1);
    const fs = createFullscreenShader(ctx, params, fragment, {
      extraUniforms: { uPulse: { value: pulse }, uHold: { value: hold }, uVan: { value: van }, uPhase: { value: phase } },
    });
    return {
      ...fs,
      frame(time, dt) {
        const p = ctx.pointer;
        const d = Math.min(Math.max(dt || 0, 0), 0.1);
        if (p.justPressed && p.inside) pulse.set(0, 0, 1, 0);
        pulse.w += d;
        pulse.z *= Math.exp(-d * 0.9);
        hold.x += ((p.down && p.inside ? 1 : 0) - hold.x) * (1 - Math.exp(-d * 3));
        // Holding speeds the loom up (integrated, so the speed change never jumps).
        const flow = ctx.params.flow;
        phase.x += d * 0.25 * (flow + Math.sign(flow || 1) * 3 * hold.x);
        if (p.inside) {
          const k = 1 - Math.exp(-d * 4);
          van.x += (p.x - van.x) * k;
          van.y += (1 - p.y - van.y) * k;
        }
        fs.frame(time);
      },
    };
  },
  code: (values, colors, seed) => shaderSketch({ id: 'ellipseloom', name: 'Ellipse Loom', params, values, colors, seed, fragment }),
};
