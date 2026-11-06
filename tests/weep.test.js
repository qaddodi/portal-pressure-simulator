import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeep, leakedPerDay, WEEP_N, WEEP_ROWS, WEEP_REF, WEEP_LEAVES } from '../src/ui/weep.js';
import { fluidBase } from '../src/ui/fluid-step.js';

// Lymph weeping from the liver into the pool (weep.js): the numbers the figure's GPU renderer draws from. A synthetic liver whose lower
// edge is a shallow bowl across 300 to 640 (its own frame), at the figure's fluid rectangle and column count.
const R = [284, 430, 856, 650], COLS = 1201;
const floorOf = () => {
  const f = new Float32Array(COLS).fill(-1e4);
  for (let i = 0; i < COLS; i++) {
    const x = R[0] + (i * R[2]) / (COLS - 1);
    if (x > 330 && x < 650) f[i] = 520 + 90 * Math.sin(((x - 330) / 320) * Math.PI);
  }
  return f;
};
const look = () => ({ wp: [0, 0, 0, 0], wb: [0, 0, 0, 0], wk: [0, 0, 0, 0] });
const made = (leak, h = 240, scale = 1) => {
  const w = createWeep(), L = look();
  assert.ok(w.layout(floorOf(), scale, h, R, COLS, (x) => fluidBase(x, h)));
  w.feed({ hepLymph: leak / 1440 + 0.5, splLymph: 0, lymphCap: 0.5 });
  for (let i = 0; i < 30; i++) w.step(0.5, true, true, L);   // (the leak eases up over a second or two)
  return { w, L };
};

test('the leak is what the lymphatics cannot carry, mL a day', () => {
  assert.equal(leakedPerDay({ hepLymph: 1, splLymph: 2, lymphCap: 2 }), 1440);
  assert.equal(leakedPerDay({ hepLymph: 1, splLymph: 1, lymphCap: 4 }), 0);
  assert.equal(leakedPerDay(null), 0);
  assert.equal(leakedPerDay({ hepLymph: NaN, splLymph: 1, lymphCap: 1 }), 0);
});

test('no leak, no stream; a leak draws the table the renderer reads', () => {
  const none = made(0);
  assert.equal(none.L.wp[0], 0);
  const { w, L } = made(WEEP_REF);
  assert.equal(L.wp[0], WEEP_N);
  assert.equal(w.out.data.length, WEEP_N * WEEP_ROWS);
  assert.ok(w.out.data.every(Number.isFinite));
  assert.ok(L.wb[2] > L.wb[0] && L.wb[3] > L.wb[1]);
  assert.ok(w.out.cells.length > 0 && w.out.cells.length % 2 === 0);
});

test('more leak wakes more rivulets and widens the stream', () => {
  const lo = made(300), mid = made(WEEP_REF), hi = made(2 * WEEP_REF);
  const awake = (m) => { let n = 0; for (let i = 0; i < WEEP_LEAVES; i++) if (m.w.out.data[8 * WEEP_N + i * 7 + 6] > 0.5) n++; return n; };
  assert.ok(awake(lo) < awake(mid) && awake(mid) <= awake(hi), `${awake(lo)} ${awake(mid)} ${awake(hi)}`);
  const trunkEnd = (m) => m.w.out.data[6 * WEEP_N + WEEP_N - 1];
  assert.ok(trunkEnd(hi) > trunkEnd(lo));
});

test('the stream drops past the pool surface, and the rivulets start at the liver rim', () => {
  const { w } = made(WEEP_REF, 240);
  const d = w.out.data, N = WEEP_N;
  const lastY = d[3 * N + N - 1], lastX = d[2 * N + N - 1];
  assert.ok(lastY > fluidBase(lastX, 240));
  for (let i = 0; i < WEEP_LEAVES; i++) {
    const y0 = d[N + i * 7], x0 = d[i * 7];
    assert.ok(y0 > 500 && y0 < 640 && x0 > 330 && x0 < 650, `${x0} ${y0}`);
  }
});

test('a shrunk liver moves the stream with it, and the same liver asks for nothing again', () => {
  const w = createWeep();
  const sf = (x) => fluidBase(x, 240);
  assert.equal(w.layout(floorOf(), 1, 240, R, COLS, sf), true);
  assert.equal(w.layout(floorOf(), 1, 240, R, COLS, sf), false);
  assert.equal(w.layout(floorOf(), 0.8, 240, R, COLS, sf), true);
  assert.equal(w.layout(null, 1, 240, R, COLS, sf), true);
});

test('the dashes run only while the model runs, and the leak eases rather than jumps', () => {
  const { w, L } = made(WEEP_REF);
  const p0 = L.wp[1];
  assert.equal(w.step(0.5, false, true, L), 0);
  assert.equal(L.wp[1], p0);
  w.step(0.5, true, true, L);
  assert.ok(L.wp[1] > p0);
  w.feed({ hepLymph: 0.5 + 2 * WEEP_REF / 1440, splLymph: 0, lymphCap: 0.5 });
  w.step(0.1, true, true, L);
  assert.ok(w.shown > WEEP_REF && w.shown < 2 * WEEP_REF);
});

test('a stream that arrives or leaves asks for a repaint; one that merely eases does not', () => {
  const w = createWeep(), L = look();
  w.layout(floorOf(), 1, 240, R, COLS, (x) => fluidBase(x, 240));
  assert.equal(w.step(0.1, true, true, L), 0);   // no leak yet
  w.feed({ hepLymph: 2, splLymph: 1, lymphCap: 1 });
  assert.equal(w.step(0.1, true, true, L), 2);   // it arrives
  assert.equal(w.step(0.1, true, true, L), 1);   // it eases up
  assert.equal(w.step(0.1, true, false, L), 2);  // the pool goes: so does the stream
  assert.equal(L.wp[0], 0);
});
