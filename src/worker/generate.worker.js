// Runs puzzle generation off the UI thread.
import { generatePuzzle } from '../lib/generate.js';

self.onmessage = (event) => {
  const { pixels, width, height, settings } = event.data;
  try {
    const result = generatePuzzle({
      pixels,
      width,
      height,
      settings,
      onProgress: (text) => self.postMessage({ type: 'progress', text }),
    });
    self.postMessage(
      { type: 'done', result },
      result.plates.map((plate) => plate.data.buffer),
    );
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
