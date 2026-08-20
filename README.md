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
2. Choose 2–16 real chroma plates and 0–16 decoys
3. Pick the band space (channels or spectrum), how the cuts are placed, whether
   to weave them, how decoys are built, and whether to occlude the plates
4. Preview the blended result with per-plate toggles
5. Export a ZIP of shuffled plate PNGs plus a `puzzle.json` metadata file

Generation runs in a Web Worker, so the interface stays responsive while eight
plates and eight decoys are being built. If a browser refuses to start the
worker — some `file://` origins do — the app quietly runs the same code on the
main thread instead.

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

### Bands

A **band** is a share of the pixel. The bands always add back up to the source,
which is what makes the plates reconstruct it. Two spaces decide what a band
owns:

| Space        | A band owns                                                        |
| ------------ | ------------------------------------------------------------------ |
| **Channels** | A tonal interval of one or more RGB channels                       |
| **Spectrum** | An arc of the hue wheel, plus a tonal slice of the achromatic part |

Additive compositing is linear in RGB, so a color cannot be _converted_ into
hue components that add back up. Splitting works instead: a pixel's chroma is
shared between the two nearest band hues by angular distance, with the weights
summing to 1. Grey has no hue, so `min(r, g, b)` is sliced by brightness.

Channels is the original scheme, and beyond three plates it has to slice tonally
— one plate takes dark reds, the next bright reds. Spectrum spreads evenly over
any number of plates instead, at roughly 25% more compute.

| Split        | How the cuts are placed                                     |
| ------------ | ----------------------------------------------------------- |
| **Linear**   | Equal parts. Three channel plates give the plain RGB split. |
| **Weighted** | A histogram places them so every band carries equal image.  |
| **Manual**   | Drag them yourself, over the histogram they came from.      |

Weighted mode matters most in spectrum space: an image with two dominant hues
would otherwise leave four of six plates carrying nothing but grey.

Two plates cannot give each channel its own band, so channels group up (warm
`R+G` against cool `B`). Weighted mode groups channels the image barely uses for
the same reason.

### Weave

`Weave ×w` cuts `plates × w` slices instead of `plates`, then deals them round
the plates: plate 1 takes slice 1, `N+1`, `2N+1`, and so on. Each plate ends up
with a comb spread across the whole range rather than one solid block, which
breaks up the light-red/dark-red pairing that plain slicing produces. It costs
nothing at generation time — the slices collapse into a lookup table.

### Opacity

Plate colors are boosted by `1 / plateOpacity` to make up for the reduced alpha.
The default of **1.00 boosts nothing** and reconstructs the source exactly.
Lower values give the glass-like look at the cost of clipping bright highlights.

### Decoys

A decoy is a _wrong_ version of the source put through exactly the same
pipeline as the real plates — same bands, same occlusion — keeping one plate of
the result. It therefore carries the same structure as everything else in the
stack and can only be told apart by what it does to the blend.

| Mode            | What makes it wrong                                    |
| --------------- | ------------------------------------------------------ |
| **Color drift** | The image's hue, saturation and lightness are shifted. |
| **Image warp**  | The image is swirled, rippled or pinched out of shape. |

`Decoy Intensity` scales how far either goes. Subtle decoys are harder to spot
and harder to rule out.

## Occlusion

A plain color band is still a photograph. Split a portrait into RGB and all
three plates are recognizably the same face, which makes for an easy puzzle: you
can tell the real plates from the decoys just by looking at them. Occlusion
hides the picture inside each individual plate.

All three modes are the same mechanism — a weight field that says, per pixel,
how much of each band each plate takes. A band's weights always sum to 1 across
the plates, so whatever one plate gives up another picks up, and the stack still
reconstructs the source **exactly**. They differ only in where the weights come
from.

| Mode         | Weights come from                                         | Looks like        |
| ------------ | --------------------------------------------------------- | ----------------- |
| **Fracture** | Irregular shards (a jittered-grid Voronoi), one plan each | Stained glass     |
| **Blend**    | Soft fractal-noise islands, one mask per plate            | Torn color washes |
| **Noise**    | Per-pixel static, redrawn for every pixel                 | Colored snow      |

Fracture additionally splits tones: each shard picks a threshold, and the part
of a band below it goes to a different plate than the part above it, so a
shard's shadows and highlights land on separate sheets.

The masks in blend and noise mode are sharpened before they are normalized.
Proportional masks would leave every plate holding `1/plateCount` of the image —
a faded copy, still perfectly recognizable. Sharpening makes the plates compete,
so each takes nearly a whole band where it wins and almost nothing where it
loses. `Strength` controls both the contrast and how far the weights move from
the plain split.

Occlusion hides the picture; it does not encrypt it. A black pixel is zero and
has nothing to distribute, so silhouettes survive, and a plate's local average
can never be independent of the image. Fracture at a small shard size hides the
most; blend at a large island size leaves whole features legible.

