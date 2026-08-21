// Cipher stacking.
//
// Additive plates can never be brighter than the picture they came from, so
// every one of them carries its outline no matter how the bands are shuffled —
// measured at about 0.7 correlation with the source even under fully random
// weights. The way out is to stop clamping and start wrapping: give the plates
// noise that cancels *modulo 256*.
//
// Each real plate gets a slice of noise drawn so the slices sum to zero, which
// leaves the modular total untouched. At full strength the noise covers the
// whole byte range, every plate is uniform static, and no plate says anything
// about the picture — the stack is the only place it exists. Decoys get noise
// of their own so they look no different.
//
// The catch: a wrapped stack is not something `lighter` can composite, so these
// plates only come together in this app, and an incomplete stack shows nothing
// at all rather than a partial picture.

const WRAP = 256;

/**
 * @param {{data: Uint8ClampedArray, isFalse: boolean}[]} plates modified in place
 * @param {number} strength 0 leaves the plates alone, 1 is a full one-time pad
 */
export function cipherPlates({ plates, strength = 1, random = Math.random }) {
  if (strength <= 0 || plates.length === 0) return plates;

  const amplitude = Math.max(1, Math.round(128 * Math.min(1, strength)));
  const real = plates.filter((plate) => !plate.isFalse);
  const decoys = plates.filter((plate) => plate.isFalse);
  const length = plates[0].data.length;
  const draw = () => Math.floor(random() * amplitude * 2) - amplitude;

  // Real plates share out noise that cancels, so their total is unchanged.
  if (real.length > 1) {
    const noise = new Int32Array(real.length);
    for (let i = 0; i < length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        for (let plate = 0; plate < real.length - 1; plate++) {
          noise[plate] = draw();
          sum += noise[plate];
        }
        noise[real.length - 1] = -sum;

        // Whoever carries the remainder moves around, so no plate stands out.
        const rotation = Math.floor(random() * real.length);
        for (let plate = 0; plate < real.length; plate++) {
          const data = real[plate].data;
          const shifted = data[i + channel] + noise[(plate + rotation) % real.length];
          data[i + channel] = ((shifted % WRAP) + WRAP) % WRAP;
        }
      }
    }
  }

  // Decoys are never part of the total, so their noise is free.
  for (const decoy of decoys) {
    for (let i = 0; i < length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        const shifted = decoy.data[i + channel] + draw();
        decoy.data[i + channel] = ((shifted % WRAP) + WRAP) % WRAP;
      }
    }
  }

  // Alpha would leak the picture's shape, and the wrap ignores it anyway.
  for (const plate of plates) {
    for (let i = 3; i < length; i += 4) plate.data[i] = 255;
  }
  return plates;
}

/** Adds the plates modulo 256 — the only way a ciphered stack comes back. */
export function revealModular(plates, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  for (const plate of plates) {
    const data = plate.data ?? plate;
    for (let i = 0; i < out.length; i += 4) {
      out[i] = (out[i] + data[i]) % WRAP;
      out[i + 1] = (out[i + 1] + data[i + 1]) % WRAP;
      out[i + 2] = (out[i + 2] + data[i + 2]) % WRAP;
    }
  }
  return out;
}
