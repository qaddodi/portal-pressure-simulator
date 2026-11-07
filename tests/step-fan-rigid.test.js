// A numbered step's group (deck visuals V10: a list of vessels in a glowSeq slide's glow, ext-callouts.js) keeps its fan, one line from each
// of its vessels to its number, as the GPU draws it (6 Nov 2026, Mohammad on the circulation deck's "Gut blood crosses two capillary beds in
// series", slide 3 of 9: "the number 2 on figure still doesn't have leaders"). Step 1 (no delay) had its lines; step 2's were faded in by a Web
// Animation of their own, label-gl read their look in that fade's delay, at opacity 0, and kept it. The fan now comes from the number's record
// (its vessels' world points), drawn where the figure has them each frame at the number's own opacity: it comes in with the number and moves
// with the figure, rigid. The page's computed opacity here includes a running Web Animation's, as a browser's does (the node page's does not).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, now } from './stage-gl-boot.js';

const { st, page, frame } = await bootGL();
{
  const base = globalThis.getComputedStyle;
  const inEffect = (a) => { const t = a.effect.getTiming(), l = a.currentTime; return l < t.delay ? /backwards|both/.test(t.fill) : l < t.delay + t.duration || /forwards|both/.test(t.fill); };
  globalThis.getComputedStyle = (el, p) => {
    const cs = base(el, p), an = (el.__anims || []).find(inEffect);
    if (!an) return cs;
    const t = an.effect.getTiming(), kf = an.effect.getKeyframes(), w = Math.min(1, Math.max(0, (an.currentTime - t.delay) / (t.duration || 1)));
    const op = String(+kf[0].opacity + (+kf[kf.length - 1].opacity - +kf[0].opacity) * w);
    return new Proxy(cs, { get: (o, k) => (k === 'opacity' ? op : typeof o[k] === 'function' ? o[k].bind(o) : o[k]) });
  };
  page.dom.window.getComputedStyle = globalThis.getComputedStyle;
}
const { store } = await import('../src/ui/store.js');
const { stepPlan } = await import('../src/ui/callout-math.js');
const { EDGES } = await import('../src/engine/topology.js');
const EIDS = new Set(EDGES.map((e) => e.id)), SEQ = 550;
const GLOW = [['V_INT', 'V_SPL', 'V_IMV'], ['SIN_RR', 'SIN_LL'], ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']];   // (circulation "series", and a third group as sites.js has)
const fans = (sn, k) => sn.marks.filter((m) => m.k === k && m.kind === 'line');

test("every group's number has its fan once its vessels light, at the number's own opacity, and only then", async () => {
  store.set({ presenting: true, presentLabels: ['CONF', 'SIN_R', 'RHV', 'RA'], presentTerms: null });
  st.setGlow(GLOW.flatMap((g, i) => g.map((id) => ({ id, tone: 'accent', at: i * SEQ }))));
  st.callouts({ live: {}, organs: [], calipers: [], spans: [], zone: -1, steps: stepPlan(GLOW, SEQ, (id) => EIDS.has(id), () => false) });
  const t0 = now();
  for (let i = 0; i < 160; i++) {
    await frame();
    const sn = st.labelSnapshot(), t = now() - t0;
    for (let n = 1; n <= GLOW.length; n++) {
      const k = 'fxs:' + n, d = sn.items.find((x) => x.key === k), ls = fans(sn, k);
      if (!d || !(d.a > 0.001)) assert.equal(ls.length, 0, `${k}: no line before its number shows (${Math.round(t)} ms): ${JSON.stringify(ls)}`);
      else for (const l of ls) assert.ok(Math.abs(l.a - d.a) < 0.02, `${k}: its lines at its own opacity ${d.a} (${Math.round(t)} ms): ${l.a}`);
    }
  }
  const sn = st.labelSnapshot();
  GLOW.forEach((g, i) => {
    const k = 'fxs:' + (i + 1), d = sn.items.find((x) => x.key === k), ls = fans(sn, k);
    assert.ok(d && d.a > 0.99, `${k} drawn whole`);
    assert.equal(ls.length, g.length, `${k}: one line from each of its ${g.length} vessels: ${JSON.stringify(ls)}`);
    for (const l of ls) assert.ok(l.a > 0.99, `${k}'s lines shown whole: ${l.a}`);
  });
});

test("a group's fan moves with the figure, rigid with its number, through a pan", async () => {
  const before = st.labelSnapshot(), off = new Map();
  for (const m of before.marks) if (m.k.startsWith('fxs:') && m.kind === 'line') { const d = before.items.find((x) => x.key === m.k); off.set(`${m.k}|${Math.round(m.x0)}|${Math.round(m.y0)}`, [m.x0 - d.px, m.y0 - d.py]); }
  assert.ok(off.size >= 7, `the fans' lines: ${off.size}`);
  st.setCamera({ k: 1, x: -80, y: 30 }, 600);   // (a pan: every point of the figure moves by the same step)
  let seen = 0;
  for (let i = 0; i < 50; i++) {
    await frame();
    const sn = st.labelSnapshot();
    for (let n = 1; n <= GLOW.length; n++) {
      const k = 'fxs:' + n, d = sn.items.find((x) => x.key === k), ls = fans(sn, k);
      if (!d || !d.pin) continue;
      for (const l of ls) {
        // (Each line's vessel end keeps its step from its number's point, the number's point moving with the figure.)
        const ok = [...off].some(([key, [dx, dy]]) => key.startsWith(k + '|') && Math.abs(l.x0 - d.px - dx) < 1.5 && Math.abs(l.y0 - d.py - dy) < 1.5);
        assert.ok(ok, `${k}'s line from ${l.x0.toFixed(1)},${l.y0.toFixed(1)} keeps its place against its number's point ${d.px.toFixed(1)},${d.py.toFixed(1)} on frame ${i}`);
        seen++;
      }
    }
  }
  assert.ok(seen > 100, `lines checked through the pan: ${seen}`);
});

test("every number of the Sites deck's route (four groups, then one vessel) is joined to its vessels once all are lit", async () => {
  const glow = [['V_INT', 'V_SPL', 'V_IMV'], ['PVH_R', 'PVH_L'], ['SIN_RR', 'SIN_LL'], ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], 'IVCS_RA'];
  st.setGlow(null); st.callouts(null);
  for (let i = 0; i < 30; i++) await frame();
  st.setGlow(glow.flatMap((g, i) => [g].flat().map((id) => ({ id, tone: 'accent', at: i * SEQ }))));
  st.callouts({ live: {}, organs: [], calipers: [], spans: [], zone: -1, steps: stepPlan(glow, SEQ, (id) => EIDS.has(id), () => false) });
  for (let i = 0; i < 220; i++) await frame();
  const sn = st.labelSnapshot();
  glow.forEach((g, i) => {
    const k = 'fxs:' + (i + 1), d = sn.items.find((x) => x.key === k), ls = fans(sn, k);
    assert.ok(d && d.a > 0.99, `${k} drawn whole`);
    if (Array.isArray(g)) assert.equal(ls.length, g.length, `${k}: one line from each of its ${g.length} vessels: ${JSON.stringify(ls)}`);
    else if (!(d.px >= d.x && d.px <= d.x + d.w && d.py >= d.y && d.py <= d.y + d.h)) assert.equal(ls.length, 1, `${k}, off its vessel's point, has its leader: ${JSON.stringify(ls)}`);
    for (const l of ls) assert.ok(l.a > 0.99, `${k}'s lines shown whole: ${l.a}`);
  });
});
