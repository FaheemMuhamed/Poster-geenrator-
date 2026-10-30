// Dot Terrain: a halftone landscape in 3D (ref 4). Thousands of instanced dots rise and
// swell with noise; the cursor sends ripples through the field, clicks drop bigger ones.
import { createThreeStage, paletteUniform, pointerNDC, THREE } from '../../shared/threeStage.js';
import { NOISE, PALETTE_GLSL } from '../../shaders/noise.glsl.js';

const SHAPES = ['Sphere', 'Pill', 'Cube'];
const COLOR_BY = ['Height', 'Distance', 'Mono'];
const RIPPLES = 10; // ring buffer of recent ripple origins

const params = {
  grid:    { value: 120, min: 40, max: 200, step: 1, label: 'Grid size', rebuild: true },
  shape:   { value: 'Sphere', options: SHAPES, label: 'Shape', rebuild: true },
  spacing: { value: 0.08, min: 0.04, max: 0.16, step: 0.001, label: 'Spacing' },
  height:  { value: 0.9, min: 0, max: 3, step: 0.01, label: 'Height' },
  scale:   { value: 1, min: 0.2, max: 4, step: 0.01, label: 'Noise scale' },
  speed:   { value: 0.4, min: 0, max: 2, step: 0.01, label: 'Speed' },
  dot:     { value: 0.55, min: 0.1, max: 1.5, step: 0.01, label: 'Dot size' },
  tilt:    { value: 0.6, min: 0.15, max: 1.5, step: 0.01, label: 'Camera tilt' },
  ripple:  { value: 1, min: 0, max: 3, step: 0.01, label: 'Ripple strength' },
  colorBy: { value: 'Height', options: COLOR_BY, label: 'Colour by' },
  shift:   { value: 0, min: 0, max: 1, step: 0.01, label: 'Colour shift' },
};

const vertex = /* glsl */ `
uniform float uTime, uClock, uSpacing, uHeight, uScale, uDot, uRipple, uColorBy, uShift, uHalf, uFogNear, uFogFar, uPill;
uniform vec4 uRip[${RIPPLES}]; // x, z, start time, strength
varying vec3 vCol, vN;
varying float vFog;
${PALETTE_GLSL}
${NOISE}

void main() {
  vec2 cell = instanceMatrix[3].xz;      // integer-ish grid coordinates
  vec2 g = cell * uSpacing;              // world position on the ground
  float h = snoise(vec3(g * uScale * 0.28, uClock * 0.12)) * 0.7
          + snoise(vec3(g * uScale * 0.7 + 5.0, uClock * 0.2)) * 0.3;
  float hn = h * 0.5 + 0.5;

  // Ripples: a raised ring travelling outward from each origin, fading with age.
  float rip = 0.0;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 5.0) continue;
    float x = distance(g, r.xy) - age * 2.2;
    rip += exp(-x * x * 5.0) * exp(-age * 0.9) * r.w;
  }
  rip *= uRipple;

  // Fade the square grid into a soft round field.
  float rad = length(cell) / uHalf;
  float fade = smoothstep(1.0, 0.72, rad);
  float s = uDot * uSpacing * mix(0.22, 1.15, clamp(hn + rip * 0.35, 0.0, 1.4)) * fade;
  vec3 local = position * s;
  local.y *= 1.0 + uPill * (0.8 + rip);
  vec3 p = vec3(g.x, h * uHeight + rip * 0.4, g.y) + local;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vN = normalize(normalMatrix * normal);
  if (uColorBy < 0.5) vCol = paletteRamp(uShift + hn * 0.72 + rip * 0.15);
  else if (uColorBy < 1.5) vCol = paletteRamp(uShift + length(g) * 0.12 - uTime * 0.02);
  else vCol = mix(uPal[1], paletteRamp(uShift), clamp(rip, 0.0, 1.0));
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
}
`;

const fragment = /* glsl */ `
uniform vec3 uPal[6];
varying vec3 vCol, vN;
varying float vFog;
void main() {
  vec3 n = normalize(vN);
  float diff = dot(n, normalize(vec3(-0.3, 0.8, 0.5))) * 0.5 + 0.5;
  vec3 col = vCol * (0.55 + 0.55 * diff);
  gl_FragColor = vec4(mix(col, uPal[0], vFog), 1.0);
}
`;

