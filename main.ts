// NOVA SWARM — the hand-in entrypoint.
//
// What it does, nothing more: copy game/ and screenshots/ from beside this
// file into the output directory, then write dossier.json there with the
// vendored make.fun library. The output directory is /output inside the
// grader and MAKEFUN_OUTPUT_DIR anywhere else.
//
// The output directory is never emptied or deleted here: in the grader it
// is a Docker volume mount, and deleting a mount point fails with
// "Device or resource busy" and kills the whole run. The copies below
// overwrite what is already there, which is all the freshness the run
// needs. Two runs still write the same bytes, because a plain copy plus
// a pure buildDossier is deterministic.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the dossier bytes; the rest refuse an entry the scorer would refuse —
// more than 4 screenshots or one over 256 KiB, more than 993 files in
// game/ or 48 MiB of game files in all, or a game path over 1000 bytes
// (game/ counts beside /output's own 1000-entry cap, its screenshots/
// and dossier.json).
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, CAPS));
