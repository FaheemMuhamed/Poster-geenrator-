// Strata: folded geological layers (refs 18, 19). Many thin domain-warped bands in palette
// colours, each stitched with a fine hatching that follows the fold, flowing slowly sideways.
// Optional cream "paper" margin where the strata fray into loose stitches, like a print.
// Hover squeezes and kinks the layers around the cursor; hold to push harder; click sends a tremor.
import { createFullscreenShader } from '../../shared/fullscreenShader.js';
import { shaderSketch } from '../../shared/codegen.js';
import { THREE } from '../../shared/threeStage.js';

const params = {
  layers:   { value: 30, min: 8, max: 90, step: 1, label: 'Layers' },
  fold:     { value: 1, min: 0, max: 2.5, step: 0.01, label: 'Fold' },
  warp:     { value: 0.6, min: 0, max: 2.5, step: 0.01, label: 'Warp' },
  hatch:    { value: 0.65, min: 0, max: 1, step: 0.01, label: 'Hatching' },
  edges:    { value: 0.5, min: 0, max: 1, step: 0.01, label: 'Ink edges' },
  paper:    { value: 0.2, min: 0, max: 0.5, step: 0.01, label: 'Paper margin' },
  hueShift: { value: 0, min: 0, max: 1, step: 0.01, label: 'Colour shift' },
  flow:     { value: 1, min: 0, max: 4, step: 0.01, label: 'Flow speed' },
  push:     { value: 1, min: 0, max: 2, step: 0.01, label: 'Mouse fold' },
};

