import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { directReads, readRatchet, readAllowance } from '../scripts/off-gpu-scan.mjs';

// Two gates of `npm run lint` that other threads' merges broke on 19 Nov 2026 with nothing in the unit shards to say so (24 wording hits, 12 files over their layout-read
// allowance). They run here too, so a merge that breaks one turns the unit tests red. (tests/rules-lint-clean.test.js does the same for the rules.)
const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('clinical wording: no string a learner reads breaks a wording rule (docs/ai-humanizer.md section 6)', () => {
  const r = spawnSync(process.execPath, ['scripts/clinical-wording.mjs', '--list'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 << 20 });
  const hits = r.stdout.split('\n').filter((l) => /^\S+:\d+\s+\S+: "/.test(l));
  assert.deepEqual(hits, [], `${hits.length} wording hit(s):\n${hits.join('\n')}`);
});

test('layout reads: no file reads the page geometry directly more often than its allowance, and none fewer (lower the allowance when a read moves)', () => {
  const { over, under } = readRatchet(directReads({ root: ROOT }), readAllowance({ root: ROOT }));
  assert.deepEqual(over, [], 'a read added outside src/ui/layout-snap.js: use readBox, readStyle or readMetric');
  assert.deepEqual(under, [], 'a read moved: lower its allowance in scripts/layout-read-allowance.json');
});
