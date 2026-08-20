// Blend occlusion: one soft noise mask per plate, normalised so that whatever
// one plate is masked out of, the others pick up.
import { fractalNoise } from './valueNoise.js';
import { createShareField } from './weights.js';

export function createBlendField({
  width,
  height,
  plateCount,
  bandCount,
  strength,
  scale = 64,
  random,
}) {
  const pixelCount = width * height;
  // Proportional masks would leave every plate holding a faded copy of the
  // picture, because the shares average out to 1/plateCount everywhere.
  // Sharpening makes the masks compete instead: inside its own islands a plate
  // takes nearly the whole band, and outside them almost nothing.
  const contrast = 1 + strength * 7;
  const masks = new Uint8Array(plateCount * pixelCount);
  for (let plate = 0; plate < plateCount; plate++) {
    const field = fractalNoise({ width, height, scale, random });
    for (let i = 0; i < pixelCount; i++) {
      masks[plate * pixelCount + i] = 2 + Math.round(253 * field[i] ** contrast);
    }
  }

  return createShareField({
    plateCount,
    bandCount,
    strength,
    computeShares(index, shares) {
      let total = 0;
      for (let plate = 0; plate < plateCount; plate++) {
        shares[plate] = masks[plate * pixelCount + index];
        total += shares[plate];
      }
      for (let plate = 0; plate < plateCount; plate++) shares[plate] /= total;
    },
  });
}
