// Puzzle generation, start to finish. Pure computation with no DOM in sight,
// so it runs the same in a worker or on the main thread.
import { planBands } from './bands/index.js';
import { splitPlates } from './split.js';
import { generateFalsePlate } from './falsePlate.js';
import { createOcclusion } from './occlusion/index.js';
import { createRandom } from './random.js';

/**
 * @param {object} options.settings plateCount, falseCount, opacity, bandMode,
 *   falseMode, occlusion ({mode, strength, shardSize, scale} or null), seed
 * @param {(text: string) => void} [options.onProgress]
 * @returns {{plates: {data: Uint8ClampedArray, tint: number[], label: string, isFalse: boolean}[],
 *            cuts: object, shardCount: number}}
 */
export function generatePuzzle({ pixels, width, height, settings, onProgress = () => {} }) {
  const { plateCount, falseCount, opacity, bandMode, falseMode, occlusion, seed } = settings;
  const random = createRandom(seed);

  onProgress('Analysing color bands…');
  const plan = planBands({
    pixels,
    plateCount,
    space: settings.bandSpace,
    mode: bandMode,
    weave: settings.weave,
    cuts: settings.cuts,
  });

  const field = occlusion
    ? createOcclusion({
        mode: occlusion.mode,
        strength: occlusion.strength,
        shardSize: occlusion.shardSize,
        scale: occlusion.scale,
        plateCount,
        bandCount: plan.bandCount,
        width,
        height,
        random,
      })
    : null;

  onProgress('Splitting the image…');
  const real = splitPlates({ pixels, width, height, plan, opacity, field });
  const plates = real.map((plate, index) => ({
    data: plate.data,
    tint: plate.tint,
    label: `Plate ${index + 1}`,
    bandLabel: plate.label,
    isFalse: false,
  }));

  for (let i = 0; i < falseCount; i++) {
    onProgress(`Building decoy ${i + 1} of ${falseCount}…`);
    const decoy = generateFalsePlate({
      mode: falseMode,
      pixels,
      width,
      height,
      plan,
      opacity,
      field,
      random,
      intensity: settings.decoyIntensity ?? 1,
    });
    plates.push({
      data: decoy.data,
      tint: decoy.tint,
      label: `Plate ${plates.length + 1} (False)`,
      bandLabel: 'False',
      isFalse: true,
    });
  }

  return {
    plates,
    cuts: plan.cuts,
    histograms: plan.histograms,
    shardCount: field?.shards?.count ?? 0,
  };
}
