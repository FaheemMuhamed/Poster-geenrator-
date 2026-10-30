// Prism Light: the picture as a smeared oil painting, cut by a white beam of light whose
// edges split into a rainbow. Where the beam ends it flares: a star, anamorphic streaks,
// thin rainbow lines and lens ghosts, while chrome-like highlights glint and warm light
// leaks bleed in from the edges. The beam follows the cursor; a click bursts rainbow rays.
import { createFullscreenShader } from '../../shared/fullscreenShader.js';
import { THREE } from '../../shared/threeStage.js';

const params = {
  beamWidth:  { value: 0.03, min: 0.005, max: 0.12, step: 0.001, label: 'Beam width' },
  dispersion: { value: 1, min: 0, max: 3, step: 0.01, label: 'Dispersion' },
  flare:      { value: 1, min: 0, max: 2, step: 0.01, label: 'Flare amount' },
  smear:      { value: 0.7, min: 0, max: 1.5, step: 0.01, label: 'Paint smear' },
  tilt:       { value: 0, min: -30, max: 30, step: 1, label: 'Beam tilt' },
  sparkle:    { value: 0.8, min: 0, max: 2, step: 0.01, label: 'Glints' },
  leak:       { value: 0.6, min: 0, max: 1.5, step: 0.01, label: 'Light leaks' },
  leakColour: { value: 'C2', options: ['C1', 'C2', 'C3', 'C4'], label: 'Leak colour' },
  grain:      { value: 0.5, min: 0, max: 1.5, step: 0.01, label: 'Grain' },
  burst:      { value: 1, min: 0, max: 2, step: 0.01, label: 'Click burst' },
};

