// Compositing plates back into a picture.
import { revealModular } from './cipher.js';

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function plateToCanvas(plate, width, height) {
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(plate.data, width, height), 0, 0);
  return canvas;
}

/**
 * Draws the enabled plates onto `canvas`.
 *
 * Additive stacking uses `lighter`, whose black fill is the identity and keeps
 * the output opaque. Ciphered stacking wraps instead of clamping, which no
 * canvas blend mode does, so it is composited here in JavaScript. Both are
 * commutative: stack order never changes the result.
 */
export function renderPlates(canvas, plates, width, height, { modular = false } = {}) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (modular) {
    ctx.putImageData(new ImageData(revealModular(plates, width, height), width, height), 0, 0);
    return canvas;
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';
  for (const plate of plates) {
    ctx.drawImage(plateToCanvas(plate, width, height), 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

export function toPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function imageDataToPngBlob(data, width, height) {
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  return toPngBlob(canvas);
}

/** Small preview of a plate, composited over black like the real stack. */
export function makeThumb(data, width, height, max = 120) {
  const scale = Math.min(1, max / Math.max(width, height));
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));
  const thumb = createCanvas(tw, th);
  const ctx = thumb.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(plateToCanvas({ data }, width, height), 0, 0, tw, th);
  return thumb.toDataURL('image/png');
}

/** Alpha-weighted average colour — used to swatch plates of unknown origin. */
export function averageTint(data, width, height) {
  const step = Math.max(1, Math.floor((width * height) / 20000));
  let r = 0,
    g = 0,
    b = 0,
    weight = 0;
  for (let i = 0; i < width * height; i += step) {
    const j = i * 4;
    const a = data[j + 3] / 255;
    r += data[j] * a;
    g += data[j + 1] * a;
    b += data[j + 2] * a;
    weight += a;
  }
  if (!weight) return [80, 80, 80];
  const norm = 255 / Math.max(r / weight, g / weight, b / weight, 1);
  return [
    Math.round((r / weight) * norm),
    Math.round((g / weight) * norm),
    Math.round((b / weight) * norm),
  ];
}
