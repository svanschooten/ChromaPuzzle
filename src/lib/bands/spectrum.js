// Spectrum bands: each band owns an arc of the hue wheel.
//
// Additive compositing is linear in RGB, so a color cannot be *converted* into
// hue components that add back up. What works instead is splitting the pixel:
// its chroma is shared between the two nearest band hues by angular distance,
// with the weights summing to 1. Grey has no hue at all, so the achromatic part
// (min(r, g, b)) is sliced tonally across the bands instead.
import { linearCuts, linearRing, tidyCuts, weightedCuts, weightedRing } from './cuts.js';
import { createRouter } from './router.js';
import { analyseColour, hueOf, HUE_STEPS } from './colour.js';

const wheelTint = (hue) => {
  const sector = hue / 60;
  const x = Math.round(255 * (1 - Math.abs((sector % 2) - 1)));
  const table = [
    [255, x, 0],
    [x, 255, 0],
    [0, 255, x],
    [0, x, 255],
    [x, 0, 255],
    [255, 0, x],
  ];
  return table[Math.min(5, Math.floor(sector))];
};

export function planSpectrumBands({ pixels, plateCount, mode = 'linear', weave = 1, cuts = null }) {
  const arcCount = plateCount * weave;
  const { hue: hues, grey: greys } = analyseColour(pixels);

  const ring =
    mode === 'manual'
      ? tidyCuts(cuts?.hue, arcCount, HUE_STEPS, { ring: true })
      : mode === 'weighted'
        ? weightedRing(hues, arcCount, HUE_STEPS)
        : linearRing(arcCount, HUE_STEPS);

  // Chroma is shared between the two nearest arc centres.
  const arcs = createRouter({ cuts: ring, size: HUE_STEPS, ring: true });

  // Grey carries no hue, so it is sliced by brightness instead.
  const greyCuts =
    mode === 'weighted' ? weightedCuts(greys, arcCount, 255) : linearCuts(arcCount, 255);
  const greyEdges = [0, ...greyCuts, 255];
  const greyLut = new Int32Array(256 * plateCount);
  for (let slice = 0; slice < arcCount; slice++) {
    const band = slice % plateCount;
    const lo = greyEdges[slice];
    const span = greyEdges[slice + 1] - lo;
    for (let value = 0; value <= 255; value++) {
      const amount = Math.min(Math.max(value - lo, 0), span);
      if (amount > 0) greyLut[value * plateCount + band] += amount;
    }
  }

  const bands = Array.from({ length: plateCount }, (_, band) => {
    const start = ring[band];
    const end = ring[(band + 1) % arcCount];
    return {
      tint: wheelTint((start + ((end - start + HUE_STEPS) % HUE_STEPS) / 2) % HUE_STEPS),
      label: `${Math.round(start)}–${Math.round(end)}°${weave > 1 ? ' woven' : ''}`,
    };
  });

  return {
    space: 'spectrum',
    mode,
    weave,
    bandCount: plateCount,
    bands,
    cuts: { hue: ring },
    histograms: { hue: hues, grey: greys },
    values(r, g, b, out) {
      const max = r > g ? (r > b ? r : b) : g > b ? g : b;
      const min = r < g ? (r < b ? r : b) : g < b ? g : b;

      const greyRow = min * plateCount;
      for (let band = 0; band < plateCount; band++) {
        const grey = greyLut[greyRow + band];
        out[band * 3] = grey;
        out[band * 3 + 1] = grey;
        out[band * 3 + 2] = grey;
      }

      const chroma = max - min;
      if (chroma === 0) return;

      const hue = Math.floor(hueOf(r, g, b, max, chroma)) % HUE_STEPS;
      // Arcs beyond the plate count wrap around, which is how weave interleaves.
      const first = arcs.classA[hue] % plateCount;
      const second = arcs.classB[hue] % plateCount;
      const share = arcs.weightA[hue];
      const channels = [r - min, g - min, b - min];
      for (let channel = 0; channel < 3; channel++) {
        const value = channels[channel];
        if (value === 0) continue;
        const toFirst = Math.round(share * value);
        out[first * 3 + channel] += toFirst;
        out[second * 3 + channel] += value - toFirst;
      }
    },
  };
}
