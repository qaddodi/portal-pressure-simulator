import { stageSource } from './stage-src.js';
// A TIPS or DIPS velocity callout waits until the stent has grown in and its flow has settled (Mohammad, 14 Oct):
// while it draws on, widens, or the presenter's morph eases the model, the reading swings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the stent callout is held while the stent grows or the model morphs', async () => {
  const stage = stageSource();
  const core = await readFile(new URL('../src/worker-core.js', import.meta.url), 'utf8');
  assert.match(core, /morphing: !!(?:live\.)?(?:live\.)?morph,/);
  const fn = stage.slice(stage.indexOf('function stentReady'), stage.indexOf('function labelSig'));
  for (const k of ['x.reveal', 'f.morphing', 'x.width !== x.wT', 'STENT_CALM_MS']) assert.ok(fn.includes(k), k);
  assert.match(stage, /if \(stentReady\(sid, f\) && EI\[sid\] >= 0\)/);
  // (R04: read once per call, and part of the signature's dependencies, so the layout runs again when the callout may show.)
  assert.match(stage, /const tips = \+stentReady\('TIPS', f\), dips = \+stentReady\('DIPS', f\);/);
  assert.match(stage, /d\[15\] = tips; d\[16\] = dips;/);
  assert.match(stage, /edges, `\$\{tips\}\$\{dips\}`/, 'the layout runs again when the callout may show');
});
