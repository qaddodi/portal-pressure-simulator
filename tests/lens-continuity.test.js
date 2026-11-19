// The origin, first-pass and oxygen lenses at junctions (15 Nov 2026, Mohammad: the colours flickered between vessels beside a TIPS, and "nothing sharp" where vessels meet).
// Two things are held. At rest the lens colours stand still: a vessel whose mean flow hovers at zero (the left portal vein beside a TIPS, the peripheral hepatic vein)
// swung across zero with the breath and the beat, and turned its own blood and its neighbours' from one end's blend to the other's between two frames. And the colours are
// continuous through every junction (origin and first pass): every vessel starts at the blend of the junction it leaves and ends at the blend of the junction it runs into, which is the blend the
// vessels leaving that junction start with, so no vessel ends on a colour its junction does not have (blood.js ORIGIN_RAMP).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/portal/engine.js';
import { deepMerge } from '../src/engine/portal/scenario.js';
import { EDGES, NODES } from '../src/engine/portal/topology.js';
import { originFractionsInto, oxygenSat, ORIGIN_N, FLOW_FLOOR } from '../src/ui/blood.js';

const E = EDGES.length, N = ORIGIN_N, NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const state = (preset, params) => { const e = new Engine(); e.loadPreset(preset); if (params) { e.setParams(deepMerge(e.params, params)); e.settle(); } return e; };
const STATES = [
  ['cirr-decomp', { tips: { on: true, d: 8 } }], ['cirr-decomp', { tips: { on: true, d: 10 } }], ['cirr-decomp', { dips: { on: true, d: 8 } }],
  ['cirr-decomp', { spontaneous: { C6: true, C7: true } }], ['cirr-decomp', null], ['healthy', null], ['cirr-hepatofugal', { tips: { on: true, d: 8 } }],
];

test('at rest the origin, first-pass and oxygen colours stand still: no vessel changes by more than 0.05 between two model frames', () => {
  for (const [preset, params] of STATES) {
    const e = state(preset, params);
    for (let i = 0; i < 300; i++) e.step(0.05);
    const slosh = new Float64Array(E), ends = { slosh, down: new Float32Array(E * N), pe: new Float32Array(E), len: new Float64Array(E).fill(120) };
    const out = [new Float32Array(E * N), new Float32Array(E * N)];
    const prev = { o0: null, o1: null, ox: null, of: null };
    const worst = {};
    for (let f = 0; f < 700; f++) {
      e.step(0.033);
      if (f < 100) continue;   // (the first seconds: the means are still settling after the settle)
      const now = {
        o0: Float32Array.from(originFractionsInto(EDGES, NODES, e.Qf, e.Pf, out[0], ends, false)),
        o1: Float32Array.from(originFractionsInto(EDGES, NODES, e.Qf, e.Pf, out[1], ends, true)),
        ox: Float32Array.from(oxygenSat(EDGES, NODES, e.Qf, e.Pf).edge),
        of: Float32Array.from(oxygenSat(EDGES, NODES, e.Qf, e.Pf).far),
      };
      for (const key of Object.keys(now)) {
        if (!prev[key]) continue;
        const per = key === 'ox' || key === 'of' ? 1 : N, n = now[key].length / per;
        for (let k = 0; k < n; k++) for (let i = 0; i < per; i++) {
          const d = Math.abs(now[key][k * per + i] - prev[key][k * per + i]);
          const id = EDGES[key === 'ox' || key === 'of' ? k >> 1 : k].id;
          if (d > (worst[`${key} ${id}`] || 0)) worst[`${key} ${id}`] = d;
        }
      }
      Object.assign(prev, now);
    }
    const flick = Object.entries(worst).filter(([, d]) => d > 0.05);
    assert.deepEqual(flick, [], `${preset} ${JSON.stringify(params ?? {})}: colours that jumped between frames`);
  }
});

