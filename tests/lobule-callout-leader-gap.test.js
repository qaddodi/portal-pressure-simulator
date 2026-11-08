// The lesion pointer's leader stops short of the word's letters (8 Nov 2026: "the word Resistance should sit above the callout
// line"): it never runs in under the outlined text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leaderEnd } from '../src/ui/leader-end.js';

test('the callout leader ends a gap below the letters of a word standing above its ring', () => {
  const PAD = [10, 10, 4, 5], GAP = 7, w = 100, hh = 28, bx = 200, by = 100, a = [200, 220];   // (the ring's centre straight below the pill)
  const ink = { x0: bx - w / 2 + PAD[0] - GAP, x1: bx + w / 2 - PAD[1] + GAP, y0: by - hh / 2 + PAD[2] - GAP, y1: by + hh / 2 - PAD[3] + GAP, r: 0 };
  const e = leaderEnd(ink, a[0], a[1]);
  const lettersBottom = by + hh / 2 - PAD[3];
  assert.ok(Math.abs(e.y - (lettersBottom + GAP)) < 1e-9, `ends ${e.y - lettersBottom}px below the letters`);
  assert.equal(e.x, 200);
});

test('lobule-zoom ends the pointer leader on the letters box grown by a gap, not at the pill\'s middle', () => {
  const js = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(js, /const le = leaderEnd\(ink, a\[0\], a\[1\]\);/);
  assert.match(js, /setGeo\(callLine, 'x2', ex\); setGeo\(callLine, 'y2', ey\)/);
  assert.doesNotMatch(js, /setGeo\(callLine, 'x2', bx\)/, 'the leader no longer runs to the pill\'s middle');
});
