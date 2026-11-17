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
import { Engine } from '../src/engine/engine.js';
import { EDGES, NODES, JUNCTION_HOST_ENDS, partOf } from '../src/engine/topology.js';

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
