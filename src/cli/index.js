// The chroma-puzzle command line: the creator, without the browser.
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { addGenerateCommand } from './generate.js';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

function createProgram() {
  const program = new Command('chroma-puzzle')
    .description('Make chroma puzzles from the command line')
    .version(version)
    .showHelpAfterError('(add --help for additional information)');
  addGenerateCommand(program);
  return program;
}

/** Runs the command line; a failure is reported and sets a failing exit code. */
export async function run(argv = process.argv) {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
