// Liquid Type: the poster's own text, drawn into a texture and then pushed around like ink
// floating on water. Slow noise currents warp it, the cursor drags a decaying liquid trail
// through it (a small ping-pong displacement buffer), clicks send out ripples, and the
// letters split into palette-coloured chromatic fringes as they move.
import { createThreeStage, THREE } from '../../shared/threeStage.js';
import { shaderHeader, commonUniforms, updateCommonUniforms, FS_VERT } from '../../shared/fullscreenShader.js';
import { drawType, fontCss } from '../../shared/typeLayer.js';

const SIM = 192;        // long side of the displacement buffer (fixed, independent of dpr)
const MAX_RIPPLES = 4;
const MAX_TEX = 4096;   // cap for the text texture's long side (huge PNG exports)

const params = {
  warp:        { value: 0.6, min: 0, max: 2, step: 0.01, label: 'Warp amount' },
  warpScale:   { value: 2, min: 0.3, max: 8, step: 0.01, label: 'Warp scale' },
  flow:        { value: 1, min: 0, max: 4, step: 0.01, label: 'Flow speed' },
  split:       { value: 0.8, min: 0, max: 3, step: 0.01, label: 'Chromatic split' },
  decay:       { value: 0.965, min: 0.8, max: 0.995, step: 0.001, label: 'Trail decay' },
  ripple:      { value: 1, min: 0, max: 3, step: 0.01, label: 'Ripple strength' },
  repeat:      { value: true, label: 'Repeat title' },
  repeatCount: { value: 7, min: 2, max: 16, step: 1, label: 'Repeat rows' },
  background:  { value: 'Gradient', options: ['Flat', 'Gradient'], label: 'Background' },
};

// Displacement buffer: advects itself a little, diffuses, decays, and takes the cursor's push.
const velFrag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uTexel, uPos, uVel;
uniform float uDecay, uAspect, uPush;
void main() {
  vec2 v = texture2D(uPrev, vUv).xy;
  v = texture2D(uPrev, vUv - v * 0.15).xy;   // carried along its own flow
  vec2 avg = 0.25 * (texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).xy + texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).xy
                   + texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).xy + texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).xy);
  v = mix(v, avg, 0.3) * uDecay;
  vec2 d = (vUv - uPos) * vec2(uAspect, 1.0);
  v += uVel * exp(-dot(d, d) / 0.006) * uPush;
  gl_FragColor = vec4(clamp(v, -0.5, 0.5), 0.0, 1.0);
}
`;

const fragment = /* glsl */ `
uniform sampler2D uText, uVelTex;   // text: R = repeated title, G = poster text
uniform vec3 uTextCol;
uniform vec4 uRipples[${MAX_RIPPLES}]; // xy (uv), birth time (<0 = none), unused

// Chromatic layer: base colour where all three samples agree, fringe colours where they split.
vec3 layer(vec3 col, float a, float m, float b, vec3 base, vec3 f1, vec3 f2) {
  col = mix(col, f1, clamp(a - m, 0.0, 1.0) * 0.9);
  col = mix(col, f2, clamp(b - m, 0.0, 1.0) * 0.9);
  return mix(col, base, m);
}

