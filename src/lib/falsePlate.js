// Decoy plates.
//
// A decoy is built by putting a *wrong* version of the source image through
// exactly the same pipeline as the real plates — same bands, same occlusion —
// and keeping one plate of the result. That way it carries the same structure
// as everything else in the stack and can only be told apart by what it does
// to the blend, not by how it looks on its own.
import { driftImage, driftMatrix } from './color.js';
import { splitPlates } from './split.js';
import { warpImage } from './warp.js';
import { pick } from './random.js';

export const FALSE_MODES = ['drift', 'warp'];

/**
 * @param {'drift'|'warp'} options.mode how the source is made wrong
 * @returns {{data: Uint8ClampedArray, tint: number[], label: string}}
 */
export function generateFalsePlate({
  mode = 'drift',
  pixels,
  width,
  height,
  plan,
  opacity = 1,
  field = null,
  random = Math.random,
  intensity = 1,
}) {
  const wrong =
    mode === 'warp'
      ? warpImage({ pixels, width, height, random, intensity })
      : driftImage(pixels, driftMatrix(random, intensity));

  const index = pick(random, plan.bandCount);
  const [plate] = splitPlates({
    pixels: wrong,
    width,
    height,
    plan,
    opacity,
    field,
    only: index,
    // Alpha comes from the real source, so a decoy's transparency matches the
    // real plates even when the warp has moved everything around.
    alphaSource: pixels,
  });

  return { data: plate.data, tint: plate.tint, label: 'False' };
}
