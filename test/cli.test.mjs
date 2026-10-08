// Command line, end to end: runs the real binary on synthesised images and
// checks what it writes. No browser needed.
//
//   npm run test:cli
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import sharp from 'sharp';
import { makePng } from './makePng.mjs';
import { maxReconstructionError } from './unit/helpers.mjs';
import { revealModular } from '../src/lib/cipher.js';
import { solutionHash } from '../src/lib/hash.js';
import { buildPreset } from '../src/lib/preset.js';
import { defaultSettings } from '../src/lib/settings.js';

const BIN = resolve('bin/chroma-puzzle.js');
const W = 90;
const H = 60;
const pixel = (x, y) => [
  Math.round(40 + 180 * (x / W)),
  Math.round(30 + 150 * (y / H)),
  Math.round(60 + 120 * Math.abs(Math.sin((x + y) / 9))),
  255,
];
const SOURCE = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) SOURCE.set(pixel(x, y), (y * W + x) * 4);
}

let work;
before(async () => {
  work = await mkdtemp(join(tmpdir(), 'chroma-cli-'));
  await writeFile(join(work, 'source.png'), makePng(W, H, pixel));
});
after(() => rm(work, { recursive: true, force: true }));

const execute = promisify(execFile);

/** Runs `chroma-puzzle generate` in the work directory; no argument here has a space in it. */
async function generate(args) {
  try {
    const { stdout, stderr } = await execute(
      process.execPath,
      [BIN, 'generate', ...args.split(/\s+/)],
      { cwd: work },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

const succeeds = async (args) => {
  const run = await generate(args);
  assert.equal(run.code, 0, `${args}\n${run.stderr}`);
  return run;
};

async function decodePng(bytes) {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** A puzzle ZIP: its puzzle.json, and each plate decoded by filename. */
async function readZip(name) {
  const zip = await JSZip.loadAsync(await readFile(join(work, name)));
  const meta = JSON.parse(await zip.file('puzzle.json').async('string'));
  const plates = new Map();
  for (const file of meta.plateFiles) {
    plates.set(file, await decodePng(await zip.file(file).async('nodebuffer')));
  }
  return { meta, plates, entries: Object.keys(zip.files).sort() };
}

const readJson = async (name) => JSON.parse(await readFile(join(work, name), 'utf8'));
const writeJson = (name, value) => writeFile(join(work, name), JSON.stringify(value));
const realPlates = (puzzle, answer) => answer.realPlates.map((name) => puzzle.plates.get(name));

test('makes a puzzle whose real plates stack back into the image', async () => {
  const run = await succeeds('source.png -o basic.zip --answer basic.json --seed 1');
  assert.match(run.stdout, /^Wrote basic\.zip: 3 chroma plates \+ 2 decoys at 90×60, seed 1\n/);

  const puzzle = await readZip('basic.zip');
  const answer = await readJson('basic.json');
  assert.deepEqual(puzzle.entries, [...puzzle.meta.plateFiles, 'puzzle.json'].sort());
  assert.equal(puzzle.meta.width, W);
  assert.equal(puzzle.meta.numRealPlates, 3);
  assert.equal(puzzle.meta.numFalsePlates, 2);
  assert.equal(puzzle.meta.stack.mode, 'additive');
  for (const plate of puzzle.plates.values()) {
    assert.deepEqual([plate.width, plate.height, plate.channels], [W, H, 4]);
  }

  assert.equal(answer.realPlates.length, 3);
  assert.deepEqual(
    [...answer.realPlates, ...answer.falsePlates].sort(),
    [...puzzle.meta.plateFiles].sort(),
  );
  assert.equal(answer.seed, 1);
  assert.equal(answer.solutionHash, puzzle.meta.solutionHash);
  assert.equal(await solutionHash(answer.realPlates), puzzle.meta.solutionHash);
  assert.deepEqual(Object.keys(answer.bands), answer.realPlates);

  assert.equal(maxReconstructionError(realPlates(puzzle, answer), SOURCE, W * H), 0);
  assert.ok(!('seed' in puzzle.meta), 'the seed would give the shuffle away');
});

test('every band space and occlusion mode reaches the plates from the flags', async () => {
  const cases = [
    { flags: '--space spectrum --weave 2 --occlusion blend --island-size 24', space: 'spectrum' },
    { flags: '--space cells --hard-cells --hue-classes 4 --occlusion fracture', space: 'cells' },
    { flags: '-n 5 --split weighted --occlusion noise --decoy-mode warp', space: 'channels' },
    {
      flags: '--space cells --split manual --hue-cuts 0,90,200 --occlusion screen',
      space: 'cells',
    },
  ];
  for (const [index, { flags, space }] of cases.entries()) {
    await succeeds(`source.png -o case-${index}.zip --answer case-${index}.json ${flags}`);
    const puzzle = await readZip(`case-${index}.zip`);
    const answer = await readJson(`case-${index}.json`);
    const error = maxReconstructionError(realPlates(puzzle, answer), SOURCE, W * H);
    assert.equal(error, 0, `${flags} reconstructs with error ${error}`);
    assert.equal(puzzle.meta.bandSpace, space);
    assert.equal(puzzle.meta.occlusion.mode, flags.match(/--occlusion (\w+)/)[1]);
  }
  assert.equal((await readZip('case-0.zip')).meta.occlusion.scale, 24);
  assert.deepEqual((await readZip('case-1.zip')).meta.cells, {
    hue: 4,
    chroma: 4,
    value: 5,
    hard: true,
  });
});

test('a ciphered puzzle comes back modulo 256, and says so', async () => {
  await succeeds('source.png -o cipher.zip --answer cipher.json --cipher 1 -n 4');
  const puzzle = await readZip('cipher.zip');
  const answer = await readJson('cipher.json');
  assert.deepEqual(puzzle.meta.stack, { mode: 'modular', cipher: 1 });

  const revealed = revealModular(realPlates(puzzle, answer), W, H);
  let worst = 0;
  for (let i = 0; i < revealed.length; i += 4) {
    for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(revealed[i + c] - SOURCE[i + c]));
  }
  assert.equal(worst, 0);
});

test('the same seed makes the same puzzle', async () => {
  const flags = '--occlusion fracture --decoy-mode warp -q';
  await succeeds(`source.png -o seed-a.zip --seed 99 ${flags}`);
  await succeeds(`source.png -o seed-b.zip --seed 99 ${flags}`);
  await succeeds(`source.png -o seed-c.zip --seed 100 ${flags}`);
  const [a, b, c] = await Promise.all(['a', 'b', 'c'].map((key) => readZip(`seed-${key}.zip`)));

  assert.equal(a.meta.solutionHash, b.meta.solutionHash);
  for (const name of a.meta.plateFiles) {
    assert.ok(a.plates.get(name).data.equals(b.plates.get(name).data), `${name} differs`);
  }
  const same = a.meta.plateFiles.every((name) =>
    a.plates.get(name).data.equals(c.plates.get(name).data),
  );
  assert.ok(!same, 'another seed makes another puzzle');
});

test('with nothing passed, the settings are the app defaults', async () => {
  await succeeds('source.png -o defaults.zip --save-config defaults.json -q');
  assert.deepEqual(await readJson('defaults.json'), buildPreset(defaultSettings()));
});

test('a config file sets everything, and flags override it', async () => {
  const config = buildPreset({
    ...defaultSettings(),
    plateCount: 5,
    falseCount: 1,
    bandSpace: 'spectrum',
    occlusionEnabled: true,
    occlusionMode: 'screen',
    screenScale: 3,
  });
  await writeJson('config.json', config);

  const run = await succeeds(
    'source.png -c config.json -n 4 -o configured.zip --save-config used.json',
  );
  assert.equal(run.stderr.includes('warning'), false, run.stderr);
  const { meta } = await readZip('configured.zip');
  assert.equal(meta.numRealPlates, 4);
  assert.equal(meta.numFalsePlates, 1);
  assert.equal(meta.bandSpace, 'spectrum');
  assert.deepEqual(meta.occlusion, { mode: 'screen', strength: 0.6, shardSize: 32, scale: 3 });
  assert.deepEqual(await readJson('used.json'), { ...config, plateCount: 4 });
});

test('config values are read like the app reads them, with a warning for each fix', async () => {
  await writeJson('loose.json', {
    chromaPuzzlePreset: 1,
    plateCount: 40,
    weave: 'x',
    cells: { hue: 0 },
    bogus: 1,
  });
  const run = await succeeds('source.png -c loose.json -o loose.zip -q');
  assert.match(run.stderr, /loose\.json: unknown settings ignored: bogus/);
  assert.match(run.stderr, /loose\.json: invalid values ignored: weave/);
  assert.match(run.stderr, /loose\.json: plateCount 40 is out of range, using 16/);
  assert.match(run.stderr, /loose\.json: cells\.hue 0 is out of range, using 1/);
  assert.equal((await readZip('loose.zip')).meta.numRealPlates, 16);

  await writeJson('not-a-config.json', { version: '1.2' });
  const refused = await generate('source.png -c not-a-config.json -o never.zip');
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /not a chroma puzzle config/);
});

test('bad flags fail before anything is written', async () => {
  for (const flags of ['-n 17', '--opacity 0.2', '--space hsv', '--red-cuts 300']) {
    const run = await generate(`source.png -o never.zip ${flags}`);
    assert.equal(run.code, 1, flags);
    assert.match(run.stderr, /^error: option/);
  }
  const missing = await generate('missing.png -o never.zip');
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /could not read missing\.png/);
  assert.equal(existsSync(join(work, 'never.zip')), false);
});

test('flags that would do nothing are warned about', async () => {
  const run = await succeeds('source.png -o noop.zip -q --space cells --weave 3');
  assert.match(run.stderr, /warning: --weave has no effect/);
});

test('existing files are only replaced with --force', async () => {
  await succeeds('source.png -o twice.zip -q');
  const first = await readFile(join(work, 'twice.zip'));
  const again = await generate('source.png -o twice.zip -q');
  assert.equal(again.code, 1);
  assert.match(again.stderr, /twice\.zip already exists/);
  assert.ok(first.equals(await readFile(join(work, 'twice.zip'))));
  await succeeds('source.png -o twice.zip -q --force');
});

test('--dir writes loose files, and replacing a puzzle leaves none of the old one', async () => {
  await succeeds('source.png --dir -o loose -n 6 -q');
  assert.equal((await readdir(join(work, 'loose'))).length, 9);

  const refused = await generate('source.png --dir -o loose -q');
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /loose is not empty/);

  await writeFile(join(work, 'loose', 'notes.txt'), 'mine');
  const run = await succeeds('source.png --dir -o loose -n 2 -d 1 --force --answer loose/key.json');
  assert.match(run.stderr, /inside the puzzle/);
  assert.deepEqual((await readdir(join(work, 'loose'))).sort(), [
    'key.json',
    'notes.txt',
    'plate_01.png',
    'plate_02.png',
    'plate_03.png',
    'puzzle.json',
  ]);
});

