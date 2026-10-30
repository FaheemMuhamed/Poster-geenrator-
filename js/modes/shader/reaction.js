// Reaction-Diffusion: a Gray–Scott simulation (two chemicals A and B) run on the GPU
// in a ping-pong pair of float textures, then shaded with the palette and a soft emboss.
// Move to paint chemical B (or hold, see "Paint"), click to drop a big seed.
import { createThreeStage, THREE } from '../../shared/threeStage.js';
import { shaderHeader, commonUniforms, updateCommonUniforms, FS_VERT } from '../../shared/fullscreenShader.js';
import { NOISE } from '../../shaders/noise.glsl.js';
import { fontCss } from '../../shared/typeLayer.js';

// Classic feed / kill rates (with diffusion A = 1.0, B = 0.5).
const PRESETS = {
  Coral:       [0.0545, 0.062],
  Fingerprint: [0.037, 0.06],
  Mitosis:     [0.0367, 0.0649],
  Maze:        [0.029, 0.057],
  Spots:       [0.03, 0.062],
  Worms:       [0.078, 0.061],
};

const params = {
  preset:    { value: 'Coral', options: [...Object.keys(PRESETS), 'Custom'], label: 'Pattern' },
  feed:      { value: 0.0545, min: 0.01, max: 0.1, step: 0.0005, label: 'Feed (Custom)' },
  kill:      { value: 0.062, min: 0.045, max: 0.07, step: 0.0005, label: 'Kill (Custom)' },
  steps:     { value: 12, min: 4, max: 20, step: 1, label: 'Speed' },
  quality:   { value: '512', options: ['256', '512', '768'], rebuild: true, noShuffle: true, label: 'Detail' },
  blobs:     { value: 14, min: 0, max: 60, step: 1, rebuild: true, label: 'Seed count' },
  seedTitle: { value: true, rebuild: true, label: 'Seed from title' },
  imprint:   { value: 0.5, min: 0, max: 1, step: 0.01, label: 'Title imprint' },
  drift:     { value: 0.3, min: 0, max: 1, step: 0.01, label: 'Drift amount' },
  paint:     { value: 'Hover', options: ['Hover', 'Hold'], label: 'Paint mode' },
  brush:     { value: 0.035, min: 0.01, max: 0.15, step: 0.001, label: 'Brush size' },
  spread:    { value: 1, min: 0, max: 3, step: 0.01, label: 'Colour spread' },
  emboss:    { value: 0.7, min: 0, max: 2, step: 0.01, label: 'Emboss amount' },
  edge:      { value: 0.35, min: 0, max: 1, step: 0.01, label: 'Outline amount' },
};

// One simulation step. R = A, G = B. The seed texture's G channel holds the title mask.
const simFrag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uState, uMask;
uniform vec2 uTexel;
uniform float uFeed, uKill, uDrift, uImprint, uTime, uAspect, uSeed;
uniform vec4 uBrush;  // xy (uv), radius (poster height units), strength
uniform vec4 uDrop;   // xy (uv), radius, active
${NOISE}
void main() {
  vec2 s = texture2D(uState, vUv).xy;
  vec2 lap = -s
    + 0.2 * (texture2D(uState, vUv + vec2(uTexel.x, 0.0)).xy + texture2D(uState, vUv - vec2(uTexel.x, 0.0)).xy
           + texture2D(uState, vUv + vec2(0.0, uTexel.y)).xy + texture2D(uState, vUv - vec2(0.0, uTexel.y)).xy)
    + 0.05 * (texture2D(uState, vUv + uTexel).xy + texture2D(uState, vUv - uTexel).xy
            + texture2D(uState, vUv + vec2(uTexel.x, -uTexel.y)).xy + texture2D(uState, vUv + vec2(-uTexel.x, uTexel.y)).xy);

  // Feed/kill wander slowly across the poster so the pattern never fully settles,
  // and the title mask nudges kill so the letters stay legible as a different texture.
  vec3 q = vec3(vUv * vec2(uAspect, 1.0) * 1.6 + uSeed * 20.0, uTime * 0.04);
  float f = uFeed + uDrift * 0.006 * snoise(q);
  float k = uKill + uDrift * 0.0018 * snoise(q + 11.0) + uImprint * 0.0045 * texture2D(uMask, vUv).g;

  float r = s.x * s.y * s.y;
  vec2 ns = s + vec2(1.0 * lap.x - r + f * (1.0 - s.x),
                     0.5 * lap.y + r - (k + f) * s.y);

  vec2 d = (vUv - uBrush.xy) * vec2(uAspect, 1.0);
  ns.y += (1.0 - smoothstep(uBrush.z * 0.4, uBrush.z, length(d))) * uBrush.w * 0.08;
  d = (vUv - uDrop.xy) * vec2(uAspect, 1.0);
  float drop = (1.0 - smoothstep(uDrop.z * 0.85, uDrop.z, length(d))) * uDrop.w;
  ns = mix(ns, vec2(0.5, 0.5 + 0.2 * hash21(vUv * 999.0)), drop);

  gl_FragColor = vec4(clamp(ns, 0.0, 1.0), 0.0, 1.0);
}
`;

// Fills the state from the seed canvas: R = blobs, G = title.
const initFrag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uMask;
${NOISE}
void main() {
  vec2 m = texture2D(uMask, vUv).rg;
  float b = max(m.r, m.g) * (0.35 + 0.3 * hash21(vUv * 731.0));
  gl_FragColor = vec4(1.0 - b, b, 0.0, 1.0);
}
`;

