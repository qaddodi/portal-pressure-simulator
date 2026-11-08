// Push B, items 3 and 4: the change between the views is one clock (a framing asked for during it becomes its end, the presenter waits for its
// landing, not 700 ms), and the timing constants the hand-overs rest on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEW_CHANGE_S, VIEW_CHANGE_MS, viewXfCamU, viewXfDetach, viewXfLeftMs, viewXfRetarget } from '../src/ui/view-xf.js';
import { lerpVT } from '../src/ui/cam-arc.js';
import { D_SMALL } from '../src/ui/ease.js';
import { RAIL_MS, easeRail } from '../src/ui/card-throw.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const closeVT = (a, b) => near(a.k, b.k, 1e-9) && near(a.x, b.x, 1e-6) && near(a.y, b.y, 1e-6);

test('timing constants: the view change is 1.3 s (kept), and everything that waits on it is derived from it', () => {
  assert.equal(VIEW_CHANGE_S, 1.3);
  assert.equal(VIEW_CHANGE_MS, 1300);
  assert.ok(near(viewXfLeftMs(0, 1), 1300) && near(viewXfLeftMs(0.5, 1), 650) && near(viewXfLeftMs(1, 1), 0) && near(viewXfLeftMs(0.75, 0), 975), 'the share still to go, of the whole');
});

test('a framing asked for mid-change is its new end: no jump at the retarget, and it lands on the framing as the change does', () => {
  const x = { from: { k: 1, x: 0, y: 0 }, to: { k: 1.8, x: -120, y: 40 }, p0: 0, same: false };
  const at = (p) => { const u = viewXfCamU(x, p); return u >= 1 ? { ...x.to } : lerpVT(x.from, x.to, u); };
  for (const p of [0, 0.1, 0.35, 0.6, 0.9]) {
    const cur = at(p), to = { k: 3.1, x: -400, y: -90 };
    const y = { ...x, from: { ...x.from }, to: { ...x.to } };
    assert.ok(viewXfRetarget(y, cur, to, p, false));
    const after = (q) => { const u = viewXfCamU(y, q); return u >= 1 ? { ...y.to } : lerpVT(y.from, y.to, u); };
    assert.ok(closeVT(after(p), cur), `the camera stays where it is at p=${p}`);
    assert.ok(closeVT(after(1), to), `and arrives at the framing as the change lands, p=${p}`);
    // monotone toward the new end: zoom and pan never turn back
    let last = after(p);
    for (let q = p; q <= 1.0001; q += 0.05) { const v = after(Math.min(1, q)); assert.ok(v.k >= last.k - 1e-9 && v.x <= last.x + 1e-9 && v.y <= last.y + 1e-9, `moves on at p=${q.toFixed(2)}`); last = v; }
  }
});

test('a retarget at the tap is the framing straight from the start; a second one keeps the place of the first', () => {
  const x = { from: { k: 1, x: 0, y: 0 }, to: { k: 2, x: -50, y: 0 }, p0: 0, same: false };
  const a = { k: 2.5, x: -80, y: 10 };
  viewXfRetarget(x, { k: 1, x: 0, y: 0 }, a, 0, false);
  assert.deepEqual(x.from, { k: 1, x: 0, y: 0 });
  assert.equal(x.p0, 0);
  const p1 = 0.4, cur = lerpVT(x.from, x.to, viewXfCamU(x, p1));
  viewXfRetarget(x, cur, { k: 1.4, x: -10, y: 0 }, p1, false);
  assert.ok(closeVT(lerpVT(x.from, x.to, viewXfCamU(x, p1)), cur));
  assert.equal(viewXfCamU(x, 1), 1);
  assert.equal(viewXfCamU(x, 5), 1, 'past the end it stays on the end');
  assert.equal(viewXfCamU({ ...x, p0: 1 }, 1), 1, 'a retarget at the very end does not divide by nothing');
  // a camera with nowhere to go: the flag is the stage's to read
  viewXfRetarget(x, { k: 1.4, x: -10, y: 0 }, { k: 1.4, x: -10, y: 0 }, 0.5, true);
  assert.equal(x.same, true);
});

test('a hand on the view takes the camera from the change: it is not retargeted, and the change\'s landing sets nothing', () => {
  const x = { from: { k: 1, x: 0, y: 0 }, to: { k: 2, x: 0, y: 0 }, p0: 0, same: false };
  viewXfDetach(x);
  assert.equal(x.same, true);
  assert.equal(x.hand, true);
  assert.equal(viewXfRetarget(x, { k: 1.2, x: 0, y: 0 }, { k: 3, x: 0, y: 0 }, 0.3, false), false, 'animateVT then glides as usual');
  assert.deepEqual(x.to, { k: 2, x: 0, y: 0 });
  viewXfDetach(null);
  assert.equal(viewXfRetarget(null, { k: 1, x: 0, y: 0 }, { k: 2, x: 0, y: 0 }, 0, false), false);
});

test('hand-overs (item 4): a thrown card needs no fixed floor, it is out of sight well inside the floor that was', () => {
  // The rail curve: a leaving card's opacity hits 0 at 85 % of its way (card-throw.js throwInto).
  let t = 0;
  while (t < RAIL_MS && easeRail(t / RAIL_MS) < 0.85) t++;
  assert.ok(t >= 150 && t <= 190, `out of sight at ${t} ms of ${RAIL_MS}`);
  const floor = D_SMALL + 20;   // (what wordsOut asked of a thrown card before)
  assert.ok(floor - t >= 60, 'about 90 ms were spent on an empty slot');
});
