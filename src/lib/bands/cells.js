// Colour cells: route a pixel to a plate by where it sits in colour space.
//
// Hue, chroma and value each sort the pixel into a class, and the plate is the
// sum of those class numbers, modulo the plate count. Summing is what makes it
// work: requiring all three to agree would leave most pixels on no plate at
// all, while the sum lands every combination on exactly one plate. Each axis
// hands out weights that total 1, so the plates still add back up to the image.
//
// Chroma stands in for saturation on purpose. Saturation is chroma ÷ value, so
// a nearly black pixel can read as fully saturated; chroma stays steady in the
// shadows.
import { linearCuts, linearRing, tidyCuts, weightedCuts, weightedRing } from './cuts.js';
import { createRouter } from './router.js';
import { analyseColour, coordinatesAt, hueOf, HUE_STEPS } from './colour.js';

const CELL_AXES = ['hue', 'chroma', 'value'];

function axisCuts({ mode, count, histogram, size, ring, given }) {
  if (count < 2) return [];
  if (mode === 'manual') return tidyCuts(given, count, size, { ring });
  if (ring)
    return mode === 'weighted' ? weightedRing(histogram, count, size) : linearRing(count, size);
  return mode === 'weighted'
    ? weightedCuts(histogram, count, size - 1)
    : linearCuts(count, size - 1);
}

/** Swatches: the average colour of the pixels each plate actually collects. */
function plateTints(pixels, plateCount, plateOf) {
  const totals = new Float64Array(plateCount * 4);
  const step = Math.max(4, Math.floor(pixels.length / 4 / 20000)) * 4;
  for (let i = 0; i < pixels.length; i += step) {
    const plate = plateOf(pixels[i], pixels[i + 1], pixels[i + 2]);
    totals[plate * 4] += pixels[i];
    totals[plate * 4 + 1] += pixels[i + 1];
    totals[plate * 4 + 2] += pixels[i + 2];
    totals[plate * 4 + 3]++;
  }
  return Array.from({ length: plateCount }, (_, plate) => {
    const count = totals[plate * 4 + 3];
    if (!count) return [90, 90, 110];
    const rgb = [0, 1, 2].map((c) => totals[plate * 4 + c] / count);
    const peak = Math.max(...rgb, 1);
    return rgb.map((value) => Math.round((value / peak) * 255));
  });
}

