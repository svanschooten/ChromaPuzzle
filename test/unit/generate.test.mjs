import test from 'node:test';
import assert from 'node:assert/strict';
import { isNearlyEmpty } from '../../src/lib/generate.js';

test('a blank plate is reported as nearly empty', () => {
  assert.equal(isNearlyEmpty(new Uint8ClampedArray(64 * 64 * 4)), true);
});

test('a plate with content is not', () => {
  const data = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < data.length; i += 4) data[i + 1] = 90;
  assert.equal(isNearlyEmpty(data), false);
});
