// Heat Pulse: a thermal map of wandering, pulsing hotspots (ref 20). Gaussian heat sources
// are summed into a field, mapped to a heat ramp with contour isolines, then cut into thin
// grid panels, some of them shifted like misaligned tiles. Crosshairs mark the peaks.
// The cursor is a heat source (hold to make it much hotter); clicking drops a heat flare.
import { createFullscreenShader } from '../../shared/fullscreenShader.js';
import { shaderSketch } from '../../shared/codegen.js';
import { THREE } from '../../shared/threeStage.js';

const params = {
  hotspots: { value: 9, min: 1, max: 16, step: 1, label: 'Hotspots' },
  spread:   { value: 1, min: 0.3, max: 2.5, step: 0.01, label: 'Spread' },
  contours: { value: 10, min: 0, max: 30, step: 1, label: 'Contour lines' },
  ramp:     { value: 'Palette', options: ['Palette', 'Thermal', 'Mono ink'], label: 'Colour ramp' },
  grid:     { value: 4, min: 1, max: 10, step: 1, label: 'Panel grid' },
  shift:    { value: 0.3, min: 0, max: 1, step: 0.01, label: 'Panel shift' },
  markers:  { value: true, label: 'Crosshairs' },
  frame:    { value: 0.05, min: 0, max: 0.15, step: 0.005, label: 'Frame margin' },
  speed:    { value: 1, min: 0, max: 4, step: 0.01, label: 'Speed' },
  heat:     { value: 1, min: 0, max: 2, step: 0.01, label: 'Mouse heat' },
};

