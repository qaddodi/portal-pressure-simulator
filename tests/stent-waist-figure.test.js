// The figure's TIPS follows the stent's geometry (17 Nov 2026; src/ui/stent-waist.js, stage.js waist, stage-tubes.js renderTube): a longer waist
// lengthens the narrowed stretch and the stent is drawn the same length; switching the ends eases with no frame jump; a uniform stent has no
// colour step, and the jet's step moves when the flow reverses. The real stage, booted in node (tests/stage-gl-boot.js), no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';
import { alongCurve } from '../src/ui/pressure-along.js';

test('the TIPS in the figure: waist length, ends and the pressure colour follow the geometry', async () => {
  const { st, page } = await bootGL({ w: 1200, h: 800 });
  const { store } = await import('../src/ui/store.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [];
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  const base = JSON.parse(JSON.stringify(core.engine().params));
  const set = async (patch, settle = false) => {
    const P = JSON.parse(JSON.stringify(base));
    Object.assign(P, { tips: { on: true, d: 10 }, stenosis: {}, stenosisSite: {} }, patch);   // (a 60 % waist mid stent: stentGeom.red, each patch below)
    await core.handle({ type: 'setParams', params: P, settle });
    store.set({ params: P });
  };
  let lastF = null;
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  const frames = async (n) => { for (let i = 0; i < n; i++) await step(); };
  await core.handle({ type: 'run', running: true });
  st.setView?.('anatomy');
  const read = () => st.stentDrawn('TIPS');
  const narrow = (k) => k.filter((v) => v < 0.7).length / k.length;
  const alongOf = (d) => alongCurve(d.k.slice(0, 64), new Float32Array(64), d.loss);

  // 1. A 1 cm waist, then a 4 cm one: the narrowed stretch lengthens, the stent is drawn the same length.
  await set({ stentGeom: { TIPS: { len: 8, waist: 1, trans: 0, red: 0.6 } } }, true);
  await frames(80);
  const a = read();
  assert.ok(a, 'the TIPS is drawn, narrowed');
  const lenA = a.len;
  await set({ stentGeom: { TIPS: { len: 8, waist: 4, trans: 0, red: 0.6 } } }, true);
  await frames(80);
  const b = read();
  assert.equal(b.len, lenA, 'the stent\'s drawn length does not change');
  assert.ok(b.ver > a.ver, 'the shade version moved: the GPU gets the new radii');
  assert.ok(narrow(b.k) > narrow(a.k) + 0.25, `the narrowed stretch lengthened: ${narrow(a.k)} to ${narrow(b.k)}`);
  assert.ok(Math.abs(narrow(b.k) - 0.5) < 0.1, `a 4 cm waist of an 8 cm stent is about half of it, ${narrow(b.k)}`);
  assert.ok(b.k[0] > 0.97 && b.k.at(-1) > 0.97, 'open at both ends');

  // 1b. The callout reads the lumen and the waist's length, and a bracket along the waist is as long as the waist is of the stent.
  const text = () => page.document.querySelector('.clamp-label[data-id="TIPS~waist"]')?._txt;
  assert.equal(text(), 'Waist 10.0 to 4.0 mm × 4.0 cm', 'the callout: the 10 mm stent\'s waist at 60 %, 4 cm long');
  const bracketLen = () => {
    const d = page.document.querySelector('[data-mk="brk:TIPS"] path')?.getAttribute('d');
    if (!d) return 0;
    const pts = d.split(' M')[0].match(/-?[\d.]+/g).map(Number);
    let len = 0; for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    return len;
  };
  const ratio = bracketLen() / b.len;
  assert.ok(Math.abs(ratio - 0.5) < 0.06, `the bracket spans the waist's share of the stent, ${ratio}`);
  // The bracket carries no words of its own (they would repeat the callout, which the label solver places): no outlines in its mark.
  assert.equal(page.document.querySelectorAll('[data-mk="brk:TIPS"] .dim-text, [data-mk="brk:TIPS"] .dim-halo').length, 0);
  await set({ stentGeom: { TIPS: { len: 8, waist: 0, trans: 0, red: 0.6 } } }, true);
  await frames(80);
  assert.equal(bracketLen(), 0, 'a waist of no length has no bracket');
  await set({ stentGeom: { TIPS: { len: 8, waist: 1.5, trans: 0, red: 0.6 } } }, true);
  await frames(80);
  assert.equal(text(), 'Waist 10.0 to 4.0 mm × 1.5 cm', 'the callout follows the waist length');
  assert.ok(Math.abs(bracketLen() / b.len - 1.5 / 8) < 0.05, `and the bracket ${bracketLen() / b.len}`);
  await set({ stentGeom: { TIPS: { len: 8, waist: 4, trans: 0, red: 0.6 } } }, true);
  await frames(80);

  // 2. Switching the ends eases: each frame moves the profile a part of the way, never the whole of it.
  await set({ stentGeom: { TIPS: { len: 8, waist: 3, trans: 0, red: 0.6 } } }, true);
  await frames(80);
  let prev = read().k;
  const first = prev.slice();
  await set({ stentGeom: { TIPS: { len: 8, waist: 3, trans: 1, red: 0.6 } } }, false);
  let worst = 0, moved = 0, last = null;
  for (let i = 0; i < 80; i++) {
    await step();
    const k = read().k;
    let d = 0; for (let j = 0; j < k.length; j++) d = Math.max(d, Math.abs(k[j] - prev[j]));
    worst = Math.max(worst, d); if (d > 1e-6) moved++;
    prev = k; last = k;
  }
  let total = 0; for (let j = 0; j < last.length; j++) total = Math.max(total, Math.abs(last[j] - first[j]));
  assert.ok(total > 0.2, `the ends changed the profile, ${total}`);
  assert.ok(moved >= 5, `it took ${moved} frames`);
  assert.ok(worst < total * 0.6, `no frame takes the whole change: ${worst} of ${total}`);

  // 3. The pressure colour: the jet's step is a rise at the waist's end, the flow's sign picks the end, a uniform stent has none.
  await set({ stentGeom: { TIPS: { len: 8, waist: 2, trans: 0, red: 0.6 } } }, true);
  await frames(80);
  const d = read();
  assert.ok(d.loss.jet2 > 0.02, `the waist's jet takes a share of the fall, ${d.loss.jet2}`);
  assert.ok(d.loss.jet < 1e-9, `and no end stenosis, no end jet: ${d.loss.jet}`);
  assert.equal(d.loss.dir, Math.sign(lastF.metrics.tips.q) || 1, 'the step sits at the end the flow leaves by');
  const curve = alongOf(d);
  assert.ok(curve && curve[0] === 0 && curve[63] === 1);
  assert.ok(d.loss.at2 > 0 && d.loss.at2 < 1);
  await set({ stentGeom: { TIPS: { len: 8, waist: 2, trans: 0, red: 0 } } }, true);
  await frames(80);
  assert.equal(read(), null, 'no narrowing, no waist and no colour step: the colour mixes by arc');

  // 4. Both at once (17 Nov 2026): a distal stenosis and a mid waist, each with its own callout and its own jet in the colour.
  await set({ stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'distal' }, stentGeom: { TIPS: { len: 8, waist: 2, trans: 0, red: 0.4 } } }, true);
  await frames(80);
  const both = read();
  assert.ok(both.loss.jet > 0.01 && both.loss.jet2 > 0.01, `two jets: ${both.loss.jet}, ${both.loss.jet2}`);
  assert.ok(Math.abs(both.loss.at2 - (both.loss.dir > 0 ? 0.625 : 0.375)) < 0.01, `the waist's jet leaves it mid stent, ${both.loss.at2}`);
  assert.ok(both.loss.dir > 0 ? both.loss.at > 0.85 : both.loss.at > 0.7, `the stenosis's at the hepatic vein end, ${both.loss.at}`);
  assert.equal(text(), 'Waist 10.0 to 6.0 mm × 2.0 cm');
  assert.equal(page.document.querySelector('.clamp-label[data-id="TIPS"]')?._txt, 'Distal stenosis 10.0 to 5.0 mm');
});
