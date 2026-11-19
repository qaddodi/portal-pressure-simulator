// A clotted or narrowed vessel's card reads its pressure in → out, and those two numbers are the map's own nodes at the vein's two ends (play-test 17 Nov 2026,
// iPhone, Budd–Chiari: the right hepatic vein's card read 4.0 → 4.0 while the map's label for the same vein read 24.8 beside the sinusoids at 24.8). The vein is split
// in pieces where the TIPS joins it (topology.js JUNCTIONS), and the card had read the ends of the one piece it was given, the piece beside the cava.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost/' });
for (const k of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'getComputedStyle']) globalThis[k] ??= dom.window[k];
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
import { Engine } from '../src/engine/portal/engine.js';
import { EDGES, NODES, JUNCTION_HOST_ENDS, partOf } from '../src/engine/portal/topology.js';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const one = (x) => x.toFixed(1);

for (const preset of ['budd-chiari', 'pvt-chronic', 'pvt-acute', 'svt']) {
  test(`${preset}: every blocked vessel's card reads the map's pressure at its first end, then at its last`, async () => {
    const { store } = await import('../src/ui/store.js');
    const { edgeValue } = await import('../src/ui/actions.js');
    const e = new Engine();
    try { e.loadPreset(preset); } catch { return; }
    const f = e.snapshot(), p = e.params;
    store.set({ params: p });
    const blocked = EDGES.filter((x) => (p.thrombus?.[partOf(x.id)] > 0 || p.stenosis?.[partOf(x.id)] > 0) && !x.shunt);
    assert.ok(blocked.length || preset === 'svt', `${preset} has a blocked vessel`);
    for (const x of blocked) {
      const host = partOf(x.id), ends = JUNCTION_HOST_ENDS[host] || [x.from, x.to];
      const PF = f.Pf || f.P;
      const want = `${one(PF[NI[ends[0]]])} → ${one(PF[NI[ends[1]]])}`;
      const got = edgeValue(x, f, 'pressure', null, true);
      assert.equal(got.v, want, `${x.id} (${host}): the card's ends are the map's nodes ${ends.join(' → ')}`);
    }
  });
}

// The phone's card draws its in → out bar from spanOfEdge (actions.js), a path of its own: it must read the same nodes.
for (const preset of ['budd-chiari', 'pvt-chronic']) {
  test(`${preset}: the card's in → out bar reads the whole vein's end nodes, whichever piece the card is opened on`, async () => {
    const { spanOfEdge } = await import('../src/ui/actions.js');
    const e = new Engine();
    e.loadPreset(preset);
    const f = e.snapshot(), PF = f.Pf || f.P, p = e.params;
    let n = 0;
    for (const x of EDGES.filter((y) => p.thrombus?.[partOf(y.id)] > 0 && !y.shunt)) {
      const ends = JUNCTION_HOST_ENDS[partOf(x.id)] || [x.from, x.to], k = EDGES.indexOf(x);
      const q = f.Qf ? f.Qf[k] : f.Q[k], pair = q >= -0.01 ? ends : [ends[1], ends[0]];
      const s = spanOfEdge(x).at(f);
      assert.equal(one(s.a), one(PF[NI[pair[0]]]), `${x.id}: in`);
      assert.equal(one(s.b), one(PF[NI[pair[1]]]), `${x.id}: out`);
      n++;
    }
    assert.ok(n > 0);
  });
}

// A vein whose flow runs backward reads its bar from the far end to the near end: the else branch of spanOfEdge once sat inside a comment, so it never ran.
test('spanOfEdge: reversed flow swaps the bar (the else branch is code, not a comment)', async () => {
  const { spanOfEdge } = await import('../src/ui/actions.js');
  const e = new Engine();
  e.loadPreset('budd-chiari');
  const f = e.snapshot();
  const x = EDGES.find((y) => !y.shunt && !JUNCTION_HOST_ENDS[partOf(y.id)]);
  const k = EDGES.indexOf(x);
  const P = Array.from(f.Pf || f.P), Q = Array.from(f.Q);
  P[NI[x.from]] = 10; P[NI[x.to]] = 3;
  Q[k] = 1;
  const fwd = spanOfEdge(x).at({ P, Q });
  assert.deepEqual([fwd.a, fwd.b], [10, 3], 'forward flow reads from → to');
  Q[k] = -1;
  const back = spanOfEdge(x).at({ P, Q });
  assert.deepEqual([back.a, back.b], [3, 10], 'reversed flow reads to → from');
});
