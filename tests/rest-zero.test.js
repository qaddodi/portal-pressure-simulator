// P4, a rest cost of zero (13 Nov 2026, Mohammad: "Zero drawing when nothing moves (Mac heat)"). A figure that is shown, settled and held
// (the model paused, the blood off, no input) must cost the GPU nothing: no draw, no clear, no blit, no copy and no upload on any of the page's
// WebGL contexts for five seconds, no whole-canvas present and no new picture, and the scheduler asked for next to nothing (the stage's
// own once-a-second look in case a change came by a path that does not wake it). Node, the real stage (tests/stage-gl-boot.js), the
// do-nothing WebGL of scripts/warm/gl-stub.mjs with every call that touches the GPU counted, a fake clock.
//
// What this does NOT hold at zero is a model that is running: the healthy patient still redraws about 25 vessel rows a second (a width or a
// colour easing by at least one 8-bit step), counted in docs/recommendations/mac-heat-nov13.md round 3; that is real change, not rest.
// The device's own number for both cases is the lap's "rest" lines (?lap, src/ui/lap.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

// Every call on a context that costs the GPU something, by name. Wrapped on the context object itself, so a call made through the app's
// own references (they hold the context, not the method) is counted too.
const GPU_CALLS = ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced', 'clear', 'clearBufferfv', 'clearBufferuiv', 'blitFramebuffer',
  'copyTexSubImage2D', 'copyTexImage2D', 'texSubImage2D', 'texImage2D', 'bufferData', 'bufferSubData', 'readPixels', 'generateMipmap'];
function meter(document) {
  const seen = new Set(), hits = {};
  const attach = () => {
    for (const c of document.querySelectorAll('canvas')) {
      const gl = c.__gl;
      if (!gl || seen.has(gl)) continue;
      seen.add(gl);
      for (const k of GPU_CALLS) {
        const was = gl[k];
        if (typeof was !== 'function') continue;
        gl[k] = function (...a) { hits[k] = (hits[k] || 0) + 1; return was.apply(this, a); };
      }
    }
  };
  return { attach, take: () => { const o = { ...hits }; for (const k in hits) delete hits[k]; return o; }, contexts: () => seen.size };
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// (One stage for the file: the page's modules and DOM are made once. A patient is loaded into it with the model held, as a person does.)
let shared = null;
async function rig(presetId) {
  if (!shared) {
    const { st } = await bootGL({ w: 1200, h: 800 });   // (the station labels on, as the page opens)
    const { store } = await import('../src/ui/store.js');
    const { counts } = await import('../src/ui/frame-counts.js');
    const frameMod = await import('../src/ui/frame.js');
    const { createCore } = await import('../src/worker-core.js');
    const tasks = () => new Promise((r) => setImmediate(r));
    const s = { st, store, counts, frameMod, tasks, q: [], m: meter(globalThis.document) };
    s.core = createCore((m) => { if (m.type === 'frame') s.q.push(m); });
    await s.core.handle({ type: 'init' });
    await s.core.handle({ type: 'ackPaint', on: true });
    await s.core.handle({ type: 'run', running: false });
    s.step = async (ms = 16.7) => { pump(ms); const f = s.q.at(-1); s.q = []; if (f) { st.update(f); s.core.handle({ type: 'painted' }); } await tasks(); };
    shared = s;
  }
  const s = shared;
  if (presetId) { await s.core.handle({ type: 'preset', id: presetId }); await s.core.handle({ type: 'run', running: false }); }
  s.store.set({ params: s.core.engine().params, running: false, layers: { ...s.store.get().layers, flow: false } });
  return { step: s.step, store: s.store, counts: s.counts, asks: () => ({ ...s.frameMod.perf().totals.asks }), m: s.m };
}

for (const [name, preset] of [['healthy', null], ['decompensated cirrhosis (ascites shown)', 'cirr-decomp']]) {
  test(`P4: ${name}, held and settled, makes no GPU call for five seconds`, async (t) => {
    const r = await rig(preset);
    for (let i = 0; i < 100; i++) await r.step(200);   // (20 s in coarse steps: past every ease, the rest pacing's 4 s, and the 12 s after which the organ painter's spare layers are given back, once: warm-views.js WARM_MS)
    r.m.attach();
    assert.ok(r.m.contexts() >= 1, 'the figure\'s context is counted');
    r.m.take();
    const a0 = r.asks(), c0 = r.counts.composite, p0 = sum(r.counts.present), d0 = r.counts.draw;
    for (let i = 0; i < 150; i++) await r.step(33.4);   // (5 s at 30 frames a second: a held figure that asks for any frame is seen in at least one of these)
    r.m.attach();
    const calls = r.m.take(), a1 = r.asks();
    const asked = Object.keys(a1).reduce((a, k) => a + (a1[k] - (a0[k] || 0)), 0);
    const detail = JSON.stringify({ calls, composites: r.counts.composite - c0, presents: sum(r.counts.present) - p0, draws: r.counts.draw - d0, asks: Object.fromEntries(Object.keys(a1).map((k) => [k, a1[k] - (a0[k] || 0)]).filter(([, v]) => v)) });
    assert.equal(sum(calls), 0, `no GPU call at rest: ${detail}`);
    assert.equal(r.counts.composite - c0, 0, `no composite at rest: ${detail}`);
    assert.equal(sum(r.counts.present) - p0, 0, `no present at rest: ${detail}`);
    assert.ok(asked <= 10, `the scheduler is asked for next to nothing at rest (${asked} in 5 s; the stage's once-a-second look): ${detail}`);
    t.diagnostic(detail);
  });
}
