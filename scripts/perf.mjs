// Performance check in a real browser: time to a running model, frame rate and main-thread
// stalls on a fast desktop, a mid-range laptop (CPU 4× slower) and a phone (6× slower, 3×
// pixel density), with a busy patient (decompensated cirrhosis, collaterals open, flow moving).
//
//   node scripts/perf.mjs [dir]             report (dir defaults to the repository root)
//   node scripts/perf.mjs [dir] --budget    also fail if a budget below is exceeded
//
// CPU throttling slows the page's main thread only; the GPU process is not throttled, so
// numbers compare builds with each other, not with a particular phone.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) || '.';
const budget = args.includes('--budget');
// Budgets: median frame time (ms) and the longest main-thread stall once running (ms).
const BUDGET = { desktop: { p50: 20, stall: 250 }, laptop: { p50: 40, stall: 500 }, phone: { p50: 60, stall: 900 } };
const PROFILES = {
  desktop: { cpu: 1, ctx: { viewport: { width: 1440, height: 900 } } },
  laptop: { cpu: 4, ctx: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 } },
  phone: { cpu: 6, ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
};

const server = await serve(dir);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let over = 0;
for (const [name, prof] of Object.entries(PROFILES)) {
  const ctx = await browser.newContext({ ...prof.ctx, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  await page.addInitScript(() => {
    window.__stalls = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__stalls.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  });
  const t0 = Date.now();
  await page.goto(server.url + '?preset=cirr-decomp');
  await page.waitForFunction(() => document.querySelector('#scenarioName')?.textContent.includes('Decompensated') && window.pps?.store.get().frame, null, { timeout: 60000 });
  const ready = Date.now() - t0;
  await page.waitForTimeout(2500);
  const since = await page.evaluate(() => performance.now());
  const frames = await page.evaluate(() => new Promise((done) => {
    const out = []; let last = performance.now(); const start = last;
    const tick = (t) => { out.push(t - last); last = t; if (t - start < 5000) requestAnimationFrame(tick); else done(out); };
    requestAnimationFrame(tick);
  }));
  const stalls = (await page.evaluate(() => window.__stalls)).filter(([t]) => t >= since).map(([, d]) => d);
  frames.sort((a, b) => a - b);
  const p = (q) => frames[Math.min(frames.length - 1, Math.floor(frames.length * q))];
  const r = { ready, fps: frames.length / 5, p50: p(0.5), p95: p(0.95), stall: Math.max(0, ...stalls), stalls: stalls.length };
  const b = BUDGET[name];
  const bad = budget && (r.p50 > b.p50 || r.stall > b.stall);
  if (bad) over++;
  console.log(`${bad ? 'OVER' : 'ok  '} ${name.padEnd(8)} ready ${String(r.ready).padStart(5)} ms · ${r.fps.toFixed(1).padStart(5)} fps · frame p50 ${r.p50.toFixed(0).padStart(3)} ms, p95 ${r.p95.toFixed(0).padStart(3)} ms · stalls ${r.stalls} (longest ${r.stall.toFixed(0)} ms)`);
  await ctx.close();
}
await browser.close();
server.close();
if (over) { console.log(`${over} profile(s) over budget`); process.exit(1); }