const fragment = /* glsl */ `
uniform vec4 uPulse; // click: xy point (poster space), z strength (decays), w seconds since the click
uniform vec2 uHold;  // x: eased press 0..1, y: 1 when the app drives it (otherwise uDown is used)

float fbm3(vec2 p) {
  return snoise(p) * 0.55 + snoise(p * 2.07 + 3.1) * 0.28 + snoise(p * 4.3 + 7.7) * 0.14;
}

// Each layer index picks a palette colour (accents and their in-betweens), sometimes ink or a pale band.
vec3 layerColor(float id) {
  float r = hash21(vec2(id * 0.913 + 3.7, uSeed * 17.0 + 1.3));
  float r2 = hash21(vec2(id * 1.37 + 11.0, uSeed * 5.0 + 2.1));
  vec3 c = paletteRamp(floor(r2 * 8.0) / 8.0 + p_hueShift);
  if (r < 0.08) c = uPal[1];
  else if (r < 0.13) c = mix(uPal[1], c, 0.45);
  else if (r < 0.17) c = mix(uPal[0], c, 0.3);
  return c * (0.94 + 0.1 * hash11(id * 3.3 + uSeed * 7.0));
}

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 m = vec2(uMouse.x * uAspect, uMouse.y);
  float hold = uHold.y > 0.5 ? uHold.x : uDown;
  float t = uTime * 0.035 * p_flow;
  vec2 so = vec2(uSeed * 53.0, uSeed * 29.0);

  // Cursor: squeeze the strata vertically toward the cursor (they compress), then kink them.
  vec2 dm = p - m;
  vec2 dme = dm * vec2(0.7, 1.0);
  float g = exp(-dot(dme, dme) / (0.03 + 0.03 * hold)) * uInside * uMousePow * p_push;
  float k = g * (0.55 + 1.3 * hold);
  vec2 sp = p;
  sp.y = m.y + (p.y - m.y) * (1.0 + 2.2 * k);
  sp.x += 0.03 * k * sin(dm.y * 30.0);

  // Layer height: a gently tilted base, big folds, then domain-warped detail.
  vec2 w = sp + vec2(t, 0.0) + so;
  float big = snoise(vec2(w.x * 0.8, w.y * 0.5 + t * 0.4));
  vec2 q = vec2(fbm3(w * vec2(1.1, 2.0) + vec2(0.0, t)), fbm3(w * vec2(1.1, 2.0) + vec2(5.2, 1.3 - t)));
  float h = sp.y + p_fold * (0.12 * big + 0.04 * sin(w.x * 2.6 + big * 2.5));
  h += p_warp * 0.05 * fbm3(w * vec2(1.4, 3.5) + q * (1.0 + 1.5 * p_warp));
  h += 0.035 * k * sin(dm.x * 16.0);

  // Click: an expanding ring that shakes the layers like a tremor.
  float dcl = length(p - uPulse.xy);
  float ring = uPulse.z * exp(-pow((dcl - uPulse.w * 0.5) * 10.0, 2.0));
  h += 0.02 * ring * sin(dcl * 70.0);

  float L = p_layers;
  float v = h * L;
  v += p_fold * 0.9 * snoise(vec2(v * 0.11, w.x * 0.35 + so.x)); // uneven thickness, overturned folds
  float id = floor(v);
  float f = fract(v);

  // Pockets of another layer, like inclusions in rock.
  float inc = fbm3(w * vec2(3.0, 7.0) + q * 2.0 + vec2(id * 0.7, 0.0));
  float pocket = step(0.42 - 0.06 * p_warp, inc);
  vec3 col = layerColor(id + pocket * 2.0);

  // Hatching: fine threads parallel to the layer, broken into short slanted stitches.
  float nS = clamp(floor(170.0 / L), 2.0, 9.0);
  float s = v * nS;
  float row = floor(s);
  float fs = fract(s);
  float dxs = p.x * 150.0 + fs * 0.8 + hash11(row * 1.7 + 0.5) * 9.0 + snoise(vec2(row * 0.37, p.x * 4.0)) * 0.5;
  float fd = fract(dxs);
  float dash = smoothstep(0.0, 0.12, fd) * (1.0 - smoothstep(0.62, 0.78, fd));
  float gap = smoothstep(0.0, 0.2, fs) * (1.0 - smoothstep(0.8, 1.0, fs));
  float thread = dash * gap;
  float tone = 0.62 + 0.38 * thread + 0.1 * (hash11(row * 3.1 + floor(dxs) * 0.37) - 0.5);
  col *= mix(1.0, tone, p_hatch);
  float sheen = step(0.84, hash11(row * 5.7 + floor(dxs * 0.25)));
  col = mix(col, mix(col, vec3(1.0), 0.3), p_hatch * thread * sheen);

  // Ink edges along some layer boundaries.
  float e = step(0.55, hash11(id * 2.9 + uSeed * 3.0));
  float edge = (1.0 - smoothstep(0.0, 0.07 + 0.05 * p_edges, f)) * e * p_edges;
  col = mix(col, uPal[1], edge * 0.9 * (1.0 - pocket));

  // Paper margin: the strata end in a frayed, stitched edge like the foot of a print.
  if (p_paper > 0.001) {
    float edgeY = p_paper + 0.045 * fbm3(vec2(w.x * 2.2, so.y)) + 0.012 * snoise(vec2(p.x * 14.0, t + so.x));
    float dz = (edgeY - p.y) / 0.045; // 0 at the edge, 1 at the end of the fringe
    float keep = step(dz, 0.0) + step(0.0, dz) * step(dz, 1.0) * step(dz, hash11(row * 7.3 + floor(dxs) * 0.61)) * step(0.5, dash);
    col = mix(uPal[0], col, clamp(keep, 0.0, 1.0));
  }

  col += (hash21(gl_FragCoord.xy) - 0.5) * 0.035;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default {
  id: 'strata',
  name: 'Strata',
  engine: 'three',
  hint: 'Hover to fold the layers, hold to push, click for a tremor',
  params,
  controls: {
    essentials: ['layers', 'fold', 'warp', 'paper'],
    groups: { Texture: ['hatch', 'edges', 'hueShift'], Motion: ['flow', 'push'] },
  },
  create(ctx) {
    const pulse = new THREE.Vector4(-10, -10, 0, 0);
    const hold = new THREE.Vector2(0, 1);
    const fs = createFullscreenShader(ctx, params, fragment, {
      extraUniforms: { uPulse: { value: pulse }, uHold: { value: hold } },
    });
    return {
      ...fs,
      frame(time, dt) {
        const p = ctx.pointer;
        const { w, h } = fs.stage.size;
        const d = Math.min(Math.max(dt || 0, 0), 0.1);
        if (p.justPressed && p.inside) pulse.set(p.x * (w / h), 1 - p.y, 1, 0);
        pulse.w += d;
        pulse.z *= Math.exp(-d * 1.1);
        hold.x += ((p.down && p.inside ? 1 : 0) - hold.x) * (1 - Math.exp(-d * 5));
        fs.frame(time);
      },
    };
  },
  code: (values, colors, seed) => shaderSketch({ id: 'strata', name: 'Strata', params, values, colors, seed, fragment }),
};
