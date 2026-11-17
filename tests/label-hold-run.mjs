// One slide booted in node for label-hold.test.js (a process of its own: the stage keeps module state), on the test clock (stage-gl-boot.js: the
// clock, timers and frames are fixed, pump(ms) runs one frame). A TIPS stent, narrowed, the liver framed as the TIPS Doppler slides frame it, the slide's
// mark on the stent and the Doppler on it (its three points called out, or one). The model plays and a solve is asked every few frames, as a reading, a
// vessel's width or a card does on a real slide; every frame after the stent has settled, each callout's and cm/s label's place and whether it shows are
// recorded, and printed as JSON on a line that begins HOLD.
// args: JSON { size: 'mac' | 'iphone', mark: { ... }, points: true | false, frames, skip, every }
import { bootGL, pump } from './stage-gl-boot.js';
const o = JSON.parse(process.argv[2] || '{}');
const SIZES = { mac: [1200, 800, 1, false], iphone: [395, 859, 3, true] };
const [w, h, dpr, coarse] = SIZES[o.size || 'mac'];
const { st, page } = await bootGL({ w, h, dpr, coarse });
const { store } = await import('../src/ui/store.js');
const { createCore } = await import('../src/worker-core.js');
const { REGIONS } = await import('../src/ui/decks.js');
const tasks = () => new Promise((r) => setImmediate(r));
let q = [];
const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
await core.handle({ type: 'init' });
await core.handle({ type: 'preset', id: 'cirr-decomp' });
const P = JSON.parse(JSON.stringify(core.engine().params));
Object.assign(P, { tips: { on: true, d: 9 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5, stenosis: { TIPS: 0.65 } });
await core.handle({ type: 'setParams', params: P, settle: true });
await core.handle({ type: 'run', running: true });
let lastF = null;
const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
page.document.querySelector('.app')?.style.setProperty('--pz-b', coarse ? '260px' : '0px');
const marks = [o.mark];
store.set({ presenting: true, presentLabels: [], presentTerms: null, params: P, dopGate: 'site', focus: { ...marks[0], marks } });
st.setView?.('anatomy');
st.frameBox(REGIONS.liver, 800, 3.2, false, {});
st.pinDoppler('TIPS', { points: o.points !== false });
const rec = {}, frames = o.frames || 1100, skip = o.skip || 650, every = o.every || 5;
let dims = [], over = [];
for (let i = 0; i < frames; i++) {
  await step();
  if (i % every === 0) st.labelLayoutNow();
  if (i < skip) continue;
  const sn = st.labelSnapshot(), laid = st.labelLaid().items, seen = new Set(), boxes = [];
  for (const d of sn.items) if (/^focus/.test(d.key)) { seen.add(d.key); (rec[d.key] ||= []).push([i, Math.round(d.x), Math.round(d.y), d.a > 0.5 ? 1 : 0]); boxes.push([d.key, d.x, d.y, d.x + d.w, d.y + d.h]); }
  for (const d of laid) if (/TIPS|DIPS/.test(d.key)) { seen.add(d.key); (rec[d.key] ||= []).push([i, Math.round(d.box[0]), Math.round(d.box[1]), 1]); boxes.push([d.key, ...d.box]); }
  for (const k in rec) if (!seen.has(k)) { const l = rec[k].at(-1); rec[k].push([i, l[1], l[2], 0]); }
  // (the stent's dimension words, as the solve keeps labels off them: none of the boxes above may cover them; the stage stands at the page's corner)
  dims = st.labelDims();
  for (const [k, x0, y0, x1, y1] of boxes) for (const d of dims) if (d[4] && x0 < d[2] && x1 > d[0] && y0 < d[3] && y1 > d[1]) over.push(`${i}:${k}`);
}
console.log('HOLD' + JSON.stringify({ rec, dims: dims.length, over: over.slice(0, 10) }));
process.exit(0);
