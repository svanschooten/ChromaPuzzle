// Every setting a config file holds, as a command-line flag.
//
// Flags are held to the same ranges a config file is read with, only strictly:
// a value out of range is an error here, where the app pulls a config value
// back into range. Each flag also knows under which settings it has any
// effect, so a flag that would be silently ignored can be pointed out instead.
import { InvalidArgumentError, Option } from 'commander';
import { BAND_MODES, BAND_SPACES } from '../lib/bands/index.js';
import { HUE_STEPS } from '../lib/bands/colour.js';
import { FALSE_MODES } from '../lib/falsePlate.js';
import { OCCLUSION_MODES } from '../lib/occlusion/index.js';
import { CELL_RANGE, RANGES } from '../lib/preset.js';
import { defaultSettings } from '../lib/settings.js';

const span = ({ min, max }) => `${min}–${max}`;

/** Parses an option-argument as a number within `range`. */
export function numberIn(range) {
  const whole = range.step === 1;
  const isValid = whole ? Number.isInteger : Number.isFinite;
  const expected = `Expected ${whole ? 'a whole number' : 'a number'} from ${span(range)}.`;
  return (text) => {
    const value = text.trim() === '' ? NaN : Number(text);
    if (!isValid(value)) throw new InvalidArgumentError(expected);
    if (value < range.min || value > range.max) {
      throw new InvalidArgumentError(`Must be from ${span(range)}.`);
    }
    return value;
  };
}

/** Parses comma-separated cut positions, each a whole number from 0 to `max`. */
function cutList(max) {
  return (text) => {
    if (text.trim() === '') return [];
    return text.split(',').map((part) => {
      const value = Number(part);
      if (part.trim() === '' || !Number.isInteger(value) || value < 0 || value > max) {
        throw new InvalidArgumentError(`Expected whole numbers from 0–${max}, comma-separated.`);
      }
      return value;
    });
  };
}

/* ---------------------------------------------------- where values live */

const setting = (key) => ({
  get: (settings) => settings[key],
  set: (settings, value) => {
    settings[key] = value;
  },
});

const cellAxis = (axis) => ({
  get: (settings) => settings.cells[axis],
  set: (settings, value) => {
    settings.cells = { ...settings.cells, [axis]: value };
  },
});

const withCuts = (cuts) => ({ channels: [[], [], []], hue: [], chroma: [], value: [], ...cuts });

const channelCuts = (channel) => ({
  get: (settings) => settings.cuts?.channels?.[channel] ?? [],
  set: (settings, list) => {
    const cuts = withCuts(settings.cuts);
    const channels = cuts.channels.map((existing, index) => (index === channel ? list : existing));
    settings.cuts = { ...cuts, channels };
  },
  used: (cuts) => cuts.channels[channel],
});

const axisCuts = (axis) => ({
  get: (settings) => settings.cuts?.[axis] ?? [],
  set: (settings, list) => {
    settings.cuts = { ...withCuts(settings.cuts), [axis]: list };
  },
  used: (cuts) => cuts[axis],
});

/* ------------------------------------------- when a flag does anything */

const when = (test, needs) => ({ test, needs });
const manual = (settings) => settings.bandMode === 'manual';

const IN_CELLS = when((s) => s.bandSpace === 'cells', '--space cells');
const OUTSIDE_CELLS = when((s) => s.bandSpace !== 'cells', '--space channels or spectrum');
const WITH_DECOYS = when((s) => s.falseCount > 0, '--decoys above 0');
const OCCLUDED = when((s) => s.occlusionEnabled, 'an --occlusion mode');
const occludedBy = (mode) =>
  when((s) => s.occlusionEnabled && s.occlusionMode === mode, `--occlusion ${mode}`);
const MANUAL_CHANNELS = when(
  (s) => manual(s) && s.bandSpace === 'channels',
  '--split manual and --space channels',
);
const MANUAL_HUE = when(
  (s) => manual(s) && (s.bandSpace === 'spectrum' || (s.bandSpace === 'cells' && s.cells.hue > 1)),
  '--split manual and --space spectrum, or cells with --hue-classes above 1',
);
const manualCellAxis = (axis) =>
  when(
    (s) => manual(s) && s.bandSpace === 'cells' && s.cells[axis] > 1,
    `--split manual, --space cells and --${axis}-classes above 1`,
  );

/* ---------------------------------------------------------- the flags */

/**
 * Every setting a config file holds. `range`, `choices` or `cutMax` say what a
 * value may be; `when` is under which settings the flag has any effect.
 */
