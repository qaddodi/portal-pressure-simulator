// Garbage a frame makes once V8 has compiled it ("warm"), in node: each case in scripts/warm/cases.mjs is a frame function of the page,
// called thousands of times to warm it up, then measured over a run with no collection in between (a large young generation, a forced
// collection first). scripts/frame-alloc.mjs measures the real app in a browser, but headless that runs a few frames a second and V8 never
// compiles the frame code, so it counts the numbers boxed by the interpreter along with the real garbage; this counts only the real kind.
//
//   node --expose-gc --max-semi-space-size=128 --min-semi-space-size=128 scripts/warm-alloc.mjs [--json] [--case <text>]
//
// Limits (bytes a frame, per case) are in scripts/warm-alloc-limits.json; a case over its limit exits 1. A case with no limit is only listed.
import { readFileSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import { spawnSync } from 'node:child_process';
/* global gc */

const WARM = 6000, MEASURE = 2000;
if (typeof gc !== 'function') { console.error('run with: node --expose-gc --max-semi-space-size=128 --min-semi-space-size=128 scripts/warm-alloc.mjs'); process.exit(2); }
const json = process.argv.includes('--json'), profile = process.argv.includes('--profile');
const only = process.argv.includes('--case') ? process.argv[process.argv.indexOf('--case') + 1] : '';
const { CASES } = await import('./warm/cases.mjs');
const limits = JSON.parse(readFileSync(new URL('./warm-alloc-limits.json', import.meta.url), 'utf8'));
const results = [];
const index = process.argv.includes('--index') ? +process.argv[process.argv.indexOf('--index') + 1] : -1;
// Each case runs in a process of its own (what one case leaves behind, a page's DOM, a heap already grown, must not change another's reading).
if (index < 0 && !profile) {
  for (let i = 0; i < CASES.length; i++) {
    if (only && !CASES[i].name.includes(only)) continue;
    const r = spawnSync(process.execPath, ['--expose-gc', '--max-semi-space-size=128', '--min-semi-space-size=128', process.argv[1], '--json', '--index', String(i)], { encoding: 'utf8', timeout: 170000, maxBuffer: 1 << 26 });
    try { results.push(...JSON.parse(r.stdout.trim().split('\n').pop())); } catch { results.push({ name: CASES[i].name, error: `no result: ${(r.stderr || '').split('\n').slice(-3).join(' | ')}`, limit: limits[CASES[i].name] ?? null }); }
  }
  report();
}
function report() {
  const over = results.filter((r) => r.error || (r.limit != null && r.bytes > r.limit));
  if (json) console.log(JSON.stringify(results));
  else {
    for (const r of results) console.log(`${r.error ? 'ERROR' : r.limit != null && r.bytes > r.limit ? 'OVER ' : 'ok   '} ${r.name}: ${r.error ?? `${r.bytes} B/frame${r.limit != null ? ` (limit ${r.limit})` : ''}`}`);
    const total = results.reduce((a, r) => a + (r.bytes || 0), 0);
    console.log(`warm garbage: ${total} B/frame over ${results.length} frame functions`);
  }
  process.exit(over.length ? 1 : 0);
}
for (let ci = 0; ci < CASES.length; ci++) {
  const c = CASES[ci];
  if (index >= 0 ? ci !== index : (only && !c.name.includes(only))) continue;
  let r;
  try {
    const frame = await c.setup();
    const warm = c.warm ?? WARM, measure = c.measure ?? MEASURE;
    for (let i = 0; i < warm; i++) frame(i);
    gc(); gc();
    let session = null;
    if (profile) { session = new Session(); session.connect(); await session.post('HeapProfiler.enable'); await session.post('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
    // (The young generation is sized so that nothing is collected over the run: a collection frees the very garbage being counted, and the
    // heap then reads far too low. A run in which one did happen is an error, not a small number.)
    const gcs = new PerformanceObserver(() => {});
    gcs.observe({ entryTypes: ['gc'] });
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < measure; i++) frame(warm + i);
    const after = process.memoryUsage().heapUsed;
    const collected = gcs.takeRecords().length;
    gcs.disconnect();
    if (collected) throw new Error(`${collected} collector runs during the measure: the heap reading is too low (raise --min-semi-space-size or lower the case's measure)`);
    const bytes = Math.max(0, (after - before) / measure);
    r = { name: c.name, bytes: Math.round(bytes), limit: limits[c.name] ?? null };
    if (session) {
      const { profile: p } = await session.post('HeapProfiler.stopSampling');
      const by = new Map();
      const walk = (n) => { if (n.selfSize) { const k = `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url.replace(/^.*\/(src|scripts)\//, '$1/')}:${n.callFrame.lineNumber + 1}`; by.set(k, (by.get(k) || 0) + n.selfSize); } for (const ch of n.children || []) walk(ch); };
      walk(p.head);
      console.log(`-- ${c.name}`);
      for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, +(process.env.WARM_TOP || 14))) console.log(`   ${(v / measure).toFixed(0).padStart(6)} B/frame  ${k}`);
      session.disconnect();
    }
  } catch (e) {
    r = { name: c.name, error: String(e && e.stack || e).split('\n').slice(0, 3).join(' | '), limit: limits[c.name] ?? null };
  }
  results.push(r);
}
report();
