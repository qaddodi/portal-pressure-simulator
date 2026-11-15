// The origin, first-pass and oxygen lenses at junctions (15 Nov 2026, Mohammad: the colours flickered between vessels beside a TIPS, and "nothing sharp" where vessels meet).
// Two things are held. At rest the lens colours stand still: a vessel whose mean flow hovers at zero (the left portal vein beside a TIPS, the peripheral hepatic vein)
// swung across zero with the breath and the beat, and turned its own blood and its neighbours' from one end's blend to the other's between two frames. And the colours are
// continuous through every junction (origin and first pass): every vessel starts at the blend of the junction it leaves and ends at the blend of the junction it runs into, which is the blend the
// vessels leaving that junction start with, so no vessel ends on a colour its junction does not have (blood.js ORIGIN_RAMP).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { deepMerge } from '../src/engine/scenario.js';
import { EDGES, NODES } from '../src/engine/topology.js';
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
    const prev = { o0: null, o1: null, ox: null };
    const worst = {};
    for (let f = 0; f < 700; f++) {
      e.step(0.033);
      if (f < 100) continue;   // (the first seconds: the means are still settling after the settle)
      const now = {
        o0: Float32Array.from(originFractionsInto(EDGES, NODES, e.Qf, e.Pf, out[0], ends, false)),
        o1: Float32Array.from(originFractionsInto(EDGES, NODES, e.Qf, e.Pf, out[1], ends, true)),
        ox: Float32Array.from(oxygenSat(EDGES, NODES, e.Qf, e.Pf).edge),
      };
      for (const key of Object.keys(now)) {
        if (!prev[key]) continue;
        const per = key === 'ox' ? 1 : N, n = now[key].length / per;
        for (let k = 0; k < n; k++) for (let i = 0; i < per; i++) {
          const d = Math.abs(now[key][k * per + i] - prev[key][k * per + i]);
          const id = EDGES[key === 'ox' ? k >> 1 : k].id;
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