test('--json prints puzzle.json, and --quiet prints nothing', async () => {
  const run = await succeeds('source.png -o json.zip --json -q');
  assert.deepEqual(JSON.parse(run.stdout), (await readZip('json.zip')).meta);

  const quiet = await succeeds('source.png -o quiet.zip -q');
  assert.deepEqual([quiet.stdout, quiet.stderr], ['', '']);
});

test('other formats load, upright, and scaled to --max-size', async () => {
  const stored = () =>
    sharp(Buffer.alloc(40 * 30 * 3, 90), { raw: { width: 40, height: 30, channels: 3 } });
  await stored().jpeg().withMetadata({ orientation: 6 }).toFile(join(work, 'rotated.jpg'));
  await stored().webp({ lossless: true }).toFile(join(work, 'flat.webp'));

  await succeeds('rotated.jpg -o rotated.zip -q');
  const rotated = (await readZip('rotated.zip')).meta;
  assert.deepEqual([rotated.width, rotated.height], [30, 40]);

  await succeeds('flat.webp -o flat.zip -q');
  assert.equal((await readZip('flat.zip')).meta.width, 40);

  await succeeds('rotated.jpg -o small.zip -q --max-size 20');
  const small = (await readZip('small.zip')).meta;
  assert.deepEqual([small.width, small.height], [15, 20]);
});

