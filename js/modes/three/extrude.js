// Extrude Field: a grid of extruded bars rolling in travelling waves, seen through a wide
// lens so the outer bars lean out like the ref (12). Hover drags a crater through the field,
// leaving a wake; click sends a big wave rolling out from that spot.
import { createThreeStage, paletteUniform, pointerNDC, THREE } from '../../shared/threeStage.js';
import { NOISE, PALETTE_GLSL } from '../../shaders/noise.glsl.js';

const WAVES = 6;  // click waves
const TRAIL = 10; // cursor wake points

const params = {
  grid:    { value: 24, min: 12, max: 56, step: 1, label: 'Grid size', rebuild: true },
  width:   { value: 0.72, min: 0.2, max: 1, step: 0.01, label: 'Bar width' },
  base:    { value: 2.2, min: 0.2, max: 6, step: 0.01, label: 'Bar height' },
  height:  { value: 1.4, min: 0, max: 5, step: 0.01, label: 'Wave height' },
  speed:   { value: 0.6, min: 0, max: 2.5, step: 0.01, label: 'Speed' },
  twist:   { value: 0.12, min: 0, max: 1.5, step: 0.01, label: 'Twist amount' },
  warp:    { value: 0.25, min: 0, max: 1.5, step: 0.01, label: 'Warp amount' },
  accent:  { value: 0.12, min: 0, max: 0.6, step: 0.01, label: 'Accent amount' },
  angle:   { value: 6, min: 0, max: 60, step: 1, label: 'Camera angle', unit: '°' },
  lens:    { value: 100, min: 25, max: 110, step: 1, label: 'Lens width', unit: '°' },
  push:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Push strength' },
};

