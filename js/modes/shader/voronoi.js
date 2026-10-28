// Voronoi Glass: drifting voronoi cells act as bevelled panes of glass, each refracting
// a palette gradient behind it with chromatic dispersion at the edges.
// The cursor pushes cells aside and carries a magnifying lens; clicking shatters the glass.
import { createFullscreenShader } from '../../shared/fullscreenShader.js';
import { THREE } from '../../shared/threeStage.js';

const params = {
  cells:      { value: 5, min: 2, max: 16, step: 0.1, label: 'Cell scale' },
  edge:       { value: 0.25, min: 0, max: 1, step: 0.01, label: 'Edge width' },
  refraction: { value: 0.7, min: 0, max: 2, step: 0.01, label: 'Refraction' },
  dispersion: { value: 0.7, min: 0, max: 2, step: 0.01, label: 'Dispersion' },
  rim:        { value: 0.6, min: 0, max: 2, step: 0.01, label: 'Rim glow' },
  drift:      { value: 1, min: 0, max: 4, step: 0.01, label: 'Drift speed' },
  gradScale:  { value: 1.2, min: 0.2, max: 4, step: 0.01, label: 'Gradient scale' },
  edgeColor:  { value: 'Ink', options: ['Ink', 'Light', 'Accent'], label: 'Edge colour' },
  push:       { value: 1, min: 0, max: 2, step: 0.01, label: 'Mouse push' },
  lens:       { value: 1, min: 0, max: 1, step: 0.01, label: 'Lens' },
};

