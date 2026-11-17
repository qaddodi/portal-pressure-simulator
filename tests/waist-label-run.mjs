// One figure booted in node for waist-label.test.js: a TIPS with a mid waist (red = how much of the lumen it takes, waist its length in cm), the model playing, a solve
// every 20 frames; prints where the waist's words stand against its bracket, and the leader that joins them when they stand off, on a line that begins WAIST.
import { bootGL, pump } from './stage-gl-boot.js';
const o = JSON.parse(process.argv[2] || '{}');
const SIZES = { mac: [1024, 768, 1, false], iphone: [395, 859, 3, true], ipad: [820, 1180, 2, true], ipadl: [1180, 820, 2, true], small: [800, 600, 1, false] };
const [w, h, dpr, coarse] = SIZES[o.size || 'mac'];
const { st, page } = await bootGL({ w, h, dpr, coarse });
const { store } = await import('../src/ui/store.js');
const { createCore } = await import('../src/worker-core.js');
const tasks = () => new Promise((r) => setImmediate(r));
let q = [];
const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
await core.handle({ type: 'init' });
await core.handle({ type: 'preset', id: o.preset || 'cirr-decomp' });
const P = JSON.parse(JSON.stringify(core.engine().params));
Object.assign(P, { tips: { on: true, d: 8 }, stenosis: {}, stenosisSite: {}, stentGeom: { TIPS: { len: 8, waist: o.waist ?? 1, trans: 0, red: o.red ?? 0.45 } } });
await core.handle({ type: 'setParams', params: P, settle: true });
await core.handle({ type: 'run', running: true });
let lastF = null;
const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
store.set({ params: P });
st.setView?.(o.view || 'anatomy');
for (let i = 0; i < (o.frames || 400); i++) { await step(); if (i % 20 === 0 && !o.free) st.labelLayoutNow(); }
if (!o.free) st.labelLayoutNow(); for (let i = 0; i < 40; i++) await step();
const doc = page.document;
const measure = () => {
const doc = page.document, el = doc.querySelector('#stageOver .clamp-label[data-id="TIPS~waist"]'), span = doc.querySelector('#stageOver .clamp-span[data-id="TIPS~waist"]');
const nums = (span?.getAttribute('d') || '').match(/-?[\d.]+/g)?.map(Number) || [];
const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push(st.worldToLocal(nums[i], nums[i + 1]));
const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
const br = pts.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
const b = el?._box ? [el._box.x0, el._box.y0, el._box.x1, el._box.y1] : null;
const gap = br && b ? Math.hypot(Math.max(br[0] - b[2], 0, b[0] - br[2]), Math.max(br[1] - b[3], 0, b[1] - br[3])) : null;
const leader = !!doc.querySelector('#stageOver [data-k="cl:TIPS~waist"], #stageOver path.leader') ;
const laid = st.labelLaid().items, over = b ? laid.filter((d) => b[0] < d.box[2] && b[2] > d.box[0] && b[1] < d.box[3] && b[3] > d.box[1]).map((d) => d.key + ' ' + d.text) : [];
const air = b ? Math.min(...laid.map((d) => Math.hypot(Math.max(d.box[0] - b[2], 0, b[0] - d.box[2]), Math.max(d.box[1] - b[3], 0, b[1] - d.box[3])))) : null;
const cc = el?._c ? st.worldToLocal(el._c.x, el._c.y).map(Math.round) : null;
return ('WAIST' + JSON.stringify({ text: el?._txt, box: b, bracket: br, gap, air, over, cc, leads: st.labelLaid().clampLeads, vessel: el?._c?.vessel, labelLeaders: [...doc.querySelectorAll('.leader')].length, cl: el?._c ? { d: el._d, mv: !!el._c } : null }));
};
const cam0 = st.cameraState();
const rows = [];
for (const dx of (o.sweep || [0])) {
  if (o.sweep) { st.setCamera({ ...cam0, k: cam0.k * (o.zoom || 1), x: cam0.x + dx }, 10); for (let i = 0; i < 60; i++) await step(); if (!o.free) st.labelLayoutNow(); for (let i = 0; i < 40; i++) await step(); }
  rows.push(dx + ' ' + measure());
}
console.log(rows.join('\n'));
process.exit(0);
