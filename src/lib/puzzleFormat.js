// The puzzle as it is handed over: plate files in shuffled order, and the
// puzzle.json that describes them. The app's export and the command line both
// lay a puzzle out through here.
import { solutionHash } from './hash.js';
import { shuffled } from './random.js';
import { occlusionSettings } from './settings.js';

/**
 * Deals real and false plates together and names them in that order, so a
 * filename never gives the answer away.
 * @param {object} options.settings the creator settings the plates were made with
 * @param {() => number} [options.random] what shuffles the plates
 * @returns {Promise<{entries: {filename: string, plate: object}[], meta: object}>}
 */
export async function layoutPuzzle({
  plates,
  width,
  height,
  settings,
  random = Math.random,
  created = new Date(),
}) {
  const digits = Math.max(2, String(plates.length).length);
  const entries = shuffled(random, plates).map((plate, index) => ({
    filename: `plate_${String(index + 1).padStart(digits, '0')}.png`,
    plate,
  }));
  const realFiles = entries.filter((entry) => !entry.plate.isFalse).map((entry) => entry.filename);

  const meta = {
    version: '1.2',
    width,
    height,
    numRealPlates: realFiles.length,
    numFalsePlates: entries.length - realFiles.length,
    totalPlates: entries.length,
    plateOpacity: settings.opacity,
    bandSpace: settings.bandSpace,
    bandMode: settings.bandMode,
    weave: settings.weave,
    cells: settings.bandSpace === 'cells' ? { ...settings.cells } : null,
    falseMode: settings.falseMode,
    decoyIntensity: settings.decoyIntensity,
    stack: { mode: settings.cipher > 0 ? 'modular' : 'additive', cipher: settings.cipher },
    occlusion: occlusionSettings(settings),
    tints: plates.filter((plate) => !plate.isFalse).map((plate) => plate.tint),
    plateFiles: entries.map((entry) => entry.filename),
    solutionHash: await solutionHash(realFiles),
    created: created.toISOString(),
  };
  return { entries, meta };
}