export default {
  id: 'terrain',
  name: 'Dot Terrain',
  engine: 'three',
  hint: 'Move to ripple the field, click to drop a stone',
  params,
  create(ctx) {
    const P = ctx.params;
    const stage = createThreeStage(ctx, { fov: 32, cameraZ: 9 });

    const geo = P.shape === 'Cube' ? new THREE.BoxGeometry(1.3, 1.3, 1.3)
      : P.shape === 'Pill' ? new THREE.CapsuleGeometry(0.4, 0.6, 2, 7)
      : new THREE.SphereGeometry(0.5, 8, 5);

    const uniforms = {
      uTime: { value: 0 }, uClock: { value: 0 }, uSpacing: { value: 0.08 }, uHeight: { value: 1 },
      uScale: { value: 1 }, uDot: { value: 1 }, uRipple: { value: 1 }, uColorBy: { value: 0 },
      uShift: { value: 0 }, uHalf: { value: P.grid / 2 }, uFogNear: { value: 6 }, uFogFar: { value: 14 },
      uPill: { value: P.shape === 'Pill' ? 1 : 0 },
      uRip: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) }, // w = 0: empty slot (Vector4 defaults w to 1)
      uPal: { value: paletteUniform(ctx.state.colors) },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms });

    // Instance matrices only carry the grid cell (scaled by the live spacing in the shader).
    const N = P.grid;
    const mesh = new THREE.InstancedMesh(geo, mat, N * N);
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) mesh.setMatrixAt(i * N + j, m.makeTranslation(i - (N - 1) / 2, 0, j - (N - 1) / 2));
    }
    mesh.frustumCulled = false;
    stage.scene.add(mesh);

    const ray = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const lastDrop = new THREE.Vector3(999, 0, 999);
    let ripIdx = 0, clock = ctx.rand() * 100, lastDropTime = -1, camX = 0;

    const drop = (x, z, t, strength) => {
      uniforms.uRip.value[ripIdx].set(x, z, t, strength);
      ripIdx = (ripIdx + 1) % RIPPLES;
    };

    return {
      resize: stage.resize,
      frame(time, dt) {
        const u = uniforms;
        clock += dt * P.speed;
        u.uTime.value = time; u.uClock.value = clock;
        u.uSpacing.value = P.spacing; u.uHeight.value = P.height; u.uScale.value = P.scale;
        u.uDot.value = P.dot; u.uRipple.value = P.ripple; u.uShift.value = P.shift;
        u.uColorBy.value = Math.max(0, COLOR_BY.indexOf(P.colorBy));
        u.uPal.value = paletteUniform(ctx.state.colors);

        // Camera on an arc above the field; the cursor nudges it sideways for parallax.
        const half = (N / 2) * P.spacing;
        const dist = 4 + half * 1.15;
        const mousePow = ctx.state.motion.mouse;
        camX += (((ctx.pointer.inside ? ctx.pointer.x : 0.5) - 0.5) * 1.2 * Math.min(mousePow, 1.5) - camX) * Math.min(1, dt * 3);
        const cam = stage.camera;
        cam.position.set(camX, Math.sin(P.tilt) * dist, Math.cos(P.tilt) * dist);
        cam.lookAt(0, 0, 0);
        cam.setViewOffset(stage.size.w, stage.size.h, 0, -stage.size.h * 0.12, stage.size.w, stage.size.h);
        u.uFogNear.value = dist - half * 0.1;
        u.uFogFar.value = dist + half * 1.7;

        // Cursor on the ground plane: moving drops small ripples, clicking a big one.
        if (ctx.pointer.inside && mousePow > 0) {
          ray.setFromCamera(pointerNDC(ctx), cam);
          if (ray.ray.intersectPlane(ground, hit)) {
            if (ctx.pointer.justPressed) drop(hit.x, hit.z, time, 1.3 * mousePow);
            else if (time - lastDropTime > 0.18 && hit.distanceTo(lastDrop) > half * 0.06) {
              drop(hit.x, hit.z, time, 0.45 * mousePow);
              lastDrop.copy(hit); lastDropTime = time;
            }
          }
        }
        stage.render(time);
      },
      dispose: stage.dispose,
    };
  },
};
