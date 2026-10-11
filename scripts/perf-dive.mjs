// Performance of the dive into the lobule (Anatomy → Lobule): frame times and main-thread stalls
// across the zoom, desktop size at full speed and with the CPU 4× slower; with --profile, the
// functions that took the most time (CPU profile, self time).
//
//   node scripts/perf-dive.mjs [dir] [--profile] [--preset=cirr-decomp] [--wait=6000]

import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) || '.';
const profile = args.includes('--profile');
const wait = +((args.find((a) => a.startsWith('--wait=')) || '--wait=6000').slice(7));   // time on the anatomy before the dive
const preset = (args.find((a) => a.startsWith('--preset=')) || '--preset=cirr-decomp').slice(9);
const server = await serve(dir);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const cpu of [1, 4]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.addInitScript(() => {
    window.__stalls = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__stalls.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  });
  await page.goto(server.url + '?preset=' + preset);
  await page.waitForFunction(() => window.pps?.store.get().frame, null, { timeout: 60000 });
  await page.waitForTimeout(wait);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const since = await page.evaluate(() => performance.now());
  const frames = await page.evaluate(() => new Promise((done) => {
    const out = []; let last = performance.now(); const start = last;
    window.pps.store.set({ lobule: true });
    const tick = (t) => { out.push(t - last); last = t; if (t - start < 2600) requestAnimationFrame(tick); else done(out); };
    requestAnimationFrame(tick);
  }));
  let prof = null;
  if (profile) prof = (await cdp.send('Profiler.stop')).profile;
  const stalls = (await page.evaluate(() => window.__stalls)).filter(([t]) => t >= since).map(([, d]) => Math.round(d));
  const sorted = [...frames].sort((a, b) => a - b);
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  console.log(`cpu ${cpu}×: ${frames.length} frames in 2.6 s · frame p50 ${p(0.5).toFixed(0)} ms, p95 ${p(0.95).toFixed(0)} ms, max ${sorted.at(-1).toFixed(0)} ms · long tasks ${stalls.length}, total ${stalls.reduce((a, b) => a + b, 0)} ms [${stalls.join(', ')}]`);
  if (prof && process.env.PROF_OUT) (await import('node:fs')).writeFileSync(`${process.env.PROF_OUT}-${cpu}.json`, JSON.stringify(prof));
  if (prof) {
    const self = new Map(), byId = new Map(prof.nodes.map((n) => [n.id, n]));
    const dt = prof.timeDeltas; const cnt = new Map();
    prof.samples.forEach((id, i) => cnt.set(id, (cnt.get(id) || 0) + (dt[i] || 0)));
    for (const [id, t] of cnt) { const n = byId.get(id).callFrame; const k = `${n.functionName || '(anon)'} ${n.url.split('/').pop().split('?')[0]}:${n.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + t); }
    let js = 0; for (const [k, t] of self) if (!/^\((program|idle)\)/.test(k)) js += t;
    console.log(`  script and canvas work on the main thread: ${(js / 1000).toFixed(0)} ms (the rest is the browser's own rendering)`);
    for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${(t / 1000).toFixed(0).padStart(6)} ms  ${k}`);
    // Inclusive time per function (each function counted once per sample).
    const parent = new Map(); for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const incl = new Map();
    for (const [id, t] of cnt) {
      const seen = new Set();
      for (let q = id; q != null; q = parent.get(q)) { const n = byId.get(q).callFrame; if (!n.url) continue; const k = `${n.functionName || '(anon)'} ${n.url.split('/').pop().split('?')[0]}:${n.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + t); } }
    }
    console.log('  inclusive:');
    for (const [k, t] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${(t / 1000).toFixed(0).padStart(6)} ms  ${k}`);
  }
  await ctx.close();
}
await browser.close();
server.close();
