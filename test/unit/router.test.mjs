import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../../src/lib/bands/router.js';

test('soft routing splits between two classes that sum to one', () => {
  const router = createRouter({ cuts: [0, 90, 180, 270], size: 360, ring: true, hard: false });
  assert.equal(router.classCount, 4);
  for (let position = 0; position < 360; position++) {
    const weight = router.weightA[position];
    assert.ok(weight >= 0 && weight <= 1, `weight ${weight} out of range at ${position}`);
    assert.ok(router.classA[position] < 4 && router.classB[position] < 4);
  }
});

test('hard routing sends a position to exactly one class', () => {
  const router = createRouter({ cuts: [0, 90, 180, 270], size: 360, ring: true, hard: true });
  for (let position = 0; position < 360; position++) {
    assert.equal(router.weightA[position], 1);
    assert.equal(router.classA[position], router.classB[position]);
  }
});

test('a position sits closest to the class whose interval it falls in', () => {
  const router = createRouter({ cuts: [0, 90, 180, 270], size: 360, ring: true, hard: true });
  assert.equal(router.classA[45], 0);
  assert.equal(router.classA[135], 1);
  assert.equal(router.classA[225], 2);
  assert.equal(router.classA[315], 3);
});

test('a ring wraps around, a line clamps at its ends', () => {
  const ring = createRouter({ cuts: [0, 120, 240], size: 360, ring: true, hard: false });
  // Either side of the wrap sits between the last centre and the first one.
  assert.equal(ring.classA[359], ring.classA[1]);
  assert.equal(ring.classB[359], ring.classB[1]);
  assert.ok(ring.weightA[359] > ring.weightA[1], 'the share should hand over across the wrap');

  const line = createRouter({ cuts: [128], size: 256, ring: false, hard: false });
  assert.equal(line.classCount, 2);
  assert.equal(line.classA[0], 0);
  assert.equal(line.weightA[0], 1, 'below the first centre everything stays on class 0');
  assert.equal(line.classA[255], 1);
  assert.equal(line.weightA[255], 1, 'above the last centre everything stays on the last class');
});

test('one class means the axis is switched off', () => {
  const router = createRouter({ cuts: [], size: 256, ring: false, hard: false });
  assert.equal(router.classCount, 1);
  for (let position = 0; position < 256; position++) {
    assert.equal(router.classA[position], 0);
    assert.equal(router.classB[position], 0);
    assert.equal(router.weightA[position], 1);
  }
});

test('neighbouring positions route to near-identical weights', () => {
  const router = createRouter({
    cuts: [0, 60, 120, 180, 240, 300],
    size: 360,
    ring: true,
    hard: false,
  });
  for (let position = 1; position < 360; position++) {
    if (router.classA[position] !== router.classA[position - 1]) continue;
    assert.ok(Math.abs(router.weightA[position] - router.weightA[position - 1]) < 0.1);
  }
});
