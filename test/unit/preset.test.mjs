import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreset, readPreset } from '../../src/lib/preset.js';

const settings = {
  plateCount: 6,
  falseCount: 3,
  opacity: 0.8,
  bandSpace: 'cells',
  bandMode: 'weighted',
  weave: 3,
  cells: { hue: 7, chroma: 3, value: 5, hard: true },
  cuts: { channels: [[100], [], []], hue: [0, 90, 180, 270], chroma: [], value: [] },
  falseMode: 'warp',
  decoyIntensity: 0.9,
  cipher: 0.4,
  occlusionEnabled: true,
  occlusionMode: 'screen',
  occlusionStrength: 0.7,
  shardSize: 48,
  blendScale: 64,
  screenScale: 3,
  // Not part of a preset: these belong to the image being worked on.
  source: { width: 10 },
  plates: [1, 2, 3],
};

test('a preset round-trips every setting and nothing else', () => {
  const preset = buildPreset(settings);
  const { values, ignored } = readPreset(preset);

  assert.deepEqual(ignored, []);
  for (const key of Object.keys(values)) {
    assert.deepEqual(values[key], settings[key], `${key} did not survive the round trip`);
  }
  assert.ok(!('source' in values) && !('plates' in values));
});

test('numbers outside the allowed range are pulled back in', () => {
  const { values, ignored } = readPreset({
    ...buildPreset(settings),
    plateCount: 99,
    falseCount: -4,
    opacity: 5,
    decoyIntensity: 0,
  });
  assert.equal(values.plateCount, 16);
  assert.equal(values.falseCount, 0);
  assert.equal(values.opacity, 1);
  assert.equal(values.decoyIntensity, 0.05);
  assert.ok(ignored.length === 0, 'clamping is not the same as ignoring');
});

test('unknown choices and stray keys are ignored, not applied', () => {
  const { values, ignored } = readPreset({
    ...buildPreset(settings),
    bandSpace: 'nonsense',
    occlusionMode: 'wobble',
    somethingElse: 42,
  });
  assert.ok(!('bandSpace' in values));
  assert.ok(!('occlusionMode' in values));
  assert.ok(ignored.includes('bandSpace') && ignored.includes('occlusionMode'));
  assert.ok(!('somethingElse' in values));
});

test('a file that is not a preset is refused', () => {
  assert.throws(() => readPreset({ hello: 'world' }), /not a chroma puzzle preset/i);
  assert.throws(() => readPreset(null), /not a chroma puzzle preset/i);
});

test('a preset missing optional parts still loads', () => {
  const { values } = readPreset({ chromaPuzzlePreset: 1, plateCount: 4 });
  assert.equal(values.plateCount, 4);
  assert.ok(!('cells' in values));
});

test('malformed cells and cuts are dropped rather than trusted', () => {
  const { values, ignored } = readPreset({
    chromaPuzzlePreset: 1,
    cells: { hue: 'lots', chroma: 4, value: 5, hard: 'yes' },
    cuts: 'nope',
  });
  assert.equal(values.cells.hue, 6, 'a bad axis count falls back to the default');
  assert.equal(values.cells.hard, false);
  assert.ok(!('cuts' in values));
  assert.ok(ignored.includes('cuts'));
});
