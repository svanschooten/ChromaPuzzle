// `chroma-puzzle generate`: an image in, a puzzle out, made the way the
// creator makes one.
import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Option } from 'commander';
import { describeDuration, estimateGenerationMs } from '../lib/cost.js';
import { generatePuzzle } from '../lib/generate.js';
import { buildPreset, readPreset } from '../lib/preset.js';
import { layoutPuzzle } from '../lib/puzzleFormat.js';
import { createRandom } from '../lib/random.js';
import { defaultSettings, generationSettings, MAX_SOURCE_SIZE } from '../lib/settings.js';
import { readSourceImage } from './image.js';
import { addSettingOptions, applySettingFlags, describeCutChanges, numberIn } from './options.js';
import { checkTargets, outputTargets, writeJson, writePuzzle } from './output.js';

const SEED_RANGE = { min: 0, max: 2 ** 32 - 1, step: 1 };
const SIZE_RANGE = { min: 16, max: 8192, step: 1 };
// The shuffle draws from a stream of its own, so the seed reproduces it too.
const SHUFFLE_SALT = 0x9e3779b9;
const CONFIG_KEYS = new Set(Object.keys(buildPreset(defaultSettings())));

const EXAMPLES = `
Examples:
  $ chroma-puzzle generate photo.jpg
  $ chroma-puzzle generate photo.jpg -n 6 -d 3 --space cells --occlusion fracture --answer answer.json
  $ chroma-puzzle generate photo.jpg -c chroma-preset.json --cipher 1 -o hard.zip
  $ chroma-puzzle generate photo.jpg --dir -o puzzle --seed 42`;

export function addGenerateCommand(program) {
  const command = program
    .command('generate')
    .description('Split an image into a chroma puzzle: shuffled plate PNGs plus puzzle.json')
    .argument('<image>', 'source image: PNG, JPEG, WebP, AVIF, TIFF or GIF')
    .optionsGroup('Output:')
    .option(
      '-o, --output <path>',
      'where to write the puzzle (default: chroma-puzzle.zip, or chroma-puzzle/ with --dir)',
    )
    .option('--dir', 'write the plates and puzzle.json into a directory instead of a ZIP')
    .option('--answer <file>', 'also write which plates are real to this file; keep it to yourself')
    .option('--save-config <file>', 'write the settings used to a config file')
    .option('--json', 'print puzzle.json instead of a summary')
    .option('-f, --force', 'overwrite existing files')
    .option('-q, --quiet', 'print only warnings and errors')
    .optionsGroup('Config:')
    .option(
      '-c, --config <file>',
      "start from a config file, such as the app's chroma-preset.json; flags override it",
    );
  addSettingOptions(command);
  return command
    .optionsGroup('Run:')
    .addOption(
      new Option(
        '--seed <n>',
        'make the same puzzle again from the same image and settings (default: random)',
      ).argParser(numberIn(SEED_RANGE)),
    )
    .addOption(
      new Option('--max-size <px>', 'scale the image down to fit this on its long edge, 16–8192')
        .argParser(numberIn(SIZE_RANGE))
        .default(MAX_SOURCE_SIZE),
    )
    .addHelpText('after', EXAMPLES)
    .action(generate);
}

async function generate(imagePath, options, command) {
  const say = options.quiet ? () => {} : (text) => process.stderr.write(`${text}\n`);
  const warn = (text) => process.stderr.write(`warning: ${text}\n`);

  const settings = await resolveSettings(options, command, warn);
  const targets = outputTargets(options);
  for (const note of await checkTargets(targets, options)) warn(note);

  const source = await readSource(imagePath, options.maxSize);
  const { width, height } = source;
  say(describeSource(imagePath, source));
  say(`Estimated generation: ${describeDuration(estimate(settings, width, height))}`);

  const seed = options.seed ?? randomInt(2 ** 32);
  const started = performance.now();
  const result = generatePuzzle({
    pixels: source.data,
    width,
    height,
    settings: generationSettings(settings, seed),
    onProgress: say,
  });
  say(`Generated in ${((performance.now() - started) / 1000).toFixed(1)}s`);
  for (const note of plateNotes(result, settings)) warn(note);

  const layout = await layoutPuzzle({
    plates: result.plates,
    width,
    height,
    settings,
    random: createRandom(seed ^ SHUFFLE_SALT),
  });
  await writePuzzle(targets.output.path, layout, options.dir);
  if (targets.answer) await writeJson(targets.answer.path, answerKey(layout, seed));
  if (targets.config) await writeJson(targets.config.path, buildPreset(settings));

  if (options.json) process.stdout.write(`${JSON.stringify(layout.meta, null, 2)}\n`);
  else if (!options.quiet) process.stdout.write(summary(targets, layout.meta, seed));
}

