// Audit of the `// alloc-rare:` tags, headless (2 Nov 2026, "Audit tags and remove fake fixes"). A tag says a line allocates only on a
// branch that never runs per frame. This runs the page through motions and counts, with V8's precise block coverage, how many times
// each tagged line's block ran in each. A tag whose line runs again and again in a motion is not rare: the tag is removed and the
// code fixed (a kept buffer or object written in place).
//
//   node scripts/rare-audit.mjs [--device mac|iphone] [--only idle,pan,...] [--json file] [--min 2] [--rounds 2]
//
// Each motion is run `rounds` times in one page, and the counts of the LAST round are the ones judged: whatever a first use builds
// (a cache, a first key) is built by then, so a line that still runs is a repeat, not a first use. A line is listed when its block
// ran at least `min` times in that round. Coverage counts a block, not a line: a conditional inside a block that ran may not have
// run itself, so a listed line is a suspect whose code is read, never a verdict by itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, DEVICES } from './shoot.mjs';
DEVICES.small = { viewport: { width: 760, height: 520 }, deviceScaleFactor: 1 };   // (software GL: the pixels drawn set the pace; the counts per frame do not depend on them)
import { scan } from './off-gpu-scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DEVICE = arg('device', 'small'), ONLY = arg('only', '').split(',').filter(Boolean), OUT = arg('json', ''), MIN = +arg('min', 2), ROUNDS = +arg('rounds', 2), STEPS = +arg('steps', 8);   // (software GL draws a frame in 5 to 10 s during a gesture: a few steps stand for it)

// ── The tags: every `alloc-rare` line the scan counts as left out, plus the line the tag sits on or above ──
const RARE = /\/\/\s*alloc-(?:rare|once):\s*(\S.*?)\s*$/;
const tags = [];
{
  const hits = scan();
  const seen = new Set();
  for (const r of hits.rare) {
    const k = `${r.file}:${r.line}:${r.col}`;
    if (seen.has(k)) continue;
    seen.add(k);
    tags.push({ file: r.file, line: r.line, col: r.col, fn: r.fn, detail: r.detail });
  }
}
const texts = new Map();
const textOf = (file) => { let t = texts.get(file); if (!t) { const s = readFileSync(resolve(ROOT, file), 'utf8'); const starts = [0]; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) starts.push(i + 1); t = { s, starts }; texts.set(file, t); } return t; };
for (const t of tags) {
  const { s, starts } = textOf(t.file);
  const a = starts[t.line - 1], b = (starts[t.line] ?? s.length + 1) - 1;
  const line = s.slice(a, b);
  const ci = line.search(/\/\/\s*alloc-(?:rare|once):/);
  const code = ci < 0 ? line : line.slice(0, ci);
  // (the allocation's own first character: the innermost block that holds it is the one whose count says how often it runs)
  t.point = a + t.col - (/closure/.test(t.detail) ? 1 : 0); void code;   // (a closure's own range starts at its first character, so it would give its call count: a closure is probed one character before, in the block that makes it)
  t.reason = RARE.exec(line)?.[1] || RARE.exec((s.slice(starts[t.line - 2] ?? 0, starts[t.line - 1] ?? 0)))?.[1] || '';
}

// ── Coverage ──
const app = await openApp({ device: DEVICE, query: '?preset=cirr-decomp', timeout: 300000 });
const { page } = app;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
const byUrl = new Map();   // file → ranges list [{s, e, c}] of the last take
const fileOf = (url) => { const m = /\/(src\/.*?\.js)(\?.*)?$/.exec(url); return m ? m[1] : null; };
async function take() {
  const { result } = await cdp.send('Profiler.takePreciseCoverage');
  byUrl.clear();
  for (const sc of result) {
    const f = fileOf(sc.url);
    if (!f) continue;
    const list = [];
    for (const fn of sc.functions) for (const r of fn.ranges) list.push({ s: r.startOffset, e: r.endOffset, c: r.count });
    byUrl.set(f, list);
  }
}
// Count of the innermost range that holds an offset (ranges nest, so the smallest span wins). A script never run is absent: 0.
const countAt = (list, off) => { let best = null; for (const r of list) if (r.s <= off && off < r.e && (!best || r.e - r.s <= best.e - best.s)) best = r; return best ? best.c : 0; };
function counts() {
  const out = new Map();
  for (const t of tags) {
    const list = byUrl.get(t.file);
    out.set(`${t.file}:${t.line}:${t.col}`, list ? countAt(list, t.point) : 0);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 1) => page.evaluate((n) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), n);
const framesDrawn = () => page.evaluate(() => window.pps.perf.totals.frames);
const box = await page.locator('.stage-view').boundingBox();
const home = async () => { await page.evaluate(() => window.pps.stage.fit()); await sleep(1500); };
const run = (on) => page.evaluate((on) => window.pps.host.send({ type: 'run', running: on }), on);

// A slider drag as the inspector makes it: a value per frame, the model told once per frame (inspector.js slider: updateParams, no history on a drag).
const drag = (key) => async () => {
  await page.evaluate(async ([key, steps]) => {
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const set = {
      cirrhosis: (p, v) => { p.cirrhosis = v; },
      fibSin: (p, v) => { p.fibrosis.R.sin = 1 + 39 * v; p.fibrosis.L.sin = 1 + 39 * v; },
      fibPre: (p, v) => { p.fibrosis.R.pre = 1 + 79 * v; p.fibrosis.L.pre = 1 + 79 * v; },
    }[key];
    const N = steps;
    for (let i = 0; i <= N; i++) { const v = i <= N / 2 ? i / (N / 2) : (N - i) / (N / 2); window.pps.updateParams((p) => { set(p, v); return p; }, { history: false }); await raf(); }
  }, [key, STEPS]);
  await sleep(1000);
};

