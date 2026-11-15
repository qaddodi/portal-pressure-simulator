import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBeside } from '../src/ui/cath-place.js';
import { planStack } from '../src/ui/cath-leads.js';
import { segsCross, segHitsBox } from '../src/ui/seg-hits.js';

// The HVPG summary on the right hepatic vein (review LBL-1, 15 Nov 2026): the readings' leaders never cross each other or run through the
// other reading, whichever way the vein lies and wherever the stack stands. The order is chosen after the place is known.

const sizes = {
  roomy: { rw: 96, rh: 50, gap: 10 },   // (a reading on two lines, the stack beside the bracket and the HVPG)
  tight: { rw: 130, rh: 30, gap: 6 },   // (a phone's short band: one line each)
};
const stages = [
  ['iPhone', 393, 844, 145, 400, 'tight'], ['iPhone Pro Max', 430, 932, 150, 430, 'tight'],
  ['iPad', 820, 1180, 90, 420, 'roomy'], ['iPad landscape', 1180, 820, 80, 260, 'roomy'], ['Mac', 1440, 900, 70, 200, 'roomy'],
];

// A reading's rows as measured in the order the page has them (reading 0 on top unless swapped).
const rowsR = ({ rw, rh, gap }, swapped) => {
  const a = [0, swapped ? rh + gap : 0, rw, rh], b = [0, swapped ? 0 : rh + gap, rw, rh];
  return [a, b];
};

function faults(S) {
  const out = [];
  for (let i = 0; i + 1 < S.n[0]; i++) for (let k = 0; k + 1 < S.n[1]; k++) {
    const a = S.lead[0], b = S.lead[1];
    if (segsCross([a[i * 2], a[i * 2 + 1], a[i * 2 + 2], a[i * 2 + 3]], [b[k * 2], b[k * 2 + 1], b[k * 2 + 2], b[k * 2 + 3]])) out.push('leaders cross');
  }
  for (let j = 0; j < 2; j++) {
    const r = S.rect[1 - j], L = S.lead[j], box = { x0: r[0], y0: r[1], x1: r[0] + r[2], y1: r[1] + r[3] };
    for (let i = 0; i + 1 < S.n[j]; i++) if (segHitsBox({ x0: L[i * 2], y0: L[i * 2 + 1], x1: L[i * 2 + 2], y1: L[i * 2 + 3] }, box, 0)) out.push(`leader ${j} through the other reading`);
  }
  return out;
}

// The right hepatic vein: the catheter comes in from the IVC (up and right), the wedge point is deeper, down and to the left of the free tip.
// `mirror` flips the slope, a vein that runs the other way; `flat` is a level vein inside the tie zone.
function replay(name, W, H, t, b, sz, tip, ahead, kept = undefined) {
  const { rw, rh, gap } = sizes[sz], bw = rw + 4 + 22 + 90, bh = rh * 2 + gap, top = t + 6, lim = H - b;
  const A = { tip, ahead };
  const keep = [{ x0: tip[0] - 8, y0: tip[1] - 8, x1: tip[0] + 8, y1: tip[1] + 8 }, { x0: ahead[0] - 8, y0: ahead[1] - 8, x1: ahead[0] + 8, y1: ahead[1] + 8 }];
  const blockers = [{ x0: 0, y0: 0, x1: W, y1: t }, { x0: 0, y0: lim, x1: W, y1: H }];
  const p = placeBeside({ A, bw, bh, W, top, lim, off: 16, blockers, keep }), x = p.x, y = p.y;
  // Reading 0 is the wedged (ahead), reading 1 the free (tip), as on the slide.
  const P = [ahead, tip];
  // (The page measured the rows in either order: the plan must not care.)
  const out = [];
  for (const swapped of [false, true]) {
    const S = planStack(P, rowsR(sizes[sz], swapped), x, y, bw, bh, kept, false);
    const f = faults(S);
    out.push({ swap: S.swap, f, clean: S.clean });
    assert.equal(f.length, 0, `${name} ${W}x${H} tip ${tip} ahead ${ahead} stack ${x},${y} measured ${swapped ? 'swapped' : 'plain'}: ${f.join(', ')}`);
  }
  assert.equal(out[0].swap, out[1].swap, `${name}: the order depends on how the rows were measured`);
  return out[0];
}

test('the HVPG leaders never cross on the right hepatic vein, on every phone, iPad and Mac size', () => {
  let n = 0, swaps = 0;
  for (const [name, W, H, t, b, sz] of stages) {
    const top = t + 6, lim = H - b;
    for (let ty = top + 20; ty < lim - 20; ty += 14) for (let tx = 70; tx < W - 70; tx += 30) {
      for (const dist of [30, 60, 100, 140]) for (const slope of [0.2, 0.45, 0.7]) for (const mirror of [1, -1]) {
        // the wedge point: deeper in the vein, down and to the left of the free tip (mirror: down and to the right)
        const len = Math.hypot(1, slope), ahead = [tx - mirror * dist / len, ty + dist * slope / len];
        if (ahead[0] < 20 || ahead[0] > W - 20 || ahead[1] > lim - 10) continue;
        const r = replay(name, W, H, t, b, sz, [tx, ty], ahead);
        n++; if (r.swap) swaps++;
      }
    }
  }
  assert.ok(n > 1500, `only ${n} placements replayed`);
  assert.ok(swaps > 0 && swaps < n, 'both orders occur');
});

test('a level vein (inside the tie zone) is clean whichever order was shown before', () => {
  for (const kept of [true, false]) for (const [name, W, H, t, b, sz] of stages) {
    replay(name, W, H, t, b, sz, [W * 0.6, t + 120], [W * 0.6 - 70, t + 122], kept);
  }
});

test('when both orders are clean the stack follows its points: the reading whose point stands lower is the lower row', () => {
  // Far apart and clear, the stack beside the points to the right.
  const sz = sizes.roomy, bw = 220, bh = sz.rh * 2 + sz.gap, x = 700;
  for (const [pa, pt] of [[[300, 500], [320, 300]], [[300, 300], [320, 500]]]) {
    const S = planStack([pa, pt], rowsR(sz, false), x, 100, bw, bh, undefined, false);
    assert.equal(faults(S).length, 0);
    assert.equal(S.swap, pa[1] > pt[1], 'the lower point is the lower row');
  }
});

test('EUS-PPG (the stack midway between its points) never sends a leader through a row, even with the HV point below the PV point', () => {
  const sz = sizes.roomy, bw = 220, bh = sz.rh * 2 + sz.gap;
  for (const [hv, pv] of [[[420, 200], [520, 420]], [[420, 420], [520, 200]], [[300, 300], [600, 330]]]) {
    const S = planStack([hv, pv], rowsR(sz, false), 380, 270 - bh / 2 + 30, bw, bh, undefined, true);
    assert.deepEqual(faults(S), [], `HV ${hv} PV ${pv}`);
  }
});
