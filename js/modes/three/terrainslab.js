// Terrain Slab: a block of mountains cut out like a museum diorama (ref 15). The heightfield
// lives on the CPU (ridged multifractal + a river valley) so it can be sculpted and morphed;
// the walls show strata bands, a river sits inside, and the slab floats over a soft shadow.
// Hover erodes the ground under the cursor (it slowly heals), tap re-seeds with a morph.
import { createThreeStage, paletteUniform, pointerNDC, THREE } from '../../shared/threeStage.js';
import { NOISE, PALETTE_GLSL } from '../../shaders/noise.glsl.js';

const RES = 160;       // heightfield vertices per side
const BASE_Y = 0.03;   // lowest ground level above the cut

const params = {
  height:   { value: 0.75, min: 0.2, max: 1.8, step: 0.01, label: 'Mountain height' },
  rough:    { value: 0.5, min: 0.3, max: 0.8, step: 0.01, label: 'Roughness' },
  scale:    { value: 1.15, min: 0.7, max: 3.5, step: 0.01, label: 'Feature scale', unit: '×' },
  water:    { value: 0.32, min: 0, max: 1, step: 0.01, label: 'Water level' },
  bands:    { value: 9, min: 2, max: 28, step: 1, label: 'Band count' },
  thick:    { value: 0.55, min: 0.12, max: 1.2, step: 0.01, label: 'Slab thickness' },
  contours: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'Contour amount' },
  spin:     { value: 0.5, min: 0, max: 3, step: 0.01, label: 'Speed' },
  erode:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Erosion strength' },
};

// Shared bits: accent picker, strata coordinate and hash.
const COMMON = /* glsl */ `
${PALETTE_GLSL}
uniform float uThick, uTop, uBands, uPhase;
vec3 accent(float i) {
  i = mod(floor(i + 0.5), 4.0);
  return i < 0.5 ? uPal[2] : i < 1.5 ? uPal[3] : i < 2.5 ? uPal[5] : uPal[4];
}
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float strata(float y) { return (y + uThick) / (uThick + uTop) * uBands; }
`;

