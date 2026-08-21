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
    cells: settings.cells,
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

  // A plate with nothing on it cannot be told apart by eye or by blend, so the
  // solver would only be guessing about it. Worth reporting back.
  for (const plate of plates) plate.weak = isNearlyEmpty(plate.data);

  return {
    plates,
    cuts: plan.cuts,
    histograms: plan.histograms,
    shardCount: field?.shards?.count ?? 0,
  };
}

/** True when a plate carries almost no light at all. */
export function isNearlyEmpty(data) {
  const step = Math.max(4, Math.floor(data.length / 40000)) * 4;
  let sum = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += step) {
    sum += data[i] + data[i + 1] + data[i + 2];
    samples += 3;
  }
  return samples > 0 && sum / samples < 1.5;
}
