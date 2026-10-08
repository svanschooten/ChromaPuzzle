// File in/out: source images, plate PNGs, puzzle ZIPs (design doc 2.4).
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { createCanvas, imageDataToPngBlob } from './composite.js';
import { layoutPuzzle } from './puzzleFormat.js';
import { MAX_SOURCE_SIZE } from './settings.js';

async function decode(blob) {
  if (globalThis.createImageBitmap) {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* Safari can fail on some PNGs; fall back to an <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toImageData(bitmap, width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export async function loadSourceImage(file) {
  const bitmap = await decode(file);
  const ow = bitmap.width,
    oh = bitmap.height;
  // Large sources make plate generation crawl, so cap the working resolution.
  const scale = Math.min(1, MAX_SOURCE_SIZE / Math.max(ow, oh));
  const width = Math.max(1, Math.round(ow * scale));
  const height = Math.max(1, Math.round(oh * scale));
  const imageData = toImageData(bitmap, width, height);

  const thumbSize = 160;
  const thumb = createCanvas(thumbSize, thumbSize);
  const tctx = thumb.getContext('2d');
  tctx.fillStyle = '#000';
  tctx.fillRect(0, 0, thumbSize, thumbSize);
  const cover = Math.max(thumbSize / width, thumbSize / height);
  tctx.drawImage(
    bitmap,
    (thumbSize - width * cover) / 2,
    (thumbSize - height * cover) / 2,
    width * cover,
    height * cover,
  );

  return {
    data: imageData.data,
    width,
    height,
    origWidth: ow,
    origHeight: oh,
    scaled: scale < 1,
    thumb: thumb.toDataURL('image/png'),
    name: file.name,
  };
}

async function pngEntryToPlate(name, blob) {
  const bitmap = await decode(blob);
  const { width, height } = bitmap;
  return { filename: name, data: toImageData(bitmap, width, height).data, width, height };
}

/**
 * Reads a mixed drop of plate PNGs and/or puzzle ZIPs.
 * @returns {{plates: object[], meta: object|null, errors: string[]}}
 */
export async function readPuzzleFiles(files) {
  const plates = [];
  const errors = [];
  let meta = null;

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((e) => !e.dir);
      for (const entry of entries) {
        const base = entry.name.split('/').pop();
        if (base === 'puzzle.json') {
          try {
            meta = JSON.parse(await entry.async('string'));
          } catch {
            errors.push('puzzle.json in ' + file.name + ' is not valid JSON');
          }
        }
      }
      for (const entry of entries) {
        const base = entry.name.split('/').pop();
        if (base.toLowerCase().endsWith('.png')) {
          plates.push(await pngEntryToPlate(base, await entry.async('blob')));
        }
      }
    } else if (lower.endsWith('.png') || file.type.startsWith('image/')) {
      plates.push(await pngEntryToPlate(file.name, file));
    } else {
      errors.push('Skipped ' + file.name + ' (not a PNG or ZIP)');
    }
  }

  plates.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
  return { plates, meta, errors };
}

/**
 * Packs plates into a ZIP with real and false plates shuffled together, so a
 * filename never gives the answer away.
 * @param {object} options.settings the creator settings the plates were made with
 */
export async function exportPuzzleZip({ plates, width, height, settings }) {
  const zip = new JSZip();
  const { entries, meta } = await layoutPuzzle({ plates, width, height, settings });
  for (const { filename, plate } of entries) {
    zip.file(filename, await imageDataToPngBlob(plate.data, width, height));
  }
  zip.file('puzzle.json', JSON.stringify(meta, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, 'chroma-puzzle.zip');
  return meta;
}

export { saveAs };
