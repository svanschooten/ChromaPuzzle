// Colour helpers shared by the splitter and the false-plate generator.

export const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

export const rgbCss = (t) => `rgb(${t[0]}, ${t[1]}, ${t[2]})`;

const LUMA = [0.213, 0.715, 0.072];

const multiply = (a, b) => {
  const out = new Float32Array(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row * 3 + col] =
        a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out;
};

const saturationMatrix = (s) =>
  new Float32Array([
    LUMA[0] + (1 - LUMA[0]) * s,
    LUMA[1] - LUMA[1] * s,
    LUMA[2] - LUMA[2] * s,
    LUMA[0] - LUMA[0] * s,
    LUMA[1] + (1 - LUMA[1]) * s,
    LUMA[2] - LUMA[2] * s,
    LUMA[0] - LUMA[0] * s,
    LUMA[1] - LUMA[1] * s,
    LUMA[2] + (1 - LUMA[2]) * s,
  ]);

const hueMatrix = (degrees) => {
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return new Float32Array([
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ]);
};

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * A colour transform that shifts hue, saturation and lightness just far enough
 * to look plausible but reconstruct wrong (design doc 2.3, expressed as a
 * matrix so it can be applied per shard at a few multiplies per pixel).
 */
export function driftMatrix() {
  const matrix = multiply(hueMatrix(rand(-20, 20)), saturationMatrix(rand(0.7, 1.3)));
  const lightness = rand(0.85, 1.15);
  for (let i = 0; i < 9; i++) matrix[i] *= lightness;
  return matrix;
}

/** Applies a 3×3 colour matrix, writing clamped bytes into `out` at `offset`. */
export function applyMatrix(matrix, offset, r, g, b, out, at) {
  out[at] = clamp255(matrix[offset] * r + matrix[offset + 1] * g + matrix[offset + 2] * b);
  out[at + 1] = clamp255(matrix[offset + 3] * r + matrix[offset + 4] * g + matrix[offset + 5] * b);
  out[at + 2] = clamp255(matrix[offset + 6] * r + matrix[offset + 7] * g + matrix[offset + 8] * b);
}

export function tintThrough(matrix, tint) {
  const out = new Uint8ClampedArray(3);
  applyMatrix(matrix, 0, tint[0], tint[1], tint[2], out, 0);
  return [out[0], out[1], out[2]];
}
