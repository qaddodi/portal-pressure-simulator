// Audit of the `// alloc-rare:` tags, headless (2 Nov 2026, "Audit tags and remove fake fixes"). A tag says an allocation happens only on a
// branch that never runs per frame (first use, a changed key, a resize). This serves the app's source with a counter wrapped round every
// tagged allocation (`(__h(id), <the allocation>)`: it changes nothing but the count), runs the page through motions, and reports how many
// times each tagged allocation really ran in each, with the first callers' stacks. A tag whose allocation runs again and again in a motion is
// not rare: the tag is removed and the code fixed (a kept buffer or object written in place).
//
//   node scripts/rare-audit.mjs [--device small|mac|iphone] [--only idle,pan,...] [--json file] [--min 2] [--rounds 3] [--steps 8]
//
// Each motion is run `rounds` times in one page and only the LAST round is judged: whatever a first use builds (a cache, a first key) is
// built by then, so an allocation that still runs is a repeat. Software GL draws a frame in 5 to 10 s during a gesture, so a motion is a few
// steps; the counts are per call, the same on any engine. The page waits for the organs' GPU picture before the first motion.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';
import { openApp, DEVICES } from './shoot.mjs';
import { scan } from './off-gpu-scan.mjs';
import { isFake } from './rare-audit-rule.mjs';

DEVICES.small = { viewport: { width: 760, height: 520 }, deviceScaleFactor: 1 };   // (software GL: the pixels drawn set the pace; the counts per frame do not depend on them)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DEVICE = arg('device', 'small'), ONLY = arg('only', '').split(',').filter(Boolean), OUT = arg('json', ''), MIN = +arg('min', 2), ROUNDS = +arg('rounds', 3), STEPS = +arg('steps', 8);