test("the agent skill's contact sheet shows every plate and the answer stacked", async () => {
  const script = resolve('.claude/skills/chroma-puzzle/scripts/contact-sheet.mjs');
  const sheet = (args) => execute(process.execPath, [script, ...args.split(/\s+/)], { cwd: work });

  for (const [name, flags] of [
    ['sheet-add', '--occlusion fracture'],
    ['sheet-mod', '--cipher 1 -n 4'],
  ]) {
    await succeeds(`source.png -o ${name}.zip --answer ${name}.json -q ${flags}`);
    const answer = await readJson(`${name}.json`);
    const { meta } = await readZip(`${name}.zip`);
    const { stdout } = await sheet(`${name}.zip ${name}.png --answer ${name}.json`);
    const { tiles } = JSON.parse(stdout);
    assert.deepEqual(
      tiles.map((entry) => entry.role),
      [
        ...meta.plateFiles.map((file) => (answer.realPlates.includes(file) ? 'real' : 'decoy')),
        'stack',
      ],
    );

    // The stacked tile is the source itself, scaled the way every tile is.
    const { box } = tiles.at(-1);
    const drawn = await sharp(join(work, `${name}.png`))
      .extract(box)
      .raw()
      .toBuffer();
    const source = await sharp(join(work, 'source.png'))
      .flatten({ background: '#000000' })
      .resize(256, 256, { fit: 'inside' })
      .raw()
      .toBuffer();
    assert.equal(drawn.length, source.length);
    assert.ok(
      drawn.every((value, index) => Math.abs(value - source[index]) <= 1),
      flags,
    );
  }

  const preview = JSON.parse((await sheet('sheet-add.zip preview.png')).stdout);
  assert.ok(preview.tiles.every((entry) => entry.role === 'plate'));

  const answer = await readJson('sheet-add.json');
  await writeJson('wrong.json', { ...answer, realPlates: answer.falsePlates });
  const refused = await sheet('sheet-add.zip wrong.png --answer wrong.json').catch((e) => e);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /not the answer to this puzzle/);
});
