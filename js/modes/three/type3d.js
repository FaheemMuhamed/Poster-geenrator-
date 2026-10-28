// Type in Space: the title as extruded 3D letters, the other text lines floating on planes at
// different depths. Move for parallax, drag to orbit, click to scatter the letters.
import { createThreeStage, paletteUniform, pointerNDC, THREE } from '../../shared/threeStage.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { PALETTE_GLSL } from '../../shaders/noise.glsl.js';
import { fontCss } from '../../shared/typeLayer.js';

const FONT_BASE = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/';
const FONTS = {
  'Helvetiker': 'helvetiker_bold.typeface.json',
  'Optimer': 'optimer_bold.typeface.json',
  'Gentilis': 'gentilis_bold.typeface.json',
  'Droid Sans': 'droid/droid_sans_bold.typeface.json',
  'Droid Serif': 'droid/droid_serif_bold.typeface.json',
};
const MATERIALS = ['Ink + accent sides', 'Palette gradient', 'Wireframe', 'Iridescent'];

const params = {
  font:     { value: 'Helvetiker', options: Object.keys(FONTS), label: 'Font' },
  material: { value: 'Ink + accent sides', options: MATERIALS, label: 'Material' },
  depth:    { value: 0.35, min: 0.02, max: 1.5, step: 0.01, label: 'Depth' },
  bevel:    { value: 0.03, min: 0, max: 0.1, step: 0.001, label: 'Bevel' },
  spacing:  { value: 0.02, min: -0.2, max: 0.6, step: 0.01, label: 'Letter spacing' },
  scale:    { value: 1, min: 0.3, max: 1.6, step: 0.01, label: 'Text scale' },
  float:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Float amount' },
  scatter:  { value: 1.5, min: 0, max: 4, step: 0.01, label: 'Scatter' },
  shift:    { value: 0, min: 0, max: 1, step: 0.01, label: 'Colour shift' },
  backdrop: { value: true, label: 'Backdrop blobs' },
};

// Fonts are cached across rebuilds so changing a slider never re-downloads them.
const fontCache = new Map();
function loadTypeface(name) {
  const url = FONT_BASE + (FONTS[name] || FONTS.Helvetiker);
  if (!fontCache.has(url)) fontCache.set(url, new FontLoader().loadAsync(url));
  return fontCache.get(url);
}

const letterVertex = /* glsl */ `
varying vec3 vN, vObjN, vWPos;
void main() {
  vObjN = normal;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const letterFragment = /* glsl */ `
