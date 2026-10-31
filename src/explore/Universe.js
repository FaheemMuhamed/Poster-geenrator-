// The Explore universe: example posters as one THREE.Points cloud.
// Each point is a poster: its atlas cell comes from `aTex`, and the vertex shader sizes it
// by distance (gl_PointSize = size * 300 / -z), like the reference.
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aTex;
  attribute float aLift;   // 0..1 hover lift (eased in JS)
  attribute float aDim;    // 0..1 filtered out (eased in JS)
  attribute float aAspect; // poster width / height
  uniform float uPx;
  uniform float uMaxPoint;
  varying float vTex;
  varying float vLift;
  varying float vDim;
  varying float vDepth;
  varying float vAspect;
  void main() {
    vTex = aTex; vLift = aLift; vDim = aDim; vAspect = aAspect;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_PointSize = min(aSize * (1.0 + aLift * 0.28) * uPx * (300.0 / -mv.z), uMaxPoint);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec2 uGrid;        // cols, rows
  uniform vec3 uFog;
  uniform vec2 uFogRange;    // near, far
  varying float vTex;
  varying float vLift;
  varying float vDim;
  varying float vDepth;
  varying float vAspect;
  float roundedBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    // The point sprite and the atlas cell are both square, with the poster centred in
    // each at its own aspect, so the sprite coordinate is the cell coordinate.
    vec2 p = gl_PointCoord - 0.5;
    vec2 box = vAspect >= 1.0 ? vec2(0.5, 0.5 / vAspect) : vec2(0.5 * vAspect, 0.5);
    float d = roundedBox(p, box, 0.012);
    if (d > 0.0) discard;
    vec2 uv = p + 0.5;
    float col = mod(vTex, uGrid.x), row = floor(vTex / uGrid.x);
    vec3 c = texture2D(uAtlas, (vec2(col, row) + uv) / uGrid).rgb;
    // Hairline edge so light posters separate from the fog.
    c = mix(c, c * 0.82, smoothstep(-0.006, 0.0, d) * (1.0 - vLift));
    float fog = smoothstep(uFogRange.x, uFogRange.y, vDepth);
    c = mix(c, uFog, fog * 0.6 * (1.0 - vLift));
    c = mix(c, uFog, vDim * 0.88);
    gl_FragColor = vec4(c, 1.0);
  }
