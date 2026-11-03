// The gate's static checks (scripts/gate.mjs), no browser: they take a second or two.
//
//   markers   a git conflict marker left in any file git tracks (or would add): 3207b43b and the stage.js break of 31 Oct shipped one.
//   bundle    the app and the engine worker bundle with esbuild, as scripts/build.mjs bundles them. A named import the module does not
//             export, a file that does not exist, a syntax error and an import that is always undefined all fail here, the way
//             e3946da6 (MAY_ON, 2 Nov: the page did not start) and c3fb93ed (an emptied glass-gl.js) did.
//
// As a module: import { findMarkers, checkBundle } from './gate-static.mjs'.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Code and data files: all three marker kinds. Prose files: only the two with a branch name after them (a line of === under a heading is Markdown).
const CODE = /\.(m?js|cjs|css|html|json|webmanifest|ya?ml|py|svg)$/i;
const PROSE = /\.(md|txt)$/i;
const OPEN = new RegExp('^' + '<'.repeat(7) + '( |$)'), CLOSE = new RegExp('^' + '>'.repeat(7) + '( |$)'), MID = new RegExp('^' + '='.repeat(7) + '\\s*$');

/** [{ file, line, text }] for each conflict marker line in `text` (a file's contents) named `file`. */
export function markersIn(file, text) {
  const out = [];
  const code = CODE.test(file), prose = PROSE.test(file);
  if (!code && !prose) return out;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (OPEN.test(l) || CLOSE.test(l) || (code && MID.test(l))) out.push({ file, line: i + 1, text: l.slice(0, 60) });
  }
  return out;
}

/** The files git tracks and the ones it would add (not ignored), as paths relative to the repository. */
export function repoFiles(cwd = ROOT) {
  const run = (...a) => execFileSync('git', a, { cwd, maxBuffer: 64 << 20 }).toString().split('\0').filter(Boolean);
  return [...new Set([...run('ls-files', '-z'), ...run('ls-files', '-z', '--others', '--exclude-standard')])];
}

/** Every conflict marker in the repository's files: [{ file, line, text }]. */
export function findMarkers(cwd = ROOT) {
  const bad = [];
  for (const f of repoFiles(cwd)) {
    if (!CODE.test(f) && !PROSE.test(f)) continue;
    let text;
    try { text = readFileSync(join(cwd, f), 'utf8'); } catch { continue; }   // (deleted in the working tree)
    bad.push(...markersIn(f, text));
  }
  return bad;
}

// The bundler's way in: source imports carry cache stamps (./x.js?v=hash), which in a bundle are just files (scripts/build.mjs).
const stripStamps = {
  name: 'strip-stamps',
  setup(b) { b.onResolve({ filter: /\?v=/ }, (args) => ({ path: resolve(args.resolveDir, args.path.replace(/\?v=[0-9a-f]+$/, '')) })); },
};

/** Bundles the app's and the worker's entries in memory. Returns the problems found: [{ where, text }]. */
export async function checkBundle(cwd = ROOT) {
  const problems = [];
  for (const entry of ['src/ui/main.js', 'src/worker.js']) {
    try {
      const r = await esbuild({ entryPoints: [join(cwd, entry)], bundle: true, write: false, format: 'esm', target: ['es2022'], splitting: false, logLevel: 'silent', plugins: [stripStamps], outdir: join(cwd, 'dist-gate-unused') });
      for (const w of r.warnings) if (w.id === 'import-is-undefined') problems.push({ where: `${w.location?.file ?? entry}:${w.location?.line ?? 0}`, text: w.text });
    } catch (e) {
      for (const m of e.errors || [{ text: e.message }]) problems.push({ where: `${m.location?.file ?? entry}:${m.location?.line ?? 0}`, text: m.text });
    }
  }
  return problems;
}