void main() {
  vec2 P = vec2(vUv.x * uAspect, vUv.y);
  float t = uTime * 0.12 * p_flow;

  // Slow currents.
  vec2 s = P * p_warpScale;
  vec2 flow = vec2(snoise(vec3(s, t)), snoise(vec3(s + 5.2, t + 1.7)));
  flow += 0.5 * vec2(snoise(vec3(s * 2.1 + flow, t * 1.3)), snoise(vec3(s * 2.1 + 9.1 - flow, t * 1.3)));
  vec2 off = flow * p_warp * 0.012;

  // Cursor trail (drag) + click ripples.
  vec2 disp = texture2D(uVelTex, vUv).xy;
  off -= disp * p_ripple * 0.35;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 R = uRipples[i];
    if (R.z < 0.0) continue;
    float age = uTime - R.z;
    vec2 d = (vUv - R.xy) * vec2(uAspect, 1.0);
    float r = length(d);
    float front = age * 0.45;
    float wave = sin((r - front) * 70.0) * exp(-abs(r - front) * 14.0) * exp(-age * 1.1);
    off += d / max(r, 1e-3) * wave * 0.012 * p_ripple / vec2(uAspect, 1.0);
  }
  vec2 uv = vUv + off;

  // Chromatic split grows with motion.
  float motion = length(disp) * 4.0 + length(off) * 10.0;
  vec2 dir = normalize(off + vec2(1e-4, 0.0)) * vec2(1.0 / uAspect, 1.0);
  vec2 sp = dir * p_split * (0.002 + 0.01 * min(motion, 1.5));
  vec2 ta = texture2D(uText, uv - sp).rg;
  vec2 tm = texture2D(uText, uv).rg;
  vec2 tb = texture2D(uText, uv + sp).rg;

  // Background.
  vec3 col = uPal[0];
  if (p_background > 0.5) {
    float g = snoise(vec3(P * 0.9 + uSeed * 9.0, t * 0.4));
    vec3 tint = paletteRamp(g * 0.3 + vUv.y * 0.35 + uSeed);
    col = mix(uPal[0], tint, 0.28 * smoothstep(-0.6, 0.9, g + (1.0 - vUv.y) * 0.6));
  }
  // Wet sheen along the trail.
  col = mix(col, paletteRamp(uSeed + 0.5 + length(disp) * 3.0), clamp(length(disp) * 3.0 * p_ripple, 0.0, 0.25));

  // Repeated title rows, each in its own palette colour.
  // (Ramp positions land exactly on accents so rows stay pure palette colours.)
  float row = floor(uv.y * p_repeatCount) + floor(uSeed * 4.0);
  vec3 rowCol = paletteRamp(row * 0.25);
  col = layer(col, ta.r, tm.r, tb.r, mix(rowCol, uPal[0], 0.08), paletteRamp(row * 0.25 + 0.25), paletteRamp(row * 0.25 + 0.5));

  // Poster text on top.
  col = layer(col, ta.g, tm.g, tb.g, uTextCol, uPal[2], uPal[4]);
  gl_FragColor = vec4(col, 1.0);
}
`;

function makeTarget(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, stencilBuffer: false,
  });
}

// Every palette key points at one channel colour so drawType writes a pure mask.
const maskPalette = (hex) => ({ bg: hex, ink: hex, c1: hex, c2: hex, c3: hex, c4: hex });

export default {
  id: 'liquidtype',
  name: 'Liquid Type',
  engine: 'three',
  ownsText: true,
  hint: 'Drag through the letters, click for ripples',
  params,
  create(ctx) {
    const stage = createThreeStage(ctx, { ortho: true, background: false });
    const renderer = stage.renderer;
    const geo = new THREE.PlaneGeometry(2, 2);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ---- Text texture ----
    const canvas = document.createElement('canvas');
    const textTex = new THREE.CanvasTexture(canvas);
    textTex.minFilter = THREE.LinearFilter;
    textTex.generateMipmaps = false;

    const drawText = () => {
      const { w, h, dpr } = stage.size;
      const k = Math.min(dpr, MAX_TEX / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * k)), chh = Math.max(1, Math.round(h * k));
      if (cw !== canvas.width || chh !== canvas.height) {
        canvas.width = cw;
        canvas.height = chh;
        textTex.dispose(); // GPU storage is fixed-size, so a new size needs a fresh texture
      }
      const g = canvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#000';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.setTransform(k, 0, 0, k, 0, 0);
      g.globalCompositeOperation = 'lighter';
      const text = ctx.state.text;
      const title = (text.lines.title || '').replace(/\\n/g, ' ').trim();

      // Big repeated title in R: rows of the title marching across, alternately offset.
      if (ctx.params.repeat && title) {
        const rows = ctx.params.repeatCount;
        const rh = h / rows;
        const size = rh * 0.92;
        g.font = fontCss(text, size, 900);
        g.textBaseline = 'middle';
        g.textAlign = 'left';
        g.fillStyle = '#f00';
        const word = title.toUpperCase() + '  ';
        const ww = Math.max(1, g.measureText(word).width);
        for (let r = 0; r < rows; r++) {
          let x = -((r * 0.37) % 1) * ww;
          for (; x < w; x += ww) g.fillText(word, x, (r + 0.5) * rh);
        }
      }
      // Poster text in G (same layout as the normal overlay).
      drawType(g, w, h, { ...text, color: 'ink' }, maskPalette('#0f0'));
      textTex.needsUpdate = true;
      uniforms.uTextCol.value.set(ctx.state.colors[text.color] || ctx.state.colors.ink);
    };

    // ---- Displacement buffer ----
    const velU = {
      uPrev: { value: null }, uTexel: { value: new THREE.Vector2() },
      uPos: { value: new THREE.Vector2() }, uVel: { value: new THREE.Vector2() },
      uDecay: { value: 0.96 }, uAspect: { value: 1 }, uPush: { value: 0 },
    };
    const velMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: velFrag, uniforms: velU, depthTest: false });
    const velScene = new THREE.Scene();
    velScene.add(new THREE.Mesh(geo, velMat));
    let targets = null, simW = 0, simH = 0;

    const ensureSim = (w, h) => {
      const a = w / h;
      const nw = Math.round(a >= 1 ? SIM : SIM * a), nh = Math.round(a >= 1 ? SIM / a : SIM);
      if (targets && nw === simW && nh === simH) return; // dpr-only change: keep the trail
      targets?.forEach((t) => t.dispose());
      simW = nw; simH = nh;
      targets = [makeTarget(simW, simH), makeTarget(simW, simH)];
      for (const t of targets) { renderer.setRenderTarget(t); renderer.clear(); }
      renderer.setRenderTarget(null);
      velU.uTexel.value.set(1 / simW, 1 / simH);
      velU.uAspect.value = a;
    };

    // ---- Display ----
    const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -1, 0));
    let nextRipple = 0;
    const uniforms = {
      ...commonUniforms(params),
      uText: { value: textTex }, uVelTex: { value: null },
      uTextCol: { value: new THREE.Color() }, uRipples: { value: ripples },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: shaderHeader(params) + fragment, uniforms, depthTest: false,
    });
    stage.scene.add(new THREE.Mesh(geo, material));

    let alive = true;
    document.fonts?.ready.then(() => alive && drawText());

    return {
      stage,
      resize(w, h, dpr) {
        stage.resize(w, h, dpr);
        ensureSim(w, h);
        drawText();
      },
      onParam(key) {
        if (key === 'text' || key === 'palette' || key === 'repeat' || key === 'repeatCount') drawText();
      },
      frame(time, dt) {
        const p = ctx.pointer;
        if (p.justPressed && p.inside) {
          ripples[nextRipple].set(p.x, 1 - p.y, time, 0);
          nextRipple = (nextRipple + 1) % MAX_RIPPLES;
        }
        if (dt > 0) {
          velU.uPrev.value = targets[0].texture;
          velU.uPos.value.set(p.x, 1 - p.y);
          velU.uVel.value.set(p.vx, -p.vy);
          velU.uDecay.value = ctx.params.decay;
          velU.uPush.value = p.inside ? 5 * ctx.state.motion.mouse : 0;
          renderer.setRenderTarget(targets[1]);
          renderer.render(velScene, camera);
          renderer.setRenderTarget(null);
          targets.reverse();
        }
        updateCommonUniforms(uniforms, ctx, params, time, stage.size);
        uniforms.uVelTex.value = targets[0].texture;
        stage.render(time);
      },
      dispose() {
        alive = false;
        targets?.forEach((t) => t.dispose());
        textTex.dispose();
        velMat.dispose();
        stage.dispose();
      },
    };
  },
};
