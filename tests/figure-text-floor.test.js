import './dom-shim.js';
// The path figures' text floor (7c, play-test 16 Nov 2026: "The portal circulation" 8/11, the Stages of cirrhosis figure drawn with about 8 px words and
// pale grey stage lines, unreadable on a projector). Root cause: the figure was fitted down to 60% of its size and its smallest roles were 11 px, so words
// came out at 6.6 to 7.2 px, and an unlit word or line was 40% of a grey (the lines the pale border colour). Fixed once, at the source:
// tool-path.js ROLE (every role 12 px or more, FIT_MIN keeps the smallest drawn word at FIG_TEXT_MIN) and chart-looks/path.js (UNLIT, QUIET).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE, FIG_TEXT_MIN, ROLE_MIN, ROLE_SMALL, FIT_MIN } from '../src/ui/tool-path.js';
import { UNLIT } from '../src/ui/chart-looks/path.js';

test("every path-figure role is at least 12 px (the small phone grid's answer and its second line, 11), and a fitted figure never draws a word under FIG_TEXT_MIN", () => {
  for (const [name, r] of Object.entries(ROLE)) assert.ok(r.size >= (ROLE_SMALL.includes(name) ? ROLE_MIN : 12), `${name}: ${r.size} px`);
  const smallest = Math.min(...Object.values(ROLE).map((r) => r.size));
  assert.ok(smallest * FIT_MIN >= FIG_TEXT_MIN - 1e-9, `${smallest} x ${FIT_MIN} = ${smallest * FIT_MIN}`);
  assert.ok(FIG_TEXT_MIN >= 10);
});

test('an unlit word or line keeps at least 70% of its colour (the looks themselves are pinned in scripts/source-shapes/pins-mixed-b.mjs)', () => {
  assert.ok(UNLIT >= 0.7);
});
