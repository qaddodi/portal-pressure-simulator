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

test('a hand zoom in the Circuit fades the readings out, skips their layout, and shows them solved once let go', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.stage-view\.pinch-hide > #labels, \.stage-view\.pinch-hide > #labelGl, \.stage-view\.pinch-hide \.lb-glass \{ opacity: 0; \}/);
  const ul = stage.slice(stage.indexOf('function updateLabels(f, force = false) {'), stage.indexOf('function refreshValues('));
  // Only in the Circuit, only under a hand, only once the scale moved (a pan keeps them, carried).
  assert.match(ul, /if \(pinchHide \|\| \(easeInOut\(morph\) >= 0\.5 && solvedFor && gestureOn\(\) && Math\.abs\(Math\.log\(CTM\.sc \/ solvedFor\.sc\)\) > PINCH_ZOOM\)\) \{\n\s*if \(gestureOn\(\)\) \{/);
  assert.ok(ul.indexOf('pinchRelease();\n        return;') < ul.indexOf('layoutLabels(f, false)'), 'no layout while it lasts');
  const rel = stage.slice(stage.indexOf('function pinchRelease()'), stage.indexOf('function pinchRelease()') + 700);
  assert.match(rel, /if \(gestureOn\(\)\) \{ pinchT = setTimeout\(rel, 120\); return; \}/, 'waits for the hand to let go');
  assert.match(rel, /solvedFor = null;/, 'a whole solve where the view stopped');
  assert.ok(rel.indexOf('updateLabels(F)') < rel.indexOf("classList.remove('pinch-hide')"), 'laid out first, then shown');
  // Laid out while hidden, they take their new places at once (no glide from where they were).
  assert.match(stage, /const snap = [^\n]*wrap\.classList\.contains\('pinch-hide'\)/);
});
