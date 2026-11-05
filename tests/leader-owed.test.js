// A leader and a dot the GPU draws (label-gl.js drawPins, from the record's want bits) show from a slide's first layout, on a presenter's glide
// too, and the page's own leaders asked for then are made once it lands (5 Nov 2026, Mohammad on the TIPS slide: "leader doesn't show up").
// Two ways they went missing, the page's first leaders laid out with its camera gliding: a pinned dot was drawn only in the look of a dot of the
// page's already read (none yet: no dot), and a leader that found no blank line to take asked for a layout the glide refused and its landing
// skipped (its labels unchanged), so the page's leaders and dots never came until something else changed. The real stage with GPU labels in
// node (tests/stage-gl-boot.js); a slide's numbered steps, each on a leader to a dot on its vessel, glided to as the slide lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, now } from './stage-gl-boot.js';

const { st, page, frame } = await bootGL({ labels: 'none' });   // (no leader or dot laid out before the slide)
const { store } = await import('../src/ui/store.js');
const { stepPlan } = await import('../src/ui/callout-math.js');
const { EDGES } = await import('../src/engine/topology.js');
const EIDS = new Set(EDGES.map((e) => e.id));
const GLOW = ['V_INT', 'PV_TRUNK', 'SIN_RR', 'RHV_IVC', 'IVCS_RA'];

test("a slide's first leaders and dots, laid out as its glide sets off, are drawn with it and made in the page once it lands", async () => {
  store.set({ presenting: true, presentLabels: [], presentTerms: null });
  st.setGlow(GLOW.map((id, i) => ({ id, tone: 'accent', at: i })));   // (lit 1 ms apart: every number at once)
  st.callouts({ live: {}, organs: [], calipers: [], spans: [], zone: -1, steps: stepPlan(GLOW, 1, (id) => EIDS.has(id), () => false) });
  st.setCamera({ k: 1.15, x: -60, y: -20 }, 900);
  const t0 = now();
  let lines = 0;
  for (let i = 0; i < 90; i++) {
    await frame();
    const sn = st.labelSnapshot();
    for (const d of sn.items.filter((x) => x.key.startsWith('fxs:'))) {
      const mk = sn.marks.filter((m) => m.k === d.key);
      if (!mk.some((m) => m.kind === 'line')) continue;
      lines++;
      assert.ok(mk.some((m) => m.kind === 'leader-dot'), `${d.key}'s leader comes with its dot at ${Math.round(now() - t0)} ms: ${JSON.stringify(mk)}`);
    }
  }
  assert.ok(lines > 50, `the leaders are drawn: ${lines}`);
  // (Landed at 900 ms, nothing changed since: the page's leaders and dots it asked for are in, one of each for every number off its point.)
  const layer = page.document.querySelector('#labels .lb-leaders');
  const want = new Set(st.labelSnapshot().marks.filter((m) => m.k.startsWith('fxs:')).map((m) => `${m.k} ${m.kind === 'line' ? 'path' : 'circle'}`));
  const have = new Set([...layer.children].filter((el) => el.getAttribute('data-k')?.startsWith('fxs:') && !el.classList.contains('ld-gone')).map((el) => `${el.getAttribute('data-k')} ${el.tagName.toLowerCase()}`));
  assert.ok(want.size >= 4, `marks drawn: ${[...want]} ${JSON.stringify(st.labelSnapshot().items.filter((x) => x.key.startsWith("fxs:")))}`);
  assert.deepEqual([...have].sort(), [...want].sort(), "the page's leaders and dots are made once the glide lands");
});
