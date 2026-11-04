// The displayed-label snapshot (R17): { seq, gen, items: [{ key, x, y, w, h, a, clipped }] } from the pictures drawn in the last frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotItem } from '../src/ui/label-gl.js';

const lg = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

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
  assert.match(lg, /if \(u < 1\) shifted\+\+; \}/);
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
  assert.match(lg, /const ls = labelByKey\.get\(mg\.k\), gl0 = ls && glides\.get\(ls\.g\)/);
  assert.match(lg, /geo\[2\] \+= \(gl0\.fx - \(Math\.round\(ls\.x \* dpr\) \+ lst\.ox\)\) \* \(1 - u\);/);
  assert.match(lg, /labelByKey\.clear\(\);/);
});

test('a pinch landing solves again a label that rode out of the stage margins (it was carried half off the screen)', () => {
  assert.match(st, /if \(handRide\?\.settle\) \{ const vw = viewOf\(it\); if \(box\.x0 < vw\.x0 - 4/);
});

test('a camera ride holds each label inside the stage, and its leader\'s label end with it', () => {
  assert.match(lg, /function rideAt\(s, st\) \{/);
  assert.match(lg, /rideAt\(s, st\);\n\s+x = RIDE_XY\[0\]; y = RIDE_XY\[1\];/);
  // (EXT-LBL-2: the label end moves by the label's own drawn move, not carried as geometry and scaled off its edge.)
  assert.match(lg, /geo\[2\] = mg\.v\[2\] \* dpr \+ \(RIDE_XY\[0\] - \(Math\.round\(ls\.x \* dpr\) \+ lst\.ox\)\);/);
});

test('after a view switch the labels come back only once their layout has landed (no old view over the new one)', () => {
  assert.match(st, /const morphFadeDrop = \(force\) => \{ if \(!morphFade && \(force === true \|\| !labelJob\)\)/);
  assert.match(st, /setTimeout\(morphFadeDrop, 1500, true\);/);
  assert.equal((st.match(/labelTail\(\);\n\s+nextFrame\(morphFadeDrop\);/g) || []).length, 2, 'both landings of a sliced solve');
});

test('a view change carries each label, leader and dot by its own station\'s move, in the figure\'s frame (labels are part of the figure)', () => {
  // (label-gl: offsets per key, applied to the picture and to its leader and dot; labels of no station fade; held till the new layout is in.)
  assert.match(lg, /const fol = \{ on: false, end: false, m: new Map\(\), fade: 1 \};/);
  assert.match(lg, /if \(f\) \{ x \+= Math\.round\(f\.dx \* dpr\); y \+= Math\.round\(f\.dy \* dpr\); \} else a \*= fol\.fade;/);
  assert.match(lg, /geo\[i \* 2\] \+= f\.dx \* dpr; geo\[i \* 2 \+ 1\] \+= f\.dy \* dpr;/);
  assert.match(lg, /if \(rideM \|\| \(fol\.on && !fol\.end\)\) \{ ask\(\); return; \}/);
  assert.match(lg, /followEnd\(\) \{/);
  // (stage: the table of stations from the landed layout, the step in the morph's frame, the end handing the places on.)
  assert.match(st, /if \(followOn\) followStep\(\);/);
  assert.match(st, /labelGL\.followPut\(key, a\.ax - e\.ax, a\.ay - e\.ay\);/);
  assert.match(st, /if \(followOn\) \{ followOn = false; labelGL\?\.followEnd\(\); \}/);
  assert.match(st, /followNext\.set\(it\.key, \{ id: it\.key\.slice\(2\), ax: it\.ax, ay: it\.ay \}\)/);
  assert.match(st, /class: 'leader-dot', 'data-k': it\.key/);
});

test('a layout solved for another view is never carried onto this one, nor handed to the GPU while its own solve is pending', () => {
  assert.match(st, /sf\.view = morphTarget;/);
  assert.match(st, /if \(solvedFor && solvedFor\.view === morphTarget && !\(morph > 0 && morph < 1\)\) layoutLabels\(f, false\);/);
  assert.match(st, /if \(!force && sameView8\(labelJob\.key, key\)\) \{ labelTail\(\); return; \}/);
  assert.ok(!st.includes('glHold'));
  assert.match(st, /const labelGlSync = \(\) => \{ if \(!labelGL \|\| glSuppress\) return;/);
});

// Labels part of the figure (3 Nov 2026): a station label is drawn at its point now plus its layout's offset, and its dot and leader move with it.
test('pinned labels: drawn at their point now plus the offset, their dot and leader drawn from that point and that picture each frame', () => {
  assert.match(lg, /const pinOf = \(s\) => \(pinAt && s && s\.pid != null && pinAt\(s\.pid, PIN, s\.pmid, s\.pau\) \? s : null\);/);
  assert.match(lg, /x = Math\.round\(\(PIN\[0\] \+ ox\) \* dpr\) \+ st\.ox; y = Math\.round\(\(PIN\[1\] \+ oy\) \* dpr\) \+ st\.oy;/);
  assert.match(lg, /const lx = Math\.round\(\(PIN\[0\] \+ OFF\[0\]\) \* dpr\) \+ st\.ox, ly = Math\.round\(\(PIN\[1\] \+ OFF\[1\]\) \* dpr\) \+ st\.oy;/, 'the leader ends where the picture is drawn');
  assert.match(lg, /PG\[0\] = px; PG\[1\] = py; PG\[2\] = px \+ dx \* t; PG\[3\] = py \+ dy \* t;/, 'the leader starts at the point');
  assert.match(lg, /if \(pinAt\) \{ gl\.useProgram\(mprog\); ucOf\(gl\)\.f2\(MU\.uView, W, H\); moving = drawPins\(now\) \|\| moving; gl\.bindVertexArray\(vao\); \}/, 'after the pictures, so each label is this frame\'s');
  assert.match(lg, /if \(fol\.on && !pinned\)/, 'no follow moves a pinned label');
  assert.match(st, /labelGL\.pinTo\(\(id, out, mid, au\) => \{/);
  assert.match(st, /labelGL\.pinDraw\(\);/);
});
