// Shared application state and the actions that mutate it.
import { computed, markRaw, reactive, toRaw } from 'vue';
import {
  BAND_MODES,
  BAND_SPACES,
  MAX_PLATES,
  MAX_WEAVE,
  MIN_PLATES,
  SOFT_PLATE_LIMIT,
} from './lib/bands/index.js';
import { OCCLUSION_MODES } from './lib/occlusion/index.js';
import { FALSE_MODES } from './lib/falsePlate.js';
import { describeDuration, estimateGenerationMs } from './lib/cost.js';
import { averageTint, makeThumb, renderPlates, toPngBlob, createCanvas } from './lib/composite.js';
import { exportPuzzleZip, loadSourceImage, readPuzzleFiles, saveAs } from './lib/puzzleIO.js';
import { solutionHash } from './lib/hash.js';
import { generate as runGeneration } from './worker/generateClient.js';

export {
  BAND_MODES,
  BAND_SPACES,
  FALSE_MODES,
  MAX_PLATES,
  MAX_WEAVE,
  MIN_PLATES,
  OCCLUSION_MODES,
  SOFT_PLATE_LIMIT,
};

export const ui = reactive({
  mode: 'creator',
  tab: 'preview',
  busy: false,
  status: 'Ready',
  statusKind: '',
});

export const creator = reactive({
  source: null,
  plates: [],
  plateCount: 3,
  falseCount: 2,
  opacity: 1,
  bandSpace: 'channels',
  bandMode: 'linear',
  weave: 1,
  cells: { hue: 6, chroma: 4, value: 5, hard: false },
  cuts: null,
  histograms: null,
  falseMode: 'drift',
  decoyIntensity: 0.6,
  cipher: 0,
  occlusionEnabled: false,
  occlusionMode: 'fracture',
  occlusionStrength: 0.6,
  shardSize: 32,
  blendScale: 40,
  screenScale: 2,
  showOriginal: false,
  engine: '',
});

export const solver = reactive({
  plates: [],
  meta: null,
  stack: 'additive',
  width: 0,
  height: 0,
  error: '',
  solved: false,
});

let nextId = 0;
const uid = () => `p${nextId++}`;
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function setStatus(text, kind = '') {
  ui.status = text;
  ui.statusKind = kind;
}

export const activePlates = computed(() =>
  ui.mode === 'creator' ? creator.plates : solver.plates,
);

export const enabledPlates = computed(() => activePlates.value.filter((plate) => plate.enabled));

/** How the enabled plates come back together: added, or wrapped modulo 256. */
export const stackMode = computed(() =>
  ui.mode === 'creator' ? (creator.cipher > 0 ? 'modular' : 'additive') : solver.stack,
);

/** Roughly how long the current settings will take to generate. */
export const estimate = computed(() => {
  if (!creator.source) return null;
  const ms = estimateGenerationMs({
    width: creator.source.width,
    height: creator.source.height,
    plateCount: creator.plateCount,
    decoyCount: creator.falseCount,
    occlusionMode: creator.occlusionEnabled ? creator.occlusionMode : 'none',
    bandSpace: creator.bandSpace,
    hardCells: creator.cells.hard,
  });
  return {
    ms,
    text: describeDuration(ms),
    slow: ms > 8000 || creator.plateCount > SOFT_PLATE_LIMIT,
  };
});

/** The occlusion settings to generate with, or null when it is switched off. */
const occlusionSettings = computed(() =>
  creator.occlusionEnabled
    ? {
        mode: creator.occlusionMode,
        strength: creator.occlusionStrength,
        shardSize: creator.shardSize,
        scale: creator.occlusionMode === 'screen' ? creator.screenScale : creator.blendScale,
      }
    : null,
);

/* ---------------------------------------------------------------- creator */

