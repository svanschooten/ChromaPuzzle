// Occlusion hides the picture inside each individual plate.
//
// Every mode is the same mechanism: a weight field that says, per pixel, how
// much of each band each plate takes. The weights for a band always sum to 1
// across the plates, so whatever one plate gives up another picks up and the
// stack still reconstructs the image exactly. The modes differ only in where
// the weights come from — shards, smooth noise islands, or per-pixel static.
import { createFractureField } from './fracture.js';
import { createBlendField } from './blend.js';
import { createNoiseField } from './noise.js';
import { createScreenField } from './screen.js';

export const OCCLUSION_MODES = ['fracture', 'blend', 'noise', 'screen'];

/**
 * @returns {{planAt: (index: number) => number,
 *            fill: (index: number, thresholds: Float32Array, weights: Float32Array) => void}}
 */
export function createOcclusion({ mode, ...options }) {
  switch (mode) {
    case 'fracture':
      return createFractureField(options);
    case 'blend':
      return createBlendField(options);
    case 'noise':
      return createNoiseField(options);
    case 'screen':
      return createScreenField(options);
    default:
      throw new RangeError(`unknown occlusion mode: ${mode}`);
  }
}
