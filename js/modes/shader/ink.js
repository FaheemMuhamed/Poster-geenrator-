// Ink Bleed: paper chromatography strips (refs 2, 3). Each lane holds a column of
// oval ink spots whose pigments separate into coloured halos that travel at different
// speeds. Hovering wets the paper so nearby spots swell and bleed; clicking drops ink.
import { createFullscreenShader } from '../../shared/fullscreenShader.js';
import { THREE } from '../../shared/threeStage.js';

const MAX_DROPS = 8;   // click drops remembered in a uniform array (oldest replaced)
const TRAIL = 6;       // lagging "wet" points left behind by the cursor

const params = {
  lanes:      { value: 5, min: 1, max: 12, step: 1, label: 'Lane count' },
  spots:      { value: 22, min: 4, max: 48, step: 1, label: 'Spots per lane' },
  spotWidth:  { value: 0.62, min: 0.2, max: 0.95, step: 0.01, label: 'Spot width' },
  bleed:      { value: 0.7, min: 0, max: 2, step: 0.01, label: 'Bleed' },
  separation: { value: 0.9, min: 0, max: 2.5, step: 0.01, label: 'Separation' },
  outline:    { value: 0.6, min: 0, max: 1, step: 0.01, label: 'Outline' },
  gaps:       { value: 0.15, min: 0, max: 0.8, step: 0.01, label: 'Gap size' },
  speed:      { value: 1, min: 0, max: 4, step: 0.01, label: 'Speed' },
  wetness:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Wetting strength' },
  paper:      { value: 0.5, min: 0, max: 1, step: 0.01, label: 'Paper texture' },
};

