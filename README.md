# Chroma Puzzle

A web app for creating and solving chroma puzzles: images decomposed into
semi-transparent colored "plates" that stack to reveal the original picture.
Imagine splitting a photo into its RGB channels, printing them on glass plates,
and stacking them to recreate the original image.
False plates act as decoys to increase difficulty.

## Quick Start

To open: `chroma-puzzle.html` in any modern browser. It is a single
self-contained page — Vue, JSZip, and the styles are inlined, nothing is fetched
at runtime, and it works straight off the filesystem with no server.

## Development

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`npm run build` bundles `src/` into one page and writes it to both
`dist/index.html` and `chroma-puzzle.html`.

## Modes

### Creator

1. Upload an image (PNG/JPG/WebP)
2. Choose 2–4 real chroma plates and 0–4 false plates
3. Adjust plate opacity
4. Preview the blended result with per-plate toggles
5. Export a ZIP of shuffled plate PNGs plus a `puzzle.json` metadata file

### Solver

The solving workspace: it gives you the tooling to work the puzzle out yourself.

1. Load plate PNGs (individually or as a puzzle ZIP)
2. Drag-and-drop plates to reorder the stack (or focus a card and use ↑/↓)
3. Toggle plates on/off — or **solo** one — to work out which are false
4. Watch the blend update in real time
5. If the puzzle carried a `puzzle.json`, the app tells you when the enabled set
   matches the solution hash, without ever revealing which plates those are
6. Export your solution as a flattened PNG

## How It Works

Each plate carries part of the source image's color information at a reduced
alpha. Compositing them with `globalCompositeOperation = 'lighter'` adds their
premultiplied values back together, reconstructing the original. Because
addition is commutative, **stack order never changes the result** (reordering
is for your own organization).

| Plates | Scheme      | Assignment                                               |
| ------ | ----------- | -------------------------------------------------------- |
| 2      | Warm / Cool | R+G, then B                                              |
| 3      | RGB         | one channel each                                         |
| 4      | RGBW        | R/G/B residuals plus a white plate carrying `min(r,g,b)` |

Plate colors are boosted by `1 / plateOpacity` to compensate for the reduced
alpha, so at opacity 1.0 reconstruction is exact. Below 1.0 the boost can clip
bright highlights: the tradeoff for the glass-like look. A gradient test image
at opacity 0.7 reconstructs with a mean error of 1.7/255.

False plates take a real plate as a template, drift its tint in HSL, and rebuild
its content from blocks spliced out of the other real plates, so they match the
image's texture while adding color that does not belong.

## Project Structure

```
chroma-puzzle.html    the shippable single page (build output, committed)
index.html            Vite dev entry
src/
  main.js             app bootstrap
  App.vue             layout, mode switch, status bar
  state.js            shared state and every action
  styles.css          dark theme
  components/         DropZone, PreviewPanel, Creator/Solver panels
  lib/
    color.js          RGB/HSL conversion, tint drift
    split.js          image → chroma plates
    falsePlate.js     decoy plate generation
    composite.js      additive compositing, thumbnails, PNG encoding
    puzzleIO.js       image/ZIP loading, puzzle export
    hash.js           SHA-256 (Web Crypto, with a JS fallback for file://)
test/e2e.mjs          browser end-to-end test
```

## Puzzle Format

`puzzle.zip` holds `puzzle.json` and the plate PNGs, shuffled so that filenames
give nothing away:

```json
{
  "version": "1.0",
  "width": 800,
  "height": 600,
  "numRealPlates": 3,
  "numFalsePlates": 2,
  "totalPlates": 5,
  "plateOpacity": 0.7,
  "tints": [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255]
  ],
  "plateFiles": ["plate_01.png", "…"],
  "solutionHash": "sha256 of the real plates' filenames, sorted and comma-joined",
  "created": "2026-08-20T12:00:00Z"
}
```

## Testing

```bash
npm run build && npm test
```

The test drives the built page in a real browser: it generates a puzzle,
verifies the plates reconstruct the source, checks that a false plate corrupts
the blend, round-trips the ZIP through the solver, and confirms the solution
hash, solo, keyboard reordering, and PNG export. Set `CHROME_PATH` to use a
system browser instead of Playwright's download.

## Browser Support

Chrome 90+, Firefox 88+, Safari 14+, Edge 90+. Requires Canvas, the File API,
and the Drag-and-Drop API.
