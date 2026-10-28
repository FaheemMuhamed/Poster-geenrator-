// Liquid Blob: a soft, noise-displaced sphere that drifts like a lava-lamp droplet (ref 6).
// It bulges toward the cursor; click to send a ripple across its surface.
import { createThreeStage, paletteUniform, pointerNDC, THREE } from '../../shared/threeStage.js';
import { NOISE, PALETTE_GLSL } from '../../shaders/noise.glsl.js';

const MATERIALS = ['Soft glow', 'Iridescent', 'Glass', 'Matte'];
const PULSES = 4; // how many click ripples can overlap

const params = {
  material:  { value: 'Soft glow', options: MATERIALS, label: 'Material' },
  amount:    { value: 0.28, min: 0, max: 1, step: 0.01, label: 'Noise amount' },
  scale:     { value: 0.75, min: 0.2, max: 4, step: 0.01, label: 'Noise scale' },
  speed:     { value: 0.35, min: 0, max: 2, step: 0.01, label: 'Speed' },
  size:      { value: 1.0, min: 0.3, max: 2.2, step: 0.01, label: 'Size' },
  shift:     { value: 0, min: 0, max: 1, step: 0.01, label: 'Colour shift' },
  edge:      { value: 1, min: 0, max: 3, step: 0.01, label: 'Edge glow' },
  satellites:{ value: 2, min: 0, max: 6, step: 1, label: 'Satellites', rebuild: true },
  posX:      { value: 0, min: -1.5, max: 1.5, step: 0.01, label: 'Position X' },
  posY:      { value: -0.1, min: -2, max: 2, step: 0.01, label: 'Position Y' },
};

