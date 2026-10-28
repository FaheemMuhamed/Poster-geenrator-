# Poster Generator

A live, interactive generative poster maker. Pick a mode, move the mouse over the poster, shape it in the inspector, and export a high-resolution PNG, a video or embed code.

Built with [p5.js](https://p5js.org) (2D modes), [three.js](https://threejs.org) (3D + shader modes), and a [shadcn/ui](https://ui.shadcn.com) interface (React + Tailwind, bundled with Vite).

## Using it

- **Left:** the 15 modes, grouped into 2D, 3D and Shader.
- **Top bar:** format (A-series, 4:5, 9:16, square, landscape), pause, new variation, "surprise me", and **Export**.
- **Right, the inspector:** four tabs, each starting with the essentials. Everything else is folded underneath.
  - **Shape:** 3–4 essential controls for the current mode, then folded groups (Form, Motion, Variation…).
  - **Colour:** palette presets, then fine-tuning of each colour.
  - **Type:** your words, a **layout picker** with live thumbnails, and the typeface. Switch on **Grid** to see the layout's grid as guides; guides are never exported.
  - **Finish:** one-click looks (Clean, Soft print, Dreamy, Halftone, Riso, 2-colour, Glitch, Pixel), then fine-tuning. 2D modes get background bloom and grain here.

**Keyboard:** `R` new variation · `S` save PNG · `Space` pause · `←` `→` switch modes

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
