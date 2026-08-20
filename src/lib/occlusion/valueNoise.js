// Fractal value noise — the soft "islands" look used for procedural terrain.

const smoothstep = (t) => t * t * (3 - 2 * t);

function lattice(random, cols, rows) {
  const grid = new Float32Array((cols + 1) * (rows + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = random();
  return grid;
}

function sampleLattice(grid, cols, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const row = y0 * (cols + 1);
  const nextRow = (y0 + 1) * (cols + 1);
  const top = grid[row + x0] * (1 - fx) + grid[row + x0 + 1] * fx;
  const bottom = grid[nextRow + x0] * (1 - fx) + grid[nextRow + x0 + 1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * @returns {Float32Array} one value in [0, 1] per pixel, smooth at `scale` and
 *   detailed below it.
 */
export function fractalNoise({ width, height, scale, octaves = 4, random }) {
  const field = new Float32Array(width * height);
  let amplitude = 1;
  let total = 0;

  for (let octave = 0; octave < octaves; octave++) {
    const cell = Math.max(2, scale / 2 ** octave);
    const cols = Math.ceil(width / cell) + 1;
    const rows = Math.ceil(height / cell) + 1;
    const grid = lattice(random, cols, rows);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        field[y * width + x] += amplitude * sampleLattice(grid, cols, x / cell, y / cell);
      }
    }
    total += amplitude;
    amplitude *= 0.5;
  }

  for (let i = 0; i < field.length; i++) field[i] /= total;
  return field;
}