const fragment = /* glsl */ `
uniform vec4 uDrops[${MAX_DROPS}];  // xy (poster space), birth time (<0 = empty), colour seed
uniform vec3 uTrail[${TRAIL}];      // xy (poster space), strength

float gLight; // 1 on pale paper (inks multiply), 0 on dark paper (inks screen)

vec3 inkOver(vec3 col, vec3 c, float a) {
  vec3 blended = mix(1.0 - (1.0 - col) * (1.0 - c), col * c, gLight);
  return mix(col, blended, clamp(a, 0.0, 1.0));
}

// Horizontal pill (capsule) of half-width hw and radius r.
float sdPill(vec2 q, float hw, float r) {
  q.x = max(abs(q.x) - (hw - r), 0.0);
  return length(q) - r;
}

// How wet the paper is here: the cursor plus its fading trail.
float wetAt(vec2 p) {
  vec2 m = vec2(uMouse.x * uAspect, uMouse.y);
  vec2 d = p - m;
  float w = exp(-dot(d, d) / 0.018) * uInside;
  for (int i = 0; i < ${TRAIL}; i++) {
    d = p - uTrail[i].xy;
    w = max(w, exp(-dot(d, d) / 0.012) * uTrail[i].z);
  }
  return w * p_wetness * uMousePow;
}

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float t = uTime * p_speed;
  float aa = 1.5 / uRes.y;
  gLight = step(0.4, dot(uPal[0], vec3(0.299, 0.587, 0.114)));

  // ---- Layout: lanes across, spots stacked in each lane ----
  float mx = uAspect * 0.07;
  float my = 0.05;
  float laneW = (uAspect - 2.0 * mx) / p_lanes;
  float H = 1.0 - 2.0 * my;
  float pitch = H / p_spots;
  float wet = wetAt(p);

  // Fibre texture (runs vertically like chromatography paper).
  float fib = snoise(p * vec2(70.0, 5.0) + uSeed * 30.0) * 0.6 + snoise(p * vec2(220.0, 30.0)) * 0.4;

  // ---- Paper: a pale strip behind each lane with a soft drop shadow ----
  float li = floor((p.x - mx) / laneW);
  float lx = (p.x - mx) - (li + 0.5) * laneW;
  float inLane = step(0.0, li) * step(li, p_lanes - 1.0);
  float sw = laneW * 0.47;
  float strip = inLane * (1.0 - smoothstep(sw - aa, sw + aa, abs(lx)))
              * smoothstep(0.02 - aa, 0.02 + aa, p.y) * (1.0 - smoothstep(0.98 - aa, 0.98 + aa, p.y));
  float shadow = inLane * (1.0 - smoothstep(sw - 0.004, sw + 0.012, abs(lx - 0.006)))
               * smoothstep(0.012, 0.02, p.y) * (1.0 - smoothstep(0.975, 0.99, p.y + 0.006));
  vec3 paperLift = mix(uPal[0] + 0.03, vec3(1.0), 0.45);
  vec3 col = uPal[0] * mix(1.0, 0.93, p_paper);
  col *= 1.0 - shadow * 0.08 * (1.0 - strip);
  col = mix(col, mix(uPal[0], paperLift, p_paper), strip);

  // One noise lookup shared by every spot gives organic, slowly crawling edges.
  vec2 wob = vec2(snoise(vec3(p * 16.0, t * 0.06)), snoise(vec3(p * 16.0 + 7.3, t * 0.06)))
           * pitch * (0.07 + wet * 0.12);

  vec4 core = vec4(0.0);  // spot fills (rgb, alpha)
  vec4 ring = vec4(0.0);  // outlines
  for (int dl = -1; dl <= 1; dl++) {
    float L = li + float(dl);
    if (L < 0.0 || L > p_lanes - 1.0) continue;
    float hl = hash11(L * 13.7 + uSeed * 91.0);
    float scroll = t * 0.01 * (0.35 + hl);              // pigments creep up the strip
    vec2 q0 = p + wob - vec2(mx + (L + 0.5) * laneW, my);
    float jc = floor((q0.y - scroll) / pitch);
    float run = 3.0 + floor(hash11(L + 3.1) * 6.0);    // spots per colour run

    for (int dj = -2; dj <= 2; dj++) {
      float j = jc + float(dj);
      float h = hash21(vec2(L, j) + uSeed * 17.0);
      // Gaps: occasional single missing spots plus whole empty runs.
      if (h < p_gaps * 0.4 || hash21(vec2(L, floor(j / run)) + uSeed * 3.0) < p_gaps * 0.8) continue;
      float yc = (j + 0.5) * pitch + scroll;
      float vis = smoothstep(-0.3 * pitch, pitch, yc) * (1.0 - smoothstep(H - pitch, H + 0.3 * pitch, yc));
      if (vis <= 0.0) continue;
      vec2 q = q0 - vec2(0.0, yc);

      // Colour: runs of related pigments that drift through the palette down the lane.
      float ct = hl * 4.0 + floor(j / run) * 0.29 + fract(j / run) * 0.12;
      vec3 cSpot = paletteRamp(ct);
      vec3 cUp = paletteRamp(ct + 0.5);
      vec3 cDn = paletteRamp(ct + 0.27);

      float life = 0.5 + 0.5 * sin(t * 0.35 + h * 6.283);  // each spot breathes
      float hw = laneW * 0.5 * p_spotWidth * (0.85 + 0.3 * fract(h * 7.1)) * (1.0 + wet * 0.25);
      float r = min(pitch * 0.36 * (1.0 + wet * 0.35), hw);
      float d = sdPill(q, hw, r);

      // Bleed halos: two pigments, one running ahead (up), one lagging (down).
      float bw = pitch * (0.12 + p_bleed * (0.25 + 0.25 * life)) * (1.0 + wet * 2.0);
      float sep = min(p_separation * pitch * (0.3 + 0.35 * life) * (1.0 + wet * 0.8), pitch);
      float dUp = sdPill(q - vec2(0.0, sep), hw * (1.0 + 0.12 * p_bleed), r);
      float dDn = sdPill(q + vec2(0.0, sep * 0.55), hw * (1.0 + 0.2 * p_bleed), r);
      float big = step(0.93, fract(h * 13.7));          // a few spots carry a heavy pigment glow
      bw *= 1.0 + big * 0.8;
      // Halos taper to zero before the edge of the neighbourhood we search (no clipping).
      float reach = pitch * 1.1;
      float halo = (0.3 + 0.15 * wet + big * 0.25) * vis * min(p_bleed * 2.0 + 0.15, 1.0);
      col = inkOver(col, cUp, exp(-max(dUp, 0.0) / bw) * (1.0 - smoothstep(0.3 * reach, reach, dUp)) * halo);
      col = inkOver(col, cDn, exp(-max(dDn, 0.0) / (bw * 0.7)) * (1.0 - smoothstep(0.3 * reach, reach, dDn)) * halo * 0.8);

      // Core: ink pools at the rim (coffee ring), slightly mottled.
      float fill = (1.0 - smoothstep(-aa, aa, d)) * vis * 0.9;
      float pool = smoothstep(-r * 0.8, 0.0, d);
      vec3 cc = mix(mix(cSpot, uPal[0], 0.12), mix(cSpot, uPal[1], 0.28), pool) * (0.95 + 0.05 * fib);
      core.rgb = mix(core.rgb, cc, fill);
      core.a = max(core.a, fill);

      // Outline ring just inside the edge, in a darker shade of the pigment.
      float ow = pitch * 0.05;
      float ra = p_outline * (1.0 - smoothstep(ow * 0.5, ow * 0.5 + aa, abs(d + ow))) * vis;
      ring.rgb = mix(ring.rgb, mix(cSpot * 0.4, uPal[1], 0.35), ra);
      ring.a = max(ring.a, ra);
    }
  }

  // Cores are mostly opaque pigment, partly tinted by the halos underneath.
  col = mix(col, mix(core.rgb, inkOver(col, core.rgb, 1.0), 0.25), core.a);
  col = mix(col, ring.rgb, ring.a);


  // ---- Click drops (over everything): circular chromatography, three pigments spreading at different rates ----
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    vec4 D = uDrops[i];
    if (D.z < 0.0) continue;
    float age = max(uTime - D.z, 0.0);
    float grow = 1.0 - exp(-age * 0.3 * max(p_speed, 0.2));
    float R = 0.035 + 0.17 * grow * (0.6 + p_bleed * 0.5) * (1.0 + wet * 0.3);
    vec2 dq = p + wob * 2.0 - D.xy;
    float rr = length(dq) / R + snoise(normalize(dq + 1e-5) * 1.7 + D.w * 40.0) * 0.06;
    float fade = smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(50.0, 70.0, age));
    vec3 a = paletteRamp(D.w * 4.0), b = paletteRamp(D.w * 4.0 + 0.25), c = paletteRamp(D.w * 4.0 + 0.5);
    col = inkOver(col, c, (1.0 - smoothstep(0.75, 1.05, rr)) * 0.38 * fade);
    col = inkOver(col, b, (1.0 - smoothstep(0.5, 0.58, rr)) * 0.5 * fade);
    col = inkOver(col, a, (1.0 - smoothstep(0.22, 0.27, rr)) * 0.75 * fade);
    float lines = (1.0 - smoothstep(0.0, 0.025, abs(rr - 0.56))) + (1.0 - smoothstep(0.0, 0.03, abs(rr - 0.98))) * 0.5;
    col = inkOver(col, mix(b * 0.4, uPal[1], 0.3), lines * p_outline * fade);
  }

  // Paper grain on top so ink sits in the fibres.
  col *= 1.0 - p_paper * 0.05 * (fib * 0.5 + 0.5);
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.015 * p_paper;
  gl_FragColor = vec4(col, 1.0);
}
`;

