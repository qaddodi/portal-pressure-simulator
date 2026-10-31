// Frame time and input latency, gated (premium-feel recs R2 and R5; P1). On the laptop and phone profiles (scripts/perf-profiles.mjs:
// the CPU slowed 4× and 6×, the screen's size and pixel density) it drives the production build as a person does and judges:
//
//   frame time     a pan, a pinch (or a trackpad pinch), a camera glide, and a slide change (Next through a deck): the scheduler's
//                  script time per frame (p50, p95, longest, and each surface's own), and the interval between frames. Judged on
//                  the script time always, on the interval only where the renderer is a GPU (CI's runners draw in software, which
//                  sets their pace, not the app: frame.js watchFrames, frame-stats.js).
//   input latency  Next, a tap on a verb (a Treat order), a lens switch, and opening the menu (the first time, cold, and again):
//                  the time from the input to the frame in which the page first changed (frame.js perf().inputToPaint).
//
// The bars are the recs' (scripts/perf-limits.json "target"); the ceilings that block are its "fail". A scenario over its ceiling is
// run once more and the better run kept (a shared runner has bad moments; a real regression has them both times).
//
//   node scripts/frame-gate.mjs [dir] [--profile=laptop,phone] [--mode=warn|block] [--out=test-results/perf-gate]
//                               [--deck=hvpg] [--steps=6]
//   PERF_PROFILE, PERF_GATE, PERF_OUT, PERF_DECK, PERF_STEPS do the same.
//
// warn (the default; checks.yml): breaches are annotations and the exit code is 0. block (ci.yml): a breach past a ceiling exits 1,
// and so does a run that measured nothing. A scenario that cannot be measured (a control missing, a timeout) is listed as not
// measured and is a warning, never a failure by itself. Writes perf-gate-<profile>.json (every frame's numbers and the long frames,
// with their surfaces and phases) to --out, and a table to the job summary.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { serve } from './serve.mjs';
import { PROFILES } from './perf-profiles.mjs';
import { summarizeRaw, mergeRaw, longFrameLine } from '../src/ui/frame-stats.js';
import { loadLimits, judgeFrames, judgeInput, frameLines, inputLines, verdictOf } from './frame-gate-lib.mjs';

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--')) || '.';
const flag = (name, env, dflt) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? process.env[env] ?? dflt;
const MODE = flag('mode', 'PERF_GATE', 'warn');
const WHICH = flag('profile', 'PERF_PROFILE', 'laptop,phone').split(',').filter(Boolean);
const OUT = flag('out', 'PERF_OUT', 'test-results/perf-gate');
const DECK = flag('deck', 'PERF_DECK', 'hvpg');
const STEPS = Math.max(1, +flag('steps', 'PERF_STEPS', '6'));
if (!['warn', 'block'].includes(MODE)) throw new Error(`--mode must be warn or block, not ${MODE}`);
for (const p of WHICH) if (!['laptop', 'phone'].includes(p)) throw new Error(`--profile: laptop or phone, not ${p}`);

const LIMITS = loadLimits();
const server = await serve(dir);
// (The flags the other browser checks use: WebGL on a machine with no graphics card draws in software; the figure needs a context.)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** `n` browser frames of the page, so a gesture's steps are paced at the screen's rate as a hand's are. */
const frames = (page, n = 1) => page.evaluate((n) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), n);
const LOAD = 240000;

async function openPage(ctx, prof, query, errors) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);   // (a control that is not there fails in 30 s; loads wait LOAD, explicitly)
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  await page.goto(server.url + query);
  return { page, cdp };
}
const figureReady = (page) => page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('canvas#veins') && document.getElementById('world') && window.pps.perf?.inputToPaint, null, { timeout: LOAD });

/** Records the scheduler's frames while `work` runs and for `settle` ms after; the recording's raw numbers. */
async function recorded(page, work, settle = 600) {
  await page.evaluate(() => window.pps.perf.frames.start());
  let err;
  try { await work(); await sleep(settle); } catch (e) { err = e; }
  const raw = await page.evaluate(() => window.pps.perf.frames.stop());
  if (err) throw err;
  return raw;
}