## Performance

Generation runs in a Web Worker, with a progress line and an estimate in the UI.
Splitting costs roughly `plates²` under occlusion, so plate counts are capped at
**16**, and above **8** the estimate warns that it will take a while. Source
images are capped at 2048px on the long edge.

Measured at 1200×900, split only:

| plates | plain | fracture | blend  | noise  |
| ------ | ----- | -------- | ------ | ------ |
| 4      | 73ms  | 494ms    | 487ms  | 557ms  |
| 8      | 124ms | 954ms    | 1408ms | 1315ms |
| 16     | 174ms | 2192ms   | 4350ms | 4755ms |

Decoys stay near-flat (200ms → 506ms across the same range): without occlusion a
band goes straight to its plate, and a decoy — one plate, never part of the sum —
skips the cumulative pass over the others.

## Project Structure

```
chroma-puzzle.html    the shippable single page (build output, not tracked)
index.html            Vite dev entry
src/
  main.js             app bootstrap
  App.vue             layout, mode switch, status bar
  state.js            shared state and every action
  styles.css          dark theme
  components/         DropZone, PreviewPanel, BandCuts, Creator/Solver panels
  lib/
    bands/
      index.js        band planning: spaces, modes, weave, limits
      channels.js     tonal slices of RGB channels
      spectrum.js     hue arcs plus achromatic slices
      cuts.js         linear, histogram-weighted and hand-placed cuts
    cost.js           generation time estimate
    split.js          bands + weight field → plates
    generate.js       the whole generation run, DOM-free
    falsePlate.js     decoy plates
    warp.js           swirl/ripple/pinch warps for decoys
    color.js          color matrices and tint drift
    random.js         seeded and position-addressed randomness
    composite.js      additive compositing, thumbnails, PNG encoding
    puzzleIO.js       image/ZIP loading, puzzle export
    hash.js           SHA-256 (Web Crypto, with a JS fallback for file://)
    occlusion/
      index.js        mode registry
      weights.js      the ease-to-identity helper
      fracture.js     shard map and per-shard plans
      blend.js        fractal-noise island masks
      noise.js        per-pixel static masks
      valueNoise.js   fractal value noise
  worker/
    generate.worker.js   runs generation off the UI thread
    generateClient.js    worker with a main-thread fallback
test/unit/            node:test unit suites
test/e2e.mjs          browser end-to-end test
```

## Puzzle Format

`puzzle.zip` holds `puzzle.json` and the plate PNGs, shuffled so that filenames
give nothing away:

```json
{
  "version": "1.2",
  "width": 800,
  "height": 600,
  "numRealPlates": 6,
  "numFalsePlates": 3,
  "totalPlates": 9,
  "plateOpacity": 1,
  "bandSpace": "spectrum",
  "bandMode": "weighted",
  "weave": 3,
  "falseMode": "warp",
  "decoyIntensity": 0.6,
  "occlusion": { "mode": "fracture", "strength": 0.6, "shardSize": 32, "scale": 40 },
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

`npm test` runs both suites.

**Unit** (`npm run test:unit`, `node:test`, no browser) covers the parts where
correctness is a property rather than a pixel: that bands partition every
channel for every plate count and mode, that weighted planning really does even
out how much image each band carries, that every occlusion mode's weights sum
to 1 for every band at every pixel, that plates reconstruct the source with zero
error at opacity 1, and that decoys carry a real plate's alpha but never
duplicate one. Generation is seeded, so all of it is reproducible.

**End to end** (`npm run test:e2e`) drives the built page in Chromium: it
generates puzzles across plate counts, band modes, decoy modes and every
occlusion mode, checks each one still reconstructs exactly, round-trips a ZIP
through the solver, and verifies the solution hash, solo, keyboard reordering
and PNG export. Set `CHROME_PATH` to use a system browser instead of
Playwright's download.

## Continuous Integration

`.github/workflows/continuous-integration-workflow.yml` runs on pushes to
`main`, on pull requests, and on demand: `test` builds the page and runs both
suites in Chromium, `formatting` runs `prettier --check`, `fallow` reports
static analysis (advisory), and `build` uploads the page as an artifact.

## Releases

Publishing a GitHub release builds the page from its tag and deploys it to
GitHub Pages. Two settings must be in place:

1. **Settings → Pages → Source: GitHub Actions**
2. **Settings → Environments → `github-pages` → Deployment branches and tags**:
   add a **tag** rule for `v*` (and a branch rule for `main`). The default
   policy allows the default branch only, so a release deploying from its tag is
   rejected without it.

`workflow_dispatch` redeploys from `main` at any time.

## Browser Support

Chrome 90+, Firefox 88+, Safari 14+, Edge 90+. Requires Canvas, the File API,
and the Drag-and-Drop API.
