// A slide's step numbers (deck visuals V10) come in once each, as their vessels light, and never go out and in again (5 Nov 2026, Mohammad on
// "Gut blood crosses two capillary beds in series": "they flicker"). The fade was begun by the layout after the one that wanted the number, as
// that one found its block not built yet; the rest pass that built it handed it to the GPU at full strength, and on a presenter's glide (whose
// labels are solved as it sets off, and not laid out again till something changes after it lands) the numbers stood there all at once until the
// next layout began their fades, whose backwards fill put each out again till its vessel lit. The real stage in node (tests/stage-gl-boot.js),
// the slide's glow and steps set as the presenter sets them with its camera glide, the model playing, a layout after the landing as a playing
// model's readings ask; what the GPU drew each frame, read back from label-gl's snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, now } from './stage-gl-boot.js';

const { st, frame } = await bootGL();
const { store } = await import('../src/ui/store.js');
const { stepPlan } = await import('../src/ui/callout-math.js');
const { EDGES } = await import('../src/engine/topology.js');
const EIDS = new Set(EDGES.map((e) => e.id));
const SEQ = 550, GLOW = ['V_INT', 'PV_TRUNK', 'SIN_RR', 'RHV_IVC', 'IVCS_RA'];

test("each step's number shows from its vessel's moment on, and only then, through the slide's glide and the layouts after it", async () => {
  store.set({ presenting: true, presentLabels: [], presentTerms: null });
  const t0 = now();
  st.setGlow(GLOW.map((id, i) => ({ id, tone: 'accent', at: i * SEQ })));
  st.callouts({ live: {}, organs: [], calipers: [], spans: [], zone: -1, steps: stepPlan(GLOW, SEQ, (id) => EIDS.has(id), () => false) });
  st.setCamera({ k: 1.15, x: -60, y: -20 }, 900);   // (the slide's framing, glided to as it lands)
  const seen = new Map();   // key → { first: ms it was first drawn, last: its opacity in the last frame }
  for (let i = 0; i < 190; i++) {
    await frame();
    if (i === 70 || i === 120) st.labelLayoutNow(false);   // (after the landing: a layout, as the playing model's readings ask for)
    const t = now() - t0, sn = st.labelSnapshot();
    for (let n = 1; n <= GLOW.length; n++) {
      const k = 'fxs:' + n, at = (n - 1) * SEQ, d = sn.items.find((x) => x.key === k), a = d ? +d.a : 0;
      if (t < at - 20) assert.ok(a <= 0.01, `${k} is not shown before its vessel lights at ${at} ms (at ${Math.round(t)} ms it was drawn at ${a.toFixed(2)})`);
      // (Its leader and dot are the GPU's, from its record's want bits, in every frame once the glide has landed (its crossfade draws the new
      // labels and their marks at its progress): its layout ran before any leader or dot of the page's was made.)
      if (t > 1000 && a > 0.5 && !(d.px >= d.x && d.px <= d.x + d.w && d.py >= d.y && d.py <= d.y + d.h)) {
        const mk = sn.marks.filter((m) => m.k === k);
        assert.ok(mk.some((m) => m.kind === 'leader-dot') && mk.some((m) => m.kind === 'line'), `${k} has its dot and leader at ${Math.round(t)} ms: ${JSON.stringify(mk)}`);
      }
      const s = seen.get(k);
      if (!s) { if (a > 0.01) seen.set(k, { first: t, last: a }); continue; }
      assert.ok(a >= s.last - 0.01, `${k} goes on coming in once it has begun: ${s.last.toFixed(2)} then ${a.toFixed(2)} at ${Math.round(t)} ms`);
      s.last = a;
    }
  }
  for (let n = 1; n <= GLOW.length; n++) assert.ok(seen.get('fxs:' + n)?.last > 0.99, `fxs:${n} stands in full at the end: ${JSON.stringify(seen.get('fxs:' + n))}`);
  // (Their leaders and dots are the GPU's, from each record's want bits: drawn though no leader or dot of the page's had been made yet, as on
  // this first slide whose layout ran with the glide.)
  const sn = st.labelSnapshot();
  for (const d of sn.items.filter((x) => x.key.startsWith('fxs:'))) {
    if (d.px >= d.x && d.px <= d.x + d.w && d.py >= d.y && d.py <= d.y + d.h) continue;
    const mk = sn.marks.filter((m) => m.k === d.key);
    assert.ok(mk.some((m) => m.kind === 'leader-dot') && mk.some((m) => m.kind === 'line'), `${d.key} has its dot and leader: ${JSON.stringify(mk)}`);
  }
});
