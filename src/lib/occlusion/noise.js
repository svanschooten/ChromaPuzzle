// Noise occlusion: per-pixel static. Each pixel's bands are split between the
// plates by random shares that sum to one, so every plate is coloured snow.
import { createHashRandom } from '../random.js';
import { createShareField } from './weights.js';

/** Integer power by repeated squaring — cheaper than Math.pow per pixel. */
function sharpen(value, exponent) {
  let result = value;
  for (let i = 1; i < exponent; i++) result *= value;
  return result;
}

export function createNoiseField({ plateCount, bandCount, strength, random }) {
  // Addressed by pixel rather than drawn in sequence, so sampling the field
  // twice — or rendering a single plate — gives identical results.
  const hash = createHashRandom((random() * 2 ** 32) >>> 0);
  const draws = new Float32Array(plateCount);
  // Without sharpening every plate would hold roughly 1/plateCount of each
  // pixel, which is just a dimmer copy of the image. Raising the draws to a
  // power makes one plate win most of each pixel instead.
  const contrast = 1 + Math.round(strength * 5);

  return createShareField({
    plateCount,
    bandCount,
    strength,
    computeShares(index, shares) {
      let total = 0;
      for (let plate = 0; plate < plateCount; plate++) {
        draws[plate] = 0.01 + sharpen(hash(index, plate), contrast);
        total += draws[plate];
      }
      // Rotating the draws keeps which plate wins moving from pixel to pixel.
      const rotation = Math.floor(hash(index, plateCount) * plateCount) % plateCount;
      for (let plate = 0; plate < plateCount; plate++) {
        shares[plate] = draws[(plate + rotation) % plateCount] / total;
      }
    },
  });
}
