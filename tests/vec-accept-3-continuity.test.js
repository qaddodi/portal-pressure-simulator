// Acceptance 3 (section 11): continuous blood through speed change and reversal.
// Node judges (D's vec-blood-math.js, the JS mirror of the GLSL arithmetic): the stream's travelled distance has no jump across a speed
// step, a beat, a re-anchor or a reversal (REVERSE_SETTLE, REVERSE_HOLD). On the devices: a TIPS slide, and a reversal slide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

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

const d = await needs([['D', 'vec-blood-math.js', []], ['D', 'vec-blood-glsl.js', ['VEC_BLOOD_GLSL']]]);
for (const what of ['a speed step', 'a beat', 're-anchor', 'a reversal']) {
  test(`the stream's distance is continuous across ${what}`, { skip: d.skip }, () => {
    assert.fail(`Phase 3: step the mirror's clock across ${what} in small increments and bound the change in distance by the speed times the step`);
  });
}
