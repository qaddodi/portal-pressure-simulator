import { stageSource } from './stage-src.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chainsOf, monotoneSlopes, planTaper, taperAt, slopesInto, planChainInto } from '../src/ui/vessel-taper.js';

// Vessels that run on into one another narrow or widen as one continuous taper (Mohammad, 1 Nov: "those paths aren't smoothly
// tapering"). Each used to keep its own caliber over its whole course and ease only its ends toward the neighbour, one smoothstep
// over half of each vessel counted in samples, so a long vessel and a short one met at slopes three times apart and a run of
// vessels read as plateau, ramp, plateau.

const V = (...pairs) => new Map(pairs.map(([id, body, len]) => [id, { body, len }]));
const at = (plan, vessels, id, u) => taperAt(plan.get(id), vessels.get(id).len, u);
// The slope along the vessel's own length at u (central difference).
const slope = (plan, vessels, id, u, h = 1e-5) => {
  const L = vessels.get(id).len, a = Math.max(0, u - h / L), b = Math.min(1, u + h / L);
  return (at(plan, vessels, id, b) - at(plan, vessels, id, a)) / ((b - a) * L);
};

test('chains follow the links end to end, from a free end, whichever way each vessel runs', () => {
  const ids = new Set([1, 2, 3]);
  // 1's end runs on into 2's end (2 is walked backwards), and 2's start into 3's start.
  const chains = chainsOf(ids, [{ a: 1, ea: 1, b: 2, eb: 1 }, { a: 2, ea: 0, b: 3, eb: 0 }]);
  assert.equal(chains.length, 1);
  assert.deepEqual(chains[0], [{ id: 1, enter: 0 }, { id: 2, enter: 1 }, { id: 3, enter: 0 }]);
  // From the other free end the same chain, the other way round.
  const rev = chainsOf(new Set([3, 2, 1]), [{ a: 2, ea: 0, b: 3, eb: 0 }, { a: 1, ea: 1, b: 2, eb: 1 }]);
  assert.equal(rev.length, 1);
  assert.deepEqual(rev[0].map((c) => c.id), [3, 2, 1]);
});

test('vessels with no link, links to a vessel not drawn, a vessel run on into itself and a second link on one end are left out', () => {
  assert.deepEqual(chainsOf(new Set([1, 2, 3]), []), []);
  assert.deepEqual(chainsOf(new Set([1, 2]), [{ a: 1, ea: 1, b: 9, eb: 0 }]), []);
  assert.deepEqual(chainsOf(new Set([1]), [{ a: 1, ea: 1, b: 1, eb: 0 }]), []);
  // Each end runs on into one other at most: the first link holds.
  const c = chainsOf(new Set([1, 2, 3]), [{ a: 1, ea: 1, b: 2, eb: 0 }, { a: 1, ea: 1, b: 3, eb: 0 }]);
  assert.deepEqual(c.map((x) => x.map((y) => y.id)), [[1, 2]]);
});

test('a loop of vessels is cut once and every vessel is still in one chain', () => {
  const links = [{ a: 1, ea: 1, b: 2, eb: 0 }, { a: 2, ea: 1, b: 3, eb: 0 }, { a: 3, ea: 1, b: 1, eb: 0 }];
  const chains = chainsOf(new Set([1, 2, 3]), links);
  assert.equal(chains.length, 1);
  assert.deepEqual(chains[0].map((c) => c.id).sort(), [1, 2, 3]);
  const vessels = V([1, 3, 100], [2, 4, 100], [3, 5, 100]);
  assert.equal(planTaper(vessels, links).size, 3);
});

test('no links: no plan, so no vessel is touched', () => {
  assert.equal(planTaper(V([1, 3, 100]), []).size, 0);
  assert.equal(planTaper(V([1, 3, 100], [2, 5, 100]), [{ a: 1, ea: 1, b: 7, eb: 0 }]).size, 0);
});

test('two vessels of one caliber stay exactly flat at it', () => {
  const vessels = V([1, 3.7, 80], [2, 3.7, 40]), plan = planTaper(vessels, [{ a: 1, ea: 1, b: 2, eb: 0 }]);
  for (const id of [1, 2]) for (let i = 0; i <= 20; i++) assert.equal(at(plan, vessels, id, i / 20), 3.7);
});