// node scripts/rare-audit.mjs --classify <audit.json> --root <the tree the audit ran on> --found scripts/rare-audit-found.json
// writes the allocations the audit found running in motion as { file, text } (the line's code, its tag left out): the unit test fails when a
// line with that code carries an alloc-rare tag again.
if (arg('classify', '')) {
  const j = JSON.parse(readFileSync(arg('classify', ''), 'utf8')), root = resolve(arg('root', ROOT));
  const found = new Map();
  for (const h of j.hot) {
    if (!isFake(h.hot, h.frameHits, j.frames)) continue;
    const line = readFileSync(resolve(root, h.file), 'utf8').split('\n')[h.line - 1] || '';
    const text = line.replace(/\s*\/\/\s*alloc-(?:rare|once):.*$/, '').trim();
    const above = readFileSync(resolve(root, h.file), 'utf8').split('\n')[h.line - 2] || '';
    if (!text || /^\/\//.test(text)) continue;
    found.set(`${h.file}\u0000${text}`, { file: h.file, text, ran: Object.fromEntries(Object.entries(h.hot).slice(0, 3)), above: /alloc-(?:rare|once):/.test(above) });
  }
  const out = [...found.values()].sort((a, b) => a.file.localeCompare(b.file) || a.text.localeCompare(b.text)).map(({ file, text, ran }) => ({ file, text, ran }));
  if (arg('found', '')) writeFileSync(resolve(ROOT, arg('found', '')), JSON.stringify({ about: 'Allocations that scripts/rare-audit.mjs found running in motion; tests/rare-tags-audited.test.js fails when one carries an alloc-rare tag.', found: out }, null, 1) + '\n');
  console.log(`${out.length} allocation lines run in motion (of ${j.hot.length} that ran twice or more)`);
  process.exit(0);
}

// ── The tags: every `alloc-rare` allocation the scan leaves out of its count, with the node's place in its file ──
const tags = [];
{
  const seen = new Set();
  for (const r of scan().rare) {
    const k = `${r.file}:${r.start}`;
    if (seen.has(k)) continue;
    seen.add(k);
    tags.push({ id: tags.length, file: r.file, line: r.line, col: r.col, start: r.start, end: r.end, fn: r.fn, detail: r.detail, reason: / rare: (.*)$/.exec(r.detail)?.[1] || '', measured: true });
  }
}
// A node that cannot take a `(count, node)` round it: a spread (not an expression), a getter, setter or method's function (a property's value
// by its own syntax), a class member. Those are listed as not measured.
const AST = new Map();
function unmeasurable(file, t) {
  let ast = AST.get(file);
  if (!ast) { ast = espree.parse(readFileSync(resolve(ROOT, file), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' }); AST.set(file, ast); }
  let bad = false;
  const walk = (n, par) => {
    if (!n || typeof n.type !== 'string' || bad || n.end < t.start || n.start > t.end) return;
    if (n.start === t.start && n.end === t.end && (n.type === t.node || !t.node)) {
      if (n.type === 'SpreadElement' || (par && (par.type === 'MethodDefinition' || par.type === 'PropertyDefinition' || (par.type === 'Property' && (par.kind !== 'init' || par.method))))) bad = true;
      return;
    }
    for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) for (const c of v) walk(c, n); else if (v && typeof v.type === 'string') walk(v, n); }
  };
  walk(ast, null);
  return bad;
}
const byFile = new Map();
for (const t of tags) { t.measured = !unmeasurable(t.file, t); (byFile.get(t.file) || byFile.set(t.file, []).get(t.file)).push(t); }

const PROLOGUE = `globalThis.__H ||= new Int32Array(${tags.length + 1}); globalThis.__S ||= []; globalThis.__h ||= (i) => { const c = ++globalThis.__H[i]; if (c <= 3 && globalThis.__on) (globalThis.__S[i] ||= []).push(new Error().stack.split('\\n').slice(3, 9).map((l) => l.trim().replace(/^at /, '').replace(/https?:\\/\\/[^/]+\\//, '').replace(/\\?v=\\w+/, '')).join(' < ')); };\n`;
function instrumented(file) {
  const text = readFileSync(resolve(ROOT, file), 'utf8');
  const ins = [];   // [offset, order, text]: ends before starts at one offset, so a node ending where the next begins closes first
  for (const t of byFile.get(file) || []) if (t.measured) { ins.push([t.start, 1, `(globalThis.__h(${t.id}),`]); ins.push([t.end, 0, ')']); }
  ins.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  let s = text;
  for (const [o, , x] of ins) s = s.slice(0, o) + x + s.slice(o);
  return PROLOGUE + s;
}
const route = async (ctx) => {
  await ctx.route(/\/src\/.*\.js(\?.*)?$/, async (r) => {
    const file = /\/(src\/.*?\.js)(\?.*)?$/.exec(r.request().url())?.[1];
    if (!file || !byFile.has(file)) return r.continue();
    try { await r.fulfill({ status: 200, contentType: 'text/javascript', body: instrumented(file) }); } catch (e) { console.log(`route ${file}: ${e.message}`); await r.continue(); }
  });
};

if (process.argv.includes('--check')) {   // (offline: every instrumented file must still parse)
  let bad = 0;
  for (const f of byFile.keys()) { try { espree.parse(instrumented(f), { ecmaVersion: 'latest', sourceType: 'module' }); } catch (e) { bad++; console.log(`${f}: ${e.message}`); } }
  console.log(`${tags.length} tagged allocations in ${byFile.size} files, ${tags.filter((t) => !t.measured).length} not measurable; ${bad} files do not parse once instrumented`);
  process.exit(bad ? 1 : 0);
}
const app = await openApp({ device: DEVICE, query: '?preset=cirr-decomp', timeout: 300000, setup: route });
const { page } = app;
const hits = () => page.evaluate(() => Array.from(globalThis.__H || []));
// (The model's frames come by wall time, about 30 a second, and a software renderer draws a display frame in seconds: a motion of 24 display frames sees hundreds of model frames. Both are counted, to tell what a model frame drives from what every display frame does.)
await page.evaluate(() => { globalThis.__mf = 0; window.pps.store.on('frame', () => { globalThis.__mf++; }); });
const modelFrames = () => page.evaluate(() => globalThis.__mf);
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
// (Until the organs' GPU picture has landed the page paints them live every frame, which is not the steady state a motion starts from: motion-budget.mjs waits the same way. On software GL it takes minutes.)
await page.waitForFunction(() => window.pps.stage.organsPictured?.(), null, { timeout: 1200000, polling: 2000 }).then(() => log('organs pictured'), () => log('organs NOT pictured after 20 min: counts include their live painting'));
await sleep(20000);
function report(final) {
  const out = [];
  for (const t of tags) {
    const row = rows.get(t.id) || {};
    const hot = Object.entries(row).filter(([, c]) => c >= MIN);
    if (hot.length) out.push({ file: t.file, line: t.line, col: t.col, fn: t.fn, detail: t.detail, reason: t.reason, hot: Object.fromEntries(hot), stacks: stacks.get(t.id) || {} });
  }
  out.sort((a, b) => Math.max(...Object.values(b.hot)) - Math.max(...Object.values(a.hot)));
  if (final) console.log(`\n${out.length} of ${tags.length} tagged allocations (${tags.filter((t) => !t.measured).length} not measurable) ran at least ${MIN} times in a motion (frames per motion: ${JSON.stringify(nframes)}):`);
  if (final) for (const o of out) console.log(`${o.file}:${o.line}:${o.col}  ${Object.entries(o.hot).map(([k, v]) => `${k} ${v}`).join(', ')}  | ${o.detail.split(' — ')[0]} | ${o.reason.slice(0, 90)}`);
  return out;
}
const rows = new Map();   // id → { motion → count (last round) }
const stacks = new Map();   // id → { motion → [stack] }
const nframes = {}, nmodel = {}, nsecs = {};
const save = (out) => { if (OUT) writeFileSync(OUT, JSON.stringify({ frames: nframes, model: nmodel, secs: nsecs, tags: tags.length, unmeasured: tags.filter((t) => !t.measured).map((t) => `${t.file}:${t.line}`), hot: out }, null, 1)); };
for (const m of MOTIONS.filter((x) => !ONLY.length || ONLY.includes(x.name))) {
  let f0 = 0, f1 = 0, mf0 = 0, mf1 = 0, t0, secs = 0, h0 = null, h1 = null, st = {};
  for (let r = 1; r <= ROUNDS; r++) {
    log(`${m.name} round ${r}`);
    await page.evaluate((last) => { globalThis.__on = last; globalThis.__S.length = 0; }, r === ROUNDS);
    h0 = await hits();
    f0 = await framesDrawn(); mf0 = await modelFrames(); t0 = Date.now();
    try { await m.run(); } catch (e) { console.log(`${m.name}: round ${r} failed: ${String(e.message).split('\n')[0]}`); }
    f1 = await framesDrawn(); mf1 = await modelFrames(); secs = (Date.now() - t0) / 1000;
    h1 = await hits();
    if (r === ROUNDS) st = await page.evaluate(() => Object.fromEntries(globalThis.__S.map((s, i) => [i, s]).filter(([, s]) => s)));
  }
  nframes[m.name] = f1 - f0; nmodel[m.name] = mf1 - mf0; nsecs[m.name] = +secs.toFixed(1);
  for (const t of tags) {
    if (!t.measured) continue;
    const c = h1[t.id] - h0[t.id];
    const row = rows.get(t.id) || {}; row[m.name] = c; rows.set(t.id, row);
    if (c >= MIN && st[t.id]) { const e = stacks.get(t.id) || {}; e[m.name] = st[t.id]; stacks.set(t.id, e); }
  }
  console.log(`${m.name}: ${f1 - f0} frames in the last round; ${tags.filter((t) => t.measured && h1[t.id] - h0[t.id] >= MIN).length} tagged allocations ran at least ${MIN} times`);
  save(report(false));
}
await app.close();

save(report(true));
