import test from 'node:test';
import assert from 'node:assert/strict';
import { cipherPlates, revealModular } from '../../src/lib/cipher.js';
import { createRandom } from '../../src/lib/random.js';
import { gradient } from './helpers.mjs';

const WIDTH = 40;
const HEIGHT = 30;
const PIXELS = WIDTH * HEIGHT;

/** Additive shares of a source image, the shape generation hands over. */
function sharesOf(source, count, random) {
  const plates = Array.from({ length: count }, () => ({
    data: new Uint8ClampedArray(PIXELS * 4),
    isFalse: false,
  }));
  for (let i = 0; i < PIXELS; i++) {
    for (let channel = 0; channel < 3; channel++) {
      const total = source[i * 4 + channel];
      let running = 0;
      let handed = 0;
      for (let plate = 0; plate < count; plate++) {
        running += total / count;
        const rounded = Math.round(running);
        plates[plate].data[i * 4 + channel] = rounded - handed;
        handed = rounded;
      }
    }
    for (const plate of plates) plate.data[i * 4 + 3] = 255;
  }
  return plates;
}

const correlation = (source, plate) => {
  let sa = 0,
    sb = 0,
    saa = 0,
    sbb = 0,
    sab = 0;
  for (let i = 0; i < PIXELS; i++) {
    const a = (source[i * 4] + source[i * 4 + 1] + source[i * 4 + 2]) / 3;
    const b = (plate[i * 4] + plate[i * 4 + 1] + plate[i * 4 + 2]) / 3;
    sa += a;
    sb += b;
    saa += a * a;
    sbb += b * b;
    sab += a * b;
  }
  const cov = sab / PIXELS - (sa / PIXELS) * (sb / PIXELS);
  const va = saa / PIXELS - (sa / PIXELS) ** 2;
  const vb = sbb / PIXELS - (sb / PIXELS) ** 2;
  return vb <= 1e-9 ? 0 : cov / Math.sqrt(va * vb);
};

for (const strength of [0, 0.25, 0.6, 1]) {
  test(`ciphered plates at strength ${strength} still reveal the source exactly`, () => {
    const source = gradient(WIDTH, HEIGHT);
    const plates = sharesOf(source, 4, createRandom(1));
    cipherPlates({ plates, strength, random: createRandom(9) });

    const revealed = revealModular(plates, WIDTH, HEIGHT);
    for (let i = 0; i < PIXELS; i++) {
      for (let channel = 0; channel < 3; channel++) {
        assert.equal(
          revealed[i * 4 + channel],
          source[i * 4 + channel],
          `pixel ${i} channel ${channel}`,
        );
      }
    }
  });
}

test('a full cipher leaves no trace of the picture in any plate', () => {
  const source = gradient(WIDTH, HEIGHT);
  const plates = sharesOf(source, 4, createRandom(2));
  const before = Math.max(...plates.map((plate) => Math.abs(correlation(source, plate.data))));
  cipherPlates({ plates, strength: 1, random: createRandom(4) });
  const after = Math.max(...plates.map((plate) => Math.abs(correlation(source, plate.data))));

  assert.ok(before > 0.5, `plain shares should show the picture, got ${before}`);
  assert.ok(after < 0.15, `ciphered plates still correlate at ${after}`);
});

test('cipher strength trades hiding against readability', () => {
  const source = gradient(WIDTH, HEIGHT);
  const measure = (strength) => {
    const plates = sharesOf(source, 4, createRandom(3));
    cipherPlates({ plates, strength, random: createRandom(5) });
    return Math.max(...plates.map((plate) => Math.abs(correlation(source, plate.data))));
  };
  assert.ok(measure(1) < measure(0.4), 'a stronger cipher should hide more');
  assert.ok(measure(0.4) < measure(0), 'any cipher should hide more than none');
});

test('decoys are ciphered too, so they cannot be spotted by their noise', () => {
  const source = gradient(WIDTH, HEIGHT);
  const plates = sharesOf(source, 3, createRandom(6));
  plates.push({ data: new Uint8ClampedArray(PIXELS * 4).fill(120), isFalse: true });
  cipherPlates({ plates, strength: 1, random: createRandom(7) });

  const spread = (data) => {
    let min = 255;
    let max = 0;
    for (let i = 0; i < PIXELS; i++) {
      min = Math.min(min, data[i * 4]);
      max = Math.max(max, data[i * 4]);
    }
    return max - min;
  };
  assert.ok(spread(plates.at(-1).data) > 200, 'a decoy should look as noisy as the rest');
});

test('leaving a plate out gives nothing away', () => {
  const source = gradient(WIDTH, HEIGHT);
  const plates = sharesOf(source, 4, createRandom(8));
  cipherPlates({ plates, strength: 1, random: createRandom(2) });

  const partial = revealModular(plates.slice(0, 3), WIDTH, HEIGHT);
  assert.ok(
    Math.abs(correlation(source, partial)) < 0.15,
    'an incomplete stack should not resemble the source',
  );
});
