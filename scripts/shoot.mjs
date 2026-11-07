// The one way to take a screenshot of the real app from a machine without a GPU (cloud agents, CI).
//
// Why it exists: headless Chromium gives the app one of three different pictures, and without checking which, shots differ run to run:
//   1. no WebGL2 at all                 -> data-veins="none": the SVG vessels (flat strokes), not what a phone or laptop shows.
//   2. SwiftShader (software WebGL2)    -> data-renderer="software", data-quality="2": the app deliberately steps down to 8 frames a
//                                          second at half the pixels (soft, blocky vessels, no GPU glass), as it would on a GPU-less laptop.
//   3. SwiftShader, named as a GPU      -> data-renderer="gpu", data-quality="0": the same code path, resolution and shading an iPhone,
//                                          iPad or Mac runs (just slowly). This is the only one that matches the owner's screen.
// This script always asks for 3, checks it before and after the shot, and exits non-zero with the reason when it did not get it.
//
//   node scripts/shoot.mjs --out <png> [--device mac|ipad|ipad-portrait|iphone|iphone-landscape] [--theme light|dark]
//        [--script <deck> --slide <n>] [--query "preset=cirr-decomp&..."] [--eval "<js run in the page once, before settling>"]
//        [--dir <folder to serve: . (default) or dist>] [--url <already running site>] [--dpr <n>] [--wait <s, default 20>] [--no-vessels] [--live (do not pause the model)]
//        [--selector "<css>"] (screenshot just that element) [--cards-wait <s, default 240; 0 = do not wait for a talk slide's cards>]
// On a talk slide (--script, or a query with script=) the shot also waits until the slide's cards have come in: on software GL that takes
// about 90 s alone and over 150 s beside a second browser, and a shot taken inside it shows a card that is only a shell. Run one shot at a time.
// A slide whose figure is faded behind a table card (the summary tables) has almost no vessel colour: pass --no-vessels for it.
//
// As a module (several shots in one browser): import { openApp } from './shoot.mjs'.
//   const app = await openApp({ device: 'iphone', theme: 'dark', query: '?script=hvpg&slide=3' });
//   await app.settle(); await app.page.screenshot({ path }); await app.close();
// Each openApp() boots a fresh page (the Circuit/Lobule views do not reopen reliably on a reused one).

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEVICES = {
  mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },   // (1, not the Retina 2: software GL at 2880x1800 draws 2 frames in 3 s; --dpr 2 asks for it)
  ipad: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true },
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'iphone-landscape': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

// Chromium's software WebGL2, switched on (it is off in headless by default), and not blocklisted.
// The cloud agents' Chromium sits at a fixed path (the project's Playwright may expect another build number); CHROMIUM overrides it.
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
export const CHROMIUM_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];

// Names the renderer as a GPU (the app tells a software renderer by its name, veins-gl.js `software`). Only the name changes: every
// draw still runs on SwiftShader. UNMASKED_RENDERER_WEBGL 0x9246, RENDERER 0x1F01.
const GPU_NAME = () => {
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const gp = C.prototype.getParameter;
    C.prototype.getParameter = function (p) { return p === 0x9246 || p === 0x1F01 ? 'Apple M2 GPU' : gp.call(this, p); };
  }
};

/** What the page is drawing the vessels with, from the attributes the stage sets on itself. */
export const readPath = (page) => page.evaluate(() => {
  const v = document.querySelector('.stage-view'), c = document.getElementById('veins') || v?.querySelector('canvas');
  let lost = null;
  try { lost = c?.getContext('webgl2')?.isContextLost?.() ?? null; } catch { /* the canvas has another context */ }
  return {
    veins: v?.dataset.veins ?? null, renderer: v?.dataset.renderer ?? null, quality: v?.dataset.quality ?? null, res: v?.dataset.res ?? null,
    glOn: !!v?.classList.contains('gl-on'), lost,
  };
});

