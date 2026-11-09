// Acceptance 2 (section 11): stream ownership at crossings and confluences.
// Node judges: a crossing shows the front lumen's stream only (C with D); a confluence blends its members' streams with weights that sum to
// one (D's vecBloodMix, C's weights). On the devices: a crossing A names, and the portal confluence.
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

test('the contract carries the numbers this point reads', () => {
  for (const k of ['K_JOIN', 'K_CROSS', 'K_CROSSTIER', 'MAX_MEMBERS', 'SLOTS', 'MAX_JOINS']) assert.equal(typeof C[k], 'number', k);
  assert.ok(C.SLOTS <= C.MAX_MEMBERS, 'a pixel keeps no more members than a region lists');
});

const cross = await needs([['C', 'vec-region-glsl.js', ['vecRegionFS']], ['D', 'vec-blood-math.js', []]]);
test('crossing: the visible stream is the front lumen\'s only, never a mix of the two', { skip: cross.skip }, () => {
  assert.fail('Phase 3: C\'s crossing rule picks the front member by tier and z; D\'s math returns that one stream');
});

const join = await needs([['D', 'vec-blood-glsl.js', ['VEC_BLOOD_GLSL']], ['D', 'vec-blood-math.js', []]]);
test('confluence: each member\'s stream is sampled in its own coordinates and the weights sum to one for any flow direction', { skip: join.skip }, () => {
  assert.fail('Phase 3: vecBloodMix weights over random member sets and flow directions sum to 1');
});
