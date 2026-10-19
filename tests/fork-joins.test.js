import test from 'node:test';
import assert from 'node:assert/strict';
import { forkJoins } from '../src/ui/fork-joins.js';

const unit = (x, y) => { const L = Math.hypot(x, y); return [x / L, y / L]; };
// A pair of members, order-free.
const has = (groups, m, fillet) => groups.some((g) => g.members.length === m.length && m.every((i) => g.members.includes(i)) && (fillet == null || Math.abs(g.fillet - fillet) < 1e-9));

test('a tributary on a trunk node fillets to both trunk stretches, never the trunk to itself', () => {
  // Splenic vein from the right, on to the left; the shunt (or the IMV) down.
  const { groups, runOn } = forkJoins([unit(1, -1), unit(-1, 1), unit(0, 1)]);
  assert.deepEqual(runOn, [0, 1]);
  assert.ok(has(groups, [0, 1], 0), 'the trunk runs on with no fillet');
  assert.ok(has(groups, [0, 2], 1) && has(groups, [1, 2], 1), 'the tributary is filleted to each stretch');
  assert.ok(!groups.some((g) => g.fillet === 1 && g.members.includes(0) && g.members.includes(1)), 'no full fillet across the trunk');
});

test('a four-way fork keeps the run-on pair apart from its full fillet', () => {
  const { groups, runOn } = forkJoins([unit(0, -1), unit(0, 1), unit(1, 0.2), unit(-1, 0.3)]);
  assert.deepEqual(runOn, [0, 1]);
  assert.ok(has(groups, [0, 2, 3], 1) && has(groups, [1, 2, 3], 1) && has(groups, [0, 1], 0));
  for (const g of groups) assert.ok(g.members.length <= 4);
});

test('joins without a head-on pair, two-end run-ons and crowded joins are as before', () => {
  assert.deepEqual(forkJoins([unit(1, 0), unit(-0.5, 0.87), unit(-0.5, -0.87)]), { groups: [{ members: [0, 1, 2], fillet: 1 }], runOn: null });
  const two = forkJoins([unit(1, 0), unit(-1, 0.05)]);
  assert.deepEqual(two.runOn, [0, 1]);
  assert.equal(two.groups.length, 1);
  assert.ok(two.groups[0].fillet < 0.1);
  // A vessel passing the join (no end there) never runs on.
  assert.deepEqual(forkJoins([unit(0, 1), null]), { groups: [{ members: [0, 1], fillet: 1 }], runOn: null });
  const crowd = forkJoins(Array.from({ length: 5 }, (_, i) => unit(Math.cos(i * 1.2566), Math.sin(i * 1.2566))));
  assert.equal(crowd.runOn, null);
  assert.equal(crowd.groups.length, 10);
});
