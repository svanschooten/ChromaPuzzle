// Seeded randomness, so a generated puzzle can be reproduced and tested.

/** mulberry32: small, fast, and good enough for picking shards and tints. */
export function createRandom(seed = (Math.random() * 2 ** 32) >>> 0) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (random, low, high) => low + random() * (high - low);

export const pick = (random, count) => Math.min(count - 1, Math.floor(random() * count));

export function shuffled(random, items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = pick(random, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Position-addressed randomness: the value depends only on the coordinates, so
 * a per-pixel field stays identical however many times, and in whatever order,
 * it is sampled.
 */
export function createHashRandom(seed) {
  const base = seed >>> 0;
  return (index, salt = 0) => {
    let h = Math.imul(index ^ base, 0x27d4eb2d);
    h = Math.imul(h ^ (h >>> 15) ^ Math.imul(salt + 1, 0x85ebca6b), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
}
