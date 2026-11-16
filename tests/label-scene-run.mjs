// One page booted in node for label-scene-determinism.test.js (each run in a process of its own: the stage keeps module state). It opens the patients of
// the list in order, the way the page's patient menu does (the model's preset, then the patient's params and name into the store), lets each play, and
// prints the Anatomy's station labels of each as JSON on a line that begins LAID.
// args: JSON { view: 'circuit' for the Circuit, presets: [id], frames: extra frames before each patient's labels are read, solves: ask a solve every few frames, level, w, h }
import { bootGL, pump } from './stage-gl-boot.js';
const o = JSON.parse(process.argv[2] || '{}');
const { store } = await import('../src/ui/store.js');
const { st, page } = await bootGL({ w: o.w || 1280, h: o.h || 800 });
if (o.level) store.set({ labelLevel: o.level });
const { createCore } = await import('../src/worker-core.js');
let q = [], last = null, params = null;
const core = createCore((m) => { if (m.type === 'frame') q.push(m); else if (m.type === 'presetLoaded') params = m.params; });
await core.handle({ type: 'init' });
const tasks = () => new Promise((r) => setImmediate(r));
const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) last = f; if (last) st.update(last); await tasks(); await tasks(); };
if (o.view) st.setView(o.view);
const out = {};
for (const id of o.presets) {
  await core.handle({ type: 'preset', id });
  store.set({ params: structuredClone(params), presetId: id });
  await core.handle({ type: 'run', running: true });
  for (let i = 0; i < (o.base || 45) + (o.frames || 0); i++) { await step(); if (o.solves && i % 7 === 0) st.labelLayoutNow(); }
  st.labelLayoutNow();
  // (every label the figure shows and every stenosis clamp's words, for the test that none is a bare number)
  out[id + '#all'] = [...st.labelLaid().items.map((it) => ({ key: it.key, text: it.text })), ...[...page.document.querySelectorAll('.clamp-label')].map((el) => ({ key: 'clamp', text: String(el._txt) }))];
  out[id] = st.labelLaid().items.filter((it) => it.key.startsWith('n:')).map((it) => ({ key: it.key, text: it.text, box: it.box.map((v) => Math.round(v)), ax: Math.round(it.ax), ay: Math.round(it.ay), leader: !!it.leader }));
}
console.log('LAID' + JSON.stringify(out));
process.exit(0);
