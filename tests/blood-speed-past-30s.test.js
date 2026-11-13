// The blood keeps its speed past 30 s untouched (13 Nov 2026, Mohammad: the chevrons "slow down randomly when nothing has changed"). Until then
// Explore eased the blood to a stop 30 s after the last input (idle rest, 1 Nov); now nothing stops it, and the rest pacing (frame.js restGapFor:
// 30 frames a second after 4 s, 20 after 30 s) only draws fewer frames. A frame sequence on the fake clock: the blood clock the shader is given
// (the vessels' `clock` uniform) runs at one second a second before rest, in the 30 Hz rest and past 30 s in the 20 Hz idle step alike.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump, now } from './stage-gl-boot.js';

test('the blood clock runs at one second a second through the rest and idle steps (no slow-down past 30 s)', async () => {
  const { makeGL } = await import('../scripts/warm/gl-stub.mjs');
  const P = Object.getPrototypeOf(makeGL({ width: 1, height: 1 }));
  const uLoc = P.getUniformLocation, u1 = P.uniform1f;
  let clock = NaN, sets = 0;
  P.getUniformLocation = function (p, name) { const o = uLoc.call(this, p, name); if (o && typeof o === 'object') o.__n = name; return o; };
  P.uniform1f = function (loc, v) { if (loc && /^u?_?clock$/i.test(loc.__n || '')) { clock = v; sets++; } return u1?.call(this, loc, v); };
  try {
    const { st } = await bootGL({ w: 1200, h: 800, labels: 'none' });
    const { store } = await import('../src/ui/store.js');
    const { createCore } = await import('../src/worker-core.js');
    const tasks = () => new Promise((r) => setImmediate(r));
    let q = [], healthy = null;
    const core = createCore((m) => { if (m.type === 'frame') q.push(m); else if (m.type === 'healthy') healthy = m; });
    await core.handle({ type: 'init' });
    await core.handle({ type: 'healthyProfile', reqId: 1 });
    store.set({ healthy: { P: healthy.P, Q: healthy.Q, D: healthy.D, metrics: healthy.metrics } });
    await core.handle({ type: 'ackPaint', on: true });
    await core.handle({ type: 'run', running: true });
    store.set({ running: true, params: core.engine().params, layers: { ...store.get().layers, flow: true } });
    const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) { st.update(f); core.handle({ type: 'painted' }); } await tasks(); };
    // (The clock's advance over `secs` seconds of screen frames, against the fake clock's own; it wraps at 10000 s, far off here.)
    const perS = [];
    const rate = async (secs) => { const c0 = clock, t0 = now(), s0 = sets; const n = Math.round(secs * 1000 / 16.7); for (let i = 0; i < n; i++) await step(); perS.push((sets - s0) / secs); return (clock - c0) / ((now() - t0) / 1000); };
    for (let i = 0; i < 60; i++) await step();
    assert.ok(sets > 0 && Number.isFinite(clock), `the vessels are given the blood clock (${sets} sets)`);
    const early = await rate(2);     // (0 to 3 s: every frame)
    for (let i = 0; i < 60; i++) await step();
    const rest = await rate(4);      // (5 to 9 s: the 30 Hz rest step)
    while (now() < 40000) await step();
    const idle = await rate(10);     // (past 40 s: the 20 Hz idle step)
    const late = await rate(10);     // (past 50 s)
    if (process.env.SHOW_RATES) console.log("rates", early, rest, idle, late, "clock sets a second", perS);
    for (const [name, r] of [['before rest', early], ['30 Hz rest', rest], ['idle, past 40 s', idle], ['idle, past 50 s', late]]) {
      assert.ok(Math.abs(r - 1) < 0.06, `${name}: the blood clock runs at ${r.toFixed(3)} s a second`);
    }
    assert.ok(perS[2] < perS[0] * 0.6, `fewer frames idle than before rest (${perS.map((x) => x.toFixed(0)).join(', ')} clock sets a second): the pacing is on, the speed kept`);
  } finally { P.getUniformLocation = uLoc; P.uniform1f = u1; }
});
