// The paper gap where vessels of one tier cross (veins-gl.js, V2) is a paper convention: on the dark looks the ground is black, so the gap and the casing
// across it read as black outlines (Mohammad, 8 Nov 2026). It is on for the light looks and off for Dark, Navy and Black.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokensOfLook, LOOK_IDS } from '../src/ui/theme-tokens.js';

test('the crossing gap is on for the light looks and off for the dark ones', () => {
  for (const id of LOOK_IDS) {
    const dark = id === 'dark' || id === 'navy' || id === 'black';
    assert.equal(tokensOfLook(id)['vessel-knock-a'], dark ? '0' : '1', id);
  }
});

test('the vessel look reads the token', () => {
  const src = readFileSync(new URL('../src/ui/stage-vessels.js', import.meta.url), 'utf8');
  assert.match(src, /lookRgba\(vl\.paper, toRGB\('var\(--stage-bg\)', cs\), cssNum\(cs, '--vessel-knock-a', 1\)\)/);
});