const vertex = /* glsl */ `
attribute vec2 aCell;  // world x, z of the bar
attribute vec4 aRnd;   // random rolls: accent, accent colour, aspect, phase
uniform float uTime, uClock, uWidth, uBase, uHeight, uTwist, uWarp, uAccent, uPush, uHalf;
uniform vec4 uWave[${WAVES}];   // x, z, start, strength
uniform vec4 uTrail[${TRAIL}];  // x, z, time, strength
uniform vec3 uMouse;            // x, z, amount (live cursor crater)
varying vec3 vN, vBase;
varying vec2 vUv;
varying float vFlash, vH;
${PALETTE_GLSL}
${NOISE}

void main() {
  vec2 g = aCell;
  // Domain warp bends the straight wavefronts into a woven field.
  vec2 q = g + uWarp * 3.5 * vec2(snoise(vec3(g * 0.07, uClock * 0.12)), snoise(vec3(g * 0.07 + 19.0, uClock * 0.12)));
  float w1 = sin(q.x * 0.32 + uClock * 1.3);
  float w2 = sin(dot(q, vec2(0.21, 0.29)) - uClock * 0.9);
  float w3 = sin(length(q - vec2(uHalf * 0.4, -uHalf * 0.3)) * 0.45 - uClock * 1.1);
  float n = snoise(vec3(g * 0.11, uClock * 0.18));
  float h = 0.5 + 0.2 * w1 + 0.18 * w2 + 0.16 * w3 + 0.22 * n;
  h = clamp(h, 0.0, 1.2);
  float H = max(0.06, uBase + uHeight * (h - 0.5) * 2.0);

  // Cursor wake: craters that sink the bars, each with a raised rim, relaxing over time.
  float crater = 0.0, rim = 0.0;
  for (int i = 0; i < ${TRAIL}; i++) {
    vec4 t = uTrail[i];
    float age = uTime - t.z;
    if (t.w <= 0.0 || age < 0.0 || age > 1.6) continue;
    float fade = t.w * (1.0 - age / 1.6);
    fade *= fade;
    float d = distance(g, t.xy);
    float r = 2.2 + age * 1.5;
    crater = max(crater, fade * exp(-d * d / (r * r * 0.5)));
    float dr = d - r * 1.1;
    rim = max(rim, fade * exp(-dr * dr * 0.6));
  }
  float md = distance(g, uMouse.xy);
  crater = max(crater, uMouse.z * exp(-md * md / 7.0));
  float mr = md - 3.8;
  rim = max(rim, uMouse.z * 0.7 * exp(-mr * mr * 0.5));
  H = H * (1.0 - 0.9 * clamp(crater * uPush, 0.0, 1.0)) + rim * uPush * (uBase + uHeight) * 0.3;

  // Click waves: a crest rolling outward.
  float flash = 0.0;
  for (int i = 0; i < ${WAVES}; i++) {
    vec4 wv = uWave[i];
    float age = uTime - wv.z;
    if (wv.w <= 0.0 || age < 0.0 || age > 6.0) continue;
    float x = distance(g, wv.xy) - age * 8.0;
    float crest = exp(-x * x * 0.12) * exp(-age * 0.45) * wv.w;
    H += (uBase + uHeight) * 0.45 * crest * (0.6 + 0.4 * sin(x * 1.3));
    flash = max(flash, crest);
  }
  H = max(H, 0.04);

  // Twist the bar about its axis with the wave phase.
  float ang = uTwist * ((h - 0.5) * 2.4 + (aRnd.w - 0.5) * 0.6 + flash * 1.5);
  float c = cos(ang), s = sin(ang);
  vec3 p = position;
  p.x *= uWidth * mix(0.7, 1.3, aRnd.z);
  p.z *= uWidth * mix(1.3, 0.7, aRnd.z);
  p.y *= H;
  p.xz = mat2(c, -s, s, c) * p.xz;
  vec3 nn = normal;
  nn.xz = mat2(c, -s, s, c) * nn.xz;

  // Colour: a slow gradient between c1 and c2 across the field, a few bars in c3/c4.
  float t = 0.5 + 0.5 * sin(dot(g, vec2(0.11, -0.09)) + uClock * 0.2 + n * 1.2);
  vec3 base = mix(uPal[2], uPal[3], smoothstep(0.3, 0.7, t));
  float acc = step(aRnd.x, uAccent);
  base = mix(base, aRnd.y > 0.5 ? uPal[5] : uPal[4], acc);
  base = mix(base, aRnd.y > 0.5 ? uPal[4] : uPal[5], clamp(flash * 0.8, 0.0, 1.0));

  vN = nn;
  vBase = base;
  vUv = uv;
  vFlash = flash;
  vH = h;
  vec4 wp = modelMatrix * vec4(p + vec3(g.x, 0.0, g.y), 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
uniform vec3 uPal[6];
uniform vec2 uLight;
varying vec3 vN, vBase;
varying vec2 vUv;
varying float vFlash, vH;
void main() {
  vec3 n = normalize(vN);
  vec3 col;
  if (n.y > 0.5) {
    col = mix(vBase, vec3(1.0), 0.3);                       // light top
  } else {
    float s = dot(normalize(n.xz), uLight) * 0.5 + 0.5;      // lit side vs shaded side
    col = mix(vBase * 0.36, vBase * 0.98, s);
  }
  // Hairline edges in a darker tone of the bar.
  vec2 fu = fwidth(vUv) + 1e-5;
  vec2 e = min(vUv, 1.0 - vUv) / fu;
  float line = 1.0 - smoothstep(0.3, 1.2, min(e.x, e.y));
  col = mix(col, vBase * 0.5, line * 0.55);
  gl_FragColor = vec4(col, 1.0);
}
`;

