// Geometric warps used to build decoy plates: the picture is pushed around
// before it is banded, so the plate carries the right kind of structure with
// the wrong content in it.
import { between, pick } from './random.js';

function sampleBilinear(pixels, width, height, x, y, out) {
  const cx = Math.min(width - 1, Math.max(0, x));
  const cy = Math.min(height - 1, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const top = pixels[i00 + c] * (1 - fx) + pixels[i10 + c] * fx;
    const bottom = pixels[i01 + c] * (1 - fx) + pixels[i11 + c] * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
}

/** Each warp maps an output pixel back to the source position it samples. */
function chooseWarp(width, height, random, intensity) {
  const shortest = Math.min(width, height);
  const strength = Math.max(0.05, Math.min(1, intensity));
  const cx = width * between(random, 0.35, 0.65);
  const cy = height * between(random, 0.35, 0.65);

  switch (pick(random, 3)) {
    case 0: {
      // Swirl: rotate hardest at the centre, fading out with distance.
      const turns = between(random, 0.8, 4) * strength * (random() < 0.5 ? -1 : 1);
      const reach = shortest * between(random, 0.35, 0.7);
      return (x, y, out) => {
        const dx = x - cx;
        const dy = y - cy;
        const angle = turns * Math.exp(-Math.hypot(dx, dy) / reach);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        out[0] = cx + dx * cos - dy * sin;
        out[1] = cy + dx * sin + dy * cos;
      };
    }
    case 1: {
      // Ripple: sine offsets along both axes.
      const amplitude = shortest * between(random, 0.03, 0.2) * strength;
      const wavelength = shortest / between(random, 1.5, 4.5);
      const phase = random() * Math.PI * 2;
      return (x, y, out) => {
        out[0] = x + amplitude * Math.sin((2 * Math.PI * y) / wavelength + phase);
        out[1] = y + amplitude * Math.sin((2 * Math.PI * x) / wavelength + phase * 1.7);
      };
    }
    default: {
      // Pinch or bulge around a point.
      const exponent = 1 + between(random, -0.5, 0.8) * strength;
      const reach = shortest * between(random, 0.5, 0.9);
      return (x, y, out) => {
        const dx = x - cx;
        const dy = y - cy;
        const distance = Math.hypot(dx, dy);
        if (distance < 1e-3) {
          out[0] = cx;
          out[1] = cy;
          return;
        }
        const scaled = reach * (distance / reach) ** exponent;
        out[0] = cx + (dx / distance) * scaled;
        out[1] = cy + (dy / distance) * scaled;
      };
    }
  }
}

/** @returns {Uint8ClampedArray} the source image, pushed out of shape. */
export function warpImage({ pixels, width, height, random, intensity = 1 }) {
  const warp = chooseWarp(width, height, random, intensity);
  const out = new Uint8ClampedArray(pixels.length);
  const source = new Float32Array(2);
  const sample = new Float32Array(4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      warp(x, y, source);
      sampleBilinear(pixels, width, height, source[0], source[1], sample);
      const j = (y * width + x) * 4;
      out[j] = sample[0];
      out[j + 1] = sample[1];
      out[j + 2] = sample[2];
      out[j + 3] = sample[3];
    }
  }
  return out;
}
