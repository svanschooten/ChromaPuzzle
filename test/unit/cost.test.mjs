import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDuration, estimateGenerationMs } from '../../src/lib/cost.js';

const base = { width: 1200, height: 900, plateCount: 4, decoyCount: 2 };

test('the estimate grows with plates, decoys and pixels', () => {
  const cost = (overrides) => estimateGenerationMs({ ...base, ...overrides });
  assert.ok(cost({ plateCount: 8 }) > cost({ plateCount: 4 }));
  assert.ok(cost({ decoyCount: 8 }) > cost({ decoyCount: 2 }));
  assert.ok(cost({ width: 2400 }) > cost({}));
});

test('occlusion costs more than a plain split, and grows faster', () => {
  const plain = (plateCount) =>
    estimateGenerationMs({ ...base, plateCount, occlusionMode: 'none' });
  const noisy = (plateCount) =>
    estimateGenerationMs({ ...base, plateCount, occlusionMode: 'noise' });
  assert.ok(noisy(4) > plain(4));
  assert.ok(noisy(16) / noisy(4) > plain(16) / plain(4));
});

test('an unknown occlusion mode is treated as none', () => {
  assert.equal(
    estimateGenerationMs({ ...base, occlusionMode: 'nonsense' }),
    estimateGenerationMs({ ...base, occlusionMode: 'none' }),
  );
});

test('durations read as plain english', () => {
  assert.equal(describeDuration(400), 'under a second');
  assert.equal(describeDuration(4200), 'about 4s');
  assert.match(describeDuration(120000), /minutes/);
});

test('colour cells cost more than channels, and hard cells less than soft', () => {
  const cells = (hardCells) => estimateGenerationMs({ ...base, bandSpace: 'cells', hardCells });
  const channels = estimateGenerationMs({ ...base, bandSpace: 'channels' });
  assert.ok(cells(false) > cells(true));
  assert.ok(cells(true) > channels);
});
