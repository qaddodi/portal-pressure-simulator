// (waist-label.test.js: this is label-hold-run.mjs's slide with a waist in place of the stenosis, and it prints where the stent's one label stands.)
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
Object.assign(P, { tips: { on: true, d: 8 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5, stenosis: {}, stentGeom: { TIPS: { len: 8, waist: o.waist ?? 1, trans: 0, red: o.red ?? 0.45 } }, ...(o.extra || {}) });
await core.handle({ type: 'setParams', params: P, settle: true });
await core.handle({ type: 'run', running: true });
let lastF = null;
const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
page.document.querySelector('.app')?.style.setProperty('--pz-b', coarse ? '260px' : '0px');
const marks = [o.mark];
if (o.free) store.set({ presenting: false, params: P, selection: { type: 'edge', id: 'TIPS' } });   // (the free Anatomy view with the TIPS's card open, Mohammad's iPhone shot, 17 Nov)
else store.set({ presenting: true, presentLabels: [], presentTerms: null, params: P, dopGate: 'site', focus: { ...marks[0], marks }, ...(o.sel ? { selection: { type: 'edge', id: 'TIPS' } } : {}) });
st.setView?.('anatomy');
st.frameBox(REGIONS.liver, 800, 3.2, false, {});
st.pinDoppler('TIPS', { points: o.points === true });
if (o.zoom) { const c = st.cameraState(); for (let i = 0; i < 60; i++) await step(); st.setCamera({ ...c, k: c.k * o.zoom }, 10); }
const settle = async (n) => { for (let i = 0; i < n; i++) { await step(); if (i % 5 === 0) st.labelLayoutNow(); } st.labelLayoutNow(); for (let i = 0; i < 40; i++) await step(); };
await settle(o.frames || 900);
const laid = st.labelLaid(), it = laid.items.find((d) => d.key === 'n:TIPS'), dims = st.labelDims(), b = it?.box || null;
const dist = (r, q) => Math.hypot(Math.max(r[0] - q[2], 0, q[0] - r[2]), Math.max(r[1] - q[3], 0, q[1] - r[3]));
const br = dims.length ? [Math.min(...dims.map((d) => d[0])), Math.min(...dims.map((d) => d[1])), Math.max(...dims.map((d) => d[2])), Math.max(...dims.map((d) => d[3]))] : null;
const others = laid.items.filter((d) => d !== it);
// (How far the label's box stands off the stent as drawn: the stent's own segments less their half widths, negative where the words cover it.)
const lv = st.labelVessels(); let stentGap = Infinity;
if (b) for (const q of lv.segs) { if (q[5] !== 'TIPS') continue; for (let u = 0; u <= 1; u += 0.05) { const x = q[0] + (q[2] - q[0]) * u, y = q[1] + (q[3] - q[1]) * u; stentGap = Math.min(stentGap, Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3])) - q[4]); } }
console.log('WAIST' + JSON.stringify({ stentGap, text: it?.text, box: b, bracket: br, gap: b && br ? dist(br, b) : null, air: b && others.length ? Math.min(...others.map((d) => dist(d.box, b))) : null, over: b ? others.filter((d) => dist(d.box, b) === 0).map((d) => d.key) : [], overBracket: b ? dims.filter((d) => dist(d, b) === 0).length : 0, leader: !!it?.leader, arrows: page.document.querySelectorAll('#stageOver .clamp[data-id="TIPS~waist"]').length, clampLabels: page.document.querySelectorAll('#stageOver .clamp-label').length, spans: page.document.querySelectorAll('#stageOver .clamp-span[data-id="TIPS~waist"]').length, keys: laid.items.filter((d) => /TIPS|DIPS/.test(d.key)).map((d) => d.key + ' ' + d.text), all: o.free ? laid.items.map((d) => d.key) : undefined, vis: st.stentHalf('TIPS', 2)?.vis, anchor: o.free ? st.labelVessels?.().segs.filter((q) => q[5] === 'TIPS').slice(0, 2) : undefined }));
process.exit(0);
