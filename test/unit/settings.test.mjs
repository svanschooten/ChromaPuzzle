import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSettings,
  generationSettings,
  occlusionSettings,
  pickSettings,
} from '../../src/lib/settings.js';

test('every call hands out defaults of its own', () => {
  const first = defaultSettings();
  first.cells.hue = 12;
  first.plateCount = 9;
  const second = defaultSettings();
  assert.equal(second.cells.hue, 6);
  assert.equal(second.plateCount, 3);
});

test('picking settings leaves the image and plates behind', () => {
  const picked = pickSettings({ ...defaultSettings(), source: { width: 10 }, plates: [1, 2] });
  assert.deepEqual(picked, defaultSettings());
});

test('occlusion is null when switched off, and takes the scale its mode uses', () => {
  const settings = { ...defaultSettings(), blendScale: 64, screenScale: 3 };
  assert.equal(occlusionSettings(settings), null);

  settings.occlusionEnabled = true;
  settings.occlusionMode = 'screen';
  assert.equal(occlusionSettings(settings).scale, 3);
  settings.occlusionMode = 'blend';
  assert.deepEqual(occlusionSettings(settings), {
    mode: 'blend',
    strength: 0.6,
    shardSize: 32,
    scale: 64,
  });
});

test('hand-placed cuts only reach generation in manual mode', () => {
  const cuts = { channels: [[100], [], []], hue: [10, 200], chroma: [], value: [] };
  const settings = { ...defaultSettings(), cuts };
  assert.equal(generationSettings(settings, 1).cuts, null);

  settings.bandMode = 'manual';
  const run = generationSettings(settings, 1);
  assert.deepEqual(run.cuts, cuts);
  // Copied, so they can be posted to a worker whatever they were edited through.
  assert.notEqual(run.cuts.channels[0], cuts.channels[0]);
  assert.notEqual(run.cuts.hue, cuts.hue);
});

test('generation settings carry the seed and nothing the generator does not read', () => {
  const run = generationSettings(defaultSettings(), 42);
  assert.equal(run.seed, 42);
  assert.deepEqual(Object.keys(run).sort(), [
    'bandMode',
    'bandSpace',
    'cells',
    'cipher',
    'cuts',
    'decoyIntensity',
    'falseCount',
    'falseMode',
    'occlusion',
    'opacity',
    'plateCount',
    'seed',
    'weave',
  ]);
});