export function planCellBands({ pixels, plateCount, mode = 'linear', cuts = null, cells = {} }) {
  const counts = {
    hue: Math.max(1, Math.round(cells.hue ?? 6)),
    chroma: Math.max(1, Math.round(cells.chroma ?? 4)),
    value: Math.max(1, Math.round(cells.value ?? 5)),
  };
  const hard = cells.hard === true;
  const histograms = analyseColour(pixels);

  const axisSpecs = {
    hue: { size: HUE_STEPS, ring: true },
    chroma: { size: 256, ring: false },
    value: { size: 256, ring: false },
  };
  const planCuts = {};
  const routers = {};
  for (const axis of CELL_AXES) {
    const spec = axisSpecs[axis];
    planCuts[axis] = axisCuts({
      mode,
      count: counts[axis],
      histogram: histograms[axis],
      size: spec.size,
      ring: spec.ring,
      given: cuts?.[axis],
    });
    routers[axis] = createRouter({ cuts: planCuts[axis], size: spec.size, ring: spec.ring, hard });
  }

  // Which plate each cell of colour space belongs to. Seeded by summing the
  // class numbers — the elegant version — and then, in weighted mode, evened
  // out: correlated axes make the sum land on a sublattice, which starves some
  // plates entirely.
  const cellPlate = buildCellTable({
    pixels,
    counts,
    plateCount,
    balance: mode === 'weighted',
    hardRouters: Object.fromEntries(
      CELL_AXES.map((axis) => [
        axis,
        createRouter({
          cuts: planCuts[axis],
          size: axisSpecs[axis].size,
          ring: axisSpecs[axis].ring,
          hard: true,
        }),
      ]),
    ),
  });
  const cellIndex = (hue, chroma, value) => (hue * counts.chroma + chroma) * counts.value + value;

  const weights = new Float64Array(plateCount);
  const coordinates = new Int32Array(3);

  const locate = (r, g, b) => {
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    const chroma = max - min;
    coordinates[0] = chroma > 0 ? Math.floor(hueOf(r, g, b, max, chroma)) % HUE_STEPS : 0;
    coordinates[1] = chroma;
    coordinates[2] = max;
    return coordinates;
  };

  /** The ≤8 corners of the cell a pixel falls in, weighted and summed mod N. */
  function spread(r, g, b) {
    const position = locate(r, g, b);
    weights.fill(0);
    const hue = routers.hue;
    const chroma = routers.chroma;
    const value = routers.value;
    const h = position[0];
    const c = position[1];
    const v = position[2];

    for (let i = 0; i < 2; i++) {
      const hueClass = i === 0 ? hue.classA[h] : hue.classB[h];
      const hueWeight = i === 0 ? hue.weightA[h] : 1 - hue.weightA[h];
      if (hueWeight <= 0) continue;
      for (let j = 0; j < 2; j++) {
        const chromaClass = j === 0 ? chroma.classA[c] : chroma.classB[c];
        const chromaWeight = (j === 0 ? chroma.weightA[c] : 1 - chroma.weightA[c]) * hueWeight;
        if (chromaWeight <= 0) continue;
        for (let k = 0; k < 2; k++) {
          const valueClass = k === 0 ? value.classA[v] : value.classB[v];
          const weight = (k === 0 ? value.weightA[v] : 1 - value.weightA[v]) * chromaWeight;
          if (weight <= 0) continue;
          weights[cellPlate[cellIndex(hueClass, chromaClass, valueClass)]] += weight;
        }
      }
    }
    return weights;
  }

  const plateOf = (r, g, b) => {
    const shares = spread(r, g, b);
    let best = 0;
    for (let plate = 1; plate < plateCount; plate++) {
      if (shares[plate] > shares[best]) best = plate;
    }
    return best;
  };

  const tints = plateTints(pixels, plateCount, plateOf);
  const bands = tints.map((tint, index) => ({
    tint,
    label: `Cell ${index + 1}${hard ? '' : ' soft'}`,
  }));

  return {
    space: 'cells',
    mode,
    cells: { ...counts, hard },
    bandCount: plateCount,
    bands,
    cuts: planCuts,
    histograms,
    values(r, g, b, out) {
      const shares = spread(r, g, b);
      for (let channel = 0; channel < 3; channel++) {
        const total = channel === 0 ? r : channel === 1 ? g : b;
        let running = 0;
        let handedOut = 0;
        for (let plate = 0; plate < plateCount; plate++) {
          // Most plates are outside the pixel's cell and take nothing.
          if (shares[plate] === 0) {
            out[plate * 3 + channel] = 0;
            continue;
          }
          running += shares[plate] * total;
          const rounded = Math.round(running);
          out[plate * 3 + channel] = rounded - handedOut;
          handedOut = rounded;
        }
      }
    },
  };
}

/** How much image sits in each cell, from a sample of the pixels. */
function cellEnergies({ pixels, counts, hardRouters, cellIndex }) {
  const energies = new Float64Array(counts.hue * counts.chroma * counts.value);
  const step = Math.max(4, Math.floor(pixels.length / 4 / 40000)) * 4;
  const at = new Int32Array(4);
  for (let i = 0; i < pixels.length; i += step) {
    coordinatesAt(pixels, i, at);
    const cell = cellIndex(
      hardRouters.hue.classA[at[0]],
      hardRouters.chroma.classA[at[1]],
      hardRouters.value.classA[at[2]],
    );
    energies[cell] += pixels[i] + pixels[i + 1] + pixels[i + 2];
  }
  return energies;
}

function buildCellTable({ pixels, counts, plateCount, balance, hardRouters }) {
  const cellIndex = (hue, chroma, value) => (hue * counts.chroma + chroma) * counts.value + value;
  const table = new Int32Array(counts.hue * counts.chroma * counts.value);
  for (let hue = 0; hue < counts.hue; hue++) {
    for (let chroma = 0; chroma < counts.chroma; chroma++) {
      for (let value = 0; value < counts.value; value++) {
        table[cellIndex(hue, chroma, value)] = (hue + chroma + value) % plateCount;
      }
    }
  }
  if (!balance) return table;

  // Heaviest cells first: a cell whose plate is already full moves to the
  // emptiest one, so nothing ends up carrying the whole picture.
  const energies = cellEnergies({ pixels, counts, hardRouters, cellIndex });
  const total = energies.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return table;

  const ceiling = (total / plateCount) * 1.25;
  const loads = new Float64Array(plateCount);
  const order = [...energies.keys()].sort((a, b) => energies[b] - energies[a]);
  for (const cell of order) {
    let plate = table[cell];
    if (loads[plate] + energies[cell] > ceiling) {
      let lightest = 0;
      for (let candidate = 1; candidate < plateCount; candidate++) {
        if (loads[candidate] < loads[lightest]) lightest = candidate;
      }
      plate = lightest;
    }
    loads[plate] += energies[cell];
    table[cell] = plate;
  }
  return table;
}
