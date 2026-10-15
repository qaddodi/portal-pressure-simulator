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
  // Heat and battery: a view with nothing changing draws nothing and stops asking for frames, as the figure does; one
  // that plays draws at 30 frames a second (15 in Battery saver), not the screen's 60 or 120. (FibroScan computed its
  // map every screen refresh; the paused lobule and sinusoid asked for about 45 frames a second with nothing to draw.)
  // pps.perf: callbacks per second per surface (`surfaces`) and frames each really drew (`drawn`), over the last second.
  {
    const run = (on) => page.evaluate((v) => window.pps.host.send({ type: 'run', running: v }), on);
    // Callbacks and frames drawn per second for `tag` over 3 s, once the view has settled. (A slow software-GL runner
    // may draw only a few frames a second: a playing view must still draw, and never more often than its pace.)
    const rate = async (tag, settle = 3000) => {
      await page.waitForTimeout(settle);
      const t = () => page.evaluate((g) => { const p = window.pps.perf; return { at: performance.now(), asks: p.totals.asks[g] || 0, drawn: p.totals.drawn[g] || 0, stage: p.totals.asks.stage || 0 }; }, tag);
      const a = await t();
      await page.waitForTimeout(3000);
      const b = await t(), s = (b.at - a.at) / 1000, per = (k) => Math.round((b[k] - a[k]) / s * 10) / 10;
      return { asks: per('asks'), drawn: per('drawn'), stage: per('stage'), frames: b.drawn - a.drawn };
    };
    const busy = (what, r, max) => { console.log(`${what.padEnd(26)} asks ${r.asks}/s, draws ${r.drawn}/s (draws at most ${max})`); if (r.drawn > max) fail(`${what}: draws ${r.drawn} frames a second (at most ${max})`); if (r.frames < 1) fail(`${what}: drew nothing in 3 s, so it no longer moves`); };
    // Paused, a view first finishes easing (on a software-GL runner a frame can take half a second, so that may take a
    // while); then, over 3 s, it must draw nothing and ask for at most its four safety looks a second (the figure under the
    // lobule: four for its blood and four for a FibroScan probe).
    const quiet = (r, figure) => r.drawn === 0 && r.asks <= 6 && (!figure || r.stage <= 10);
    const still = async (what, tag, figure = false) => {
      let r = await rate(tag, 1000);
      for (let t0 = Date.now(); !quiet(r, figure) && Date.now() - t0 < 40000;) r = await rate(tag, 0);
      console.log(`${what.padEnd(26)} asks ${r.asks}/s, draws ${r.drawn}/s${figure ? `, figure asks ${r.stage}/s` : ''} (nothing changes)`);
      if (r.drawn > 0 || r.asks > 6) fail(`${what}: nothing changes, but it still asks for ${r.asks} frames a second and draws ${r.drawn}`);
      if (figure && r.stage > 10) fail(`${what}: the figure under it asks for ${r.stage} frames a second`);
      // Asleep, a change still shows: the theme flipped by hand (no store change, so only its own look wakes it) is drawn.
      if (tag !== 'fibroscan') {
        const n = () => page.evaluate((g) => window.pps.perf.totals.drawn[g] || 0, tag), n0 = await n();
        const orig = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await page.evaluate(() => { const d = document.documentElement, dark = d.dataset.theme === 'dark' || (!d.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches); d.setAttribute('data-theme', dark ? 'light' : 'dark'); });
        await page.waitForTimeout(2500);
        const n1 = await n();
        await page.evaluate((o) => { const d = document.documentElement; if (o) d.setAttribute('data-theme', o); else d.removeAttribute('data-theme'); }, orig);
        await page.waitForTimeout(2500);
        console.log(`${what.padEnd(26)} theme flipped: drew ${n1 - n0} frame(s)`);
        if (n1 === n0) fail(`${what}: asleep, it did not redraw for a new theme`);
      }
      // Asleep, it wakes on Play: it must move again.
      await run(true);
      const w = await rate(tag, 1500);
      console.log(`${what.padEnd(26)} then Play: draws ${w.drawn}/s`);
      if (w.frames < 1) fail(`${what}: after a pause, Play does not start it moving again`);
    };
    for (const saverOn of [false, true]) {
      await page.evaluate((on) => window.pps.stage.setSaver(on), saverOn);
      const cap = saverOn ? 17 : 33, tag = saverOn ? ' (saver)' : '';
      await page.evaluate(() => document.querySelector('#viewSeg [data-view="anatomic"]').click());
      await page.evaluate(() => window.pps.dock.show('fibroscan', { reveal: true }));
      await run(true); busy(`FibroScan, playing${tag}`, await rate('fibroscan'), cap);
      await run(false); await still(`FibroScan, paused${tag}`, 'fibroscan');
      await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
      await run(true); busy(`lobule, playing${tag}`, await rate('lobule-zoom', 5000), cap);
      await run(false); await still(`lobule, paused${tag}`, 'lobule-zoom', true);
      if (await page.evaluate(() => !document.querySelector('#viewSeg [data-view="sinusoid"]').hidden)) {
        await page.evaluate(() => document.querySelector('#viewSeg [data-view="sinusoid"]').click());
        await run(true); busy(`sinusoid, playing${tag}`, await rate('sinusoid-view', 5000), cap);
        await run(false); await still(`sinusoid, paused${tag}`, 'sinusoid-view');
        await page.evaluate(() => document.querySelector('#viewSeg [data-view="lobule"]').click());
      } else console.log('sinusoid: no WebGL2 here, not checked');
    }
    await page.evaluate(() => window.pps.stage.setSaver(false));
    await run(true);
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
