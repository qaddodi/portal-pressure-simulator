// Phase 2 of the compiler's tests (plan 9.A), the deck slides: every distinct patient a slide of any deck asks for (its preset with its params
// merged, as the model applies them: worker-core's step), compiled from the binning the stage gives the vessel renderer and judged by the oracles
// (tests/vec-oracle.js), and the width easing from each state to the next (test 7: rowsPast, recompileRows). About 15 minutes: run on request,
//   VEC_SWEEP=1 node --test tests/vec-compile-decks.test.js
import { bootAnatomy, taps, sweeps } from './vec-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge } from '../src/engine/scenario.js';
import { NS } from '../src/ui/vec-compile.js';
import { build, checkBuilt, check1, check2, check3, check5, checkEasing } from './vec-oracle.js';

const RUN = !!process.env.VEC_SWEEP;
test('every deck slide\'s patient compiles and eases its widths inside the compiled reach or through recompileRows', { skip: RUN ? false : 'run on request: VEC_SWEEP=1', timeout: 3600000 }, async (t) => {
  const { DECKS } = await import('../src/ui/decks.js');
  const states = new Map();
  for (const d of DECKS) for (const s of d.slides || []) {
    if (!s.preset && !s.params) continue;
    const key = JSON.stringify([s.preset || null, s.params || null]);
    if (!states.has(key)) states.set(key, { preset: s.preset, params: s.params, at: `${d.id}/${s.id}` });
  }
  const A = await bootAnatomy();
  const { store } = await import('../src/ui/store.js');
  let prev = null, i = 0, eased = 0, past = 0, members = 0, joins = 0;
  const lines = [];
  for (const st of states.values()) {
    i++;
    if (st.preset) await A.core.handle({ type: 'preset', id: st.preset });
    if (st.params) { const P = deepMerge(JSON.parse(JSON.stringify(A.core.engine().params)), st.params); await A.core.handle({ type: 'setParams', params: P, settle: true }); }
    store.set({ params: A.core.engine().params });
    await A.step(i === 1 ? 40 : 12);
    const fig = A.figure(), v = build(fig), name = st.at;
    for (const tp of taps) tp.sets.length = 0;   // (the morph sets and sweeps of earlier states are not needed: they would fill the heap)
    sweeps.length = 0;
    process.stderr.write(`state ${i}/${states.size} ${name}\n`);
    checkBuilt(v, t, name); check1(v, t, name, { step: 8 }); check2(v, t, name); check3(v, t, name); check5(v, t, name);
    members = Math.max(members, v.out.stats.maxMembers); joins = Math.max(joins, v.out.stats.maxJoins);
    if (prev) {   // the widths of this state given to the previous state's compiled grid
      const radAll = new Float32Array(fig.nTubes * NS * 4);
      for (let k = 0; k < fig.nTubes * NS; k++) radAll[k * 4] = fig.rad[k];
      past += checkEasing(prev, radAll); eased++;
    }
    prev = v;
    lines.push(`${st.at}: ${v.out.stats.regions} regions, ${v.out.stats.simple} ordinary, largest ${v.out.stats.maxMembers} vessels / ${v.out.stats.maxJoins} joins`);
  }
  t.diagnostic(`${states.size} patients; ${eased} easings checked, ${past} rows past in all; most vessels in a region ${members}, most joins ${joins}\n${lines.join('\n')}`);
  assert.ok(states.size > 40);
});