export const SETTING_FLAGS = [
  {
    group: 'Plates:',
    flags: '-n, --plates <count>',
    about: 'chroma plates',
    range: RANGES.plateCount,
    ...setting('plateCount'),
  },
  {
    group: 'Plates:',
    flags: '-d, --decoys <count>',
    about: 'false plates',
    range: RANGES.falseCount,
    ...setting('falseCount'),
  },
  {
    group: 'Plates:',
    flags: '--opacity <alpha>',
    about: 'plate opacity',
    note: 'below 1 boosts colour to make up for it, clipping highlights',
    range: RANGES.opacity,
    ...setting('opacity'),
  },
  {
    group: 'Bands:',
    flags: '--space <space>',
    about: 'what a band owns: tonal slices of RGB, hue arcs, or colour cells',
    choices: BAND_SPACES,
    ...setting('bandSpace'),
  },
  {
    group: 'Bands:',
    flags: '--split <split>',
    about: 'how the cuts are placed',
    choices: BAND_MODES,
    ...setting('bandMode'),
  },
  {
    group: 'Bands:',
    flags: '--weave <factor>',
    about: 'slices per plate, dealt round the plates',
    range: RANGES.weave,
    when: OUTSIDE_CELLS,
    ...setting('weave'),
  },
  {
    group: 'Bands:',
    flags: '--hue-classes <count>',
    about: 'cell classes round the hue wheel',
    note: '1 is off',
    range: CELL_RANGE,
    when: IN_CELLS,
    ...cellAxis('hue'),
  },
  {
    group: 'Bands:',
    flags: '--chroma-classes <count>',
    about: 'cell classes by how colourful',
    note: '1 is off',
    range: CELL_RANGE,
    when: IN_CELLS,
    ...cellAxis('chroma'),
  },
  {
    group: 'Bands:',
    flags: '--value-classes <count>',
    about: 'cell classes by how bright',
    note: '1 is off',
    range: CELL_RANGE,
    when: IN_CELLS,
    ...cellAxis('value'),
  },
  {
    group: 'Bands:',
    flags: '--hard-cells',
    about: 'send every pixel to one plate',
    negate: '--no-hard-cells',
    negateAbout: 'share pixels between neighbouring cells',
    when: IN_CELLS,
    ...cellAxis('hard'),
  },
  {
    group: 'Manual cuts (with --split manual):',
    flags: '--red-cuts <list>',
    about: 'red channel cuts',
    label: 'red cuts',
    cutMax: 255,
    when: MANUAL_CHANNELS,
    ...channelCuts(0),
  },
  {
    group: 'Manual cuts (with --split manual):',
    flags: '--green-cuts <list>',
    about: 'green channel cuts',
    label: 'green cuts',
    cutMax: 255,
    when: MANUAL_CHANNELS,
    ...channelCuts(1),
  },
  {
    group: 'Manual cuts (with --split manual):',
    flags: '--blue-cuts <list>',
    about: 'blue channel cuts',
    label: 'blue cuts',
    cutMax: 255,
    when: MANUAL_CHANNELS,
    ...channelCuts(2),
  },
  {
    group: 'Manual cuts (with --split manual):',
    flags: '--hue-cuts <list>',
    about: 'hue cuts in degrees, for spectrum or cells',
    label: 'hue cuts',
    cutMax: HUE_STEPS - 1,
    when: MANUAL_HUE,
    ...axisCuts('hue'),
  },
  {
    group: 'Manual cuts (with --split manual):',
    flags: '--chroma-cuts <list>',
    about: 'chroma cuts, for cells',
    label: 'chroma cuts',
    cutMax: 255,
    when: manualCellAxis('chroma'),
    ...axisCuts('chroma'),
  },
  {
    group: 'Manual cuts (with --split manual):',
    flags: '--value-cuts <list>',
    about: 'value cuts, for cells',
    label: 'value cuts',
    cutMax: 255,
    when: manualCellAxis('value'),
    ...axisCuts('value'),
  },
  {
    group: 'Decoys:',
    flags: '--decoy-mode <mode>',
    about: 'what makes a decoy wrong: shifted colour, or a warped image',
    choices: FALSE_MODES,
    when: WITH_DECOYS,
    ...setting('falseMode'),
  },
  {
    group: 'Decoys:',
    flags: '--decoy-intensity <amount>',
    about: 'how far decoys go',
    note: 'subtle ones are harder to rule out',
    range: RANGES.decoyIntensity,
    when: WITH_DECOYS,
    ...setting('decoyIntensity'),
  },
  {
    group: 'Occlusion:',
    flags: '--occlusion <mode>',
    about: 'hide the picture inside each plate',
    choices: ['none', ...OCCLUSION_MODES],
    get: (settings) => (settings.occlusionEnabled ? settings.occlusionMode : 'none'),
    set: (settings, mode) => {
      settings.occlusionEnabled = mode !== 'none';
      if (mode !== 'none') settings.occlusionMode = mode;
    },
  },
  {
    group: 'Occlusion:',
    flags: '--occlusion-strength <amount>',
    about: 'how completely',
    range: RANGES.occlusionStrength,
    when: OCCLUDED,
    ...setting('occlusionStrength'),
  },
  {
    group: 'Occlusion:',
    flags: '--shard-size <px>',
    about: 'fracture shard size',
    range: RANGES.shardSize,
    when: occludedBy('fracture'),
    ...setting('shardSize'),
  },
  {
    group: 'Occlusion:',
    flags: '--island-size <px>',
    about: 'blend island size',
    range: RANGES.blendScale,
    when: occludedBy('blend'),
    ...setting('blendScale'),
  },
  {
    group: 'Occlusion:',
    flags: '--dot-size <px>',
    about: 'screen dot size',
    range: RANGES.screenScale,
    when: occludedBy('screen'),
    ...setting('screenScale'),
  },
  {
    group: 'Stacking:',
    flags: '--cipher <amount>',
    about: 'noise that cancels modulo 256',
    note: 'above 0 only this app can stack the plates, and at 1 each one is static',
    range: RANGES.cipher,
    ...setting('cipher'),
  },
].map(complete);

