import test from 'node:test';
import assert from 'node:assert/strict';
import { planBands } from '../../src/lib/bands/index.js';
import { splitPlates } from '../../src/lib/split.js';
import { generateFalsePlate } from '../../src/lib/falsePlate.js';
import { createOcclusion } from '../../src/lib/occlusion/index.js';
import { createRandom } from '../../src/lib/random.js';
import { gradient, sumPlates } from './helpers.mjs';

const WIDTH = 32;
const HEIGHT = 24;
const PIXELS = WIDTH * HEIGHT;

function setup({ plateCount = 4, occlusion = 'none', seed = 5 } = {}) {
  const pixels = gradient(WIDTH, HEIGHT);
  const plan = planBands({ pixels, plateCount, mode: 'linear' });
  const field =
    occlusion === 'none'
      ? null
      : createOcclusion({
          mode: occlusion,
          strength: 0.8,
          plateCount,
          bandCount: plan.bandCount,
          width: WIDTH,
          height: HEIGHT,
          shardSize: 8,
          scale: 12,
          random: createRandom(seed),
        });
  const real = splitPlates({ pixels, width: WIDTH, height: HEIGHT, plan, opacity: 1, field });
  return { pixels, plan, field, real };
}

for (const mode of ['drift', 'warp']) {
  for (const occlusion of ['none', 'fracture', 'blend', 'noise']) {
    test(`a ${mode} decoy under ${occlusion} occlusion looks like a plate but is not one`, () => {
      const { pixels, plan, field, real } = setup({ occlusion });
      const decoy = generateFalsePlate({
        mode,
        pixels,
        width: WIDTH,
        height: HEIGHT,
        plan,
        opacity: 1,
        field,
        random: createRandom(21),
      });

      assert.equal(decoy.data.length, PIXELS * 4);
      // Same alpha character as a real plate: a decoy must not stand out.
      for (let i = 0; i < PIXELS; i++) {
        assert.equal(decoy.data[i * 4 + 3], real[0].data[i * 4 + 3]);
      }

      const differsFrom = (plate) => {
        for (let i = 0; i < decoy.data.length; i++) {
          if (decoy.data[i] !== plate.data[i]) return true;
        }
        return false;
      };
      for (const plate of real) assert.ok(differsFrom(plate), 'decoy duplicates a real plate');
    });
  }
}

test('enabling a decoy corrupts the reconstruction', () => {
  const { pixels, plan, real } = setup({ plateCount: 3 });
  const decoy = generateFalsePlate({
    mode: 'warp',
    pixels,
    width: WIDTH,
    height: HEIGHT,
    plan,
    opacity: 1,
    field: null,
    random: createRandom(3),
  });

  const clean = sumPlates(real, PIXELS);
  const corrupted = sumPlates([...real, decoy], PIXELS);
  let drift = 0;
  for (let i = 0; i < clean.length; i++) drift += Math.abs(clean[i] - corrupted[i]);
  assert.ok(drift / clean.length > 5, `decoy barely changed the blend: ${drift / clean.length}`);
});

test('decoy generation is reproducible from a seed', () => {
  const { pixels, plan, field } = setup({ occlusion: 'fracture' });
  const make = () =>
    generateFalsePlate({
      mode: 'warp',
      pixels,
      width: WIDTH,
      height: HEIGHT,
      plan,
      opacity: 1,
      field,
      random: createRandom(99),
    });
  assert.deepEqual(make().data, make().data);
});
