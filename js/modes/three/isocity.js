// Iso City: an isometric city of cream blocks with coloured districts and rooftops (ref 13).
// One instanced box per lot (plus a rooftop box), all heights computed in the vertex shader.
// Hover raises and lights up the blocks under the cursor; click sends a construction burst.
import { createThreeStage, paletteUniform, pointerNDC, THREE } from '../../shared/threeStage.js';
import { PALETTE_GLSL } from '../../shaders/noise.glsl.js';

const BURSTS = 6;       // ring buffer of construction bursts
const AVE_X = 6, AVE_Z = 7; // every Nth row / column of lots is an avenue

const params = {
  grid:    { value: 40, min: 16, max: 72, step: 1, label: 'Grid size', rebuild: true },
  density: { value: 0.9, min: 0.2, max: 1, step: 0.01, label: 'Density' },
  height:  { value: 5.5, min: 1, max: 16, step: 0.1, label: 'Max height' },
  towers:  { value: 0.07, min: 0, max: 0.4, step: 0.01, label: 'Tower chance' },
  colour:  { value: 0.4, min: 0, max: 1, step: 0.01, label: 'Colour amount' },
  spin:    { value: 0.05, min: -0.5, max: 0.5, step: 0.01, label: 'Rotation speed' },
  tilt:    { value: 35, min: 15, max: 65, step: 1, label: 'Camera tilt' },
  zoom:    { value: 1, min: 0.5, max: 2, step: 0.01, label: 'Zoom' },
  traffic: { value: 1, min: 0, max: 3, step: 0.01, label: 'Traffic' },
  outline: { value: 0.75, min: 0, max: 1, step: 0.01, label: 'Outlines' },
  lift:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Hover lift' },
};

// Shared GLSL: pick one of the four accents by index, and the wall tone from the palette.
const COMMON = /* glsl */ `
${PALETTE_GLSL}
vec3 accent(float i) {
  i = mod(floor(i + 0.5), 4.0);
  return i < 0.5 ? uPal[2] : i < 1.5 ? uPal[3] : i < 2.5 ? uPal[4] : uPal[5];
}
float lumOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 wallTone() {
  vec3 bg = uPal[0];
  return lumOf(bg) > 0.5 ? mix(bg, vec3(1.0), 0.3) : mix(bg, uPal[1], 0.13);
}
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const vertex = /* glsl */ `
attribute vec2 aCell;   // lot centre (world x, z)
attribute vec3 aFoot;   // footprint x, footprint z, district height 0..1
attribute vec4 aRnd;    // tower roll, density roll, colour roll, misc
attribute vec3 aDist;   // colour-district strength, district colour index, part (0 body, 1 rooftop)
uniform float uTime, uMaxH, uTower, uDensity, uColour, uLift;
uniform vec3 uMouse;    // x, z, amount
uniform vec4 uBurst[${BURSTS}];
varying vec3 vN, vW;
varying vec2 vUv, vFace;
varying float vColourOn, vIdx, vHover, vFlash, vPark, vRoofCol, vSeed, vPart;
${COMMON}

