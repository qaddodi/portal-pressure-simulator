// One figure booted in node for clamp-clear.test.js: a TIPS narrowed (s, its waist in cm), the model playing, a solve every 20 frames; prints
// the narrowing's words (clamp-label) as the solve laid them and every label shown over them, on a line that begins CLAMP. args JSON { size, view, s, waist, frames }
import { bootGL, pump } from './stage-gl-boot.js';
const o = JSON.parse(process.argv[2] || '{}');
const SIZES = { mac: [1024, 768, 1, false], iphone: [395, 859, 3, true] };
const [w, h, dpr, coarse] = SIZES[o.size || 'mac'];
const { st, page } = await bootGL({ w, h, dpr, coarse });
const { store } = await import('../src/ui/store.js');
const { createCore } = await import('../src/worker-core.js');
const tasks = () => new Promise((r) => setImmediate(r));
let q = [];
const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
await core.handle({ type: 'init' });
await core.handle({ type: 'preset', id: 'cirr-decomp' });
const P = JSON.parse(JSON.stringify(core.engine().params));
Object.assign(P, { tips: { on: true, d: 8 }, stenosis: { TIPS: o.s ?? 0.6 }, stentGeom: { TIPS: { waist: o.waist ?? 1 } } });
await core.handle({ type: 'setParams', params: P, settle: true });
await core.handle({ type: 'run', running: true });
let lastF = null;
const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
store.set({ params: P });
st.setView?.(o.view || 'circuit');
for (let i = 0; i < (o.frames || 500); i++) { await step(); if (i % 20 === 0) st.labelLayoutNow(); }
st.labelLayoutNow(); for (let i = 0; i < 40; i++) await step();
const doc = page.document, laid = st.labelLaid().items;
const cl = [...doc.querySelectorAll('#stageOver .clamp-label')].map((el) => ({ t: el._txt ?? el.textContent, box: el._box ? [el._box.x0, el._box.y0, el._box.x1, el._box.y1].map(Math.round) : [0, 0, 0, 0] }));
const lap = [];
for (const c of cl) for (const d of laid) { const [a0, b0, a1, b1] = c.box, [x0, y0, x1, y1] = d.box; if (a0 < x1 && a1 > x0 && b0 < y1 && b1 > y0) lap.push(d.key + ' ' + d.text); }
console.log('CLAMP' + JSON.stringify({ cl, lap, labels: laid.map((d) => [d.key, d.text, d.box.map(Math.round)]) }));
process.exit(0);
