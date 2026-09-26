// Home shows each patient's pressure profile from src/ui/snapshots.js; it must match the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('patient snapshots match the model', () => {
  const r = spawnSync(process.execPath, ['scripts/snapshots.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
