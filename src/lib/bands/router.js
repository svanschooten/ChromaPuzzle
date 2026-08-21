// Routing an axis of colour space to classes.
//
// Hue and chroma are coordinates, not quantities a pixel has more or less of,
// so they cannot be split the way a channel's tonal range can. They *route*
// instead: a position picks which classes receive the pixel, and the weights
// sum to 1 so nothing is gained or lost.

/**
 * @param {number[]} cuts  ring: one per class (arc starts); line: the interior
 *   cuts between classes, so `cuts.length + 1` classes
 * @param {number} size    positions in the axis (256 for a channel, 360 for hue)
 * @param {boolean} ring   whether the axis wraps around
 * @param {boolean} hard   send a position to one class instead of sharing it
 * @returns {{classCount: number, classA: Uint8Array, classB: Uint8Array, weightA: Float32Array}}
 */
export function createRouter({ cuts, size, ring = false, hard = false }) {
  const edges = ring ? [...cuts] : [0, ...cuts, size - 1];
  const classCount = ring ? Math.max(1, cuts.length) : cuts.length + 1;

  const classA = new Uint8Array(size);
  const classB = new Uint8Array(size);
  const weightA = new Float32Array(size).fill(1);
  if (classCount < 2) return { classCount: 1, classA, classB, weightA };

  // A class is represented by the middle of its interval, and a position is
  // shared with whichever neighbouring middle it sits between.
  const centres = [];
  for (let index = 0; index < classCount; index++) {
    if (ring) {
      const start = edges[index];
      const end = edges[(index + 1) % classCount] + (index === classCount - 1 ? size : 0);
      centres.push((start + (end - start) / 2) % size);
    } else {
      centres.push((edges[index] + edges[index + 1]) / 2);
    }
  }

  for (let position = 0; position < size; position++) {
    if (hard) {
      classA[position] = classB[position] = nearestClass(centres, position, size, ring);
      continue;
    }

    let index = lastCentreAtOrBefore(centres, position);
    if (index === -1) {
      if (!ring) {
        classA[position] = classB[position] = 0;
        continue;
      }
      index = classCount - 1; // wrapped past the last centre
    }
    if (!ring && index === classCount - 1) {
      classA[position] = classB[position] = classCount - 1;
      continue;
    }

    const next = (index + 1) % classCount;
    let span = centres[next] - centres[index];
    if (span <= 0) span += size;
    let offset = position - centres[index];
    if (offset < 0) offset += size;

    classA[position] = index;
    classB[position] = next;
    weightA[position] = 1 - Math.min(1, offset / span);
  }

  return { classCount, classA, classB, weightA };
}

function lastCentreAtOrBefore(centres, position) {
  let found = -1;
  for (let index = 0; index < centres.length; index++) {
    if (centres[index] <= position && (found === -1 || centres[index] > centres[found])) {
      found = index;
    }
  }
  return found;
}

function nearestClass(centres, position, size, ring) {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < centres.length; index++) {
    let distance = Math.abs(position - centres[index]);
    if (ring) distance = Math.min(distance, size - distance);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}