/** Throws, naming the cause, when the page is not on the full GPU path. */
export function assertGpuPath(p, what = 'the page') {
  const why = [];
  if (p.veins !== 'webgl2') why.push(`no WebGL2 context (data-veins="${p.veins}"): ${what} would draw the flat SVG vessels`);
  if (p.renderer !== 'gpu') why.push(`the app took the software path (data-renderer="${p.renderer}"): 8 frames a second at half the pixels`);
  if (p.quality !== '0') why.push(`quality step ${p.quality}, not 0: the vessels are drawn at reduced pixels or pace (Battery saver or a software renderer)`);
  if (!p.glOn) why.push('.stage-view has no gl-on: the SVG vessels show');
  if (p.lost) why.push('the WebGL context is lost');
  if (why.length) throw new Error(`NOT THE REAL APP'S GPU PATH:\n  - ${why.join('\n  - ')}\n  (${JSON.stringify(p)})`);
}

/** The page is on the GPU path AND the GPU is drawing the figure: the path attributes (assertGpuPath; `software` accepts the software renderer's
 *  own path, WebGL2 still required) and a shot of the page with the vessels' colours in it (the flat SVG vessels, a lost context or a blank
 *  canvas have almost none). Throws, naming the cause. `vessels: false` for a view that has none. A check that runs on the SVG fallback
 *  proves nothing about the figure the owner sees (the glitch sweep ran its flags without WebGL for a day, 3 Nov 2026), so every
 *  script that judges the figure calls this at the start and again at the end of its run. */
export async function assertGpuLive(page, what = 'the page', { software = false, vessels = true, wait = 40000 } = {}) {
  const p = await readPath(page);
  if (software) {
    const why = [];
    if (p.veins !== 'webgl2') why.push(`no WebGL2 context (data-veins="${p.veins}")`);
    if (!p.glOn) why.push('.stage-view has no gl-on: the SVG vessels show');
    if (p.lost) why.push('the WebGL context is lost');
    if (why.length) throw new Error(`NOT DRAWN BY THE GPU: ${what}:\n  - ${why.join('\n  - ')}\n  (${JSON.stringify(p)})`);
  } else assertGpuPath(p, what);
  if (vessels) {
    // (a figure still coming up draws its vessels a moment after the page says it is up: looked at for `wait` ms before it counts as not drawing)
    let s;
    for (const t0 = Date.now(); ; ) {
      s = await colourShare(page, await page.screenshot({ timeout: 150000 }));
      if (s >= 0.002 || Date.now() - t0 > wait) break;
      await page.waitForTimeout(2000);
    }
    if (s < 0.002) throw new Error(`NOT DRAWN BY THE GPU: ${what}: almost no vessel colour on the page (${(s * 100).toFixed(3)} % of its pixels), the GPU figure did not draw (${JSON.stringify(p)})`);
  }
}

/** Share of a screenshot's pixels that are strongly coloured (the vessels' reds and blues; the page chrome is grey). Decoded in the page. */
export const colourShare = (page, png) => page.evaluate(async (b64) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const k = Math.min(1, 400 / img.width), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) n++;
  return n / (c.width * c.height);
}, png.toString('base64'));

/** Runs in the page: true once the open talk slide's cards have come in whole. False while the talk is still opening, while the slide's
 *  cards are built unseen (`pz-prep`, the words held at opacity 0 behind a card that shows only its tag), while a card is fading or
 *  sliding in or out (a running finite animation or transition in it, or its own opacity under 1), and while the Doppler still says
 *  "Acquiring…" (it needs 1.5 s of the vessel recorded). A slide held behind its case card counts once that card is up. */