export async function loadSource(file) {
  try {
    ui.busy = true;
    setStatus('Loading image…', 'busy');
    const source = await loadSourceImage(file);
    source.data = markRaw(source.data);
    creator.source = source;
    creator.plates = [];
    creator.showOriginal = false;
    setStatus(
      source.scaled
        ? `Image loaded and scaled to ${source.width}×${source.height}`
        : `Image loaded (${source.width}×${source.height})`,
    );
  } catch (error) {
    setStatus('Could not read that image: ' + error.message, 'error');
  } finally {
    ui.busy = false;
  }
}

export function clearSource() {
  creator.source = null;
  creator.plates = [];
  setStatus('Ready');
}

export async function generatePlates() {
  if (!creator.source) return;
  const { data, width, height } = creator.source;
  ui.busy = true;
  setStatus('Generating plates…', 'busy');
  await frame();

  try {
    const { result, engine } = await runGeneration(
      {
        pixels: data.slice(),
        width,
        height,
        settings: {
          plateCount: creator.plateCount,
          falseCount: creator.falseCount,
          opacity: creator.opacity,
          bandSpace: creator.bandSpace,
          bandMode: creator.bandMode,
          weave: creator.weave,
          cells: toRaw(creator.cells),
          cuts: creator.bandMode === 'manual' ? toRaw(creator.cuts) : null,
          falseMode: creator.falseMode,
          decoyIntensity: creator.decoyIntensity,
          cipher: creator.cipher,
          occlusion: occlusionSettings.value,
          seed: (Math.random() * 2 ** 32) >>> 0,
        },
      },
      (text) => setStatus(text, 'busy'),
    );

    creator.engine = engine;
    // Keep the cuts and histograms the plan used, so the manual editor starts
    // from whatever the automatic modes came up with.
    creator.cuts = result.cuts;
    creator.histograms = result.histograms;
    creator.plates = result.plates.map((plate) => ({
      id: uid(),
      data: markRaw(plate.data),
      width,
      height,
      enabled: !plate.isFalse,
      isFalse: plate.isFalse,
      tint: plate.tint,
      bandLabel: plate.bandLabel,
      label: plate.label,
      weak: plate.weak,
      thumb: makeThumb(plate.data, width, height),
    }));
    creator.showOriginal = false;
    const weak = creator.plates.filter((plate) => plate.weak && !plate.isFalse).length;
    const advice =
      creator.bandSpace === 'cells'
        ? ' — raise the cell classes, or soften them'
        : ' — try fewer plates';
    setStatus(
      `${creator.plateCount} chroma plates + ${creator.falseCount} decoys ready` +
        (engine === 'main' ? ' (main thread)' : '') +
        (weak ? ` · ${weak} plate${weak > 1 ? 's are' : ' is'} nearly empty${advice}` : ''),
      weak ? 'busy' : '',
    );
  } catch (error) {
    setStatus('Generation failed: ' + error.message, 'error');
  } finally {
    ui.busy = false;
  }
}

export async function exportPuzzle() {
  if (!creator.plates.length) return;
  ui.busy = true;
  setStatus('Exporting puzzle…', 'busy');
  await frame();
  try {
    const meta = await exportPuzzleZip({
      plates: creator.plates,
      width: creator.source.width,
      height: creator.source.height,
      numRealPlates: creator.plateCount,
      numFalsePlates: creator.falseCount,
      plateOpacity: creator.opacity,
      bandSpace: creator.bandSpace,
      bandMode: creator.bandMode,
      weave: creator.weave,
      cells: creator.bandSpace === 'cells' ? { ...creator.cells } : null,
      falseMode: creator.falseMode,
      decoyIntensity: creator.decoyIntensity,
      stack: { mode: creator.cipher > 0 ? 'modular' : 'additive', cipher: creator.cipher },
      occlusion: occlusionSettings.value,
      tints: creator.plates.filter((plate) => !plate.isFalse).map((plate) => plate.tint),
    });
    setStatus(`Exported ${meta.totalPlates} shuffled plates + puzzle.json`);
  } catch (error) {
    setStatus('Export failed: ' + error.message, 'error');
  } finally {
    ui.busy = false;
  }
}

