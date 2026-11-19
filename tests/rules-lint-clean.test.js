import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The rules (scripts/rules-lint.mjs: the source-shape pins, the test classifier and its freeze list, the switches list, the line
// caps, the timers' budget) stood red from about 17 Nov 2026 to 19 Nov 2026 with nothing in the unit shards to say so, because only
// `npm run lint` ran them and a red lint blocks no push. Running them here puts a broken rule into the same red the unit tests give.
// The run is the real script, as `npm run lint` runs it; it fails with the rules' own messages.
test('rules-lint reports no error: every rule, pin and listed test holds', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const r = spawnSync(process.execPath, ['scripts/rules-lint.mjs'], { cwd: root, encoding: 'utf8', maxBuffer: 16 << 20 });
  const errors = `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => /^rules-lint: (?!ok)/.test(l));
  assert.deepEqual(errors, [], `${errors.length} rules-lint error(s):\n${errors.join('\n')}`);
  assert.equal(r.status, 0, `rules-lint exited ${r.status}`);
  assert.match(r.stdout + r.stderr, /rules-lint: ok/);
});