test('origin and first pass: through every junction the colour is continuous (each vessel ends on the blend its junction has, which the vessels leaving it start with)', () => {
  for (const pass of [false, true]) for (const [preset, params] of STATES) {
    const e = state(preset, params);
    for (let i = 0; i < 100; i++) e.step(0.05);
    const ends = { slosh: new Float64Array(E), down: new Float32Array(E * N), pe: new Float32Array(E), len: new Float64Array(E).fill(120) };
    const out = originFractionsInto(EDGES, NODES, e.Qf, e.Pf, new Float32Array(E * N), ends, pass);
    const at = NODES.map(() => []);   // per node: the blend of every flowing vessel's end that lies on it
    EDGES.forEach((ed, k) => {
      const q = e.Qf[k];
      if (ed.kind === 'wedge' || !(Math.abs(q) >= FLOW_FLOOR) || ed.from === 'AO' || /^A_(SMA|LGA|IMA|SPL|HEP)$/.test(ed.id) || (ed.kind === 'liver' && ed.zone === 'sin')) return;
      const fwd = q > -FLOW_FLOOR, up = fwd ? NI[ed.from] : NI[ed.to], dn = fwd ? NI[ed.to] : NI[ed.from];
      const o = Array.from(out.subarray(k * N, k * N + N)), d = ends.pe[k] !== 0 ? Array.from(ends.down.subarray(k * N, k * N + N)) : o;
      at[up].push([ed.id, 'start', o]); at[dn].push([ed.id, 'end', d]);
    });
    NODES.forEach((n, i) => {
      const L = at[i];
      for (let a = 1; a < L.length; a++) {
        const diff = Math.max(...L[a][2].map((v, c) => Math.abs(v - L[0][2][c])));
        assert.ok(diff < 0.02, `${pass ? 'first pass' : 'origin'} ${preset} ${JSON.stringify(params ?? {})}: at ${n.id}, ${L[a][0]} ${L[a][1]} differs from ${L[0][0]} ${L[0][1]} by ${diff.toFixed(3)}`);
      }
    });
  }
});

test('oxygen: through every junction the colour is continuous (a vein starts at its junction\'s saturation and ends at the one it runs into, the end it eases to over its last stretch)', () => {
  const consumes = (e) => e.kind === 'liver' && e.zone === 'sin', arterial = (e) => e.kind === 'artery' || e.kind === 'arteriole';
  for (const [preset, params] of STATES) {
    const e = state(preset, params);
    for (let i = 0; i < 100; i++) e.step(0.05);
    const o = oxygenSat(EDGES, NODES, e.Qf, e.Pf);
    let veins = 0, ramped = 0;
    EDGES.forEach((ed, k) => {
      if (ed.kind === 'wedge' || consumes(ed) || arterial(ed)) return;
      const fwd = e.Qf[k] > -FLOW_FLOOR, up = NI[fwd ? ed.from : ed.to], down = NI[fwd ? ed.to : ed.from];
      const own = fwd ? o.far[2 * k] : o.far[2 * k + 1], end = fwd ? o.far[2 * k + 1] : o.far[2 * k];
      const label = `${preset} ${ed.id}`;
      assert.ok(Math.abs(own - o.node[up]) < 1e-6, `${label}: starts at its upstream junction's saturation`);
      assert.ok(Math.abs(end - o.node[down]) < 1e-6, `${label}: ends at the saturation of the junction it runs into`);
      veins++; if (Math.abs(end - own) > 0.002) ramped++;
    });
    assert.ok(veins > 40, `${preset}: the veins were checked (${veins})`);
    assert.ok(ramped >= 1 || preset === 'healthy', `${preset}: some vein eases into a different blend (${ramped})`);
  }
});

