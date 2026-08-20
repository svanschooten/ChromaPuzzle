import test from 'node:test';
import assert from 'node:assert/strict';
import { planBands, MAX_PLATES, MIN_PLATES } from '../../src/lib/bands/index.js';
import { gradient, skewed } from './helpers.mjs';

const PLATE_COUNTS = [2, 3, 4, 5, 8, 12, 16];
const SPACES = ['channels', 'spectrum'];
const MODES = ['linear', 'weighted'];

/** The whole point: a pixel's bands add back up to the pixel. */
function assertBandsSumToPixel(plan, pixel) {
  const out = new Int32Array(plan.bandCount * 3);
  plan.values(pixel[0], pixel[1], pixel[2], out);
  for (let channel = 0; channel < 3; channel++) {
    let sum = 0;
    for (let band = 0; band < plan.bandCount; band++) {
      const value = out[band * 3 + channel];
      assert.ok(value >= 0, `band ${band} took a negative share of channel ${channel}`);
      sum += value;
    }
    assert.equal(sum, pixel[channel], `channel ${channel} of ${pixel} did not add up`);
  }
}

const PIXELS = [
  [0, 0, 0],
  [255, 255, 255],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [128, 128, 128],
  [200, 130, 40],
  [17, 200, 233],
  [1, 2, 3],
  [254, 3, 128],
];

for (const space of SPACES) {
  for (const mode of MODES) {
    for (const plateCount of PLATE_COUNTS) {
      test(`${space}/${mode} bands for ${plateCount} plates add back up`, () => {
        const plan = planBands({ pixels: gradient(48, 32), plateCount, space, mode });
        assert.equal(plan.bandCount, plateCount);
        assert.equal(plan.bands.length, plateCount);
        for (const pixel of PIXELS) assertBandsSumToPixel(plan, pixel);
      });
    }
  }
}

test('three linear channel plates are the plain RGB split', () => {
  const plan = planBands({
    pixels: gradient(16, 16),
    plateCount: 3,
    space: 'channels',
    mode: 'linear',
  });
  const out = new Int32Array(9);
  plan.values(200, 130, 40, out);
  assert.deepEqual([...out], [200, 0, 0, 0, 130, 0, 0, 0, 40]);
});

test('spectrum bands give every plate a hue arc of its own', () => {
  const plan = planBands({
    pixels: gradient(16, 16),
    plateCount: 6,
    space: 'spectrum',
    mode: 'linear',
  });
  const owners = new Set();
  for (let hue = 0; hue < 360; hue += 5) {
    const radians = (hue * Math.PI) / 180;
    const rgb = [
      Math.round(127 + 127 * Math.cos(radians)),
      Math.round(127 + 127 * Math.cos(radians - 2.09)),
      Math.round(127 + 127 * Math.cos(radians + 2.09)),
    ];
    const out = new Int32Array(plan.bandCount * 3);
    plan.values(rgb[0], rgb[1], rgb[2], out);
    let best = 0;
    let bestValue = -1;
    for (let band = 0; band < plan.bandCount; band++) {
      const total = out[band * 3] + out[band * 3 + 1] + out[band * 3 + 2];
      if (total > bestValue) {
        bestValue = total;
        best = band;
      }
    }
    owners.add(best);
  }
  assert.equal(owners.size, 6, `hues landed on ${owners.size} of 6 plates`);
});

test('weaving hands each plate a comb of slices instead of one block', () => {
  const pixels = gradient(32, 32);
  const plain = planBands({ pixels, plateCount: 4, space: 'channels', mode: 'linear', weave: 1 });
  const weaved = planBands({ pixels, plateCount: 4, space: 'channels', mode: 'linear', weave: 4 });

  for (const pixel of PIXELS) {
    assertBandsSumToPixel(weaved, pixel);
    assertBandsSumToPixel(plain, pixel);
  }

  // Unweaved, a plate's red is one solid block of the tonal range. Weaved, the
  // same plate collects a comb of slices spread across the whole range, so its
  // value rises in several separate stretches.
  const risingStretches = (plan) => {
    const out = new Int32Array(plan.bandCount * 3);
    let previous = 0;
    let rising = false;
    let stretches = 0;
    for (let value = 0; value <= 255; value++) {
      plan.values(value, 0, 0, out);
      const current = out[0];
      if (current > previous && !rising) stretches++;
      rising = current > previous;
      previous = current;
    }
    return stretches;
  };
  assert.equal(risingStretches(plain), 1);
  assert.ok(risingStretches(weaved) > 1, 'a weaved plate should collect several slices');
});

test('manual cuts are honoured and handed back for editing', () => {
  const pixels = gradient(32, 32);
  const auto = planBands({ pixels, plateCount: 4, space: 'channels', mode: 'linear' });
  assert.ok(auto.cuts.channels.length === 3);

  const cuts = { channels: [[100], [], []], hue: auto.cuts.hue };
  const manual = planBands({ pixels, plateCount: 4, space: 'channels', mode: 'manual', cuts });
  assert.deepEqual(manual.cuts.channels[0], [100]);

  const out = new Int32Array(manual.bandCount * 3);
  manual.values(150, 0, 0, out);
  assert.equal(out[0], 100, 'the first red band should stop at the cut');
  manual.values(60, 0, 0, out);
  assert.equal(out[0], 60);
  for (const pixel of PIXELS) assertBandsSumToPixel(manual, pixel);
});

test('weighted planning evens out how much image each band carries', () => {
  const width = 64;
  const height = 64;
  const pixels = skewed(width, height, 2); // blue-heavy
  const spread = (mode) => {
    const plan = planBands({ pixels, plateCount: 6, mode });
    const values = new Int32Array(plan.bandCount * 3);
    const energy = new Float64Array(plan.bandCount);
    for (let i = 0; i < width * height; i++) {
      plan.values(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2], values);
      for (let band = 0; band < plan.bandCount; band++) {
        energy[band] += values[band * 3] + values[band * 3 + 1] + values[band * 3 + 2];
      }
    }
    return Math.max(...energy) / Math.max(1, Math.min(...energy));
  };
  const weighted = spread('weighted');
  assert.ok(weighted < 1.6, `weighted bands still uneven: ratio ${weighted}`);
  assert.ok(weighted < spread('linear'), 'weighted planning should be the more even of the two');
});

test('plate counts outside the supported range are refused', () => {
  const pixels = gradient(8, 8);
  assert.throws(() => planBands({ pixels, plateCount: MIN_PLATES - 1 }), RangeError);
  assert.throws(() => planBands({ pixels, plateCount: MAX_PLATES + 1 }), RangeError);
});

test('weighted hue cuts stay in order when the image has only a few hues', () => {
  const width = 40;
  const height = 40;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const orange = i % 2 === 0;
    pixels[i * 4] = orange ? 230 : 40;
    pixels[i * 4 + 1] = orange ? 170 : 70;
    pixels[i * 4 + 2] = orange ? 120 : 200;
    pixels[i * 4 + 3] = 255;
  }
  const plan = planBands({ pixels, plateCount: 6, space: 'spectrum', mode: 'weighted' });
  const cuts = plan.cuts.hue;
  for (let i = 1; i < cuts.length; i++) {
    assert.ok(cuts[i] > cuts[i - 1], `hue cuts collided at ${cuts}`);
  }
  for (const pixel of PIXELS) assertBandsSumToPixel(plan, pixel);
});