export default {
  id: 'ink',
  name: 'Ink Bleed',
  engine: 'three',
  hint: 'Hover to wet the paper, click to drop ink',
  params,
  controls: {
    essentials: ['lanes', 'spots', 'bleed', 'separation'],
    form: ['spotWidth', 'outline', 'gaps', 'paper'],
    motion: ['speed'],
    interaction: ['wetness'],
  },
  presets: {
    'Fine strips': { lanes: 9, spots: 36, spotWidth: 0.45, bleed: 0.4 },
    'Big bloom': { lanes: 3, spots: 10, bleed: 1.6, separation: 1.8 },
    'Clean dots': { bleed: 0.2, separation: 0.3, outline: 0.9, gaps: 0.4 },
  },
  interactions: { hover: 'wets the paper so nearby spots swell and bleed', click: 'drops ink that spreads into rings' },
  create(ctx) {
    const drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4(0, 0, -1, 0));
    const trail = Array.from({ length: TRAIL }, () => new THREE.Vector3(0, 0, 0));
    const fs = createFullscreenShader(ctx, params, fragment, {
      extraUniforms: { uDrops: { value: drops }, uTrail: { value: trail } },
    });
    let nextDrop = 0, nextTrail = 0, trailClock = 0;

    return {
      ...fs,
      frame(time, dt) {
        const p = ctx.pointer;
        const { w, h } = fs.stage.size;
        const px = p.x * (w / h), py = 1 - p.y;
        if (p.justPressed && p.inside) {
          drops[nextDrop].set(px, py, time, ctx.rand());
          nextDrop = (nextDrop + 1) % MAX_DROPS;
        }
        if (dt > 0) {
          // Trail points dry out over a few seconds.
          for (const tp of trail) tp.z *= Math.exp(-dt * 0.7);
          trailClock += dt;
          if (p.inside && trailClock > 0.15) {
            trailClock = 0;
            trail[nextTrail].set(px, py, 0.8);
            nextTrail = (nextTrail + 1) % TRAIL;
          }
        }
        fs.frame(time);
      },
    };
  },
};
