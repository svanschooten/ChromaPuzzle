// Where a puzzle is written on the command line, and the checks that keep it
// from landing on top of anything it should not.
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import JSZip from 'jszip';
import { encodePng } from './image.js';

// What a puzzle directory holds; replacing a puzzle clears these out first.
const PUZZLE_FILE = /^(plate_\d+\.png|puzzle\.json)$/;

/** Every file a run writes, as given on the command line and resolved. */
export function outputTargets(options) {
  const target = (shown) => shown && { shown, path: resolve(shown) };
  const targets = {
    output: target(options.output ?? (options.dir ? 'chroma-puzzle' : 'chroma-puzzle.zip')),
    answer: target(options.answer),
    config: target(options.saveConfig),
  };
  const paths = Object.values(targets)
    .filter(Boolean)
    .map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error('--output, --answer and --save-config have to be different files');
  }
  return targets;
}

/**
 * Refuses to overwrite anything without --force. Run before generating, so a
 * clash does not throw the work away.
 * @returns {Promise<string[]>} warnings about where the files are going
 */
export async function checkTargets({ output, answer, config }, { dir, force }) {
  if (dir) await checkDirectory(output, force);
  else await checkFile(output, force);
  for (const target of [answer, config].filter(Boolean)) await checkFile(target, force);

  return dir && answer && isInside(answer.path, output.path)
    ? [`${answer.shown} is inside the puzzle: whoever gets the puzzle gets the answer`]
    : [];
}

async function existing(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function checkFile({ path, shown }, force) {
  const stats = await existing(path);
  if (!stats) return;
  if (stats.isDirectory()) throw new Error(`${shown} is a directory`);
  if (!force) throw new Error(`${shown} already exists (--force overwrites it)`);
}

async function checkDirectory({ path, shown }, force) {
  const stats = await existing(path);
  if (!stats) return;
  if (!stats.isDirectory()) throw new Error(`${shown} exists and is not a directory`);
  if ((await readdir(path)).length && !force) {
    throw new Error(`${shown} is not empty (--force replaces the puzzle in it)`);
  }
}

function isInside(path, directory) {
  const route = relative(directory, path);
  return route !== '' && route !== '..' && !route.startsWith(`..${sep}`) && !isAbsolute(route);
}

/** The plates as PNGs plus puzzle.json, zipped or loose in a directory. */
export async function writePuzzle(path, { entries, meta }, loose) {
  const files = await Promise.all(
    entries.map(async ({ filename, plate }) => [
      filename,
      await encodePng(plate.data, meta.width, meta.height),
    ]),
  );
  files.push(['puzzle.json', JSON.stringify(meta, null, 2)]);
  await (loose ? writeDirectory : writeZip)(path, files);
}

async function writeZip(path, files) {
  const zip = new JSZip();
  for (const [name, contents] of files) zip.file(name, contents);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }));
}

async function writeDirectory(path, files) {
  await mkdir(path, { recursive: true });
  // A puzzle written here before may have had plates this one does not.
  for (const name of await readdir(path)) {
    if (PUZZLE_FILE.test(name)) await rm(join(path, name));
  }
  for (const [name, contents] of files) await writeFile(join(path, name), contents);
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
