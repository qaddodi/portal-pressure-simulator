// A divided vein's cut-away start meets nothing (vein-joins.js cutAway; the dark hole at the Warren splenic turn, 13 Nov 2026): the vein that turns
// down into the shunt and the shunt join each other, and the cut vein's start is in no join. Judged by the joins' members, in numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { veinJoins, newJoinStore } from '../src/ui/vein-joins.js';

const N = 64;
const line = (a, b) => Array.from({ length: N }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (N - 1), a[1] + ((b[1] - a[1]) * i) / (N - 1)]);
const item = (id, from, to, pts, row, extra = {}) => ({ x: { isArt: false, e: { id, from, to } }, obj: { glR: new Float64Array(N).fill(4), glMaxR: 4 }, row, kind: 'v', pts, ...extra });
// the splenic vein (spleen to the turn), the divided vein (the turn to the portal vein), the shunt (the turn down)
const figure = (cut) => [
  item('V_SPL', 'spl', 'turn', line([100, 0], [0, 0]), 0),
  item('SV_MID', 'turn', 'pv', line([0, 0], [-100, 40]), 1, { cut }),
  item('S_DSR', 'turn', 'ren', line([0, 0], [10, 120]), 2),
];
const rowsOf = (J) => J.flatMap((j) => j.members);

test('without a cut the divided vein is in the joins at the turn', () => {
  assert.ok(rowsOf(veinJoins(figure(0), N, newJoinStore())).includes(1));
});

test('a cut vein is in no join, and the splenic vein and the shunt still join each other', () => {
  const J = veinJoins(figure(60), N, newJoinStore());
  assert.ok(!rowsOf(J).includes(1), 'the cut start meets nothing');
  assert.ok(J.some((j) => j.members.includes(0) && j.members.includes(2)), 'the splenic vein and the shunt join');
});

test('a vein that ends on the cut stretch is not joined to it', () => {
  const f = figure(60).slice(1);   // (the cut vein alone, and a vessel ending on its first stretch)
  f.push(item('X', 'a', 'b', line([5, -60], [-10, 4]), 3));
  assert.ok(!rowsOf(veinJoins(f, N, newJoinStore())).includes(1));
});

// The portocaval confluence: the portal trunk's cut-away start (ghost0) still counts in choosing the groups (the whole junction's), then is taken out of them.
test('a ghost start is in no join and no run-on, and the other ends still join', () => {
  const at = (id, from, to, dir, row, extra = {}) => item(id, from, to, line([0, 0], [dir[0] * 100, dir[1] * 100]), row, extra);
  const make = (ghost0) => [
    at('SMV', 'smv', 'conf', [-0.12, 0.99], 0), at('SV', 'sv', 'conf', [0.98, -0.18], 1), at('S_PC', 'conf', 'ivc', [-0.5, 0.86], 2), at('PV', 'conf', 'pvh', [-0.6, -0.8], 3, { ghost0 }),
  ].map((it, i) => (i === 0 || i === 1 ? { ...it, x: { ...it.x, e: { ...it.x.e, from: it.x.e.from, to: 'conf' } }, pts: it.pts.slice().reverse() } : it));
  const withGhost = veinJoins(make(true), N, newJoinStore()), without = veinJoins(make(false), N, newJoinStore());
  assert.ok(rowsOf(without).includes(3), 'without the ghost flag the cut start joins');
  assert.ok(!rowsOf(withGhost).includes(3), 'with it the ghost start is in no join');
  assert.ok(withGhost.some((j) => j.members.length >= 2), 'the drawn ends still join');
});