/** The app's defaults, then the config file, then the flags. */
async function resolveSettings(options, command, warn) {
  const settings = defaultSettings();
  if (options.config) Object.assign(settings, await readConfig(options.config, warn));
  for (const note of applySettingFlags(command, settings)) warn(note);
  return settings;
}

/** What is worth knowing about the plates before handing them out. */
function plateNotes(result, settings) {
  const notes = describeCutChanges(settings, result.cuts);
  const weak = result.plates.filter((plate) => plate.weak && !plate.isFalse).length;
  if (weak) {
    const plates = `${weak} plate${weak > 1 ? 's are' : ' is'}`;
    notes.unshift(`${plates} nearly empty — try ${emptyPlateRemedies(settings).join(', ')}`);
  }
  return notes;
}

// Occlusion shares every band over all the plates, and fewer plates leave each
// more to carry. More cell classes do not help: a flat patch of colour is one
// cell however finely the axes are cut.
function emptyPlateRemedies(settings) {
  const remedies = [];
  if (settings.bandMode !== 'weighted') remedies.push('--split weighted');
  if (settings.bandSpace === 'cells' && settings.cells.hard) remedies.push('--no-hard-cells');
  remedies.push('fewer plates');
  if (!settings.occlusionEnabled) remedies.push('an --occlusion mode');
  return remedies.length > 1 ? [...remedies.slice(0, -1), `or ${remedies.at(-1)}`] : remedies;
}

function summary({ output, answer, config }, meta, seed) {
  const decoys = meta.numFalsePlates === 1 ? 'decoy' : 'decoys';
  const lines = [
    `Wrote ${output.shown}: ${meta.numRealPlates} chroma plates + ${meta.numFalsePlates} ` +
      `${decoys} at ${meta.width}×${meta.height}, seed ${seed}`,
    ...[answer, config].filter(Boolean).map((extra) => `Wrote ${extra.shown}`),
  ];
  return `${lines.join('\n')}\n`;
}

/** Which plates are real: the creator's copy of the solution. */
function answerKey({ entries, meta }, seed) {
  const real = entries.filter(({ plate }) => !plate.isFalse);
  return {
    chromaPuzzleAnswer: 1,
    solutionHash: meta.solutionHash,
    seed,
    realPlates: real.map(({ filename }) => filename),
    falsePlates: entries.filter(({ plate }) => plate.isFalse).map(({ filename }) => filename),
    bands: Object.fromEntries(real.map(({ filename, plate }) => [filename, plate.bandLabel])),
    nearlyEmpty: entries.filter(({ plate }) => plate.weak).map(({ filename }) => filename),
  };
}

/* ---------------------------------------------------------------- input */

/** Reads a config file the way the app loads a preset, saying what it had to change. */
async function readConfig(path, warn) {
  let data;
  try {
    data = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`could not read config ${path}: ${error.message}`);
  }
  let read;
  try {
    read = readPreset(data);
  } catch {
    throw new Error(
      `${path} is not a chroma puzzle config: it needs "chromaPuzzlePreset": 1, ` +
        "as the app's Save settings writes",
    );
  }
  const { values, ignored, adjusted } = read;
  const unknown = Object.keys(data).filter((key) => !CONFIG_KEYS.has(key));
  if (unknown.length) warn(`${path}: unknown settings ignored: ${unknown.join(', ')}`);
  if (ignored.length) warn(`${path}: invalid values ignored: ${ignored.join(', ')}`);
  for (const key of adjusted) {
    warn(`${path}: ${key} ${valueAt(data, key)} is out of range, using ${valueAt(values, key)}`);
  }
  return values;
}

const valueAt = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);

async function readSource(path, maxSize) {
  try {
    return await readSourceImage(path, maxSize);
  } catch (error) {
    throw new Error(`could not read ${path}: ${error.message}`);
  }
}

function describeSource(path, { width, height, origWidth, origHeight, scaled }) {
  return scaled
    ? `Loaded ${path} (${origWidth}×${origHeight}, scaled to ${width}×${height})`
    : `Loaded ${path} (${width}×${height})`;
}

const estimate = (settings, width, height) =>
  estimateGenerationMs({
    width,
    height,
    plateCount: settings.plateCount,
    decoyCount: settings.falseCount,
    occlusionMode: settings.occlusionEnabled ? settings.occlusionMode : 'none',
    bandSpace: settings.bandSpace,
    hardCells: settings.cells.hard,
  });
