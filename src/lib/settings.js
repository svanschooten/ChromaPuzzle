// Creator settings: what they start as, and what a generation run takes from
// them. The app and the command line both go through here, so the same
// settings make the same puzzle either way.

/** Source images are scaled down to fit this on their long edge. */
export const MAX_SOURCE_SIZE = 2048;

const DEFAULTS = {
  plateCount: 3,
  falseCount: 2,
  opacity: 1,
  bandSpace: 'channels',
  bandMode: 'linear',
  weave: 1,
  cells: { hue: 6, chroma: 4, value: 5, hard: false },
  cuts: null,
  falseMode: 'drift',
  decoyIntensity: 0.6,
  cipher: 0,
  occlusionEnabled: false,
  occlusionMode: 'fracture',
  occlusionStrength: 0.6,
  shardSize: 32,
  blendScale: 40,
  screenScale: 2,
};

const SETTING_KEYS = Object.keys(DEFAULTS);

/** Just the settings out of `source`, copied so later edits to it do not reach them. */
export function pickSettings(source) {
  const settings = {};
  for (const key of SETTING_KEYS) settings[key] = source[key];
  settings.cells = { ...source.cells };
  return settings;
}

export const defaultSettings = () => pickSettings(DEFAULTS);

/** The occlusion to generate with, or null when it is switched off. */
export function occlusionSettings(settings) {
  if (!settings.occlusionEnabled) return null;
  return {
    mode: settings.occlusionMode,
    strength: settings.occlusionStrength,
    shardSize: settings.shardSize,
    scale: settings.occlusionMode === 'screen' ? settings.screenScale : settings.blendScale,
  };
}

// Copied into plain arrays: cuts edited in the app come back holding reactive
// proxies, which cannot be posted to a worker.
const plainCuts = (cuts) =>
  cuts && {
    channels: [0, 1, 2].map((channel) => [...(cuts.channels?.[channel] ?? [])]),
    hue: [...(cuts.hue ?? [])],
    chroma: [...(cuts.chroma ?? [])],
    value: [...(cuts.value ?? [])],
  };

/** The settings generatePuzzle takes. Hand-placed cuts only count in manual mode. */
export function generationSettings(settings, seed) {
  return {
    plateCount: settings.plateCount,
    falseCount: settings.falseCount,
    opacity: settings.opacity,
    bandSpace: settings.bandSpace,
    bandMode: settings.bandMode,
    weave: settings.weave,
    cells: { ...settings.cells },
    cuts: settings.bandMode === 'manual' ? plainCuts(settings.cuts) : null,
    falseMode: settings.falseMode,
    decoyIntensity: settings.decoyIntensity,
    cipher: settings.cipher,
    occlusion: occlusionSettings(settings),
    seed,
  };
}
