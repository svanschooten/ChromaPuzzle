import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import {
  addSettingOptions,
  applySettingFlags,
  describeCutChanges,
  SETTING_FLAGS,
} from '../../src/cli/options.js';
import { buildPreset, CHOICES, readPreset } from '../../src/lib/preset.js';
import { defaultSettings } from '../../src/lib/settings.js';

const EMPTY_CUTS = { channels: [[], [], []], hue: [], chroma: [], value: [] };

/** Where every value in a preset sits: `plateCount`, `cells.hue`, `cuts.channels.0`. */
function leaves(value, path = []) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, inner]) => leaves(inner, [...path, key]));
  }
  if (Array.isArray(value) && value.length && value.every(Array.isArray)) {
    return value.flatMap((inner, index) => leaves(inner, [...path, index]));
  }
  return [path.join('.')];
}

const valueAt = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);

/** Values worth trying a flag with: both ends of its range, or every choice. */
function samples(flag) {
  if (flag.choices) return flag.choices;
  if (flag.range) return [flag.range.min, flag.range.max];
  if (flag.cutMax !== undefined) return [[0, flag.cutMax]];
  return [true, false];
}

function parse(args) {
  const command = addSettingOptions(new Command()).exitOverride();
  command.configureOutput({ writeErr: () => {} });
  return command.parse(args, { from: 'user' });
}

test('every setting a config file holds has a flag', () => {
  const base = () => ({ ...defaultSettings(), cuts: structuredClone(EMPTY_CUTS) });
  const baseline = buildPreset(base());
  const reached = new Set();
  for (const flag of SETTING_FLAGS) {
    for (const value of samples(flag)) {
      const settings = base();
      flag.set(settings, value);
      const preset = buildPreset(settings);
      for (const path of leaves(baseline)) {
        if (JSON.stringify(valueAt(preset, path)) !== JSON.stringify(valueAt(baseline, path))) {
          reached.add(path);
        }
      }
    }
  }
  const missing = leaves(baseline).filter(
    (path) => path !== 'chromaPuzzlePreset' && !reached.has(path),
  );
  assert.deepEqual(missing, [], `no flag sets ${missing.join(', ')}`);
});

test('every value a flag accepts is one a config file accepts unchanged', () => {
  for (const flag of SETTING_FLAGS) {
    for (const value of samples(flag)) {
      const settings = { ...defaultSettings(), bandMode: 'manual' };
      flag.set(settings, value);
      const { values, ignored, adjusted } = readPreset(buildPreset(settings));
      assert.deepEqual([ignored, adjusted], [[], []], `${flag.long} ${value}`);
      assert.deepEqual({ ...defaultSettings(), ...values }, settings, `${flag.long} ${value}`);
    }
  }
  for (const [key, allowed] of Object.entries(CHOICES)) {
    const offered = SETTING_FLAGS.some(
      (flag) => flag.choices && allowed.every((choice) => flag.choices.includes(choice)),
    );
    assert.ok(offered, `no flag offers every ${key}`);
  }
});

test('flags refuse what a config file would have to pull back into range', () => {
  for (const flag of SETTING_FLAGS.filter((entry) => entry.range)) {
    const { min, max, step } = flag.range;
    assert.equal(flag.parse(String(min)), min);
    assert.equal(flag.parse(String(max)), max);
    const nudge = step === 1 ? 1 : 0.01;
    for (const bad of [String(min - nudge), String(max + nudge), 'lots', '', ' ']) {
      assert.throws(() => flag.parse(bad), /Must be|Expected/, `${flag.long} took '${bad}'`);
    }
    if (step === 1) assert.throws(() => flag.parse(String(min + 0.5)), /whole number/);
  }
  for (const flag of SETTING_FLAGS.filter((entry) => entry.cutMax !== undefined)) {
    assert.deepEqual(flag.parse(`0,12,${flag.cutMax}`), [0, 12, flag.cutMax]);
    assert.deepEqual(flag.parse(''), []);
    for (const bad of [String(flag.cutMax + 1), '-1', '1.5', '1,,2', 'x']) {
      assert.throws(() => flag.parse(bad), /Expected/, `${flag.long} took '${bad}'`);
    }
  }
  assert.throws(() => parse(['--space', 'colour']), /Allowed choices/);
  assert.throws(() => parse(['--occlusion', 'fog']), /Allowed choices/);
});

