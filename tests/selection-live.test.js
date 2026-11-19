// A card never outlives its device (Mohammad's play-test, 16 Nov 2026): a patient switch, an undo or a take-down that removes a stent, a surgical shunt or a shunt of
// the learner's own also puts away the card open on it. Every placed device is covered, not only the TIPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionGone, watchSelection } from '../src/ui/selection-live.js';
import { defaultParams } from '../src/engine/portal/scenario.js';
import { EDGES } from '../src/engine/portal/topology.js';

const edge = (id) => ({ type: 'edge', id });

test('a stent card goes with the stent, every placed device does, and nothing else is let go', () => {
  const p = defaultParams();
  for (const [id, set] of [['TIPS', (q) => { q.tips = { on: true, d: 8 }; }], ['DIPS', (q) => { q.dips = { on: true, d: 8 }; }], ['S_DSR', (q) => { q.dsrs = true; }],
    ['S_PC', (q) => { q.portocaval = true; }], ['S_MC', (q) => { q.mesocaval = true; }], ['REX', (q) => { q.rex = true; }]]) {
    assert.ok(selectionGone(edge(id), p), `${id} is not in the patient`);
    const q = structuredClone(p); set(q);
    assert.ok(!selectionGone(edge(id), q), `${id} is in place`);
  }
  assert.ok(!selectionGone(edge('SMV'), p), 'a vessel stays selected');
  assert.ok(!selectionGone({ type: 'organ', id: 'varices' }, p), 'an organ stays selected');
  assert.ok(!selectionGone(null, p));
  const custom = EDGES.find((e) => e.shunt === 'custom');
  if (custom) { assert.ok(selectionGone(edge(custom.id), p)); assert.ok(!selectionGone(edge(custom.id), { ...p, customShunts: { [custom.id]: 6 } })); }
});

test('the store watcher clears the selection when a parameter change takes its device out, and keeps it while the device is there', () => {
  let on = false, sel = edge('TIPS'); const calls = []; let fire = () => {};
  const store = { get: () => ({ selection: sel, params: { ...defaultParams(), tips: { on, d: 8 } } }), set: (patch) => { calls.push(patch); sel = patch.selection; }, on: (k, fn) => { if (k === 'params') fire = fn; return () => {}; } };
  watchSelection(store);
  on = true; fire(); assert.deepEqual(calls, [], 'TIPS in place: the card stays');
  on = false; fire(); assert.deepEqual(calls, [{ selection: null }], 'the patient without the TIPS: the card goes');
  fire(); assert.equal(calls.length, 1, 'once');
});
