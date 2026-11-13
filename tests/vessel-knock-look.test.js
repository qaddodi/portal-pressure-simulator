// The paper gap where vessels of one tier cross (veins-gl.js, V2) is parked on every look (Mohammad, 8 Nov 2026): it cut a vessel round the end of one that
// joins it (the hepatic veins into the IVC) and on the dark looks the black ground made the cut a black cap. It comes back only with the joins listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokensOfLook, LOOK_IDS } from '../src/ui/theme-tokens.js';

test('the crossing gap is off on every look', () => {
  for (const id of LOOK_IDS) assert.equal(tokensOfLook(id)['vessel-knock-a'], '0', id);
});
// (The vessel look reads the token: a rule in scripts/source-shapes/b.mjs.)
