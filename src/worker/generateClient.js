// Generation runs in a worker so the UI keeps painting. Workers built from a
// blob URL are refused on some file:// origins, so this falls back to running
// the same code on the main thread rather than failing the user's click.
import GenerateWorker from './generate.worker.js?worker&inline';
import { generatePuzzle } from '../lib/generate.js';

function runInWorker(payload, onProgress) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new GenerateWorker();
    } catch (error) {
      reject(error);
      return;
    }

    const finish = (outcome, value) => {
      worker.terminate();
      (outcome === 'ok' ? resolve : reject)(value);
    };

    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.text);
      else if (data.type === 'done') finish('ok', data.result);
      else finish('fail', new Error(data.message));
    };
    worker.onerror = (event) => finish('fail', new Error(event.message || 'worker failed'));
    worker.onmessageerror = () => finish('fail', new Error('worker message failed'));

    worker.postMessage(payload);
  });
}

/**
 * @returns {Promise<{result: object, engine: 'worker'|'main'}>}
 */
export async function generate(payload, onProgress = () => {}) {
  try {
    return { result: await runInWorker(payload, onProgress), engine: 'worker' };
  } catch {
    // Yield once so the busy state paints before the main thread locks up.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { result: generatePuzzle({ ...payload, onProgress }), engine: 'main' };
  }
}
