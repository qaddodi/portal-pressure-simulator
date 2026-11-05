// The slide "Gut blood crosses two capillary beds in series" (demo deck 'route': its glow lit 550 ms apart, steps, the fit) on a phone held
// upright, run frame by frame, with what each frame shows of each step number, its leader and its dot checked: drawn by the GPU (label-gl's
// snapshot) or by the SVG (an element with its geometry, not handed to the GPU, not faded out). Shared by the phone tests.
import assert from 'node:assert/strict';

const SEQ = 550, GLOW = ['V_INT', 'PV_TRUNK', 'SIN_RR', 'RHV_IVC', 'IVCS_RA'];

// (An SVG element the page paints: not handed to the GPU (data-gl), not faded out, with its geometry.)
const painted = (el, geo) => !!el && !el.hasAttribute('data-gl') && !el.classList.contains('ld-gone') && !el.classList.contains('lb-off') && !!(geo ? el.getAttribute(geo) : true);

export async function stepFrames({ st, page, frame, now, frames = 200 }) {
  const { store } = await import('../src/ui/store.js');
  const { stepPlan } = await import('../src/ui/callout-math.js');
  const { EDGES } = await import('../src/engine/topology.js');
  const EIDS = new Set(EDGES.map((e) => e.id)), doc = page.document;
  doc.querySelector('.app')?.style.setProperty('--pz-b', '260px');   // (the card docked under the figure, as the presenter sets it on a phone)
  store.set({ presenting: true, presentLabels: [], presentTerms: null });
  const t0 = now();
  st.setGlow(GLOW.map((id, i) => ({ id, tone: 'accent', at: i * SEQ })));
  st.callouts({ live: {}, organs: [], calipers: [], spans: [], zone: -1, steps: stepPlan(GLOW, SEQ, (id) => EIDS.has(id), () => false) });
  st.fitSlow(1300);   // (cam 'fit', as the presenter frames the slide)
  const out = { svgDrawn: 0, gpuDrawn: 0 };
  const on = new Map();   // key → [number, leader, dot] shown in the last frame
  for (let i = 0; i < frames; i++) {
    await frame();
    if (i === 120) st.labelLayoutNow(false);   // (a layout at rest, as a playing model's readings ask for)
    const t = now() - t0, sn = st.labelSnapshot() || {}, items = sn.items || [], marks = sn.marks || [];
    for (let n = 1; n <= GLOW.length; n++) {
      const k = 'fxs:' + n, at = (n - 1) * SEQ;
      const d = items.find((x) => x.key === k), g = doc.querySelector(`#labels [data-key="${k}"]`);
      const gpu = !!d && g?.hasAttribute('data-gl') && +d.a > 0.5, svg = painted(g);
      if (gpu) out.gpuDrawn++; else if (svg) out.svgDrawn++;
      const mk = marks.filter((m) => m.k === k && m.a > 0.5);
      const els = [...doc.querySelectorAll(`#labels .lb-leaders > [data-k="${k}"]`)].filter((e) => !e.classList.contains('fan'));
      const line = (gpu && mk.some((m) => m.kind === 'line')) || els.some((e) => e.tagName === 'path' && painted(e, 'd'));
      const dot = (gpu && mk.some((m) => m.kind === 'leader-dot')) || els.some((e) => e.tagName === 'circle' && e.classList.contains('leader-dot') && painted(e, 'cx'));
      const now3 = [gpu || svg, line, dot], was = on.get(k);
      on.set(k, now3);
      if (t < at + 700) continue;   // (from its moment on, its fade in done)
      const what = `${k} at ${Math.round(t)} ms (number ${gpu ? 'by the GPU' : svg ? 'by the SVG' : 'not shown'})`;
      assert.ok(now3[0], `${what}: the number shows`);
      assert.ok(now3[1], `${what}: its leader shows (GPU marks ${JSON.stringify(mk)}, SVG ${els.map((e) => e.outerHTML).join(' ')})`);
      assert.ok(now3[2], `${what}: its dot shows (GPU marks ${JSON.stringify(mk)}, SVG ${els.map((e) => e.outerHTML).join(' ')})`);
      if (was) assert.deepEqual(now3, was, `${what}: nothing of it goes out and back`);
    }
  }
  return out;
}
