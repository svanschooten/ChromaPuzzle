// Images in and out on the command line. The app decodes through a canvas;
// here sharp does it, so any format sharp reads will do as a source.
import sharp from 'sharp';

/**
 * Decodes an image to RGBA the way the app's loader does: upright, in sRGB,
 * 8 bits a channel, and scaled down so its long edge fits `maxSize`. An
 * animation gives its first frame.
 */
export async function readSourceImage(path, maxSize) {
  const image = sharp(path, { autoOrient: true });
  const { autoOrient } = await image.metadata();
  const origWidth = autoOrient.width;
  const origHeight = autoOrient.height;
  const scale = Math.min(1, maxSize / Math.max(origWidth, origHeight));
  const width = Math.max(1, Math.round(origWidth * scale));
  const height = Math.max(1, Math.round(origHeight * scale));
  if (scale < 1) image.resize(width, height, { fit: 'fill' });

  const data = await image.toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' }).toBuffer();
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    width,
    height,
    origWidth,
    origHeight,
    scaled: scale < 1,
  };
}

/** A plate as PNG bytes, colour values exactly as generated. */
export const encodePng = (data, width, height) =>
  sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
