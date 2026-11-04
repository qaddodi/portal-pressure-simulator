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
  assert.match(pm, /if \(!reslot\) \{\n[^\n]*\n\s*const box = it\.rot \? rectOf\(\{ \.\.\.it, w: it\.h, h: it\.w \}\) : rectOf\(it\);[^\n]*\n\s*if \(carryClear && \(placed\.some/);
});

test('a lane caption turned upright is kept inside the stage by its turned box, never the unturned one', () => {
  // Pulled in by its unturned box (as wide as its text is long), one beside the stage's right edge on a phone was slid left across
  // the lanes beside it ("Epigastric -> SVC" on the iPhone's upright Circuit).
  assert.match(stage, /const edge = it\.rot \? rectOf\(\{ \.\.\.it, w: it\.h, h: it\.w \}\) : rectOf\(it\), V = viewOf\(it\);/, 'the pull-in');
  assert.match(stage, /const boxOf = \(it\) => \(it\.rot \? rectOf\(\{ \.\.\.it, w: it\.h, h: it\.w \}\) : rectOf\(it\)\);/, 'the overlap pass');
  // A carried one keeps the box it was solved with.
  assert.match(pm, /const box = it\.rot \? rectOf\(\{ \.\.\.it, w: it\.h, h: it\.w \}\) : rectOf\(it\);[^\n]*\n\s*if \(carryClear && \(placed\.some\(\(p\) => !p\.dot && hits\(box, p\)\)[^\n]*\n\s*placed\.push\(box\); out\.push\(it\);/);
  // The solve probes the turned box too.
  assert.match(pm, /const probe = it\.rot \? \{ \.\.\.it, w: it\.h, h: it\.w \} : \{ \.\.\.it, w: wRes \};/);
});

test('once the hand lets go, every reading is solved together', () => {
  assert.match(stage, /else if \(hand \|\| reslotted\) labelSettleSoon\(\);/);
  const settle = stage.slice(stage.indexOf('function labelSettleSoon()'), stage.indexOf('function labelSettleSoon()') + 600);
  assert.match(settle, /if \(gestureOn\(\)\) \{ labelSettleT = setTimeout\(labelSettle, 120\); return; \}/);
  assert.match(settle, /if \(reslotted\) \{ reslotted = false; solvedFor = null; \}/, 'no solvedFor: the next layout is a whole solve');
});

test('a hand zoom in the Circuit carries the readings on the GPU; where they cannot ride they hide and come back only once laid out', () => {
  // (3 Nov 2026, Mohammad: "Why aren't the labels moving with the zoom". The zoom had hidden every reading, and lifted the hide a frame
  // after the hand let go, before the solve for where it stopped had landed: the old labels stood at their old screen places over the
  // zoomed vessels. They now ride the zoom, in the Circuit as in the anatomy, and the hide is lifted only once their layout is down.)
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.stage-view\.pinch-hide > #labels, \.stage-view\.pinch-hide > #labelGl, \.stage-view\.pinch-hide \.lb-glass \{ opacity: 0; \}/);
  const ul = stage.slice(stage.indexOf('function updateLabels(f, force = false) {'), stage.indexOf('function refreshValues('));
  // The ride is tried first, at rest in either view (not between them), and compares what the labels show (rideKeyHeld), never the signature:
  // a playing model changes that every few frames (widths, geometry) and the zoom flips two of its flags, which had ended every ride at once.
  assert.match(ul, /const restView = morph === 0 \|\| morph === 1;/);
  assert.ok(ul.indexOf('rideStart(layCTM)') < ul.indexOf('if (pinchHide || (easeInOut(morph) >= 0.5'), 'the ride before the hide');
  assert.match(ul, /rideKeyHeld\(st\)/, 'what the labels show, not the signature');
  assert.doesNotMatch(ul.slice(0, ul.indexOf('if (pinchHide || (easeInOut(morph)')), /labelSig\(f\)/, 'the signature is not read before the ride');
  // Where they cannot ride: hidden for the zoom, no layout while it lasts.
  assert.match(ul, /if \(pinchHide \|\| \(easeInOut\(morph\) >= 0\.5 && solvedFor && gestureOn\(\) && Math\.abs\(Math\.log\(CTM\.sc \/ solvedFor\.sc\)\) > PINCH_ZOOM\)\) \{\n\s*if \(gestureOn\(\)\) \{/);
  assert.ok(ul.indexOf('pinchRelease();\n        return;') < ul.indexOf('layoutLabels(f, false)'), 'no layout while it lasts');
  const rel = stage.slice(stage.indexOf('function pinchRelease()'), stage.indexOf('function labelSettleSoon()'));
  assert.match(rel, /if \(gestureOn\(\)\) \{ pinchT = setTimeout\(pinchRel, 120\); return; \}/, 'waits for the hand to let go');
  assert.match(rel, /solveAsked = true;/, 'a whole solve where the view stopped, the standing labels carried first (solvedFor kept)');
  assert.doesNotMatch(rel, /solvedFor = null;/, 'solvedFor = null skipped the carry: the old labels showed at their old places');
  // The hide is lifted by pinchLiftNow only once no solve runs and the layout's key is kept (labelTail); a late solve is waited for in its slices.
  const lift = rel.slice(rel.indexOf('function pinchLiftNow'));
  assert.match(lift, /if \(!force && \(labelJob \|\| labelKey == null\)\) return;/);
  assert.doesNotMatch(rel.slice(0, rel.indexOf('function pinchLiftNow')), /classList\.remove\('pinch-hide'\)/, 'pinchRelease itself no longer lifts it');
  // (EXT-PERF-1: a late solve keeps its slices, looked at every 200 ms, and the labels come back as they stand after 3 s; never drained in one task.)
  assert.doesNotMatch(rel, /labelJobFinish\(\)/);
  assert.match(rel, /if \(labelJob && \+\+pinchLiftN < 13\) \{ pinchLiftT = setTimeout\(pinchLiftCheck, 200\); return; \}/);
  assert.match(stage, /function labelTail\(\) \{\n\s*pinchLiftNow\(false\);/);
  // Laid out while hidden, they take their new places at once (no glide from where they were).
  assert.match(stage, /const snap = [^\n]*wrap\.classList\.contains\('pinch-hide'\)/);
});

test('a pinch can take over an unfinished solve using the camera of the last committed layout', () => {
  const start = stage.indexOf('} else if (!handRide && !pinchHide');
  const takeOver = stage.slice(start, stage.indexOf('// (Where the labels could not ride', start));
  assert.match(takeOver, /Math\.hypot\(layCTM\[0\], layCTM\[1\]\)/, 'zoom is measured from the drawn layout, not an older solved slot');
  assert.doesNotMatch(takeOver, /&& labelKey|&& !labelJob/, 'a pending layout cannot prevent the existing picture riding');
  assert.match(takeOver, /rideStart\(layCTM\)\) \{[\s\S]*?labelJobDrop\(\);/, 'the ride owns the old picture before the unfinished solve is cancelled');
  const tail = stage.slice(stage.indexOf('  function labelTail()'), stage.indexOf('// The solve running in slices'));
  assert.doesNotMatch(tail, /layCTM =/, 'a skipped or sliced layout cannot claim the current camera');
  assert.match(stage, /paintLeaders\(leaders\);[\s\S]*?layCTM = stagePx\(CTM\);/, 'the camera is recorded when the layout is actually committed');
});
