// Colour coordinates shared by the band spaces.

export const HUE_STEPS = 360;

/** Hue in degrees, given the pixel's max channel and its chroma. */
export function hueOf(r, g, b, max, chroma) {
  let hue;
  if (max === r) hue = (g - b) / chroma;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/** Writes [hue, chroma, value, grey] for one pixel into `out`. */
export function coordinatesAt(pixels, index, out) {
  const r = pixels[index];
  const g = pixels[index + 1];
  const b = pixels[index + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  out[0] = span > 0 ? Math.floor(hueOf(r, g, b, max, span)) % HUE_STEPS : 0;
  out[1] = span;
  out[2] = max;
  out[3] = min;
  return out;
}

/**
 * One pass over the image for every axis a band space might cut on: hue
 * (weighted by chroma, so washed-out pixels do not sway it), how colourful
 * pixels are, how bright they are, and how much grey they carry.
 */
export function analyseColour(pixels) {
  const hue = new Int32Array(HUE_STEPS);
  const chroma = new Int32Array(256);
  const value = new Int32Array(256);
  const grey = new Int32Array(256);

  const at = new Int32Array(4);
  for (let i = 0; i < pixels.length; i += 4) {
    coordinatesAt(pixels, i, at);
    value[at[2]]++;
    chroma[at[1]]++;
    grey[at[3]]++;
    if (at[1] > 0) hue[at[0]] += at[1];
  }
  return { hue, chroma, value, grey };
}