export const CARDS_LANDED = () => {
  const root = document.querySelector('.pz');
  if (!root || root.classList.contains('pz-prep') || 'bare' in root.dataset) return false;
  const shown = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  const moving = (e) => e.getAnimations({ subtree: true }).some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime));
  const whole = (e) => +getComputedStyle(e).opacity >= 0.99 && !moving(e) && !e.classList.contains('pz-leave') && !e.classList.contains('pz-hide');
  const kase = document.querySelector('.pz-case.on');
  if (shown(kase)) return whole(kase);
  const cards = ['.pz-text', '.pz-data', '.pz-panel'].map((q) => document.querySelector(q)).filter((e) => shown(e) && e.childElementCount);
  if (!cards.length || !cards.every(whole)) return false;
  return !/Acquiring/.test(document.querySelector('.pz-data')?.textContent || '');
};

/** Opens the app on a fresh page on the GPU path. Rejects (naming the cause) when that is not what it got. */
export async function openApp({ device = 'mac', theme = 'light', query = '', dir = '.', url = '', timeout = 180000, dpr, browser: shared, fakeClock = false, initScript = '', setup } = {}) {
  const dev = DEVICES[device];
  if (!dev) throw new Error(`unknown device "${device}" (${Object.keys(DEVICES).join(', ')})`);
  const isTalk = /(^|[?&])script=/.test(query);   // (a deck slide: its cards are waited for, settle)
  const server = url ? null : await serve(resolve(ROOT, dir));
  const browser = shared || await chromium.launch({ args: CHROMIUM_ARGS, ...(EXE ? { executablePath: EXE } : {}) });
  const ctx = await browser.newContext({ ...dev, ...(dpr ? { deviceScaleFactor: dpr } : {}), colorScheme: theme, serviceWorkers: 'block' });
  if (setup) await setup(ctx);   // (before the page opens: a route that serves changed source, rare-audit.mjs)
  const page = await ctx.newPage();
  page.setDefaultTimeout(timeout);
  await page.addInitScript(GPU_NAME);
  if (initScript) await page.addInitScript(initScript);   // (a probe's hooks, in before the page's own scripts)
  if (fakeClock) await page.clock.install();   // (frame-step.mjs: time runs by itself until it pauses it, so no timestamp the page took earlier is ahead of the clock)
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const close = async () => { await ctx.close(); if (!shared) await browser.close(); server?.close(); };
  try {
    const base = url || server.url;
    await page.goto(base + (query && !query.startsWith('?') ? `?${query}` : query));
    await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout });
    assertGpuPath(await readPath(page), `${device} ${theme}`);
  } catch (e) { await close(); throw e; }

  /** Pauses the model (its beat and the moving blood hold still) so two shots can be identical. */
  const freeze = () => page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));

  /** A talk slide's cards (words, data, teaching card) take a long time to come in on software GL: about 90 s alone and over 150 s beside a
   *  second browser, the slide's own entry running all the while (built unseen, the card a shell with only its tag, then faded in). Two
   *  shots 2.5 s apart can match inside that, so a shot waits here until the cards have landed (CARDS_LANDED, seen twice in a row, 1 s
   *  apart). True when they did, false when `max` seconds passed first. */
  async function cardsIn(max) {
    const t0 = Date.now();
    for (let ok = 0; Date.now() - t0 < max * 1000;) {
      ok = (await page.evaluate(CARDS_LANDED)) ? ok + 1 : 0;
      if (ok >= 2) return true;
      await page.waitForTimeout(1000);
    }
    return false;
  }

  /** Waits for the view to land (and, on a talk slide, for its cards to come in: `cards` is the most seconds to wait for that, 0 to skip),
   *  pauses the model (its beat and the moving blood hold still), waits until two shots 2.5 s apart are byte-identical (a view still easing
   *  is not a bug), then checks the GPU path again and that vessels are in the shot. Returns the last shot. */
  async function settle({ wait = 20, vessels = true, max = 150, hold = true, cards = isTalk ? 240 : 0 } = {}) {
    await page.waitForTimeout(wait * 1000);
    if (cards && !(await cardsIn(cards))) console.warn(`shoot: the slide's cards had not come in after ${cards} s more; taking it as it is (a loaded machine: raise --cards-wait, and shoot one browser at a time; or a slide held on something else)`);
    if (hold) await freeze();
    let prev = null, shot;
    const t0 = Date.now();
    for (;;) {
      shot = await page.screenshot({ timeout: 150000 });
      if (prev && shot.equals(prev)) break;
      if (Date.now() - t0 > max * 1000) { console.warn(`shoot: still moving after ${max} s; taking it as it is (a loop that never ends, or a loaded machine)`); break; }
      prev = shot;
      await page.waitForTimeout(2500);
    }
    assertGpuPath(await readPath(page), `${device} ${theme}`);
    if (vessels) {
      const s = await colourShare(page, shot);
      if (s < 0.002) throw new Error(`almost no vessel colour in the shot (${(s * 100).toFixed(3)} % of its pixels): the figure did not draw (pass --no-vessels for a view that has none)`);
    }
    return shot;
  }
  /** For fakeClock: pauses the clock for stepping (page.clock.runFor) and waits until the page's frames come every step. The fake clock
   *  runs by itself until it is paused, and a cold boot's long tasks can leave it stepped back: the page's one frame request (frame.js
   *  `pending`) is then stamped later than the clock now reads and does not fire until the clock reaches it (measured 2.3 s and 4.3 s),
   *  so a stepped run saw no frame for that long, a count frozen and then jumping to its end. Not the app: performance.now() of a real
   *  browser never steps back. Returns the ms stepped to get there. */
  async function pauseClock() {
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
    const frames = () => page.evaluate(() => window.pps?.perf?.totals?.frames ?? 0);
    let stepped = 0;
    for (let k = 0; k < 80; k++) {
      const f0 = await frames();
      await page.clock.runFor(250); stepped += 250;
      if ((await frames()) - f0 >= 10) break;   // (250 ms is 15 frames at 60 Hz: they come every step again)
    }
    return stepped;
  }
  return { page, ctx, browser, close, settle, freeze, pauseClock, errors, device, theme };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const flag = (k) => process.argv.includes(`--${k}`);
  const out = arg('out');
  if (!out) { console.error('usage: node scripts/shoot.mjs --out <png> [--device mac|ipad|ipad-portrait|iphone|iphone-landscape] [--theme light|dark] [--script deck --slide n] [--query q] [--eval js] [--dir .|dist] [--url u] [--wait s] [--no-vessels] [--live (do not pause the model)] [--selector css] [--cards-wait s]'); process.exit(2); }
  const script = arg('script'), slide = arg('slide');
  let query = arg('query', '');
  if (script) query += `${query ? '&' : ''}script=${script}${slide ? `&slide=${slide}` : ''}`;
  let app;
  try {
    app = await openApp({ device: arg('device', 'mac'), theme: arg('theme', 'light'), query, dpr: Number(arg('dpr', 0)) || undefined, dir: arg('dir', '.'), url: arg('url', '') });
    const js = arg('eval');
    if (js) await app.page.evaluate(js);
    await app.settle({ wait: Number(arg('wait', 20)), vessels: !flag('no-vessels'), hold: !flag('live'), ...(arg('cards-wait') != null ? { cards: Number(arg('cards-wait')) } : {}) });
    mkdirSync(dirname(resolve(out)), { recursive: true });
    const sel = arg('selector');
    if (sel) await app.page.locator(sel).first().screenshot({ path: out, timeout: 150000 });
    else await app.page.screenshot({ path: out, timeout: 150000 });
    const p = await readPath(app.page);
    console.log(`${out}  ${app.device} ${app.theme}  GPU path confirmed (renderer=${p.renderer}, quality=${p.quality}, res=${p.res}, gl-on)`);
    if (app.errors.length) console.warn(`page errors: ${app.errors.slice(0, 3).join(' | ')}`);
    await app.close();
  } catch (e) {
    console.error(`shoot FAILED: ${e.message}`);
    await app?.close().catch(() => {});
    process.exit(1);
  }
}
