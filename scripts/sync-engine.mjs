// The engine's home is its own repository, qaddodi/hales-engine. src/engine/ is a vendored copy of that repository's src/ (core/ and portal/),
// pinned to one commit and described by src/engine/VENDORED.json (the repository, the ref asked for, the commit, and a sha256 for every file).
// Nothing here edits src/engine/ by hand: change the engine in hales-engine, tag it, then sync. Why a copy and not a git dependency:
// docs/engine-vendoring.md.
//
//   node scripts/sync-engine.mjs --ref <tag|commit>        replace src/engine/ with that version of hales-engine and rewrite the manifest
//   node scripts/sync-engine.mjs --ref <ref> --from <dir>  the same, from a local checkout or clone of hales-engine (offline, or an unpushed commit)
//   node scripts/sync-engine.mjs --check                   offline: the files match the manifest (the unit test and `npm run check:engine` run this)
//
// Syncing needs read access to the repository (it is private): the owner's own git credentials, or the session's.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(ROOT, 'src/engine');
const MANIFEST = 'VENDORED.json';
export const REPO = 'https://github.com/qaddodi/hales-engine';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out;
}
const hashes = (dir, skip = '') => Object.fromEntries(listFiles(dir).filter((f) => f !== skip).map((f) => [f, sha(readFileSync(join(dir, f)))]));

/** The problems with src/engine/ against its manifest (empty when the copy is exactly what the manifest says). */
export function checkVendored(dest = DEST) {
  const problems = [];
  const mf = join(dest, MANIFEST);
  if (!existsSync(mf)) return [`${MANIFEST} is missing: run node scripts/sync-engine.mjs --ref <tag>`];
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  if (!/^[0-9a-f]{40}$/.test(m.commit || '')) problems.push('the manifest names no commit of hales-engine');
  const have = hashes(dest, MANIFEST);
  for (const f of Object.keys(m.files)) if (!(f in have)) problems.push(`${f} is in the manifest but not in src/engine/`);
  for (const f of Object.keys(have)) {
    if (!(f in m.files)) problems.push(`${f} is in src/engine/ but not in the manifest`);
    else if (have[f] !== m.files[f]) problems.push(`${f} differs from hales-engine ${m.commit.slice(0, 8)}`);
  }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
  if (args.includes('--check')) {
    const problems = checkVendored();
    if (problems.length) {
      console.error('src/engine/ is not the pinned copy of hales-engine:\n  ' + problems.join('\n  ') + '\nChange the engine in hales-engine, tag it, and run: node scripts/sync-engine.mjs --ref <tag>');
      process.exit(1);
    }
    const m = JSON.parse(readFileSync(join(DEST, MANIFEST), 'utf8'));
    console.log(`src/engine/ is hales-engine ${m.ref} (${m.commit.slice(0, 8)}), ${Object.keys(m.files).length} files, all match the manifest.`);
    return;
  }
  const ref = arg('--ref');
  if (!ref) { console.error('Usage: node scripts/sync-engine.mjs --ref <tag|commit> [--from <local hales-engine checkout>] | --check'); process.exit(2); }
  const from = arg('--from');
  const tmp = mkdtempSync(join(tmpdir(), 'hales-engine-'));
  try {
    const git = (...a) => execFileSync('git', a, { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
    execFileSync('git', ['clone', '--quiet', '--no-checkout', from ? resolve(from) : REPO + '.git', tmp], { stdio: ['ignore', 'inherit', 'inherit'] });
    git('-c', 'advice.detachedHead=false', 'checkout', '--quiet', ref);
    const commit = git('rev-parse', 'HEAD');
    const src = join(tmp, 'src');
    if (!existsSync(join(src, 'portal/engine.js'))) throw new Error(`hales-engine ${ref} has no src/portal/engine.js`);
    rmSync(DEST, { recursive: true, force: true });
    mkdirSync(DEST, { recursive: true });
    cpSync(src, DEST, { recursive: true });
    const files = hashes(DEST);
    writeFileSync(join(DEST, MANIFEST), JSON.stringify({ repo: REPO, ref, commit, files }, null, 1) + '\n');
    console.log(`Synced src/engine/ from hales-engine ${ref} (${commit.slice(0, 8)}): ${Object.keys(files).length} files.`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