const log = (m) => console.log(`  [${new Date().toISOString().slice(11, 19)}] ${m}`);
const MOTIONS = [
  { name: 'idle', run: async () => { await home(); await sleep(6000); } },
  { name: 'pan', run: async () => {
    await home();
    const p = [box.x + box.width * 0.55, box.y + box.height * 0.4], N = STEPS;
    await page.mouse.move(p[0], p[1]); await page.mouse.down();
    for (let i = 1; i <= N; i++) { await page.mouse.move(p[0] + i * 6.5, p[1] - i * 3.3); await frames(1); }
    await page.mouse.up(); await sleep(800);
  } },
  { name: 'pinch', run: async () => {
    await home();
    const c = [box.x + box.width * 0.5, box.y + box.height * 0.45], N = STEPS;
    await page.mouse.move(c[0], c[1]); await page.keyboard.down('Control');
    for (let i = 1; i <= N; i++) { await page.mouse.wheel(0, i <= N / 2 ? -10 : 10); await frames(1); }
    await page.keyboard.up('Control'); await sleep(800);
  } },
  { name: 'glide', run: async () => {
    await home();
    for (const mv of [() => window.pps.stage.zoomIn(), () => window.pps.stage.zoomOut(), () => window.pps.stage.fit()]) { await page.evaluate(mv); await sleep(1800); }
  } },
  { name: 'drag cirrhosis', run: drag('cirrhosis') },
  { name: 'drag fibrosis (sinusoidal)', run: drag('fibSin') },
  { name: 'drag fibrosis (pre)', run: drag('fibPre') },
  { name: 'time lapse', run: async () => {
    await page.evaluate(() => { window.pps.store.set({ lapse: 30 }); window.pps.host.send({ type: 'run', speed: 30, clock: 'disease', running: true }); });
    await sleep(8000);
    await page.evaluate(() => { window.pps.store.set({ lapse: 0, speed: 1 }); window.pps.host.send({ type: 'run', speed: 1, clock: 'hemo' }); });
    await sleep(1000);
  } },
  { name: 'lobule idle', run: async () => {
    await page.evaluate(() => window.pps.store.set({ lobule: true }));
    await sleep(15000);
  } },
  { name: 'lobule pan+pinch', run: async () => {
    const c = [box.x + box.width * 0.5, box.y + box.height * 0.45], N = STEPS;
    await page.mouse.move(c[0], c[1]); await page.mouse.down();
    for (let i = 1; i <= N; i++) { await page.mouse.move(c[0] + i * 6, c[1] - i * 3); await frames(1); }
    await page.mouse.up();
    await page.keyboard.down('Control');
    for (let i = 1; i <= N; i++) { await page.mouse.wheel(0, i <= N / 2 ? -10 : 10); await frames(1); }
    await page.keyboard.up('Control'); await sleep(800);
  } },
  { name: 'lobule drag fibrosis', run: drag('fibSin') },
  { name: 'sinusoid dive', run: async () => {
    await page.evaluate(() => window.pps.stage.diveToSinusoid());
    await sleep(12000);
    await page.evaluate(() => window.pps.stage.exitSinusoid());
    await sleep(8000);
  } },
  { name: 'lobule out', run: async () => {
    await page.evaluate(() => window.pps.store.set({ lobule: false }));
    await sleep(8000);
  } },
  { name: 'view switch', run: async () => {
    for (const v of ['circuit', 'anatomic']) { await page.evaluate((v) => window.pps.store.set({ view: v }), v); await sleep(6000); }
  } },
];

await run(true);
await sleep(8000);
await take();   // (discard what the load and the settle ran)
const rows = new Map();   // "file:line" → { name → count (last round) }
const nframes = {};
for (const m of MOTIONS.filter((x) => !ONLY.length || ONLY.includes(x.name))) {
  let last = null, f0 = 0, f1 = 0;
  for (let r = 1; r <= ROUNDS; r++) {
    await take();
    f0 = await framesDrawn();
    log(`${m.name} round ${r}`);
    try { await m.run(); } catch (e) { console.log(`${m.name}: round ${r} failed: ${String(e.message).split('\n')[0]}`); }
    f1 = await framesDrawn();
    await take();
    last = counts();
  }
  nframes[m.name] = f1 - f0;
  for (const [k, c] of last) { const row = rows.get(k) || {}; row[m.name] = c; rows.set(k, row); }
  const n = [...last.values()].filter((c) => c >= MIN).length;
  console.log(`${m.name}: ${f1 - f0} frames in the last round; ${n} tagged lines ran at least ${MIN} times`);
}
await app.close();

const out = [];
for (const t of tags) {
  const row = rows.get(`${t.file}:${t.line}:${t.col}`) || {};
  const hot = Object.entries(row).filter(([, c]) => c >= MIN);
  if (hot.length) out.push({ file: t.file, line: t.line, col: t.col, fn: t.fn, detail: t.detail, reason: t.reason, hot: Object.fromEntries(hot) });
}
out.sort((a, b) => Math.max(...Object.values(b.hot)) - Math.max(...Object.values(a.hot)));
console.log(`\n${out.length} of ${tags.length} tagged lines ran at least ${MIN} times in a motion (frames per motion: ${JSON.stringify(nframes)}):`);
for (const o of out) console.log(`${o.file}:${o.line}  ${Object.entries(o.hot).map(([k, v]) => `${k} ${v}`).join(', ')}  | ${o.detail.split(' — ')[0]} | ${o.reason.slice(0, 90)}`);
if (OUT) writeFileSync(OUT, JSON.stringify({ frames: nframes, tags: tags.length, hot: out }, null, 1));
