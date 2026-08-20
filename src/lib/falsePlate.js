// False plate generation (design doc 2.3): plausible texture, wrong colour.
import { driftTint } from './color.js';

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
  const tmp = new Uint8ClampedArray(data.length);
  const span = radius * 2 + 1;

  const pass = (srcArr, dstArr, w, h, horizontal) => {
    for (let outer = 0; outer < (horizontal ? h : w); outer++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        const at = (i) => {
          const x = horizontal ? i : outer;
          const y = horizontal ? outer : i;
          return (y * w + x) * 4 + c;
        };
        const len = horizontal ? w : h;
        for (let i = -radius; i <= radius; i++) {
          acc += srcArr[at(Math.min(len - 1, Math.max(0, i)))];
        }
        for (let i = 0; i < len; i++) {
          dstArr[at(i)] = acc / span;
          const add = srcArr[at(Math.min(len - 1, i + radius + 1))];
          const sub = srcArr[at(Math.max(0, i - radius))];
          acc += add - sub;
        }
      }
    }
  };

  let src = data,
    dst = tmp;
  for (let p = 0; p < 3; p++) {
    pass(src, dst, width, height, true);
    const swap = src;
    src = dst;
    dst = swap;
    pass(src, dst, width, height, false);
    const swap2 = src;
    src = dst;
    dst = swap2;
  }
  if (src !== data) data.set(src);
  return data;
}

function sampleBilinear(plate, width, height, x, y) {
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
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = plate[i00 + c] * (1 - fx) + plate[i10 + c] * fx;
    const bottom = plate[i01 + c] * (1 - fx) + plate[i11 + c] * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
  return out;
}

/**
 * Builds one false plate: a drifted tint carried by content spliced together
 * from the real plates, so it matches the image's texture without being a
 * correct colour band.
 */
export function generateFalsePlate(realPlates, width, height) {
  const templateIndex = randInt(realPlates.length - 1);
  const tint = driftTint(realPlates[templateIndex].tint);

  const blockSize = Math.max(8, Math.floor(Math.min(width, height) / 32));
  const cols = Math.ceil(width / blockSize);
  const rows = Math.ceil(height / blockSize);

  const sources = new Float32Array(rows * cols);
  for (let i = 0; i < sources.length; i++) {
    sources[i] = Math.random() < 0.6 ? templateIndex : randInt(realPlates.length - 1);
  }
  const smoothed = gaussianSmooth2D(sources, rows, cols, 1.5);
  const blockSources = new Uint8Array(rows * cols);
  for (let i = 0; i < smoothed.length; i++) {
    blockSources[i] = Math.min(realPlates.length - 1, Math.max(0, Math.round(smoothed[i])));
  }

  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const blockRow = Math.floor(y / blockSize);
    for (let x = 0; x < width; x++) {
      const blockCol = Math.floor(x / blockSize);
      const source = realPlates[blockSources[blockRow * cols + blockCol]].data;
      const jx = x + (Math.random() * 4 - 2);
      const jy = y + (Math.random() * 4 - 2);
      const px = sampleBilinear(source, width, height, jx, jy);
      // The band value a real plate carries lives in its strongest channel.
      const intensity = Math.max(px[0], px[1], px[2]) / 255;

      // Deviation from design doc 2.3: the intensity modulates the tint rather
      // than the alpha. Real plates vary in colour at a constant alpha, so an
      // alpha-modulated false plate reads as obviously different in a
      // thumbnail and gives the puzzle away before it is even composited.
      const j = (y * width + x) * 4;
      out[j] = tint[0] * intensity;
      out[j + 1] = tint[1] * intensity;
      out[j + 2] = tint[2] * intensity;
      out[j + 3] = px[3];
    }
  }

  boxBlurRGBA(out, width, height, Math.max(1, Math.round(blockSize / 3)));
  return { data: out, tint, bandLabel: 'False' };
}