test('the node stands at the mean of the two calibers and the free ends at their own', () => {
  const vessels = V([1, 2, 100], [2, 4, 100]), plan = planTaper(vessels, [{ a: 1, ea: 1, b: 2, eb: 0 }]);
  assert.equal(plan.get(1).y0, 2); assert.equal(plan.get(2).y1, 4);
  assert.equal(plan.get(1).y1, 3); assert.equal(plan.get(2).y0, 3);
  assert.deepEqual([plan.get(1).j0, plan.get(1).j1, plan.get(2).j0, plan.get(2).j1], [false, true, true, false]);
  // The free ends leave flat: the vessel does not tilt away from its own caliber there.
  assert.equal(plan.get(1).d0, 0); assert.equal(plan.get(2).d1, 0);
});

test('caliber and slope are continuous through a join of a long vessel and a short one (the kink the old ease had)', () => {
  // The right portal vein's stretch into the pre-sinusoid one: 4.19 over 107 into 2.3 over 47, then the sinusoid stretch 1.8 over 108.
  const vessels = V([1, 4.19, 107], [2, 2.3, 47], [3, 1.8, 108]);
  const plan = planTaper(vessels, [{ a: 1, ea: 1, b: 2, eb: 0 }, { a: 2, ea: 1, b: 3, eb: 0 }]);
  for (const [a, b] of [[1, 2], [2, 3]]) {
    assert.ok(Math.abs(at(plan, vessels, a, 1) - at(plan, vessels, b, 0)) < 1e-12, 'one caliber at the join');
    const sa = slope(plan, vessels, a, 1), sb = slope(plan, vessels, b, 0);
    assert.ok(Math.abs(sa - sb) < 1e-6, `one slope in length at the join: ${sa} against ${sb}`);
  }
  // The old ease (a smoothstep over half of each, in samples) met at 1.5 Δ / (half length) on each side: 0.0089 against 0.0255 here.
  const S = (x) => x * x * (3 - 2 * x), oldA = 1.5 * (4.19 - 2.3) / 2 / 107 * 2, oldB = 1.5 * (4.19 - 2.3) / 2 / 47 * 2;
  assert.ok(oldB / oldA > 2.2 && S(0.5) === 0.5, 'the kink this replaces');
});

test('a run is monotone between the calibers it passes and never overshoots them', () => {
  const vessels = V([1, 1.8, 74], [2, 4.2, 125], [3, 3, 60], [4, 5, 200]);
  const plan = planTaper(vessels, [{ a: 1, ea: 1, b: 2, eb: 0 }, { a: 2, ea: 1, b: 3, eb: 0 }, { a: 3, ea: 1, b: 4, eb: 0 }]);
  for (const id of [1, 2, 3, 4]) {
    const p = plan.get(id), lo = Math.min(p.y0, p.y1) - 1e-9, hi = Math.max(p.y0, p.y1) + 1e-9;
    let prev = at(plan, vessels, id, 0);
    for (let i = 1; i <= 200; i++) {
      const r = at(plan, vessels, id, i / 200);
      assert.ok(r >= lo && r <= hi, `vessel ${id} stays between its end calibers`);
      if (p.y1 !== p.y0) assert.ok((r - prev) * (p.y1 - p.y0) >= -1e-9, `vessel ${id} moves one way`);
      prev = r;
    }
  }
});

test('a vessel walked against its own direction gets the same taper, mirrored', () => {
  // 1 runs on into 2 at 2's END: 2 is walked backwards. 4.0 | 2.0 along the chain, 2's own u runs against it.
  const vessels = V([1, 4, 100], [2, 2, 100]), plan = planTaper(vessels, [{ a: 1, ea: 1, b: 2, eb: 1 }]);
  assert.equal(plan.get(2).y1, 3); assert.equal(plan.get(2).y0, 2);   // (its end is at the node, its start is free)
  assert.deepEqual([plan.get(2).j0, plan.get(2).j1], [false, true]);
  assert.ok(Math.abs(at(plan, vessels, 1, 1) - at(plan, vessels, 2, 1)) < 1e-12);
  // Going down the chain the radius falls: along 2's u it rises toward the node.
  assert.ok(Math.abs(slope(plan, vessels, 1, 1) + slope(plan, vessels, 2, 1)) < 1e-6, 'the same slope at the node, seen from each side');
  // Mirror of the forward chain.
  const fwd = V([1, 4, 100], [2, 2, 100]), pf = planTaper(fwd, [{ a: 1, ea: 1, b: 2, eb: 0 }]);
  for (let i = 0; i <= 10; i++) assert.ok(Math.abs(at(pf, fwd, 2, i / 10) - at(plan, vessels, 2, 1 - i / 10)) < 1e-12);
});

