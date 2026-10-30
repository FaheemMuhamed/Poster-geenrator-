// Font registry for Morva.
//
// source: 'self'   → @font-face rules in src/fonts.css, files in public/fonts/<slug>/
//                     (every self-hosted family is SIL OFL 1.1 — see public/fonts/CREDITS.md)
// source: 'google' → loaded via GOOGLE_FONTS_CSS below
//
// `weights` lists only weights that actually exist (variable fonts list the
// standard stops inside their axis range), so nearest-match logic is safe.
// `variable` (optional) gives the real wght axis range for variable files.

export const FONT_CATEGORIES = ['Sans', 'Serif', 'Mono', 'Display', 'Experimental'];

const OFL = 'SIL OFL 1.1';
const range = (min, max) => [100, 200, 300, 400, 500, 600, 700, 800, 900].filter((w) => w >= min && w <= max);

export const FONTS_LIBRARY = [
  // ───────── Self-hosted · The League of Moveable Type ─────────
  { name: 'League Spartan', family: 'League Spartan', foundry: 'The League of Moveable Type (Micah Rich, Tyler Finck et al.)', source: 'self', category: 'Sans', weights: range(100, 900), variable: [100, 900], italic: false, license: OFL, url: 'https://www.theleagueofmoveabletype.com/league-spartan' },
  { name: 'League Gothic', family: 'League Gothic', foundry: 'The League of Moveable Type (Caroline Hadilaksono, Micah Rich, Tyler Finck)', source: 'self', category: 'Display', weights: [400], italic: true, license: OFL, url: 'https://www.theleagueofmoveabletype.com/league-gothic' },
  { name: 'League Mono', family: 'League Mono', foundry: 'The League of Moveable Type (Tyler Finck)', source: 'self', category: 'Mono', weights: range(100, 800), variable: [100, 800], italic: false, license: OFL, url: 'https://www.theleagueofmoveabletype.com/league-mono' },
  { name: 'Orbitron', family: 'Orbitron', foundry: 'The League of Moveable Type (Matt McInerney)', source: 'self', category: 'Display', weights: [300, 500, 700, 900], italic: false, license: OFL, url: 'https://www.theleagueofmoveabletype.com/orbitron' },
  { name: 'Chunk Five', family: 'Chunk Five', foundry: 'The League of Moveable Type (Meredith Mandel)', source: 'self', category: 'Display', weights: [400], italic: false, license: OFL, url: 'https://www.theleagueofmoveabletype.com/chunk' },
  { name: 'Linden Hill', family: 'Linden Hill', foundry: 'The League of Moveable Type (Barry Schwartz)', source: 'self', category: 'Serif', weights: [400], italic: true, license: OFL, url: 'https://www.theleagueofmoveabletype.com/linden-hill' },
  { name: 'Knewave', family: 'Knewave', foundry: 'The League of Moveable Type (Tyler Finck)', source: 'self', category: 'Display', weights: [400], italic: false, license: OFL, url: 'https://www.theleagueofmoveabletype.com/knewave' },
  { name: 'Blackout', family: 'Blackout', foundry: 'The League of Moveable Type (Tyler Finck)', source: 'self', category: 'Experimental', weights: [400], italic: false, license: OFL, url: 'https://www.theleagueofmoveabletype.com/blackout' },

  // ───────── Self-hosted · Collletttivo ─────────
  { name: 'Apfel Grotezk', family: 'Apfel Grotezk', foundry: 'Collletttivo (Luigi Gorlero)', source: 'self', category: 'Sans', weights: [400, 500, 700, 900], italic: false, license: OFL, url: 'https://www.collletttivo.it/typefaces/apfel-grotezk' },
  { name: 'Necto Mono', family: 'Necto Mono', foundry: 'Collletttivo (Marco Condello)', source: 'self', category: 'Mono', weights: [400], italic: false, license: OFL, url: 'https://www.collletttivo.it/typefaces/necto-mono' },
  { name: 'Mazius Display', family: 'Mazius Display', foundry: 'Collletttivo (Alberto Casagrande)', source: 'self', category: 'Display', weights: [400, 700], italic: true, license: OFL, url: 'https://www.collletttivo.it/typefaces/mazius-display' },
  { name: 'Ortica Linear', family: 'Ortica Linear', foundry: 'Collletttivo (Ben Bovani)', source: 'self', category: 'Serif', weights: [300, 400, 700], italic: false, license: OFL, url: 'https://www.collletttivo.it/typefaces/ortica' },
  { name: 'Sinistre', family: 'Sinistre', foundry: 'Collletttivo (Jules Durand)', source: 'self', category: 'Experimental', weights: range(400, 900), variable: [400, 900], italic: false, license: OFL, url: 'https://www.collletttivo.it/typefaces/sinistre' },
  { name: 'Mattone', family: 'Mattone', foundry: 'Collletttivo (Nunzio Mazzaferro)', source: 'self', category: 'Display', weights: [400, 700, 900], italic: false, license: OFL, url: 'https://www.collletttivo.it/typefaces/mattone' },
  { name: 'Sneaky Times', family: 'Sneaky Times', foundry: 'Collletttivo (Jules Durand)', source: 'self', category: 'Experimental', weights: [400], italic: false, license: OFL, url: 'https://www.collletttivo.it/typefaces/sneaky-times' },
  { name: 'Aujournuit', family: 'Aujournuit', foundry: 'Collletttivo (Teo Gaudet)', source: 'self', category: 'Experimental', weights: [400], italic: false, license: OFL, url: 'https://www.collletttivo.it/typefaces/aujournuit' },

  // ───────── Self-hosted · Open Foundry ─────────
  { name: 'Bluu Next', family: 'Bluu Next', foundry: 'Velvetyne (Jean-Baptiste Morizot)', source: 'self', category: 'Serif', weights: [700], italic: true, license: OFL, url: 'https://open-foundry.com/fonts/bluu-next' },
  { name: 'Reglo', family: 'Reglo', foundry: 'Sébastien Sanfilippo', source: 'self', category: 'Display', weights: [700], italic: false, license: OFL, url: 'https://open-foundry.com/fonts/reglo' },
  { name: 'Bagnard', family: 'Bagnard', foundry: 'Sébastien Sanfilippo', source: 'self', category: 'Serif', weights: [400], italic: false, license: OFL, url: 'https://open-foundry.com/fonts/bagnard' },
  { name: 'Terminal Grotesque', family: 'Terminal Grotesque Open', foundry: 'Velvetyne (Raphaël Bastide, Jérémy Landes)', source: 'self', category: 'Experimental', weights: [400], italic: false, license: OFL, url: 'https://open-foundry.com/fonts/terminal-grotesque-open' },
  { name: 'Office Code Pro', family: 'Office Code Pro', foundry: 'Nathan Rutzky (after Adobe Source Code Pro)', source: 'self', category: 'Mono', weights: [300, 400, 700], italic: true, license: OFL, url: 'https://open-foundry.com/fonts/office-code-pro' },
  { name: 'Cotham Sans', family: 'Cotham Sans', foundry: 'Sébastien Sanfilippo', source: 'self', category: 'Sans', weights: [400], italic: false, license: OFL, url: 'https://open-foundry.com/fonts/cotham-sans' },
  { name: 'Cooper Hewitt', family: 'Cooper Hewitt', foundry: 'Chester Jenkins for Cooper Hewitt', source: 'self', category: 'Sans', weights: [400, 700, 800], italic: true, license: OFL, url: 'https://open-foundry.com/fonts/cooper-hewitt' },
  { name: 'Gap Sans', family: 'Gap Sans', foundry: 'Interstices (Alexandre Liziard, Étienne Ozeray)', source: 'self', category: 'Experimental', weights: [400, 700, 900], italic: false, license: OFL, url: 'https://open-foundry.com/fonts/gap-sans' },

  // ───────── Self-hosted · via UNCUT.wtf ─────────
  { name: 'Gloock', family: 'Gloock', foundry: 'Duarte Pinto', source: 'self', category: 'Serif', weights: [400], italic: false, license: OFL, url: 'https://uncut.wtf/display/gloock/' },
  { name: 'Overused Grotesk', family: 'Overused Grotesk', foundry: 'RandomMaerks (Bao Nguyen)', source: 'self', category: 'Sans', weights: range(200, 900), variable: [200, 900], italic: false, license: OFL, url: 'https://uncut.wtf/sans-serif/overused-grotesk/' },
  { name: 'Frick', family: 'Frick', foundry: 'Dennis Grauel', source: 'self', category: 'Display', weights: [700], italic: false, license: OFL, url: 'https://uncut.wtf/display/frick/' },
  { name: 'Rag', family: 'Rag', foundry: 'Dennis Grauel', source: 'self', category: 'Sans', weights: [400, 700, 900], italic: true, license: OFL, url: 'https://uncut.wtf/sans-serif/rag/' },
  { name: 'Martian Mono', family: 'Martian Mono', foundry: 'Evil Martians (Roman Shamin)', source: 'self', category: 'Mono', weights: [300, 400, 700, 800], italic: false, license: OFL, url: 'https://uncut.wtf/monospace/martian-mono/' },
  { name: 'Handjet', family: 'Handjet', foundry: 'Rosetta (David Březina)', source: 'self', category: 'Experimental', weights: range(100, 900), variable: [100, 900], italic: false, license: OFL, url: 'https://uncut.wtf/display/handjet/' },
  { name: 'Lil Grotesk', family: 'Lil Grotesk', foundry: 'Bastien Sozeau', source: 'self', category: 'Sans', weights: range(100, 900), variable: [100, 900], italic: false, license: OFL, url: 'https://uncut.wtf/sans-serif/lil-grotesk/' },
  { name: 'Blocks on Blocks', family: 'Blocks on Blocks', foundry: 'Rory King', source: 'self', category: 'Experimental', weights: [400], italic: false, license: OFL, url: 'https://uncut.wtf/display/blocks-on-blocks/' },
  { name: 'Geom', family: 'Geom', foundry: 'Cedric Müller', source: 'self', category: 'Display', weights: [400], italic: false, license: OFL, url: 'https://uncut.wtf/display/geom/' },
  { name: 'Sunday Masthead', family: 'Sunday Masthead', foundry: 'Dennis Grauel', source: 'self', category: 'Display', weights: [400], italic: false, license: OFL, url: 'https://uncut.wtf/display/sunday-masthead/' },

  // ───────── Google Fonts (existing app fonts) ─────────
  { name: 'Inter', family: 'Inter', foundry: 'Rasmus Andersson', source: 'google', category: 'Sans', weights: range(100, 900), variable: [100, 900], italic: false, license: OFL, url: 'https://fonts.google.com/specimen/Inter' },
  { name: 'Space Grotesk', family: 'Space Grotesk', foundry: 'Florian Karsten', source: 'google', category: 'Sans', weights: range(300, 700), variable: [300, 700], italic: false, license: OFL, url: 'https://fonts.google.com/specimen/Space+Grotesk' },
  { name: 'JetBrains Mono', family: 'JetBrains Mono', foundry: 'JetBrains', source: 'google', category: 'Mono', weights: range(100, 800), variable: [100, 800], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/JetBrains+Mono' },
  { name: 'Instrument Serif', family: 'Instrument Serif', foundry: 'Instrument', source: 'google', category: 'Serif', weights: [400], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/Instrument+Serif' },
  { name: 'Space Mono', family: 'Space Mono', foundry: 'Colophon Foundry', source: 'google', category: 'Mono', weights: [400, 700], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/Space+Mono' },

  // ───────── Google Fonts (contemporary additions) ─────────
  { name: 'Instrument Sans', family: 'Instrument Sans', foundry: 'Instrument', source: 'google', category: 'Sans', weights: range(400, 700), variable: [400, 700], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/Instrument+Sans' },
  { name: 'Bricolage Grotesque', family: 'Bricolage Grotesque', foundry: 'Mathieu Triay', source: 'google', category: 'Sans', weights: range(200, 800), variable: [200, 800], italic: false, license: OFL, url: 'https://fonts.google.com/specimen/Bricolage+Grotesque' },
  { name: 'Familjen Grotesk', family: 'Familjen Grotesk', foundry: 'Familjen STHLM', source: 'google', category: 'Sans', weights: range(400, 700), variable: [400, 700], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/Familjen+Grotesk' },
  { name: 'Hanken Grotesk', family: 'Hanken Grotesk', foundry: 'Hanken Design Co.', source: 'google', category: 'Sans', weights: range(100, 900), variable: [100, 900], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/Hanken+Grotesk' },
  { name: 'Inter Tight', family: 'Inter Tight', foundry: 'Rasmus Andersson', source: 'google', category: 'Sans', weights: range(100, 900), variable: [100, 900], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/Inter+Tight' },
  { name: 'Archivo', family: 'Archivo', foundry: 'Omnibus-Type', source: 'google', category: 'Sans', weights: range(100, 900), variable: [100, 900], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/Archivo' },
  { name: 'Darker Grotesque', family: 'Darker Grotesque', foundry: 'Gabriel Lam', source: 'google', category: 'Sans', weights: range(300, 900), variable: [300, 900], italic: false, license: OFL, url: 'https://fonts.google.com/specimen/Darker+Grotesque' },
  { name: 'Fraunces', family: 'Fraunces', foundry: 'Undercase Type', source: 'google', category: 'Serif', weights: range(100, 900), variable: [100, 900], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/Fraunces' },
  { name: 'DM Serif Display', family: 'DM Serif Display', foundry: 'Colophon Foundry', source: 'google', category: 'Serif', weights: [400], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/DM+Serif+Display' },
  { name: 'Young Serif', family: 'Young Serif', foundry: 'Bastien Sozeau', source: 'google', category: 'Serif', weights: [400], italic: false, license: OFL, url: 'https://fonts.google.com/specimen/Young+Serif' },
  { name: 'Newsreader', family: 'Newsreader', foundry: 'Production Type', source: 'google', category: 'Serif', weights: range(200, 800), variable: [200, 800], italic: true, license: OFL, url: 'https://fonts.google.com/specimen/Newsreader' },
  { name: 'Syne', family: 'Syne', foundry: 'Bonjour Monde', source: 'google', category: 'Display', weights: range(400, 800), variable: [400, 800], italic: false, license: OFL, url: 'https://fonts.google.com/specimen/Syne' },
  { name: 'Unbounded', family: 'Unbounded', foundry: 'NaN', source: 'google', category: 'Display', weights: range(200, 900), variable: [200, 900], italic: false, license: OFL, url: 'https://fonts.google.com/specimen/Unbounded' },
  { name: 'Big Shoulders Display', family: 'Big Shoulders Display', foundry: 'Patric King', source: 'google', category: 'Display', weights: range(100, 900), variable: [100, 900], italic: false, license: OFL, url: 'https://fonts.google.com/specimen/Big+Shoulders+Display' },
];

// One stylesheet for every Google family above (verified HTTP 200).
export const GOOGLE_FONTS_CSS =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Inter:wght@100..900',
    'family=Space+Grotesk:wght@300..700',
    'family=JetBrains+Mono:ital,wght@0,100..800;1,100..800',
    'family=Instrument+Serif:ital@0;1',
    'family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700',
    'family=Instrument+Sans:ital,wght@0,400..700;1,400..700',
    'family=Bricolage+Grotesque:wght@200..800',
    'family=Syne:wght@400..800',
    'family=Unbounded:wght@200..900',
    'family=Fraunces:ital,wght@0,100..900;1,100..900',
    'family=DM+Serif+Display:ital@0;1',
    'family=Familjen+Grotesk:ital,wght@0,400..700;1,400..700',
    'family=Hanken+Grotesk:ital,wght@0,100..900;1,100..900',
    'family=Young+Serif',
    'family=Darker+Grotesque:wght@300..900',
    'family=Big+Shoulders+Display:wght@100..900',
    'family=Archivo:ital,wght@0,100..900;1,100..900',
    'family=Newsreader:ital,wght@0,200..800;1,200..800',
    'family=Inter+Tight:ital,wght@0,100..900;1,100..900',
  ].join('&') +
  '&display=swap';

export const fontByName = (name) => FONTS_LIBRARY.find((f) => f.name === name || f.family === name);
