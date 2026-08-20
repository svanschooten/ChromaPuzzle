// Where to cut a range into bands: evenly, by histogram, or by hand.

export function channelHistograms(pixels) {
  const histograms = [new Int32Array(256), new Int32Array(256), new Int32Array(256)];
  for (let i = 0; i < pixels.length; i += 4) {
    histograms[0][pixels[i]]++;
    histograms[1][pixels[i + 1]]++;
    histograms[2][pixels[i + 2]]++;
  }
  return histograms;
}

export function combineHistograms(histograms, channels) {
  const total = new Int32Array(histograms[0].length);
  for (const channel of channels) {
    for (let value = 0; value < total.length; value++) total[value] += histograms[channel][value];
  }
  return total;
}

export const energyOf = (histogram) => {
  let sum = 0;
  for (let value = 1; value < histogram.length; value++) sum += histogram[value] * value;
  return sum;
};

/**
 * Energy below each cut: `below[t]` is the sum of `min(value, t)` over every
 * pixel. Raising `t` by one gains a unit from every pixel at or above it.
 */
function energyBelow(histogram) {
  const size = histogram.length;
  const atOrAbove = new Float64Array(size);
  let running = 0;
  for (let value = size - 1; value >= 1; value--) {
    running += histogram[value];
    atOrAbove[value] = running;
  }
  const below = new Float64Array(size);
  running = 0;
  for (let value = 1; value < size; value++) {
    running += atOrAbove[value];
    below[value] = running;
  }
  return below;
}

/** Interior cuts that divide [0, max] into `count` equal parts. */
export function linearCuts(count, max) {
  return Array.from({ length: count - 1 }, (_, i) => Math.round((max * (i + 1)) / count));
}

/** Interior cuts that give each of `count` parts an equal share of the histogram. */
export function weightedCuts(histogram, count, max) {
  if (count < 2) return [];
  const below = energyBelow(histogram);
  const total = below[max];
  if (total <= 0) return linearCuts(count, max);

  const cuts = [];
  let cut = 0;
  for (let i = 1; i < count; i++) {
    const target = (total * i) / count;
    while (cut < max && below[cut] < target) cut++;
    const floor = i === 1 ? 1 : cuts[i - 2] + 1;
    cuts.push(Math.min(max - (count - i), Math.max(floor, cut)));
  }
  return cuts;
}

/** Cuts that count `count` shares evenly around a wrapping range. */
export function linearRing(count, max) {
  return Array.from({ length: count }, (_, i) => Math.round((max * i) / count));
}

/** Ring cuts placed so each arc carries an equal share of the histogram. */
export function weightedRing(histogram, count, max) {
  const total = histogram.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return linearRing(count, max);

  const cuts = [];
  let running = 0;
  let bin = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / count;
    while (bin < max && running + histogram[bin] <= target) {
      running += histogram[bin];
      bin++;
    }
    // Arcs must stay in order and keep a degree to themselves, even when all
    // the chroma in the image sits on one or two hues.
    const floor = i === 0 ? 0 : cuts[i - 1] + 1;
    cuts.push(Math.min(max - (count - i), Math.max(floor, bin)));
  }
  return cuts;
}

/** Keeps hand-edited cuts sorted, in range, and one apart. */
export function tidyCuts(cuts, count, max, { ring = false } = {}) {
  const wanted = ring ? count : count - 1;
  const cleaned = [...(cuts ?? [])]
    .map((cut) => Math.round(cut))
    .filter((cut) => Number.isFinite(cut))
    .sort((a, b) => a - b);

  const out = [];
  for (let i = 0; i < wanted; i++) {
    const floor = (out.at(-1) ?? (ring ? -1 : 0)) + 1;
    const ceiling = max - (wanted - i) + (ring ? 0 : 0);
    const fallback = ring
      ? Math.round((max * i) / wanted)
      : Math.round((max * (i + 1)) / (wanted + 1));
    out.push(Math.min(ceiling, Math.max(floor, cleaned[i] ?? fallback)));
  }
  return out;
}