uniform int uMat;
uniform float uShift, uTime;
varying vec3 vN, vObjN, vWPos;
${PALETTE_GLSL}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vWPos);
  vec3 L = normalize(vec3(-0.4, 0.7, 0.8));
  float diff = max(dot(n, L), 0.0);
  float fres = 1.0 - clamp(dot(n, v), 0.0, 1.0);
  float face = smoothstep(0.4, 0.95, abs(vObjN.z)); // 1 on the front/back caps, 0 on the sides
  vec3 ink = uPal[1];
  vec3 col;
  if (uMat == 0) {
    vec3 side = paletteRamp(uShift) * (0.55 + 0.5 * diff);
    col = mix(side, ink, face);
  } else if (uMat == 1) {
    vec3 g = paletteRamp(uShift + vWPos.x * 0.09 + vWPos.y * 0.16 + uTime * 0.02);
    col = g * mix(0.6 + 0.45 * diff, 1.0, face);
  } else if (uMat == 2) {
    col = ink;
  } else {
    col = paletteRamp(uShift + fres * 1.1 + n.x * 0.25 + n.y * 0.2) * (0.7 + 0.4 * diff);
    col += pow(max(dot(reflect(-L, n), v), 0.0), 40.0) * 0.6;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// Soft round gradient used for the backdrop blobs and dust.
const blobFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  gl_FragColor = vec4(uColor, pow(smoothstep(1.0, 0.0, d), 1.6) * uAlpha);
}
`;
const blobVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// Secondary text lines: where they sit (screen corner), how deep, and how big.
const LABELS = [
  { key: 'subtitle', ax: 0, ay: 0, z: 1.2, size: 1.3 },
  { key: 'date',     ax: 1, ay: 0, z: -1.6, size: 1.3 },
  { key: 'venue',    ax: 0, ay: 1, z: 0.5, size: 1.05 },
  { key: 'footer',   ax: 1, ay: 1, z: -0.7, size: 1.05 },
];

export default {
  id: 'type3d',
  name: 'Type in Space',
  engine: 'three',
  ownsText: true,
  hint: 'Drag to orbit, click to scatter the letters',
  params,
  create(ctx) {
    const P = ctx.params;
    const r = ctx.rand;
    const stage = createThreeStage(ctx, { orbit: true, fov: 30, cameraZ: 10 });
    const { camera } = stage;
    stage.controls.enableZoom = true;

    // Everything hangs off a rig that tilts toward the cursor for parallax.
    const rig = new THREE.Group();
    stage.scene.add(rig);
    const titleGroup = new THREE.Group();
    rig.add(titleGroup);

    const pal = () => paletteUniform(ctx.state.colors);
    const letterMat = new THREE.ShaderMaterial({
      vertexShader: letterVertex, fragmentShader: letterFragment,
      uniforms: { uMat: { value: 0 }, uShift: { value: 0 }, uTime: { value: 0 }, uPal: { value: pal() } },
    });

    // ---- Backdrop: big soft palette blobs far behind, plus a little dust ----
    const backdrop = new THREE.Group();
    rig.add(backdrop);
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    const blobs = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: blobVertex, fragmentShader: blobFragment, transparent: true, depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0.8 } },
      });
      const m = new THREE.Mesh(blobGeo, mat);
      m.renderOrder = -2;
      blobs.push({ mesh: m, key: ['c1', 'c2', 'c3', 'c4'][i], x: r.range(-2.5, 2.5), y: r.range(-3, 3),
        z: r.range(-7, -3.5), s: r.range(3.5, 6.5), ph: r() * 6.28 });
      backdrop.add(m);
    }
    const dustN = 260;
    const dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) dustPos.set([r.range(-5, 5), r.range(-6, 6), r.range(-6, 3)], i * 3);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color() }, uPx: { value: 1 } },
      vertexShader: /* glsl */ `uniform float uPx; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * 22.0 / -mv.z; }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, 0.55 * smoothstep(0.5, 0.3, d)); }`,
    });
    backdrop.add(new THREE.Points(dustGeo, dustMat));

    // ---- Title: one mesh per letter so each can fly independently ----
    let letters = [];
    let blockW = 1, blockH = 1, buildToken = 0, titleDirty = true, lastBuild = -1;

    function splitTitle(str) {
      const lines = String(str || '').split(/\\n|\n/).map((s) => s.trim()).filter(Boolean);
      // Long single-line titles wrap at the space closest to the middle.
      if (lines.length === 1 && lines[0].length > 13 && lines[0].includes(' ')) {
        const s = lines[0], mid = s.length / 2;
        let best = -1;
        for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
        return [s.slice(0, best), s.slice(best + 1)];
      }
      return lines;
    }

    async function buildTitle() {
      const token = ++buildToken;
      let font;
      try { font = await loadTypeface(P.font); } catch (e) { console.warn('Font failed to load', e); return; }
      if (token !== buildToken || disposed) return;
      for (const l of letters) { titleGroup.remove(l.mesh); l.mesh.geometry.dispose(); }
      letters = [];

      const res = font.data.resolution, glyphs = font.data.glyphs;
      const lines = splitTitle(ctx.state.text.lines.title);
      const lineH = 1.12;
      const geoOpts = {
        font, size: 1, depth: P.depth, curveSegments: 7,
        bevelEnabled: P.bevel > 0, bevelThickness: P.bevel * 1.2, bevelSize: P.bevel, bevelSegments: 3,
      };
      blockW = 0.01;
      lines.forEach((line, li) => {
        const row = [];
        let pen = 0;
        for (const ch of line) {
          const g = glyphs[ch] || glyphs['?'];
          const adv = (g ? g.ha / res : 0.3) + P.spacing;
          if (ch.trim() && g) {
            const geo = new TextGeometry(ch, geoOpts);
            geo.computeBoundingBox();
            const c = geo.boundingBox.getCenter(new THREE.Vector3());
            geo.translate(-c.x, -c.y, -c.z);
            const mesh = new THREE.Mesh(geo, letterMat);
            row.push({ mesh, home: new THREE.Vector3(pen + c.x, -li * lineH + c.y, 0) });
          }
          pen += adv;
        }
        const w = pen - P.spacing;
        blockW = Math.max(blockW, w);
        for (const l of row) l.home.x -= w / 2; // centre each line
        letters.push(...row);
      });
      blockH = lines.length * lineH;
      const yOff = ((lines.length - 1) * lineH) / 2 - 0.36; // centre the block vertically
      letters.forEach((l, i) => {
        l.home.y += yOff;
        l.i = i;
        l.dir = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-0.2, 1.4)).normalize();
        l.axis = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        l.spin = r.range(1.5, 4) * (r() < 0.5 ? -1 : 1);
        l.dist = r.range(0.6, 1.4);
        l.mesh.position.copy(l.home);
        titleGroup.add(l.mesh);
      });
    }

    // ---- Secondary lines as canvas-texture planes ----
    const labelGeo = new THREE.PlaneGeometry(1, 1);
    const labels = LABELS.map((def) => {
      const canvas = document.createElement('canvas');
      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = 4;
      const mesh = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      mesh.renderOrder = 2;
      rig.add(mesh);
      return { ...def, canvas, tex, mesh, aspect: 1 };
    });

    function drawLabels() {
      const T = ctx.state.text;
      const px = 72;
      for (const l of labels) {
        const str = String(T.lines[l.key] || '').replace(/\\n|\n/g, '  ');
        const c2 = l.canvas.getContext('2d');
        c2.font = fontCss(T, px, 400);
        const w = Math.max(4, Math.ceil(c2.measureText(str).width) + 8);
        const h = Math.ceil(px * 1.3);
        l.canvas.width = w; l.canvas.height = h;
        c2.font = fontCss(T, px, 400); // resizing a canvas resets its state
        c2.fillStyle = ctx.state.colors[T.color] || ctx.state.colors.ink;
        c2.textBaseline = 'middle';
        c2.fillText(str, 4, h / 2);
        l.aspect = w / h;
        l.empty = !str;
        l.tex.dispose(); // canvas size changed: let three re-upload a fresh texture
        l.tex.needsUpdate = true;
      }
    }
    drawLabels();
    document.fonts?.ready.then(() => !disposed && drawLabels());

    // Places each label so that, seen from the resting camera, it sits in its corner.
    function layoutLabels(camDist) {
      const aspect = stage.size.w / stage.size.h;
      const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const k = ctx.state.text.size;
      for (const l of labels) {
        const halfH = tanH * (camDist - l.z), halfW = halfH * aspect;
        const m = halfW * 2 * 0.05;
        const h = halfW * 2 * 0.026 * k * l.size * 1.3;
        const w = h * l.aspect;
        const x = l.ax === 0 ? -halfW + m + w / 2 : halfW - m - w / 2;
        const y = l.ay === 0 ? halfH - m - h / 2 : -halfH + m + h / 2;
        l.mesh.position.set(x, y, l.z);
        l.mesh.scale.set(w, h, 1);
        l.mesh.visible = ctx.state.text.show && !l.empty;
      }
    }

    // ---- Interaction state ----
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3(99, 99, 0);
    const q = new THREE.Quaternion();
    let scatterAt = -10, tiltX = 0, tiltY = 0, disposed = false;

    // 0 -> burst out -> springs back home with a little overshoot.
    function scatterAmount(age) {
      if (age < 0 || age > 4) return 0;
      if (age < 0.4) { const t = age / 0.4; return 1 - (1 - t) ** 3; }
      const k = (age - 0.4) / 1.8;
      return Math.cos(k * Math.PI * 1.4) * Math.exp(-k * 3.2);
    }

    return {
      resize: stage.resize,
      onParam(key) {
        if (['text', 'font', 'depth', 'bevel', 'spacing'].includes(key)) titleDirty = true;
        if (key === 'text' || key === 'palette') drawLabels();
      },
      frame(time, dt) {
        // Rebuild the title at most ~8 times a second while sliders are dragged.
        if (titleDirty && performance.now() - lastBuild > 120) {
          titleDirty = false; lastBuild = performance.now();
          buildTitle();
        }
        const colors = ctx.state.colors;
        const u = letterMat.uniforms;
        u.uPal.value = pal(); u.uShift.value = P.shift; u.uTime.value = time;
        u.uMat.value = Math.max(0, MATERIALS.indexOf(P.material));
        letterMat.wireframe = P.material === 'Wireframe';

        // Fit the title block to ~84% of the poster width (and not too tall).
        const camDist = 10;
        const visH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camDist;
        const visW = visH * (stage.size.w / stage.size.h);
        const fit = Math.min((visW * 0.84) / blockW, (visH * 0.42) / blockH) * P.scale;
        titleGroup.scale.setScalar(fit);
        layoutLabels(camDist);

        // Parallax: the whole rig leans toward the cursor.
        const mp = ctx.state.motion.mouse;
        const px = ctx.pointer.inside ? ctx.pointer.x - 0.5 : 0, py = ctx.pointer.inside ? ctx.pointer.y - 0.5 : 0;
        const e = Math.min(1, dt * 3);
        tiltY += (px * 0.35 * mp - tiltY) * e;
        tiltX += (py * 0.25 * mp - tiltX) * e;
        rig.rotation.set(tiltX, tiltY, 0);

        // Cursor position in title space, for the hover lift.
        if (ctx.pointer.inside) {
          ray.setFromCamera(pointerNDC(ctx), camera);
          if (ray.ray.intersectPlane(plane, hit)) titleGroup.worldToLocal(hit);
        } else hit.set(99, 99, 0);
        if (ctx.pointer.justPressed && P.scatter > 0) {
          scatterAt = scatterAmount(time - scatterAt) > 0.3 ? scatterAt : time;
        }
        const amt = scatterAmount(time - scatterAt) * P.scatter;

        for (const l of letters) {
          const m = l.mesh, f = P.float;
          const bob = Math.sin(time * 0.9 + l.i * 0.55);
          const near = Math.exp(-((hit.x - l.home.x) ** 2 + (hit.y - l.home.y) ** 2) * 1.2) * mp;
          m.position.copy(l.home).addScaledVector(l.dir, amt * l.dist * 2);
          m.position.y += bob * 0.06 * f;
          m.position.z += near * 0.45;
          m.rotation.set(Math.sin(time * 0.7 + l.i) * 0.07 * f - near * 0.25, Math.cos(time * 0.6 + l.i * 1.3) * 0.12 * f, 0);
          if (amt !== 0) m.quaternion.multiply(q.setFromAxisAngle(l.axis, amt * l.spin));
        }

        // Backdrop colours follow the palette; blobs drift slowly.
        backdrop.visible = P.backdrop;
        for (const b of blobs) {
          b.mesh.material.uniforms.uColor.value.set(colors[b.key]);
          b.mesh.position.set(b.x + Math.sin(time * 0.12 + b.ph) * 0.6, b.y + Math.cos(time * 0.1 + b.ph) * 0.5, b.z);
          b.mesh.scale.setScalar(b.s);
        }
        dustMat.uniforms.uColor.value.set(colors.ink);
        dustMat.uniforms.uPx.value = stage.size.dpr;

        stage.render(time);
      },
      dispose() {
        disposed = true;
        buildToken++;
        for (const l of labels) l.tex.dispose();
        stage.dispose();
      },
    };
  },
};
