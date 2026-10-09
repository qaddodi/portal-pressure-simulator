// Guard: the owner had the outlines along the lobule's sinusoids removed (dark casing rims and the
// thin collagen line that ran on as spokes into the central vein). Keep them out.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');

test('lobule sinusoids draw no casing outline', () => {
  assert.match(src, /SINU = new Set\(\['s0', 's1', 's2', 'an', 'ly'\]\)/);
  assert.match(src, /SINU\.has\(t\.kind\) \? F_NOCASE/);
});

test('no collagen edge line along the sinusoids', () => {
  assert.doesNotMatch(src, /thin continuous collagen line/);
  assert.doesNotMatch(src, /rgba\(232, 196, 140/);
});
