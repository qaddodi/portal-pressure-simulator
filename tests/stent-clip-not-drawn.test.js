// While the TIPS stent unrolls, its clip (a plain path in a <clipPath>) is not a mark: the GPU marks painter drew it as a solid black rectangle at the
// origin of the figure, which panned and zoomed with it (Mohammad, 11 Nov 2026: "as soon as I placed the TIPS the black box showed up").
// Geometry as the stage holds it, node and jsdom (tests/stage-gl-boot.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('a stent that is still unrolling has its clip left out of the marks, and every mark and stent coordinate is finite', async () => {
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
  let sawClip = false;
  for (let i = 0; i < 80; i++) {
    pump(48); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks();
    // every shape the marks painter took for a mark sits at the stent: its first point, carried to the figure by its own and its groups' transforms (the attribute when the
    // browser's computed style leaves it out: here, as in Safari), lies inside the bounds of the TIPS course (a thin bar at the figure's origin was the stent's front marker, 11 Nov 2026)
    for (const el of document.querySelectorAll('[data-gl]')) {
      if (!el.closest('#overlays') || !el.closest('.stent-mark, .stent-cover, .stent-strut, .stent-rail, .stent-ring, g')) continue;
      const root = el.closest('#overlays'), M = markMatrix(el, root, getComputedStyle(el));
      const n = (el.getAttribute('d') || '').match(/-?[\d.]+/g)?.map(Number);
      if (!n || n.length < 2) continue;
      const x = (M ? M[0] * n[0] + M[2] * n[1] + M[4] : n[0]), y = (M ? M[1] * n[0] + M[3] * n[1] + M[5] : n[1]);
      if (!el.closest('g[transform], g[clip-path]')) continue;   // (the stent's own groups; other overlay marks are other tests')
      assert.ok(x > 420 && x < 640 && y > 190 && y < 460, `a mark of the stent (${el.getAttribute('class')}) would be painted at ${x.toFixed(0)},${y.toFixed(0)}, away from the TIPS course (frame ${i})`);
    }
    for (const c of document.querySelectorAll('clipPath')) {
      for (const el of c.querySelectorAll('*')) {
        if (!c.id.startsWith('vstClip')) continue;
        sawClip = true;
        assert.ok(!el.hasAttribute('data-gl'), `the clip ${c.id} has a path the marks painter took for a mark (frame ${i})`);
      }
    }
  }
  assert.ok(sawClip, 'the test saw the stent while its clip was in the page');
  // (And once it has unrolled to the end, the front's marker is off: a stent that came in by unrolling kept its marker, a thin pale bar across the hepatic vein, until the page was rebuilt, 11 Nov 2026,
  // seen in the headless shots; it is hidden at k = 1 whether the stent was built whole or not.)
  const marks = [...document.querySelectorAll('.stent-mark-tips')];
  assert.ok(marks.length, 'the front marker exists');
  for (const el of marks) assert.equal(el.getAttribute('opacity'), '0', 'the front marker of a whole covered stent is not drawn');
  for (const el of document.querySelectorAll('.stent-mark, .stent-cover, .stent-strut, .stent-rail, .stent-ring')) {
    for (const n of (el.getAttribute('d') || '').match(/-?[\d.]+(?:e-?\d+)?|NaN|Infinity/g) || []) assert.ok(Number.isFinite(Number(n)), `${el.getAttribute('class')} has a coordinate that is not a number: ${n}`);
    for (let e = el; e && e.tagName !== 'BODY'; e = e.parentNode) assert.ok(!/NaN|Infinity/.test(e.getAttribute?.('transform') || ''), 'a stent transform is a number');
  }
});
