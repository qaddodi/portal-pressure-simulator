// The Circuit's readings during a hand's zoom (Mohammad, 26 Oct: "the problem is during the zoom itself it's very very choppy", and
// his pick "Re-place only the bumped reading"): a carried reading that comes onto a station's ring is placed again by itself, the
// others carried; once let go all are solved again. Source patterns (no browser in node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const pm = stage.slice(stage.indexOf('const placeMulti = '), stage.indexOf("if (!circuit) {\n      // ── Anatomy ──"));

test('a reading bumped onto a ring mid-gesture is placed again alone; otherwise the old rule (solve all) stands', () => {
  assert.match(stage, /carryClear = hand; carryReslot = gestureOn\(\);/, 'only while a hand moves the view');
  assert.match(stage, /const solved = solve \|\| layoutLabels\(f, false\) === false;\n\s*carryReslot = false;/);
  // Only one solved beside its station (passes 0-2), not on a vessel, in the stations' first round; else stale as before.
  assert.match(pm, /if \(!carryReslot \|\| prev\.onv \|\| !\(prev\.pi >= 0 && prev\.pi < 3\) \|\| from !== 0 \|\| to > 3\) \{ stale = true; return false; \}/);
  assert.match(pm, /reslot = true;\n\s*if \(!useLines\) \{ useLines = true; buildSegs\(\); \}/, 'searched against the vessels as drawn now');
  // A spot only a whole solve could give (none, on a vessel, on a callout) solves them all.
  assert.match(pm, /if \(reslot && \(!best \|\| lineHits\(best\.r, 2\) \|\| callouts\.some\(\(b\) => hits\(best\.r, b\)\)\)\) \{ stale = true; return false; \}/);
  // The carried ones are carried exactly as before.
  assert.match(pm, /if \(!reslot\) \{\n[^\n]*\n\s*if \(carryClear && \(placed\.some/);
});

test('once the hand lets go, every reading is solved together', () => {
  assert.match(stage, /else if \(hand \|\| reslotted\) labelSettleSoon\(\);/);
  const settle = stage.slice(stage.indexOf('function labelSettleSoon()'), stage.indexOf('function labelSettleSoon()') + 600);
  assert.match(settle, /if \(gestureOn\(\)\) \{ labelSettleT = setTimeout\(settle, 120\); return; \}/);
  assert.match(settle, /if \(reslotted\) \{ reslotted = false; solvedFor = null; \}/, 'no solvedFor: the next layout is a whole solve');
});
