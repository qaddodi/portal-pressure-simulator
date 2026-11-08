// The paper gap where vessels of one tier cross (veins-gl.js, V2) is parked on every look (Mohammad, 8 Nov 2026): it cut a vessel round the end of one that
// joins it (the hepatic veins into the IVC) and on the dark looks the black ground made the cut a black cap. It comes back only with the joins listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokensOfLook, LOOK_IDS } from '../src/ui/theme-tokens.js';

test('the crossing gap is off on every look', () => {
  for (const id of LOOK_IDS) assert.equal(tokensOfLook(id)['vessel-knock-a'], '0', id);
});

test('the vessel look reads the token', () => {
  const src = readFileSync(new URL('../src/ui/stage-vessels.js', import.meta.url), 'utf8');
  assert.match(src, /lookRgba\(vl\.paper, toRGB\('var\(--stage-bg\)', cs\), cssNum\(cs, '--vessel-knock-a', 1\)\)/);
});
