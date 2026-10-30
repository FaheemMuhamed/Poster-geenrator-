// How each mode's settings are presented: a few essentials always visible, then named
// groups that start folded. Any setting not listed here lands in "More".
// Edit this file to change which controls are front and centre.
export const CONTROL_LAYOUT = {
  pills:      { essentials: ['rows', 'density', 'bleed', 'flow'],         groups: { Form: ['fill', 'shape', 'empty', 'inkRatio'], Softness: ['blur'] } },
  halftone:   { essentials: ['spacing', 'dotSize', 'flare', 'shape'],     groups: { Shapes: ['blobs', 'blobSize', 'ghost'], Light: ['flares'] } },
  collage:    { essentials: ['tiles', 'scale', 'darkRatio', 'word'],      groups: { Patterns: ['ascii', 'dots', 'hatch', 'words', 'cross', 'window', 'mosaic'], Details: ['labels', 'guides', 'weight'] } },
  orbit:      { essentials: ['sequence', 'amplitude', 'turns', 'shapes'], groups: { Glyphs: ['textSize', 'highlights'], Decoration: ['sparkles', 'weight', 'drift'] } },
  ascii:      { essentials: ['source', 'cols', 'ramp', 'colour'],         groups: { Lens: ['lensSize', 'zoom'], Motion: ['speed', 'jitter'], Characters: ['custom'] } },
  particles:  { essentials: ['count', 'twist', 'noise', 'size'],          groups: { Shape: ['arc', 'radius', 'spread', 'thick', 'bands'], Camera: ['spin', 'offsetX', 'tilt', 'autoRotate'] } },
  blob:       { essentials: ['material', 'amount', 'scale', 'size'],      groups: { Colour: ['shift', 'edge'], Composition: ['satellites', 'posX', 'posY', 'speed'] } },
  ribbons:    { essentials: ['count', 'turb', 'twist', 'colorMode'],      groups: { Form: ['width', 'length', 'spread'], Atmosphere: ['speed', 'fog', 'shift'] } },
  type3d:     { essentials: ['font', 'material', 'depth', 'scatter'],     groups: { Letters: ['bevel', 'spacing', 'scale'], Scene: ['float', 'backdrop', 'shift'] } },
  terrain:    { essentials: ['shape', 'height', 'scale', 'colorBy'],      groups: { Grid: ['grid', 'spacing', 'dot'], Camera: ['tilt', 'speed'], Interaction: ['ripple', 'shift'] } },
  aura:       { essentials: ['scale', 'warp', 'coverage', 'softness'],    groups: { Colour: ['hueShift', 'bands', 'detail'], Motion: ['flow', 'swirl'] } },
  ink:        { essentials: ['lanes', 'spots', 'bleed', 'separation'],    groups: { Spots: ['spotWidth', 'outline', 'gaps'], Paper: ['paper', 'wetness', 'speed'] } },
  liquidtype: { essentials: ['warp', 'split', 'repeat', 'background'],    groups: { Liquid: ['warpScale', 'flow', 'decay', 'ripple'], Repeat: ['repeatCount'] } },
  rd:         { essentials: ['preset', 'brush', 'spread', 'emboss'],      groups: { Growth: ['steps', 'drift', 'feed', 'kill'], Seeding: ['blobs', 'seedTitle', 'imprint', 'paint'], Quality: ['quality', 'edge'] } },
  voronoi:    { essentials: ['cells', 'refraction', 'dispersion', 'edgeColor'], groups: { Glass: ['edge', 'rim', 'gradScale'], Interaction: ['push', 'lens', 'drift'] } },
};

// Returns [{ title, keys, essential }] for a mode definition.
export function controlSections(mode) {
  const all = Object.keys(mode.params || {});
  // A mode can carry its own layout (`controls: { essentials, groups }`) instead of an entry above.
  const layout = CONTROL_LAYOUT[mode.id] || mode.controls || { essentials: all.slice(0, 4), groups: {} };
  const used = new Set();
  const take = (keys) => keys.filter((k) => all.includes(k) && !used.has(k) && used.add(k));
  const sections = [{ title: 'Essentials', keys: take(layout.essentials), essential: true }];
  for (const [title, keys] of Object.entries(layout.groups || {})) {
    const k = take(keys);
    if (k.length) sections.push({ title, keys: k });
  }
  const rest = all.filter((k) => !used.has(k));
  if (rest.length) sections.push({ title: 'More', keys: rest });
  return sections;
}
