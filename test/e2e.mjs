// End-to-end smoke test: drives the built single-page app in a real browser.
//
//   npm run build && npm run test:e2e
//
// Set CHROME_PATH to point at a Chromium/Chrome binary if the Playwright
// download is not present (e.g. CHROME_PATH=/usr/bin/chromium-browser).
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makePng } from './makePng.mjs';

const BUILD = resolve('dist/index.html');
const W = 96;
const H = 72;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const sha = (parts) =>
  createHash('sha256')
    .update([...parts].sort().join(','))
    .digest('hex');

function combinations(items, size) {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...rest] = items;
  return [...combinations(rest, size - 1).map((c) => [head, ...c]), ...combinations(rest, size)];
}

function meanAbsError(blend, source) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < blend.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      sum += Math.abs(blend[i + c] - source[i + c]);
      count++;
    }
  }
  return sum / count;
}

async function main() {
  if (!existsSync(BUILD)) throw new Error('dist/index.html missing — run `npm run build` first');

  // Kept inside the project: a snap-packaged browser has a private /tmp and
  // would read fixtures placed there as empty files.
  const work = resolve('node_modules/.cache/chroma-e2e');
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  const sourcePath = join(work, 'source.png');
  await writeFile(
    sourcePath,
    makePng(W, H, (x, y) => [
      Math.round(40 + 180 * (x / W)),
      Math.round(30 + 150 * (y / H)),
      Math.round(60 + 120 * Math.abs(Math.sin((x + y) / 9))),
      255,
    ]),
  );

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    downloadsPath: join(work, 'downloads'),
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1400, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(BUILD).href);

  const setRange = async (selector, value) => {
    await page.fill(selector, String(value));
    await page.dispatchEvent(selector, 'input');
  };
  const regenerate = async () => {
    await page.click('.panel.left button.primary');
    await page.waitForSelector('.panel.right .card');
    await page.waitForFunction(
      () => !document.querySelector('.panel.left button.primary .spinner'),
    );
    await page.waitForTimeout(150);
  };
  const readCanvas = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('.canvas-wrap canvas');
      return [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data];
    });
  const statusText = () => page.locator('.statusbar').textContent();

  /* ---------------------------------------------------------------- creator */
  await page.setInputFiles('input[aria-label^="Upload source image"]', sourcePath);
  await page.waitForSelector('img[alt="Source image preview"]');
  check(
    'source image loads',
    (await page.locator('.thumbrow .meta').first().textContent()).includes(`${W} × ${H}`),
  );

  await regenerate();
  check(
    'generates 3 real + 2 false plates',
    (await page.locator('.panel.right .card').count()) === 5,
  );
  check(
    'generation runs in a worker',
    !(await statusText()).includes('main thread'),
    await statusText(),
  );

  const sourceRgb = await page.evaluate(
    async (bytes) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return [...canvas.getContext('2d').getImageData(0, 0, image.width, image.height).data];
    },
    [...(await readFile(sourcePath))],
  );

  const blend = await readCanvas();
  check(
    'at opacity 1 the plates reconstruct the source exactly',
    meanAbsError(blend, sourceRgb) === 0,
    `mean abs error ${meanAbsError(blend, sourceRgb).toFixed(3)}/255`,
  );

  await page.locator('.toggle-row.false-plate input[type=checkbox]').first().check();
  await page.waitForTimeout(120);
  const corrupted = await readCanvas();
  check(
    'a decoy corrupts the blend',
    meanAbsError(corrupted, blend) > 3,
    `mean rgb delta ${meanAbsError(corrupted, blend).toFixed(2)}/255`,
  );
  await page.locator('.toggle-row.false-plate input[type=checkbox]').first().uncheck();

  // How concentrated a plate is in one color channel: 1.0 means a pure band.
  const channelConcentration = (index) =>
    page.evaluate((i) => {
      const img = document.querySelectorAll('.panel.right .card img')[i];
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const sums = [0, 0, 0];
      for (let k = 0; k < data.length; k += 4) {
        sums[0] += data[k];
        sums[1] += data[k + 1];
        sums[2] += data[k + 2];
      }
      return Math.max(...sums) / (sums[0] + sums[1] + sums[2] || 1);
    }, index);

  const plain = await channelConcentration(0);
  check(
    'without occlusion a plate is a single color band',
    plain > 0.9,
    `${(plain * 100).toFixed(1)}% in one channel`,
  );

  for (const count of [2, 8, 16]) {
    await setRange('#c-real', count);
    await regenerate();
    const pixels = await readCanvas();
    check(
      `${count} chroma plates reconstruct the source`,
      meanAbsError(pixels, sourceRgb) === 0,
      `${await page.locator('.panel.right .card').count()} cards`,
    );
  }

  await setRange('#c-real', 5);
  await page.click('#c-band-weighted');
  await regenerate();
  check(
    'weighted band planning reconstructs the source',
    meanAbsError(await readCanvas(), sourceRgb) === 0,
  );

  await page.click('#c-space-spectrum');
  await regenerate();
  check('spectrum bands reconstruct the source', meanAbsError(await readCanvas(), sourceRgb) === 0);
  const hueLabel = await page.locator('.panel.right .card .sub').first().textContent();
  check('spectrum plates are labelled by hue arc', /°/.test(hueLabel), hueLabel.trim());

  await page.click('#c-space-channels');
  await setRange('#c-weave', 4);
  await regenerate();
  check('weaved bands reconstruct the source', meanAbsError(await readCanvas(), sourceRgb) === 0);
  check(
    'weaved plates say so',
    (await page.locator('.panel.right .card .sub').first().textContent()).includes('woven'),
  );

  await page.click('#c-band-manual');
  const handles = page.locator('.cuthandle');
  const handleCount = await handles.count();
  check('manual mode offers draggable cuts', handleCount > 0, `${handleCount} handles`);
  const firstHandle = handles.first();
  const cutBefore = await firstHandle.getAttribute('aria-valuenow');
  await firstHandle.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  const cutAfter = await firstHandle.getAttribute('aria-valuenow');
  check(
    'cuts can be moved from the keyboard',
    Number(cutAfter) === Number(cutBefore) + 5,
    `${cutBefore} → ${cutAfter}`,
  );
  await regenerate();
  check(
    'hand-placed cuts reconstruct the source',
    meanAbsError(await readCanvas(), sourceRgb) === 0,
  );

  await setRange('#c-weave', 1);
  await page.click('#c-band-linear');

  await page.click('#c-falsemode-warp');
  await setRange('#c-decoy', 0.9);
  await regenerate();
  check(
    'warped decoys still leave the real stack exact',
    meanAbsError(await readCanvas(), sourceRgb) === 0,
  );
  check(
    'an estimate is shown before generating',
    (await page.locator('.estimate').textContent()).includes('Estimated'),
  );

  await setRange('#c-real', 4);
  await page.click('#c-band-linear');
  await page.check('#c-occlusion');
  for (const mode of ['fracture', 'blend', 'noise']) {
    await page.click(`#c-occmode-${mode}`);
    await setRange('#c-strength', 0.9);
    await regenerate();
    check(
      `${mode} occlusion reconstructs the source`,
      meanAbsError(await readCanvas(), sourceRgb) === 0,
      `mean abs error ${meanAbsError(await readCanvas(), sourceRgb).toFixed(3)}/255`,
    );
    const mixed = await channelConcentration(0);
    check(
      `${mode} occlusion mixes bands across plates`,
      mixed < 0.8,
      `${(mixed * 100).toFixed(1)}% in one channel`,
    );
  }

  await page.click('#c-occmode-fracture');
  await setRange('#c-real', 3);
  await regenerate();

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.click('button.primary:has-text("EXPORT PUZZLE")'),
  ]).then(([event]) => event);
  const zipPath = join(work, 'puzzle.zip');
  await download.saveAs(zipPath);
  const zip = await JSZip.loadAsync(await readFile(zipPath));
  const meta = JSON.parse(await zip.file('puzzle.json').async('string'));
  const pngNames = Object.keys(zip.files).filter((name) => name.endsWith('.png'));
  check('zip holds every plate plus puzzle.json', pngNames.length === 5 && !!meta.solutionHash);
  check(
    'metadata records the settings used',
    meta.numRealPlates === 3 &&
      meta.numFalsePlates === 2 &&
      meta.bandMode === 'linear' &&
      meta.bandSpace === 'channels' &&
      meta.weave === 1 &&
      meta.decoyIntensity === 0.9 &&
      meta.falseMode === 'warp' &&
      meta.occlusion?.mode === 'fracture',
    JSON.stringify({
      band: meta.bandMode,
      decoys: meta.falseMode,
      occlusion: meta.occlusion?.mode,
    }),
  );

  const realSet = combinations(meta.plateFiles, meta.numRealPlates).find(
    (combo) => sha(combo) === meta.solutionHash,
  );
  check(
    'solutionHash identifies exactly one plate set',
    !!realSet,
    realSet ? realSet.join(' ') : 'none',
  );

  /* ----------------------------------------------------------------- solver */
  await page.click('.modes button:has-text("Solver")');
  await page.setInputFiles('input[aria-label^="Load plates"]', zipPath);
  await page.waitForSelector('.panel.right .card');
  check(
    'solver loads every plate from the zip',
    (await page.locator('.panel.right .card').count()) === 5,
  );

  const verdict = page.locator('.verdict');
  check(
    'all plates enabled is not the solution',
    (await verdict.textContent()).includes('Not the solution yet'),
  );

  for (const name of meta.plateFiles) {
    if (realSet.includes(name)) continue;
    await page
      .locator(`.panel.right .card:has-text("${name.replace(/\.png$/, '')}") input[type=checkbox]`)
      .uncheck();
  }
  await page.waitForTimeout(200);
  check(
    'disabling the decoys verifies as solved',
    (await verdict.textContent()).includes('Correct combination'),
  );
  check(
    'the solved stack reproduces the source',
    meanAbsError(await readCanvas(), sourceRgb) === 0,
  );

  await page.locator('.panel.right .card').first().locator('button:has-text("solo")').click();
  check(
    'solo isolates one plate',
    (await page.locator('.panel.right .card input:checked').count()) === 1,
  );
  await page.click('button.ghost:has-text("All on")');

  const before = await page.locator('.panel.right .card .name').allTextContents();
  await page.locator('.panel.right .card').first().focus();
  await page.keyboard.press('ArrowDown');
  const after = await page.locator('.panel.right .card .name').allTextContents();
  check('keyboard reordering moves a plate', before[0] === after[1] && before[1] === after[0]);

  const solution = await Promise.all([
    page.waitForEvent('download'),
    page.click('button.primary:has-text("EXPORT SOLUTION")'),
  ]).then(([event]) => event);
  const solutionPath = join(work, 'solution.png');
  await solution.saveAs(solutionPath);
  const bytes = await readFile(solutionPath);
  check(
    'solution.png exports',
    bytes.length > 100 && bytes.subarray(1, 4).toString() === 'PNG',
    `${bytes.length} bytes`,
  );

  check('no uncaught page errors', errors.length === 0, errors.join(' | '));

  await browser.close();

  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
