// Shared application state and the actions that mutate it.
import { computed, markRaw, reactive } from 'vue';
import { splitPlates, SCHEMES } from './lib/split.js';
import { generateFalsePlate } from './lib/falsePlate.js';
import { buildShardPlans, buildShards } from './lib/fracture.js';
import { averageTint, makeThumb, renderPlates, toPngBlob, createCanvas } from './lib/composite.js';
import { exportPuzzleZip, loadSourceImage, readPuzzleFiles, saveAs } from './lib/puzzleIO.js';
import { solutionHash } from './lib/hash.js';

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
  numRealPlates: 3,
  numFalsePlates: 2,
  plateOpacity: 0.7,
  fracture: 0,
  shardSize: 32,
  showOriginal: false,
});

export const solver = reactive({
  plates: [],
  meta: null,
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

export const enabledPlates = computed(() => activePlates.value.filter((p) => p.enabled));

export const schemeLabel = computed(() => SCHEMES[creator.numRealPlates].label);

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
  } catch (err) {
    setStatus('Could not read that image: ' + err.message, 'error');
  } finally {
    ui.busy = false;
  }
}

export function clearSource() {
  creator.source = null;
  creator.plates = [];
  setStatus('Ready');
}

export async function generate() {
  if (!creator.source) return;
  const { data, width, height } = creator.source;
  ui.busy = true;
  setStatus('Generating plates…', 'busy');
  await frame();

  try {
    // Fracturing redistributes the bands shard by shard; the same shard map
    // then shapes the decoys, so they share the real plates' structure.
    const shards = creator.fracture > 0 ? buildShards(width, height, creator.shardSize) : null;
    const fracture = shards
      ? {
          map: shards.map,
          plans: buildShardPlans(shards.count, creator.numRealPlates, creator.fracture),
        }
      : null;

    const real = splitPlates(
      data,
      width,
      height,
      creator.numRealPlates,
      creator.plateOpacity,
      fracture,
    );
    const plates = real.map((plate, i) => makePlate(plate, width, height, `Plate ${i + 1}`, false));

    for (let i = 0; i < creator.numFalsePlates; i++) {
      setStatus(`Generating false plate ${i + 1}/${creator.numFalsePlates}…`, 'busy');
      await frame();
      const fake = generateFalsePlate(real, width, height, shards);
      plates.push(makePlate(fake, width, height, `Plate ${plates.length + 1} (False)`, true));
    }

    creator.plates = plates;
    creator.showOriginal = false;
    setStatus(
      `${real.length} chroma plates + ${creator.numFalsePlates} false plates ready` +
        (shards ? ` · fractured into ${shards.count} shards` : ''),
    );
  } catch (err) {
    setStatus('Generation failed: ' + err.message, 'error');
  } finally {
    ui.busy = false;
  }
}

function makePlate(plate, width, height, label, isFalse) {
  return {
    id: uid(),
    data: markRaw(plate.data),
    width,
    height,
    enabled: !isFalse,
    isFalse,
    tint: plate.tint,
    bandLabel: isFalse || !creator.fracture ? plate.bandLabel : `${plate.bandLabel} · fractured`,
    label,
    thumb: makeThumb(plate.data, width, height),
  };
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
      numRealPlates: creator.numRealPlates,
      numFalsePlates: creator.numFalsePlates,
      plateOpacity: creator.plateOpacity,
      fracture:
        creator.fracture > 0 ? { strength: creator.fracture, shardSize: creator.shardSize } : null,
      tints: SCHEMES[creator.numRealPlates].bands.map((b) => b.tint),
    });
    setStatus(`Exported ${meta.totalPlates} shuffled plates + puzzle.json`);
  } catch (err) {
    setStatus('Export failed: ' + err.message, 'error');
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
    const mismatched = plates.filter((p) => p.width !== width || p.height !== height);
    if (mismatched.length) {
      solver.error =
        'All plates must share one size. Ignored: ' + mismatched.map((p) => p.filename).join(', ');
    }
    const usable = plates.filter((p) => p.width === width && p.height === height);

    solver.plates = usable.map((p, i) => ({
      id: uid(),
      filename: p.filename,
      data: markRaw(p.data),
      width,
      height,
      enabled: true,
      tint: averageTint(p.data, width, height),
      thumb: makeThumb(p.data, width, height),
      label: p.filename.replace(/\.png$/i, ''),
    }));
    solver.width = width;
    solver.height = height;
    solver.meta = meta;
    if (errors.length && !solver.error) solver.error = errors.join(' · ');
    await checkSolution();
    setStatus(
      `${solver.plates.length} plates loaded (${width}×${height})` +
        (meta ? ' · puzzle.json found' : ''),
    );
  } catch (err) {
    solver.error = err.message;
    setStatus('Could not load plates: ' + err.message, 'error');
  } finally {
    ui.busy = false;
  }
}

export function clearPlates() {
  solver.plates = [];
  solver.meta = null;
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
  const only = activePlates.value.filter((p) => p.enabled).length === 1 && plate.enabled;
  for (const p of activePlates.value) p.enabled = only ? true : p === plate;
  checkSolution();
}

/** Verifies the enabled set against puzzle.json without revealing the answer. */
export async function checkSolution() {
  const hash = solver.meta?.solutionHash;
  if (!hash) {
    solver.solved = false;
    return;
  }
  const names = solver.plates.filter((p) => p.enabled).map((p) => p.filename);
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
    const canvas = renderPlates(createCanvas(width, height), plates, width, height);
    saveAs(await toPngBlob(canvas), 'solution.png');
    setStatus(`Exported solution.png from ${plates.length} plates`);
  } catch (err) {
    setStatus('Export failed: ' + err.message, 'error');
  } finally {
    ui.busy = false;
  }
}
