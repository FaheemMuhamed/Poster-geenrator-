// Ribbon Flow: a bundle of silky strips sliding along a sweeping path, bent by curl noise.
// All motion happens in the vertex shader. Drag to orbit; the cursor pulls the ribbons.
import { createThreeStage, paletteUniform, pointerNDC, THREE } from '../../shared/threeStage.js';
import { NOISE, PALETTE_GLSL } from '../../shaders/noise.glsl.js';

const COLOR_MODES = ['Along length', 'Per ribbon', 'Ink + accent'];
const SEGMENTS = 120;

const params = {
  count:   { value: 70, min: 20, max: 150, step: 1, label: 'Ribbons', rebuild: true },
  width:   { value: 1.4, min: 0.1, max: 4, step: 0.01, label: 'Width' },
  length:  { value: 0.65, min: 0.1, max: 1, step: 0.01, label: 'Length' },
  turb:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Turbulence' },
  speed:   { value: 0.4, min: 0, max: 2, step: 0.01, label: 'Flow speed' },
  spread:  { value: 0.75, min: 0, max: 3, step: 0.01, label: 'Spread' },
  twist:   { value: 0.6, min: 0, max: 3, step: 0.01, label: 'Twist' },
  colorMode: { value: 'Along length', options: COLOR_MODES, label: 'Colour mode' },
  shift:   { value: 0, min: 0, max: 1, step: 0.01, label: 'Colour shift' },
  fog:     { value: 0.45, min: 0, max: 1, step: 0.01, label: 'Fog' },
};

const vertex = /* glsl */ `
attribute float aT, aSide;
attribute vec4 aRib; // x: index 0..1, y/z: cross-section offset, w: random
uniform float uTime, uFlow, uLen, uWidth, uTurb, uSpread, uTwist, uMousePow, uMode, uShift, uFog, uCamDist;
uniform vec3 uMouse3;
varying vec3 vCol, vN;
varying float vFog;
${PALETTE_GLSL}
${NOISE}

// The shared path every ribbon follows (s = 0..1 crosses the poster, beyond is off-canvas).
vec3 spine(float s) {
  float u = s * 2.0 - 1.0;
  return vec3(u * 2.9, sin(u * 2.3 + 0.7) * 0.8 + u * 0.15 - 0.55, cos(u * 1.8) * 1.1 - 0.7);
}

vec3 centre(float s) {
  vec3 p = spine(s);
  float th = s * uTwist * 6.2831853;
  vec2 o = aRib.yz * uSpread;
  o = vec2(cos(th) * o.x - sin(th) * o.y, sin(th) * o.x + cos(th) * o.y);
  p.yz += o;
  p += curl(p * 0.32 + vec3(0.0, 0.0, uTime * 0.06)) * uTurb * 0.22;
  vec3 d = uMouse3 - p;
  p += d * smoothstep(1.9, 0.0, length(d)) * 0.5 * uMousePow;
  return p;
}

void main() {
  // Each ribbon is a window of length uLen sliding along the path and wrapping off-canvas.
  float start = mix(-uLen - 0.15, 1.15, fract(aRib.w * 7.13 + uFlow * (0.6 + aRib.w * 0.8)));
  float s = start + aT * uLen;
  vec3 c0 = centre(s);
  vec3 c1 = centre(s + 0.004);
  vec3 T = normalize(c1 - c0);
  float phi = s * uTwist * 9.0 + aRib.w * 6.2831853;
  vec3 side = normalize(cross(T, vec3(0.0, cos(phi), sin(phi))));
  float w = uWidth * 0.045 * pow(sin(3.14159265 * aT), 0.6);
  vec3 p = c0 + side * aSide * w;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vN = normalize(normalMatrix * cross(T, side));

  if (uMode < 0.5) vCol = paletteRamp(uShift + aT * 0.55 + aRib.x * 0.45);
  else if (uMode < 1.5) vCol = paletteRamp(uShift + floor(aRib.w * 4.0) * 0.25);
  else vCol = aRib.w > 0.82 ? paletteRamp(uShift + aRib.x) : uPal[1];
  vFog = smoothstep(uCamDist - 2.0, uCamDist + 3.5, -mv.z) * uFog;
}
`;

