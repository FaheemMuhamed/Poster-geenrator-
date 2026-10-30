// The library of visuals ("modes"). Each file is loaded only when picked.
// To add a mode, follow docs/ADDING_A_MODE.md: create the file, then add one entry here.
//
//   description  one plain sentence about what you see
//   technique    the generative technique behind it (shown in "How it works")
//   tags         used by search and the filter chips
//   library      'p5' | 'three' | 'glsl'
//   category     what it makes: one of CATEGORIES below (sidebar + Explore filters)
//   group        how it's built: '2D' | '3D' | 'Shader'

// Entries are grouped by what they make. Image effects arrive in a later batch.
export const CATEGORIES = [
  { id: 'Generative', description: 'Noise, particles, simulation and 3D form' },
  { id: 'Type', description: 'Kinetic and typographic visuals' },
  { id: 'Image', description: 'Effects for your own images' },
];

export const MODES = [
  { id: 'pills', category: 'Generative', name: 'Pill Stream', group: '2D', library: 'p5', load: () => import('./p5/pills.js'),
    description: 'Rows of capsules drifting sideways, bleeding colour into each other.',
    technique: 'Canvas 2D shapes with blurred, offset shadows for chromatic bleed', tags: ['shapes', 'typography', 'flow'] },
  { id: 'halftone', category: 'Generative', name: 'Halftone Field', group: '2D', library: 'p5', load: () => import('./p5/halftone.js'),
    description: 'A dot grid revealing hidden strokes, crossed by glowing light flares.',
    technique: 'Scalar field sampled per grid cell → dot radius (halftone)', tags: ['halftone', 'grid', 'light'] },
  { id: 'collage', category: 'Generative', name: 'Pattern Collage', group: '2D', library: 'p5', load: () => import('./p5/collage.js'),
    description: 'Overlapping tiles of ASCII, hatching, dots and repeated words.',
    technique: 'Guillotine subdivision layout with procedural pattern fills', tags: ['grid', 'patterns', 'ascii', 'typography'] },
  { id: 'orbit', category: 'Type', name: 'Orbit Glyphs', group: '2D', library: 'p5', load: () => import('./p5/orbit.js'),
    description: 'Numbers strung along a bending spiral among drifting outline shapes.',
    technique: 'Text on a Catmull-Rom spline with arc-length spacing', tags: ['typography', 'curves', 'shapes'] },
  { id: 'ascii', category: 'Type', name: 'ASCII Lens', group: '2D', library: 'p5', load: () => import('./p5/ascii.js'),
    description: 'A moving field drawn entirely in characters, with a magnifying lens.',
    technique: 'Brightness field → character ramp, glyphs blitted from a sprite sheet', tags: ['ascii', 'typography', 'noise'] },
  { id: 'particles', category: 'Generative', name: 'Particle Swirl', group: '3D', library: 'three', load: () => import('./three/particles.js'),
    description: 'Tens of thousands of particles twisting through a vortex.',
    technique: 'GPU point sprites positioned in the vertex shader + curl noise', tags: ['particles', 'noise', '3d'] },
  { id: 'blob', category: 'Generative', name: 'Liquid Blob', group: '3D', library: 'three', load: () => import('./three/blob.js'),
    description: 'A soft, breathing 3D form with glow, iridescent or glass skin.',
    technique: 'Vertex displacement by 3D simplex noise, fresnel shading', tags: ['noise', 'shading', '3d'] },
  { id: 'ribbons', category: 'Generative', name: 'Ribbon Flow', group: '3D', library: 'three', load: () => import('./three/ribbons.js'),
    description: 'Ribbons of colour carried through a 3D current.',
    technique: 'Strip meshes advected through a curl-noise flow field', tags: ['flow', 'noise', '3d'] },
  { id: 'type3d', category: 'Type', name: 'Type in Space', group: '3D', library: 'three', load: () => import('./three/type3d.js'),
    description: 'Your title as extruded 3D letters with floating text planes.',
    technique: 'TextGeometry per glyph with spring physics + canvas textures', tags: ['typography', '3d'] },
  { id: 'terrain', category: 'Generative', name: 'Dot Terrain', group: '3D', library: 'three', load: () => import('./three/terrain.js'),
    description: 'A landscape built from thousands of dots, rippling under the cursor.',
    technique: 'InstancedMesh displaced by noise in the vertex shader', tags: ['halftone', 'grid', 'noise', '3d'] },
  { id: 'aura', category: 'Generative', name: 'Aura Gradient', group: 'Shader', library: 'glsl', load: () => import('./shader/aura.js'),
    description: 'A soft colour field that swirls around the cursor.',
    technique: 'Domain-warped fractal noise (fBm) mapped to a palette', tags: ['gradient', 'noise'] },
  { id: 'ink', category: 'Generative', name: 'Ink Bleed', group: 'Shader', library: 'glsl', load: () => import('./shader/ink.js'),
    description: 'Chromatography lanes where pigments separate and spread.',
    technique: 'Signed-distance capsules with per-channel diffusion offsets', tags: ['gradient', 'shapes', 'simulation'] },
  { id: 'liquidtype', category: 'Type', name: 'Liquid Type', group: 'Shader', library: 'glsl', load: () => import('./shader/liquidtype.js'),
    description: 'Your text rippling and dragging like liquid.',
    technique: 'Text texture warped by noise + a ping-pong velocity buffer', tags: ['typography', 'distortion', 'simulation'] },
  { id: 'rd', category: 'Generative', name: 'Reaction-Diffusion', group: 'Shader', library: 'glsl', load: () => import('./shader/reaction.js'),
    description: 'Coral and fingerprint patterns that grow on their own.',
    technique: 'Gray-Scott reaction-diffusion simulated on the GPU', tags: ['simulation', 'patterns'] },
  { id: 'voronoi', category: 'Generative', name: 'Voronoi Glass', group: 'Shader', library: 'glsl', load: () => import('./shader/voronoi.js'),
    description: 'Drifting panes of glass refracting a colour gradient.',
    technique: 'Voronoi cells with border distance, refraction and dispersion', tags: ['distortion', 'patterns', 'light'] },
];

// Source file of each mode, for the "View source" link.
export function modeFile(m) {
  const folder = { p5: 'p5', three: 'three', glsl: 'shader' }[m.library];
  const file = { rd: 'reaction' }[m.id] || m.id;
  return `js/modes/${folder}/${file}.js`;
}

// Preview media captured by capture.html (see docs/ADDING_A_MODE.md).
export const previewUrl = (id, ext) => `${import.meta.env.BASE_URL}previews/${id}.${ext}`;

// Every tag in use, most common first.
export const ALL_TAGS = Object.entries(
  MODES.flatMap((m) => m.tags).reduce((acc, t) => ({ ...acc, [t]: (acc[t] || 0) + 1 }), {}),
).sort((a, b) => b[1] - a[1]).map(([t]) => t);

const cache = new Map();
export async function loadMode(id) {
  const entry = MODES.find((m) => m.id === id) || MODES[0];
  if (!cache.has(entry.id)) cache.set(entry.id, (await entry.load()).default);
  return cache.get(entry.id);
}
