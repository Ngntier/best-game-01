// VOIDBLOOM's entrypoint (Node 22, standard library only): the game is the
// static files in game/ beside this file, and the screenshots are in
// screenshots/. This program hands both in. It copies them into the output
// directory and writes dossier.json there with the vendored make.fun library,
// which is the summary the judge reads. Run it locally with:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// In the grader the output directory is /output. The program writes the same
// bytes on every run: it copies files and builds the dossier from them, and
// nothing it does depends on the clock or the machine.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, as the kit's starter passes them: only text_max_bytes
// shapes the dossier's bytes; the rest refuse an entry the scorer would
// refuse (too many screenshots, or one too large; too many game files, or too
// many bytes of them; a game path too long).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

function fail(message: string): never {
  throw new Error(`voidbloom main.ts: ${message}`);
}

const gameDir = join(repoRoot, 'game');
if (!existsSync(gameDir) || !statSync(gameDir).isDirectory()) {
  fail('game/ is missing beside main.ts; nothing to hand in.');
}
const indexHtml = join(gameDir, 'index.html');
if (!existsSync(indexHtml) || !statSync(indexHtml).isFile()) {
  fail('game/index.html is missing; the game has no page to open.');
}
// The screenshots are the judge's first sight of the game: refuse to hand in
// an entry with none, rather than letting the dossier builder say so.
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(shotsDir)) {
  fail('screenshots/ is missing; the entry needs 3-4 renders of the game.');
}
const shotNames = readdirSync(shotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name));
if (shotNames.length === 0) {
  fail('screenshots/ holds no image; the entry needs 3-4 renders of the game.');
}

mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, DOSSIER_CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`VOIDBLOOM handed in: game/ + ${shotNames.length} screenshots, dossier.json ${dossier.length} bytes -> ${outDir}`);
