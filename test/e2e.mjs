// End-to-end smoke test: drives the built single-page app in a real browser.
//
//   npm run build && npm test
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

async function main() {
  if (!existsSync(BUILD)) throw new Error('dist/index.html missing — run `npm run build` first');

  // Kept inside the project: a snap-packaged browser has a private /tmp and
  // would read fixtures placed there as empty files.
  const work = resolve('node_modules/.cache/chroma-e2e');
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const sourcePath = join(work, 'source.png');
  const W = 96,
    H = 72;
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
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(pathToFileURL(BUILD).href);

  /* ---------------------------------------------------------- creator */
  await page.setInputFiles('input[aria-label^="Upload source image"]', sourcePath);
  await page.waitForSelector('img[alt="Source image preview"]');
  check(
    'source image loads',
    (await page.locator('.thumbrow .meta').first().textContent()).includes(`${W} × ${H}`),
  );

  await page.click('button.primary:has-text("Generate Plates")');
  await page.waitForSelector('.panel.right .card', { timeout: 20000 });
  const cardCount = await page.locator('.panel.right .card').count();
  check('generates 3 real + 2 false plates', cardCount === 5, `${cardCount} cards`);

  // Decode the fixture inside the page: file:// fetch is blocked, so pass bytes.
  const sourceRgb = await page.evaluate(
    async (bytes) => {
      const img = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return [...c.getContext('2d').getImageData(0, 0, img.width, img.height).data];
    },
    [...(await readFile(sourcePath))],
  );

  const readCanvas = () =>
    page.evaluate(() => {
      const c = document.querySelector('.canvas-wrap canvas');
      return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data];
    });

  const blend = await readCanvas();
  if (sourceRgb) {
    let sum = 0,
      n = 0;
    for (let i = 0; i < blend.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        sum += Math.abs(blend[i + c] - sourceRgb[i + c]);
        n++;
      }
    }
    const mae = sum / n;
    check('real plates reconstruct the source', mae < 4, `mean abs error ${mae.toFixed(2)}/255`);
  }

  // Enabling a false plate must visibly corrupt the reconstruction.
  await page.locator('.toggle-row.false-plate input[type=checkbox]').first().check();
  await page.waitForTimeout(120);
  const corrupted = await readCanvas();
  // Compare every channel: a decoy that drifted towards blue adds no red at all.
  let diff = 0;
  let samples = 0;
  for (let i = 0; i < blend.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      diff += Math.abs(blend[i + c] - corrupted[i + c]);
      samples++;
    }
  }
  check(
    'false plate corrupts the blend',
    diff / samples > 3,
    `mean rgb delta ${(diff / samples).toFixed(2)}/255`,
  );
  await page.locator('.toggle-row.false-plate input[type=checkbox]').first().uncheck();

  // How concentrated a plate is in one colour channel: 1.0 means a pure band.
  const channelConcentration = (index) =>
    page.evaluate((i) => {
      const img = document.querySelectorAll('.panel.right .card img')[i];
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const sums = [0, 0, 0];
      for (let k = 0; k < d.length; k += 4) {
        sums[0] += d[k];
        sums[1] += d[k + 1];
        sums[2] += d[k + 2];
      }
      const total = sums[0] + sums[1] + sums[2] || 1;
      return Math.max(...sums) / total;
    }, index);

  const plainConcentration = await channelConcentration(0);
  check(
    'an unfractured plate is a single colour band',
    plainConcentration > 0.9,
    `${(plainConcentration * 100).toFixed(1)}% of its energy in one channel`,
  );

  // The 2- and 4-plate schemes use different maths; both must still reconstruct.
  for (const count of [2, 4]) {
    await page.fill('#c-real', String(count));
    await page.dispatchEvent('#c-real', 'input');
    await page.click('button.primary:has-text("Regenerate Plates")');
    await page.waitForTimeout(400);
    const pixels = await readCanvas();
    let sum = 0,
      n = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        sum += Math.abs(pixels[i + c] - sourceRgb[i + c]);
        n++;
      }
    }
    check(
      `${count}-plate scheme reconstructs the source`,
      sum / n < 4,
      `mean abs error ${(sum / n).toFixed(2)}/255`,
    );
  }
  await page.fill('#c-real', '3');
  await page.dispatchEvent('#c-real', 'input');
  await page.click('button.primary:has-text("Regenerate Plates")');
  await page.waitForSelector('.panel.right .card');
  await page.waitForTimeout(300);

  // Fracture: the picture must still come back, but no plate may still be a
  // readable single band.
  await page.fill('#c-fracture', '0.6');
  await page.dispatchEvent('#c-fracture', 'input');
  await page.click('button.primary:has-text("Regenerate Plates")');
  await page.waitForSelector('.panel.right .card');
  await page.waitForTimeout(800);

  const fracturedBlend = await readCanvas();
  let fractureSum = 0;
  let fractureCount = 0;
  for (let i = 0; i < fracturedBlend.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      fractureSum += Math.abs(fracturedBlend[i + c] - sourceRgb[i + c]);
      fractureCount++;
    }
  }
  check(
    'fractured plates still reconstruct the source',
    fractureSum / fractureCount < 4,
    `mean abs error ${(fractureSum / fractureCount).toFixed(2)}/255`,
  );

  const fracturedConcentration = await channelConcentration(0);
  check(
    'fracturing mixes the bands across plates',
    fracturedConcentration < 0.75,
    `${(fracturedConcentration * 100).toFixed(1)}% of its energy in one channel`,
  );

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.click('button.primary:has-text("EXPORT PUZZLE")'),
  ]).then(([d]) => d);
  const zipPath = join(work, 'puzzle.zip');
  await download.saveAs(zipPath);
  const zip = await JSZip.loadAsync(await readFile(zipPath));
  const meta = JSON.parse(await zip.file('puzzle.json').async('string'));
  const pngNames = Object.keys(zip.files)
    .filter((n) => n.endsWith('.png'))
    .sort();
  check('zip holds 5 plates and puzzle.json', pngNames.length === 5 && !!meta.solutionHash);
  check(
    'metadata matches the puzzle',
    meta.numRealPlates === 3 && meta.numFalsePlates === 2 && meta.width === W && meta.height === H,
  );

  // Recover the real set from the published hash — the same check the app runs.
  const realSet = combinations(meta.plateFiles, meta.numRealPlates).find(
    (combo) => sha(combo) === meta.solutionHash,
  );
  check(
    'solutionHash identifies exactly one plate set',
    !!realSet,
    realSet ? realSet.join(' ') : 'none',
  );

  /* ----------------------------------------------------------- solver */
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
    'disabling the false plates verifies as solved',
    (await verdict.textContent()).includes('Correct combination'),
  );

  const solverBlend = await readCanvas();
  if (sourceRgb) {
    let sum = 0,
      n = 0;
    for (let i = 0; i < solverBlend.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        sum += Math.abs(solverBlend[i + c] - sourceRgb[i + c]);
        n++;
      }
    }
    check(
      'solved stack reproduces the source',
      sum / n < 4,
      `mean abs error ${(sum / n).toFixed(2)}/255`,
    );
  }

  // Solo, reorder, and the keyboard path all keep the stack usable.
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
  check(
    'keyboard reordering moves a plate',
    before[0] === after[1] && before[1] === after[0],
    `${before.join(',')} -> ${after.join(',')}`,
  );

  const solution = await Promise.all([
    page.waitForEvent('download'),
    page.click('button.primary:has-text("EXPORT SOLUTION")'),
  ]).then(([d]) => d);
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

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
