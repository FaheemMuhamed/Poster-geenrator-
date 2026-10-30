// Topiary: a stippled garden of rounded hills, round bushes and tall clipped trees under a
// moon (ref 26). Every surface is shaded with a screen-space stipple: dot coverage follows
// the light. Hover makes the bushes and trees bounce like jelly; click plants a new bush.
import { createThreeStage, paletteUniform, pointerNDC, THREE } from '../../shared/threeStage.js';
import { NOISE, PALETTE_GLSL } from '../../shaders/noise.glsl.js';

const HILLS = 30;   // rounded hills (shared by CPU and GPU so bushes sit on them)
const PEAKS = 4;    // background mountains (GPU only)
const SPAWN = 36;   // instances reserved for clicked-in bushes

const params = {
  dot:    { value: 4, min: 1.5, max: 8, step: 0.1, label: 'Dot size' },
  hills:  { value: 1, min: 0.2, max: 2, step: 0.01, label: 'Hill height' },
  bushes: { value: 80, min: 0, max: 200, step: 1, label: 'Bush count', rebuild: true },
  trees:  { value: 9, min: 0, max: 40, step: 1, label: 'Tree count', rebuild: true },
  light:  { value: -35, min: -90, max: 90, step: 1, label: 'Light angle' },
  drift:  { value: 0.5, min: 0, max: 2, step: 0.01, label: 'Drift speed' },
  bounce: { value: 1, min: 0, max: 3, step: 0.01, label: 'Bounce' },
  moon:   { value: true, label: 'Moon' },
};

// Ground height: the highest of many rounded domes, plus a slow swell. Mirrored in JS below.
const GROUND = /* glsl */ `
uniform vec4 uHills[${HILLS}];
uniform float uHillH;
float hillsHI(vec2 p, out float id) {
  float h = 0.0;
  id = -1.0;
  for (int i = 0; i < ${HILLS}; i++) {
    vec4 c = uHills[i];
    vec2 d = p - c.xy;
    float t = dot(d, d) / (c.z * c.z);
    float hh = t < 1.0 ? c.w * (1.0 - t) : 0.0;
    if (hh > h) { h = hh; id = float(i); }
  }
  h += 0.3 * sin(p.x * 0.31 + 1.3) * sin(p.y * 0.27 + 0.7);
  return h * uHillH;
}
float hillsH(vec2 p) { float id; return hillsHI(p, id); }
`;

// Stipple: two jittered dot grids in screen space whose dots grow with the tone.
const STIPPLE = /* glsl */ `
uniform float uDot, uDpr;
float sh21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 sh22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float stipple(vec2 frag, float tone) {
  tone = clamp(tone, 0.0, 1.0);
  float s = uDot * uDpr;
  float m = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 off = vec2(float(k) * 0.5, float(k) * 0.37);
    vec2 p = frag / s + off;
    vec2 c = floor(p);
    vec2 f = fract(p) - 0.5;
    vec2 j = (sh22(c + off * 17.0) - 0.5) * 0.5;
    float keep = step(sh21(c * 1.3 + off * 9.0), tone * 2.2 + 0.05); // sparse in the shadows
    float r = sqrt(tone) * 0.5 * (0.75 + 0.5 * sh21(c + off * 3.0));
    float aa = 1.0 / s;
    m = max(m, keep * (1.0 - smoothstep(r - aa, r + aa, length(f - j))));
  }
  return m;
}
vec3 stippleColour(vec3 base, float tone, vec2 frag) {
  vec3 dark = base * 0.3;
  vec3 light = mix(base, vec3(1.0), 0.3);
  return mix(dark, light, stipple(frag, tone));
}
`;

