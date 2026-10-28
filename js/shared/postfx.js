// One "uber" post-processing shader that handles every switchable effect in a single pass.
// Glow is custom rather than three's additive bloom, which turns light posters white:
// it spreads coloured haze on light backgrounds and adds light on dark ones.
import { NOISE } from '../shaders/noise.glsl.js';

export const FX_DEFAULTS = {
  bloom: 0,          // 0 = off
  soft: 0,           // soft-focus diffusion
  halftone: false, halftoneSize: 7,
  dither: false, ditherLevels: 3,
  threshold: false,
  grain: 0.12,
  chroma: 0,
  rgbShift: 0,
  pixelate: 0,
  vignette: 0,
};

export function fxActive(fx) {
  return fx.bloom > 0 || fx.halftone || fx.dither || fx.threshold || fx.grain > 0 || fx.chroma > 0 || fx.soft > 0 ||
    fx.rgbShift > 0 || fx.pixelate > 0 || fx.vignette > 0;
}

export const PostFXShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: [1, 1] },
    uPx: { value: 1 },
    uTime: { value: 0 },
    uHalftone: { value: 0 }, uHalftoneSize: { value: 7 },
    uDither: { value: 0 }, uDitherLevels: { value: 3 },
    uThreshold: { value: 0 },
    uGrain: { value: 0 },
    uChroma: { value: 0 },
    uRgbShift: { value: 0 },
    uPixelate: { value: 0 },
    uVignette: { value: 0 },
    uSoft: { value: 0 },
    uBloom: { value: 0 },
    uInk: { value: [0, 0, 0] },
    uPaper: { value: [1, 1, 1] },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes; uniform float uPx, uTime;
    uniform float uHalftone, uHalftoneSize, uDither, uDitherLevels, uThreshold, uGrain, uChroma, uRgbShift, uPixelate, uVignette, uSoft, uBloom;
    uniform vec3 uInk, uPaper;
    varying vec2 vUv;
    ${NOISE}

    float bayer4(vec2 p) {
      ivec2 i = ivec2(mod(p, 4.0));
      int idx = i.x + i.y * 4;
      float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
      return (m[idx] + 0.5) / 16.0;
    }

    vec3 sampleScene(vec2 uv) {
      vec3 c;
      if (uChroma > 0.0) {
        vec2 d = (uv - 0.5) * uChroma * 0.02;
        c = vec3(texture2D(tDiffuse, uv + d).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d).b);
      } else c = texture2D(tDiffuse, uv).rgb;
      if (uRgbShift > 0.0) {
        float band = floor(uv.y * 40.0 + floor(uTime * 6.0) * 3.1);
        float s = (hash11(band) - 0.5) * uRgbShift * 0.04 * step(0.7, hash11(band + 9.0));
        c.r = texture2D(tDiffuse, uv + vec2(s, 0.0)).r;
        c.b = texture2D(tDiffuse, uv - vec2(s, 0.0)).b;
      }
      return c;
    }

    void main() {
      vec2 frag = vUv * uRes;
      vec2 uv = vUv;
      if (uPixelate > 0.0) {
        float s = uPixelate * uPx;
        uv = (floor(frag / s) + 0.5) * s / uRes;
      }
      vec3 col = sampleScene(uv);

      if (uSoft > 0.0) {
        // 16-tap golden-angle blur, mixed back in for a dreamy diffusion.
        vec3 acc = vec3(0.0);
        float rad = uSoft * 0.035;
        for (int i = 0; i < 16; i++) {
          float fi = float(i) + 0.5;
          float a = fi * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * sqrt(fi / 16.0) * rad * vec2(uRes.y / uRes.x, 1.0);
          acc += texture2D(tDiffuse, uv + o).rgb;
        }
        col = mix(col, acc / 16.0, clamp(uSoft, 0.0, 1.0) * 0.75);
      }

      if (uBloom > 0.0) {
        // Gather nearby colourful pixels (weighted by saturation) into a halo.
        vec3 halo = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 24; i++) {
          float fi = float(i) + 0.5;
          float a = fi * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * sqrt(fi / 24.0) * 0.06 * vec2(uRes.y / uRes.x, 1.0);
          vec3 s = texture2D(tDiffuse, uv + o).rgb;
          float w = max(max(s.r, s.g), s.b) - min(min(s.r, s.g), s.b);
          halo += s * w;
          wsum += w;
        }
        halo /= max(wsum, 1e-3);
        float cover = clamp(wsum / 24.0 * 2.0, 0.0, 1.0) * uBloom;
        float lightBg = step(0.5, dot(uPaper, vec3(0.299, 0.587, 0.114)));
        col = mix(col + halo * cover * 0.5, mix(col, halo, clamp(cover, 0.0, 0.85)), lightBg);
      }

      if (uHalftone > 0.5) {
        float s = uHalftoneSize * uPx;
        mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
        vec2 p = rot * frag;
        vec2 cell = (floor(p / s) + 0.5) * s;
        vec2 center = transpose(rot) * cell;
        vec3 cc = sampleScene(center / uRes);
        float lum = dot(cc, vec3(0.299, 0.587, 0.114));
        float paperLum = dot(uPaper, vec3(0.299, 0.587, 0.114));
        float amt = clamp(abs(lum - paperLum) * 1.4, 0.0, 1.0);
        float r = sqrt(amt) * s * 0.62;
        float d = length(p - cell);
        float dotMask = 1.0 - smoothstep(r - uPx, r + uPx, d);
        col = mix(uPaper, cc, dotMask);
      }

      if (uThreshold > 0.5) {
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        float t = uDither > 0.5 ? bayer4(frag / uPx) : 0.5;
        col = lum > t ? uPaper : uInk;
      } else if (uDither > 0.5) {
        float b = bayer4(frag / uPx) - 0.5;
        float L = max(uDitherLevels - 1.0, 1.0);
        col = floor(col * L + b + 0.5) / L;
      }

      if (uVignette > 0.0) {
        float v = smoothstep(0.9, 0.2, length(vUv - 0.5) * 1.2);
        col *= mix(1.0, v, uVignette);
      }
      if (uGrain > 0.0) {
        float n = hash21(frag + fract(uTime * 7.0) * 100.0) - 0.5;
        col += n * uGrain * 0.35;
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
