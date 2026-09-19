---
name: chroma-puzzle
description: Generates chroma puzzles with this repository's command line — an image split into shuffled, semi-transparent colour plates plus decoys, where only the right set of plates stacks back into the picture. Use when asked to make, batch-produce or tune a chroma puzzle (or a plate or colour-separation puzzle) from an image, to set how hard it is (plates, decoys, occlusion, cipher), to reuse or save a chroma-preset.json config, or to make a puzzle again from its seed.
compatibility: Requires Node.js 22.12 or later and `npm install` in the ChromaPuzzle repository, which fetches sharp's native binary.
---

# Making chroma puzzles

`node bin/chroma-puzzle.js generate <image>` writes a puzzle ZIP: shuffled
plate PNGs plus `puzzle.json`. The real plates add back up to the image, or wrap
back to it when ciphered. Decoys are wrong versions of the image put through the
same pipeline, so only the stack gives them away. The ZIP loads into the app's
Solver (`chroma-puzzle.html` after `npm run build`, or
https://svanschooten.github.io/ChromaPuzzle/), which says when the enabled
plates are the right set.

## Setup

Run everything from the repository root. Once per checkout:

```bash
npm install
```

Call the CLI through `node`, so relative paths resolve from where you are.
`node bin/chroma-puzzle.js generate --help` lists every flag with its range and
default.

## Workflow

Copy this checklist and tick it off:

```
- [ ] 1. Settings chosen for what the puzzle is for
- [ ] 2. Generated, with the answer written outside what gets shared
- [ ] 3. Every warning dealt with
- [ ] 4. Contact sheet checked: difficulty is what was asked for
- [ ] 5. Reported: puzzle path, seed or config, answer path
```

**1. Choose settings.** Start from the closest [recipe](#recipes) and adjust.
When the user has a config file (the app's **Save settings** writes
`chroma-preset.json`), pass it with `-c` and put only their changes in flags.

**2. Generate.** Write the output where the user wants it; next to the source
image is a good default, not inside this repository.

```bash
node bin/chroma-puzzle.js generate ~/Pictures/beach.jpg -o ~/Pictures/beach-puzzle.zip --answer ~/Pictures/beach-answer.json -n 4 -d 3 --space spectrum --split weighted --occlusion blend
```

stdout starts with a summary, then names each other file written:

```
Wrote /home/me/Pictures/beach-puzzle.zip: 4 chroma plates + 3 decoys at 2048×1536, seed 1234567890
Wrote /home/me/Pictures/beach-answer.json
```

Progress and `warning:` lines go to stderr. Exit status 1 means the run failed,
and the message says why; an invalid option stops it before anything is
written. Add `--save-config <file>` when the user may want the same settings
again, and `--json` to get `puzzle.json` on stdout instead of the summary.

**3. Deal with warnings.** Each one means the puzzle differs from what was asked
for; see [Warnings](#warnings). Change the settings and run again. The CLI
never overwrites without `--force`; only use it on files this task created.

**4. Check the plates.** Build a contact sheet and look at it:

```bash
node .claude/skills/chroma-puzzle/scripts/contact-sheet.mjs ~/Pictures/beach-puzzle.zip ~/Pictures/beach-sheet.png --answer ~/Pictures/beach-answer.json
```

It tiles every plate in filename order over black, as the Solver shows them.
With `--answer`, real plates get a green frame and decoys a red one, and a
white-framed last tile shows the real plates stacked; it must show the image.
The script refuses an answer file from another puzzle. Its JSON gives each
tile's file, role and pixel box, for cropping one plate to look closer.

Judge the sheet against the request:

- Every plate shows the picture's outlines unless `--cipher` is on. Occlusion
  breaks up colour and detail; it cannot remove shapes. So an additive puzzle is
  hard when real plates and decoys look alike, not when the picture is hidden.
- A decoy that stands out (bent lines, a colour no real plate has) makes the
  puzzle easier: lower `--decoy-intensity`, or use `--decoy-mode drift`.
- Plates that look nearly black: see the nearly-empty warning below.

With `--answer`, the sheet gives the solution away just like the answer file;
without it, the sheet is a safe preview to share.

**5. Report.** Say where the puzzle and the answer file are, and give the seed
or the saved config. Do not paste `realPlates` anywhere the solver will see.

## Recipes

| Goal                    | Flags                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Gentle, solvable by eye | `-n 3 -d 1 --decoy-intensity 1`                                                                       |
| Medium                  | `-n 4 -d 3 --space spectrum --split weighted --occlusion blend`                                       |
| Hard                    | `-n 6 -d 4 --space cells --split weighted --occlusion fracture --shard-size 16 --decoy-intensity 0.3` |
| Trial and error         | `-n 4 -d 4 --cipher 1`                                                                                |

What the settings do:

- **`-n` plates, `-d` decoys.** The solver has to pick the `-n` real plates out
  of all of them. More of either is harder, and bigger.
- **`--space`.** `channels` (default) gives tonal slices of R, G and B. Beyond
  three plates that means dark reds on one plate, bright reds on the next.
  `spectrum` gives hue arcs and spreads evenly over any plate count. `cells`
  sorts pixels by hue × chroma × value (`--hue-classes` and the rest; 1 turns an
  axis off). `--hard-cells` cuts the picture into flat regions of colour.
- **`--split weighted`.** Places cuts so each plate carries an equal share of
  the image. Use it with `spectrum` and `cells`, where `linear` can leave plates
  nearly empty. `manual` takes cuts from `--red-cuts`, `--hue-cuts` and so on.
- **`--weave`** (channels and spectrum only). Deals thin slices round the plates,
  so each plate gets a comb of tones instead of one block.
- **`--decoy-mode`.** `drift` (default) shifts colours and keeps every shape
  where it is, so it hides well. `warp` swirls, ripples or pinches the image,
  which shows on a single plate wherever the picture has straight lines, text
  or faces. `--decoy-intensity` runs 0.05–1: lower is subtler.
- **`--occlusion`.** Breaks each plate into pieces that only add up across the
  stack, which still comes out exact. `fracture` makes stained-glass shards
  (`--shard-size`); `blend` soft islands (`--island-size`); `noise` per-pixel
  static; `screen` a dither (`--dot-size`). `--occlusion-strength` sets how far
  it goes. Black has nothing to share out, so silhouettes always survive.
- **`--cipher`.** Plates carry noise that cancels modulo 256. Above 0 only this
  app's Solver can stack them; it switches over by itself. At 1 every plate is
  uniform static and any incomplete stack shows nothing, so keep plate counts
  low: solving means trying combinations.
- **`--opacity`** below 1 gives a glass look but clips highlights, so the stack
  is no longer exact. Leave it at 1 unless asked.

## Warnings

| stderr says                                                       | Do                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `… nearly empty — try …`                                          | Apply what it lists, starting with the change the user minds least       |
| `--flag has no effect: it only applies with …`                    | Add the setting it names, or drop the flag                               |
| `… did not fit the plan; used …` or `… evenly spaced`             | Manual cuts were adjusted: pass as many as the "used" list, or drop them |
| `<config>: … out of range, using …` or `… ignored: …`             | The run used corrected values; fix the config file                       |
| `… is inside the puzzle: whoever gets the puzzle gets the answer` | Write `--answer` outside the `--dir` output                              |

A nearly empty plate carries almost no light, so nobody can tell it apart from
another one by looking. It comes from flat colour: hard cells or many plates on
artwork with few distinct colours leave bands with nothing in them. Any
`--occlusion` mode clears it, because occlusion shares every band over all the
plates; fewer plates, `spectrum` or `channels` usually do too; `--split
weighted` and soft cells only help. Raising the cell classes does not: a flat
patch of colour stays one cell however finely the axes are cut, and more
classes can empty more plates.

## Gotchas

- `npm run cli -- …` runs from the repository root whatever directory you call
  it from, so relative image paths break. Use `node bin/chroma-puzzle.js`.
- If sharp fails to load, run `npm install` on this machine: its binary is built
  per platform, and a `node_modules` copied from elsewhere will not work.
- The answer file and the seed each give the puzzle away (the seed decides the
  shuffle). `puzzle.json` holds neither; keep both out of anything shared.
- `puzzle.json`'s `solutionHash` is a check, not a lock. `numRealPlates` sits
  next to it, so a small puzzle can be brute-forced. Do not promise more.
- `--force` on a `--dir` output first deletes the old `plate_*.png` and
  `puzzle.json` there; other files stay.
- Sources are scaled to 2048 px on the long edge. Occluded or ciphered plates
  are noise and hardly compress: roughly 3–10 MB per plate at that size.
  `--max-size 1024` makes them a quarter of that, for something to email.
- At 2048 px a run takes seconds without occlusion and 15–60 s with it. Time
  grows with plates² under occlusion, and the printed estimate can be 2–3× low.
- The same image, settings and `--seed` make the same plates in the same order.