void main() {
  float part = aDist.z;
  float tower = step(aRnd.x, uTower);
  float park = step(uDensity, aRnd.y);
  float h = mix(aFoot.z, 0.72 + 0.4 * aRnd.w, tower);
  float H = mix(0.2 + h * h * uMaxH, 0.05, park);

  // Hover: lots near the cursor rise and light up.
  float d = distance(aCell, uMouse.xy);
  float hover = uMouse.z * exp(-d * d / 5.0) * (1.0 - park);
  H *= 1.0 + hover * 0.8 * uLift;
  H += hover * 0.5 * uLift;

  // Construction bursts: a ring sweeps out; each lot it passes shoots up, then settles.
  float flash = 0.0;
  for (int i = 0; i < ${BURSTS}; i++) {
    vec4 b = uBurst[i];
    float age = uTime - b.z;
    if (b.w <= 0.0 || age < 0.0 || age > 7.0) continue;
    float bd = distance(aCell, b.xy);
    float lt = age - bd / 10.0;
    if (lt <= 0.0) continue;
    float fall = exp(-bd / 9.0) * b.w;
    float spring = fall * exp(-lt * 2.2) * sin(lt * 6.5) * (1.0 - park);
    H = H * (1.0 + 0.9 * spring) + 1.2 * spring;
    flash = max(flash, fall * exp(-lt * 1.4) * (1.0 - park));
  }
  H = max(H, 0.03);

  // Rooftop boxes: a smaller penthouse on top of some buildings.
  float hasRoof = step(0.55, aRnd.w) * (1.0 - park) * step(0.6, H);
  float roofH = (0.18 + aRnd.z * 0.5) * (1.0 + hover * 0.6);
  vec2 foot = mix(aFoot.xy, aFoot.xy * (0.38 + 0.2 * aRnd.x) * hasRoof, part);
  float sy = mix(H, roofH * hasRoof + 0.0001, part);
  vec2 off = part * (aRnd.zw - 0.5) * aFoot.xy * 0.25;

  vec3 p = position;
  p.xz *= foot;
  p.y *= sy;
  vec3 w = vec3(aCell.x + off.x + p.x, p.y + part * H, aCell.y + off.y + p.z);

  vW = w;
  vN = normal;
  vUv = uv;
  // Face size in world units (width along the face, height up it) for windows.
  float faceW = abs(normal.x) > 0.5 ? foot.y : foot.x;
  vFace = abs(normal.y) > 0.5 ? foot : vec2(faceW, sy);
  vColourOn = step(aRnd.z, uColour * (0.04 + aDist.x * 1.9));
  vIdx = aDist.y;
  vHover = hover;
  vFlash = flash;
  vPark = park;
  vRoofCol = step(aRnd.x * 0.7 + aRnd.w * 0.3, uColour * 0.55) + part * step(0.4, aRnd.y);
  vSeed = aRnd.w * 37.0 + aRnd.z * 11.0;
  vPart = part;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const fragment = /* glsl */ `
uniform vec3 uLight;
uniform float uOutline, uTime;
varying vec3 vN, vW;
varying vec2 vUv, vFace;
varying float vColourOn, vIdx, vHover, vFlash, vPark, vRoofCol, vSeed, vPart;
${COMMON}

void main() {
  vec3 n = normalize(vN);
  bool top = n.y > 0.5;
  vec3 wall = wallTone();
  vec3 col = wall;

  if (vColourOn > 0.5) {
    // Coloured buildings are stacks of differently coloured storeys.
    float seg = floor(vW.y / (0.7 + fract(vSeed) * 0.9));
    float k = vIdx + floor(h21(vec2(vSeed, seg)) * 2.99);
    col = accent(k);
    // Some facades are split in two tones.
    if (fract(vSeed * 3.1) > 0.7 && !top && vUv.x > 0.5) col = accent(k + 1.0);
  }
  if (top) {
    if (vRoofCol > 0.5 && vColourOn < 0.5) col = accent(vIdx + floor(fract(vSeed * 7.3) * 3.0));
    col = mix(col, vec3(1.0), 0.12);
  }
  if (vPark > 0.5) col = mix(wall, uPal[4], 0.28);

  // Windows: a grid of panes that glow in an accent when the block is hovered.
  float glow = 0.0;
  if (!top && vPark < 0.5) {
    vec2 wp = vec2(vUv.x * vFace.x * 3.0, vW.y * 2.4);
    vec2 fw = fwidth(wp) + 1e-4;
    vec2 f = fract(wp);
    float win = smoothstep(0.28 - fw.x, 0.28 + fw.x, f.x) * smoothstep(0.38 - fw.y, 0.38 + fw.y, f.y);
    win *= step(0.35, vW.y) * step(0.5, vFace.x);
    float lit = step(0.35, h21(floor(wp) + vSeed));
    glow = win * lit * clamp(vHover * 1.6, 0.0, 1.0);
    col = mix(col, col * 0.86, win * 0.25);
  }

  // Flat directional light: tops bright, one side lit, the other in shade.
  float diff = clamp(dot(n, uLight), 0.0, 1.0);
  float shade = top ? 1.0 : 0.68 + 0.3 * diff;
  if (!top) shade *= mix(0.8, 1.0, smoothstep(0.0, 1.4, vW.y)); // ground occlusion
  col *= shade;

  // Hover glow and construction scaffolding.
  col = mix(col, mix(col, vec3(1.0), 0.35), clamp(vHover, 0.0, 1.0) * 0.5);
  col = mix(col, accent(vIdx + 2.0) * 1.15, glow);
  if (vFlash > 0.01) {
    float stripes = step(0.5, fract((vUv.x * vFace.x + vW.y) * 1.6 - uTime * 0.8));
    vec3 site = mix(accent(vIdx + 1.0), uPal[1], stripes * 0.35);
    col = mix(col, site, clamp(vFlash, 0.0, 1.0) * 0.75);
  }

  // Ink outlines along every box edge, constant width on screen.
  vec2 fu = fwidth(vUv) + 1e-5;
  vec2 e = min(vUv, 1.0 - vUv) / fu;
  float line = 1.0 - smoothstep(0.4, 1.4, min(e.x, e.y));
  col = mix(col, uPal[1], line * uOutline * 0.85);

  gl_FragColor = vec4(col, 1.0);
}
`;

// Ground: streets with dashed traffic running along the avenues.
const groundVertex = /* glsl */ `
varying vec2 vXZ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vXZ = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const groundFragment = /* glsl */ `
uniform float uTime, uTraffic, uHalf, uOutline;
varying vec2 vXZ;
${COMMON}
float lanes(float across, float along, float idx, float dir) {
  // Two lanes per avenue, dashes of coloured "cars" sliding along.
  float lane = abs(across) - 0.18;
  float inLane = 1.0 - smoothstep(0.05, 0.08, abs(lane));
  float t = along * 0.9 + dir * sign(across) * uTime * uTraffic * 1.4 + h21(vec2(idx, sign(across))) * 7.0;
  float cell = floor(t);
  float car = step(0.55, h21(vec2(cell, idx + sign(across) * 3.0)));
  float f = fract(t);
  return inLane * car * smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.32, 0.4, f));
}
void main() {
  vec3 base = mix(wallTone(), uPal[1], 0.1);
  vec2 g = vXZ + uHalf;               // lot index space
  vec2 id = floor(g + 0.5);
  vec2 local = g - id;
  vec3 col = base;
  float car = 0.0, carIdx = 0.0;
  if (abs(mod(id.x, ${AVE_X}.0) - 3.0) < 0.5) {
    float c = lanes(local.x, g.y, id.x, 1.0);
    if (c > car) { car = c; carIdx = floor(g.y * 0.9) + id.x; }
    col = mix(col, uPal[1], (1.0 - smoothstep(0.0, 0.02, abs(local.x))) * 0.25 * uOutline);
  }
  if (abs(mod(id.y, ${AVE_Z}.0) - 3.0) < 0.5) {
    float c = lanes(local.y, g.x, id.y + 50.0, -1.0);
    if (c > car) { car = c; carIdx = floor(g.x * 0.9) + id.y; }
    col = mix(col, uPal[1], (1.0 - smoothstep(0.0, 0.02, abs(local.y))) * 0.25 * uOutline);
  }
  col = mix(col, accent(h21(vec2(carIdx, 3.0)) * 4.0), car * clamp(uTraffic, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

// Small seeded value noise for district maps.
function makeNoise(rand) {
  const seed = Math.floor(rand() * 1e9);
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = sm(x - xi), v = sm(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y) => vn(x, y) * 0.6 + vn(x * 2.1 + 17, y * 2.1 - 9) * 0.3 + vn(x * 4.3 - 3, y * 4.3 + 31) * 0.1;
}

export default {
  id: 'isocity',
  name: 'Iso City',
  engine: 'three',
  hint: 'Hover to raise the blocks, click for a construction burst',
  params,
  controls: {
    essentials: ['height', 'colour', 'towers', 'density'],
    groups: { City: ['grid', 'outline', 'traffic'], Camera: ['spin', 'tilt', 'zoom'], Interaction: ['lift'] },
  },
  create(ctx) {
    const P = ctx.params;
    const stage = createThreeStage(ctx, { ortho: true });
    const cam = stage.camera;
    cam.near = 1; cam.far = 600;
    const rand = ctx.rand;
    const noise = makeNoise(rand);

    // ---- Lots ----
    const N = P.grid;
    const half = (N - 1) / 2;
    const lots = [];
    // One or two downtown cores pull the heights up.
    const cores = [[rand.range(-0.2, 0.2), rand.range(-0.2, 0.2), 0.09], [rand.range(-0.4, 0.4), rand.range(-0.4, 0.4), 0.04]];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i % AVE_X === 3 || j % AVE_Z === 3) continue; // avenues
        const u = i / N - 0.5, v = j / N - 0.5;
        let core = 0;
        for (const [cx, cz, r] of cores) core = Math.max(core, Math.exp(-((u - cx) ** 2 + (v - cz) ** 2) / r));
        const n1 = noise(i * 0.13 + 3, j * 0.13 + 7);
        let h = 0.12 + 0.55 * core * (0.6 + 0.6 * rand()) + 0.45 * n1 * n1 + 0.25 * rand() ** 4;
        h = Math.min(1, h);
        const cd = Math.max(0, Math.min(1, (noise(i * 0.09 + 41, j * 0.09 - 13) - 0.42) / 0.25));
        const idx = Math.floor(noise(i * 0.06 - 70, j * 0.06 + 5) * 7) % 4;
        lots.push({
          x: i - half, z: j - half,
          fx: 0.62 + rand() * 0.3, fz: 0.62 + rand() * 0.3, h,
          r: [rand(), rand(), rand(), rand()],
          cd, idx,
        });
      }
    }
    const count = lots.length * 2;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry().copy(box);
    box.dispose();
    geo.instanceCount = count;
    const aCell = new Float32Array(count * 2), aFoot = new Float32Array(count * 3);
    const aRnd = new Float32Array(count * 4), aDist = new Float32Array(count * 3);
    lots.forEach((L, k) => {
      for (let part = 0; part < 2; part++) {
        const q = k * 2 + part;
        aCell.set([L.x, L.z], q * 2);
        aFoot.set([L.fx, L.fz, L.h], q * 3);
        aRnd.set(L.r, q * 4);
        aDist.set([L.cd, L.idx, part], q * 3);
      }
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 2));
    geo.setAttribute('aFoot', new THREE.InstancedBufferAttribute(aFoot, 3));
    geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(aRnd, 4));
    geo.setAttribute('aDist', new THREE.InstancedBufferAttribute(aDist, 3));

    const pal = { value: paletteUniform(ctx.state.colors) };
    const uniforms = {
      uTime: { value: 0 }, uMaxH: { value: 7 }, uTower: { value: 0 }, uDensity: { value: 1 },
      uColour: { value: 0.4 }, uLift: { value: 1 }, uOutline: { value: 0.75 },
      uMouse: { value: new THREE.Vector3(0, 0, 0) },
      uBurst: { value: Array.from({ length: BURSTS }, () => new THREE.Vector4(0, 0, -100, 0)) },
      uLight: { value: new THREE.Vector3(0, 1, 0) },
      uPal: pal,
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms });
    const city = new THREE.Mesh(geo, mat);
    city.frustumCulled = false;
    stage.scene.add(city);

    const gUniforms = {
      uTime: uniforms.uTime, uTraffic: { value: 1 }, uHalf: { value: half }, uOutline: uniforms.uOutline, uPal: pal,
    };
    const groundGeo = new THREE.PlaneGeometry(N, N);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.ShaderMaterial({
      vertexShader: groundVertex, fragmentShader: groundFragment, uniforms: gUniforms,
    }));
    ground.position.y = -0.01;
    stage.scene.add(ground);

    // ---- Interaction ----
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const mouse = { x: 0, z: 0, amt: 0 };
    let az = Math.PI / 4 + rand.range(-0.3, 0.3), burstIdx = 0;

    const resize = (w, h, dpr) => {
      stage.resize(w, h, dpr);
      fitCamera();
    };
    function fitCamera() {
      const { w, h } = stage.size;
      const aspect = w / h;
      // Fill the poster: the visible height shrinks for wide formats so the city still covers it.
      const viewH = (0.5 * N) / Math.max(1, aspect * 0.75) / P.zoom;
      cam.left = -viewH * aspect / 2; cam.right = viewH * aspect / 2;
      cam.top = viewH / 2; cam.bottom = -viewH / 2;
      cam.updateProjectionMatrix();
    }

    return {
      resize,
      frame(time, dt) {
        const u = uniforms;
        u.uTime.value = time;
        u.uMaxH.value = P.height; u.uTower.value = P.towers; u.uDensity.value = P.density;
        u.uColour.value = P.colour; u.uLift.value = P.lift; u.uOutline.value = P.outline;
        gUniforms.uTraffic.value = P.traffic;
        pal.value = paletteUniform(ctx.state.colors);

        // Isometric orbit around the city.
        az += dt * P.spin;
        const el = (P.tilt * Math.PI) / 180;
        const R = 200, ty = P.height * 0.22;
        cam.position.set(Math.sin(az) * Math.cos(el) * R, ty + Math.sin(el) * R, Math.cos(az) * Math.cos(el) * R);
        cam.lookAt(0, ty, 0);
        if (cam.userData.zoom !== P.zoom) { cam.userData.zoom = P.zoom; fitCamera(); }
        // Light follows the camera so the left faces are always the lit ones.
        const rx = Math.cos(az), rz = -Math.sin(az), fx = Math.sin(az), fz = Math.cos(az);
        u.uLight.value.set(-0.75 * rx + 0.3 * fx, 0.6, -0.75 * rz + 0.3 * fz).normalize();

        // Cursor on a plane a little above the street, so it tracks the building mass.
        const pow = ctx.state.motion.mouse;
        let target = 0;
        if (ctx.pointer.inside && pow > 0) {
          plane.constant = -P.height * 0.2;
          ray.setFromCamera(pointerNDC(ctx), cam);
          if (ray.ray.intersectPlane(plane, hit)) {
            const k = mouse.amt < 0.02 ? 1 : Math.min(1, dt * 12);
            mouse.x += (hit.x - mouse.x) * k;
            mouse.z += (hit.z - mouse.z) * k;
            target = Math.min(pow, 2);
            if (ctx.pointer.justPressed) {
              u.uBurst.value[burstIdx].set(hit.x, hit.z, time, Math.min(pow, 2));
              burstIdx = (burstIdx + 1) % BURSTS;
            }
          }
        }
        mouse.amt += (target - mouse.amt) * Math.min(1, dt * 5);
        u.uMouse.value.set(mouse.x, mouse.z, mouse.amt);
        stage.render(time);
      },
      dispose: stage.dispose,
    };
  },
};
