// Everything a three.js mode needs: renderer, scene, camera, optional orbit controls,
// and the post-FX pass (one shader with every effect). Modes only add their objects.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PostFXShader, fxActive } from './postfx.js';
import { hexToRgb01, PALETTE_KEYS } from './palettes.js';

// Colours are used exactly as picked (no linear/sRGB conversion), like in a design tool.
THREE.ColorManagement.enabled = false;

export { THREE };

export function paletteUniform(palette) {
  return PALETTE_KEYS.map((k) => new THREE.Vector3(...hexToRgb01(palette[k])));
}

export function createThreeStage(ctx, { orbit = false, ortho = false, fov = 35, cameraZ = 6, background = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  ctx.container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = ortho
    ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10)
    : new THREE.PerspectiveCamera(fov, 1, 0.05, 200);
  camera.position.set(0, 0, ortho ? 1 : cameraZ);

  let controls = null;
  if (orbit) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 30;
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const fxPass = new ShaderPass(PostFXShader);
  composer.addPass(fxPass);

  let size = { w: 1, h: 1, dpr: 1 };
  const bg = new THREE.Color();

  return {
    THREE, renderer, scene, camera, controls, composer,
    get size() { return size; },

    resize(w, h, dpr) {
      size = { w, h, dpr };
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      if (camera.isPerspectiveCamera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    },

    render(time) {
      const { fx, colors } = ctx.state;
      if (background) scene.background = bg.set(colors.bg);
      controls?.update();
      const u = fxPass.uniforms;
      u.uRes.value = [size.w * size.dpr, size.h * size.dpr];
      u.uPx.value = size.dpr;
      u.uTime.value = time;
      u.uHalftone.value = +fx.halftone; u.uHalftoneSize.value = fx.halftoneSize;
      u.uDither.value = +fx.dither; u.uDitherLevels.value = fx.ditherLevels;
      u.uThreshold.value = +fx.threshold;
      u.uGrain.value = fx.grain; u.uChroma.value = fx.chroma; u.uRgbShift.value = fx.rgbShift;
      u.uPixelate.value = fx.pixelate; u.uVignette.value = fx.vignette; u.uSoft.value = fx.soft;
      u.uInk.value = hexToRgb01(colors.ink); u.uPaper.value = hexToRgb01(colors.bg);
      u.uBloom.value = fx.bloom;
      if (fxActive(fx)) composer.render();
      else renderer.render(scene, camera);
    },

    dispose() {
      controls?.dispose();
      composer.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        const m = o.material;
        (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => mm.dispose());
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

// Converts the shared pointer (0..1, y down) to normalised device coords (-1..1, y up).
export function pointerNDC(ctx) {
  return new THREE.Vector2(ctx.pointer.x * 2 - 1, -(ctx.pointer.y * 2 - 1));
}
