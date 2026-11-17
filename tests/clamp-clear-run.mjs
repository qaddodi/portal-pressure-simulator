// One figure booted in node for clamp-clear.test.js: a TIPS narrowed (s, its waist in cm), the model playing, a solve every 20 frames; prints
// the narrowing's words (clamp-label) as the solve laid them and every label shown over them, on a line that begins CLAMP. args JSON { size, view, s, waist, frames }
import { bootGL, pump } from './stage-gl-boot.js';
const o = JSON.parse(process.argv[2] || '{}');
const SIZES = { mac: [1024, 768, 1, false], iphone: [395, 859, 3, true] };
const [w, h, dpr, coarse] = SIZES[o.size || 'mac'];
// (The labels read the cards' boxes from an IntersectionObserver's first report: one that reports at once, as a browser does after its layout.)
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.els = []; } observe(el) { this.els.push(el); this.t ||= setTimeout(() => this.cb(this.els.map((e) => ({ target: e, boundingClientRect: e.getBoundingClientRect() }))), 0); } disconnect() {} unobserve() {} };
const { st, page } = await bootGL({ w, h, dpr, coarse });
const { store } = await import('../src/ui/store.js');
const { createCore } = await import('../src/worker-core.js');
const tasks = () => new Promise((r) => setImmediate(r));
let q = [];
const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
await core.handle({ type: 'init' });
await core.handle({ type: 'preset', id: 'cirr-decomp' });
const P = JSON.parse(JSON.stringify(core.engine().params));
Object.assign(P, { tips: { on: true, d: 8 }, stenosis: { TIPS: o.s ?? 0.6 }, stentGeom: { TIPS: { waist: o.waist ?? 1, ...(o.red ? { red: o.red } : {}) } } });
await core.handle({ type: 'setParams', params: P, settle: true });
await core.handle({ type: 'run', running: true });
let lastF = null;
const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
store.set({ params: P });
st.setView?.(o.view || 'circuit');
for (let i = 0; i < (o.frames || 500); i++) { await step(); if (i % 20 === 0) st.labelLayoutNow(); }
st.labelLayoutNow(); for (let i = 0; i < 40; i++) await step();
// (o.card: a card laid over the narrowing's words where they stand (or o.card as [x0, y0, x1, y1]), as a card opening over them: they must move off it
// or fade out whole, never stand under it.)
let card = null;
if (o.card) {
  const el0 = page.document.querySelector('#stageOver .clamp-label'), b = el0?._box;
  card = !b ? null : o.card === "top" ? [0, 0, w, b.y1 + 10] : o.card === "half" ? [(b.x0 + b.x1) / 2, b.y0 - 10, b.x1 + 20, b.y1 + 10] : [b.x0 - 20, b.y0 - 10, b.x1 + 20, b.y1 + 10];
  const div = page.document.createElement('div'); div.className = 'stage-blocker'; div.id = 'testCard';
  page.document.querySelector('#stageView').append(div);
  const was = page.dom.window.Element.prototype.getBoundingClientRect;
  page.dom.window.Element.prototype.getBoundingClientRect = function () { if (this.id === 'testCard' && card) { const [l, t, r, bb] = card; return { left: l, top: t, right: r, bottom: bb, x: l, y: t, width: r - l, height: bb - t }; } return was.call(this); };
  { const E0 = page.dom.window.Event; page.dom.window.dispatchEvent(new E0("pps:occ")); if (globalThis.dispatchEvent && globalThis !== page.dom.window) globalThis.dispatchEvent(new E0("pps:occ")); }
  for (let i = 0; i < 300; i++) { await step(); if (i % 20 === 0) st.labelLayoutNow(); }
  st.labelLayoutNow(); for (let i = 0; i < 80; i++) await step();
}
const doc = page.document, laid = st.labelLaid().items;
const cl = [...doc.querySelectorAll('#stageOver .clamp-label')].map((el) => ({ t: el._txt ?? el.textContent, box: el._box ? [el._box.x0, el._box.y0, el._box.x1, el._box.y1].map(Math.round) : [0, 0, 0, 0] }));
const lap = [];
for (const c of cl) for (const d of laid) { const [a0, b0, a1, b1] = c.box, [x0, y0, x1, y1] = d.box; if (a0 < x1 && a1 > x0 && b0 < y1 && b1 > y0) lap.push(d.key + ' ' + d.text); }
// (every leader that runs through a narrowing's words: from its point to its label's centre, sampled every 2 px)
const cross = [];
for (const d of laid) {
  if (!d.leader) continue;
  const cx = (d.box[0] + d.box[2]) / 2, cy = (d.box[1] + d.box[3]) / 2;
  for (const c of cl) {
    const [a0, b0, a1, b1] = c.box;
    if (d.ax >= a0 - 8 && d.ax <= a1 + 8 && d.ay >= b0 - 8 && d.ay <= b1 + 8) continue;
    const n = Math.ceil(Math.hypot(cx - d.ax, cy - d.ay) / 2);
    for (let i = 0; i <= n; i++) { const x = d.ax + ((cx - d.ax) * i) / n, y = d.ay + ((cy - d.ay) * i) / n; if (x > a0 && x < a1 && y > b0 && y < b1) { cross.push(`${d.key} through ${c.t}`); break; } }
  }
}
const op = [...doc.querySelectorAll('#stageOver .clamp-label')].map((el) => +(el.style.opacity === '' ? 1 : el.style.opacity));
console.log('CLAMP' + JSON.stringify({ cl, op, card, lap, cross, labels: laid.map((d) => [d.key, d.text, d.box.map(Math.round)]) }));
process.exit(0);
