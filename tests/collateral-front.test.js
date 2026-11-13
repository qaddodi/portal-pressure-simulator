// A collateral opens from its high-pressure end and closes from its systemic end (first-principles item 22): the arithmetic, and the wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRONT_CHAIN, FRONT_FLOOR, FRONT_MS, chainS, frontKey, frontOpen, frontP, frontS, frontScale, fronted } from '../src/ui/collateral-front.js';

test('an opening starts closed everywhere and ends open everywhere', () => {
  for (let i = 0; i <= 10; i++) { const s = i / 10; assert.equal(frontOpen(0, false, s), 0); assert.equal(frontOpen(1, false, s), 1); }
});
test('an opening reaches the high-pressure end first and the systemic end last', () => {
  for (let p = 0.05; p < 0.95; p += 0.05) for (let i = 0; i < 10; i++) assert.ok(frontOpen(p, false, i / 10) >= frontOpen(p, false, (i + 1) / 10) - 1e-12, `p ${p} step ${i}`);
  assert.ok(frontOpen(0.4, false, 0.1) > 0.9 && frontOpen(0.4, false, 0.9) === 0);
});
test('a closing starts open everywhere, ends closed everywhere, and shuts the systemic end first', () => {
  for (let i = 0; i <= 10; i++) { const s = i / 10; assert.equal(frontOpen(0, true, s), 1); assert.equal(frontOpen(1, true, s), 0); }
  for (let p = 0.05; p < 0.95; p += 0.05) for (let i = 0; i < 10; i++) assert.ok(frontOpen(p, true, i / 10) >= frontOpen(p, true, (i + 1) / 10) - 1e-12, `p ${p} step ${i}`);
  assert.equal(frontOpen(0.4, true, 0.9), 0);
  assert.ok(frontOpen(0.4, true, 0.1) > 0.9);
});
test('the scale runs from the hairline to the vessel caliber and no further', () => {
  assert.equal(frontScale(0, false, 0.5), FRONT_FLOOR);
  assert.equal(frontScale(1, false, 0.5), 1);
  for (let p = 0; p <= 1; p += 0.1) for (let s = 0; s <= 1; s += 0.1) { const k = frontScale(p, p > 0.5, s); assert.ok(k >= FRONT_FLOOR - 1e-12 && k <= 1 + 1e-12); }
});
test('the front takes about a second', () => assert.ok(FRONT_MS >= 1000 && FRONT_MS <= 1300));
test('s follows the way the flow runs along the vessel', () => {
  assert.equal(frontS({ dir: 1 }, 0.25), 0.25);
  assert.equal(frontS({ dir: -1 }, 0.25), 0.75);
  assert.equal(frontP({ t0: 100, dur: 1000 }, 600), 0.5);
  assert.equal(frontP({ t0: 100, dur: 1000 }, 99999), 1);
});
test('only a collateral with a reveal has a front, and its key moves with the clock', () => {
  const c = { e: { kind: 'collateral' }, reveal: { t0: 0, dur: 1000, dir: 1, out: false } };
  assert.ok(fronted(c));
  assert.ok(!fronted({ e: { kind: 'shunt' }, reveal: c.reveal }));
  assert.ok(!fronted({ e: { kind: 'collateral' }, reveal: null }));
  assert.equal(frontKey({ e: { kind: 'shunt' }, reveal: c.reveal }, 500), 0);
  assert.notEqual(frontKey(c, 100), frontKey(c, 500));
  assert.notEqual(frontKey(c, 500), frontKey({ ...c, reveal: { ...c.reveal, out: true } }, 500));
  assert.ok(frontKey(c, 500) > 0);
});
test('two collaterals that run on into one another share one front through their join', () => {
  // equal halves: the first's end (s 1) is the second's start (s 0) over the whole course
  assert.equal(chainS(1, 0, 0.5), 0.5);
  assert.equal(chainS(0, 1, 0.5), 0.5);
  assert.equal(chainS(1, 1, 0.5), 1);
  // at the time the front is half way through the course, the second vessel has not started where the first's end is still hairline
  assert.ok(frontScale(0.2, false, chainS(0.9, 1, 0.5)) < frontScale(0.2, false, chainS(0.1, 0, 0.5)) + 1e-12);
  for (const [a, [b, place]] of Object.entries(FRONT_CHAIN)) assert.equal(FRONT_CHAIN[b][0], a, `${a} and ${b} name each other`), assert.notEqual(place, FRONT_CHAIN[b][1]);
});
// (The wiring of the front into the figure is a rule in scripts/source-shapes/e.mjs.)
