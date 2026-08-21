import test from 'node:test';
import assert from 'node:assert/strict';
import { planBands } from '../../src/lib/bands/index.js';
import { colourful, correlated } from './helpers.mjs';

const WIDTH = 48;
const HEIGHT = 48;

const PIXELS = [
  [0, 0, 0],
  [255, 255, 255],
  [255, 0, 0],
  [12, 200, 90],
  [130, 130, 131],
  [200, 130, 40],
  [3, 2, 1],
];

function assertSumsToPixel(plan, pixel) {
  const out = new Int32Array(plan.bandCount * 3);
  plan.values(pixel[0], pixel[1], pixel[2], out);
  for (let channel = 0; channel < 3; channel++) {
    let sum = 0;
    for (let band = 0; band < plan.bandCount; band++) {
      assert.ok(out[band * 3 + channel] >= 0);
      sum += out[band * 3 + channel];
    }
    assert.equal(sum, pixel[channel], `channel ${channel} of ${pixel} did not add up`);
  }
}

for (const mode of ['linear', 'weighted']) {
  for (const hard of [false, true]) {
    for (const plateCount of [2, 3, 6, 11, 16]) {
      test(`cells/${mode}${hard ? '/hard' : ''} with ${plateCount} plates add back up`, () => {
        const plan = planBands({
          pixels: colourful(WIDTH, HEIGHT),
          plateCount,
          space: 'cells',
          mode,
          cells: { hue: 6, chroma: 4, value: 5, hard },
        });
        assert.equal(plan.bandCount, plateCount);
        for (const pixel of PIXELS) assertSumsToPixel(plan, pixel);
      });
    }
  }
}

test('hard cells send a pixel to a single plate', () => {
  const plan = planBands({
    pixels: colourful(WIDTH, HEIGHT),
    plateCount: 6,
    space: 'cells',
    cells: { hue: 6, chroma: 4, value: 5, hard: true },
  });
  const out = new Int32Array(plan.bandCount * 3);
  for (const pixel of PIXELS.filter((p) => p.some(Boolean))) {
    plan.values(pixel[0], pixel[1], pixel[2], out);
    const holders = new Set();
    for (let band = 0; band < plan.bandCount; band++) {
      if (out[band * 3] || out[band * 3 + 1] || out[band * 3 + 2]) holders.add(band);
    }
    assert.equal(holders.size, 1, `${pixel} landed on ${holders.size} plates`);
  }
});

test('soft cells share a pixel between neighbouring plates', () => {
  const plan = planBands({
    pixels: colourful(WIDTH, HEIGHT),
    plateCount: 6,
    space: 'cells',
    cells: { hue: 6, chroma: 4, value: 5, hard: false },
  });
  const out = new Int32Array(plan.bandCount * 3);
  plan.values(200, 130, 40, out);
  let holders = 0;
  for (let band = 0; band < plan.bandCount; band++) {
    if (out[band * 3] || out[band * 3 + 1] || out[band * 3 + 2]) holders++;
  }
  assert.ok(holders > 1 && holders <= 8, `soft routing touched ${holders} plates`);
});

test('an axis set to one class stops moving the plate index', () => {
  const pixels = colourful(WIDTH, HEIGHT);
  const only = { hue: 6, chroma: 1, value: 1, hard: true };
  const plan = planBands({ pixels, plateCount: 6, space: 'cells', cells: only });
  const withHueOnly = (pixel) => {
    const out = new Int32Array(plan.bandCount * 3);
    plan.values(pixel[0], pixel[1], pixel[2], out);
    return out.findIndex((value, index) => index % 3 === 0 && value > 0) / 3;
  };
  // Same hue, different brightness: with the other axes off they share a plate.
  assert.equal(withHueOnly([200, 100, 100]), withHueOnly([100, 50, 50]));
});

test('three axes spread the image over the plates better than hue alone', () => {
  const pixels = colourful(64, 64);
  const share = (cells) => {
    const plan = planBands({ pixels, plateCount: 6, space: 'cells', cells });
    const values = new Int32Array(plan.bandCount * 3);
    const energy = new Float64Array(plan.bandCount);
    for (let i = 0; i < 64 * 64; i++) {
      plan.values(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2], values);
      for (let band = 0; band < plan.bandCount; band++) {
        energy[band] += values[band * 3] + values[band * 3 + 1] + values[band * 3 + 2];
      }
    }
    return Math.max(...energy) / Math.max(1, Math.min(...energy));
  };
  const hueOnly = share({ hue: 6, chroma: 1, value: 1, hard: false });
  const allThree = share({ hue: 6, chroma: 4, value: 5, hard: false });
  assert.ok(allThree < hueOnly, `three axes (${allThree}) should beat hue alone (${hueOnly})`);
});

test('cells hand back their cuts for editing', () => {
  const plan = planBands({
    pixels: colourful(WIDTH, HEIGHT),
    plateCount: 6,
    space: 'cells',
    cells: { hue: 6, chroma: 4, value: 5, hard: false },
  });
  assert.equal(plan.cuts.hue.length, 6);
  assert.equal(plan.cuts.chroma.length, 3);
  assert.equal(plan.cuts.value.length, 4);
});

test('weighted cells even out the plate loads that summing leaves lopsided', () => {
  const pixels = correlated(64, 64);
  const spread = (mode) => {
    const plan = planBands({
      pixels,
      plateCount: 6,
      space: 'cells',
      mode,
      cells: { hue: 6, chroma: 4, value: 5, hard: true },
    });
    const values = new Int32Array(plan.bandCount * 3);
    const energy = new Float64Array(plan.bandCount);
    for (let i = 0; i < 64 * 64; i++) {
      plan.values(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2], values);
      for (let band = 0; band < plan.bandCount; band++) {
        energy[band] += values[band * 3] + values[band * 3 + 1] + values[band * 3 + 2];
      }
    }
    return Math.max(...energy) / Math.max(1, Math.min(...energy));
  };
  assert.ok(spread('weighted') < spread('linear'), 'balancing should tighten the spread');
});

test('no plate is left empty once the cells are balanced', () => {
  const pixels = correlated(64, 64);
  const plan = planBands({
    pixels,
    plateCount: 6,
    space: 'cells',
    mode: 'weighted',
    cells: { hue: 6, chroma: 4, value: 5, hard: true },
  });
  const values = new Int32Array(plan.bandCount * 3);
  const energy = new Float64Array(plan.bandCount);
  for (let i = 0; i < 64 * 64; i++) {
    plan.values(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2], values);
    for (let band = 0; band < plan.bandCount; band++) {
      energy[band] += values[band * 3] + values[band * 3 + 1] + values[band * 3 + 2];
    }
  }
  const total = energy.reduce((sum, value) => sum + value, 0);
  for (const [band, value] of energy.entries()) {
    assert.ok(
      value / total > 0.01,
      `plate ${band} carries only ${((100 * value) / total).toFixed(2)}%`,
    );
  }
});
