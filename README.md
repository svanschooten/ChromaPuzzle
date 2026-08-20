# Chroma Puzzle

A web app for creating and solving chroma puzzles: images decomposed into
semi-transparent colored "plates" that stack to reveal the original picture.
Imagine splitting a photo into its RGB channels, printing them on glass plates,
and stacking them to recreate the original image.
False plates act as decoys to increase difficulty.

## Quick Start

Run `npm install && npm run build`, then open `chroma-puzzle.html` in any
modern browser. It is a single self-contained page — Vue, JSZip, and the styles
are inlined, nothing is fetched at runtime, and it works straight off the
filesystem with no server. Published releases are also deployed to [GitHub
Pages](https://svanschooten.github.io/ChromaPuzzle/).

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
3. Adjust plate opacity, and fracture the split if you want a harder puzzle
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

False plates take a real plate as a template, drift its tint, and rebuild its
content from blocks spliced out of the other real plates, so they match the
image's texture while adding color that does not belong.

## Fracture

A plain color band is still a photograph. Split a portrait into RGB and all
three plates are recognizably the same face, which makes for an easy puzzle:
you can tell the real plates from the decoys just by looking at them.

Fracture breaks the image into irregular shards (a jittered-grid Voronoi) and
gives every shard its own split plan:

- **Band reassignment** — which plate carries which color band changes from
  shard to shard, so a plate becomes a patchwork of different bands.
- **Partial leakage** — a band is not handed to one plate whole; a random share
  of it leaks to the others, so brightness jumps at every shard edge.
- **Tonal splitting** — each shard picks a threshold, and the part of a band
  below it goes to a different plate than the part above it, so a shard's
  shadows and highlights land on separate plates.

All three are partitions of the original value into non-negative parts that sum
back to it, which is the only freedom additive compositing allows — and it is
enough. Reconstruction stays exact: shares are handed out by cumulative
rounding, so the integers still add up. The `Fracture` slider runs from the
canonical split (0%) to fully shuffled (100%), and `Shard Size` sets how fine
the shards are.

Decoys follow the same structure. Against a plain split a false plate is one
drifted hue, because the real plates are single hues and a patchy decoy would
stand out; against a fractured split it is built on the same shard map, with
each shard sampled from a random real plate and drifted on its own.

One limit is inherent to additive splitting: a black pixel is zero, and zero
has nothing to distribute, so pure blacks stay black on every plate. Dark
features and a subject's silhouette survive fracturing — it hides the picture,
it does not encrypt it.

At the 2048px cap a fully fractured 4-plate split takes roughly two seconds,
and each false plate about half a second more.

## Project Structure

```
chroma-puzzle.html    the shippable single page (build output, not tracked)
index.html            Vite dev entry
src/
  main.js             app bootstrap
  App.vue             layout, mode switch, status bar
  state.js            shared state and every action
  styles.css          dark theme
  components/         DropZone, PreviewPanel, Creator/Solver panels
  lib/
    color.js          color matrices and tint drift
    split.js          image → chroma plates, plain or fractured
    fracture.js       shard map and per-shard split plans
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
  "version": "1.1",
  "width": 800,
  "height": 600,
  "numRealPlates": 3,
  "numFalsePlates": 2,
  "totalPlates": 5,
  "plateOpacity": 0.7,
  "fracture": { "strength": 0.6, "shardSize": 32 },
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

## Browser Support

Chrome 90+, Firefox 88+, Safari 14+, Edge 90+. Requires Canvas, the File API,
and the Drag-and-Drop API.
