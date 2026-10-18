// The moving blood in the round 2 motion review (MOTION_HEAT_REVIEW_ROUND2 B9, B10, B4, B6): what eases must keep easing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stage = read('src/ui/stage.js');
const fn = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); return src.slice(i, src.indexOf('\n  }\n', i) + 4); };

test('B10: a reversed colour or chevron fade still on its way keeps the figure awake, so it never stops part-way while paused', () => {
  const blood = fn(stage, '  function stepBlood(dt) {');
  assert.match(blood, /bloodEasing = false;/);
  assert.match(blood, /sm\.rev = sm\.rev == null \? rt : eased\(sm\.rev, rt, ease\);/);
  assert.match(blood, /sm\.chevK = sm\.chevK == null \? ct : eased\(sm\.chevK, ct, ease\);/);
  assert.match(stage, /const eased = \(v, to, k\) => \{ if \(Math\.abs\(to - v\) <= 0\.002\) return to; bloodEasing = true; return v \+ \(to - v\) \* k; \};/);
  // The loop sleeps only once they have landed (exactly on their ends).
  assert.match(stage, /!widthEasing && !bloodEasing && !plateEasing\(\)/);
});

test('B9: while the anatomy still shows during the lobule dive, its blood keeps moving (the plate itself holds still)', () => {
  const i = stage.indexOf('if (diveT > 0 && diveT < 1 && !drawOnce && !forceDraw) {');
  assert.ok(i > 0);
  const block = stage.slice(i, stage.indexOf('lastT = flowGate = now; nextFrame(animate); return;', i));
  assert.match(block, /!diveHid && diveFadeO !== 0 && store\.get\(\)\.running/);
  assert.match(block, /stepBlood\(Math\.min\(0\.1, \(now - lastT\) \/ 1000\)\);\n\s*veins\.composite\(vLook, bloodLook\(\), false\);/);
  assert.doesNotMatch(block.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'), /update\(|refreshCTM|syncVeins/);
});

test('atlas picks (18 Oct): smaller chevrons with a tinted dark core and softer streaks; vessels stay flat, organs keep their art', () => {
  const gl = read('src/ui/veins-gl.js');
  // A1: 4–8 CSS px half-width, never over 0.8 of the lumen; the stage and the lobule both say how many canvas px a CSS px is.
  assert.match(gl, /float hw = min\(0\.8 \* R, clamp\(0\.5 \* R, 4\.0 \* cssPx \* pxW, 8\.0 \* cssPx \* pxW\)\)/);
  assert.match(gl, /vec3 ink = mix\(chevInk, vc \* 0\.3, 0\.2\);/);
  assert.match(stage, /holes: chevHoles, vdpr, \.\.\.bloodColors\(\)/);
  assert.match(read('src/ui/lobule-zoom.js'), /bleed: \[\], vdpr: k, \.\.\.bloodColors\(\)/);
  // AL3: the chevrons read the radius between its samples.
  assert.match(gl, /float radAt\(int id, float s, float len\)/);
  // A6: softer streak ink.
  assert.match(gl, /vec3 core = mix\(mix\(col, inkLight, 0\.62\), mix\(col, inkDark, 0\.45\), pale\);/);
  // Not taken: the lit cylinder (flat vessels) and the offset organ shadow (the organ art stays).
  assert.doesNotMatch(gl, /vec3 n3 = vec3\(g \* rho/);
  assert.match(gl, /float aDark = \(1\.0 - smoothstep\(0\.1, 0\.1 \+ soft, abs\(side \+ 0\.62\)\)\) \* thin;/);
  assert.doesNotMatch(stage, /class: 'org-ao', transform/);
  assert.doesNotMatch(stage, /band-ao', transform/);
});

test('A4: hover and selection glows are slim bands', () => {
  assert.match(stage, /\{ id, col: null, amt: 1\.0, wide: 0\.5, dur: 280 \}/);
  assert.match(stage, /\{ id, col: null, amt: 1\.5, wide: 0\.6, dur: SEL_FADE \* 1000 \}/);
});

test('B4: the streaks, chevrons and origin colours fade when switched, and a vessel drawing on carries its blood with it', () => {
  const gl = read('src/ui/veins-gl.js');
  assert.match(gl, /uniform vec3 blendA;/);
  assert.match(gl, /col = mix\(col, oc, vis \* blendA\.z\);/);
  assert.match(gl, /clamp\(a \* vis \* flowA \* blendA\.x, 0\.0, 1\.0\)/);
  assert.equal((gl.match(/vis \* flowA \* blendA\.y\)/g) || []).length, 2, 'the chevron head and its rim');
  assert.match(gl, /gl\.uniform3f\(U\.blendA, blood\.streakA \?\? 1, blood\.chevA \?\? 1, blood\.originA \?\? 1\);/);
  const blood = fn(stage, '  function stepBlood(dt) {');
  // Eased from their switches (the catheter hides the chevrons), kept awake while on the way (bloodEasing); Reduce Motion fades too.
  assert.match(blood, /const kF = -Math\.expm1\(-dt \/ 0\.15\), tS = bloodOn\(\) \? 1 : 0, tC = chevOn\(\) && !cath\.st \? 1 : 0, tO = originOn\(\) \? 1 : 0;/);
  assert.match(blood, /blendA\.c = blendA\.c == null \? tC : eased\(blendA\.c, tC, kF\);/);
  assert.match(blood, /const on = blendA\.s > 0 \|\| blendA\.c > 0 \|\| blendA\.o > 0;/);
  // Reveals and strands: blood strength follows the stroke and the strand's share; nothing waits for 0.5 or the reveal's end.
  assert.doesNotMatch(blood, /x\.reveal \|\|/);
  assert.doesNotMatch(blood, /live \?\? 1\) >= 0\.5/);
  assert.match(blood, /put\(x\.row, k, q \/ area, x\.freeFrom, x\.freeTo, rs\);/);
  const look = fn(stage, '  function bloodLook() {');
  assert.match(look, /on: sA > 0, still: reduceMotion\.matches, chev: cA > 0, look: b\.look, origin: oA > 0, streakA: sA, chevA: cA, originA: oA,/);
});

test('B6: a jump in the model recolours the vessels through the lens crossfade, not in one frame', () => {
  assert.match(stage, /const JUMP_MMHG = 2;/);
  const mj = fn(stage, '  function modelJumped(f) {');
  assert.match(mj, /if \(!f \|\| f === jumpF\) return false;/);
  assert.match(mj, /Math\.abs\(P\[i\] - jumpP\[i\]\) > JUMP_MMHG/);
  assert.match(mj, /return big && shownCol\.size > 0;/);
  assert.match(stage, /const jumped = modelJumped\(F\);\n\s*if \(\(\(lensMode && mode !== lensMode\) \|\| jumped\) && !reduceMotion\.matches\) \{ lensFrom = shownCol; lensT0 = performance\.now\(\); \}/);
});
