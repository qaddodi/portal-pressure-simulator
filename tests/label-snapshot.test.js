import { stageSource } from './stage-src.js';
// The displayed-label snapshot (R17): { seq, gen, items: [{ key, x, y, w, h, a, clipped }] } from the pictures drawn in the last frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotItem } from '../src/ui/label-gl.js';

const lg = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const st = stageSource();

test('an item is in CSS px with its opacity, and clipped only where it leaves the canvas', () => {
  assert.deepEqual(snapshotItem('a', 20, 40, 60, 30, 0.5, 2, 400, 300), { key: 'a', x: 10, y: 20, w: 30, h: 15, a: 0.5, clipped: false });
  assert.equal(snapshotItem('a', -1, 0, 10, 10, 1, 1, 100, 100).clipped, true);
  assert.equal(snapshotItem('a', 95, 0, 10, 10, 1, 1, 100, 100).clipped, true);
  assert.equal(snapshotItem('a', 90, 90, 10, 10, 1, 1, 100, 100).clipped, false);
});

test('seq counts drawn frames, gen every layout and repack, and only pictures drawn that frame are listed', () => {
  assert.match(lg, /nb = 0;\n\s+frameSeq\+\+;/);
  assert.match(lg, /last = list; gen\+\+;/);
  assert.match(lg, /pageTex = rpTex; rpTex = \[\]; rp = null; gen\+\+;/);
  assert.match(lg, /st\.seq = frameSeq;\n\s+takeItem\(/);
  assert.match(lg, /st\.seq === frameSeq/);
  assert.match(lg, /return \{ seq: frameSeq, gen, items, marks: marksOut \};/);
  // (drawnLabels stays as it was; the stage hands the snapshot out beside it, in page px.)
  assert.match(lg, /drawnLabels\(\) \{/);
  assert.match(st, /labelSnapshot: \(\) => \{ const r = stageBox\(\), o = labelGL\?\.snapshot\?\.\(\)/);
});

// R09: a picture off its DOM label must not take the click meant for where it stands.
import { displacedNow } from '../src/ui/label-gl.js';
test('pointer activation is held off while a ride or a moving glide has the pictures off their labels, and restored after', () => {
  assert.equal(displacedNow(false, 0), false);
  assert.equal(displacedNow(true, 0), true);
  assert.equal(displacedNow(false, 3), true);
  assert.equal(displacedNow(false, 0), false);   // (the landing done: every glide dropped)
  // (A class between frames on the labels' svg, toggled on a change only; a fade-in glide does not count, it moves nothing.)
  assert.match(lg, /import \{ classSoon \} from '\.\/class-soon\.js';/);
  assert.match(lg, /if \(off !== displaced\) \{ displaced = off; classSoon\(svg, 'lb-displaced', off\); \}/);
});

test('the pointer hold is lifted when the pictures are given back to the SVG or the context is lost', () => {
  assert.match(lg, /function undisplace\(\) \{ if \(displaced\) \{ displaced = false; classSoon\(svg, 'lb-displaced', false\); \} \}/);
  assert.match(lg, /function release\(\) \{\n\s+undisplace\(\);/);
  assert.match(lg, /lost = true; undisplace\(\);/);
});

test('a camera ride carries the leaders and dots with the labels (they were left where laid out, stretching from their points)', () => {
  assert.match(lg, /if \(geo && rideM\) \{\n\s+const M = rideM, n = isPath \? 2 : 1;/);
  assert.match(lg, /geo\[i \* 2\] = \(M\[0\] \* cx \+ M\[2\] \* cy \+ M\[4\]\) \* dpr;/);
});

test('a leader\'s label end follows its label\'s landing glide, and a pan (carried by layout each frame, no ride) needs no more', () => {
  assert.match(lg, /mg\.k = el\.getAttribute\('data-k'\);/);
  assert.match(lg, /labelByKey\.clear\(\);/);
});


test('a camera ride holds each label inside the stage, and its leader\'s label end with it', () => {
  assert.match(lg, /function rideAt\(s, st\) \{/);
  assert.match(lg, /rideAt\(s, st\);\n\s+x = RIDE_XY\[0\]; y = RIDE_XY\[1\];/);
  // (EXT-LBL-2: the label end moves by the label's own drawn move, not carried as geometry and scaled off its edge.)
  assert.match(lg, /geo\[2\] = mg\.v\[2\] \* dpr \+ \(RIDE_XY\[0\] - \(Math\.round\(ls\.x \* dpr\) \+ lst\.ox\)\);/);
});

test('a layout solved for another view is never carried onto this one, nor handed to the GPU while its own solve is pending', () => {
  assert.match(st, /sf\.view = (?:live\.)?(?:live\.)?morphTarget;/);
  assert.match(st, /if \((?:live\.)?solvedFor && (?:live\.)?solvedFor\.view === (?:live\.)?morphTarget && !\((?:live\.)?morph > 0 && (?:live\.)?morph < 1\)\) layoutLabels\(f, false\);/);
  assert.match(st, /if \(!force && sameView8\((?:live\.)?labelJob\.key, key\)\) \{ labelTail\(\); return; \}/);
  assert.ok(!st.includes('glHold'));
  assert.match(st, /const (?:live\.)?labelGlSync = \(\) => \{ if \(!(?:live\.)?labelGL \|\| (?:live\.)?glSuppress\) return;/);
});
