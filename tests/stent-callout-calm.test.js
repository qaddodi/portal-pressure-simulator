// A TIPS or DIPS velocity callout waits until the stent has grown in and its flow has settled (Mohammad, 14 Oct):
// while it draws on, widens, or the presenter's morph eases the model, the reading swings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the stent callout is held while the stent grows or the model morphs', async () => {
  const stage = await readFile(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const core = await readFile(new URL('../src/worker-core.js', import.meta.url), 'utf8');
  assert.match(core, /morphing: !!morph,/);
  const fn = stage.slice(stage.indexOf('function stentReady'), stage.indexOf('function labelSig'));
  for (const k of ['x.reveal', 'f.morphing', 'x.width !== x.wT', 'STENT_CALM_MS']) assert.ok(fn.includes(k), k);
  assert.match(stage, /if \(stentReady\(sid, f\) && EI\[sid\] >= 0\)/);
  assert.match(stage, /edges, \['TIPS', 'DIPS'\]\.map\(\(id\) => \+stentReady\(id, f\)\)/, 'the layout runs again when the callout may show');
});