const vertex = /* glsl */ `
uniform float uTime, uClock, uAmount, uScale, uSeed, uMouseAmt;
uniform vec3 uMouseDir;
uniform vec4 uPulse[${PULSES}];
varying vec3 vN, vWPos, vObjN;
varying float vDisp;
${NOISE}

// Radial displacement for a point on the unit sphere.
float disp(vec3 n) {
  float t = uClock;
  vec3 q = n * uScale + uSeed;
  // a little domain warp keeps the shapes "liquid" rather than lumpy
  q += 0.2 * vec3(snoise(q * 0.5 + t * 0.3), snoise(q * 0.5 + 9.1 - t * 0.25), 0.0);
  float d = snoise(q + vec3(0.0, 0.0, t)) * 0.8
          + snoise(q * 1.9 + vec3(t * 1.3, 4.0, 0.0)) * 0.16
          + snoise(q * 3.7 - t) * 0.035;
  d *= uAmount;
  // bulge toward the cursor
  d += uMouseAmt * pow(max(dot(n, uMouseDir), 0.0), 5.0);
  // click ripples: a ring that travels over the sphere and fades
  for (int i = 0; i < ${PULSES}; i++) {
    vec4 p = uPulse[i];
    float age = uTime - p.w;
    if (p.w < 0.0 || age > 4.0) continue;
    float ang = acos(clamp(dot(n, p.xyz), -1.0, 1.0));
    float x = ang - age * 1.6;
    d += 0.22 * sin(x * 9.0) * exp(-x * x * 5.0) * exp(-age * 1.1);
  }
  return d;
}

vec3 displaced(vec3 n) {
  n = normalize(n);
  return n * (1.0 + disp(n));
}

void main() {
  vec3 n = normalize(position);
  vec3 tang = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 bit = cross(n, tang);
  const float e = 0.006;
  vec3 p0 = displaced(n);
  vec3 p1 = displaced(n + tang * e);
  vec3 p2 = displaced(n + bit * e);
  vec3 nrm = normalize(cross(p1 - p0, p2 - p0));

  vDisp = length(p0) - 1.0;
  vObjN = n;
  vN = normalize(mat3(modelMatrix) * nrm);
  vec4 wp = modelMatrix * vec4(p0, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
uniform int uMaterial;
uniform float uShift, uEdge, uTime, uTone;
varying vec3 vN, vWPos, vObjN;
varying float vDisp;
${PALETTE_GLSL}

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(cameraPosition - vWPos);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 1.0 - ndv;
  vec3 L = normalize(vec3(-0.5, 0.8, 0.7));
  float diff = dot(n, L) * 0.5 + 0.5;
  float spec = pow(max(dot(reflect(-L, n), v), 0.0), 48.0);
  float t0 = uShift + uTone;
  vec3 bg = uPal[0];
  vec3 col; float alpha = 1.0;

  if (uMaterial == 0) {
    // Soft glow: saturated core that melts into the paper at the silhouette.
    vec3 core = paletteRamp(t0 + vDisp * 0.35);
    vec3 rim = paletteRamp(t0 + 0.25 + vObjN.y * 0.08);
    col = mix(core, rim, smoothstep(0.15, 0.95, fres) * min(uEdge, 1.0));
    col += (1.0 - diff) * 0.04 - spec * 0.0;
    alpha = pow(ndv, 0.35 + uEdge * 0.9);
    alpha = smoothstep(0.0, 0.9, alpha);
  } else if (uMaterial == 1) {
    // Iridescent: thin-film style hue walk driven by view angle.
    vec3 film = paletteRamp(t0 + fres * 0.9 + vDisp * 0.9 + dot(n, vec3(0.3, 0.5, 0.2)) * 0.25);
    col = film * (0.65 + 0.45 * diff) + spec * 0.7;
    col += paletteRamp(t0 + 0.5) * pow(fres, 3.0) * uEdge * 0.6;
  } else if (uMaterial == 2) {
    // Glass: fake refraction of a palette gradient + bright fresnel rim.
    vec3 r = refract(-v, n, 0.72);
    vec3 grad = paletteRamp(t0 + r.y * 0.35 + r.x * 0.22 + vDisp * 0.3);
    col = mix(bg, grad, 0.55 + 0.35 * ndv);
    col = mix(col, vec3(1.0), pow(fres, 3.0) * 0.55 * uEdge);
    col += spec * 0.9 + pow(max(dot(reflect(-normalize(vec3(0.6, -0.3, 0.7)), n), v), 0.0), 20.0) * 0.25;
    col = mix(col, uPal[1], pow(fres, 6.0) * 0.25);
    alpha = 0.92;
  } else {
    // Matte: two-tone lambert, shadow side tinted with the opposite accent.
    vec3 base = paletteRamp(t0);
    vec3 shade = mix(paletteRamp(t0 + 0.5), uPal[1], 0.35) * 0.75;
    col = mix(shade, base, smoothstep(0.3, 0.8, diff));
    col = mix(col, bg, pow(fres, 2.5) * 0.45 * uEdge);
  }
  gl_FragColor = vec4(col, alpha);
}
`;

