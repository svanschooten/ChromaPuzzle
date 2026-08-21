import test from 'node:test';
import assert from 'node:assert/strict';
import { createOcclusion } from '../../src/lib/occlusion/index.js';
import { createRandom } from '../../src/lib/random.js';

const WIDTH = 24;
const HEIGHT = 18;
const MODES = ['fracture', 'blend', 'noise', 'screen'];

const build = (mode, plateCount, bandCount, strength = 1, seed = 3) =>
  createOcclusion({
    mode,
    strength,
    plateCount,
    bandCount,
    width: WIDTH,
    height: HEIGHT,
    shardSize: 8,
    scale: mode === 'screen' ? 2 : 12,
    random: createRandom(seed),
  });

for (const mode of MODES) {
  test(`${mode} weights hand out each band exactly once`, () => {
    const plateCount = 5;
    const bandCount = 5;
    const field = build(mode, plateCount, bandCount);
    const thresholds = new Float32Array(bandCount);
    const weights = new Float32Array(bandCount * 2 * plateCount);
    // Only a field that splits tones fills the bright half.
    const halves = field.tonal ? 2 : 1;

    for (let i = 0; i < WIDTH * HEIGHT; i++) {
      field.fill(i, thresholds, weights);
      for (let band = 0; band < bandCount; band++) {
        for (let half = 0; half < halves; half++) {
          let sum = 0;
          for (let plate = 0; plate < plateCount; plate++) {
            const weight = weights[(band * 2 + half) * plateCount + plate];
            assert.ok(weight >= 0, `${mode} produced a negative weight`);
            sum += weight;
          }
          assert.ok(
            Math.abs(sum - 1) < 1e-4,
            `${mode} band ${band} half ${half} sums to ${sum} at pixel ${i}`,
          );
        }
      }
    }
  });

  test(`${mode} at zero strength is the plain split`, () => {
    const plateCount = 4;
    const bandCount = 4;
    const field = build(mode, plateCount, bandCount, 0);
    const thresholds = new Float32Array(bandCount);
    const weights = new Float32Array(bandCount * 2 * plateCount);

    for (const pixel of [0, 17, WIDTH * HEIGHT - 1]) {
      field.fill(pixel, thresholds, weights);
      for (let band = 0; band < bandCount; band++) {
        for (let plate = 0; plate < plateCount; plate++) {
          const expected = plate === band ? 1 : 0;
          assert.ok(
            Math.abs(weights[band * 2 * plateCount + plate] - expected) < 1e-6,
            `${mode} at strength 0 moved band ${band} onto plate ${plate}`,
          );
        }
      }
    }
  });

  test(`${mode} is reproducible from a seed`, () => {
    const bandCount = 3;
    const plateCount = 3;
    const size = bandCount * 2 * plateCount;
    const first = new Float32Array(size);
    const second = new Float32Array(size);
    build(mode, plateCount, bandCount, 1, 11).fill(9, new Float32Array(bandCount), first);
    build(mode, plateCount, bandCount, 1, 11).fill(9, new Float32Array(bandCount), second);
    assert.deepEqual(first, second);
  });
}

test('fracture holds one plan per shard, so neighbouring pixels usually agree', () => {
  const field = build('fracture', 4, 4);
  const plans = new Set();
  for (let i = 0; i < WIDTH * HEIGHT; i++) plans.add(field.planAt(i));
  assert.ok(plans.size > 1, 'expected several shards');
  assert.ok(plans.size < WIDTH * HEIGHT, 'shards should cover more than one pixel each');
});

test('noise changes its plan every pixel', () => {
  const field = build('noise', 4, 4);
  assert.notEqual(field.planAt(0), field.planAt(1));
});

test('blend masks vary smoothly, so most neighbours are close', () => {
  const plateCount = 4;
  const bandCount = 4;
  const field = build('blend', plateCount, bandCount);
  const thresholds = new Float32Array(bandCount);
  const left = new Float32Array(bandCount * 2 * plateCount);
  const right = new Float32Array(bandCount * 2 * plateCount);

  let jumps = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH - 1; x++) {
      field.fill(y * WIDTH + x, thresholds, left);
      field.fill(y * WIDTH + x + 1, thresholds, right);
      for (let i = 0; i < left.length; i++) {
        if (Math.abs(left[i] - right[i]) > 0.25) jumps++;
      }
    }
  }
  assert.equal(jumps, 0, `blend masks jumped ${jumps} times between neighbours`);
});
