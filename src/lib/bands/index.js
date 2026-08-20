// Band planning: how the image's color is carved up between plates.
//
// Every plan answers one question — given a pixel, how much of each channel
// does each band take — and the answer always adds back up to the pixel. That
// is what makes the plates reconstruct the image.
import { planChannelBands } from './channels.js';
import { planSpectrumBands } from './spectrum.js';

export const MIN_PLATES = 2;
export const MAX_PLATES = 16;
/** Above this, generation gets slow enough to be worth warning about. */
export const SOFT_PLATE_LIMIT = 8;

export const BAND_SPACES = ['channels', 'spectrum'];
export const BAND_MODES = ['linear', 'weighted', 'manual'];
export const MAX_WEAVE = 8;

/**
 * @param {object} options
 * @param {Uint8ClampedArray} options.pixels source image
 * @param {number} options.plateCount 2..MAX_PLATES
 * @param {'channels'|'spectrum'} [options.space] RGB channels, or hue arcs
 * @param {'linear'|'weighted'|'manual'} [options.mode] how the cuts are placed
 * @param {number} [options.weave] slices per band; >1 interleaves them
 * @param {?object} [options.cuts] hand-placed cuts for manual mode
 * @returns {{space: string, bandCount: number, bands: {tint: number[], label: string}[],
 *            cuts: object, values: (r: number, g: number, b: number, out: Int32Array) => void}}
 */
export function planBands({
  pixels,
  plateCount,
  space = 'channels',
  mode = 'linear',
  weave = 1,
  cuts = null,
}) {
  if (plateCount < MIN_PLATES || plateCount > MAX_PLATES) {
    throw new RangeError(`plateCount must be between ${MIN_PLATES} and ${MAX_PLATES}`);
  }
  const options = {
    pixels,
    plateCount,
    mode,
    weave: Math.max(1, Math.min(MAX_WEAVE, Math.round(weave))),
    cuts,
  };
  const plan = space === 'spectrum' ? planSpectrumBands(options) : planChannelBands(options);
  // Both spaces hand back every cut, and the histograms behind them, so a
  // manual edit can start from what the automatic modes produced.
  plan.cuts = { channels: [[], [], []], hue: [], ...plan.cuts };
  plan.histograms = { channels: [], hue: [], ...plan.histograms };
  return plan;
}
