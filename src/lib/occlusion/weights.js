// Shared weight helpers for the occlusion modes.

/**
 * Spreads one pixel's per-plate shares over every band, rotating the
 * assignment so each plate sits on a different band's share, and easing back
 * towards the plain split as strength drops.
 */
function spreadShares(weights, shares, bandCount, plateCount, strength, plateStart, plateEnd) {
  for (let band = 0; band < bandCount; band++) {
    const base = band * 2 * plateCount;
    const owner = band % plateCount;
    for (let plate = plateStart; plate < plateEnd; plate++) {
      const share = shares[(plate + band) % plateCount];
      weights[base + plate] = (1 - strength) * (plate === owner ? 1 : 0) + strength * share;
    }
  }
}

/** Eases a weight column back towards "band b belongs to plate b". */
export function easeToIdentity(weights, bandCount, plateCount, strength) {
  for (let band = 0; band < bandCount; band++) {
    for (let half = 0; half < 2; half++) {
      const base = (band * 2 + half) * plateCount;
      for (let plate = 0; plate < plateCount; plate++) {
        const identity = plate === band % plateCount ? 1 : 0;
        weights[base + plate] = (1 - strength) * identity + strength * weights[base + plate];
      }
    }
  }
}

/**
 * A field whose weights are worked out fresh for every pixel: the mode only has
 * to say what share each plate gets, and this wraps that into the field the
 * splitter expects. Modes built this way do not split tones.
 */
export function createShareField({ plateCount, bandCount, strength, computeShares }) {
  const shares = new Float32Array(plateCount);
  return {
    tonal: false,
    planAt: (index) => index,
    fill(index, thresholdsOut, weightsOut, plateStart = 0, plateEnd = plateCount) {
      thresholdsOut.fill(255);
      computeShares(index, shares);
      spreadShares(weightsOut, shares, bandCount, plateCount, strength, plateStart, plateEnd);
    },
  };
}
