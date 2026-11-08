// Animation recs item 10 (8 Nov 2026, Mohammad: "item 10: yes, fade"). A pinned label a new layout puts in another place (its offset moved by more
// than 3 px) fades out where it stood and in at its new place over D_SMALL, both on the same point: not a swap in one frame, not a glide
// (V-LBL-1 and V-LBL-3). moveFade (label-gl.js) is driven here with the closure's own state stood in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { D_SMALL, easeMove } from '../src/ui/motion.js';

const SRC = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const take = (head) => {
  const i = SRC.indexOf(head);
  assert.ok(i >= 0, head);
  return SRC.slice(i, SRC.indexOf('\n  }\n', i) + 4);
};

function rig() {
  const state = { ghosts: [], xfNew: 1, xfOld: 1, frameSeq: 0, reduce: false };
  const make = new Function('state', 'D_SMALL', 'easeMove', `
    const pinLast = new WeakMap(); const MOVE_PX = 3;
    const newPinRec = ${SRC.match(/const newPinRec = (.*);\n/)[1]};
    const REDUCE = { get matches() { return state.reduce; } };
    const ghosts = state.ghosts;
    const frameSeq_ = () => state.frameSeq;
    ${take('function moveFade(g, ox, oy, now)').replace(/\bxfNew\b/g, 'state.xfNew').replace(/\bxfOld\b/g, 'state.xfOld').replace(/\bframeSeq\b/g, 'state.frameSeq')}
    return { moveFade, pinLast };`);
  const { moveFade, pinLast } = make(state, D_SMALL, easeMove);
  const g = { dataset: { key: 'n:portal' } };
  // (one drawn frame: the sequence number goes up, then the label is placed)
  const frame = (ox, oy, now, grp = g) => { state.frameSeq++; return moveFade(grp, ox, oy, now); };
  return { state, frame, g, pinLast };
}

test('a label that stays put, or moves 3 px or less, does not fade', () => {
  const { frame } = rig();
  let r = frame(10, 10, 0);
  assert.equal(r.on, false, 'the first sight of a label');
  r = frame(10, 10, 16); assert.equal(r.on, false);
  r = frame(12, 12, 32); assert.equal(r.on, false, '2 px is the same place');
  r = frame(15, 12, 48); assert.equal(r.on, false, '3 px on x from where it was drawn last');
});

test('a label laid out in another place fades: the old place out, the new in, over D_SMALL, on the clock', () => {
  const { frame } = rig();
  frame(10, 10, 0);
  let r = frame(60, -20, 1000);
  assert.equal(r.on, true);
  assert.deepEqual([r.mx, r.my], [10, 10], 'the fade goes out of where it was drawn');
  assert.equal(r.mf, 0, 'the first frame is the old picture whole');
  r = frame(60, -20, 1000 + D_SMALL / 2);
  assert.ok(Math.abs(r.mf - easeMove(0.5)) < 1e-9, 'half the time in');
  assert.deepEqual([r.mx, r.my], [10, 10], 'the old place stays put while it fades: no glide');
  r = frame(60, -20, 1000 + D_SMALL);
  assert.equal(r.on, false, 'at D_SMALL it is over');
  r = frame(60, -20, 1000 + D_SMALL + 16);
  assert.equal(r.on, false);
});

test('a label the pool gives to another, or one not drawn the frame before, has no past to fade from', () => {
  const { frame, g, state } = rig();
  frame(10, 10, 0);
  g.dataset.key = 'n:spleen';
  assert.equal(frame(90, 90, 16).on, false, 'another label in the same group');
  state.frameSeq += 3;   // (not drawn for a few frames)
  assert.equal(frame(10, 10, 32).on, false);
});

test('during a view change (ghosts, or the change\'s own crossfade) and with Reduce Motion the new place is taken at once', () => {
  const { frame, state } = rig();
  frame(10, 10, 0);
  state.xfNew = 0.4; state.xfOld = 0.6;
  assert.equal(frame(80, 80, 16).on, false, 'the change\'s own crossfade is the fade');
  state.xfNew = 1; state.xfOld = 1; state.ghosts.push({});
  assert.equal(frame(10, 10, 32).on, false, 'ghosts standing');
  state.ghosts.length = 0;
  frame(10, 10, 48);
  state.reduce = true;
  assert.equal(frame(80, 80, 64).on, false, 'Reduce Motion: instant');
});
// (The draw's fade assertions on label-gl.js are rules in scripts/source-shapes/b.mjs.)
