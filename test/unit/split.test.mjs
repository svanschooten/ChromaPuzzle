import test from 'node:test';
import assert from 'node:assert/strict';
import { planBands } from '../../src/lib/bands/index.js';
import { splitPlates } from '../../src/lib/split.js';
import { createOcclusion } from '../../src/lib/occlusion/index.js';
import { createRandom } from '../../src/lib/random.js';
import { gradient, maxReconstructionError } from './helpers.mjs';

const WIDTH = 40;
const HEIGHT = 30;
const PIXELS = WIDTH * HEIGHT;

const occlusionFor = (mode, plateCount, bandCount) =>
  mode === 'none'
    ? null
    : createOcclusion({
        mode,
        strength: 1,
        plateCount,
        bandCount,
        width: WIDTH,
        height: HEIGHT,
        shardSize: 12,
        scale: 16,
        random: createRandom(7),
      });

for (const mode of ['none', 'fracture', 'blend', 'noise']) {
  for (const plateCount of [2, 3, 5, 8]) {
    test(`${mode} occlusion with ${plateCount} plates reconstructs the source exactly`, () => {
      const pixels = gradient(WIDTH, HEIGHT);
      const plan = planBands({ pixels, plateCount, mode: 'linear' });
      const field = occlusionFor(mode, plateCount, plan.bandCount);
      const plates = splitPlates({
        pixels,
        width: WIDTH,
        height: HEIGHT,
        plan,
        opacity: 1,
        field,
      });

      assert.equal(plates.length, plateCount);
      assert.equal(maxReconstructionError(plates, pixels, PIXELS), 0);
    });
  }
}

test('plate alpha follows the source alpha and the opacity setting', () => {
  const pixels = gradient(WIDTH, HEIGHT);
  pixels[3] = 0;
  pixels[7] = 128;
  const plan = planBands({ pixels, plateCount: 4, mode: 'linear' });
  const plates = splitPlates({ pixels, width: WIDTH, height: HEIGHT, plan, opacity: 0.5 });
  for (const plate of plates) {
    assert.equal(plate.data[3], 0);
    assert.equal(plate.data[7], 64);
    assert.equal(plate.data[11], 128);
  }
});

test('a fully transparent pixel stays empty on every plate', () => {
  const pixels = gradient(WIDTH, HEIGHT);
  for (let c = 0; c < 4; c++) pixels[c] = 0;
  const plan = planBands({ pixels, plateCount: 3, mode: 'linear' });
  const plates = splitPlates({ pixels, width: WIDTH, height: HEIGHT, plan, opacity: 1 });
  for (const plate of plates) {
    for (let c = 0; c < 4; c++) assert.equal(plate.data[c], 0);
  }
});

test('rendering one plate is the same plate, give or take rounding', () => {
  // Single-plate rendering skips the cumulative pass over the other plates,
  // because a decoy never has to add up with anyone. That leaves the shares a
  // rounding step apart from the full split, which is all it may ever be.
  const pixels = gradient(WIDTH, HEIGHT);
  const plan = planBands({ pixels, plateCount: 6, mode: 'linear' });
  const args = { pixels, width: WIDTH, height: HEIGHT, plan, opacity: 1 };
  const all = splitPlates({ ...args, field: occlusionFor('fracture', 6, plan.bandCount) });
  const one = splitPlates({ ...args, field: occlusionFor('fracture', 6, plan.bandCount), only: 4 });

  assert.equal(one.length, 1);
  let worst = 0;
  for (let i = 0; i < PIXELS; i++) {
    assert.equal(one[0].data[i * 4 + 3], all[4].data[i * 4 + 3], 'alpha must match exactly');
    for (let c = 0; c < 3; c++) {
      worst = Math.max(worst, Math.abs(one[0].data[i * 4 + c] - all[4].data[i * 4 + c]));
    }
  }
  // Each (band, tonal half) landing on a channel can round differently, and no
  // more than that.
  const values = new Int32Array(plan.bandCount * 3);
  plan.values(255, 255, 255, values);
  const perChannel = [0, 0, 0];
  for (let band = 0; band < plan.bandCount; band++) {
    for (let channel = 0; channel < 3; channel++) {
      if (values[band * 3 + channel] > 0) perChannel[channel]++;
    }
  }
  const bound = Math.max(...perChannel) * 2;
  assert.ok(worst <= bound, `single-plate render drifted by ${worst}, bound is ${bound}`);
});

test('a plain single-plate render is identical to the full split', () => {
  const pixels = gradient(WIDTH, HEIGHT);
  const plan = planBands({ pixels, plateCount: 5, mode: 'linear' });
  const args = { pixels, width: WIDTH, height: HEIGHT, plan, opacity: 1 };
  const all = splitPlates(args);
  const one = splitPlates({ ...args, only: 2 });
  assert.deepEqual(one[0].data, all[2].data);
});

test('opacity below 1 boosts colors and can clip, opacity 1 never does', () => {
  const pixels = new Uint8ClampedArray([255, 255, 255, 255]);
  const plan = planBands({ pixels, plateCount: 3, mode: 'linear' });
  const exact = splitPlates({ pixels, width: 1, height: 1, plan, opacity: 1 });
  assert.equal(maxReconstructionError(exact, pixels, 1), 0);

  const boosted = splitPlates({ pixels, width: 1, height: 1, plan, opacity: 0.5 });
  assert.equal(boosted[0].data[0], 255, 'a doubled 255 should clip at 255');
});
