// Fracture: irregular shards, each with its own plan for who carries what.
import { shuffled, between } from '../random.js';
import { easeToIdentity } from './weights.js';

/** Jittered-grid Voronoi: organic shards without the cost of a real diagram. */
function buildShards(width, height, cellSize, random) {
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const sitesX = new Float32Array(cols * rows);
  const sitesY = new Float32Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const site = row * cols + col;
      sitesX[site] = (col + 0.15 + random() * 0.7) * cellSize;
      sitesY[site] = (row + 0.15 + random() * 0.7) * cellSize;
    }
  }

  const map = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = Math.min(rows - 1, Math.floor(y / cellSize));
    for (let x = 0; x < width; x++) {
      const col = Math.min(cols - 1, Math.floor(x / cellSize));
      let best = 0;
      let bestDistance = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = row + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = col + dx;
          if (nx < 0 || nx >= cols) continue;
          const site = ny * cols + nx;
          const ex = x - sitesX[site];
          const ey = y - sitesY[site];
          const distance = ex * ex + ey * ey;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = site;
          }
        }
      }
      map[y * width + x] = best;
    }
  }
  return { map, count: cols * rows };
}

/** One band's share of the plates: an owner keeps most, the rest leaks away. */
function spreadColumn(weights, base, plateCount, owner, spread, random) {
  const draws = new Float32Array(plateCount);
  let leaked = 0;
  for (let plate = 0; plate < plateCount; plate++) {
    if (plate === owner) continue;
    draws[plate] = random();
    leaked += draws[plate];
  }
  for (let plate = 0; plate < plateCount; plate++) {
    weights[base + plate] = plate === owner ? 1 - spread : (spread * draws[plate]) / (leaked || 1);
  }
}

export function createFractureField({
  width,
  height,
  plateCount,
  bandCount,
  strength,
  shardSize = 32,
  random,
}) {
  const shards = buildShards(width, height, shardSize, random);
  const stride = bandCount * 2 * plateCount;
  const thresholds = new Float32Array(shards.count * bandCount);
  const weights = new Float32Array(shards.count * stride);

  for (let shard = 0; shard < shards.count; shard++) {
    // Dark and bright halves of a band go to different plates, so a shard's
    // shadows and highlights end up on separate sheets.
    const lowOwners = shuffled(random, [...Array(plateCount).keys()]);
    const highOwners = shuffled(random, [...Array(plateCount).keys()]);
    const plan = weights.subarray(shard * stride, (shard + 1) * stride);

    for (let band = 0; band < bandCount; band++) {
      thresholds[shard * bandCount + band] = 255 * (1 - strength * between(random, 0.35, 0.9));
      const spread = strength * between(random, 0.15, 0.6);
      spreadColumn(
        plan,
        band * 2 * plateCount,
        plateCount,
        lowOwners[band % plateCount],
        spread,
        random,
      );
      spreadColumn(
        plan,
        (band * 2 + 1) * plateCount,
        plateCount,
        highOwners[band % plateCount],
        spread,
        random,
      );
    }
    easeToIdentity(plan, bandCount, plateCount, strength);
  }

  return {
    tonal: true,
    planAt: (index) => shards.map[index],
    fill(index, thresholdsOut, weightsOut, plateStart = 0, plateEnd = plateCount) {
      const shard = shards.map[index];
      thresholdsOut.set(thresholds.subarray(shard * bandCount, (shard + 1) * bandCount));
      if (plateEnd - plateStart === plateCount) {
        weightsOut.set(weights.subarray(shard * stride, (shard + 1) * stride));
        return;
      }
      const plan = shard * stride;
      for (let band = 0; band < bandCount; band++) {
        for (let half = 0; half < 2; half++) {
          const base = (band * 2 + half) * plateCount;
          for (let plate = plateStart; plate < plateEnd; plate++) {
            weightsOut[base + plate] = weights[plan + base + plate];
          }
        }
      }
    },
    shards,
  };
}
