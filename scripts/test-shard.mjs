// The unit tests in parallel jobs (recs P1/A1): which test files belong to shard i of n.
//
//   node scripts/test-shard.mjs 2/6            prints the files of shard 2 of 6, one per line
//   node scripts/test-shard.mjs --run 2/6      runs them: node --test --test-concurrency=4 <files>
//   node scripts/test-shard.mjs --count        how many test files there are
//
// Files go to the lightest shard, heaviest first (longest-processing-time rule), by the seconds in scripts/test-weights.json (measured: one file alone
// on a 4-core machine). A file with no entry weighs the default below, so a new test file lands somewhere sensible without anyone editing the list;
// an entry for a file that no longer exists is ignored. Every file in tests/*.test.js is in exactly one shard, whatever the weights say.
// (`npm test` still runs them all in one process pool; the workflows use the shards.)

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SECONDS = 2;
const WEIGHTS_FILE = resolve(ROOT, 'scripts/test-weights.json');

export const testFiles = () => readdirSync(resolve(ROOT, 'tests')).filter((f) => f.endsWith('.test.js')).sort().map((f) => `tests/${f}`);

export function shardFiles(i, n, files = testFiles(), weights = existsSync(WEIGHTS_FILE) ? JSON.parse(readFileSync(WEIGHTS_FILE, 'utf8')) : {}) {
  const w = (f) => weights[f] ?? DEFAULT_SECONDS;
  const load = Array(n).fill(0), mine = [];
  for (const f of [...files].sort((a, b) => w(b) - w(a) || a.localeCompare(b))) {
    const k = load.indexOf(Math.min(...load));
    load[k] += w(f);
    if (k === i - 1) mine.push(f);
  }
  return mine.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--count') { console.log(testFiles().length); process.exit(0); }
  const run = args[0] === '--run';
  const spec = args[run ? 1 : 0] || '';
  const m = /^(\d+)\/(\d+)$/.exec(spec);
  if (!m || +m[1] < 1 || +m[1] > +m[2]) { console.error('usage: node scripts/test-shard.mjs [--run] <i>/<n>   (1 <= i <= n)'); process.exit(2); }
  const files = shardFiles(+m[1], +m[2]);
  if (!run) { console.log(files.join('\n')); process.exit(0); }
  console.log(`shard ${spec}: ${files.length} of ${testFiles().length} test files`);
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...files], { stdio: 'inherit', cwd: ROOT });
  process.exit(r.status ?? 1);
}
