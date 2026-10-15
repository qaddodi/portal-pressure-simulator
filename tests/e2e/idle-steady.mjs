// Left alone, a view stays the same size: no memory, page nodes or listeners that pile up the longer it is watched.
// Each view (anatomy, lobule) runs a busy patient for two minutes untouched; the memory (after a garbage collection),
// the page's node count and its listener count are sampled every 15 s, and the check fails on one that keeps climbing.
// Left alone, a view also restyles little: the elements the browser restyles each second (a trace over 3 s) stay under
// RESTYLE_BUDGET. (One :has() rule once restyled the whole page, 3,500 elements, on every model tick: about 35,000 a
// second and 30–60% of the CPU on a slide sitting still; with it fixed, a few hundred.)
//
//   node tests/e2e/idle-steady.mjs [dir]       IDLE_MS=30000 for a quicker local look

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const IDLE_MS = Number(process.env.IDLE_MS || 120000), EVERY = 15000, RESTYLE_BUDGET = 3000;
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
// Elements restyled per second over `ms` of the view left alone (Chrome's trace of its style passes).
async function restyled(ms = 3000, pg = page, cd = cdp) {
  const chunks = [];
  const done = new Promise((ok) => cd.once('Tracing.tracingComplete', ok));
  const onData = (e) => chunks.push(...e.value);
  cd.on('Tracing.dataCollected', onData);
  await cd.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
  await pg.waitForTimeout(ms);
  await cd.send('Tracing.end');
  await done;
  cd.off('Tracing.dataCollected', onData);
  const passes = chunks.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
  return passes.reduce((n, e) => n + (e.args?.elementCount || 0), 0) * 1000 / ms;
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
    const rs = await restyled();
    console.log(`${view.padEnd(8)} restyles ${Math.round(rs)} elements a second (budget ${RESTYLE_BUDGET})`);
    if (rs > RESTYLE_BUDGET) fail(`${view}: left alone, it restyles ${Math.round(rs)} elements a second`);
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
  // A phone on a slide left alone: its cards hold still. (Circuit slide 7's words had flipped between two fits, 0.850 and
  // 0.851, on every layout pass, moving the cards a pixel and restyling the whole page about twice a second; a slide
  // change took minutes on a slowed phone.) Nothing on the app's or the cards' inline style may change over 4 s.
  {
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const pp = await pctx.newPage();
    pp.setDefaultTimeout(120000);
    pp.on('pageerror', (e) => errors.push(e.message));
    const pcdp = await pctx.newCDPSession(pp);
    await pp.goto(server.url + '?script=circuit&slide=7');
    const came = await pp.waitForFunction(() => document.querySelector('#app')?.classList.contains('presenting') && !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover, .pz-prep')).then(() => true, () => false);
    if (!came) fail('phone, Circuit slide 7: the slide did not finish arriving within 2 minutes');
    await pp.waitForTimeout(6000);
    const flips = await pp.evaluate(() => new Promise((done) => {
      const seen = [], app = document.getElementById('app');
      const mo = new MutationObserver((ms) => { for (const m of ms) if (m.oldValue !== m.target.getAttribute('style')) seen.push(m.target.id || m.target.className.split(' ')[0]); });
      for (const el of [app, document.querySelector('.pz-text')]) if (el) mo.observe(el, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
      setTimeout(() => { mo.disconnect(); done(seen); }, 4000);
    }));
    console.log(`phone circuit 7: ${flips.length} style change(s) on the app and the words' card in 4 s`);
    if (flips.length) fail(`phone, Circuit slide 7: the cards keep re-laying out while the slide sits still (${flips.slice(0, 6).join(', ')})`);
    const rs = await restyled(3000, pp, pcdp);
    console.log(`phone circuit 7: restyles ${Math.round(rs)} elements a second (budget ${RESTYLE_BUDGET})`);
    if (rs > RESTYLE_BUDGET) fail(`phone, Circuit slide 7: left alone, it restyles ${Math.round(rs)} elements a second`);
    await pctx.close();
  }
  // The sinusoid view sitting still holds still: its zoom and the corner credit stay put, paused or playing, and the credit
  // does not search for a spot again. (The view
  // was sized to sit above the credit's spot while the credit kept clear of the view's labels, so each moved the other
  // about once a second for good on a 13-inch Mac.)
  {
    const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    const sp = await sctx.newPage();
    sp.setDefaultTimeout(120000);
    sp.on('pageerror', (e) => errors.push(e.message));
    await sp.goto(server.url + '?preset=cirr-decomp');
    await sp.waitForFunction(() => window.pps?.store.get().frame);
    await sp.evaluate(() => window.pps.store.set({ lobule: true }));
    await sp.waitForFunction(() => window.pps.stage.lobuleOpen());
    await sp.waitForTimeout(3000);
    await sp.evaluate(() => window.pps.store.set({ sinusoid: true }));
    await sp.waitForFunction(() => window.pps.stage.sinusoidOpen() && document.querySelectorAll('.sv-region').length);
    await sp.waitForTimeout(8000);
    for (const running of [false, true]) {
      await sp.evaluate((r) => window.pps.host.send({ type: 'run', running: r }), running);
      await sp.waitForTimeout(3000);
      const searched = await sp.evaluate(() => window.pps.credit?.searches());
      // (The credit's spot and how far the view's labels travel; a pixel of label drift is allowed.)
      const { spots, drift } = await sp.evaluate(() => new Promise((done) => {
        const spots = new Set(), lo = [], hi = [];
        let n = 0;
        const t = setInterval(() => {
          const c = document.querySelector('.stage-credit'), r = c.getBoundingClientRect();
          spots.add(c.matches('.moving, .covered') ? 'hidden' : `${Math.round(r.left)},${Math.round(r.top)}`);
          [...document.querySelectorAll('.sv-region')].forEach((e, i) => { const y = e.getBoundingClientRect().top; lo[i] = Math.min(lo[i] ?? y, y); hi[i] = Math.max(hi[i] ?? y, y); });
          if (++n >= 30) { clearInterval(t); done({ spots: [...spots], drift: Math.max(0, ...hi.map((y, i) => y - lo[i])) }); }
        }, 200);
      }));
      const how = running ? 'playing' : 'paused';
      console.log(`sinusoid ${how}: credit at ${spots.join(' / ')}, the view's labels moved ${drift.toFixed(1)} px in 6 s`);
      if (spots.length > 1 || drift > 2) fail(`sinusoid view ${how}: the view's zoom or the credit keeps moving while nothing changes (credit ${spots.join(' / ')}, labels ${drift.toFixed(0)} px)`);
      // The credit looks again on every transition and once a second; with nothing moved it keeps its answer instead of
      // searching the art again (that search had cost about 7% of a slowed phone's time on a slide sitting still).
      const searches = (await sp.evaluate(() => window.pps.credit?.searches())) - searched;
      console.log(`sinusoid ${how}: the corner credit searched for a spot ${searches} time(s) in 6 s`);
      if (!(searches <= 1)) fail(`sinusoid view ${how}: the corner credit searched for a new spot ${searches} times while nothing moved`);
    }
    await sctx.close();
  }
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`${failed} problem(s)`); process.exit(1); }
console.log('ok: nothing piles up while a view is left alone');
