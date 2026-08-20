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
