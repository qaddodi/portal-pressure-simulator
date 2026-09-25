// Every local URL must carry the current content hash (see scripts/stamp.mjs), or a browser can
// mix freshly deployed files with stale cached ones. Run `npm run stamp` after editing any file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('cache-busting stamps are current', () => {
  const r = spawnSync(process.execPath, ['scripts/stamp.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
