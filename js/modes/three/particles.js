// Particle Swirl: tens of thousands of GPU particles in a twisting vortex (ref 9).
// Drag to orbit; the cursor pushes particles away.
import { createThreeStage, paletteUniform, pointerNDC, THREE } from '../../shared/threeStage.js';
import { NOISE, PALETTE_GLSL } from '../../shaders/noise.glsl.js';

const params = {
  count:  { value: 70000, min: 5000, max: 250000, step: 1000, label: 'Particle count', rebuild: true },
  arc:    { value: 0.75, min: 0.1, max: 1, step: 0.01, label: 'Arc length' },
  radius: { value: 2.2, min: 0.5, max: 5, step: 0.01, label: 'Radius' },
  spread: { value: 1.6, min: 0, max: 4, step: 0.01, label: 'Band width' },
  thick:  { value: 0.45, min: 0, max: 2, step: 0.01, label: 'Thickness' },
  twist:  { value: 1.5, min: 0, max: 8, step: 0.01, label: 'Twist' },
  noise:  { value: 0.6, min: 0, max: 3, step: 0.01, label: 'Turbulence' },
  bands:  { value: 1.4, min: 0.2, max: 6, step: 0.01, label: 'Colour bands' },
  size:   { value: 2.2, min: 0.3, max: 8, step: 0.01, label: 'Point size' },
  spin:   { value: 0.6, min: -3, max: 3, step: 0.01, label: 'Speed' },
  offsetX:{ value: 1.4, min: -4, max: 4, step: 0.01, label: 'Position X' },
  tilt:   { value: 0.5, min: -1.6, max: 1.6, step: 0.01, label: 'Tilt' },
  autoRotate: { value: true, label: 'Auto rotate' },
};

const vertex = /* glsl */ `
attribute vec4 aRand;
uniform float uTime, uArc, uRadius, uSpread, uThick, uTwist, uNoise, uBands, uSize, uPx, uMousePow;
uniform vec3 uMouse3;
varying vec3 vCol;
varying float vFade;
${PALETTE_GLSL}
${NOISE}
void main() {
  float speed = 0.6 + aRand.w;
  float a = aRand.x * 6.2831853 * uArc + uTime * speed * 0.25;
  float band = aRand.y;
  float R = uRadius + (band - 0.5) * uSpread;
  vec3 n = vec3(cos(a), sin(a), 0.0);
  vec3 p = n * R;
  float phi = aRand.z * 6.2831853 + a * uTwist;
  float rr = uThick * sqrt(fract(aRand.w * 7.31)) * (0.25 + band);
  p += (n * cos(phi) + vec3(0.0, 0.0, 1.0) * sin(phi)) * rr;
  p += curl(p * 0.35 + uTime * 0.04) * 0.12 * uNoise;

  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec3 d = wp.xyz - uMouse3;
  float dist = length(d);
  wp.xyz += normalize(d + 1e-4) * smoothstep(1.4, 0.0, dist) * 0.9 * uMousePow;

  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPx * (0.5 + aRand.w) * (6.0 / -mv.z);
  vCol = paletteRamp(band * uBands + snoise(p * 0.5) * 0.15);
  // Fade the open ends of the arc.
  float e = aRand.x;
  vFade = smoothstep(0.0, 0.08, e) * (uArc > 0.98 ? 1.0 : smoothstep(1.0, 0.85, e));
}
`;

const fragment = /* glsl */ `
varying vec3 vCol;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vCol, smoothstep(0.5, 0.25, d) * vFade);
}
`;

export default {
  id: 'particles',
  name: 'Particle Swirl',
  engine: 'three',
  hint: 'Drag to orbit, scroll to zoom',
  params,
  controls: {
    essentials: ['count', 'twist', 'noise', 'size'],
    form: ['arc', 'radius', 'spread', 'thick', 'offsetX', 'tilt'],
    motion: ['spin', 'autoRotate'],
    interaction: [],
    colour: ['bands'],
    type: [],
  },
  presets: {
    'Calm ring': { twist: 0.5, noise: 0.2, spin: 0.2, arc: 1 },
    'Storm': { twist: 5, noise: 2.2, spin: 1.8, thick: 1.2 },
    'Fine dust': { size: 0.8, spread: 2.8, noise: 1, bands: 3 },
  },
  interactions: { hover: 'pushes particles away from the cursor' },
  create(ctx) {
    const P = ctx.params;
    const stage = createThreeStage(ctx, { orbit: true, cameraZ: 7 });
    const r = ctx.rand;

    const geo = new THREE.BufferGeometry();
    const rand = new Float32Array(P.count * 4);
    for (let i = 0; i < rand.length; i++) rand[i] = r();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.count * 3), 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);

    const uniforms = {
      uTime: { value: 0 }, uPx: { value: 1 }, uMousePow: { value: 1 },
      uMouse3: { value: new THREE.Vector3(99, 99, 99) },
      uPal: { value: paletteUniform(ctx.state.colors) },
      uArc: { value: 0 }, uRadius: { value: 0 }, uSpread: { value: 0 }, uThick: { value: 0 },
      uTwist: { value: 0 }, uNoise: { value: 0 }, uBands: { value: 0 }, uSize: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment, uniforms,
      transparent: true, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    const group = new THREE.Group();
    group.add(points);
    stage.scene.add(group);

    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    let spinAngle = 0;

    return {
      resize: stage.resize,
      frame(time, dt) {
        const u = uniforms;
        u.uTime.value = time;
        u.uPx.value = stage.size.dpr;
        u.uPal.value = paletteUniform(ctx.state.colors);
        u.uArc.value = P.arc; u.uRadius.value = P.radius; u.uSpread.value = P.spread;
        u.uThick.value = P.thick; u.uTwist.value = P.twist; u.uNoise.value = P.noise;
        u.uBands.value = P.bands; u.uSize.value = P.size;
        u.uMousePow.value = ctx.state.motion.mouse;

        spinAngle += dt * P.spin * 0.3;
        group.position.x = P.offsetX;
        group.rotation.set(P.tilt, P.autoRotate ? Math.sin(time * 0.15) * 0.35 : 0, spinAngle);

        if (ctx.pointer.inside) {
          ray.setFromCamera(pointerNDC(ctx), stage.camera);
          if (ray.ray.intersectPlane(plane, hit)) u.uMouse3.value.copy(hit);
        } else u.uMouse3.value.set(99, 99, 99);

        stage.render(time);
      },
      dispose: stage.dispose,
    };
  },
};
