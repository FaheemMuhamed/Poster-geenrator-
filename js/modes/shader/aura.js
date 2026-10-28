// Aura Gradient: a domain-warped noise gradient, soft and airy (refs 5, 6, 8).
// The cursor swirls the colour field; holding the mouse down intensifies it.
import { createFullscreenShader } from '../../shared/fullscreenShader.js';

const params = {
  scale:    { value: 0.7, min: 0.2, max: 4, step: 0.01, label: 'Scale' },
  warp:     { value: 1.1, min: 0, max: 6, step: 0.01, label: 'Warp' },
  detail:   { value: 0.3, min: 0, max: 2, step: 0.01, label: 'Detail' },
  coverage: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'Colour coverage' },
  softness: { value: 0.7, min: 0.02, max: 1.5, step: 0.01, label: 'Softness' },
  hueShift: { value: 0, min: 0, max: 1, step: 0.01, label: 'Colour shift' },
  bands:    { value: 0, min: 0, max: 30, step: 1, label: 'Contour bands' },
  flow:     { value: 1, min: 0, max: 4, step: 0.01, label: 'Flow speed' },
  swirl:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Mouse swirl' },
};

const fragment = /* glsl */ `
// Low-octave noise: "detail" adds finer, marbled structure.
float soft(vec3 p) {
  return snoise(p) * 0.65 + snoise(p * 2.03 + 7.1) * 0.25 * p_detail + snoise(p * 4.1 + 3.7) * 0.1 * p_detail;
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * p_scale;
  vec2 m = (uMouse - 0.5) * vec2(uAspect, 1.0) * p_scale;
  float t = uTime * 0.08 * p_flow + uSeed * 50.0;

  // Swirl the space around the cursor.
  vec2 dm = p - m;
  float infl = exp(-dot(dm, dm) * 3.0 / (p_scale * p_scale)) * uInside * uMousePow * p_swirl * (1.0 + uDown);
  float a = infl * 2.5;
  p = m + mat2(cos(a), -sin(a), sin(a), cos(a)) * dm;

  vec2 q = vec2(soft(vec3(p, t)), soft(vec3(p + vec2(5.2, 1.3), t)));
  vec2 r = vec2(soft(vec3(p + p_warp * q + vec2(1.7, 9.2), t * 1.3)),
                soft(vec3(p + p_warp * q + vec2(8.3, 2.8), t * 1.3)));
  float f = soft(vec3(p + p_warp * r, t));

  float v = f * 0.5 + 0.5;
  if (p_bands > 0.5) v = mix(v, floor(v * p_bands) / p_bands, 0.85);
  vec3 col = paletteRamp(v * 0.9 + length(r) * 0.35 + p_hueShift);

  float mask = smoothstep(1.0 - p_coverage - p_softness * 0.5, 1.0 - p_coverage + p_softness * 0.5, v + length(q) * 0.25);
  col = mix(uPal[0], col, mask);
  gl_FragColor = vec4(col, 1.0);
}
`;

export default {
  id: 'aura',
  name: 'Aura Gradient',
  engine: 'three',
  hint: 'Move to swirl, hold to swirl harder',
  params,
  create(ctx) {
    return createFullscreenShader(ctx, params, fragment);
  },
};
