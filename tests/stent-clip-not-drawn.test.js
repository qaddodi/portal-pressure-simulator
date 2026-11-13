// The TIPS stent comes in whole (13 Nov 2026, Mohammad: "the stent TIPS doesn't expend all at once.. it expands in two fragments... WRONG"): every piece
// in the page from its first frame, at one strength, with no clip and no front marker. (It used to unroll behind a clip, a plain path in a <clipPath> the
// GPU marks painter once drew as a solid black rectangle at the figure's origin, 11 Nov 2026: "as soon as I placed the TIPS the black box showed up".)
// Geometry as the stage holds it, node and jsdom (tests/stage-gl-boot.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('a stent coming in is whole from its first frame, at one strength, with no clip, and every mark and stent coordinate is finite', async () => {
  const { st } = await bootGL({ w: 1200, h: 800, labels: 'none' });
  const { store } = await import('../src/ui/store.js');
  const { markMatrix } = await import('../src/ui/stage-marks.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: true });
  await core.handle({ type: 'preset', id: 'healthy' });
  await core.handle({ type: 'setParams', params: { ...core.engine().params, tips: { on: true, d: 8 } }, settle: true });
  store.set({ params: core.engine().params });
  let sawPart = false;
  for (let i = 0; i < 80; i++) {
    pump(48); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks();
    // every shape the marks painter took for a mark sits at the stent: its first point, carried to the figure by its own and its groups' transforms (the attribute when the
    // browser's computed style leaves it out: here, as in Safari), lies inside the bounds of the TIPS course (a thin bar at the figure's origin was the stent's front marker, 11 Nov 2026)
    for (const el of document.querySelectorAll('[data-gl]')) {
      if (!el.closest('#overlays')) continue;
      const root = el.closest('#overlays'), M = markMatrix(el, root, getComputedStyle(el));
      const n = (el.getAttribute('d') || '').match(/-?[\d.]+/g)?.map(Number);
      if (!n || n.length < 2) continue;
      const x = (M ? M[0] * n[0] + M[2] * n[1] + M[4] : n[0]), y = (M ? M[1] * n[0] + M[3] * n[1] + M[5] : n[1]);
      if (!el.matches('.stent-graft, .stent-wire, .stent-glint, .stent-gold')) continue;   // (the stent's own pieces; other overlay marks are other tests')
      assert.ok(x > 420 && x < 640 && y > 190 && y < 460, `a mark of the stent (${el.getAttribute('class')}) would be painted at ${x.toFixed(0)},${y.toFixed(0)}, away from the TIPS course (frame ${i})`);
    }
    assert.equal(document.querySelectorAll('[id^="vstClip"], .stent-mark').length, 0, `no clip and no front marker (frame ${i})`);
    const parts = [...document.querySelectorAll('#overlays .stent-graft, #overlays .stent-wire, #overlays .stent-gold')];
    if (!parts.length) continue;
    // whole from the first frame it shows: the open cells, the graft and the gold band together, all at one strength
    const ops = new Set(parts.map((el) => el.getAttribute('opacity')));
    assert.equal(ops.size, 1, `every piece at one strength (frame ${i}): ${[...ops]}`);
    assert.ok(parts.some((el) => el.matches('.stent-graft')) && parts.some((el) => el.matches('.stent-gold')) && parts.some((el) => el.matches('.stent-wire')), `the whole device at once (frame ${i})`);
    for (let e = parts[0]; e && e.id !== 'overlays'; e = e.parentNode) assert.ok(!e.getAttribute?.('clip-path') && !e.getAttribute?.('transform'), 'no clip or front frame round it');
    if (Number(parts[0].getAttribute('opacity')) < 0.9) sawPart = true;
  }
  assert.ok(sawPart, 'the test saw the stent while it was coming in');
  for (const el of document.querySelectorAll('.stent-graft, .stent-wire, .stent-glint, .stent-gold')) {
    for (const n of (el.getAttribute('d') || '').match(/-?[\d.]+(?:e-?\d+)?|NaN|Infinity/g) || []) assert.ok(Number.isFinite(Number(n)), `${el.getAttribute('class')} has a coordinate that is not a number: ${n}`);
    for (let e = el; e && e.tagName !== 'BODY'; e = e.parentNode) assert.ok(!/NaN|Infinity/.test(e.getAttribute?.('transform') || ''), 'a stent transform is a number');
  }
});
