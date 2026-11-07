import { stageSource } from './stage-src.js';
// `gl-on` and `gl-plate` follow the GPU's state by what it tells the stage, not by a write in every sync (3 Nov 2026). The browser walk
// (tests/e2e/gl-classes.mjs) samples them frame by frame through load, slide changes, resizes and a lost context; this pins the wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const sync = stage.slice(stage.indexOf('  function syncVeinsNow(t) {'), stage.indexOf('  function syncVeinsNow(t) {') + 1800);

test('gl-on is set when the GPU is made or comes back and taken off when its context is lost: no write in the sync', () => {
  assert.doesNotMatch(sync, /classList\.toggle\('gl-on'/, 'the sync does not write gl-on');
  assert.match(stage, /if \(veins\) \{\n\s+wrap\.classList\.add\('gl-on'\);/, 'set where the GPU is made');
  assert.match(stage, /webglcontextlost', \(\) => \{\n\s+wrap\.classList\.remove\('gl-on'\);/, 'taken off at the loss');
  assert.match(stage, /wrap\.classList\.add\('gl-on'\); plateDirty = true;/, 'set again where it is restored');
});

test('gl-plate is written in the sync only when the GPU said the whole plate came or went, or a class was set by hand', () => {
  assert.match(sync, /if \((?:live\.)?(?:live\.)?plateDirty\) \{ (?:live\.)?(?:live\.)?plateDirty = false; wrap\.classList\.toggle\('gl-plate', (?:live\.)?(?:live\.)?veins\.hasPlate\(0\)\); \}/);
  assert.equal((stage.match(/onPlate: \(\) => \{ plateDirty = true; \}/g) || []).length, 2, 'told by the first GPU and by the one made on a restore');
  // Every place that sets the class by hand marks it to be looked at again (the sync reconciles it with what the GPU holds).
  for (const m of stage.matchAll(/wrap\.classList\.remove\('gl-plate'\)[^\n]*/g)) {
    const at = stage.indexOf(m[0]);
    assert.match(stage.slice(at - 160, at + m[0].length + 200), /plateDirty = true/, `a hand-removed gl-plate asks to be looked at again: ${m[0].slice(0, 60)}`);
  }
});

test('the GPU tells the stage in the call that changes whether it holds the plate', () => {
  assert.match(veins, /const notePlate = \(\) => \{ const h = !!plates\[0\] \|\| !!stack\?\.has\(0\); if \(h !== plateSeen\) \{ plateSeen = h; onPlate\?\.\(h\); \} \};/);
  for (const call of [/stack\?\.drop\(slot\);\n\s+notePlate\(\);/, /stack\?\.drop\(slot\); notePlate\(\); \},/, /stack\.commit\(slot, names\);\n\s+notePlate\(\);/, /setLive\(organs, masks\) \{ texVer\+\+; const r = stack\.setLive\(organs, masks\); notePlate\(\); return r; \}/, /setLiveAll\(organs\) \{ texVer\+\+; const r = stack\.setLiveAll\(organs\); notePlate\(\); return r; \}/]) {
    assert.match(veins, call);
  }
});
