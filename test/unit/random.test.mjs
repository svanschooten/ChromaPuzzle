import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../../src/lib/random.js';

test('a seeded generator repeats its sequence', () => {
  const a = createRandom(42);
  const b = createRandom(42);
  const first = Array.from({ length: 20 }, () => a());
  const second = Array.from({ length: 20 }, () => b());
  assert.deepEqual(first, second);
});

test('values stay inside [0, 1) and different seeds diverge', () => {
  const random = createRandom(7);
  for (let i = 0; i < 500; i++) {
    const value = random();
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(createRandom(1)(), createRandom(2)());
});
