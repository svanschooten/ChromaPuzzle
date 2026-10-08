import test from 'node:test';
import assert from 'node:assert/strict';
import { solutionHash } from '../../src/lib/hash.js';
import { layoutPuzzle } from '../../src/lib/puzzleFormat.js';
import { createRandom } from '../../src/lib/random.js';
import { defaultSettings } from '../../src/lib/settings.js';

const plates = (real, decoys) => [
  ...Array.from({ length: real }, (_, i) => ({ tint: [i, 0, 0], isFalse: false })),
  ...Array.from({ length: decoys }, () => ({ tint: [9, 9, 9], isFalse: true })),
];

const layout = (options) =>
  layoutPuzzle({ width: 8, height: 6, settings: defaultSettings(), ...options });

test('the same random stream lays a puzzle out the same way', async () => {
  const stack = plates(4, 3);
  const first = await layout({ plates: stack, random: createRandom(5) });
  const second = await layout({ plates: stack, random: createRandom(5) });
  assert.deepEqual(
    first.entries.map((entry) => stack.indexOf(entry.plate)),
    second.entries.map((entry) => stack.indexOf(entry.plate)),
  );
  assert.equal(first.meta.solutionHash, second.meta.solutionHash);
});

test('the solution hash covers exactly the real plates', async () => {
  const { entries, meta } = await layout({ plates: plates(3, 2), random: createRandom(1) });
  const real = entries.filter((entry) => !entry.plate.isFalse).map((entry) => entry.filename);
  assert.equal(real.length, 3);
  assert.equal(meta.solutionHash, await solutionHash(real));
  assert.deepEqual(
    meta.plateFiles,
    entries.map((entry) => entry.filename),
  );
});

test('filenames are numbered in dealt order and padded to line up', async () => {
  const small = await layout({ plates: plates(2, 1) });
  assert.deepEqual(small.meta.plateFiles, ['plate_01.png', 'plate_02.png', 'plate_03.png']);
  const large = await layout({ plates: plates(16, 16) });
  assert.equal(large.meta.plateFiles.at(-1), 'plate_32.png');
});

test('puzzle.json counts the plates it was handed and records how they stack', async () => {
  const settings = {
    ...defaultSettings(),
    plateCount: 99, // not what was generated: the plates are what count
    bandSpace: 'cells',
    cipher: 0.5,
    occlusionEnabled: true,
    occlusionMode: 'noise',
  };
  const stack = plates(3, 2);
  const { meta } = await layout({ plates: stack, settings, created: new Date(0) });
  assert.equal(meta.version, '1.2');
  assert.equal(meta.numRealPlates, 3);
  assert.equal(meta.numFalsePlates, 2);
  assert.equal(meta.totalPlates, 5);
  assert.deepEqual(meta.cells, settings.cells);
  assert.deepEqual(meta.stack, { mode: 'modular', cipher: 0.5 });
  assert.equal(meta.occlusion.mode, 'noise');
  assert.deepEqual(meta.tints, [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
  ]);
  assert.equal(meta.created, '1970-01-01T00:00:00.000Z');
});

test('cells are only recorded for the cells band space', async () => {
  const { meta } = await layout({ plates: plates(2, 0) });
  assert.equal(meta.cells, null);
  assert.deepEqual(meta.stack, { mode: 'additive', cipher: 0 });
  assert.equal(meta.occlusion, null);
});
