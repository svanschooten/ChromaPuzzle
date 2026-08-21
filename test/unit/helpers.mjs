// Shared fixtures for the unit suites.

/** A deterministic image with all three channels varying independently. */
export function gradient(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const j = (y * width + x) * 4;
      pixels[j] = Math.round((255 * x) / Math.max(1, width - 1));
      pixels[j + 1] = Math.round((255 * y) / Math.max(1, height - 1));
      pixels[j + 2] = (x * 7 + y * 13) % 256;
      pixels[j + 3] = 255;
    }
  }
  return pixels;
}

/** An image dominated by one channel, for testing weighted band planning. */
export function skewed(width, height, channel) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const j = i * 4;
    pixels[j] = 12;
    pixels[j + 1] = 12;
    pixels[j + 2] = 12;
    pixels[j + channel] = 40 + (i % 216);
    pixels[j + 3] = 255;
  }
  return pixels;
}

/** Adds every plate's channel values back together, the way `lighter` does. */
export function sumPlates(plates, pixelCount) {
  const total = new Int32Array(pixelCount * 3);
  for (const plate of plates) {
    for (let i = 0; i < pixelCount; i++) {
      for (let c = 0; c < 3; c++) total[i * 3 + c] += plate.data[i * 4 + c];
    }
  }
  return total;
}

export function maxReconstructionError(plates, source, pixelCount) {
  const total = sumPlates(plates, pixelCount);
  let worst = 0;
  for (let i = 0; i < pixelCount; i++) {
    for (let c = 0; c < 3; c++) {
      worst = Math.max(worst, Math.abs(total[i * 3 + c] - source[i * 4 + c]));
    }
  }
  return worst;
}

/** A picture with several hues, a bright-to-dark range and washed-out areas. */
export function colourful(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const j = (y * width + x) * 4;
      const hue = ((x / width) * 360 + (y % 3) * 40) % 360;
      const sector = hue / 60;
      const fade = 0.25 + 0.75 * (y / height);
      const mix = Math.round(255 * (1 - Math.abs((sector % 2) - 1)));
      const wheel = [
        [255, mix, 0],
        [mix, 255, 0],
        [0, 255, mix],
        [0, mix, 255],
        [mix, 0, 255],
        [255, 0, mix],
      ][Math.min(5, Math.floor(sector))];
      const grey = (x * 37 + y * 11) % 90;
      pixels[j] =
        Math.round(wheel[0] * fade) + grey > 255 ? 255 : Math.round(wheel[0] * fade) + grey;
      pixels[j + 1] = Math.min(255, Math.round(wheel[1] * fade) + grey);
      pixels[j + 2] = Math.min(255, Math.round(wheel[2] * fade) + grey);
      pixels[j + 3] = 255;
    }
  }
  return pixels;
}

/**
 * The awkward case for colour cells: hue, chroma and value all rise together,
 * so the class numbers move in lockstep and their sum lands on a sublattice.
 */
export function correlated(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (x + y) / (width + height - 2);
      const value = Math.round(40 + 200 * t);
      const chroma = Math.round(20 + 150 * t);
      const j = (y * width + x) * 4;
      pixels[j] = value;
      pixels[j + 1] = Math.max(0, value - Math.round(chroma * 0.6));
      pixels[j + 2] = Math.max(0, value - chroma);
      pixels[j + 3] = 255;
    }
  }
  return pixels;
}
