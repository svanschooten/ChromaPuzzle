// Turns an image into plates: every band's value is handed out over the
// plates, and the shares always add back up to the original pixel.
import { clamp255 } from './color.js';

const NO_TONAL_SPLIT = 255; // a band's value never exceeds one channel range

function prepare({ pixels, width, height, plan, opacity, field, only, alphaSource }) {
  const plateCount = plan.bandCount;
  const plates = plan.bands.map((band) => ({ data: null, tint: band.tint, label: band.label }));
  const buffers = new Array(plateCount).fill(null);
  const targets = only === null ? plates.map((_, index) => index) : [only];
  for (const index of targets) {
    buffers[index] = new Uint8ClampedArray(width * height * 4);
    plates[index].data = buffers[index];
  }

  return {
    pixels,
    alphaSource,
    plates,
    buffers,
    targets: Int32Array.from(targets),
    plateCount,
    plan,
    values: new Int32Array(plateCount * 3),
    boost: 1 / opacity,
    opacity,
    field,
    only,
    pixelCount: width * height,
    thresholds: new Float32Array(plateCount).fill(NO_TONAL_SPLIT),
    weights: new Float32Array(plateCount * 2 * plateCount),
  };
}

/** Alpha is the same on every plate; colour work can skip empty pixels. */
function writeAlpha(context, pixelIndex) {
  const { alphaSource, buffers, targets, opacity } = context;
  const j = pixelIndex * 4;
  const alpha = Math.round(alphaSource[j + 3] * opacity);
  for (let t = 0; t < targets.length; t++) buffers[targets[t]][j + 3] = alpha;
  return alphaSource[j + 3] !== 0;
}

/** No occlusion: each band goes straight to its own plate. */
function fillPlain(context) {
  const { pixels, buffers, plan, values, boost, pixelCount, plateCount } = context;
  for (let i = 0; i < pixelCount; i++) {
    if (!writeAlpha(context, i)) continue;
    const j = i * 4;
    plan.values(pixels[j], pixels[j + 1], pixels[j + 2], values);

    for (let band = 0; band < plateCount; band++) {
      const buffer = buffers[band];
      if (!buffer) continue; // rendering a single plate: skip the others
      for (let channel = 0; channel < 3; channel++) {
        const value = values[band * 3 + channel];
        if (value <= 0) continue;
        const at = j + channel;
        buffer[at] = clamp255(buffer[at] + Math.round(value * boost));
      }
    }
  }
  return context.plates;
}

/**
 * Occluded split. Each band's value is shared out by cumulative rounding: a
 * plate takes the difference between running totals, so the integer shares
 * still sum to the original value.
 */
function fillShared(context) {
  const {
    pixels,
    buffers,
    plan,
    values,
    boost,
    pixelCount,
    plateCount,
    field,
    thresholds,
    weights,
  } = context;
  const halves = field.tonal ? 2 : 1;
  let lastShard = null;

  for (let i = 0; i < pixelCount; i++) {
    if (!writeAlpha(context, i)) continue;
    const shard = field.planAt(i);
    if (shard !== lastShard) {
      field.fill(i, thresholds, weights, 0, plateCount);
      lastShard = shard;
    }
    const j = i * 4;
    plan.values(pixels[j], pixels[j + 1], pixels[j + 2], values);

    for (let entry = 0; entry < plateCount * 3; entry++) {
      const value = values[entry];
      if (value <= 0) continue;

      const band = (entry / 3) | 0;
      const at = j + (entry - band * 3);
      const lowPart = Math.min(value, thresholds[band]);

      for (let half = 0; half < halves; half++) {
        const amount = (half === 0 ? lowPart : value - lowPart) * boost;
        if (amount <= 0) continue;
        const base = (band * 2 + half) * plateCount;

        let running = 0;
        let handedOut = 0;
        for (let plate = 0; plate < plateCount; plate++) {
          running += weights[base + plate] * amount;
          const rounded = Math.round(running);
          const share = rounded - handedOut;
          handedOut = rounded;
          const buffer = buffers[plate];
          if (share !== 0 && buffer) buffer[at] = clamp255(buffer[at] + share);
        }
      }
    }
  }
  return context.plates;
}

/**
 * One plate on its own, for decoys. The band loop deliberately mirrors
 * `fillShared` rather than sharing a helper with it: this runs per pixel per
 * band, and the two differ in the one line that matters. A decoy is never part of the sum, so its
 * shares do not have to add up with anyone else's — no cumulative pass over the
 * other plates, and only its own weight has to be worked out.
 */
function fillSingle(context) {
  const {
    pixels,
    buffers,
    plan,
    values,
    boost,
    pixelCount,
    plateCount,
    field,
    thresholds,
    weights,
  } = context;
  const only = context.only;
  const buffer = buffers[only];
  const halves = field.tonal ? 2 : 1;

  for (let i = 0; i < pixelCount; i++) {
    if (!writeAlpha(context, i)) continue;
    field.fill(i, thresholds, weights, only, only + 1);
    const j = i * 4;
    plan.values(pixels[j], pixels[j + 1], pixels[j + 2], values);

    for (let entry = 0; entry < plateCount * 3; entry++) {
      const value = values[entry];
      if (value <= 0) continue;

      const band = (entry / 3) | 0;
      const at = j + (entry - band * 3);
      const lowPart = Math.min(value, thresholds[band]);

      for (let half = 0; half < halves; half++) {
        const amount = (half === 0 ? lowPart : value - lowPart) * boost;
        if (amount <= 0) continue;
        const share = Math.round(weights[(band * 2 + half) * plateCount + only] * amount);
        if (share !== 0) buffer[at] = clamp255(buffer[at] + share);
      }
    }
  }
  return [context.plates[only]];
}

/**
 * @param {object} options
 * @param {Uint8ClampedArray} options.pixels source image
 * @param {object} options.plan from `planBands`
 * @param {number} options.opacity plate alpha; 1 means no color boost
 * @param {?object} options.field occlusion weight field, or null for a plain split
 * @param {?number} options.only render just this plate index
 * @param {Uint8ClampedArray} [options.alphaSource] where plate alpha comes from
 * @returns {{data: Uint8ClampedArray, tint: number[], label: string}[]}
 */
export function splitPlates({
  pixels,
  width,
  height,
  plan,
  opacity = 1,
  field = null,
  only = null,
  alphaSource = pixels,
}) {
  const context = prepare({ pixels, width, height, plan, opacity, field, only, alphaSource });
  if (!field) return only === null ? fillPlain(context) : [fillPlain(context)[only]];
  return only === null ? fillShared(context) : fillSingle(context);
}