const terrainVertex = /* glsl */ `
attribute float aH;  // normalised height 0..1 (for colouring)
varying vec3 vW, vN;
varying float vH;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normal; vH = aH;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const terrainFragment = /* glsl */ `
uniform vec3 uLight;
uniform float uWaterY, uContours, uTime, uDpr;
varying vec3 vW, vN;
varying float vH;
${COMMON}
${NOISE}
void main() {
  vec3 n = normalize(vN);
  float slope = 1.0 - n.y;
  vec3 meadow = uPal[5], rock = uPal[2], high = uPal[3];
  vec3 col = mix(meadow, rock, smoothstep(0.16, 0.42, slope + snoise(vW.xz * 9.0) * 0.06));
  col = mix(col, mix(high, vec3(1.0), 0.25), smoothstep(0.6, 0.95, vH) * (1.0 - smoothstep(0.35, 0.7, slope)) * 0.8);
  // Damp sand along the shore.
  col = mix(col, mix(meadow, uPal[0], 0.45), (1.0 - smoothstep(0.0, 0.04, vW.y - uWaterY)) * 0.8);
  // Speckled scrub like the engraved texture of the ref.
  float sp = step(0.86, h21(floor(vW.xz * 160.0))) * (1.0 - smoothstep(0.2, 0.5, slope));
  col = mix(col, mix(col, uPal[4], 0.55), sp * 0.6);

  float diff = max(dot(n, uLight), 0.0);
  // Slow cloud shadows drifting over the land.
  float cloud = smoothstep(0.15, 0.55, snoise(vec3(vW.xz * 0.9 + uTime * 0.04, uTime * 0.02)));
  diff *= 1.0 - cloud * 0.35;
  col *= 0.45 + 0.7 * diff;
  // Hatching in the shadows.
  float hatch = step(0.55, fract((gl_FragCoord.x - gl_FragCoord.y) / (4.0 * uDpr)));
  col = mix(col, col * 0.72, hatch * (1.0 - smoothstep(0.1, 0.6, diff)) * 0.6);

  // Contour lines that line up with the strata on the walls.
  float b = strata(vW.y);
  float fw = fwidth(b) + 1e-4;
  float line = 1.0 - smoothstep(0.0, fw * 1.3, min(fract(b), 1.0 - fract(b)));
  col = mix(col, uPal[1], line * uContours * 0.45);
  gl_FragColor = vec4(col, 1.0);
}
`;

const wallVertex = /* glsl */ `
attribute float aTop, aTerr, aEdge;
varying vec3 vW, vN;
varying float vTerr, vEdge;
${COMMON}
void main() {
  vec3 p = position;
  p.y = mix(-uThick, p.y, aTop);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz; vN = normal; vTerr = aTerr; vEdge = aEdge;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const wallFragment = /* glsl */ `
uniform vec3 uLight;
uniform float uWaterY, uTime;
varying vec3 vW, vN;
varying float vTerr, vEdge;
${COMMON}
void main() {
  vec3 n = normalize(vN);
  vec3 col;
  if (vW.y > vTerr + 0.003) {
    // Water seen through the glass side: deeper is darker.
    float depth = clamp((uWaterY - vW.y) / max(uWaterY - vTerr, 0.01), 0.0, 1.0);
    col = mix(mix(uPal[4], vec3(1.0), 0.35), uPal[4] * 0.6, depth);
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.008, uWaterY - vW.y)) * 0.6);
  } else {
    // Folded strata: mostly level bands, gently bent along the wall and toward the surface.
    float b = strata(vW.y) + 0.28 * sin(vEdge * 4.0 + uPhase) + 0.12 * sin(vEdge * 11.0 - uPhase * 1.7)
            + 0.18 * strata(vTerr) / uBands * 3.0;
    float idx = floor(b);
    col = accent(idx + floor(h21(vec2(idx, 3.0)) * 2.0));
    col = mix(col, col * 0.78, step(0.5, h21(vec2(idx, 9.0))) * 0.6);
    float fw = fwidth(b) + 1e-4;
    float line = 1.0 - smoothstep(0.0, fw * 1.2, min(fract(b), 1.0 - fract(b)));
    col = mix(col, uPal[1], line * 0.35);
    // Fine sediment lines and grain.
    col *= 0.93 + 0.07 * h21(vec2(floor(vW.y * 400.0), floor(vEdge * 6.0)));
    // Topsoil lip.
    col = mix(col, uPal[5] * 0.85, 1.0 - smoothstep(0.0, 0.025, vTerr - vW.y));
    // Darker toward the base of the cut.
    col *= mix(0.72, 1.0, smoothstep(-uThick, 0.2, vW.y));
  }
  float diff = max(dot(n, uLight), 0.0);
  col *= 0.62 + 0.45 * diff;
  gl_FragColor = vec4(col, 1.0);
}
`;

const waterVertex = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const waterFragment = /* glsl */ `
uniform vec3 uPal[6];
uniform float uTime;
varying vec3 vW;
${NOISE}
void main() {
  vec2 p = vW.xz;
  float n = snoise(vec3(p * 3.0, uTime * 0.25));
  float streak = smoothstep(0.7, 0.95, sin((p.x + p.y * 0.4) * 26.0 + n * 3.0 + uTime * 1.2) * 0.5 + 0.5);
  vec3 col = mix(uPal[4], mix(uPal[4], vec3(1.0), 0.45), 0.35 + 0.3 * n);
  col = mix(col, vec3(1.0), streak * 0.25);
  gl_FragColor = vec4(col, 0.82);
}
`;

const groundVertex = waterVertex;
const groundFragment = /* glsl */ `
uniform vec3 uPal[6];
uniform vec2 uShadowOff;
uniform float uShadowSoft;
varying vec3 vW;
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  vec2 p = vW.xz;
  vec3 bg = uPal[0];
  vec3 col = mix(bg, uPal[1], 0.06);
  // Floor panels.
  vec2 g = abs(fract(p / 0.9) - 0.5);
  float fw = fwidth(p.x / 0.9) + 1e-4;
  float line = 1.0 - smoothstep(0.0, fw * 1.2, 0.5 - max(g.x, g.y));
  col = mix(col, uPal[1], line * 0.08);
  // Soft cast shadow of the slab.
  float sd = sdBox(p - uShadowOff, vec2(1.02));
  float sh = 1.0 - smoothstep(-0.1, uShadowSoft, sd);
  col = mix(col, mix(col * 0.55, uPal[1], 0.15), sh * 0.8);
  // Contact shadow right under the plinth.
  col = mix(col, col * 0.7, (1.0 - smoothstep(0.0, 0.12, sdBox(p, vec2(1.08)))) * 0.6);
  col = mix(col, bg, smoothstep(3.0, 8.0, length(p)));
  gl_FragColor = vec4(col, 1.0);
}
`;

const plinthFragment = /* glsl */ `
uniform vec3 uPal[6];
uniform vec3 uLight;
varying vec3 vW;
void main() {
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 col = mix(uPal[1], uPal[4], 0.3);
  col = mix(col, uPal[0], 0.15);
  col *= 0.6 + 0.5 * max(dot(n, uLight), 0.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// Seeded 2D gradient noise for the CPU heightfield.
function makeNoise(rand) {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = rand() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y, xi = X & 255, yi = Y & 255;
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
    const n00 = gx[aa] * xf + gy[aa] * yf, n10 = gx[ba] * (xf - 1) + gy[ba] * yf;
    const n01 = gx[ab] * xf + gy[ab] * (yf - 1), n11 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1);
    const x1 = n00 + u * (n10 - n00), x2 = n01 + u * (n11 - n01);
    return (x1 + v * (x2 - x1)) * 1.45;
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export default {
  id: 'terrainslab',
  name: 'Terrain Slab',
  engine: 'three',
  hint: 'Drag to orbit, hover to erode, tap to grow new mountains',
  params,
  controls: {
    essentials: ['height', 'rough', 'water', 'bands'],
    form: ['scale', 'thick', 'contours'],
    motion: ['spin'],
    interaction: ['erode'],
  },
  presets: {
    'Alpine': { height: 1.6, rough: 0.7, water: 0.1, contours: 0.2 },
    'Archipelago': { height: 0.6, water: 0.7, scale: 2.2 },
    'Layer cake': { bands: 22, thick: 1.1, contours: 0.8, rough: 0.35 },
  },
  interactions: { hover: 'erodes a dip with a raised rim under the cursor', click: 'grows a new range of mountains' },
  create(ctx) {
    const P = ctx.params;
    const stage = createThreeStage(ctx, { orbit: true, fov: 30, cameraZ: 9 });
    const cam = stage.camera;
    const controls = stage.controls;
    controls.minDistance = 3;
    controls.maxDistance = 16;
    controls.maxPolarAngle = 1.38;
    controls.target.set(0, 0.05, 0);
    const rand = ctx.rand;
    const noise = makeNoise(rand);

    // ---- Heightfield ----
    const NV = RES * RES;
    const from = new Float32Array(NV), to = new Float32Array(NV), base = new Float32Array(NV);
    const off = new Float32Array(NV), hgt = new Float32Array(NV);
    const coord = (i) => -1 + (2 * i) / (RES - 1);
    let seed = null;
    const newSeed = () => ({
      ox: rand.range(-100, 100), oz: rand.range(-100, 100),
      ph: rand.range(0, 6.28), ph2: rand.range(0, 6.28), river: rand.range(-0.35, 0.35),
      mx: rand.range(-0.6, 0.6), mz: rand.range(-0.6, 0.6),
    });
    function generate(out) {
      const s = seed, sc = P.scale, rough = P.rough;
      let lo = Infinity, hi = -Infinity;
      for (let j = 0; j < RES; j++) {
        const z = coord(j);
        const rx = 0.42 * Math.sin(z * 2.1 + s.ph) + 0.14 * Math.sin(z * 5.3 + s.ph2) + s.river;
        for (let i = 0; i < RES; i++) {
          const x = coord(i);
          let px = x * sc + s.ox, pz = z * sc + s.oz;
          px += noise(px * 0.5 + 31, pz * 0.5 - 7) * 0.4;
          pz += noise(px * 0.5 - 13, pz * 0.5 + 23) * 0.4;
          let sum = 0, amp = 0.5, freq = 1, weight = 1, norm = 0;
          for (let o = 0; o < 6; o++) {
            let n = 1 - Math.abs(noise(px * freq, pz * freq));
            n *= n * weight;
            weight = Math.min(1, n * 2.2);
            sum += n * amp; norm += amp;
            amp *= rough; freq *= 2.03;
          }
          let h = sum / norm;
          const valley = smooth(0.04, 0.55, Math.abs(x - rx));
          h *= 0.1 + 0.9 * valley;
          h *= 0.5 + 0.8 * Math.exp(-((x - s.mx) ** 2 + (z - s.mz) ** 2) / 0.7);
          out[j * RES + i] = h;
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
      const r = hi - lo || 1;
      for (let k = 0; k < NV; k++) out[k] = (out[k] - lo) / r;
    }
    seed = newSeed();
    generate(to);
    base.set(to); from.set(to);
    let morphT = 1, morphDur = 1;
    const startMorph = (dur, reseed) => {
      from.set(base);
      if (reseed) seed = newSeed();
      generate(to);
      morphT = 0; morphDur = dur;
    };

    // ---- Top surface ----
    const topGeo = new THREE.BufferGeometry();
    const tPos = new Float32Array(NV * 3), tNor = new Float32Array(NV * 3), tH = new Float32Array(NV);
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const k = j * RES + i;
      tPos[k * 3] = coord(i); tPos[k * 3 + 2] = coord(j);
    }
    const idx = [];
    for (let j = 0; j < RES - 1; j++) for (let i = 0; i < RES - 1; i++) {
      const a = j * RES + i, b = a + 1, c = a + RES, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    topGeo.setIndex(idx);
    topGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    topGeo.setAttribute('normal', new THREE.BufferAttribute(tNor, 3));
    topGeo.setAttribute('aH', new THREE.BufferAttribute(tH, 1));

    // ---- Walls: 4 strips, a top and a bottom vertex per edge sample ----
    const sides = [
      { k: (t) => t, nrm: [0, 0, -1] },                         // z = -1
      { k: (t) => (RES - 1) * RES + t, nrm: [0, 0, 1] },        // z = +1
      { k: (t) => t * RES, nrm: [-1, 0, 0] },                   // x = -1
      { k: (t) => t * RES + RES - 1, nrm: [1, 0, 0] },          // x = +1
    ];
    const WV = sides.length * RES * 2;
    const wPos = new Float32Array(WV * 3), wNor = new Float32Array(WV * 3);
    const wTop = new Float32Array(WV), wTerr = new Float32Array(WV), wEdge = new Float32Array(WV);
    const wIdx = [];
    sides.forEach((s, si) => {
      for (let t = 0; t < RES; t++) {
        const k = s.k(t);
        for (let b = 0; b < 2; b++) {
          const v = (si * RES + t) * 2 + b;
          wPos[v * 3] = tPos[k * 3]; wPos[v * 3 + 2] = tPos[k * 3 + 2];
          wNor.set(s.nrm, v * 3);
          wTop[v] = b === 0 ? 1 : 0;
          wEdge[v] = coord(t) + si * 3.7;
        }
        if (t < RES - 1) {
          const a = (si * RES + t) * 2;
          wIdx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
      }
    });
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setIndex(wIdx);
    wallGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
    wallGeo.setAttribute('normal', new THREE.BufferAttribute(wNor, 3));
    wallGeo.setAttribute('aTop', new THREE.BufferAttribute(wTop, 1));
    wallGeo.setAttribute('aTerr', new THREE.BufferAttribute(wTerr, 1));
    wallGeo.setAttribute('aEdge', new THREE.BufferAttribute(wEdge, 1));

    // ---- Materials ----
    const pal = { value: paletteUniform(ctx.state.colors) };
    const shared = {
      uPal: pal, uThick: { value: 0.5 }, uTop: { value: 1 }, uBands: { value: 9 }, uPhase: { value: rand() * 6.28 },
      uLight: { value: new THREE.Vector3(-0.5, 0.8, 0.45).normalize() },
      uWaterY: { value: 0.2 }, uTime: { value: 0 },
    };
    const topMat = new THREE.ShaderMaterial({
      vertexShader: terrainVertex, fragmentShader: terrainFragment, side: THREE.DoubleSide,
      uniforms: { ...shared, uContours: { value: 0.35 }, uDpr: { value: 1 } },
    });
    const wallMat = new THREE.ShaderMaterial({
      vertexShader: wallVertex, fragmentShader: wallFragment, side: THREE.DoubleSide, uniforms: shared,
    });
    const waterMat = new THREE.ShaderMaterial({
      vertexShader: waterVertex, fragmentShader: waterFragment, transparent: true, depthWrite: false,
      uniforms: { uPal: pal, uTime: shared.uTime },
    });
    const groundMat = new THREE.ShaderMaterial({
      vertexShader: groundVertex, fragmentShader: groundFragment,
      uniforms: { uPal: pal, uShadowOff: { value: new THREE.Vector2() }, uShadowSoft: { value: 0.5 } },
    });
    const plinthMat = new THREE.ShaderMaterial({
      vertexShader: waterVertex, fragmentShader: plinthFragment, uniforms: { uPal: pal, uLight: shared.uLight },
    });

    const top = new THREE.Mesh(topGeo, topMat);
    const walls = new THREE.Mesh(wallGeo, wallMat);
    const waterGeo = new THREE.PlaneGeometry(2, 2);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.renderOrder = 2;
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.14, 2.14), plinthMat);
    [top, walls, water, ground, plinth].forEach((m) => { m.frustumCulled = false; stage.scene.add(m); });

    // ---- Rebuild the meshes from base + erosion ----
    function updateMesh() {
      const mH = P.height;
      for (let k = 0; k < NV; k++) {
        const y = BASE_Y + base[k] * mH + off[k];
        hgt[k] = Math.max(0.005, y);
        tPos[k * 3 + 1] = hgt[k];
        tH[k] = (hgt[k] - BASE_Y) / mH;
      }
      const inv = (RES - 1) / 4; // 1 / (2 * cell)
      for (let j = 0; j < RES; j++) {
        for (let i = 0; i < RES; i++) {
          const k = j * RES + i;
          const hl = hgt[j * RES + Math.max(0, i - 1)], hr = hgt[j * RES + Math.min(RES - 1, i + 1)];
          const hd = hgt[Math.max(0, j - 1) * RES + i], hu = hgt[Math.min(RES - 1, j + 1) * RES + i];
          const nx = (hl - hr) * inv, nz = (hd - hu) * inv;
          const l = Math.hypot(nx, 1, nz);
          tNor[k * 3] = nx / l; tNor[k * 3 + 1] = 1 / l; tNor[k * 3 + 2] = nz / l;
        }
      }
      const wy = waterY();
      sides.forEach((s, si) => {
        for (let t = 0; t < RES; t++) {
          const h = hgt[s.k(t)];
          for (let b = 0; b < 2; b++) {
            const v = (si * RES + t) * 2 + b;
            wPos[v * 3 + 1] = Math.max(h, wy);
            wTerr[v] = h;
          }
        }
      });
      topGeo.attributes.position.needsUpdate = true;
      topGeo.attributes.normal.needsUpdate = true;
      topGeo.attributes.aH.needsUpdate = true;
      wallGeo.attributes.position.needsUpdate = true;
      wallGeo.attributes.aTerr.needsUpdate = true;
    }
    const waterY = () => BASE_Y + 0.005 + P.water * P.height * 0.5;

    // Bilinear height lookup for picking.
    const heightAt = (x, z) => {
      const fx = ((x + 1) / 2) * (RES - 1), fz = ((z + 1) / 2) * (RES - 1);
      const i = Math.min(RES - 2, Math.max(0, Math.floor(fx))), j = Math.min(RES - 2, Math.max(0, Math.floor(fz)));
      const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
      const k = j * RES + i;
      const a = hgt[k], b = hgt[k + 1], c = hgt[k + RES], d = hgt[k + RES + 1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const ray = new THREE.Raycaster();
    const pick = () => {
      ray.setFromCamera(pointerNDC(ctx), cam);
      const o = ray.ray.origin, d = ray.ray.direction;
      let prev = 0;
      for (let t = 0; t < 30; t += 0.02) {
        const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
        if (Math.abs(x) <= 1 && Math.abs(z) <= 1 && y <= heightAt(x, z)) {
          let a = prev, b = t; // refine
          for (let r = 0; r < 6; r++) {
            const m = (a + b) / 2;
            const mx = o.x + d.x * m, mz = o.z + d.z * m;
            if (o.y + d.y * m <= heightAt(mx, mz)) b = m; else a = m;
          }
          return { x: o.x + d.x * b, z: o.z + d.z * b };
        }
        prev = t;
      }
      return null;
    };

    let dirty = true, offActive = false, lastH = -1, lastW = -1;
    let press = null;

    function fitCamera() {
      const { w, h } = stage.size;
      const aspect = w / h;
      const t = Math.tan((cam.fov * Math.PI) / 360) * 2;
      const D = Math.max(3.2 / t, 3.0 / (t * aspect));
      const dir = cam.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-6 || !fitCamera.done) dir.set(1, 0.85, 1.25);
      fitCamera.done = true;
      cam.position.copy(controls.target).add(dir.normalize().multiplyScalar(D));
    }

    return {
      resize(w, h, dpr) {
        stage.resize(w, h, dpr);
        topMat.uniforms.uDpr.value = dpr;
        fitCamera();
      },
      frame(time, dt) {
        pal.value = paletteUniform(ctx.state.colors);
        shared.uTime.value = time;
        shared.uThick.value = P.thick;
        shared.uTop.value = BASE_Y + P.height;
        shared.uBands.value = P.bands;
        topMat.uniforms.uContours.value = P.contours;
        controls.autoRotate = P.spin > 0;
        controls.autoRotateSpeed = P.spin;

        // Morph toward the target heightfield.
        if (morphT < 1) {
          morphT = Math.min(1, morphT + dt / morphDur);
          const e = morphT * morphT * (3 - 2 * morphT);
          for (let k = 0; k < NV; k++) base[k] = from[k] + (to[k] - from[k]) * e;
          dirty = true;
        }
        if (P.height !== lastH || P.water !== lastW) { lastH = P.height; lastW = P.water; dirty = true; }

        // Hover erosion: carve a dip under the cursor and pile a little rim around it.
        const pow = ctx.state.motion.mouse;
        const pt = ctx.pointer;
        if (pt.justPressed) press = { x: pt.x, y: pt.y, t: time };
        if (pt.justReleased && press) {
          if (time - press.t < 0.35 && Math.hypot(pt.x - press.x, pt.y - press.y) < 0.012) startMorph(1.6, true);
          press = null;
        }
        if (pt.inside && pow > 0 && P.erode > 0 && !pt.down) {
          const hit = pick();
          if (hit) {
            const rate = dt * 0.32 * P.height * P.erode * Math.min(pow, 2) * (0.35 + Math.min(1, Math.hypot(pt.vx, pt.vy) * 60));
            const R = 0.16, R2 = 0.3;
            const i0 = Math.max(0, Math.floor(((hit.x - R2 + 1) / 2) * (RES - 1)));
            const i1 = Math.min(RES - 1, Math.ceil(((hit.x + R2 + 1) / 2) * (RES - 1)));
            const j0 = Math.max(0, Math.floor(((hit.z - R2 + 1) / 2) * (RES - 1)));
            const j1 = Math.min(RES - 1, Math.ceil(((hit.z + R2 + 1) / 2) * (RES - 1)));
            const lo = -0.6 * P.height, hi = 0.25 * P.height;
            for (let j = j0; j <= j1; j++) {
              for (let i = i0; i <= i1; i++) {
                const d = Math.hypot(coord(i) - hit.x, coord(j) - hit.z);
                if (d > R2) continue;
                const k = j * RES + i;
                const dig = Math.exp(-(d * d) / (R * R * 0.5));
                const rim = Math.exp(-((d - R * 1.25) ** 2) / 0.003) * 0.45;
                off[k] = Math.min(hi, Math.max(lo, off[k] + rate * (rim - dig * base[k] * 1.4)));
              }
            }
            offActive = true;
          }
        }
        // Erosion heals slowly.
        if (offActive) {
          const decay = Math.exp(-dt * 0.3);
          let m = 0;
          for (let k = 0; k < NV; k++) { off[k] *= decay; const a = Math.abs(off[k]); if (a > m) m = a; }
          if (m < 1e-4) { off.fill(0); offActive = false; }
          dirty = true;
        }
        if (dirty) { updateMesh(); dirty = false; }

        // Water, plinth, ground and shadow follow the slab settings.
        const wy = waterY();
        water.position.y = wy;
        water.visible = P.water > 0.001;
        shared.uWaterY.value = wy;
        plinth.position.y = -P.thick - 0.07;
        ground.position.y = -P.thick - 0.14;
        const L = shared.uLight.value;
        const lift = P.thick + 0.14 + P.height * 0.35;
        groundMat.uniforms.uShadowOff.value.set((-L.x / L.y) * lift * 0.8, (-L.z / L.y) * lift * 0.8);
        groundMat.uniforms.uShadowSoft.value = 0.25 + lift * 0.35;
        stage.render(time);
      },
      onParam(key) {
        if (key === 'rough' || key === 'scale') startMorph(0.35, false);
      },
      dispose: stage.dispose,
    };
  },
};