export default {
  id: 'extrude',
  name: 'Extrude Field',
  engine: 'three',
  hint: 'Hover to push a crater through the bars, click to send a wave',
  params,
  controls: {
    essentials: ['base', 'height', 'lens', 'twist'],
    form: ['grid', 'width', 'warp', 'angle'],
    motion: ['speed'],
    interaction: ['push'],
    colour: ['accent'],
  },
  presets: {
    'Calm': { height: 0.5, speed: 0.3, twist: 0, warp: 0.1 },
    'Storm': { height: 3.5, speed: 1.6, twist: 0.5, warp: 1 },
    'Towers': { base: 5, height: 1, width: 0.5, lens: 60, angle: 30 },
  },
  interactions: { hover: 'drags a crater through the bars, leaving a wake', click: 'sends a big wave rolling outward' },
  create(ctx) {
    const P = ctx.params;
    const stage = createThreeStage(ctx, { fov: 72, cameraZ: 20 });
    const cam = stage.camera;
    const rand = ctx.rand;

    const N = P.grid;
    const half = (N - 1) / 2;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry().copy(box);
    box.dispose();
    geo.instanceCount = N * N;
    const aCell = new Float32Array(N * N * 2), aRnd = new Float32Array(N * N * 4);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const k = i * N + j;
        aCell[k * 2] = i - half; aCell[k * 2 + 1] = j - half;
        aRnd.set([rand(), rand(), rand(), rand()], k * 4);
      }
    }
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 2));
    geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(aRnd, 4));

    const uniforms = {
      uTime: { value: 0 }, uClock: { value: rand() * 50 }, uWidth: { value: 0.7 }, uBase: { value: 2 }, uHeight: { value: 2 },
      uTwist: { value: 0 }, uWarp: { value: 0 }, uAccent: { value: 0 }, uPush: { value: 1 }, uHalf: { value: half },
      uWave: { value: Array.from({ length: WAVES }, () => new THREE.Vector4(0, 0, -100, 0)) },
      uTrail: { value: Array.from({ length: TRAIL }, () => new THREE.Vector4(0, 0, -100, 0)) },
      uLight: { value: new THREE.Vector2(-0.8, 0.6) },
      uMouse: { value: new THREE.Vector3() },
      uPal: { value: paletteUniform(ctx.state.colors) },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    stage.scene.add(mesh);

    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const last = new THREE.Vector3(1e3, 0, 1e3);
    const mouse = { x: 0, z: 0, amt: 0 };
    let waveIdx = 0, trailIdx = 0, lastTrail = -1, sway = rand() * 10;

    return {
      resize: stage.resize,
      frame(time, dt) {
        const u = uniforms;
        u.uTime.value = time;
        u.uClock.value += dt * P.speed;
        u.uWidth.value = P.width; u.uBase.value = P.base; u.uHeight.value = P.height; u.uTwist.value = P.twist;
        u.uWarp.value = P.warp; u.uAccent.value = P.accent; u.uPush.value = P.push;
        u.uPal.value = paletteUniform(ctx.state.colors);

        // Camera looks down through a wide lens, tilted and slowly swaying.
        sway += dt * 0.15;
        const fov = P.lens;
        if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
        const tanH = Math.tan((fov * Math.PI) / 360);
        const aspect = stage.size.w / stage.size.h;
        const tilt = (P.angle * Math.PI) / 180;
        // Distance so the field just overfills the frame.
        const D = (N * 0.36) / (tanH * Math.max(1, aspect)) * (0.7 + 0.3 * Math.cos(tilt)) + (P.base + P.height) * 0.9;
        const az = 0.62 + Math.sin(sway) * 0.12;
        const look = new THREE.Vector3(0, P.base * 0.5, 0);
        cam.position.set(
          Math.sin(az) * Math.sin(tilt) * D + 0.06 * D,
          look.y + Math.cos(tilt) * D,
          Math.cos(az) * Math.sin(tilt) * D + 0.04 * D,
        );
        cam.up.set(0, 0, -1);
        cam.lookAt(look);
        cam.updateMatrixWorld();
        // Light from the screen's left so the left faces read lighter than the right ones.
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
        u.uLight.value.set(-right.x, -right.z).normalize();

        // Cursor wake and click waves on the ground plane.
        const pow = ctx.state.motion.mouse;
        let target = 0;
        if (ctx.pointer.inside && pow > 0) {
          plane.constant = -P.base * 0.6;
          ray.setFromCamera(pointerNDC(ctx), cam);
          if (ray.ray.intersectPlane(plane, hit)) {
            const k = mouse.amt < 0.02 ? 1 : Math.min(1, dt * 10);
            mouse.x += (hit.x - mouse.x) * k; mouse.z += (hit.z - mouse.z) * k;
            target = Math.min(pow, 1.5);
            if (ctx.pointer.justPressed) {
              u.uWave.value[waveIdx].set(hit.x, hit.z, time, Math.min(pow, 2));
              waveIdx = (waveIdx + 1) % WAVES;
            }
            if (time - lastTrail > 0.07 && (hit.distanceTo(last) > 0.5 || time - lastTrail > 0.4)) {
              u.uTrail.value[trailIdx].set(hit.x, hit.z, time, Math.min(pow, 2));
              trailIdx = (trailIdx + 1) % TRAIL;
              last.copy(hit); lastTrail = time;
            }
          }
        }
        mouse.amt += (target - mouse.amt) * Math.min(1, dt * 4);
        u.uMouse.value.set(mouse.x, mouse.z, mouse.amt);
        stage.render(time);
      },
      dispose: stage.dispose,
    };
  },
};
