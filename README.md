# Morva

**An archive of generative visuals you can play with.** Morva is a library of live p5.js, three.js and GLSL visuals for designers and creative developers. Shape each one with plain controls, export it as an image, video or embed, and copy standalone code for it.

Live at **https://morva-studio.com**. Brand guide: [docs/BRAND.md](docs/BRAND.md). Built with [p5.js](https://p5js.org), [three.js](https://threejs.org) and a [shadcn/ui](https://ui.shadcn.com) interface (React + Tailwind, bundled with Vite).

## Using it

- **The Morva logo** opens the About page, with a live entry to play with.
- **Create / Explore** (top left) switches between the editor and **Explore**, a 3D universe of 120 example posters. Drag to drift through it and click a poster to see it larger. **Open in editor** loads it with every setting live.
- **Left:** the entries, grouped by what they make: Generative, Type and (coming next) Image. Each shows its library (p5, three or GLSL). You can search them or filter by tag. Hover a mode to see a moving preview. Under the mode name, **How it works** explains the technique and links to its source code.
- **Top bar:** format (A-series, 4:5, 9:16, square, landscape), pause, new variation, the ambient glow switch (lamp icon), **Surprise me** (new settings and colours at once), light/dark mode, **Feedback**, **Support**, and **Export**.
- **Ambient glow:** the poster's colours softly light up the canvas around it, like a TV's ambient light. It never appears in exports.
- **Right, the inspector:** five tabs, each starting with the essentials. Everything else is folded underneath.
  - **Shape:** 3–4 essential controls for the current mode, then folded groups (Form, Motion, Variation…).
  - **Colour:** palette presets (hover one to preview it on the poster), then fine-tuning of each colour.
  - **Type:** your words, a **layout picker** with live thumbnails, and two typefaces: one for the title and one for the text. Each has a weight. Switch on **Grid** to see the layout's grid as guides; guides are never exported. **Typesetting** adds tracking, leading, case, an outline title, and blend modes (Difference / Multiply).
  - **Code:** a standalone HTML file of the current visual with your settings built in. Opens as a terminal window; other entries show Morva's own source for the effect.
  - **Finish:** one-click looks (Clean, Soft print, Dreamy, Halftone, Riso, 2-colour, Glitch, Pixel). Hover one to preview it, then fine-tune. 2D modes get background bloom and grain here.

### Typefaces

The library has 53 families:
- **34 self-hosted:** from [The League of Moveable Type](https://www.theleagueofmoveabletype.com/), [Collletttivo](https://www.collletttivo.it/typefaces), [Open Foundry](https://open-foundry.com/) and [uncut.wtf](https://uncut.wtf/). All are under the SIL Open Font License; see `public/fonts/CREDITS.md`.
- **19 contemporary Google Fonts.**

The font picker can be searched and filtered by category. Credits are listed in the Support dialog.

### Support and feedback

Paste your links into `src/config.js`:
- `DONATE_URL`: a Stripe Payment Link or a Gumroad "pay what you want" product. Until it's set, the Support dialog says "Donations open soon".
- `TALLY_FORM_ID`: the id from your Tally form link (`tally.so/r/<id>`). Feedback arrives with the visitor's mode and poster link.

**Keyboard:** `R` new variation · `X` surprise me · `S` save PNG · `Space` pause · `←` `→` switch modes

### Type layouts

- **Grid Systems**, after Josef Müller-Brockmann's *Grid Systems in Graphic Design*: 8-field, 12-field, 20-field and 32-field grids, a 3-column grid, Swiss 6-column, Stepped and Modular 4×4. The gutter equals one baseline unit, and text hangs from the top line of each field.
- **Book canons:** Van de Graaf, Golden canon, Manuscript, Tschichold's Asymmetric, and Two-column.
- **Free:** Corners, Index strip, Big type, Vertical title, Split, Stacked, Centered, Vertical edge, Along curve.

### Export menu

- **Save PNG / Copy image:** Screen, 2K, 4K or 6K pixels. Copy image goes straight to your clipboard, ready to paste into Figma.
- **Record video:** MP4 (or WebM) of the live poster. Keep moving the mouse while it records.
- **Copy share link:** every setting is stored in the link.
- **Copy embed code:** an `<iframe>` showing the live poster (no interface) on another site, such as Framer, Webflow or Notion. It works once the site is published.
- **Download HTML file:** a single file with your settings baked in. It loads the code from the published site, so it needs internet.
- **Copy / Paste settings JSON:** save a setup as text and load it back later.

## Run it on your computer

You need [Node.js](https://nodejs.org) (the LTS version). Then, in Terminal, inside this folder:

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Changes to the files show up instantly.

## Publish it on the internet (GitHub Pages, free)

You only do this once.

1. **Make a GitHub account** at https://github.com/signup, unless you already have one.
2. **Install GitHub Desktop** from https://desktop.github.com and sign in.
3. In GitHub Desktop: **File → Add Local Repository…** and choose this folder. If it says it isn't a repository yet, click **create a repository** and keep the defaults.
4. Make the first commit: type "First version" in the summary box at the bottom left and click **Commit to main**.
5. Click **Publish repository**. Name it `poster-generator`, **untick "Keep this code private"**, then click Publish.
6. On github.com, open the repository → **Settings → Pages**. Under "Build and deployment", set **Source** to **GitHub Actions**.
7. Go to the **Actions** tab. A "Deploy to GitHub Pages" run starts; when it shows a green tick (about 1–2 minutes), your site is live at `https://YOUR-USERNAME.github.io/poster-generator/`.
   - If no run started, click "Deploy to GitHub Pages" on the left, then **Run workflow**.

## Update the live site

1. Open GitHub Desktop. Changed files are listed on the left.
2. Write a short summary and click **Commit to main**.
3. Click **Push origin**.
4. GitHub rebuilds the site automatically, in about 1–2 minutes. You can watch it in the repository's **Actions** tab.

## Growing the library

To add a new shader or effect, follow [docs/ADDING_A_MODE.md](docs/ADDING_A_MODE.md). It covers the file shape, the registry entry, choosing essentials, and capturing previews and examples with `capture.html`, a page that only runs in development.

## Where things live

```
src/                      the interface (React + shadcn/ui)
  components/Inspector.jsx    the right panel: tabs, presets, sections
  components/LayoutPicker.jsx layout thumbnails
  components/ui/              shadcn components
js/engine.js              poster engine: settings, animation loop, exports
js/modes/index.js         the list of modes
js/modes/controls.js      which settings are "essentials" for each mode (easy to edit)
js/modes/p5|three|shader/ the modes themselves
js/shared/palettes.js     colour presets (just hex colours: easy to edit)
js/shared/typeLayer.js    type layouts and grids
js/shared/postfx.js       finish effects
.github/workflows/        the automatic publish to GitHub Pages
```
