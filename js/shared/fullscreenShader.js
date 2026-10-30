// Helper for full-screen GLSL modes: one quad, one fragment shader, shared uniforms.
//
// Every mode param is passed to the shader automatically as `p_<name>`
// (numbers as float, true/false as 1.0/0.0, dropdown choices as their index 0,1,2…).
// Shared uniforms: uTime, uRes (pixels), uAspect, uMouse (0..1, y up), uMouseVel,
// uDown (1 while pressed), uSeed (0..1), uMousePow (the "Mouse power" slider),
// uInside (0..1, eased: is the cursor over the poster), uPal[6] (bg, ink, c1..c4) + paletteRamp().
// With { source: true }: uSource (the picture, see sources.js), uSourceAspect, and
// sourceUv(vUv) which fits the picture to cover the poster (like CSS object-fit: cover).
import { createThreeStage, paletteUniform, THREE } from './threeStage.js';
import { NOISE, PALETTE_GLSL } from '../shaders/noise.glsl.js';

export const FS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function paramUniformDecls(params) {
  return Object.keys(params).map((k) => `uniform float p_${k};`).join('\n');
}

const SOURCE_GLSL = /* glsl */ `
uniform sampler2D uSource;
uniform float uSourceAspect;
vec2 sourceUv(vec2 uv) {
  vec2 s = vec2(1.0);
  if (uAspect > uSourceAspect) s.y = uSourceAspect / uAspect; else s.x = uAspect / uSourceAspect;
  return (uv - 0.5) * s + 0.5;
}
vec3 sourceAt(vec2 uv) { return texture2D(uSource, sourceUv(uv)).rgb; }
`;

export function shaderHeader(params, { source = false } = {}) {
  return `
    varying vec2 vUv;
    uniform float uTime, uAspect, uDown, uSeed, uMousePow, uInside;
    uniform vec2 uRes, uMouse, uMouseVel;
    ${paramUniformDecls(params)}
    ${PALETTE_GLSL}
    ${NOISE}
    ${source ? SOURCE_GLSL : ''}
  `;
}

// A texture that follows ctx.source (sample, upload or webcam), refreshed only when it changes.
export function sourceTexture(ctx) {
  const tex = new THREE.CanvasTexture(ctx.source.canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  let seen = -1;
  return {
    texture: tex,
    update(uniforms) {
      if (seen === ctx.source.version) return;
      seen = ctx.source.version;
      // A new upload can change the canvas size, which needs a fresh GPU texture.
      if (tex.image.width !== tex.userData.w || tex.image.height !== tex.userData.h) { tex.dispose(); tex.userData = { w: tex.image.width, h: tex.image.height }; }
      tex.needsUpdate = true;
      if (uniforms) { uniforms.uSource.value = tex; uniforms.uSourceAspect.value = ctx.source.aspect; }
    },
    dispose: () => tex.dispose(),
  };
}

export function paramValue(def, v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (def.options) return Math.max(0, def.options.indexOf(v));
  return 0;
}

export function commonUniforms(params) {
  const u = {
    uTime: { value: 0 }, uAspect: { value: 1 }, uDown: { value: 0 }, uSeed: { value: 0 },
    uMousePow: { value: 1 }, uInside: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uMouseVel: { value: new THREE.Vector2() },
    uPal: { value: [] },
  };
  for (const k of Object.keys(params)) u[`p_${k}`] = { value: 0 };
  return u;
}

export function updateCommonUniforms(u, ctx, modeParams, time, size) {
  const p = ctx.pointer;
  u.uTime.value = time;
  u.uRes.value.set(size.w * size.dpr, size.h * size.dpr);
  u.uAspect.value = size.w / size.h;
  u.uMouse.value.set(p.x, 1 - p.y);
  u.uMouseVel.value.set(p.vx, -p.vy);
  u.uDown.value = p.down ? 1 : 0;
  u.uMousePow.value = ctx.state.motion.mouse;
  // Eases in/out so effects fade when the cursor leaves the poster.
  u.uInside.value += ((p.inside ? 1 : 0) - u.uInside.value) * 0.08;
  u.uSeed.value = (ctx.state.seed % 1000) / 1000;
  u.uPal.value = paletteUniform(ctx.state.colors);
  for (const [k, def] of Object.entries(modeParams)) u[`p_${k}`].value = paramValue(def, ctx.params[k]);
}

// `fragment` is the body of the shader *after* the shared header (write your own `void main()`).
export function createFullscreenShader(ctx, modeParams, fragment, { extraUniforms = {}, source = false } = {}) {
  const stage = createThreeStage(ctx, { ortho: true, background: false });
  const src = source ? sourceTexture(ctx) : null;
  const uniforms = { ...commonUniforms(modeParams), ...extraUniforms };
  if (src) { uniforms.uSource = { value: src.texture }; uniforms.uSourceAspect = { value: ctx.source.aspect }; }
  const material = new THREE.ShaderMaterial({
    vertexShader: FS_VERT,
    fragmentShader: shaderHeader(modeParams, { source }) + fragment,
    uniforms,
    depthTest: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  stage.scene.add(quad);

  return {
    stage, material, uniforms,
    resize: (w, h, dpr) => stage.resize(w, h, dpr),
    frame(time) {
      updateCommonUniforms(uniforms, ctx, modeParams, time, stage.size);
      src?.update(uniforms);
      stage.render(time);
    },
    dispose: () => { src?.dispose(); stage.dispose(); },
  };
}
