// A rough estimate of how long a generation will take.
//
// The coefficients are fitted to measurements of this code (best of three runs
// at 1200×900). They exist to tell "instant" from "put the kettle on", not to
// be accurate: a slower machine can be twice these numbers.
//
// Splitting costs roughly `linear × plates + quadratic × plates²` per
// megapixel — each band's value is handed to every plate — while a decoy is
// nearly linear, because only one plate is ever rendered.

const SPLIT = {
  none: { linear: 8, quadratic: 0, base: 37 },
  fracture: { linear: 110, quadratic: 1, base: 0 },
  blend: { linear: 66, quadratic: 12, base: 0 },
  noise: { linear: 80, quadratic: 12, base: 0 },
};

const DECOY = { base: 90, linear: 24 };
const DECOY_WEIGHT = { none: 0.4, fracture: 1, blend: 1.3, noise: 1.3 };
const SPECTRUM_PENALTY = 1.25; // hue has to be worked out per pixel

/** @returns {number} milliseconds, very approximately. */
export function estimateGenerationMs({
  width,
  height,
  plateCount,
  decoyCount = 0,
  occlusionMode = 'none',
  bandSpace = 'channels',
}) {
  const megapixels = (width * height) / 1e6;
  const mode = SPLIT[occlusionMode] ? occlusionMode : 'none';
  const split = SPLIT[mode];

  const perMegapixel =
    split.base +
    split.linear * plateCount +
    split.quadratic * plateCount * plateCount +
    decoyCount * DECOY_WEIGHT[mode] * (DECOY.base + DECOY.linear * plateCount);

  return megapixels * perMegapixel * (bandSpace === 'spectrum' ? SPECTRUM_PENALTY : 1);
}

export function describeDuration(ms) {
  if (ms < 1000) return 'under a second';
  if (ms < 60000) return `about ${Math.round(ms / 1000)}s`;
  return `about ${Math.round(ms / 6000) / 10} minutes`;
}