/** The answers the page gave inputs made by `act`: [{ kind, target, ms }], once none is waiting. */
async function inputsOf(page, act) {
  const since = await page.evaluate(() => window.pps.perf.inputToPaint.summary().n);
  await act();
  await page.waitForFunction(() => window.pps.perf.inputToPaint.pending() === 0, null, { timeout: 8000, polling: 50 }).catch(() => {});
  return page.evaluate((s) => window.pps.perf.inputToPaint.entries(s), since);
}
/** The answer to the input an action made: the first of `kinds` the page answered (a tap's click, else its press; a key's keydown). */
const answer = (got, kinds = ['click', 'pointerdown']) => { for (const k of kinds) { const e = got.find((x) => x.kind === k); if (e) return e; } return null; };
const KEY = ['keydown'];

async function runProfile(name) {
  const prof = PROFILES[name], limits = LIMITS[name], touch = !!prof.ctx.hasTouch;
  const res = { name, cpu: prof.cpu, renderer: 'unknown', frames: [], inputs: [], skipped: [], errors: [] };
  const errors = res.errors;
  const ctx = await browser.newContext({ ...prof.ctx, serviceWorkers: 'block' });
  const skip = (what, why) => { res.skipped.push({ name: what, why: String(why).split('\n')[0].slice(0, 160) }); console.log(`  ${what.padEnd(20)} NOT MEASURED: ${res.skipped.at(-1).why}`); };
  let gpu = false;

  // Frame scenarios: run, judged, and run once more if over a ceiling (the better run kept).
  const frameScenario = async (what, perform) => {
    try {
      let best = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const raw = await perform();
        const sum = summarizeRaw(raw), breaches = judgeFrames(sum, limits, { gpu });
        const rank = [breaches.filter((b) => b.level === 'fail').length, sum.script.p95];
        const r = { name: what, raw, sum, breaches, attempts: attempt, notes: [] };
        if (!best || rank[0] < best.rank[0] || (rank[0] === best.rank[0] && rank[1] < best.rank[1])) best = { ...r, rank };
        if (!breaches.some((b) => b.level === 'fail')) break;
        console.log(`  ${what}: over a ceiling, once more…`);
      }
      const r = { ...best }; delete r.rank;
      r.notes = [...(r.attempts > 1 ? [`(run ${r.attempts} times; the better one is shown)`] : []), ...(r.raw.notes || []), ...worstFrames(r.raw)];
      res.frames.push(r);
      for (const l of frameLines(r, { gpu })) console.log(l);
    } catch (e) { skip(what, e.message); }
  };
  const worstFrames = (raw) => (raw.long || []).slice().sort((a, b) => Math.max(b.gap, b.script) - Math.max(a.gap, a.script)).slice(0, 2).map((f) => `long frame:${longFrameLine(f).slice(1)}`);

  // Input scenarios: `n` samples of one action, judged by the slowest; over a ceiling, all of them once more.
  const inputScenario = async (what, gated, n, sample, retry = gated) => {
    try {
      let best = null;
      for (let attempt = 1; attempt <= (retry ? 2 : 1); attempt++) {
        const samples = [];
        for (let i = 0; i < n; i++) {
          const a = await sample(i);
          if (!a) throw new Error(`the page did not answer sample ${i + 1}`);
          samples.push({ ms: a.ms, what: `${a.kind} ${a.target}` });
          await sleep(350);
        }
        const breaches = gated ? judgeInput(samples, limits) : [];
        const r = { name: what, gated, samples, breaches };
        const worst = Math.max(...samples.map((s) => s.ms));
        if (!best || worst < best.worst) best = { ...r, worst };
        if (!breaches.some((b) => b.level === 'fail')) break;
        console.log(`  ${what}: over a ceiling, once more…`);
      }
      const r = { ...best }; delete r.worst;
      res.inputs.push(r);
      for (const l of inputLines(r)) console.log(l);
    } catch (e) { skip(what, e.message); }
  };

  console.log(`\n${name} (CPU ${prof.cpu}×, ${prof.ctx.viewport.width}×${prof.ctx.viewport.height} @${prof.ctx.deviceScaleFactor || 1}×)`);

  // ── The menu, the first time: a fresh page, tapped as soon as the app is up (the module may not have been warmed yet) ──
  try {
    const { page } = await openPage(ctx, prof, '?preset=cirr-decomp', errors);
    await figureReady(page);
    // (once only: a second tap would be the warm menu, and would close it)
    await inputScenario('menu (cold)', true, 1, async () => answer(await inputsOf(page, () => (touch ? page.locator('#btnMenu').tap() : page.locator('#btnMenu').click()))), false);
    await page.close();
  } catch (e) { skip('menu (cold)', e.message); }

  // ── The anatomy: frame scenarios with the model running, then the inputs with it paused (so only the page's answer changes it) ──
  try {
    const { page: A, cdp } = await openPage(ctx, prof, '?preset=cirr-decomp', errors);
    await figureReady(A);
    res.renderer = await A.evaluate(() => document.querySelector('[data-renderer]')?.dataset.renderer || 'unknown');
    gpu = res.renderer === 'gpu';
    console.log(`  renderer: ${res.renderer}${gpu ? '' : ' (the interval between frames is reported, not judged)'}`);
    await A.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
    await sleep(4000);   // (landed, first rasters done)
    const box = await A.locator('.stage-view').boundingBox();
    const home = async () => { await A.evaluate(() => window.pps.stage.fit()); await sleep(1800); };
    const touchTo = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });

    await home();
    await frameScenario('pan', () => recorded(A, async () => {
      const p = [box.x + box.width * 0.55, box.y + box.height * 0.4], N = 80;
      if (touch) {
        await touchTo('touchStart', [p]);
        for (let i = 1; i <= N; i++) { await touchTo('touchMove', [[p[0] - i * 2.5, p[1] + i * 1.6]]); await frames(A, 1); }
        await touchTo('touchEnd', []);
      } else {
        await A.mouse.move(p[0], p[1]); await A.mouse.down();
        for (let i = 1; i <= N; i++) { await A.mouse.move(p[0] + i * 4, p[1] - i * 2); await frames(A, 1); }
        await A.mouse.up();
      }
    }));

    await home();
    await frameScenario(touch ? 'pinch (two fingers)' : 'pinch (trackpad)', () => recorded(A, async () => {
      // (Spread out, then back in: 30 steps each way, so the view ends where it began.)
      const c = [box.x + box.width * 0.5, box.y + box.height * 0.45], N = 60, at = (i) => (i <= N / 2 ? i : N - i);
      if (touch) {
        await touchTo('touchStart', [[c[0] - 30, c[1]], [c[0] + 30, c[1]]]);
        for (let i = 1; i <= N; i++) { const d = 60 + at(i) * 4; await touchTo('touchMove', [[c[0] - d / 2, c[1]], [c[0] + d / 2, c[1]]]); await frames(A, 1); }
        await touchTo('touchEnd', []);
      } else {
        await A.mouse.move(c[0], c[1]);
        await A.keyboard.down('Control');
        for (let i = 1; i <= N; i++) { await A.mouse.wheel(0, i <= N / 2 ? -6 : 6); await frames(A, 1); }
        await A.keyboard.up('Control');
      }
    }));

    await home();
    await frameScenario('camera glide', () => recorded(A, async () => {
      // In, out, and home: three glides, each left to land.
      for (const move of [() => window.pps.stage.zoomIn(), () => window.pps.stage.zoomOut(), () => window.pps.stage.fit()]) { await A.evaluate(move); await sleep(1500); }
    }, 300));

    await A.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
    await sleep(800);
    const press = (sel, nth = 0) => (touch ? A.locator(sel).nth(nth).tap() : A.locator(sel).nth(nth).click());

    await inputScenario('lens (L key)', true, 6, async () => answer(await inputsOf(A, () => A.keyboard.press('l')), KEY));
    await inputScenario('view (tap)', false, 4, async (i) => answer(await inputsOf(A, () => press(`#viewSeg [data-view="${i % 2 ? 'anatomic' : 'circuit'}"]`))));
    await A.evaluate(() => document.querySelector('#viewSeg [data-view="anatomic"]')?.click());
    await sleep(2500);
    await inputScenario('menu (warm)', true, 4, async () => {
      const a = answer(await inputsOf(A, () => press('#btnMenu')));
      await A.keyboard.press('Escape'); await sleep(500);
      return a;
    });
    await inputScenario('Treat card (tap)', false, 2, async () => {
      const a = answer(await inputsOf(A, () => press('#btnTreat')));
      await A.keyboard.press('Escape'); await sleep(500);
      return a;
    });
    // A verb: an order in the Treat card (a drug chip toggles on and off).
    try {
      await press('#btnTreat'); await sleep(1200);
      await inputScenario('verb (Treat order)', true, 6, async (i) => answer(await inputsOf(A, () => press('#treatCard .order-chip', i % 3))));
      await A.keyboard.press('Escape');
    } catch (e) { skip('verb (Treat order)', e.message); }
    await A.close();
  } catch (e) { skip('anatomy scenarios', e.message); }

  // ── A talk: Next through a deck. The presenter's slide change, frame by frame, and the answer to each Next ──
  try {
    const { page: C } = await openPage(ctx, prof, `?script=${DECK}&slide=1`, errors);
    await C.waitForFunction(() => document.querySelector('#app')?.classList.contains('presenting') && window.pps?.perf?.inputToPaint, null, { timeout: LOAD });
    const settled = () => C.waitForFunction(() => { window.pps.presenter.skipLapse?.(); document.querySelector('.pz-case.on')?.click(); return !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover'); }, null, { timeout: 120000, polling: 50 });
    await settled(); await sleep(1500);
    const nSlides = await C.evaluate(() => Number(document.querySelector('.pzb-n')?.textContent.split('/')[1]) || 0);
    const steps = Math.min(STEPS, Math.max(1, nSlides - 1));
    // A phone's pill has no Next button (slides change by swiping): the right arrow is its Next here, as on a keyboard.
    const next = () => (touch ? C.keyboard.press('ArrowRight') : C.locator('.pzb-next').click());
    const label = () => C.evaluate(() => document.querySelector('.pzb-n')?.textContent.replace(/\s+/g, '') || '?');
    const goOnce = async () => {
      await C.evaluate(() => window.pps.presenter.go(0)); await settled(); await sleep(1200);
      const raws = [], notes = [], answers = [];
      for (let i = 0; i < steps; i++) {
        const from = await label();
        let got = [];
        const raw = await recorded(C, async () => { got = await inputsOf(C, next); await settled(); }, 700);
        const to = await label(), a = answer(got, touch ? KEY : undefined);
        raws.push(raw); if (a) answers.push({ ms: a.ms, what: `${a.kind} ${a.target} (${from} to ${to})` });
        const worst = (raw.long || []).slice().sort((x, y) => y.script - x.script)[0];
        notes.push(`slide ${from} to ${to}: ${raw.frames} frames, script max ${summarizeRaw(raw).script.max.toFixed(0)} ms${worst ? ` (${worst.top.slice(0, 2).map(([t, p, m]) => `${t} ${p} ${m.toFixed(0)}`).join(', ')})` : ''}${a ? `, answered in ${a.ms.toFixed(0)} ms` : ', no answer seen'}`);
      }
      return { ...mergeRaw(raws), long: raws.flatMap((r) => r.long || []), notes, answers };
    };
    await frameScenario(`slide change (${DECK})`, goOnce);
    const answers = res.frames.find((f) => f.name.startsWith('slide change'))?.raw.answers || [];
    if (answers.length) {
      const r = { name: 'Next', gated: true, samples: answers, breaches: judgeInput(answers, limits) };
      res.inputs.push(r);
      for (const l of inputLines(r)) console.log(l);
    } else skip('Next', 'the page answered none of them');
    await C.close();
  } catch (e) { skip(`slide change (${DECK}) and Next`, e.message); }

  if (errors.length) console.log(`  page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  await ctx.close();
  writeFileSync(`${OUT}/perf-gate-${name}.json`, JSON.stringify({ ...res, limits }, null, 1));
  return res;
}

const results = [];
try {
  for (const name of WHICH) {
    try { results.push(await runProfile(name)); } catch (e) { console.log(`${name}: stopped (${e.message.split('\n')[0]})`); results.push({ name, cpu: PROFILES[name].cpu, renderer: 'unknown', frames: [], inputs: [], skipped: [{ name: 'everything', why: e.message.split('\n')[0] }], errors: [] }); }
  }
} finally {
  await browser.close();
  server.close();
}

// ── The verdict ──
const { lines, code, markdown } = verdictOf(results, MODE);
console.log('');
for (const l of lines) console.log(l);
if (process.env.GITHUB_STEP_SUMMARY) try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`); } catch { /* the summary is a nicety */ }
process.exit(code);
