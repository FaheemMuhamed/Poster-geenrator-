// Colour presets drawn from the moodboard. Every palette has a background, an ink
// (text/outline) colour, and four accent colours (c1–c4) that modes cycle through.
export const PALETTES = {
  'Chromatography': { bg: '#f7f3ea', ink: '#1d1d24', c1: '#ff3d4e', c2: '#ff9ccf', c3: '#20306b', c4: '#ffd43b' },
  'Halftone Ice':   { bg: '#dce7ee', ink: '#121417', c1: '#ff6a2b', c2: '#ffb36b', c3: '#1a1a1a', c4: '#7fa7c4' },
  'Sunset Bloom':   { bg: '#fbf6f4', ink: '#1a1a1a', c1: '#ff5a3c', c2: '#ffb0b8', c3: '#21d4b4', c4: '#f2c14e' },
  'Lilac Sky':      { bg: '#ead9f7', ink: '#141414', c1: '#5fb3f5', c2: '#f3c6f0', c3: '#ff7a2f', c4: '#9b7bff' },
  'Neon Pulse':     { bg: '#eeeceb', ink: '#121212', c1: '#ff4d6d', c2: '#ff2bb3', c3: '#d7ff2e', c4: '#ff9a7a' },
  'Neuro Violet':   { bg: '#f1f1fa', ink: '#121212', c1: '#3b2bd8', c2: '#c48bff', c3: '#d8ff6a', c4: '#ff9ad5' },
  'Night Petal':    { bg: '#050507', ink: '#f2f2f2', c1: '#4e7bff', c2: '#ff9ee0', c3: '#ffc56b', c4: '#9aa4c2' },
  'Ink Wash':       { bg: '#f4f1ea', ink: '#0d0d0d', c1: '#0d0d0d', c2: '#5a5a5a', c3: '#e8462d', c4: '#b9b4a8' },
};

export const PALETTE_KEYS = ['bg', 'ink', 'c1', 'c2', 'c3', 'c4'];

// '#rrggbb' -> [r, g, b] in 0..1
export function hexToRgb01(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function accents(pal) {
  return [pal.c1, pal.c2, pal.c3, pal.c4];
}
