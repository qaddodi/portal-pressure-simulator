// Left alone, a view stays the same size: no memory, page nodes or listeners that pile up the longer it is watched.
// Each view (anatomy, lobule) runs a busy patient for two minutes untouched; the memory (after a garbage collection),
// the page's node count and its listener count are sampled every 15 s, and the check fails on one that keeps climbing.
//
//   node tests/e2e/idle-steady.mjs [dir]       IDLE_MS=30000 for a quicker local look

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const IDLE_MS = Number(process.env.IDLE_MS || 120000), EVERY = 15000;
const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

async function sample() {
  await cdp.send('HeapProfiler.collectGarbage');
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  return { heap: m.JSHeapUsedSize / 1e6, nodes: m.Nodes, listeners: m.JSEventListeners };
}
// Climbing: the last third of the samples sits clearly above the first third, and nearly every step went up or held.
function climbing(xs, minRise) {
  const third = Math.max(1, Math.floor(xs.length / 3)), mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const rise = mean(xs.slice(-third)) - mean(xs.slice(0, third));
  const ups = xs.slice(1).filter((x, i) => x >= xs[i]).length;
  return rise > minRise && ups >= xs.length - (xs.length >= 6 ? 2 : 1);
}

try {
  await page.goto(server.url + '?preset=cirr-decomp');
  await page.waitForFunction(() => window.pps?.store.get().frame, null, { timeout: 45000 });
  for (const view of ['anatomic', 'lobule']) {
    await page.evaluate((v) => document.querySelector(`#viewSeg [data-view="${v}"]`).click(), view);
    await page.waitForTimeout(5000);   // landed, first rasters done
    const rows = [];
    for (let t = 0; t <= IDLE_MS; t += EVERY) {
      if (t) await page.waitForTimeout(EVERY);
      rows.push(await sample());
    }
    const col = (k) => rows.map((r) => r[k]);
    console.log(`${view.padEnd(8)} heap MB ${col('heap').map((x) => x.toFixed(1)).join(' ')} | nodes ${col('nodes').join(' ')} | listeners ${col('listeners').join(' ')}`);
    // Allowances: the model's own history and caches settle within a few MB (about 2 MB over five minutes) and a few hundred nodes.
    if (climbing(col('heap'), Math.max(4, rows[0].heap * 0.3))) fail(`${view}: memory keeps climbing`);
    if (climbing(col('nodes'), Math.max(200, rows[0].nodes * 0.05))) fail(`${view}: page nodes keep climbing`);
    if (climbing(col('listeners'), 50)) fail(`${view}: listeners keep climbing`);
  }
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`${failed} problem(s)`); process.exit(1); }
console.log('ok: nothing piles up while a view is left alone');
