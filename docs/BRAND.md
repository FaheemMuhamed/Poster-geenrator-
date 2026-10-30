# Morva brand

**Morva** comes from *morph*: shapes that keep changing. It's a visualiser and reference library of generative visuals made with p5.js, three.js and GLSL. Designers play with each visual live, see how it works, export it, and copy its code. The long-term plan is an archive of these techniques.

Direction: **Catalogue**. A museum archive meets Swiss design. The interface is quiet and systematic, like index cards, so the visuals carry the colour.

## Positioning
- **For** graphic and visual designers first, and creative developers second.
- **What it is:** a library of generative, image and type effects that you can tweak, export and understand, without writing code.
- **Unlike** Shadertoy or OpenProcessing (code-first feeds), every Morva entry is explained, credited, tweakable and exportable.
- **Line:** *An archive of generative visuals you can play with.*

## Voice
- Plain, calm, precise. A curator who also makes things, not a developer manual.
- Name techniques properly and credit their origin ("Gray–Scott, 1984").
- Short sentences, sentence case, active verbs. Use no exclamation marks; the visuals bring the excitement.
- Call them **visuals** and **entries**, not "posters". Keep "poster" only for poster-specific features such as print formats and type layouts.
- Examples:
  - "Entry 014. First described by Gray and Scott in 1984."
  - "Added to your collection."
  - "Copied. Paste it into any p5 sketch."

## Logo
- **Wordmark:** *Morva* in Newsreader Italic (opsz 72, weight 400, tracking −3%).
- **Mark:** the *seal*, a signal-orange shape that slowly morphs from a disc into a square and back.
  - Static uses, such as the favicon, show it as a rounded square.
  - The mark sits to the left of the wordmark at cap height.
- **Clear space:** the height of the mark on every side.
- Never recolour the wordmark. It is ink in light mode and paper in dark mode. The seal is always signal orange.

## Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| Archive (stage) | `#E9E9E6` | `#0F0F0E` | behind the visual |
| Panel (background) | `#F7F7F5` | `#161615` | sidebars, top bar |
| Card / popover | `#FFFFFF` | `#1D1D1C` | menus, dialogs |
| Ink (foreground) | `#111111` | `#EDEDEA` | text, primary buttons |
| Soft ink | `#6B6B66` | `#9A9A94` | secondary text |
| Rule (border) | `#D9D9D5` | `#2B2B29` | hairlines |
| Chip (muted) | `#ECECEA` | `#222221` | segmented controls, chips |
| **Signal** | `#FF4A1C` | `#FF5A2E` | the seal, Surprise me, focus moments; use sparingly |

Neutrals are warm-grey, never pure grey. Signal is the only accent in the interface.

## Type
- **Wordmark only:** Newsreader Italic. It's used for the Morva logo and nothing else.
- **Headings:** Archivo Semibold with slightly tight tracking.
- **Interface:** Archivo, weights 400 to 600. Labels are sentence case, never all caps.
- **Values and code:** JetBrains Mono, used for numbers in controls, code and catalogue numbers.
- **Scale (px):** 11 · 12 · 13 (base) · 15 · 20 · 28 · 44.

## Shape and motion
- **Radius:** 5px for panels, 3px for controls. Pills are not used, except for filter chips.
- **Shadows:** almost none; separation comes from hairlines and the archive grey.
- **Motion:** measured, 200 to 450 ms on `cubic-bezier(0.2, 0, 0, 1)`. The one loud moment is **Surprise me**: a burst in the new palette's colours.
- `prefers-reduced-motion` is always respected.

## Categories
Entries are grouped by what they make, not by library:
- **Generative:** noise, particles, simulation and 3D form.
- **Type:** kinetic and typographic visuals.
- **Image:** effects applied to your own image. Coming next.

Each entry shows its library (p5.js, three.js or GLSL) as a small label.