const groundVertex = /* glsl */ `
uniform vec4 uPeaks[${PEAKS}];
varying vec3 vW, vN;
varying float vMount, vTint;
${GROUND}
${NOISE}
float peaksH(vec2 p, out float m) {
  float h = 0.0; m = 0.0;
  for (int i = 0; i < ${PEAKS}; i++) {
    vec4 c = uPeaks[i];
    float r = length((p - c.xy) * vec2(1.0, 1.4)) / c.z;
    float f = max(1.0 - r, 0.0);
    float pk = c.w * pow(f, 1.5);
    h = max(h, pk);
    m = max(m, f);
  }
  // ridges on the mountain flanks
  float rid = 1.0 - abs(snoise(p * 0.35));
  h += rid * rid * 1.4 * m;
  return h * (0.6 + 0.4 * uHillH);
}
float fullH(vec2 p) { float m; return hillsH(p) + peaksH(p, m); }
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  float m;
  float id;
  float h = hillsHI(p.xz, id) + peaksH(p.xz, m);
  vTint = id < 0.0 ? 0.0 : fract(sin(id * 12.9898) * 43758.5453);
  float e = 0.12;
  float hx = fullH(p.xz + vec2(e, 0.0)), hz = fullH(p.xz + vec2(0.0, e));
  vN = normalize(vec3(h - hx, e, h - hz));
  p.y = h;
  vW = p; vMount = m;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const groundFragment = /* glsl */ `
