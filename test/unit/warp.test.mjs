import test from 'node:test';
import assert from 'node:assert/strict';
import { warpImage } from '../../src/lib/warp.js';
import { createRandom } from '../../src/lib/random.js';
import { gradient } from './helpers.mjs';

const WIDTH = 32;
const HEIGHT = 32;

test('a warp keeps the image size and its alpha', () => {
  const pixels = gradient(WIDTH, HEIGHT);
  pixels[3] = 0;
  const warped = warpImage({ pixels, width: WIDTH, height: HEIGHT, random: createRandom(1) });
  assert.equal(warped.length, pixels.length);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    assert.ok(warped[i * 4 + 3] >= 0 && warped[i * 4 + 3] <= 255);
  }
});

test('a warp actually moves the picture', () => {
  const pixels = gradient(WIDTH, HEIGHT);
  const warped = warpImage({ pixels, width: WIDTH, height: HEIGHT, random: createRandom(2) });
  let moved = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.abs(warped[i] - pixels[i]) > 6) moved++;
  }
  assert.ok(moved > WIDTH * HEIGHT * 0.15, `only ${moved} pixels moved`);
});

test('warps are reproducible from a seed and differ between seeds', () => {
  const pixels = gradient(WIDTH, HEIGHT);
  const warp = (seed) =>
    warpImage({ pixels, width: WIDTH, height: HEIGHT, random: createRandom(seed) });
  assert.deepEqual(warp(4), warp(4));
  assert.notDeepEqual(warp(4), warp(5));
});