export default {
  id: 'blob',
  name: 'Liquid Blob',
  engine: 'three',
  hint: 'Move to pull the blob, click to ripple it',
  params,
  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;
    const stage = createThreeStage(ctx, { cameraZ: 7 });

    // Uniforms every blob shares; each blob adds its own seed / mouse / ripple slots.
    const shared = {
      uTime: { value: 0 }, uClock: { value: 0 }, uAmount: { value: 0 }, uScale: { value: 1 },
      uShift: { value: 0 }, uEdge: { value: 1 }, uMaterial: { value: 0 },
      uPal: { value: paletteUniform(ctx.state.colors) },
    };
    const makeMat = (seed, tone) => new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment, transparent: true,
      uniforms: {
        ...shared,
        uSeed: { value: seed }, uTone: { value: tone }, uMouseAmt: { value: 0 },
        uMouseDir: { value: new THREE.Vector3(0, 0, 1) },
        uPulse: { value: Array.from({ length: PULSES }, () => new THREE.Vector4(0, 0, 1, -1)) },
      },
    });

    const root = new THREE.Group();
    stage.scene.add(root);
    const main = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 96), makeMat(r() * 50, 0));
    root.add(main);

    // Small orbiting droplets, each a different palette tone.
    const sats = [];
    const satGeo = new THREE.IcosahedronGeometry(1, 28);
    for (let i = 0; i < P.satellites; i++) {
      const m = new THREE.Mesh(satGeo, makeMat(r() * 50, 0.25 + i * 0.25 + r() * 0.1));
      m.renderOrder = 1;
      sats.push({
        mesh: m, radius: r.range(1.5, 2.3), size: r.range(0.14, 0.3),
        speed: r.range(0.15, 0.35) * (r() < 0.5 ? -1 : 1), phase: r() * 6.283, incl: r.range(-0.9, 0.9),
      });
      root.add(m);
    }

    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    const target = new THREE.Vector3(0, 0, 1);
    const tmp = new THREE.Vector3();
    const inv = new THREE.Matrix4();
    let mouseAmt = 0, pulseIdx = 0, clock = 0, spin = 0;

    return {
      resize: stage.resize,
      frame(time, dt) {
        clock += dt * P.speed;
        spin += dt * 0.12;
        const pal = paletteUniform(ctx.state.colors);
        shared.uTime.value = time;
        shared.uClock.value = clock;
        shared.uAmount.value = P.amount;
        shared.uScale.value = P.scale;
        shared.uShift.value = P.shift;
        shared.uEdge.value = P.edge;
        shared.uMaterial.value = Math.max(0, MATERIALS.indexOf(P.material));
        shared.uPal.value = pal;
        const soft = P.material === 'Soft glow';

        root.position.set(P.posX, P.posY, 0);
        main.scale.setScalar(P.size);
        main.rotation.set(Math.sin(time * 0.1) * 0.3, spin, 0);
        main.material.depthWrite = !soft;
        main.updateMatrixWorld();

        // Cursor -> point on the blob's z plane -> direction in the blob's own space.
        let want = 0;
        if (ctx.pointer.inside) {
          ray.setFromCamera(pointerNDC(ctx), stage.camera);
          plane.constant = -root.position.z;
          if (ray.ray.intersectPlane(plane, hit)) {
            tmp.copy(hit).sub(root.position);
            const dist = tmp.length() / P.size;
            tmp.z += P.size * 0.6; // lean the bulge toward the viewer
            inv.copy(main.matrixWorld).invert();
            tmp.applyMatrix4(inv.setPosition(0, 0, 0)).normalize();
            target.lerp(tmp, 0.15).normalize();
            want = 0.38 * Math.exp(-Math.max(0, dist - 0.8) * 0.9);
          }
        }
        want *= ctx.state.motion.mouse;
        mouseAmt += (want - mouseAmt) * Math.min(1, dt * 6 + 0.02);
        const mu = main.material.uniforms;
        mu.uMouseDir.value.copy(target);
        mu.uMouseAmt.value = mouseAmt;

        // Click: a ripple starting where the bulge points.
        if (ctx.pointer.justPressed && ctx.state.motion.mouse > 0) {
          mu.uPulse.value[pulseIdx].set(target.x, target.y, target.z, time);
          pulseIdx = (pulseIdx + 1) % PULSES;
        }

        for (const s of sats) {
          const a = s.phase + time * s.speed;
          s.mesh.position.set(Math.cos(a) * s.radius * P.size, Math.sin(a) * s.radius * s.incl * P.size, Math.sin(a) * s.radius * 0.8);
          s.mesh.scale.setScalar(s.size * P.size);
          s.mesh.rotation.y = time * 0.3;
          s.mesh.material.depthWrite = !soft;
        }
        stage.render(time);
      },
      dispose() {
        stage.dispose();
        satGeo.dispose();
      },
    };
  },
};
