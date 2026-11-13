// The lobule zoom reads no layout in a frame (1 Nov 2026, Mohammad: "block everything until everything is on GPU"): its boxes are
// kept (snap) from the ResizeObserver, a resize, the cards' space changing, a press and the lobule opening; its labels', call
// pill's and zone names' sizes are measured in a timer task of their own (measureRun); its leaders follow a label's glide from the
// glide's own curve (seenAt), not from the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scan } from '../scripts/off-gpu-scan.mjs';

const src = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const between = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

test('no layout read in the lobule zoom is reached from a frame or a motion callback', () => {
  const rows = scan().filter((h) => h.file === 'src/ui/lobule-zoom.js' && h.cat === 'layoutRead');
  assert.deepEqual(rows.map((h) => `${h.line} ${h.detail}`), []);
});

test('the boxes are read at rest boundaries only', () => {
  assert.match(src, /const boxRO = new ResizeObserver\(\(\) => \{ if \(readAll\(\) && fade > 0\) relayout\(\); \}\);\n\s*boxRO\.observe\(el\); boxRO\.observe\(host\);/);
  assert.match(src, /const onOcc = \(\) => \{ occT = 0; readAll\(\);/);
  assert.match(src, /if \(fade <= 0 && !store\.get\(\)\.lobule\) \{ snap\.cardKey = '~'; return; \}\n\s*if \(!occT\) occT = restPass\(onOcc\);/, 'a slide change reads nothing with the lobule closed, and between frames with it open');
  assert.match(src, /if \(!onScene\(ev\) \|\| systemEdge\(ev\)\) return;\n\s*readBox\(\);/, 'a press reads the lobule\'s place first');
  assert.match(src, /landing\(\) \{\n\s*readAll\(\);/);
  assert.match(src, /const localX = \(ev\) => ev\.clientX - snap\.l, localY = \(ev\) => ev\.clientY - snap\.t;/);
  assert.match(src, /if \(!restT\) restT = restPass\(readRest\);/, 'a landed glide reads the cards again in a task of its own');
});

test('a label waits a frame to be measured rather than read in the frame', () => {
  const lay = between('function layoutLabels()', 'const p = anchorOf(k), ax = ');
  assert.doesNotMatch(lay, /offsetWidth|offsetHeight|getComputedStyle|getBoundingClientRect/);
  assert.match(lay, /wantLabels\(ns, fw\);\n\s*if \(!measT\) measT = restPass\(measureRun\);/);
  assert.match(src, /function wantLabels\(ns, fw\) \{[\s\S]*?w\.fw = fw; labWant = w;/);
  assert.match(lay, /if \(bakeFollow\(\)\) \{ relayout\(\); return; \}/, 'a bake is drawn first, the labels land at once next frame (no glide)');
  assert.doesNotMatch(between('function bakeRides()', 'function bakeFollow()'), /offsetWidth/);
});

test('the leaders follow a label along the glide\'s own curve', () => {
  const sync = between('function syncLeaders()', '// ── Frame loop');
  assert.doesNotMatch(sync, /offset(Left|Top|Width|Height|Parent)|getAnimations/);
  assert.match(sync, /seenAt\(L, now\)/);
  assert.match(src, /const EASE_LAB = easeArrive;/, 'app.css --ease (ease-arrive, ease.js easeArrive) on the labels\' left and top');
  assert.match(src, /EASE_LAB\(clamp\(\(now - g\.t0\) \/ D_SURFACE, 0, 1\)\)/);
});
