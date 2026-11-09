// Acceptance 4 (section 11): stable streaks in a slow pinch and pan.
// Node judges (D): the fine octave's share falls smoothly to nothing as the footprint passes 1.5 texels (no step), and the vessel
// coordinates (s, y) of a world point do not change with the camera. On the devices: a slow pinch through the point where streaks pass a pixel.
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
test('footprint attenuation is smooth: sweeping the footprint from 0 to 3 texels, no two neighbouring samples differ by a step', { skip: d.skip }, () => {
  assert.fail('Phase 3: sweep the mirror\'s fine-octave weight over footprints and bound its slope; it is 1 at 0.5 texels and 0 from 1.5');
});
test('the vessel coordinates (s, y) of a world point are the same under any pan and any pinch', { skip: d.skip }, () => {
  assert.fail('Phase 3: random cameras, same world point, same (s, y) to the last bit');
});