const fragment = /* glsl */ `
uniform vec3 uShatter; // xy (poster space), amount 0..1 (decays after a click)

float gT; // drift clock

// Each grid cell owns one point that wanders around inside it.
vec2 cellPoint(vec2 id) {
  vec2 h = hash22(id + uSeed * 37.0);
  return id + 0.5 + 0.36 * sin(gT * (0.4 + 0.6 * h.yx) + 6.283 * h);
}

// Points are pushed away from the cursor (grid space), capped so the 3x3 search holds.
vec2 repel(vec2 pt, vec2 mg, float push) {
  vec2 d = pt - mg;
  float l = max(length(d), 1e-3);
  return pt + d / l * min(push * 0.6 * exp(-l * l / 1.4), 0.6);
}

// The palette gradient seen through the glass.
vec3 backdrop(vec2 q) {
  vec2 s = q * p_gradScale;
  float n = snoise(vec3(s, gT * 0.08 + uSeed * 10.0)) * 0.6 + snoise(vec3(s * 2.3 + 4.0, gT * 0.11)) * 0.25;
  float v = n * 0.45 + q.y * 0.5 + q.x * 0.15 + uSeed;
  float airy = smoothstep(0.1, 0.8, n * 0.5 + 0.5);
  return mix(paletteRamp(v), uPal[0], airy * 0.2);
}

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 m = vec2(uMouse.x * uAspect, uMouse.y);
  gT = uTime * p_drift * 0.5;

  // Lens: a round magnifier riding with the cursor (the pushed cells leave room for it).
  vec2 dl = p - m;
  float lr = 0.09 + 0.03 * min(uMousePow, 2.0);
  float lensA = (1.0 - smoothstep(lr * 0.97, lr, length(dl))) * uInside * p_lens;
  p = mix(p, m + dl * 0.45, lensA); // everything inside is seen ~2x bigger

  // Shatter: locally squeeze space around the click so cells there become tiny.
  vec2 sc = p - uShatter.xy;
  float sh = uShatter.z * exp(-dot(sc, sc) / 0.06);
  vec2 g = (uShatter.xy + sc * (1.0 + 3.0 * sh)) * p_cells;
  vec2 ms = m - uShatter.xy;
  vec2 mg = (uShatter.xy + ms * (1.0 + 3.0 * uShatter.z * exp(-dot(ms, ms) / 0.06))) * p_cells;
  float push = uInside * uMousePow * p_push;

  // Voronoi: nearest point, then exact distance to the cell border (two-pass method).
  vec2 ip = floor(g);
  vec2 mr = vec2(0.0), mb = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 b = vec2(float(i), float(j));
    vec2 r = repel(cellPoint(ip + b), mg, push) - g;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mb = b; }
  }
  float ed = 8.0;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    vec2 b = mb + vec2(float(i), float(j));
    vec2 r = repel(cellPoint(ip + b), mg, push) - g;
    vec2 dr = r - mr;
    if (dot(dr, dr) > 1e-5) ed = min(ed, dot(0.5 * (mr + r), normalize(dr)));
  }
  vec2 cid = ip + mb;
  float ch = hash21(cid + uSeed * 13.0);

  // Glass normal: a bevel toward the border plus a random tilt per pane.
  float bev = 1.0 - smoothstep(0.0, 0.2, ed);
  vec2 nrm = -normalize(mr + 1e-5) * bev * 0.8 + (hash22(cid + 7.0) - 0.5) * 0.7;
  vec2 off = nrm * p_refraction * 0.08 * (1.0 + sh);

  off *= 1.0 + lensA;

  // Chromatic dispersion: red / green / blue see the backdrop at slightly different offsets.
  vec2 q = p + off;
  vec2 dir = normalize(nrm + 1e-4) * p_dispersion * 0.022 * (0.25 + bev + lensA);
  vec3 col = vec3(backdrop(q - dir).r, backdrop(q).g, backdrop(q + dir).b);

  // Per-pane tint and brightness so neighbouring panes read as separate pieces.
  col = mix(col, paletteRamp(ch + uSeed), 0.1);
  col *= 0.93 + 0.14 * ch;

  // Lighting: rim glow inside the border, specular glint on the bevel.
  vec3 N = normalize(vec3(nrm * 1.3, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.55, 0.7));
  float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 36.0);
  float glow = exp(-ed * 12.0) * p_rim;
  col += glow * mix(paletteRamp(ch + 0.35), vec3(1.0), 0.45) * 0.45;
  col += spec * 0.45 * bev;
  col += (dot(N, L) - L.z) * 0.35; // bevel catches light on one side, shade on the other

  // Edges (lead lines) and the lens ring.
  vec3 edgeCol = p_edgeColor < 0.5 ? uPal[1] : p_edgeColor < 1.5 ? mix(vec3(1.0), uPal[0], 0.15) : uPal[2];
  float ew = p_edge * 0.05;
  float line = (1.0 - smoothstep(ew, ew + fwidth(ed) * 1.5, ed)) * step(0.001, p_edge);
  col = mix(col, edgeCol, line);
  float px = 1.0 / uRes.y;
  float ring = 1.0 - smoothstep(px * (1.0 + p_edge * 4.0), px * (2.5 + p_edge * 4.0), abs(length(dl) - lr));
  col = mix(col, edgeCol, ring * uInside * p_lens);
  col += lensA * 0.4 * pow(max(1.0 - length(dl - vec2(-0.3, 0.35) * lr) / lr, 0.0), 6.0);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default {
  id: 'voronoi',
  name: 'Voronoi Glass',
  engine: 'three',
  hint: 'Move to push the glass + lens, click to shatter',
  params,
  create(ctx) {
    const shatter = new THREE.Vector3(0.5, 0.5, 0);
    const fs = createFullscreenShader(ctx, params, fragment, { extraUniforms: { uShatter: { value: shatter } } });

    return {
      ...fs,
      frame(time, dt) {
        const p = ctx.pointer;
        const { w, h } = fs.stage.size;
        if (p.justPressed && p.inside) shatter.set(p.x * (w / h), 1 - p.y, 1);
        if (dt > 0) shatter.z *= Math.exp(-dt * 0.8); // the shards relax back
        fs.frame(time);
      },
    };
  },
};
