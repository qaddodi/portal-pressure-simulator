// Acceptance 6 (section 11): sustained pacing after warm-up.
// Node judges (E, on the warm harness's do-nothing WebGL, as scripts/stage-trace.mjs uses): one render pass for each frame kind, no
// framebuffer bind inside it, a blood-only frame draws only lumen programs, and a frame allocates nothing. On the devices: ten minutes on
// the Mac and the iPhone with ?perf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as C from '../src/ui/vec-contract.js';

// What each check waits for: a workstream's file that is not in the tree yet (or lacks the export named). While anything is missing the
// check is skipped, and the skip says what for, so a plain `npm test` shows what is left (plan 9.J, Phase 1). A file present with its
// exports means its inputs have landed: Phase 3 replaces each skip with the real judgement (the assert.fail below says what it judges).
const UI = new URL('../src/ui/', import.meta.url);
async function needs(list) {
  const lack = [], mods = {};
  for (const [who, file, names] of list) {
    if (!existsSync(new URL(file, UI))) { lack.push(`${who}: ${file}`); continue; }
    mods[file] = await import(new URL(file, UI).href);
    const no = names.filter((n) => !(n in mods[file]));
    if (no.length) lack.push(`${who}: ${file} to export ${no.join(', ')}`);
  }
  return { mods, skip: lack.length ? `waits for ${lack.join('; ')}` : 'its inputs have landed; J writes this check next (Phase 3)' };
}

test('the contract names the three frame kinds this point counts passes for', () => {
  assert.deepEqual([C.V_FULL, C.V_BASE, C.V_BLOOD], [0, 1, 2]);
});

const e = await needs([['E', 'vec-renderer.js', ['createVecRenderer']], ['E', 'vec-frame.js', []], ['E', 'vec-targets.js', []]]);
for (const kind of ['FULL', 'BASE', 'BLOOD']) {
  test(`a ${kind} frame is one render pass with no framebuffer bind inside it`, { skip: e.skip }, () => {
    assert.fail(`Phase 3: draw a ${kind} frame on the do-nothing WebGL and count bindFramebuffer calls between the pass's first and last draw`);
  });
}
test('a blood-only frame draws only lumen programs, and the frame where motion ends writes the base once', { skip: e.skip }, () => {
  assert.fail('Phase 3: record the programs used by a V_BLOOD frame, then end a motion and count the base writes');
});
test('a frame allocates nothing: buffers are made once and written in place (scripts/frame-alloc.mjs rules)', { skip: e.skip }, () => {
  assert.fail('Phase 3: run a warm frame twice and compare the typed arrays and objects the renderer holds');
});