// Mohammad's recording, 15 Nov 2026 (build 3fc5839c): the whole portal trunk and the SMV turned from one origin colour to another for a frame or two, again and again. The page gets its
// pressures as Float32 numbers; the passes visited the nodes from high pressure to low, and the hair that keeps the pieces of a cut vein in order (1e-6) is under the last bit of a Float32
// at 20 mmHg, so two nodes in series were tied, or swapped by a bit, from one frame to the next, and a node was worked out before the node that feeds it. The order now comes from the flows.
test('the colours do not depend on the pressures: the same with every pressure equal, and with the Float32 pressures the page gets nudged by a bit each frame', () => {
  const jitter = (P, seed) => { const f = Float32Array.from(P); let s = seed; for (let i = 0; i < f.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; const r = (s >>> 29) - 3.5; f[i] += r * 2 ** (Math.floor(Math.log2(Math.abs(f[i]) || 1)) - 23); } return f; };
  const same = (a, b, what) => { let worst = 0; for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i])); assert.ok(worst < 1e-5, `${what}: differs by ${worst}`); };
  for (const [preset, params] of STATES) {
    const e = state(preset, params);
    for (let i = 0; i < 200; i++) e.step(0.05);
    const Q = Float32Array.from(e.Qf), ends = { slosh: new Float64Array(E), down: new Float32Array(E * N), pe: new Float32Array(E), len: new Float64Array(E).fill(120) };
    const origin = (P, pass) => Float32Array.from(originFractionsInto(EDGES, NODES, Q, P, new Float32Array(E * N), ends, pass));
    const label = `${preset} ${JSON.stringify(params ?? {})}`;
    for (const pass of [false, true]) {
      const ref = origin(Float32Array.from(e.Pf), pass);
      same(ref, origin(new Float32Array(NODES.length), pass), `${label}: origin${pass ? ' first pass' : ''} with every pressure equal`);
      for (const seed of [1, 2, 3]) same(ref, origin(jitter(e.Pf, seed), pass), `${label}: origin${pass ? ' first pass' : ''} with the pressures nudged`);
    }
    const ox = (P) => oxygenSat(EDGES, NODES, Q, P).edge;
    const ref = ox(Float32Array.from(e.Pf));
    same(ref, ox(new Float32Array(NODES.length)), `${label}: oxygen with every pressure equal`);
    for (const seed of [1, 2, 3]) same(ref, ox(jitter(e.Pf, seed)), `${label}: oxygen with the pressures nudged`);
  }
});

// Mohammad, 15 Nov 2026 (iPhone, "Cirrhosis with reversed portal flow", Origin lens): "Why is the RPV systemic?" The right portal vein's peripheral stretch carries almost no flow with the flow
// reversed (under the passes' floor), the passes took such a flow for none, so the node it runs into had no inflow at all and read as systemic blood. A flow under the floor now carries its blood
// on (its own weight: beside a real inflow it counts for nothing). Nothing on the portal side is systemic blood unless a vessel from outside it feeds it.
test('origin and first pass: no portal-side vein or branch reads as systemic blood in any preset (a stagnant stretch carries its neighbours\' blood on)', async () => {
  const { PRESETS } = await import('../src/engine/portal/scenario.js');
  const { PORTAL_TERRITORY } = await import('../src/engine/portal/topology.js');
  const sets = PRESETS.map((p) => [p.id, null]).concat([['cirr-hepatofugal', { tips: { on: true, d: 8 } }], ['cirr-decomp', { dips: { on: true, d: 8 } }]]);
  let seen = 0;
  for (const [preset, params] of sets) {
    const e = state(preset, params);
    for (let i = 0; i < 200; i++) e.step(0.05);
    const Q = Float32Array.from(e.Qf), P = Float32Array.from(e.Pf);
    for (const pass of [false, true]) {
      const g = { origins: new Float32Array(E * N), down: new Float32Array(E * N), pe: new Float32Array(E), slosh: new Float64Array(E), len: new Float64Array(E).fill(120) };
      originFractionsInto(EDGES, NODES, Q, P, g.origins, g, pass);
      EDGES.forEach((ed, k) => {
        if ((ed.kind !== 'vein' && ed.kind !== 'liver') || ed.zone === 'sin' || !PORTAL_TERRITORY.has(ed.from) || Math.abs(Q[k]) < 1e-9) return;
        let s = 0; for (let c = 0; c < N; c++) s += g.origins[k * N + c];
        seen++;
        assert.ok(1 - s < 0.05, `${preset} ${JSON.stringify(params ?? {})}${pass ? ' first pass' : ''}: ${ed.id} (flow ${Q[k].toFixed(3)}) reads ${(100 * (1 - s)).toFixed(0)} % systemic`);
      });
    }
  }
  assert.ok(seen > 200, `the portal side was looked at (${seen} vessels)`);
});