test('without flags the settings are the app defaults, and the help says so', () => {
  const command = parse([]);
  const settings = defaultSettings();
  assert.deepEqual(applySettingFlags(command, settings), []);
  assert.deepEqual(settings, defaultSettings());

  for (const flag of SETTING_FLAGS.filter((entry) => entry.cutMax === undefined)) {
    const option = command.options.find((entry) => entry.attributeName() === flag.name);
    assert.deepEqual(option.defaultValue, flag.get(defaultSettings()), flag.long);
  }
});

test('only the flags given override what a config file set', () => {
  const fromConfig = {
    ...defaultSettings(),
    falseCount: 5,
    cells: { hue: 6, chroma: 2, value: 3, hard: true },
    occlusionEnabled: true,
    occlusionMode: 'screen',
  };
  const command = parse([
    '-n',
    '6',
    '--hue-classes',
    '8',
    '--no-hard-cells',
    '--red-cuts',
    '10,20',
    '--occlusion',
    'none',
  ]);
  applySettingFlags(command, fromConfig);
  assert.equal(fromConfig.plateCount, 6);
  assert.equal(fromConfig.falseCount, 5);
  assert.deepEqual(fromConfig.cells, { hue: 8, chroma: 2, value: 3, hard: false });
  assert.deepEqual(fromConfig.cuts, { ...EMPTY_CUTS, channels: [[10, 20], [], []] });
  assert.equal(fromConfig.occlusionEnabled, false);
  assert.equal(fromConfig.occlusionMode, 'screen', 'switching occlusion off keeps its mode');
});

test('flags that would do nothing are pointed out', () => {
  const command = parse([
    '--space',
    'cells',
    '--weave',
    '3',
    '--decoys',
    '0',
    '--decoy-intensity',
    '0.3',
    '--dot-size',
    '4',
    '--hue-classes',
    '9',
  ]);
  const notes = applySettingFlags(command, defaultSettings());
  assert.equal(notes.length, 3, notes.join('\n'));
  assert.match(notes[0], /--weave .*--space channels or spectrum/);
  assert.match(notes[1], /--decoy-intensity .*--decoys above 0/);
  assert.match(notes[2], /--dot-size .*--occlusion screen/);

  // A setting from the config file can be what makes a flag count.
  const occluded = { ...defaultSettings(), occlusionEnabled: true, occlusionMode: 'screen' };
  assert.deepEqual(applySettingFlags(parse(['--dot-size', '4']), occluded), []);
});

test('manual cuts that had to be tidied are reported', () => {
  const used = { ...EMPTY_CUTS, channels: [[50, 170], [85, 170], [128]] };
  const manual = { ...defaultSettings(), bandMode: 'manual' };

  assert.deepEqual(describeCutChanges(defaultSettings(), used), [], 'not manual: nothing to say');
  assert.deepEqual(describeCutChanges(manual, used), [
    'no manual cuts were given, so they are evenly spaced',
  ]);

  manual.cuts = { ...EMPTY_CUTS, channels: [[50], [85, 170], [128]] };
  assert.deepEqual(describeCutChanges(manual, used), [
    'red cuts 50 did not fit the plan; used 50,170',
  ]);

  manual.cuts = { ...EMPTY_CUTS, channels: [[50, 170], [], [128]] };
  assert.deepEqual(describeCutChanges(manual, used), [
    'green cuts not given, so evenly spaced: 85,170',
  ]);
});