`;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hexToVec = (hex) => new THREE.Color(hex);

export function createUniverse(container, data, atlasUrl, opts) {
  const { onHover, onSelect, reducedMotion } = opts;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';

  const FOG = opts.fog || '#e9e9e6';
  renderer.setClearColor(FOG, 0); // transparent: the CSS glow behind shows through
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

  // ---------- Layout: a loose three-armed galaxy, tilted toward the viewer ----------
  const ex = data.examples;
  const n = ex.length;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), tex = new Float32Array(n);
  const lift = new Float32Array(n), dim = new Float32Array(n), aspect = new Float32Array(n);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const t = Math.sqrt((i + 0.5) / n);
    const arm = i % 3;
    const a = arm * (Math.PI * 2 / 3) + t * 4.2 + (rnd() - 0.5) * 0.5;
    const r = 1.6 + t * 10 + (rnd() - 0.5) * 1.2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = (rnd() - 0.5) * (2.6 - t * 1.4);
    pos[i * 3 + 2] = Math.sin(a) * r;
    size[i] = 2.6 + rnd() * 1.6;
    tex[i] = ex[i].cell;
    aspect[i] = ex[i].aspect || 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aTex', new THREE.BufferAttribute(tex, 1));
  geo.setAttribute('aLift', new THREE.BufferAttribute(lift, 1));
  geo.setAttribute('aDim', new THREE.BufferAttribute(dim, 1));
  geo.setAttribute('aAspect', new THREE.BufferAttribute(aspect, 1));

  const atlas = new THREE.TextureLoader().load(atlasUrl, () => { ready = true; });
  atlas.flipY = false;
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.anisotropy = 4;
  const uniforms = {
    uAtlas: { value: atlas },
    uGrid: { value: new THREE.Vector2(data.cols, data.rows) },
    uPx: { value: renderer.getPixelRatio() },
    // GPUs cap point sprites (often 511 px), so posters can't grow past this.
    uMaxPoint: { value: renderer.getContext().getParameter(renderer.getContext().ALIASED_POINT_SIZE_RANGE)[1] },
    uFog: { value: hexToVec(FOG) },
    uFogRange: { value: new THREE.Vector2(13, 34) },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
  const points = new THREE.Points(geo, mat);
  points.rotation.x = 0.32;
  scene.add(points);
  let ready = false;

  // ---------- Camera rig: orbit around a target, with inertia ----------
  const rig = { theta: 0.6, phi: 0.18, dist: 14, target: new THREE.Vector3() };
  const vel = { theta: 0, phi: 0 };
  let fly = null; // { from, to, start, dur }
  const home = { dist: 14, target: new THREE.Vector3() };
  const pointer = { x: 0, y: 0, nx: 0, ny: 0, down: false, moved: 0, lastX: 0, lastY: 0 };
  let width = 1, height = 1;
  let hovered = -1, selected = -1, filter = () => true;

  function resize() {
    width = container.clientWidth; height = container.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Smaller screens: posters a little smaller so the cloud still reads as a cloud.
    uniforms.uPx.value = renderer.getPixelRatio() * (width < 600 ? 0.75 : 1);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // World position of a poster (points are rotated as a group).
  const world = (i, out = new THREE.Vector3()) => out.fromArray(pos, i * 3).applyMatrix4(points.matrixWorld);

  // On-screen size of a poster in CSS px: the same formula and cap as the vertex shader.
  const pointPx = (i, depth) =>
    Math.min(size[i] * (1 + lift[i] * 0.28) * uniforms.uPx.value * (300 / depth), uniforms.uMaxPoint.value) / renderer.getPixelRatio();

  // Screen-space hit test, matching the shader's point size and poster aspect.
  const v = new THREE.Vector3();
  function pick(cx, cy) {
    let best = -1, bestZ = Infinity;
    for (let i = 0; i < n; i++) {
      if (dim[i] > 0.5) continue;
      world(i, v);
      const z = v.clone().applyMatrix4(camera.matrixWorldInverse).z;
      if (z > -0.1) continue;
      v.project(camera);
      const sx = (v.x * 0.5 + 0.5) * width, sy = (-v.y * 0.5 + 0.5) * height;
      const px = pointPx(i, -z);
      const hw = px * 0.5 * Math.min(1, aspect[i]), hh = px * 0.5 / Math.max(1, aspect[i]);
      if (Math.abs(cx - sx) < hw && Math.abs(cy - sy) < hh && -z < bestZ) { best = i; bestZ = -z; }
    }
    return best;
  }

  function screenOf(i) {
    world(i, v);
    const z = -v.clone().applyMatrix4(camera.matrixWorldInverse).z;
    v.project(camera);
    const px = pointPx(i, z);
    return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, h: px / Math.max(1, aspect[i]) };
  }

  // ---------- Input ----------
  const el = renderer.domElement;
  const ctl = new AbortController();
  const on = { signal: ctl.signal };
  const local = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  el.addEventListener('pointerdown', (e) => {
    [pointer.lastX, pointer.lastY] = local(e);
    pointer.down = true; pointer.moved = 0;
    el.setPointerCapture(e.pointerId);
  }, on);
  el.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    pointer.x = x; pointer.y = y;
    pointer.nx = x / width - 0.5; pointer.ny = y / height - 0.5;
    if (pointer.down && selected < 0) {
      const dx = x - pointer.lastX, dy = y - pointer.lastY;
      pointer.moved += Math.abs(dx) + Math.abs(dy);
      vel.theta = -dx * 0.004; vel.phi = dy * 0.003;
      pointer.lastX = x; pointer.lastY = y;
    }
  }, on);
  el.addEventListener('pointerup', (e) => {
    pointer.down = false;
    if (pointer.moved < 6) {
      const [x, y] = local(e);
      const i = pick(x, y);
      if (i >= 0) select(i); else if (selected >= 0) select(-1);
    }
  }, on);
  el.addEventListener('pointerleave', () => { pointer.x = -1e4; }, on);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (selected >= 0) return;
    rig.dist = THREE.MathUtils.clamp(rig.dist * Math.exp(e.deltaY * 0.0012), 5, 34);
  }, { passive: false, signal: ctl.signal });

  function flyTo(target, dist, dur = 900) {
    fly = { fromT: rig.target.clone(), toT: target.clone(), fromD: rig.dist, toD: dist, start: performance.now(), dur: reducedMotion ? 1 : dur };
  }

  function select(i) {
    selected = i;
    if (i >= 0) flyTo(world(i), 4.2);
    else flyTo(home.target, home.dist, 700);
    onSelect?.(i >= 0 ? ex[i] : null);
  }

  // ---------- Loop ----------
  let raf = 0, last = performance.now(), shift = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Hover
    const h = pointer.down ? hovered : pick(pointer.x, pointer.y);
    if (h !== hovered) { hovered = h; onHover?.(h >= 0 ? ex[h] : null); el.style.cursor = h >= 0 ? 'pointer' : 'grab'; }

    // Ease per-poster lift and dimming (≈150 ms hover response)
    for (let i = 0; i < n; i++) {
      const lt = i === hovered || i === selected ? 1 : 0;
      lift[i] += (lt - lift[i]) * Math.min(1, dt * 14);
      const dmt = filter(ex[i]) ? 0 : 1;
      dim[i] += (dmt - dim[i]) * Math.min(1, dt * 6);
    }
    geo.attributes.aLift.needsUpdate = true;
    geo.attributes.aDim.needsUpdate = true;

    // Camera: fly-to animation, else inertia + slow ambient drift
    if (fly) {
      const t = Math.min(1, (now - fly.start) / fly.dur);
      const k = easeInOut(t);
      rig.target.lerpVectors(fly.fromT, fly.toT, k);
      rig.dist = fly.fromD + (fly.toD - fly.fromD) * k;
      if (t >= 1) fly = null;
    } else if (selected < 0) {
      rig.theta += vel.theta + (reducedMotion || pointer.down || hovered >= 0 ? 0 : dt * 0.035);
      rig.phi = THREE.MathUtils.clamp(rig.phi + vel.phi, -0.6, 0.9);
      vel.theta *= 0.92; vel.phi *= 0.92;
    }
    // Gentle parallax toward the cursor
    const par = selected >= 0 ? 0.02 : 0.08;
    const th = rig.theta + pointer.nx * par, ph = rig.phi - pointer.ny * par * 0.6;
    camera.position.set(
      rig.target.x + rig.dist * Math.cos(ph) * Math.sin(th),
      rig.target.y + rig.dist * Math.sin(ph),
      rig.target.z + rig.dist * Math.cos(ph) * Math.cos(th),
    );
    camera.lookAt(rig.target);

    // While a poster is open, frame it in the space left of the detail panel (380 px wide).
    const panel = width >= 640 ? 380 : 0;
    shift += ((selected >= 0 ? panel / 2 : 0) - shift) * Math.min(1, dt * 6);
    if (Math.abs(shift) > 0.5) camera.setViewOffset(width, height, shift, 0, width, height);
    else camera.clearViewOffset();

    if (ready) renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setFilter(fn) { filter = fn || (() => true); },
    // Posters fade into the page colour, so it follows the light/dark theme.
    setFog(hex) { uniforms.uFog.value = hexToVec(hex); },
    select,
    screenOf,
    get hovered() { return hovered; },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ctl.abort();
      geo.dispose(); mat.dispose(); atlas.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