const fragment = /* glsl */ `
uniform float uDpr;
uniform vec3 uBeam;  // xy: flare point (aspect space, centre origin, y up), z: hover strength 0..1
uniform vec4 uBurst; // xy: centre (aspect space), z: start time, w: strength

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// Hue 0..1 → saturated rainbow colour (red → yellow → green → blue → violet).
vec3 spec(float x) { return clamp(abs(fract(x * 0.82 + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
vec2 toUv(vec2 q) { return q / vec2(uAspect, 1.0) + 0.5; }

// Oil smear: a short line-integral blur along the stroke direction, which follows the
// picture's edges where it has them and a slow noise field where it is flat.
vec3 paint(vec2 uv, vec2 q, vec2 ch, float chK) {
  vec2 S = uRes / uDpr;
  vec2 e = 3.0 / S;
  float gx = lum(sourceAt(uv + vec2(e.x, 0.0))) - lum(sourceAt(uv - vec2(e.x, 0.0)));
  float gy = lum(sourceAt(uv + vec2(0.0, e.y))) - lum(sourceAt(uv - vec2(0.0, e.y)));
  vec2 g = vec2(gx, gy);
  float na = 1.0 + snoise(q * 1.7 + uSeed * 31.0) * 1.2;
  vec2 nd = vec2(cos(na), sin(na));
  vec2 ed = normalize(vec2(-g.y, g.x) + 1e-5);
  ed *= sign(dot(ed, nd) + 1e-4);
  vec2 dir = normalize(mix(nd, ed, smoothstep(0.015, 0.12, length(g))));

  vec2 stepUv = dir * p_smear * 0.0055 / vec2(uAspect, 1.0);
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = -4; i <= 4; i++) {
    float f = float(i);
    float w = 1.0 - abs(f) / 5.0;
    vec2 u = uv + stepUv * f;
    vec3 s = sourceAt(u);
    // Near the beam the paint itself splits: red and blue sampled apart.
    if (chK > 0.02) {
      s.r = mix(s.r, sourceAt(u + ch).r, chK);
      s.b = mix(s.b, sourceAt(u - ch).b, chK);
    }
    acc += s * w; ws += w;
  }
  vec3 col = acc / ws;
  // Soft posterise for flat, brushed colour areas.
  float sm = clamp(p_smear, 0.0, 1.0);
  col = mix(col, floor(col * 7.0 + 0.5) / 7.0, 0.3 * sm);
  // Bristle striations running along the stroke.
  vec2 pd = vec2(-dir.y, dir.x);
  float stri = snoise(vec2(dot(q, dir) * 7.0, dot(q, pd) * 240.0)) * 0.6 + snoise(vec2(dot(q, dir) * 3.0, dot(q, pd) * 90.0)) * 0.4;
  col *= 1.0 + stri * 0.08 * p_smear;
  return col * 0.92 + 0.045; // matte, slightly lifted like gouache
}

vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - clamp(b, 0.0, 1.0)); }

float beamProfile(float x, float w) {
  return smoothstep(w, w * 0.5, abs(x)) + 0.3 * exp(-abs(x) / (w * 2.5));
}

void main() {
  float t = uTime;
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 B = uBeam.xy;
  float hov = uBeam.z;
  float tilt = radians(p_tilt);

  // Beam frame: dx across the beam, along runs up the beam from the flare point.
  vec2 rel = q - B;
  vec2 rb = rot(tilt) * rel;
  float w = p_beamWidth * (1.0 + 0.3 * hov);
  float dx = rb.x + (snoise(vec2(rb.y * 5.0, t * 0.15)) * 0.14 + snoise(vec2(rb.y * 38.0, 3.7)) * 0.06) * w;
  float along = rb.y;
  float vmask = smoothstep(-0.3, 0.03, along);

  // Picture, refracted into colour fringes near the beam.
  float nearBeam = exp(-abs(dx) / (w * 5.0)) * vmask;
  vec2 ch = vec2(0.006 * p_dispersion, 0.0);
  vec3 col = paint(vUv, q, ch, nearBeam);
  // The room dims a little away from the light so the beam reads even on pale pictures.
  col *= 0.84 + 0.16 * max(exp(-abs(dx) / (w * 14.0)) * smoothstep(-0.5, 0.0, along), exp(-length(rel) * 3.0));

  // The beam: seven spectral copies of the profile, slightly offset, summing to white in the core.
  vec3 beam = vec3(0.0), wsum = vec3(0.0);
  for (int k = 0; k < 7; k++) {
    float f = float(k) / 6.0;
    vec3 c = spec(f);
    beam += c * beamProfile(dx - (f - 0.5) * p_dispersion * w * 1.7, w);
    wsum += c;
  }
  beam /= wsum;
  beam *= 0.86 + 0.14 * snoise(vec2(dx / w * 1.5, along * 4.0 - t * 0.35));
  beam *= vmask * vec3(1.0, 0.98, 0.92);
  col += beam * 1.1;
  // Soft daylight around the beam and a rainbow wash spilling to one side.
  col += vec3(1.0, 0.95, 0.85) * exp(-abs(dx) / (w * 9.0)) * 0.1 * vmask;
  float sx = -dx / (w * 8.0);
  float wash = smoothstep(0.0, 0.25, sx) * smoothstep(1.2, 0.5, sx) * smoothstep(-0.5, 0.1, along) * smoothstep(0.7, 0.1, along);
  col = screen(col, spec(clamp(sx, 0.0, 1.0)) * wash * 0.3 * min(p_dispersion, 1.5));

  // Flare at the end of the beam.
  float fa = p_flare * (0.65 + 0.55 * hov);
  float r = length(rel);
  float a = atan(rel.y, rel.x) + tilt;
  vec3 flare = vec3(1.0, 0.97, 0.9) * (0.0008 / (r * r + 0.0008)) * 0.9;
  flare += vec3(1.0, 0.97, 0.92) * pow(abs(cos(a * 2.0)), 90.0) * exp(-r * 7.0) * 0.9;
  flare += vec3(0.9, 0.95, 1.0) * pow(abs(cos(a * 2.0 + 0.785)), 200.0) * exp(-r * 14.0) * 0.6;
  // Anamorphic streak: long, thin, blue-white; stretches with cursor speed.
  float stretch = 1.6 / (1.0 + min(length(uMouseVel) * 40.0, 3.0) * hov);
  flare += vec3(0.55, 0.75, 1.0) * (exp(-abs(rel.y) * 300.0) + exp(-abs(rel.y) * 45.0) * 0.12) * exp(-abs(rel.x) * stretch);
  // Two thin rainbow lines crossing the poster through the flare.
  for (int k = 0; k < 2; k++) {
    float th = (k == 0 ? -0.34 : 0.13) + tilt * 0.5;
    vec2 n = vec2(-sin(th), cos(th));
    float d = dot(rel, n);
    float lw = 0.005;
    float line = smoothstep(lw, 0.0, abs(d)) * exp(-abs(dot(rel, vec2(n.y, -n.x))) * 0.9);
    flare += spec(clamp(0.5 + 0.5 * d / lw, 0.0, 1.0)) * line * (k == 0 ? 0.9 : 0.55);
  }
  // Lens ghosts strung along the line through the centre.
  for (int k = 0; k < 4; k++) {
    float f = float(k);
    vec2 gp = B * (0.35 - f * 0.45);
    float gr = 0.025 + f * 0.018;
    float gd = length(q - gp);
    flare += spec(fract(0.15 + f * 0.27)) * (smoothstep(gr, gr * 0.75, gd) * 0.05 + smoothstep(gr * 0.06, 0.0, abs(gd - gr)) * 0.08);
  }
  col += flare * fa;

  // Glints: chrome-like stars on the picture's highlights, brighter near the beam.
  float cs = 0.07;
  vec2 gid = floor(q / cs);
  vec2 h = hash22(gid + uSeed * 17.0);
  vec2 gc = (gid + 0.2 + 0.6 * h) * cs;
  float gl = lum(sourceAt(toUv(gc)));
  float o = cs * 0.4;
  float gav = 0.25 * (lum(sourceAt(toUv(gc + vec2(o, 0.0)))) + lum(sourceAt(toUv(gc - vec2(o, 0.0))))
                    + lum(sourceAt(toUv(gc + vec2(0.0, o)))) + lum(sourceAt(toUv(gc - vec2(0.0, o)))));
  // Only true highlights glint: bright, and brighter than their surroundings.
  float gAmp = smoothstep(0.55, 0.85, gl) * smoothstep(0.04, 0.16, gl - gav) * step(0.3, h.x) * (0.55 + 0.45 * sin(t * (1.0 + 2.0 * h.y) + h.x * 6.28));
  gAmp *= (0.35 + 1.4 * exp(-abs((rot(tilt) * (gc - B)).x) / 0.12)) * p_sparkle * fa;
  vec2 gr2 = q - gc;
  float grl = length(gr2);
  float ga = atan(gr2.y, gr2.x) + h.y;
  float glint = (pow(abs(cos(ga * 2.0)), 50.0) * exp(-grl * 110.0) + 0.00003 / (grl * grl + 0.00003)) * smoothstep(cs * 0.48, cs * 0.2, grl);
  col += vec3(1.0, 0.98, 0.94) * glint * gAmp;

  // Warm light leaks bleeding in from the edges.
  vec3 leakC = p_leakColour < 0.5 ? uPal[2] : p_leakColour < 1.5 ? uPal[3] : p_leakColour < 2.5 ? uPal[4] : uPal[5];
  vec3 warm = vec3(1.0, 0.45, 0.16);
  vec2 p1 = vec2(-0.55 * uAspect + 0.08 * sin(t * 0.07), 0.22 + 0.15 * sin(t * 0.05 + uSeed * 6.0));
  vec2 p2 = vec2(0.52 * uAspect + 0.1 * cos(t * 0.06), -0.42 + 0.1 * sin(t * 0.09));
  vec2 d1 = (q - p1) * vec2(1.3, 0.7), d2 = (q - p2) * vec2(0.9, 1.1);
  float flick = 0.85 + 0.15 * snoise(vec2(t * 0.25, uSeed * 9.0));
  vec3 leak = leakC * exp(-dot(d1, d1) * 5.0) * 0.9 + mix(warm, leakC, 0.25) * exp(-dot(d2, d2) * 6.0) * 0.75;
  leak += warm * smoothstep(0.32, 0.5, q.y) * (0.5 + 0.5 * snoise(vec2(q.x * 2.0, t * 0.08))) * 0.35;
  col = screen(col, leak * p_leak * flick);

  // Click: a burst of rainbow rays and a white flash.
  float age = t - uBurst.z;
  if (uBurst.w > 0.0 && age >= 0.0 && age < 3.0) {
    vec2 br = q - uBurst.xy;
    float rr = length(br);
    float ba = atan(br.y, br.x);
    float rays = pow(abs(sin(ba * 9.0 + 0.4)), 30.0) + 0.7 * pow(abs(sin(ba * 14.0 + 1.9)), 50.0) + 0.5 * pow(abs(sin(ba * 5.0 + 2.6)), 16.0);
    float front = age * 1.3 + 0.05;
    float inten = rays * smoothstep(front, front * 0.55, rr) * exp(-age * 1.6) * exp(-rr * 0.8) * uBurst.w;
    col += spec(fract(rr * 1.5 - age * 0.6 + ba * 0.159)) * inten * 1.2;
    col += vec3(1.0, 0.97, 0.9) * exp(-age * 5.0) * exp(-rr * 2.0) * 0.4 * uBurst.w;
  }

  // Canvas weave and film grain.
  vec2 fc = gl_FragCoord.xy / uDpr;
  float weave = snoise(fc * vec2(0.9, 0.3)) * 0.5 + snoise(fc * vec2(0.3, 0.9)) * 0.5;
  col *= 1.0 + weave * 0.035 * p_grain;
  col += (hash21(gl_FragCoord.xy + fract(floor(t * 24.0) * 0.137) * 997.0) - 0.5) * 0.09 * p_grain;

  // Gentle shoulder so the light rolls off instead of clipping hard.
  vec3 over = max(col - 0.8, 0.0);
  col = min(col, 0.8) + 0.2 * (1.0 - exp(-over * 5.0));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default {
  id: 'prism',
  name: 'Prism Light',
  engine: 'three',
  medium: 'image',
  hint: 'Move to steer the beam and flare, click to burst rainbow rays',
  params,
  controls: {
    essentials: ['beamWidth', 'dispersion', 'flare', 'smear'],
    groups: {
      Light: ['tilt', 'sparkle', 'burst'],
      Film: ['leak', 'leakColour', 'grain'],
    },
  },
  create(ctx) {
    const beam = new THREE.Vector3(0, 0.1, 0);
    const burst = new THREE.Vector4(0, 0, -99, 0);
    const uDpr = { value: 1 };
    const fs = createFullscreenShader(ctx, params, fragment, {
      source: true,
      extraUniforms: { uDpr, uBeam: { value: beam }, uBurst: { value: burst } },
    });
    let first = true;

    return {
      ...fs,
      frame(time, dt = 0) {
        const p = ctx.pointer;
        const { w, h, dpr } = fs.stage.size;
        uDpr.value = dpr;
        const aspect = w / h;
        const pow = ctx.state.motion.mouse;
        const follow = p.inside && pow > 0;
        const ph = ((ctx.state.seed % 1000) / 1000) * 6.283;
        // Idle: the beam wanders slowly across the upper middle.
        let tx = 0.17 * aspect * Math.sin(time * 0.11 + ph);
        let ty = 0.08 + 0.06 * Math.sin(time * 0.17 + ph * 1.7);
        if (follow) { tx = (p.x - 0.5) * aspect; ty = 0.5 - p.y; }
        if (first) { beam.x = tx; beam.y = ty; first = false; }
        const k = 1 - Math.exp(-dt * (follow ? 3 + pow : 0.8));
        beam.x += (tx - beam.x) * k;
        beam.y += (ty - beam.y) * k;
        beam.z += ((follow ? Math.min(1, pow) : 0) - beam.z) * (1 - Math.exp(-dt * 3));
        if (p.justPressed && p.inside && ctx.params.burst > 0 && pow > 0) {
          burst.set((p.x - 0.5) * aspect, 0.5 - p.y, time, ctx.params.burst * Math.min(1.5, pow));
        }
        fs.frame(time);
      },
    };
  },
};