/** Adds what a flag is known by, and how its value is parsed. */
function complete(flag) {
  const option = new Option(flag.flags);
  return {
    ...flag,
    name: option.attributeName(),
    long: flag.negate ? `--[no-]${option.long.slice(2)}` : option.long,
    parse: parserFor(flag),
  };
}

function parserFor(flag) {
  if (flag.range) return numberIn(flag.range);
  if (flag.cutMax !== undefined) return cutList(flag.cutMax);
  return undefined;
}

function limitsOf(flag) {
  if (flag.range) return `, ${span(flag.range)}`;
  if (flag.cutMax !== undefined) return `, comma-separated, 0–${flag.cutMax}`;
  return '';
}

const describe = (flag) => `${flag.about}${limitsOf(flag)}${flag.note ? `; ${flag.note}` : ''}`;

/** Adds a flag for every setting, showing the defaults the app starts from. */
export function addSettingOptions(command) {
  const defaults = defaultSettings();
  for (const flag of SETTING_FLAGS) {
    const option = new Option(flag.flags, describe(flag)).helpGroup(flag.group);
    if (flag.choices) option.choices(flag.choices);
    if (flag.parse) option.argParser(flag.parse);
    // Cuts start out unset: the plan places them unless they are given.
    if (flag.cutMax === undefined) option.default(flag.get(defaults));
    command.addOption(option);
    if (flag.negate) {
      command.addOption(new Option(flag.negate, flag.negateAbout).helpGroup(flag.group));
    }
  }
  return command;
}

/**
 * Applies the setting flags given on the command line to `settings`.
 * @returns {string[]} notes on the flags that do nothing under the result
 */
export function applySettingFlags(command, settings) {
  const given = SETTING_FLAGS.filter((flag) => command.getOptionValueSource(flag.name) === 'cli');
  for (const flag of given) flag.set(settings, command.getOptionValue(flag.name));
  return given
    .filter((flag) => flag.when && !flag.when.test(settings))
    .map((flag) => `${flag.long} has no effect: it only applies with ${flag.when.needs}`);
}

const CUT_FLAGS = SETTING_FLAGS.filter((flag) => flag.used);
const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const showList = (list) => (list.length ? list.join(',') : 'none');

/**
 * Hand-placed cuts are tidied to fit the plan, which can move, add or drop
 * some of them. Says where that happened, so the puzzle does not quietly
 * differ from what was asked for.
 * @param {object} usedCuts the cuts the plan ended up with
 * @returns {string[]}
 */
export function describeCutChanges(settings, usedCuts) {
  const relevant = CUT_FLAGS.filter((flag) => flag.when.test(settings));
  const changed = relevant.filter((flag) => !sameList(flag.get(settings), flag.used(usedCuts)));
  if (!changed.length) return [];
  if (relevant.every((flag) => flag.get(settings).length === 0)) {
    return ['no manual cuts were given, so they are evenly spaced'];
  }
  return changed.map((flag) => {
    const asked = flag.get(settings);
    const used = showList(flag.used(usedCuts));
    return asked.length
      ? `${flag.label} ${asked.join(',')} did not fit the plan; used ${used}`
      : `${flag.label} not given, so evenly spaced: ${used}`;
  });
}
