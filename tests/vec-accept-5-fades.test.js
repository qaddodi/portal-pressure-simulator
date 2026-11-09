// Acceptance 5 (section 11): fades and selection without double-darkening.
// Node judges (C's JS mirror of the tier and group compositing, accN and accT): a faded network over two overlapping vessels gives the
// group's alpha once, and the selected vessel's own share lies over the group. On the devices: select a vessel over another.
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

const c = await needs([['C', 'vec-region-glsl.js', ['vecRegionFS']]]);
test('a faded network over two overlapping vessels is the group\'s alpha once, not the product of two', { skip: c.skip }, () => {
  assert.fail('Phase 3: composite two overlapping vessels with netAlpha a: the overlap\'s alpha equals a, and the same vessels apart give a as well');
});
test('a selected vessel over another keeps its own share over the faded group', { skip: c.skip }, () => {
  assert.fail('Phase 3: the selected vessel\'s colour over the group is the same inside and outside the overlap');
});
