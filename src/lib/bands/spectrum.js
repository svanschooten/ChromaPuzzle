// Spectrum bands: each band owns an arc of the hue wheel.
//
// Additive compositing is linear in RGB, so a color cannot be *converted* into
// hue components that add back up. What works instead is splitting the pixel:
// its chroma is shared between the two nearest band hues by angular distance,
// with the weights summing to 1. Grey has no hue at all, so the achromatic part
// (min(r, g, b)) is sliced tonally across the bands instead.
import { linearCuts, linearRing, tidyCuts, weightedCuts, weightedRing } from './cuts.js';

const HUE_STEPS = 360;

function hueOf(r, g, b, max, chroma) {
  let hue;
  if (max === r) hue = (g - b) / chroma;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/** Hue histogram weighted by chroma, plus a histogram of the achromatic part. */
function analyse(pixels) {
  const hues = new Int32Array(HUE_STEPS);
  const greys = new Int32Array(256);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    greys[min]++;
    const chroma = max - min;
    if (chroma > 0) hues[Math.floor(hueOf(r, g, b, max, chroma)) % HUE_STEPS] += chroma;
  }
  return { hues, greys };
}

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
  const { hues, greys } = analyse(pixels);

  const ring =
    mode === 'manual'
      ? tidyCuts(cuts?.hue, arcCount, HUE_STEPS, { ring: true })
      : mode === 'weighted'
        ? weightedRing(hues, arcCount, HUE_STEPS)
        : linearRing(arcCount, HUE_STEPS);

  // Chroma is shared between the two nearest arc centres.
  const centres = ring.map((start, index) => {
    const end = ring[(index + 1) % arcCount] + (index === arcCount - 1 ? HUE_STEPS : 0);
    return (start + (end - start) / 2) % HUE_STEPS;
  });

  const bandA = new Uint8Array(HUE_STEPS);
  const bandB = new Uint8Array(HUE_STEPS);
  const weightA = new Float32Array(HUE_STEPS);
  for (let hue = 0; hue < HUE_STEPS; hue++) {
    let index = -1;
    for (let arc = 0; arc < arcCount; arc++) {
      if (centres[arc] <= hue) index = index === -1 || centres[arc] > centres[index] ? arc : index;
    }
    if (index === -1) index = centres.indexOf(Math.max(...centres)); // wrapped past the last centre
    const next = (index + 1) % arcCount;
    let span = centres[next] - centres[index];
    if (span <= 0) span += HUE_STEPS;
    let offset = hue - centres[index];
    if (offset < 0) offset += HUE_STEPS;
    bandA[hue] = index % plateCount;
    bandB[hue] = next % plateCount;
    weightA[hue] = 1 - Math.min(1, offset / span);
  }

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
      tint: wheelTint(centres[band]),
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
      const first = bandA[hue];
      const second = bandB[hue];
      const share = weightA[hue];
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
