// The a, S, v and D letters on the hepatic vein Doppler must read clearly against the card text (about 16 px) and
// stay clear of the edges: their size and the edge margins come from one constant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');

test('wave letters are big enough, and the margins follow their size', () => {
  const px = Number(src.match(/const WAVE_PX = (\d+)/)?.[1]);
  assert.ok(px >= 18, `wave letters are ${px}px`);
  assert.match(src, /FONT\(700, WAVE_PX\)/);
  assert.match(src, /up \? WAVE_PX \+ 1 : 0/);
  assert.match(src, /up \? 0 : WAVE_PX \+ 1/);
});
