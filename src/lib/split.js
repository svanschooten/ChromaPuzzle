// Splits a source image into semi-transparent chroma plates (design doc 2.2),
// optionally fracturing the split across shards to make single plates unreadable.
import { clamp255 } from './color.js';

export const SCHEMES = {
  2: {
    label: 'Warm / Cool',
    bands: [
      { tint: [255, 255, 0], label: 'Warm (R+G)' },
      { tint: [0, 0, 255], label: 'Cool (B)' },
    ],
  },
  3: {
    label: 'RGB',
    bands: [
      { tint: [255, 0, 0], label: 'Red' },
      { tint: [0, 255, 0], label: 'Green' },
      { tint: [0, 0, 255], label: 'Blue' },
    ],
  },
  4: {
    label: 'RGBW',
    bands: [
      { tint: [255, 0, 0], label: 'Red residual' },
      { tint: [0, 255, 0], label: 'Green residual' },
      { tint: [0, 0, 255], label: 'Blue residual' },
      { tint: [255, 255, 255], label: 'White (luminance)' },
    ],
  },
};

function emptyPlates(width, height, numPlates) {
  const scheme = SCHEMES[numPlates];
  return scheme.bands.map((band) => ({
    data: new Uint8ClampedArray(width * height * 4),
    tint: band.tint,
    bandLabel: band.label,
  }));
}

/**
 * Per-pixel band contributions: `out[band * 3 + channel]`. The bands always sum
 * back to the original pixel, which is what makes the plates reconstruct it.
 */
function bandContributions(numPlates, r, g, b, out) {
  out.fill(0);
  if (numPlates === 2) {
    out[0] = r;
    out[1] = g;
    out[5] = b;
  } else if (numPlates === 3) {
    out[0] = r;
    out[4] = g;
    out[8] = b;
  } else {
    const k = Math.min(r, g, b); // common luminance carried by the white plate
    out[0] = r - k;
    out[4] = g - k;
    out[8] = b - k;
    out[9] = k;
    out[10] = k;
    out[11] = k;
  }
}

/** Which bands touch a given channel, per scheme — the fractured loop's index. */
const CHANNEL_BANDS = {
  2: [[0], [0], [1]],
  3: [[0], [1], [2]],
  4: [
    [0, 3],
    [1, 3],
    [2, 3],
  ],
};

/**
 * @param {Uint8ClampedArray} src RGBA source pixels
 * @param {{map: Int32Array, plans: object}|null} fracture
 * @returns {{data: Uint8ClampedArray, tint: number[], bandLabel: string}[]}
 */
export function splitPlates(src, width, height, numPlates, plateOpacity, fracture = null) {
  return fracture
    ? splitFractured(src, width, height, numPlates, plateOpacity, fracture)
    : splitCanonical(src, width, height, numPlates, plateOpacity);
}

/** The plain split: one whole colour band per plate. */
function splitCanonical(src, width, height, numPlates, plateOpacity) {
  const comp = 1 / plateOpacity;
  const out = emptyPlates(width, height, numPlates);
  const total = width * height;

  for (let i = 0; i < total; i++) {
    const j = i * 4;
    const r = src[j],
      g = src[j + 1],
      b = src[j + 2],
      a = src[j + 3];
    const pa = Math.round(a * plateOpacity);

    if (numPlates === 2) {
      const d0 = out[0].data,
        d1 = out[1].data;
      d0[j] = clamp255(r * comp);
      d0[j + 1] = clamp255(g * comp);
      d0[j + 3] = pa;
      d1[j + 2] = clamp255(b * comp);
      d1[j + 3] = pa;
    } else if (numPlates === 3) {
      const d0 = out[0].data,
        d1 = out[1].data,
        d2 = out[2].data;
      d0[j] = clamp255(r * comp);
      d0[j + 3] = pa;
      d1[j + 1] = clamp255(g * comp);
      d1[j + 3] = pa;
      d2[j + 2] = clamp255(b * comp);
      d2[j + 3] = pa;
    } else {
      const k = Math.min(r, g, b);
      const d0 = out[0].data,
        d1 = out[1].data,
        d2 = out[2].data,
        d3 = out[3].data;
      d0[j] = clamp255((r - k) * comp);
      d0[j + 3] = pa;
      d1[j + 1] = clamp255((g - k) * comp);
      d1[j + 3] = pa;
      d2[j + 2] = clamp255((b - k) * comp);
      d2[j + 3] = pa;
      const kc = clamp255(k * comp);
      d3[j] = kc;
      d3[j + 1] = kc;
      d3[j + 2] = kc;
      d3[j + 3] = pa;
    }
  }
  return out;
}

/**
 * The fractured split. Each shard hands every band's dark and bright halves to
 * different plates in different proportions. Shares are handed out by
 * cumulative rounding, so the integer values still add up to the original.
 */
function splitFractured(src, width, height, numPlates, plateOpacity, { map, plans }) {
  const comp = 1 / plateOpacity;
  const out = emptyPlates(width, height, numPlates);
  const datas = out.map((plate) => plate.data);
  const { thresholds, weights, bandCount } = plans;
  const channelBands = CHANNEL_BANDS[numPlates];
  const contrib = new Float32Array(bandCount * 3);
  const total = width * height;

  for (let i = 0; i < total; i++) {
    const j = i * 4;
    const a = src[j + 3];
    const pa = Math.round(a * plateOpacity);
    for (let p = 0; p < numPlates; p++) datas[p][j + 3] = pa;
    if (a === 0) continue;

    bandContributions(numPlates, src[j], src[j + 1], src[j + 2], contrib);
    const shard = map[i];

    for (let c = 0; c < 3; c++) {
      const bands = channelBands[c];
      for (let n = 0; n < bands.length; n++) {
        const band = bands[n];
        const value = contrib[band * 3 + c];
        if (value <= 0) continue;

        const slot = shard * bandCount + band;
        const low = Math.min(value, thresholds[slot]);
        const base = slot * 2 * numPlates;

        // Dark half, then bright half — each spread over the plates.
        for (let half = 0; half < 2; half++) {
          const amount = (half === 0 ? low : value - low) * comp;
          if (amount <= 0) continue;
          const offset = base + half * numPlates;
          let acc = 0;
          let previous = 0;
          for (let p = 0; p < numPlates; p++) {
            acc += weights[offset + p] * amount;
            const rounded = Math.round(acc);
            if (rounded !== previous) datas[p][j + c] += rounded - previous;
            previous = rounded;
          }
        }
      }
    }
  }
  return out;
}