uniform vec3 uLight;
uniform float uFogNear, uFogFar, uTime;
varying vec3 vW, vN;
varying float vMount, vTint;
${PALETTE_GLSL}
${STIPPLE}
${NOISE}
void main() {
  vec3 n = normalize(vN);
  float diff = max(dot(n, uLight), 0.0);
  float tone = 0.06 + 0.9 * diff;
  tone += snoise(vW.xz * 2.5) * 0.08 + snoise(vW.xz * 9.0) * 0.05;
  // A winding pale path through the meadow.
  float px = 1.1 * sin(vW.z * 0.33 + 0.6) + 0.4;
  float path = (1.0 - smoothstep(0.22, 0.42, abs(vW.x - px))) * smoothstep(-7.0, -3.0, vW.z);
  path *= 1.0 - smoothstep(0.5, 1.6, vW.y);
  tone = mix(tone, tone * 0.6 + 0.45, path * 0.8);
  vec3 base = mix(uPal[2], mix(uPal[2], uPal[5], 0.5), vTint * 0.35);
  base = mix(base, mix(uPal[2], uPal[3], 0.5), smoothstep(0.1, 0.6, vMount));
  base = mix(base, mix(base, uPal[5], 0.35), path * 0.7);
  float dist = length(vW - cameraPosition);
  float fog = smoothstep(uFogNear, uFogFar, dist);
  tone = mix(tone, 0.55, fog * 0.5);
  vec3 col = stippleColour(base, tone, gl_FragCoord.xy);
  col = mix(col, uPal[0], fog * 0.7);
  gl_FragColor = vec4(col, 1.0);
}
`;

// Bushes and trees: one shader, uKind picks the placement rule.
const plantVertex = /* glsl */ `
attribute vec4 aBase;   // x, z, size, height factor
attribute vec4 aInfo;   // colour roll, seed, born time, unused
attribute vec4 aAnim;   // squash spring, wobble x, wobble z, unused
uniform float uTime, uKind;
varying vec3 vW, vN;
varying float vLocalY, vCol, vSeed;
${GROUND}
${NOISE}
void main() {
  float age = uTime - aInfo.z;
  float grow = age <= 0.0 ? 0.0 : 1.0 - exp(-5.0 * age) * cos(10.0 * age);
  float s = aAnim.x;
  vec3 nrm = normal;
  // Lumpy clipped foliage.
  float lump = snoise(nrm * 2.4 + aInfo.y * 10.0) * 0.08 + snoise(position * 5.0 + aInfo.y * 3.0) * 0.035;
  vec3 p = position + nrm * lump;
  vec3 scl = vec3(aBase.z * (1.0 - s * 0.4), aBase.z * aBase.w * (1.0 + s), aBase.z * (1.0 - s * 0.4)) * max(grow, 0.0);
  p *= scl;
  // Height fraction up the plant (0 at the base) drives the wobble lean and the breeze.
  float hy = uKind < 0.5 ? position.y * 0.5 + 0.5 : position.y;
  float breeze = sin(uTime * 1.3 + aInfo.y * 20.0) * 0.04 * uKind;
  p.xz += (aAnim.yz + vec2(breeze, 0.0)) * hy * hy * scl.y;
  float gy = hillsH(aBase.xy);
  float lift = uKind < 0.5 ? scl.y * 0.72 : -0.12 * aBase.z;
  vec3 w = vec3(aBase.x, gy + lift, aBase.y) + p;
  vW = w;
  vN = normalize(nrm / max(scl, vec3(1e-3)));
  vLocalY = hy;
  vCol = aInfo.x;
  vSeed = aInfo.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;
const plantFragment = /* glsl */ `
uniform vec3 uLight;
uniform float uFogNear, uFogFar, uKind;
varying vec3 vW, vN;
varying float vLocalY, vCol, vSeed;
${PALETTE_GLSL}
${STIPPLE}
${NOISE}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float diff = max(dot(n, uLight), 0.0);
  float tone = 0.05 + 0.92 * diff;
  tone *= mix(0.45, 1.0, smoothstep(0.0, 0.45, vLocalY));                 // contact shade
  tone += 0.25 * pow(1.0 - max(dot(n, v), 0.0), 3.0) * (0.4 + diff);       // rim light
  tone += snoise(vW * 4.5 + vSeed * 7.0) * 0.12;                          // leafy texture
  vec3 base;
  if (uKind < 0.5) base = vCol < 0.7 ? uPal[4] : vCol < 0.9 ? uPal[3] : uPal[2];
  else base = vCol < 0.6 ? uPal[3] : uPal[4];
  base = mix(base, uPal[2], 0.12);
  float fog = smoothstep(uFogNear, uFogFar, length(vW - cameraPosition));
  tone = mix(tone, 0.55, fog * 0.5);
  vec3 col = stippleColour(base, tone, gl_FragCoord.xy);
  col = mix(col, uPal[0], fog * 0.7);
  gl_FragColor = vec4(col, 1.0);
}
`;

// Sky dome: the background colour with a stippled glow at the horizon and the moon.
const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const skyFragment = /* glsl */ `
uniform vec3 uMoonDir;
uniform float uMoon;
varying vec3 vDir;
${PALETTE_GLSL}
${STIPPLE}
void main() {
  vec3 d = normalize(vDir);
  float glow = 0.32 * (1.0 - smoothstep(-0.02, 0.2, d.y));
  float md = dot(d, uMoonDir);
  float halo = exp(-(1.0 - md) * 120.0) * 0.6 * uMoon;
  vec3 sky = uPal[0];
  vec3 dots = mix(uPal[0], uPal[5], 0.55);
  vec3 col = mix(sky, dots, stipple(gl_FragCoord.xy, glow + halo));
  float r = 0.065;
  float fw = fwidth(md) * 1.5 + 1e-5;
  float disc = smoothstep(cos(r) - fw, cos(r) + fw, md) * uMoon;
  vec3 moon = mix(uPal[5], vec3(1.0), 0.2);
  // A few craters dotted into the disc.
  moon = mix(moon * 0.8, moon, stipple(gl_FragCoord.xy, 0.75));
  col = mix(col, moon, disc);
  gl_FragColor = vec4(col, 1.0);
}
`;

export default {
  id: 'topiary',
  name: 'Topiary',
  engine: 'three',
  hint: 'Hover to make the bushes bounce, click to plant a new one',
  params,
  controls: {
    essentials: ['dot', 'hills', 'bushes', 'light'],
    groups: { Garden: ['trees', 'moon'], Motion: ['drift', 'bounce'] },
  },
  create(ctx) {
    const P = ctx.params;
    const stage = createThreeStage(ctx, { fov: 32, cameraZ: 13 });
    const cam = stage.camera;
    cam.far = 200; cam.updateProjectionMatrix();
    const rand = ctx.rand;

    // ---- Hills (shared CPU/GPU) ----
    const hills = [];
    // Big foreground domes framing the view, then smaller ones further back.
    const fg = [[-5.5, 7, 3.6, 1.5], [5, 6.5, 3.8, 1.6], [-0.5, 3.5, 2.6, 0.9], [-8, 1, 3.6, 1.4], [7.5, 0.5, 3.4, 1.3], [1.5, -3, 3.2, 1.1]];
    fg.forEach(([x, z, r, a]) => hills.push([x + rand.range(-1, 1), z + rand.range(-1, 1), r * rand.range(0.85, 1.15), a * rand.range(0.8, 1.2)]));
    while (hills.length < HILLS) {
      const z = rand.range(-20, 3);
      hills.push([rand.range(-14, 14), z, rand.range(1.6, 3.6) * (1 + Math.max(0, -z) * 0.04), rand.range(0.6, 1.5)]);
    }
    const hillsH = (x, z) => {
      let h = 0;
      for (const [hx, hz, r, a] of hills) {
        const t = ((x - hx) ** 2 + (z - hz) ** 2) / (r * r);
        if (t < 1) h = Math.max(h, a * (1 - t));
      }
      h += 0.3 * Math.sin(x * 0.31 + 1.3) * Math.sin(z * 0.27 + 0.7);
      return h * P.hills;
    };
    const peaks = Array.from({ length: PEAKS }, (_, i) =>
      new THREE.Vector4(-14 + i * 9 + rand.range(-2, 2), rand.range(-36, -29), rand.range(9, 13), rand.range(4, 7.5)));

    const pal = { value: paletteUniform(ctx.state.colors) };
    const shared = {
      uPal: pal, uTime: { value: 0 }, uHillH: { value: 1 },
      uHills: { value: hills.map((h) => new THREE.Vector4(...h)) },
      uLight: { value: new THREE.Vector3(0, 1, 0) },
      uDot: { value: 3 }, uDpr: { value: 1 }, uFogNear: { value: 18 }, uFogFar: { value: 62 },
    };

    // ---- Ground ----
    const groundGeo = new THREE.PlaneGeometry(70, 56, 240, 200);
    groundGeo.rotateX(-Math.PI / 2);
    groundGeo.translate(0, 0, -12);
    const ground = new THREE.Mesh(groundGeo, new THREE.ShaderMaterial({
      vertexShader: groundVertex, fragmentShader: groundFragment,
      uniforms: { ...shared, uPeaks: { value: peaks } },
    }));
    ground.frustumCulled = false;
    stage.scene.add(ground);

    // ---- Plants ----
    const plants = []; // CPU mirror for hover springs
    function makePlants(geoSrc, list, kind) {
      const n = list.length;
      const geo = new THREE.InstancedBufferGeometry().copy(geoSrc);
      geoSrc.dispose();
      geo.instanceCount = n;
      const aBase = new Float32Array(n * 4), aInfo = new Float32Array(n * 4), aAnim = new Float32Array(n * 4);
      list.forEach((p, i) => {
        aBase.set([p.x, p.z, p.size, p.hf], i * 4);
        aInfo.set([p.col, p.seed, p.born, 0], i * 4);
      });
      const attrs = {
        base: new THREE.InstancedBufferAttribute(aBase, 4),
        info: new THREE.InstancedBufferAttribute(aInfo, 4),
        anim: new THREE.InstancedBufferAttribute(aAnim, 4),
      };
      attrs.anim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aBase', attrs.base);
      geo.setAttribute('aInfo', attrs.info);
      geo.setAttribute('aAnim', attrs.anim);
      const mat = new THREE.ShaderMaterial({
        vertexShader: plantVertex, fragmentShader: plantFragment,
        uniforms: { ...shared, uKind: { value: kind } },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      stage.scene.add(mesh);
      list.forEach((p, i) => plants.push(Object.assign(p, { kind, i, attrs, s: 0, sv: 0, wx: 0, wz: 0, wvx: 0, wvz: 0 })));
      return attrs;
    }

    const bushList = [];
    let left = P.bushes;
    while (left > 0) {
      const z = rand.range(-14, 6.5), x = rand.range(-1, 1) * (6 + (8 - z) * 0.35);
      const size = rand.range(0.3, 0.75) * (1 + Math.max(0, -z) * 0.03);
      const k = Math.min(left, rand() < 0.4 ? rand.int(2, 3) : 1);
      for (let c = 0; c < k; c++) {
        const a = rand() * 6.28, d = c === 0 ? 0 : size * rand.range(0.7, 1.1);
        bushList.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, size: c === 0 ? size : size * rand.range(0.5, 0.75),
          hf: rand.range(0.75, 1), col: rand(), seed: rand(), born: rand.range(0, 1.4) });
      }
      left -= k;
    }
    const spawnStart = bushList.length;
    for (let i = 0; i < SPAWN; i++) bushList.push({ x: 0, z: 0, size: 0.6, hf: 0.9, col: rand(), seed: rand(), born: 1e6 });
    const bushAttrs = makePlants(new THREE.SphereGeometry(1, 32, 20), bushList, 0);

    const treeList = [];
    for (let i = 0; i < P.trees; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * rand.range(1.5, 10), z = rand.range(-11, 2);
      treeList.push({ x, z, size: rand.range(0.55, 0.9), hf: rand.range(3.6, 6.5), col: rand(), seed: rand(), born: rand.range(0.2, 1.6) });
    }
    const profile = [];
    for (let k = 0; k <= 28; k++) {
      const y = k / 28;
      profile.push(new THREE.Vector2(Math.max(0.001, Math.pow(Math.sin(Math.PI * Math.pow(y, 0.62)), 0.6)) * 0.5, y));
    }
    if (treeList.length) makePlants(new THREE.LatheGeometry(profile, 28), treeList, 1);

    // ---- Sky ----
    const skyGeo = new THREE.SphereGeometry(90, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false,
      uniforms: { uPal: pal, uDot: shared.uDot, uDpr: shared.uDpr, uMoonDir: { value: new THREE.Vector3(0, 0.3, -1) }, uMoon: { value: 1 } },
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    stage.scene.add(sky);

    // ---- Interaction ----
    const ray = new THREE.Raycaster();
    const tmp = new THREE.Vector3();
    let spawnIdx = 0, drift = rand() * 100, camX = 0;
    const pickGround = () => {
      ray.setFromCamera(pointerNDC(ctx), cam);
      const o = ray.ray.origin, d = ray.ray.direction;
      let prev = 0;
      for (let t = 0.5; t < 60; t += 0.08) {
        const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
        if (y <= hillsH(x, z)) {
          let a = prev, b = t;
          for (let r = 0; r < 6; r++) {
            const m = (a + b) / 2;
            if (o.y + d.y * m <= hillsH(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m;
          }
          return { x: o.x + d.x * b, z: o.z + d.z * b };
        }
        prev = t;
      }
      return null;
    };
    const plant = (x, z, size, born) => {
      const p = plants[spawnStart + spawnIdx];
      spawnIdx = (spawnIdx + 1) % SPAWN;
      const hf = rand.range(0.8, 1);
      Object.assign(p, { x, z, size, hf, born, s: 0, sv: 0, wx: 0, wz: 0, wvx: 0, wvz: 0 });
      bushAttrs.base.array.set([x, z, size, hf], p.i * 4);
      bushAttrs.info.array[p.i * 4 + 2] = born;
      bushAttrs.base.needsUpdate = true;
      bushAttrs.info.needsUpdate = true;
    };

    return {
      resize(w, h, dpr) {
        stage.resize(w, h, dpr);
        shared.uDpr.value = dpr;
      },
      frame(time, dt) {
        pal.value = paletteUniform(ctx.state.colors);
        shared.uTime.value = time;
        shared.uHillH.value = P.hills;
        shared.uDot.value = P.dot;
        const a = (P.light * Math.PI) / 180;
        shared.uLight.value.set(Math.sin(a), 0.55, 0.5 * Math.cos(a) + 0.1).normalize();
        skyMat.uniforms.uMoon.value = P.moon ? 1 : 0;

        // Gentle drifting camera, nudged by the cursor.
        drift += dt * P.drift;
        const pow = ctx.state.motion.mouse;
        const pt = ctx.pointer;
        camX += (((pt.inside ? pt.x : 0.5) - 0.5) * 1.2 * Math.min(pow, 1.5) - camX) * Math.min(1, dt * 2);
        const aspect = stage.size.w / stage.size.h;
        const back = aspect < 1 ? 1 / aspect : 1;
        const cx = Math.sin(drift * 0.25) * 1.6 + camX;
        cam.position.set(cx, 4.6 + Math.sin(drift * 0.18) * 0.25 + P.hills * 1.1, 10 + 4 * back - Math.sin(drift * 0.13) * 0.6);
        cam.lookAt(cx * 0.35, 0.4 + P.hills * 0.5, -5);
        cam.updateMatrixWorld();
        sky.position.copy(cam.position);
        // The moon sits in the upper part of the frame, on the side the light comes from.
        const tanV = Math.tan((cam.fov * Math.PI) / 360);
        const e = cam.matrixWorld.elements;
        const right = tmp.set(e[0], e[1], e[2]);
        const md = skyMat.uniforms.uMoonDir.value.set(-e[8], -e[9], -e[10]);
        md.addScaledVector(right, Math.sin(a) * 0.62 * tanV * aspect);
        md.addScaledVector(cam.up, 0.62 * tanV);
        md.normalize();

        // Click: plant a bush with two small companions; neighbours get a nudge.
        let bump = null;
        if (pt.justPressed && pow > 0) {
          const hit = pickGround();
          if (hit && hit.z > -14) {
            const sz = rand.range(0.55, 0.95);
            plant(hit.x, hit.z, sz, time);
            for (let c = 0; c < 2; c++) {
              const ang = rand() * 6.28;
              plant(hit.x + Math.cos(ang) * sz * 0.95, hit.z + Math.sin(ang) * sz * 0.95, sz * rand.range(0.45, 0.65), time + 0.12 + c * 0.1);
            }
            bump = hit;
          }
        }

        // Hover springs: squash/stretch and lean away from the cursor's motion.
        const { w, h } = stage.size;
        const px = pt.x * w, py = pt.y * h;
        const speed = Math.min(1, Math.hypot(pt.vx, pt.vy) * 70);
        const active = pt.inside && pow > 0;
        const tanF = Math.tan((cam.fov * Math.PI) / 360);
        const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
        const sdt = dt / steps;
        const dirty = new Set();
        for (const p of plants) {
          const y0 = hillsH(p.x, p.z) + (p.kind === 0 ? p.size * p.hf * 0.7 : p.size * p.hf * 0.45);
          if (active || bump) {
            tmp.set(p.x, y0, p.z).project(cam);
            const sx = (tmp.x * 0.5 + 0.5) * w, sy = (0.5 - tmp.y * 0.5) * h;
            const dist = cam.position.distanceTo(tmp.set(p.x, y0, p.z));
            const rpx = (p.size * (p.kind === 0 ? 1 : p.hf * 0.5) / (dist * tanF)) * h * 0.5;
            if (active) {
              const d = Math.hypot(sx - px, sy - py);
              const f = Math.exp(-((d / (rpx * 1.2 + 18)) ** 2)) * Math.min(pow, 2) * P.bounce;
              if (f > 0.01) {
                p.sv += f * (speed * 9 + 0.6) * dt * 10;
                p.wvx += f * pt.vx * 600 * dt * 10;
                p.wvz += f * pt.vy * 600 * dt * 10;
              }
            }
            if (bump) {
              const d = Math.hypot(p.x - bump.x, p.z - bump.z);
              if (d < 3 && d > 0.3) {
                const f = (1 - d / 3) * P.bounce;
                p.sv -= f * 2.2;
                p.wvx += ((p.x - bump.x) / d) * f * 2;
                p.wvz += ((p.z - bump.z) / d) * f * 2;
              }
            }
          }
          if (Math.abs(p.s) + Math.abs(p.sv) + Math.abs(p.wx) + Math.abs(p.wvx) + Math.abs(p.wz) + Math.abs(p.wvz) < 1e-4) {
            if (p.s !== 0 || p.wx !== 0 || p.wz !== 0) { p.s = p.wx = p.wz = 0; dirty.add(p.attrs); p.attrs.anim.array.set([0, 0, 0], p.i * 4); }
            continue;
          }
          for (let k = 0; k < steps; k++) {
            p.sv += (-140 * p.s - 6 * p.sv) * sdt; p.s += p.sv * sdt;
            p.wvx += (-90 * p.wx - 5 * p.wvx) * sdt; p.wx += p.wvx * sdt;
            p.wvz += (-90 * p.wz - 5 * p.wvz) * sdt; p.wz += p.wvz * sdt;
          }
          p.s = Math.max(-0.45, Math.min(0.6, p.s));
          p.wx = Math.max(-0.8, Math.min(0.8, p.wx));
          p.wz = Math.max(-0.8, Math.min(0.8, p.wz));
          p.attrs.anim.array.set([p.s, p.wx, p.wz], p.i * 4);
          dirty.add(p.attrs);
        }
        dirty.forEach((at) => { at.anim.needsUpdate = true; });
        stage.render(time);
      },
      dispose: stage.dispose,
    };
  },
};
