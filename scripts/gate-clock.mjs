// The gate's stepping helpers (scripts/gate.mjs, and any check that wants the same deterministic clock): a browser launcher, a page with
// its errors collected, and Playwright's fake clock run in steps.
//
//   const browser = await launch(false);            // false: no WebGL (SVG figure, fast); true: software WebGL named as a GPU (scripts/shoot.mjs)
//   const app = await openPage(browser, url, { size: 'desktop' });   // clock installed before the page's scripts, paused one second on
//   await stepUntil(app.page, landed, 3);           // run the page's clock in 100 ms steps until `landed(3)` is true in the page
//   await stepFor(app.page, 600);                   // or run it for 600 ms
//   app.errors                                      // page errors, console errors, failed requests, HTTP >= 400 so far

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { instantMotion } from '../tests/e2e/fast.mjs';
import { CHROMIUM_ARGS } from './shoot.mjs';

export const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 1000, height: 640 } },   // (the views stage: software WebGL costs by the pixel)
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
export const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
export const launch = (gl) => chromium.launch({ args: gl ? CHROMIUM_ARGS : ['--no-sandbox', '--disable-3d-apis'], ...(EXE ? { executablePath: EXE } : {}) });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** In the page, before its scripts: the software renderer names itself as a GPU (scripts/shoot.mjs GPU_NAME), so the app takes its GPU path. */
export function gpuName() {
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const gp = C.prototype.getParameter; C.prototype.getParameter = function (p) { return p === 0x9246 || p === 0x1F01 ? 'Apple M2 GPU' : gp.call(this, p); }; }
}

// ---- the fake clock -------------------------------------------------------------------------------------------------------
// Playwright's clock fakes Date, performance.now, requestAnimationFrame, setTimeout/Interval and requestIdleCallback in the page. It
// is installed before the page's scripts run, so every timestamp the page takes is on it; once the page is up time moves only
// when this file runs it (runFor), in steps of STEP ms, so the order and the moment of every timer and frame is the same on every run.
export const STEP = 100;
// The page's Workers (the engine, the sweep that works out every slide's state) run on real time, and the page has timeouts on them (the
// sweep client drops a worker silent for 20 s). Run flat out, the fake clock passes those 20 s in milliseconds while the worker is still
// working, and a slide that should land never does (seen: hvpg 2, one run in two). So after every step the gate waits PACE real ms: the
// clock never runs faster than PACE_RATIO = STEP / PACE times real time, and the timeouts keep their margin. (GATE_PACE=ms to change.)
export const PACE = +(process.env.GATE_PACE ?? 40);

/** Runs the page's clock on in STEP ms runs until `ready` (a function run in the page, given `arg`) is true, at most `maxFake` ms.
 *  Returns the fake ms it took, or -1 when it never became true. The check is made every `every` ms of fake time. */
export async function stepUntil(page, ready, arg, { maxFake = 20000, every = 300 } = {}) {
  for (let t = 0; t <= maxFake; t += STEP) {
    if (t % every === 0 && await page.evaluate(ready, arg)) return t;
    await page.clock.runFor(STEP);
    if (PACE) await sleep(PACE);
  }
  return -1;
}
/** In the page: has the presenter landed on slide `w`? A case card (a vignette the talk waits on) is tapped away as a person would. */
export const landed = (w) => { document.querySelector('.pz-case.on')?.click(); return !window.pps.presenter.busy() && Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === w; };
export const stepFor = async (page, ms) => { for (let t = 0; t < ms; t += STEP) { await page.clock.runFor(STEP); if (PACE) await sleep(PACE); } };

/** A page on `url` with its errors collected: page errors, console errors, failed requests and bad responses. */
export async function openPage(browser, url, { size = 'desktop', clock = true, instant = true, scheme = 'light', motion = 'reduce', init } = {}) {
  const ctx = await browser.newContext({ ...SIZES[size], colorScheme: scheme, serviceWorkers: 'block', reducedMotion: motion });
  if (instant) await ctx.addInitScript(instantMotion);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console error: ${m.text().split('\n')[0].slice(0, 200)}`); });
  page.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) errors.push(`request failed: ${r.url().split('/').slice(-2).join('/')} ${r.failure()?.errorText || ''}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`HTTP ${r.status()}: ${r.url().split('/').slice(-2).join('/')}`); });
  if (clock) await page.clock.install();
  await page.goto(url);
  // From here time moves only when the gate runs the clock: the page is paused one second on (its scripts load on real time, their timers on this one).
  if (clock) await page.clock.pauseAt(Date.now() + 1000);
  return { page, ctx, errors, close: () => ctx.close() };
}
export const figureUp = (page) => page.waitForFunction(() => window.pps?.store?.get().frame && !document.documentElement.dataset.boot, null, { timeout: 120000 });

/** Runs `tasks` (async functions) `JOBS` at a time. */
export async function pool(tasks, jobs = 4) {
  const q = [...tasks.entries()];
  await Promise.all(Array.from({ length: Math.min(jobs, q.length) }, async () => { for (let it = q.shift(); it; it = q.shift()) await it[1](); }));
}


// ---- real time, for the pages the clock cannot drive ------------------------------------------------------------------------
// On the figure's WebGL path a fake clock is no use: the page believes every 16 ms frame is free, so each fake 100 ms is six software-GL
// draws and the first half second of the boot took a minute (measured 3 Nov). Those pages run on real time, and the gate waits for state, never
// for a fixed time: these are stepUntil / stepFor for them (the same arguments; the times are real ms).

/** Polls `ready` in the page every 100 ms until it is true; returns the ms it took, or -1 after `maxFake` ms. */
export async function watchUntil(page, ready, arg, { maxFake = 20000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 <= maxFake) {
    // (a page drawing in software can sit on an evaluate for minutes: each is given what is left of the wait, and the answer then is "not yet")
    const left = Math.max(1000, maxFake - (Date.now() - t0));
    const ok = await Promise.race([page.evaluate(ready, arg).catch(() => false), sleep(left).then(() => false)]);
    if (ok) return Date.now() - t0;
    await sleep(100);
  }
  return -1;
}
export const watchFor = (_page, ms) => sleep(ms);

/** page.evaluate that gives up: a page that does not answer in `ms` is a finding, not a hang. */
export async function ask(page, fn, arg, ms = 60000) {
  let timer;
  const dead = new Promise((_, no) => { timer = setTimeout(() => no(new Error(`the page did not answer in ${ms / 1000} s`)), ms); });
  try { return await Promise.race([page.evaluate(fn, arg), dead]); } finally { clearTimeout(timer); }
}