const fragment = /* glsl */ `
uniform vec4 uPulse; // click: xy point (poster space), z strength (decays), w seconds since the click
uniform vec2 uHold;  // x: eased press 0..1, y: 1 when the app drives it (otherwise uDown is used)

vec2 gMin, gSize, gMouse;
float gT, gHold;

// Classic thermal-camera ramp: deep navy, blue, cyan, green, yellow, orange, red.
vec3 jet(float t) {
  float s = clamp(t, 0.0, 1.0) * 6.0;
  vec3 c0 = vec3(0.10, 0.05, 0.28), c1 = vec3(0.12, 0.22, 0.80), c2 = vec3(0.05, 0.62, 0.92);
  vec3 c3 = vec3(0.30, 0.76, 0.35), c4 = vec3(0.96, 0.90, 0.15), c5 = vec3(1.0, 0.52, 0.06), c6 = vec3(0.90, 0.10, 0.05);
  if (s < 1.0) return mix(c0, c1, s);
  if (s < 2.0) return mix(c1, c2, s - 1.0);
  if (s < 3.0) return mix(c2, c3, s - 2.0);
  if (s < 4.0) return mix(c3, c4, s - 3.0);
  if (s < 5.0) return mix(c4, c5, s - 4.0);
  return mix(c5, c6, s - 5.0);
}

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void cswap(inout vec3 a, inout vec3 b) { if (lum(a) > lum(b)) { vec3 t = a; a = b; b = t; } }

vec3 heatRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  if (p_ramp < 0.5) {
    // Palette: from the darker of bg/ink through the four accents sorted dark to light,
    // so the hottest spots are always the brightest colour, whatever the palette.
    vec3 a = uPal[2], b = uPal[3], c = uPal[4], d = uPal[5];
    cswap(a, b); cswap(c, d); cswap(a, c); cswap(b, d); cswap(b, c);
    vec3 cold = mix(lum(uPal[1]) < lum(uPal[0]) ? uPal[1] : uPal[0], a, 0.25);
    float s = t * 4.0;
    if (s < 1.0) return mix(cold, a, s);
    if (s < 2.0) return mix(a, b, s - 1.0);
    if (s < 3.0) return mix(b, c, s - 2.0);
    return mix(c, d, s - 3.0);
  }
  if (p_ramp < 1.5) return jet(t);
  return mix(uPal[0], uPal[1], smoothstep(0.05, 0.95, t));
}

// Hotspot i: xy position (poster space), z amplitude. Seeded, wandering and pulsing.
vec3 spot(float fi) {
  vec2 h = hash22(vec2(fi * 7.31 + 1.7, uSeed * 113.0 + 0.5));
  vec2 h2 = hash22(vec2(fi * 3.17 + 9.1, uSeed * 71.0 + 2.5));
  vec2 c = gMin + (0.1 + 0.8 * h) * gSize;
  c += gSize * 0.06 * vec2(sin(gT * (0.35 + 0.5 * h2.x) + h.y * 6.283), cos(gT * (0.3 + 0.5 * h2.y) + h.x * 6.283));
  float amp = (0.35 + 0.65 * h2.x) * (0.8 + 0.2 * sin(gT * (1.2 + h2.y) + fi * 1.7));
  return vec3(c, amp);
}

// Heat field: x value, yz gradient (gradient of the noise floor is left out, it is small).
vec3 field(vec2 q) {
  float v = 0.15 + 0.1 * snoise(q * 2.2 + uSeed * 40.0 + vec2(0.0, gT * 0.1)) + 0.05 * snoise(q * 5.0 - gT * 0.15);
  vec2 gr = vec2(0.0);
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    if (fi >= p_hotspots) break;
    vec3 s = spot(fi);
    float sg = p_spread * gSize.y * (0.045 + 0.06 * hash11(fi * 5.3 + uSeed * 9.0));
    vec2 d = q - s.xy;
    float e = s.z * exp(-dot(d, d) / (2.0 * sg * sg));
    v += e;
    gr -= e * d / (sg * sg);
  }
  // The cursor warms the field around it; holding makes it far hotter and wider.
  vec2 dm = q - gMouse;
  float r = 0.05 + 0.035 * gHold;
  float e = uInside * uMousePow * p_heat * (0.45 + 1.5 * gHold) * exp(-dot(dm, dm) / (2.0 * r * r));
  v += e;
  gr -= e * dm / (r * r);
  // Click flare: a hot core plus a ring of heat travelling outward.
  vec2 dc = q - uPulse.xy;
  float dl = max(length(dc), 1e-4);
  float core = uPulse.z * 0.9 * exp(-dl * dl / 0.003);
  float rr = (dl - uPulse.w * 0.35) / 0.035;
  float ring = uPulse.z * 0.5 * exp(-rr * rr);
  v += core + ring;
  gr += -core * dc / 0.0015 - ring * 2.0 * rr / 0.035 * dc / dl;
  return vec3(v, gr);
}

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float px = 1.0 / uRes.y;
  gHold = uHold.y > 0.5 ? uHold.x : uDown;
  gT = uTime * 0.25 * p_speed;
  gMouse = vec2(uMouse.x * uAspect, uMouse.y);

  float fr = p_frame;
  float legend = fr > 0.004 ? 1.0 : 0.0;
  gMin = vec2(fr);
  vec2 gMax = vec2(uAspect - fr - legend * 0.045, 1.0 - fr);
  gSize = gMax - gMin;
  vec3 col = uPal[0];
  vec3 lineCol = mix(vec3(1.0), uPal[0], 0.2);

  // Legend bar on the right, with ticks.
  if (legend > 0.5) {
    float lx0 = gMax.x + 0.022, lx1 = gMax.x + 0.034;
    if (p.x > lx0 && p.x < lx1 && p.y > gMin.y && p.y < gMax.y) col = heatRamp((p.y - gMin.y) / gSize.y);
    float ty = fract((p.y - gMin.y) / gSize.y * 5.0 + 0.5) - 0.5;
    float tick = (1.0 - smoothstep(px * 0.8, px * 1.8, abs(ty) * gSize.y / 5.0)) * step(lx1, p.x) * step(p.x, lx1 + 0.008);
    col = mix(col, uPal[1], tick * step(gMin.y - px, p.y) * step(p.y, gMax.y + px));
  }

  vec2 lp = (p - gMin) / gSize;
  if (lp.x >= 0.0 && lp.x <= 1.0 && lp.y >= 0.0 && lp.y <= 1.0) {
    // Panels; some show the field shifted, like misaligned tiles.
    float nx = max(p_grid, 1.0);
    vec2 n = vec2(nx, max(1.0, floor(nx * gSize.y / gSize.x + 0.5)));
    vec2 cellSz = gSize / n;
    vec2 pid = floor(lp * n);
    float ph = hash21(pid + uSeed * 31.0);
    vec2 off = vec2(0.0);
    float shifted = step(ph, p_shift * 0.999);
    off = shifted * (hash22(pid * 1.7 + uSeed * 11.0) - 0.5) * cellSz * 0.6;
    vec2 q = p + off;

    vec3 fv = field(q);
    float heat = 1.0 - exp(-1.8 * fv.x);
    col = heatRamp(heat);

    // Contour isolines of the heat, kept about two pixels thick using the field gradient.
    if (p_contours > 0.5) {
      float c = heat * p_contours;
      vec2 gh = 1.8 * exp(-1.8 * fv.x) * fv.yz * p_contours;
      float dist = abs(fract(c + 0.5) - 0.5) / max(length(gh), 1e-3);
      float line = 1.0 - smoothstep(px * 0.8, px * 2.0, dist);
      col = mix(col, col * 0.5, line * 0.55);
    }

    // Faint data specks scattered in clusters.
    vec2 sg = floor(q / 0.006);
    float speck = step(0.9, hash21(sg + uSeed * 7.0)) * step(0.45, snoise(q * 9.0 + uSeed * 20.0));
    vec2 sf = abs(fract(q / 0.006) - 0.5) * 0.006;
    speck *= 1.0 - smoothstep(px * 0.8, px * 1.6, max(sf.x, sf.y));
    col = mix(col, lineCol, speck * 0.7);

    // Panel grid, with a finer sub-grid (shifted with the content) in some panels.
    vec2 fl = fract(lp * n);
    vec2 db = min(fl, 1.0 - fl) * cellSz;
    float gw = px * (1.0 + shifted);
    float gline = 1.0 - smoothstep(gw * 0.7, gw * 1.8, min(db.x, db.y));
    float sub = 0.0;
    if (hash21(pid + 3.3 + uSeed) > 0.4) {
      vec2 sf2 = fract((q - gMin) / cellSz * 3.0);
      vec2 sd = min(sf2, 1.0 - sf2) * cellSz / 3.0;
      sub = 1.0 - smoothstep(px * 0.5, px * 1.4, min(sd.x, sd.y));
    }
    col = mix(col, lineCol, max(gline * 0.85, sub * 0.3));

    // Crosshairs at the hotspot peaks (moved along with their panel's content).
    if (p_markers > 0.5) {
      float ch = 0.0;
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        if (fi >= p_hotspots) break;
        vec3 s = spot(fi);
        vec2 d = abs(p - (s.xy - off));
        float arm = 0.012;
        float cr = max(step(d.x, px * 1.1) * step(d.y, arm), step(d.y, px * 1.1) * step(d.x, arm));
        ch = max(ch, cr * step(px * 3.5, max(d.x, d.y)) * step(0.5, s.z));
      }
      // The cursor gets a ring sight while it is warming the map.
      vec2 dm = p - gMouse;
      float rr = 0.03 + 0.015 * gHold;
      float sight = (1.0 - smoothstep(px * 0.8, px * 2.0, abs(length(dm) - rr))) * uInside;
      col = mix(col, lineCol, max(ch * 0.9, sight * 0.8));
    }
  }

  // Thin ink outline around the map when framed.
  if (legend > 0.5) {
    vec2 dOut = max(gMin - p, p - gMax);
    float od = max(dOut.x, dOut.y);
    col = mix(col, uPal[1], (1.0 - smoothstep(px * 0.8, px * 1.8, abs(od))));
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default {
  id: 'heatpulse',
  name: 'Heat Pulse',
  engine: 'three',
  hint: 'Hover to warm the map, hold for more heat, click to drop a flare',
  params,
  controls: {
    essentials: ['hotspots', 'spread', 'ramp', 'shift'],
    groups: { Map: ['contours', 'grid', 'markers', 'frame'], Motion: ['speed', 'heat'] },
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
        pulse.z *= Math.exp(-d * 0.9);
        hold.x += ((p.down && p.inside ? 1 : 0) - hold.x) * (1 - Math.exp(-d * 3));
        fs.frame(time);
      },
    };
  },
  code: (values, colors, seed) => shaderSketch({ id: 'heatpulse', name: 'Heat Pulse', params, values, colors, seed, fragment }),
};
