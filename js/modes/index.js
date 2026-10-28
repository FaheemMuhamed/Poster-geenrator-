// The list of poster modes shown in the "Mode" dropdown. Each file is loaded only when picked.
// To add a mode: create a file shaped like the others and add one line here.
export const MODES = [
  { id: 'pills',     name: 'Pill Stream',        group: '2D',     load: () => import('./p5/pills.js') },
  { id: 'halftone',  name: 'Halftone Field',     group: '2D',     load: () => import('./p5/halftone.js') },
  { id: 'collage',   name: 'Pattern Collage',    group: '2D',     load: () => import('./p5/collage.js') },
  { id: 'orbit',     name: 'Orbit Glyphs',       group: '2D',     load: () => import('./p5/orbit.js') },
  { id: 'ascii',     name: 'ASCII Lens',         group: '2D',     load: () => import('./p5/ascii.js') },
  { id: 'particles', name: 'Particle Swirl',     group: '3D',     load: () => import('./three/particles.js') },
  { id: 'blob',      name: 'Liquid Blob',        group: '3D',     load: () => import('./three/blob.js') },
  { id: 'ribbons',   name: 'Ribbon Flow',        group: '3D',     load: () => import('./three/ribbons.js') },
  { id: 'type3d',    name: 'Type in Space',      group: '3D',     load: () => import('./three/type3d.js') },
  { id: 'terrain',   name: 'Dot Terrain',        group: '3D',     load: () => import('./three/terrain.js') },
  { id: 'aura',      name: 'Aura Gradient',      group: 'Shader', load: () => import('./shader/aura.js') },
  { id: 'ink',       name: 'Ink Bleed',          group: 'Shader', load: () => import('./shader/ink.js') },
  { id: 'liquidtype',name: 'Liquid Type',        group: 'Shader', load: () => import('./shader/liquidtype.js') },
  { id: 'rd',        name: 'Reaction-Diffusion', group: 'Shader', load: () => import('./shader/reaction.js') },
  { id: 'voronoi',   name: 'Voronoi Glass',      group: 'Shader', load: () => import('./shader/voronoi.js') },
];

const cache = new Map();
export async function loadMode(id) {
  const entry = MODES.find((m) => m.id === id) || MODES[0];
  if (!cache.has(entry.id)) cache.set(entry.id, (await entry.load()).default);
  return cache.get(entry.id);
}
