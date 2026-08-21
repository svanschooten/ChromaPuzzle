// Screen occlusion: an ordered dither decides which plate takes each pixel.
//
// Where noise occlusion scatters pixels at random, this deals them out on a
// fixed lattice, so every plate ends up holding an evenly spaced dot pattern —
// the look of a printing separation rather than static.
import { createShareField } from './weights.js';

/** Classic 8×8 Bayer matrix: the order in which positions get filled. */
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];
const SIDE = 8;

export function createScreenField({ width, plateCount, bandCount, strength, scale = 1, random }) {
  const cellSize = Math.max(1, Math.round(scale));
  // The matrix is offset so two puzzles from the same image differ.
  const offsetX = Math.floor(random() * SIDE);
  const offsetY = Math.floor(random() * SIDE);

  const cellAt = (index) => {
    const x = Math.floor((index % width) / cellSize) + offsetX;
    const y = Math.floor(Math.floor(index / width) / cellSize) + offsetY;
    return (y % SIDE) * SIDE + (x % SIDE);
  };

  const field = createShareField({
    plateCount,
    bandCount,
    strength,
    computeShares(index, shares) {
      shares.fill(0);
      shares[Math.floor((BAYER[cellAt(index)] / (SIDE * SIDE)) * plateCount) % plateCount] = 1;
    },
  });
  // Positions sharing a cell of the screen share a plan, so the splitter can
  // reuse the weights it just worked out.
  return { ...field, planAt: cellAt };
}