const displayFrag = /* glsl */ `
uniform sampler2D uState;
uniform vec2 uSimTexel;
float B(vec2 uv) { return texture2D(uState, uv).y; }
void main() {
  float b = B(vUv);
  // Gradient of B for lighting (central differences in sim texels).
  vec2 g = vec2(B(vUv + vec2(uSimTexel.x, 0.0)) - B(vUv - vec2(uSimTexel.x, 0.0)),
                B(vUv + vec2(0.0, uSimTexel.y)) - B(vUv - vec2(0.0, uSimTexel.y)));
  float t = uTime * 0.03;

  // Colour: background, then a palette ramp keyed on concentration + a slow spatial drift.
  float cover = smoothstep(0.12, 0.24, b);
  float tone = b * 2.2 * p_spread + snoise(vec3(vUv * vec2(uAspect, 1.0) * 1.3, t)) * 0.35 * p_spread + vUv.y * 0.35 + uSeed;
  vec3 col = mix(uPal[0], paletteRamp(tone), cover);

  // Emboss: B as a height field lit from the top-left.
  vec3 n = normalize(vec3(-g * p_emboss * 6.0, 1.0));
  vec3 L = normalize(vec3(-0.5, 0.6, 0.65));
  float diff = dot(n, L) - L.z;
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
  col += diff * 0.6 * min(p_emboss, 1.0) + spec * 0.25 * min(p_emboss, 1.0) * cover;

  // Thin ink contour on the pattern's edge.
  float iso = abs(b - 0.18) / max(fwidth(b), 1e-4);
  col = mix(col, uPal[1], (1.0 - smoothstep(0.4, 1.4, iso)) * p_edge);

  // Soft brush halo so painting is visible before the chemistry takes over.
  vec2 dm = (vUv - uMouse) * vec2(uAspect, 1.0);
  col += (1.0 - smoothstep(0.0, p_brush, length(dm))) * uInside * 0.04 * (1.0 - step(0.5, p_paint) * (1.0 - uDown));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// Full float keeps the slow chemistry (Mitosis, Spots) alive; half float is the fallback.
function makeTarget(w, h, type) {
  return new THREE.WebGLRenderTarget(w, h, {
    type, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false, stencilBuffer: false,
  });
}

export default {
  id: 'rd',
  name: 'Reaction-Diffusion',
  engine: 'three',
  hint: 'Move to paint, click to drop a seed',
  params,
  controls: {
    essentials: ['preset', 'steps', 'brush', 'emboss'],
    form: ['feed', 'kill', 'quality', 'blobs', 'edge'],
    motion: ['drift'],
    interaction: ['paint'],
    colour: ['spread'],
    type: ['seedTitle', 'imprint'],
  },
  presets: {
    'Embossed coral': { preset: 'Coral', emboss: 1.3, spread: 1.4, edge: 0.5 },
    'Fine print': { preset: 'Fingerprint', emboss: 0.4, edge: 0.8, spread: 0.6 },
    'Flat maze': { preset: 'Maze', emboss: 0, edge: 0.2, spread: 2 },
  },
  interactions: { hover: 'paints new growth under the cursor', click: 'drops a large seed' },
  create(ctx) {
    const stage = createThreeStage(ctx, { ortho: true, background: false });
    const renderer = stage.renderer;
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Display pass (goes through the stage so post FX still apply).
    const uniforms = { ...commonUniforms(params), uState: { value: null }, uSimTexel: { value: new THREE.Vector2() } };
    const display = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: shaderHeader(params) + displayFrag, uniforms, depthTest: false,
    });
    stage.scene.add(new THREE.Mesh(quadGeo, display));

    // Simulation passes share one off-screen quad.
    const maskTex = new THREE.CanvasTexture(document.createElement('canvas'));
    const simU = {
      uState: { value: null }, uMask: { value: maskTex }, uTexel: { value: new THREE.Vector2() },
      uFeed: { value: 0 }, uKill: { value: 0 }, uDrift: { value: 0 }, uImprint: { value: 0 },
      uTime: { value: 0 }, uAspect: { value: 1 }, uSeed: { value: 0 },
      uBrush: { value: new THREE.Vector4() }, uDrop: { value: new THREE.Vector4() },
    };
    const simMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: simFrag, uniforms: simU, depthTest: false });
    const initMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: initFrag, uniforms: { uMask: { value: maskTex } }, depthTest: false });
    const simQuad = new THREE.Mesh(quadGeo, simMat);
    const simScene = new THREE.Scene();
    simScene.add(simQuad);

    let targets = null, simW = 0, simH = 0;
    const ext = renderer.extensions;
    const simType = ext.has('EXT_color_buffer_float') && ext.has('OES_texture_float_linear') ? THREE.FloatType : THREE.HalfFloatType;

    const pass = (material, target) => {
      simQuad.material = material;
      renderer.setRenderTarget(target);
      renderer.render(simScene, camera);
      renderer.setRenderTarget(null);
    };

    const step = (n, time) => {
      const P = ctx.params;
      const [f, k] = P.preset === 'Custom' ? [P.feed, P.kill] : PRESETS[P.preset] || PRESETS.Coral;
      simU.uFeed.value = f;
      simU.uKill.value = k;
      simU.uDrift.value = P.drift;
      simU.uImprint.value = P.seedTitle ? P.imprint : 0;
      simU.uTime.value = time;
      for (let i = 0; i < n; i++) {
        simU.uState.value = targets[0].texture;
        pass(simMat, targets[1]);
        targets.reverse();
        simU.uDrop.value.w = 0; // a click drop only lands on the first step
      }
    };

    // Draws random blobs (R) and the title (G) into the seed canvas, then resets the sim.
    const seed = () => {
      const c = maskTex.image;
      if (c.width !== simW || c.height !== simH) {
        c.width = simW; c.height = simH;
        maskTex.dispose(); // GPU storage is fixed-size, so a new size needs a fresh texture
      }
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, simW, simH);
      const rand = ctx.rand;
      g.fillStyle = '#f00';
      for (let i = 0; i < ctx.params.blobs; i++) {
        g.beginPath();
        g.arc(rand() * simW, rand() * simH, simH * rand.range(0.006, 0.03), 0, Math.PI * 2);
        g.fill();
      }
      const title = ctx.state.text.lines.title;
      if (ctx.params.seedTitle && title) {
        let size = simH * 0.2;
        g.font = fontCss(ctx.state.text, size, 900);
        const tw = g.measureText(title).width;
        if (tw > simW * 0.86) size *= (simW * 0.86) / tw;
        g.font = fontCss(ctx.state.text, size, 900);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#0f0';
        g.fillText(title, simW / 2, simH * 0.5);
      }
      if (!ctx.params.blobs && !(ctx.params.seedTitle && title)) {
        g.fillStyle = '#f00';
        g.fillRect(simW * 0.45, simH * 0.45, simW * 0.1, simH * 0.1);
      }
      maskTex.needsUpdate = true;
      pass(initMat, targets[0]);
      step(240, 0); // pre-grow so the poster opens already patterned
    };

    const ensureSim = (w, h) => {
      const q = Number(ctx.params.quality) || 512;
      const aspect = w / h;
      const nw = Math.round(aspect >= 1 ? q : q * aspect), nh = Math.round(aspect >= 1 ? q / aspect : q);
      if (targets && nw === simW && nh === simH) return; // dpr-only changes (PNG export) keep the sim
      targets?.forEach((t) => t.dispose());
      simW = nw; simH = nh;
      targets = [makeTarget(simW, simH, simType), makeTarget(simW, simH, simType)];
      simU.uTexel.value.set(1 / simW, 1 / simH);
      uniforms.uSimTexel.value.set(1 / simW, 1 / simH);
      simU.uAspect.value = aspect;
      simU.uSeed.value = (ctx.state.seed % 1000) / 1000;
      seed();
    };

    return {
      stage,
      resize(w, h, dpr) {
        stage.resize(w, h, dpr);
        ensureSim(w, h);
      },
      frame(time, dt) {
        const p = ctx.pointer;
        const P = ctx.params;
        if (dt > 0) {
          const painting = p.inside && (P.paint === 'Hover' || p.down);
          simU.uBrush.value.set(p.x, 1 - p.y, P.brush, painting ? ctx.state.motion.mouse : 0);
          if (p.justPressed && p.inside) simU.uDrop.value.set(p.x, 1 - p.y, 0.07, 1);
          step(Math.max(1, Math.round(P.steps * Math.min(dt * 60, 2))), time);
        }
        updateCommonUniforms(uniforms, ctx, params, time, stage.size);
        uniforms.uState.value = targets[0].texture;
        stage.render(time);
      },
      onParam(key) {
        if (key === 'preset' && targets) seed(); // a fresh start shows each pattern at its best
      },
      dispose() {
        targets?.forEach((t) => t.dispose());
        maskTex.dispose();
        simMat.dispose();
        initMat.dispose();
        stage.dispose();
      },
    };
  },
};
