#!/usr/bin/env node
// A whole chroma puzzle in one image: every plate as a tile, in filename order,
// over black as the Solver shows them. With --answer, real plates get a green
// frame and decoys a red one, and a last tile stacks the real plates the way
// the Solver does.
//
// Needs the repository's node_modules (jszip, sharp); run it from the repo.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import JSZip from 'jszip';
import sharp from 'sharp';
import { revealModular } from '../../../../src/lib/cipher.js';
import { solutionHash } from '../../../../src/lib/hash.js';

const USAGE = `Usage: contact-sheet.mjs <puzzle.zip|puzzle-dir> <sheet.png> [--answer <answer.json>]

Writes a PNG with every plate of the puzzle as a tile, and prints JSON giving
each tile's file, role and box (its picture, inside the frame) in the sheet.
--answer frames real plates green and decoys red, and adds a last tile with
the real plates stacked; it fails if the answer belongs to another puzzle.
Exit status: 0 written, 1 failed, 2 bad arguments.`;

// 256 px keeps 25 plates on one sheet that still reads well at a glance.
const TILE = 256;
const FRAME = 6;
const GAP = 10;
const FRAMES = { plate: '#555555', real: '#2ecc40', decoy: '#ff4136', stack: '#ffffff' };

class UsageError extends Error {}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { answer: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  });
  if (values.help) return console.log(USAGE);
  if (positionals.length !== 2) throw new UsageError('expected a puzzle and a sheet path');
  const [puzzlePath, sheetPath] = positionals;

  const { meta, plates } = await readPuzzle(puzzlePath);
  const answer = values.answer ? await readAnswer(values.answer, meta) : null;
  const real = new Set(answer?.realPlates);

  const tiles = await Promise.all(
    meta.plateFiles.map(async (file) => {
      const role = answer ? (real.has(file) ? 'real' : 'decoy') : 'plate';
      return { file, role, ...(await tile(sharp(plates.get(file)), FRAMES[role])) };
    }),
  );
  if (answer) {
    const stacked = await stack(
      answer.realPlates.map((file) => plates.get(file)),
      meta,
    );
    tiles.push({ file: 'stacked', role: 'stack', ...(await tile(stacked, FRAMES.stack)) });
  }

  const sheet = layout(tiles);
  await writeSheet(sheet, sheetPath);
  const boxes = sheet.placed.map(({ file, role, left, top, width, height }) => ({
    file,
    role,
    box: {
      left: left + FRAME,
      top: top + FRAME,
      width: width - 2 * FRAME,
      height: height - 2 * FRAME,
    },
  }));
  console.log(JSON.stringify({ sheet: sheetPath, columns: sheet.columns, tiles: boxes }, null, 2));
}

/** puzzle.json and the plate PNGs, from a puzzle ZIP or a --dir output. */
async function readPuzzle(path) {
  let read;
  if ((await stat(path)).isDirectory()) {
    read = (name) => readFile(join(path, name));
  } else {
    const zip = await JSZip.loadAsync(await readFile(path));
    read = (name) => {
      const entry = zip.file(name);
      if (!entry) throw new Error(`${path} has no ${name}`);
      return entry.async('nodebuffer');
    };
  }
  const meta = JSON.parse((await read('puzzle.json')).toString('utf8'));
  const plates = new Map();
  for (const file of meta.plateFiles) plates.set(file, await read(file));
  return { meta, plates };
}

/** An answer file, checked against the puzzle it claims to answer. */
async function readAnswer(path, meta) {
  const answer = JSON.parse(await readFile(path, 'utf8'));
  const known = new Set(meta.plateFiles);
  const matches =
    Array.isArray(answer.realPlates) &&
    answer.realPlates.every((file) => known.has(file)) &&
    (await solutionHash(answer.realPlates)) === meta.solutionHash;
  if (!matches) throw new Error(`${path} is not the answer to this puzzle`);
  return answer;
}

/** The real plates combined as the Solver combines them. */
async function stack(pngs, { width, height, stack: stacking }) {
  const plates = await Promise.all(pngs.map((png) => sharp(png).ensureAlpha().raw().toBuffer()));
  const pixels =
    stacking?.mode === 'modular' ? revealModular(plates, width, height) : addUp(plates);
  return sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    raw: { width, height, channels: 4 },
  });
}

/** Additive stacking, like the canvas `lighter` blend: alpha-weighted colour, summed. */
function addUp(plates) {
  const total = new Float32Array(plates[0].length);
  for (const data of plates) {
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255;
      for (let channel = 0; channel < 3; channel++) total[i + channel] += data[i + channel] * alpha;
    }
  }
  const pixels = Uint8ClampedArray.from(total);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  return pixels;
}

async function tile(image, frame) {
  const { data, info } = await image
    .flatten({ background: '#000000' })
    .resize(TILE, TILE, { fit: 'inside' })
    .extend({ top: FRAME, bottom: FRAME, left: FRAME, right: FRAME, background: frame })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Where each tile goes: row by row, each centred in a square cell. */
function layout(tiles) {
  const cell = TILE + 2 * FRAME;
  const columns = Math.ceil(Math.sqrt(tiles.length));
  const rows = Math.ceil(tiles.length / columns);
  const placed = tiles.map((entry, index) => ({
    ...entry,
    left: GAP + (index % columns) * (cell + GAP) + Math.floor((cell - entry.width) / 2),
    top: GAP + Math.floor(index / columns) * (cell + GAP) + Math.floor((cell - entry.height) / 2),
  }));
  return {
    columns,
    width: GAP + columns * (cell + GAP),
    height: GAP + rows * (cell + GAP),
    placed,
  };
}

async function writeSheet({ width, height, placed }, path) {
  await sharp({ create: { width, height, channels: 3, background: '#1b1b1b' } })
    .composite(placed.map(({ data, left, top }) => ({ input: data, left, top })))
    .removeAlpha()
    .png()
    .toFile(path);
}

main().catch((error) => {
  const usage = error instanceof UsageError || error.code?.startsWith('ERR_PARSE_ARGS');
  console.error(`error: ${error.message}${usage ? `\n\n${USAGE}` : ''}`);
  process.exitCode = usage ? 2 : 1;
});
