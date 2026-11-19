// src/engine/ is a vendored copy of qaddodi/hales-engine, pinned to one commit by src/engine/VENDORED.json. Nobody edits the copy in place:
// the engine changes in hales-engine and is synced (scripts/sync-engine.mjs, docs/engine-vendoring.md). This fails when the files and the
// manifest disagree, which is what a hand edit looks like.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { checkVendored } from '../scripts/sync-engine.mjs';

test('src/engine/ is exactly the pinned copy of hales-engine', () => {
  assert.deepEqual(checkVendored(), [], 'change the engine in hales-engine, tag it, then: node scripts/sync-engine.mjs --ref <tag>');
});

test('the copy has the core and portal modules, and the app imports nothing from the engine that is not in them', () => {
  for (const f of ['core/linalg.js', 'core/physiology.js', 'core/gap.js', 'portal/engine.js', 'portal/topology.js', 'portal/scenario.js']) assert.ok(existsSync(new URL('../src/engine/' + f, import.meta.url)), f);
  // a flat src/engine/<name>.js import is the layout before the move: it would load nothing
  const worker = readFileSync(new URL('../src/worker-core.js', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /from '\.\/engine\/[a-z-]+\.js'/, 'worker-core imports ./engine/portal/…, not ./engine/…');
});
