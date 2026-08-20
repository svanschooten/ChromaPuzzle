// Splits a source image into semi-transparent chroma plates (design doc 2.2).
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

/**
 * @param {Uint8ClampedArray} src RGBA source pixels
 * @returns {{data: Uint8ClampedArray, tint: number[], bandLabel: string}[]}
 */
export function splitPlates(src, width, height, numPlates, plateOpacity) {
  const comp = 1 / plateOpacity;
  const scheme = SCHEMES[numPlates];
  const out = [];
  for (let p = 0; p < numPlates; p++) {
    out.push({
      data: new Uint8ClampedArray(width * height * 4),
      tint: scheme.bands[p].tint,
      bandLabel: scheme.bands[p].label,
    });
  }

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
      const k = Math.min(r, g, b); // common luminance carried by the white plate
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
