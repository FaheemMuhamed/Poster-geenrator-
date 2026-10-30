// How every effect's settings are presented. All effects share one skeleton so the panel is
// predictable: the same sections, in the same order, with the same words.
//
// A mode declares where its params go:
//   controls: {
//     essentials:  ['a', 'b', 'c', 'd'],  // up to 4, the most expressive; always open
//     form:        [...],                 // shape, size, density, structure
//     motion:      [...],                 // anything time-based (its main rate is called "Speed")
//     interaction: [...],                 // what hover and click do
//     image:       [...],                 // image effects only: how the picture is read
//     colour:      [...],                 // shown in the Colour tab ("Effect colours")
//     type:        [...],                 // shown in the Type tab ("Effect text")
//   }
//   presets:      { 'Subtle': {…}, 'Bold': {…} }        // 2–4 one-click looks (partial values)
//   interactions: { hover: 'Bends the lines', click: 'Sends a pulse outward' }
//
// Any param not listed lands in Form, so nothing is ever hidden.

export const SHAPE_SECTIONS = [
  { id: 'essentials', title: 'Essentials' },
  { id: 'form', title: 'Form' },
  { id: 'motion', title: 'Motion' },
  { id: 'interaction', title: 'Interaction' },
];

// Words to use in labels, so the same idea reads the same everywhere.
export const VOCABULARY = ['Size', 'Scale', 'Count', 'Density', 'Spacing', 'Amount', 'Detail', 'Contrast', 'Softness', 'Thickness', 'Speed', 'Strength'];

function layoutOf(mode) {
  const c = mode.controls || {};
  // Older two-level layouts ({ essentials, groups: { Name: [...] } }) still work: groups fold into Form.
  if (c.groups && !c.form) return { ...c, form: Object.values(c.groups).flat() };
  return c;
}

// Keys for each place a param can appear. Every param appears exactly once.
export function controlPlan(mode) {
  const all = Object.keys(mode.params || {});
  const c = layoutOf(mode);
  const used = new Set();
  const take = (keys = []) => keys.filter((k) => all.includes(k) && !used.has(k) && used.add(k));
  const plan = {
    image: take(c.image),
    colour: take(c.colour),
    type: take(c.type),
    essentials: take(c.essentials?.length ? c.essentials : all.slice(0, 4)).slice(0, 4),
    form: [],
    motion: take(c.motion),
    interaction: take(c.interaction),
  };
  plan.form = take(c.form);
  plan.form.push(...all.filter((k) => !used.has(k)));
  return plan;
}

// Shape-tab sections in their fixed order: [{ id, title, keys }].
export function controlSections(mode) {
  const plan = controlPlan(mode);
  return SHAPE_SECTIONS.map((s) => ({ ...s, keys: plan[s.id], essential: s.id === 'essentials' }));
}
