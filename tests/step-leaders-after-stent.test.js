// Slide 51 after slide 50 (Mohammad, iPhone, 5 Nov 2026: "No leaders. And they still blink."). The stent slide's TIPS reading stayed in the
// label pool after it faded; on the healthy liver its station has no point, and pinning it threw every frame, so no later label got its
// leader or dot. Every step number shown off its point must have its leader and dot, every frame, and none may show before its number.
// slide 50 (stent: cirr-decomp + TIPS 8 mm, cam route, TIPS caliper) -> slide 51 (healthy, fit, steps), presenter order, phone portrait
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, now, pump } from './stage-gl-boot.js';
test('slide 51 after the TIPS stent slide: each step number keeps its leader and dot, and no mark shows before its number', async () => {
const { st, page } = await bootGL({ w: 395, h: 859, dpr: 3, coarse: true });
const { store } = await import('../src/ui/store.js');
const { stepPlan } = await import('../src/ui/callout-math.js');
const { EDGES } = await import('../src/engine/topology.js');
const { createCore } = await import('../src/worker-core.js');
const EIDS = new Set(EDGES.map((e) => e.id)), doc = page.document;
const SEQ = 550, GLOW = ['V_INT', 'PV_TRUNK', 'SIN_RR', 'RHV_IVC', 'IVCS_RA'];
const tasks = () => new Promise((r) => setImmediate(r));
let q = [];
const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
await core.handle({ type: 'init' });
await core.handle({ type: 'preset', id: 'cirr-decomp' });
const P = JSON.parse(JSON.stringify(core.engine().params)); P.tips = { ...(P.tips || {}), on: true, d: 8 };
await core.handle({ type: 'setParams', params: P, settle: true });
await core.handle({ type: 'run', running: true });
let lastF = null;
const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
doc.querySelector('.app')?.style.setProperty('--pz-b', '260px');
store.set({ presenting: true, presentLabels: ['CONF'], presentTerms: null, params: P });
st.fitSlow(800);
for (let i = 0; i < 150; i++) await step();
// slide 51: overlays cleared, patient change to healthy eased, camera to fit, then overlays
st.setGlow(null); st.callouts(null);
store.set({ presentLabels: [], params: (await import('../src/engine/params.js').catch(() => null))?.defaultParams?.() || store.get().params });
const H = JSON.parse(JSON.stringify(P)); H.tips = { ...H.tips, on: false };
await core.handle({ type: 'preset', id: 'healthy' });
st.fitSlow(1300);
for (let i = 0; i < 110; i++) await step();
const t0 = now();
st.setGlow(GLOW.map((id, i) => ({ id, tone: 'accent', at: i * SEQ })));
st.callouts({ live: {}, organs: [], calipers: [], spans: [], zone: -1, steps: stepPlan(GLOW, SEQ, (id) => EIDS.has(id), () => false) });
const errs = [];
const oe = console.error; console.error = (...a) => { errs.push(a.map(String).join(' ')); };
const bad = [];
for (let i = 0; i < 300; i++) {
  await step();
  const sn = st.labelSnapshot() || {}, items = sn.items || [], marks = sn.marks || [];
  for (let n = 1; n <= 5; n++) {
    const k = 'fxs:' + n, d = items.find((x) => x.key === k);
    const mk = marks.filter((m) => m.k === k && m.a > 0.05).length;
    const a = d ? +d.a : 0;
    if (a > 0.5 && mk < 2) bad.push(`${Math.round(now() - t0)} ms: ${k} at ${a.toFixed(2)} with ${mk} marks`);
    if (a < 0.02 && mk) bad.push(`${Math.round(now() - t0)} ms: ${k} not shown yet but ${mk} marks drawn`);
  }
}
console.error = oe;
const sn = st.labelSnapshot() || {};
for (let n = 1; n <= 5; n++) assert.ok((sn.items || []).some((x) => x.key === 'fxs:' + n && +x.a > 0.9), `fxs:${n} is shown at the end`);
assert.deepEqual(bad.slice(0, 8), []);
assert.deepEqual(errs.filter((e) => /failed|TypeError/.test(e)).slice(0, 3), []);
});
