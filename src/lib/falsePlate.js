// False plate generation (design doc 2.3): plausible texture, wrong colour.
//
// A decoy has to look like whatever the real plates look like. Against a plain
// split that means one drifted colour band; against a fractured split it means
// a shard patchwork, so the generator mirrors whichever structure was used.
import { applyMatrix, driftMatrix, tintThrough } from './color.js';

const randInt = (max) => Math.floor(Math.random() * (max + 1));

/** Separable gaussian smoothing of a small numeric grid (block source map). */
function gaussianSmooth2D(grid, rows, cols, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 2));
  const kernel = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(v);
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(rows * cols);
  const out = new Float32Array(rows * cols);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(cols - 1, Math.max(0, x + k));
        acc += grid[y * cols + sx] * kernel[k + radius];
      }
      tmp[y * cols + x] = acc;
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(rows - 1, Math.max(0, y + k));
        acc += tmp[sy * cols + x] * kernel[k + radius];
      }
      out[y * cols + x] = acc;
    }
  }
  return out;
}

/** Three box-blur passes approximate a gaussian at a fraction of the cost. */
function boxBlurRGBA(data, width, height, radius) {
  if (radius < 1) return data;
  const scratch = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < 3; pass++) {
    blurAxis(data, scratch, width, height, radius, 4, width * 4);
    blurAxis(scratch, data, height, width, radius, width * 4, 4);
  }
  return data;
}

/**
 * One separable blur pass. `step` walks along the axis being blurred and
 * `lineStep` walks across the other one, so the same loop serves both
 * directions without any per-pixel index maths in a closure.
 */
function blurAxis(src, dst, length, lines, radius, step, lineStep) {
  const span = radius * 2 + 1;
  const last = (length - 1) * step;
  for (let line = 0; line < lines; line++) {
    const origin = line * lineStep;
    for (let c = 0; c < 4; c++) {
      const base = origin + c;
      let acc = 0;
      for (let i = -radius; i <= radius; i++) {
        acc += src[base + Math.min(last, Math.max(0, i * step))];
      }
      for (let i = 0; i < length; i++) {
        dst[base + i * step] = acc / span;
        acc += src[base + Math.min(last, (i + radius + 1) * step)];
        acc -= src[base + Math.max(0, (i - radius) * step)];
      }
    }
  }
}

function sampleBilinear(plate, width, height, x, y, out) {
  const x0 = Math.min(width - 1, Math.max(0, Math.floor(x)));
  const y0 = Math.min(height - 1, Math.max(0, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = Math.min(1, Math.max(0, x - x0));
  const fy = Math.min(1, Math.max(0, y - y0));

  const i00 = (y0 * width + x0) * 4,
    i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4,
    i11 = (y1 * width + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const top = plate[i00 + c] * (1 - fx) + plate[i10 + c] * fx;
    const bottom = plate[i01 + c] * (1 - fx) + plate[i11 + c] * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
}

/**
 * Fills `out` by sampling, for every pixel, the real plate its region was
 * assigned. Alpha is copied straight across, so decoys carry the same alpha
 * character as real plates and cannot be spotted from a thumbnail.
 *
 * `colour.matrices` drifts each region's sample on its own — right when the
 * real plates are fractured patchworks. `colour.tint` instead carries the
 * sampled intensity in one fixed colour, which is what a decoy needs against
 * plain plates: those are a single hue throughout, and a multi-hue decoy would
 * be obvious at a glance.
 */
function paint(out, realPlates, width, height, regionOf, sources, colour) {
  const sample = new Float32Array(4);
  const { matrices, tint } = colour;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const region = regionOf(x, y, i);
      const source = realPlates[sources[region]].data;
      // A little jitter keeps the decoy from being a pixel-exact copy.
      const jx = x + (Math.random() * 4 - 2);
      const jy = y + (Math.random() * 4 - 2);
      sampleBilinear(source, width, height, jx, jy, sample);

      const j = i * 4;
      if (matrices) {
        applyMatrix(matrices, region * 9, sample[0], sample[1], sample[2], out, j);
      } else {
        // The band value a real plate carries lives in its strongest channel.
        const intensity = Math.max(sample[0], sample[1], sample[2]) / 255;
        out[j] = tint[0] * intensity;
        out[j + 1] = tint[1] * intensity;
        out[j + 2] = tint[2] * intensity;
      }
      out[j + 3] = sample[3];
    }
  }
}

/**
 * @param {{map: Int32Array, count: number}|null} shards structure to mimic
 * @returns {{data: Uint8ClampedArray, tint: number[], bandLabel: string}}
 */
export function generateFalsePlate(realPlates, width, height, shards = null) {
  const templateIndex = randInt(realPlates.length - 1);
  const out = new Uint8ClampedArray(width * height * 4);

  if (shards) {
    // Fractured plates already jump between colours from shard to shard, so a
    // decoy drifts each shard on its own and needs no blurring to blend in.
    const sources = new Uint8Array(shards.count);
    const matrices = new Float32Array(shards.count * 9);
    for (let s = 0; s < shards.count; s++) {
      sources[s] = randInt(realPlates.length - 1);
      matrices.set(driftMatrix(), s * 9);
    }
    paint(out, realPlates, width, height, (x, y, i) => shards.map[i], sources, { matrices });
    return {
      data: out,
      tint: tintThrough(matrices.subarray(0, 9), realPlates[templateIndex].tint),
      bandLabel: 'False',
    };
  }

  // Plain split: one drift for the whole plate, since every real plate carries
  // a single uniform colour band and a patchy decoy would stand out.
  const matrix = driftMatrix();
  const blockSize = Math.max(8, Math.floor(Math.min(width, height) / 32));
  const cols = Math.ceil(width / blockSize);
  const rows = Math.ceil(height / blockSize);

  const picks = new Float32Array(rows * cols);
  for (let i = 0; i < picks.length; i++) {
    picks[i] = Math.random() < 0.6 ? templateIndex : randInt(realPlates.length - 1);
  }
  const smoothed = gaussianSmooth2D(picks, rows, cols, 1.5);
  const sources = new Uint8Array(rows * cols);
  for (let i = 0; i < smoothed.length; i++) {
    sources[i] = Math.min(realPlates.length - 1, Math.max(0, Math.round(smoothed[i])));
  }
  const tint = tintThrough(matrix, realPlates[templateIndex].tint);
  const regionOf = (x, y) => Math.floor(y / blockSize) * cols + Math.floor(x / blockSize);
  paint(out, realPlates, width, height, regionOf, sources, { tint });
  boxBlurRGBA(out, width, height, Math.max(1, Math.round(blockSize / 3)));

  return { data: out, tint, bandLabel: 'False' };
}