const fragment = /* glsl */ `
varying vec3 vCol, vN;
varying float vFog;
uniform vec3 uPal[6];
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-0.4, 0.7, 0.6));
  float diff = abs(dot(n, L));
  float sheen = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
  vec3 col = vCol * (0.72 + 0.38 * diff) + sheen * 0.22;
  gl_FragColor = vec4(mix(col, uPal[0], vFog), 1.0);
}
`;

export default {
  id: 'ribbons',
  name: 'Ribbon Flow',
  engine: 'three',
  hint: 'Drag to orbit, move to pull the ribbons',
  params,
  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;
    const stage = createThreeStage(ctx, { orbit: true, cameraZ: 7 });

    // One strip per ribbon: two vertices (aSide = -1 / 1) per segment.
    const n = P.count, rows = SEGMENTS + 1, perRib = rows * 2;
    const aT = new Float32Array(n * perRib), aSide = new Float32Array(n * perRib);
    const aRib = new Float32Array(n * perRib * 4);
    const index = [];
    for (let i = 0; i < n; i++) {
      const ang = r() * Math.PI * 2, rad = Math.sqrt(r());
      const rib = [i / n, Math.cos(ang) * rad, Math.sin(ang) * rad * 0.45, r()];
      for (let j = 0; j < rows; j++) {
        for (let k = 0; k < 2; k++) {
          const v = i * perRib + j * 2 + k;
          aT[v] = j / SEGMENTS;
          aSide[v] = k ? 1 : -1;
          aRib.set(rib, v * 4);
        }
        if (j < SEGMENTS) {
          const a = i * perRib + j * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * perRib * 3), 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
    geo.setAttribute('aRib', new THREE.BufferAttribute(aRib, 4));
    geo.setIndex(index);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);

    const uniforms = {
      uTime: { value: 0 }, uFlow: { value: 0 }, uLen: { value: 0 }, uWidth: { value: 0 },
      uTurb: { value: 0 }, uSpread: { value: 0 }, uTwist: { value: 0 }, uMousePow: { value: 0 },
      uMode: { value: 0 }, uShift: { value: 0 }, uFog: { value: 0 }, uCamDist: { value: 7 },
      uMouse3: { value: new THREE.Vector3(99, 99, 99) },
      uPal: { value: paletteUniform(ctx.state.colors) },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, side: THREE.DoubleSide });
    stage.scene.add(new THREE.Mesh(geo, mat));

    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    const mouse = new THREE.Vector3(99, 99, 99);
    let flow = r() * 10, pull = 0;

    return {
      resize: stage.resize,
      frame(time, dt) {
        const u = uniforms;
        flow += dt * P.speed * 0.04;
        u.uTime.value = time; u.uFlow.value = flow;
        u.uLen.value = P.length; u.uWidth.value = P.width; u.uTurb.value = P.turb;
        u.uSpread.value = P.spread; u.uTwist.value = P.twist; u.uShift.value = P.shift;
        u.uFog.value = P.fog; u.uMode.value = Math.max(0, COLOR_MODES.indexOf(P.colorMode));
        u.uPal.value = paletteUniform(ctx.state.colors);
        u.uCamDist.value = stage.camera.position.length();

        // Ease the pull in/out so ribbons don't snap when the cursor enters or leaves.
        let want = 0;
        if (ctx.pointer.inside) {
          ray.setFromCamera(pointerNDC(ctx), stage.camera);
          plane.normal.copy(stage.camera.position).normalize(); // plane faces the camera
          if (ray.ray.intersectPlane(plane, hit)) {
            mouse.distanceTo(hit) > 20 ? mouse.copy(hit) : mouse.lerp(hit, 0.25);
            want = ctx.state.motion.mouse * (ctx.pointer.down ? 1.5 : 1);
          }
        }
        pull += (want - pull) * Math.min(1, dt * 4 + 0.02);
        u.uMouse3.value.copy(mouse);
        u.uMousePow.value = pull;

        stage.render(time);
      },
      dispose: stage.dispose,
    };
  },
};
