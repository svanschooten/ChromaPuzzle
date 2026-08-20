// Channel bands: each band owns tonal slices of one or more RGB channels.
import {
  channelHistograms,
  combineHistograms,
  energyOf,
  linearCuts,
  tidyCuts,
  weightedCuts,
} from './cuts.js';

const CHANNEL_NAMES = ['Red', 'Green', 'Blue'];
const CHANNEL_INITIALS = ['R', 'G', 'B'];
const CHANNEL_TINTS = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
];

/** Hands out slices one at a time to whichever group would carry the most. */
function distributeSlices(groups, plateCount) {
  for (const group of groups) group.slices = 1;
  for (let assigned = groups.length; assigned < plateCount; assigned++) {
    let best = groups[0];
    for (const group of groups) {
      if (group.energy / (group.slices + 1) > best.energy / (best.slices + 1)) best = group;
    }
    best.slices++;
  }
  return groups;
}

/** Which channels share a band, and how many bands each group gets. */
function planGroups(histograms, plateCount, mode) {
  const energies = histograms.map((histogram) => energyOf(histogram));
  const asGroup = (channels) => ({
    channels,
    energy: channels.reduce((sum, channel) => sum + energies[channel], 0),
    slices: 1,
  });

  if (plateCount === 2) {
    // Two plates cannot give every channel its own band, so channels group up.
    const pairings = [
      [[0, 1], [2]],
      [[0, 2], [1]],
      [[1, 2], [0]],
    ];
    const imbalance = (pairing) =>
      Math.abs(asGroup(pairing[0]).energy - asGroup(pairing[1]).energy);
    const chosen =
      mode === 'weighted'
        ? pairings.reduce((best, pairing) =>
            imbalance(pairing) < imbalance(best) ? pairing : best,
          )
        : pairings[0];
    return chosen.map(asGroup);
  }

  if (mode === 'weighted') {
    // Channels the image barely uses share one band instead of each claiming a plate.
    const share = energies.reduce((sum, value) => sum + value, 0) / plateCount;
    const weak = [0, 1, 2].filter((channel) => energies[channel] < share * 0.75);
    const grouping =
      weak.length >= 2
        ? [weak, ...[0, 1, 2].filter((c) => !weak.includes(c)).map((c) => [c])]
        : [[0], [1], [2]];
    return distributeSlices(grouping.map(asGroup), plateCount);
  }

  const groups = [[0], [1], [2]].map(asGroup);
  for (let extra = 0; extra < plateCount - 3; extra++) groups[extra % 3].slices++;
  return groups;
}

export function planChannelBands({ pixels, plateCount, mode = 'linear', weave = 1, cuts = null }) {
  const histograms = channelHistograms(pixels);
  const groups = planGroups(histograms, plateCount, mode);

  // Bands are interleaved across groups so the first plates stay R, G, B.
  const bandOfGroupSlice = [];
  let assigned = 0;
  for (let round = 0; assigned < plateCount; round++) {
    groups.forEach((group, groupIndex) => {
      if (round < group.slices && assigned < plateCount) {
        bandOfGroupSlice.push({ groupIndex, slice: round, band: assigned++ });
      }
    });
  }
  const bandIndex = (groupIndex, slice) =>
    bandOfGroupSlice.find((entry) => entry.groupIndex === groupIndex && entry.slice === slice).band;

  const perChannelCuts = [[], [], []];
  const lut = new Int32Array(3 * 256 * plateCount);

  groups.forEach((group, groupIndex) => {
    const fine = group.slices * weave;
    const histogram = combineHistograms(histograms, group.channels);
    const groupCuts =
      mode === 'manual'
        ? tidyCuts(cuts?.channels?.[group.channels[0]], fine, 255)
        : mode === 'weighted'
          ? weightedCuts(histogram, fine, 255)
          : linearCuts(fine, 255);
    for (const channel of group.channels) perChannelCuts[channel] = groupCuts;

    const edges = [0, ...groupCuts, 255];
    for (let slice = 0; slice < fine; slice++) {
      // Weaving: consecutive slices land on different plates, so a plate ends
      // up with a comb of thin slices rather than one solid block.
      const band = bandIndex(groupIndex, slice % group.slices);
      const lo = edges[slice];
      const span = edges[slice + 1] - lo;
      for (const channel of group.channels) {
        for (let value = 0; value <= 255; value++) {
          const amount = Math.min(Math.max(value - lo, 0), span);
          if (amount > 0) lut[(channel * 256 + value) * plateCount + band] += amount;
        }
      }
    }
  });

  const bands = bandOfGroupSlice
    .sort((a, b) => a.band - b.band)
    .map(({ groupIndex, slice }) => {
      const group = groups[groupIndex];
      const tint = [0, 0, 0];
      for (const channel of group.channels) {
        for (let c = 0; c < 3; c++) tint[c] = Math.max(tint[c], CHANNEL_TINTS[channel][c]);
      }
      const name =
        group.channels.length === 1
          ? CHANNEL_NAMES[group.channels[0]]
          : group.channels.map((channel) => CHANNEL_INITIALS[channel]).join('+');
      const suffix = group.slices > 1 ? ` ${slice + 1}/${group.slices}` : '';
      return { tint, label: `${name}${suffix}${weave > 1 ? ' woven' : ''}` };
    });

  return {
    space: 'channels',
    mode,
    weave,
    bandCount: plateCount,
    bands,
    cuts: { channels: perChannelCuts },
    histograms: { channels: histograms },
    values(r, g, b, out) {
      const red = (r * plateCount) | 0;
      const green = ((256 + g) * plateCount) | 0;
      const blue = ((512 + b) * plateCount) | 0;
      for (let band = 0; band < plateCount; band++) {
        out[band * 3] = lut[red + band];
        out[band * 3 + 1] = lut[green + band];
        out[band * 3 + 2] = lut[blue + band];
      }
    },
  };
}
