// Creator presets: the settings that make a puzzle, without the picture.
//
// A preset is meant to be passed around, so reading one treats every field as
// untrusted: numbers are pulled back into range, choices have to be ones we
// know, and anything else is left alone rather than applied. The command line
// holds its flags to the same ranges.
import { BAND_MODES, BAND_SPACES, MAX_PLATES, MAX_WEAVE, MIN_PLATES } from './bands/index.js';
import { FALSE_MODES } from './falsePlate.js';
import { OCCLUSION_MODES } from './occlusion/index.js';
import { defaultSettings } from './settings.js';

const PRESET_MARKER = 'chromaPuzzlePreset';
const PRESET_VERSION = 1;

/** Where each numeric setting has to sit; `step: 1` means whole numbers only. */
export const RANGES = {
  plateCount: { min: MIN_PLATES, max: MAX_PLATES, step: 1 },
  falseCount: { min: 0, max: MAX_PLATES, step: 1 },
  opacity: { min: 0.3, max: 1 },
  weave: { min: 1, max: MAX_WEAVE, step: 1 },
  decoyIntensity: { min: 0.05, max: 1 },
  cipher: { min: 0, max: 1 },
  occlusionStrength: { min: 0.05, max: 1 },
  shardSize: { min: 12, max: 96, step: 1 },
  blendScale: { min: 16, max: 256, step: 1 },
  screenScale: { min: 1, max: 8, step: 1 },
};

export const CHOICES = {
  bandSpace: BAND_SPACES,
  bandMode: BAND_MODES,
  falseMode: FALSE_MODES,
  occlusionMode: OCCLUSION_MODES,
};

/** Classes per colour-cell axis; 1 switches the axis off. */
export const CELL_RANGE = { min: 1, max: 12, step: 1 };

const FLAGS = ['occlusionEnabled'];
const CELL_DEFAULTS = defaultSettings().cells;

/** @returns {object} a plain object ready to be written out as JSON. */
export function buildPreset(settings) {
  const preset = { [PRESET_MARKER]: PRESET_VERSION };
  for (const key of [...Object.keys(RANGES), ...Object.keys(CHOICES), ...FLAGS]) {
    preset[key] = settings[key];
  }
  preset.cells = { ...CELL_DEFAULTS, ...settings.cells };
  preset.cuts = settings.cuts ?? null;
  return preset;
}

const clamp = (value, { min, max, step }) => {
  const bounded = Math.min(max, Math.max(min, value));
  return step === 1 ? Math.round(bounded) : bounded;
};

/** A number held to `range`, noted by `name` when it is unusable or had to be pulled in. */
function readNumber(value, range, name, notes) {
  if (!Number.isFinite(value)) {
    notes.ignored.push(name);
    return undefined;
  }
  const read = clamp(value, range);
  if (read !== value) notes.adjusted.push(name);
  return read;
}

const isNumberList = (value) =>
  Array.isArray(value) && value.every((entry) => Number.isFinite(entry));

function readCuts(cuts) {
  if (!cuts || typeof cuts !== 'object') return null;
  const { channels, hue, chroma, value } = cuts;
  const channelsOk =
    Array.isArray(channels) && channels.length === 3 && channels.every(isNumberList);
  const axesOk = [hue, chroma, value].every((axis) => axis === undefined || isNumberList(axis));
  if (!channelsOk && !axesOk) return null;
  if (!channelsOk || !axesOk) return null;
  return { channels, hue: hue ?? [], chroma: chroma ?? [], value: value ?? [] };
}

function readCells(cells, notes) {
  if (!cells || typeof cells !== 'object') return null;
  const out = { ...CELL_DEFAULTS };
  for (const axis of ['hue', 'chroma', 'value']) {
    if (cells[axis] === undefined) continue;
    out[axis] = readNumber(cells[axis], CELL_RANGE, `cells.${axis}`, notes) ?? out[axis];
  }
  out.hard = cells.hard === true;
  return out;
}

/**
 * @param {object} data parsed JSON, from anywhere
 * @returns {{values: object, ignored: string[], adjusted: string[]}} settings
 *   to apply, the fields that were present but unusable, and the ones that
 *   had to be pulled back into range
 * @throws {Error} when the file is not a preset at all
 */
export function readPreset(data) {
  if (!data || typeof data !== 'object' || !(PRESET_MARKER in data)) {
    throw new Error('That file is not a chroma puzzle preset.');
  }

  const values = {};
  const ignored = [];
  const adjusted = [];
  const notes = { ignored, adjusted };

  for (const [key, range] of Object.entries(RANGES)) {
    if (data[key] === undefined) continue;
    const value = readNumber(data[key], range, key, notes);
    if (value !== undefined) values[key] = value;
  }

  for (const [key, allowed] of Object.entries(CHOICES)) {
    if (data[key] === undefined) continue;
    if (allowed.includes(data[key])) values[key] = data[key];
    else ignored.push(key);
  }

  for (const key of FLAGS) {
    if (data[key] !== undefined) values[key] = data[key] === true;
  }

  if (data.cells !== undefined) {
    const cells = readCells(data.cells, notes);
    if (cells) values.cells = cells;
    else ignored.push('cells');
  }

  if (data.cuts !== undefined && data.cuts !== null) {
    const cuts = readCuts(data.cuts);
    if (cuts) values.cuts = cuts;
    else ignored.push('cuts');
  }

  return { values, ignored, adjusted };
}