/* ----------------------------------------------------------------- solver */

export async function loadPlates(files) {
  ui.busy = true;
  solver.error = '';
  setStatus('Reading plates…', 'busy');
  await frame();
  try {
    const { plates, meta, errors } = await readPuzzleFiles(files);
    if (!plates.length) {
      solver.error = errors.join(' · ') || 'No plate images found in that drop.';
      setStatus(solver.error, 'error');
      return;
    }
    const width = plates[0].width;
    const height = plates[0].height;
    const mismatched = plates.filter((plate) => plate.width !== width || plate.height !== height);
    if (mismatched.length) {
      solver.error =
        'All plates must share one size. Ignored: ' +
        mismatched.map((plate) => plate.filename).join(', ');
    }
    const usable = plates.filter((plate) => plate.width === width && plate.height === height);

    solver.plates = usable.map((plate) => ({
      id: uid(),
      filename: plate.filename,
      data: markRaw(plate.data),
      width,
      height,
      enabled: true,
      tint: averageTint(plate.data, width, height),
      thumb: makeThumb(plate.data, width, height),
      label: plate.filename.replace(/\.png$/i, ''),
    }));
    solver.width = width;
    solver.height = height;
    solver.meta = meta;
    // A ciphered stack wraps rather than adds; the puzzle file says which.
    solver.stack = meta?.stack?.mode === 'modular' ? 'modular' : 'additive';
    if (errors.length && !solver.error) solver.error = errors.join(' · ');
    await checkSolution();
    setStatus(
      `${solver.plates.length} plates loaded (${width}×${height})` +
        (meta ? ' · puzzle.json found' : ''),
    );
  } catch (error) {
    solver.error = error.message;
    setStatus('Could not load plates: ' + error.message, 'error');
  } finally {
    ui.busy = false;
  }
}

export function clearPlates() {
  solver.plates = [];
  solver.meta = null;
  solver.stack = 'additive';
  solver.error = '';
  solver.solved = false;
  solver.width = solver.height = 0;
  setStatus('Ready');
}

export function movePlate(from, to) {
  const list = solver.plates;
  if (to < 0 || to >= list.length || from === to) return;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
}

export function setAllEnabled(value) {
  for (const plate of activePlates.value) plate.enabled = value;
  checkSolution();
}

export function soloPlate(plate) {
  const alreadySolo =
    activePlates.value.filter((entry) => entry.enabled).length === 1 && plate.enabled;
  for (const entry of activePlates.value) entry.enabled = alreadySolo ? true : entry === plate;
  checkSolution();
}

/** Verifies the enabled set against puzzle.json without revealing the answer. */
export async function checkSolution() {
  const hash = solver.meta?.solutionHash;
  if (!hash) {
    solver.solved = false;
    return;
  }
  const names = solver.plates.filter((plate) => plate.enabled).map((plate) => plate.filename);
  solver.solved = names.length > 0 && (await solutionHash(names)) === hash;
}

export async function exportSolution() {
  const plates = enabledPlates.value;
  if (!plates.length) return;
  ui.busy = true;
  setStatus('Rendering solution…', 'busy');
  await frame();
  try {
    const width = ui.mode === 'creator' ? creator.source.width : solver.width;
    const height = ui.mode === 'creator' ? creator.source.height : solver.height;
    const canvas = renderPlates(createCanvas(width, height), plates, width, height, {
      modular: stackMode.value === 'modular',
    });
    saveAs(await toPngBlob(canvas), 'solution.png');
    setStatus(`Exported solution.png from ${plates.length} plates`);
  } catch (error) {
    setStatus('Export failed: ' + error.message, 'error');
  } finally {
    ui.busy = false;
  }
}
