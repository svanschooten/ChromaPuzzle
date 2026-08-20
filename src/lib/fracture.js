// Fracture: breaks the image into irregular shards and, per shard, changes
// which plate carries which colour band, in what proportion, and over which
// tonal range.
//
// Every mechanism here is a partition of the original value into non-negative
// parts that still sum to it, so additive reconstruction stays exact — what
// changes is that no single plate reads as a recognisable picture any more.

/** Jittered-grid Voronoi: organic shards without the cost of a real diagram. */
export function buildShards(width, height, cellSize) {
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const sitesX = new Float32Array(cols * rows);
  const sitesY = new Float32Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      sitesX[i] = (col + 0.15 + Math.random() * 0.7) * cellSize;
      sitesY[i] = (row + 0.15 + Math.random() * 0.7) * cellSize;
    }
  }

  const map = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = Math.min(rows - 1, Math.floor(y / cellSize));
    for (let x = 0; x < width; x++) {
      const col = Math.min(cols - 1, Math.floor(x / cellSize));
      let best = -1;
      let bestDist = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = row + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = col + dx;
          if (nx < 0 || nx >= cols) continue;
          const i = ny * cols + nx;
          const ex = x - sitesX[i];
          const ey = y - sitesY[i];
          const dist = ex * ex + ey * ey;
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        }
      }
      map[y * width + x] = best;
    }
  }
  return { map, count: cols * rows, cols, rows };
}

const shuffledIndices = (n) => {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

/**
 * One band's share of the plates: `dominant` keeps most of it, the rest leaks
 * to the other plates in random proportions.
 */
function column(plateCount, dominant, spread, out, offset) {
  let leaked = 0;
  const draws = new Float32Array(plateCount);
  for (let p = 0; p < plateCount; p++) {
    if (p === dominant) continue;
    draws[p] = Math.random();
    leaked += draws[p];
  }
  for (let p = 0; p < plateCount; p++) {
    out[offset + p] = p === dominant ? 1 - spread : (spread * draws[p]) / (leaked || 1);
  }
}

/**
 * Per-shard plan. For each band the plan holds a tonal threshold plus two
 * weight columns: one for the part of the value below the threshold, one for
 * the part above it, so a shard's shadows and highlights land on different
 * plates.
 *
 * @param strength 0 = canonical split, 1 = fully fractured.
 * @returns {{thresholds: Float32Array, weights: Float32Array, bandCount: number, plateCount: number}}
 */
export function buildShardPlans(shardCount, plateCount, strength) {
  const bandCount = plateCount;
  const thresholds = new Float32Array(shardCount * bandCount);
  const weights = new Float32Array(shardCount * bandCount * 2 * plateCount);

  for (let shard = 0; shard < shardCount; shard++) {
    const lowOwners = shuffledIndices(plateCount);
    const highOwners = shuffledIndices(plateCount);
    for (let band = 0; band < bandCount; band++) {
      const slot = shard * bandCount + band;
      // At full strength a shard keeps only its darkest 10–65% on the low plate.
      thresholds[slot] = 255 * (1 - strength * (0.35 + Math.random() * 0.55));

      const spread = strength * (0.15 + Math.random() * 0.45);
      const base = slot * 2 * plateCount;
      column(plateCount, lowOwners[band], spread, weights, base);
      column(plateCount, highOwners[band], spread, weights, base + plateCount);

      // Ease towards the canonical assignment as strength drops.
      for (let half = 0; half < 2; half++) {
        for (let p = 0; p < plateCount; p++) {
          const i = base + half * plateCount + p;
          weights[i] = (1 - strength) * (p === band ? 1 : 0) + strength * weights[i];
        }
      }
    }
  }
  return { thresholds, weights, bandCount, plateCount };
}