test('where the calibers turn (narrow, wide, narrow) the slope is zero at the turn, not an overshoot', () => {
  const s = [0, 100, 200, 300], y = [2, 4, 4, 2];
  assert.deepEqual(monotoneSlopes(s, y).map((d) => +d.toFixed(9)), [0, 0, 0, 0]);
  assert.deepEqual(monotoneSlopes([0, 1], [1, 2]), [0, 0], 'two stations: flat at both');
  const d = monotoneSlopes([0, 100, 300, 400], [1, 2, 6, 7]);
  assert.ok(d[1] > 0 && d[2] > 0 && d[0] === 0 && d[3] === 0);
});

test('the taper is a pure function of the calibers and lengths: nothing carries between plans', () => {
  const vessels = V([1, 2, 100], [2, 4, 100]), links = [{ a: 1, ea: 1, b: 2, eb: 0 }];
  assert.deepEqual([...planTaper(vessels, links)], [...planTaper(vessels, links)]);
  assert.ok(Number.isFinite(at(planTaper(V([1, 2, 0], [2, 4, 0]), links), V([1, 2, 0], [2, 4, 0]), 1, 0.5)), 'a vessel of no length does not break it');
});

// ── The wiring (stage.js is not loaded by the unit tests: nobody can run it without a browser).
const stage = stageSource();

test('the GPU radii take the run\'s taper for vessels that run on at a two-vessel node; forks, strands and the cava drawn as one keep their own eases', () => {
  // (Allocation-free since 2 Nov 2026: the chains are found again only when the links change, each chain planned into kept plans.)
  assert.match(stage, /import \{ chainsOf, planChainInto \} from '\.\/vessel-taper\.js/);
  assert.match(stage, /const plainRow = \(row\) => \{ const it = rowIt\[row\]; return !!it && it\.kind !== 's' && !it\.ra && !!it\.obj\.glR0; \};/);
  assert.match(stage, /L\.chained = !L\.fork && plainRow\(L\.a\) && plainRow\(L\.b\);/);
  assert.match(stage, /tapChains = chainsOf\(tapIds, tapLinks\)\.filter\(\(c\) => c\.length >= 2\);/);
  assert.match(stage, /planChainInto\(chain, tapBodyOf, tapLenOf, tapPlanOf, tapS, tapY, tapD, tapH, tapK\);/);
  // (The vessel's own radii scaled by the plan over its own caliber: a stenosis's waist rides on the taper.)
  assert.match(stage, /E\[i\] = R0\[i\] \* \(\(\(2 \* u3 - 3 \* u2 \+ 1\) \* y0 \+ \(u3 - 2 \* u2 \+ u\) \* len \* d0 \+ \(-2 \* u3 \+ 3 \* u2\) \* y1 \+ \(u3 - u2\) \* len \* d1\) \/ body\);/);
  // The fork's funnel and the pairs left out of the plan go on as before.
  assert.match(stage, /if \(L\.chained\) continue;/);
  assert.match(stage, /if \(fork\) \{/);
});

test('planChainInto and slopesInto give planTaper\'s and monotoneSlopes\'s numbers exactly, allocating nothing of their own', () => {
  const s = [0, 3, 4.5, 10, 11], y = [2, 2.4, 1.1, 1.1, 3];
  const d = new Array(5), h = new Array(5), k = new Array(5);
  assert.deepEqual([...slopesInto(s, y, 5, d, h, k)], monotoneSlopes(s, y));
  assert.deepEqual([...slopesInto([0, 1], [1, 2], 2, d, h, k)].slice(0, 2), monotoneSlopes([0, 1], [1, 2]));
  const vessels = new Map([['a', { body: 3, len: 40 }], ['b', { body: 2, len: 10 }], ['c', { body: 2.5, len: 25 }], ['d', { body: 1, len: 0 }], ['e', { body: 4, len: 7 }]]);
  const links = [{ a: 'a', ea: 1, b: 'b', eb: 0 }, { a: 'c', ea: 1, b: 'b', eb: 1 }, { a: 'd', ea: 0, b: 'e', eb: 1 }];
  const want = planTaper(vessels, links), got = new Map();
  const S = [], Y = [], D = [], H = [], K = [];
  for (const chain of chainsOf(new Set(vessels.keys()), links)) {
    planChainInto(chain, (id) => vessels.get(id).body, (id) => vessels.get(id).len, (id) => { if (!got.has(id)) got.set(id, {}); return got.get(id); }, S, Y, D, H, K);
  }
  assert.equal(got.size, want.size);
  for (const [id, p] of want) assert.deepEqual(got.get(id), p, id);
});

test('the GPU is the only drawer of the tubes: there is no SVG taper path left, and renderTube takes no plan', () => {
  assert.doesNotMatch(stage, /svgTaper|const TP = /);
  assert.equal(stage.match(/renderTube\(x, p, t, J\);/g).length, 2);
});
