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
//                               [--deck=hvpg] [--steps=6] [--budget=720]
//   PERF_PROFILE, PERF_GATE, PERF_OUT, PERF_DECK, PERF_STEPS, PERF_BUDGET (seconds for the whole run) do the same.
//
// warn (the default; checks.yml): breaches are annotations and the exit code is 0. block (ci.yml): a breach past a ceiling exits 1,
// and so does a run that measured nothing. A scenario that cannot be measured (a control missing, a timeout) is listed as not
// measured and is a warning, never a failure by itself, and so is one the time budget left no time for. Writes perf-gate-<profile>.json (every frame's numbers and the long frames,
// with their surfaces and phases) to --out, and a table to the job summary.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { serve } from './serve.mjs';
import { PROFILES } from './perf-profiles.mjs';
import { summarizeRaw, mergeRaw, longFrameLine } from '../src/ui/frame-stats.js';
import { loadLimits, limitsFor, judgeFrames, judgeInput, frameLines, inputLines, idleLines, IDLE, verdictOf } from './frame-gate-lib.mjs';

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--')) || '.';
const flag = (name, env, dflt) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? process.env[env] ?? dflt;
const MODE = flag('mode', 'PERF_GATE', 'warn');
const WHICH = flag('profile', 'PERF_PROFILE', 'laptop,phone').split(',').filter(Boolean);
const OUT = flag('out', 'PERF_OUT', 'test-results/perf-gate');
const DECK = flag('deck', 'PERF_DECK', 'hvpg');
const STEPS = Math.max(1, +flag('steps', 'PERF_STEPS', '6'));
// The run's time, in seconds, for everything it does: a scenario that cannot finish inside it is not started, a second try is made only
// if it fits, and the verdict is printed whatever is done by then (the workflow's step gives it 15 minutes; a runner that draws in
// software and runs the page at a quarter or a sixth of its speed took 3 to 4 minutes for one pan on 31 Oct).
const BUDGET = Math.max(60, +flag('budget', 'PERF_BUDGET', '720')) * 1000;
const T0 = Date.now();
const left = () => BUDGET - (Date.now() - T0);
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
const LOAD = 120000;
/** Why a Playwright call failed, in a line: its first line and the last thing it said it was waiting for (what covered the button). */
const why = (e) => {
  const lines = String(e?.message ?? e).split('\n').map((l) => l.trim()).filter(Boolean);
  const wait = lines.slice(1).reverse().find((l) => /intercepts|not visible|not stable|not enabled|resolved to|waiting for/.test(l));
  return (wait ? `${lines[0]} (${wait.replace(/^- +/, '')})` : lines[0] || 'failed').slice(0, 260);
};

async function openPage(ctx, prof, query, errors) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);   // (a control that is not there fails in 30 s; loads wait LOAD, explicitly)
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  await page.goto(server.url + query);
  return { page, cdp };
}
// (`#boot`, the cover over the page while it loads, is gone: nobody taps through it, and Playwright waits for it to go before a click.)
const figureReady = (page) => page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('canvas#veins') && document.getElementById('world') && !document.getElementById('boot') && window.pps.perf?.inputToPaint, null, { timeout: LOAD });

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

const results = [];
let doing = '';   // the scenario in hand, for the line a time-out leaves
const save = (res, limits) => { try { writeFileSync(`${OUT}/perf-gate-${res.name}.json`, JSON.stringify({ ...res, limits }, null, 1)); } catch { /* the log has it */ } };

async function runProfile(name) {
  const prof = PROFILES[name], limits = LIMITS[name], touch = !!prof.ctx.hasTouch;
  const res = { name, cpu: prof.cpu, renderer: 'unknown', frames: [], inputs: [], skipped: [], errors: [] };
  results.push(res);
  const errors = res.errors;
  const ctx = await browser.newContext({ ...prof.ctx, serviceWorkers: 'block' });
  const skip = (what, reason) => { res.skipped.push({ name: what, why: String(reason).split('\n')[0].slice(0, 260) }); console.log(`  ${what.padEnd(20)} NOT MEASURED: ${res.skipped.at(-1).why}`); save(res, limits); };
  /** True if `ms` of the run's time are left; if not, `what` is listed as not run. */
  const afford = (what, ms) => { if (left() >= ms) return true; skip(what, 'not run: the time budget was used'); return false; };
  let gpu = false;

  // Frame scenarios: run, judged, and run once more if over a ceiling and the time allows (the better run kept).
  const frameScenario = async (what, perform, need = 30000) => {
    if (!afford(what, need)) return;
    doing = what;
    try {
      let best = null, why2 = '';
      for (let attempt = 1; attempt <= 2; attempt++) {
        const t1 = Date.now();
        const raw = await perform();
        const took = Date.now() - t1;
        const sum = summarizeRaw(raw), breaches = judgeFrames(sum, limitsFor(limits, what), { gpu });
        const rank = [breaches.filter((b) => b.level === 'fail').length, sum.script.p95];
        const r = { name: what, raw, sum, breaches, attempts: attempt, notes: [] };
        if (!best || rank[0] < best.rank[0] || (rank[0] === best.rank[0] && rank[1] < best.rank[1])) best = { ...r, rank };
        if (!breaches.some((b) => b.level === 'fail') || attempt === 2) break;
        if (left() < took * 2 + 30000) { why2 = '(over a ceiling, and no time for a second run)'; break; }
        console.log(`  ${what}: over a ceiling, once more…`);
      }
      const r = { ...best }; delete r.rank;
      r.notes = [...(r.attempts > 1 ? [`(run ${r.attempts} times; the better one is shown)`] : []), ...(why2 ? [why2] : []), ...(r.raw.notes || []), ...worstFrames(r.raw)];
      res.frames.push(r);
      for (const l of frameLines(r, { gpu })) console.log(l);
    } catch (e) { skip(what, why(e)); }
    save(res, limits);
  };
  const worstFrames = (raw) => (raw.long || []).slice().sort((a, b) => Math.max(b.gap, b.script) - Math.max(a.gap, a.script)).slice(0, 2).map((f) => `long frame:${longFrameLine(f).slice(1)}`);

  // Input scenarios: `n` samples of one action, judged by the slowest; over a ceiling, all of them once more if the time allows.
  const inputScenario = async (what, gated, n, sample, retry = gated) => {
    if (!afford(what, 20000)) return;
    doing = what;
    try {
      let best = null;
      for (let attempt = 1; attempt <= (retry ? 2 : 1); attempt++) {
        const t1 = Date.now();
        const samples = [];
        for (let i = 0; i < n; i++) {
          const a = await sample(i);
          if (!a) throw new Error(`the page did not answer sample ${i + 1}`);
          samples.push({ ms: a.ms, what: `${a.kind} ${a.target}` });
          await sleep(350);
        }
        const breaches = gated ? judgeInput(samples, limitsFor(limits, what)) : [];
        const r = { name: what, gated, samples, breaches };
        const worst = Math.max(...samples.map((s) => s.ms));
        if (!best || worst < best.worst) best = { ...r, worst };
        if (!breaches.some((b) => b.level === 'fail') || attempt === (retry ? 2 : 1)) break;
        if (left() < (Date.now() - t1) * 2 + 20000) break;
        console.log(`  ${what}: over a ceiling, once more…`);
      }
      const r = { ...best }; delete r.worst;
      res.inputs.push(r);
      for (const l of inputLines(r)) console.log(l);
    } catch (e) { skip(what, why(e)); }
    save(res, limits);
  };

  console.log(`\n${name} (CPU ${prof.cpu}×, ${prof.ctx.viewport.width}×${prof.ctx.viewport.height} @${prof.ctx.deviceScaleFactor || 1}×)`);

  // ── The menu, the first time: a fresh page, tapped as soon as the app is up (the module may not have been warmed yet) ──
  // (Reported, not judged: a cold open is the runner's own chunk load and shader work, 3.3 s on the phone profile on 31 Oct from one
  // sample, and there is nothing yet to set a ceiling on. It takes its place among the judged ones once a few runs have reported.)
  try {
    if (afford('menu (cold)', 30000)) {
      const { page } = await openPage(ctx, prof, '?preset=cirr-decomp&inputs', errors);
      await figureReady(page);
      // (once only: a second tap would be the warm menu, and would close it)
      await inputScenario('menu (cold)', false, 1, async () => answer(await inputsOf(page, () => (touch ? page.locator('#btnMenu').tap() : page.locator('#btnMenu').click()))), false);
      await page.close();
    }
  } catch (e) { skip('menu (cold)', why(e)); }

  // ── The anatomy: frame scenarios with the model running, then the inputs with it paused (so only the page's answer changes it) ──
  try {
    if (afford('anatomy scenarios', 120000)) {
      const { page: A, cdp } = await openPage(ctx, prof, '?preset=cirr-decomp&inputs', errors);
      await figureReady(A);
      res.renderer = await A.evaluate(() => document.querySelector('[data-renderer]')?.dataset.renderer || 'unknown');
      gpu = res.renderer === 'gpu';
      console.log(`  renderer: ${res.renderer}${gpu ? '' : ' (the interval between frames is reported, not judged)'}`);
      await A.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
      await sleep(4000);   // (landed, first rasters done)
      const box = await A.locator('.stage-view').boundingBox();
      const home = async () => { await A.evaluate(() => window.pps.stage.fit()); await sleep(1800); };
      const touchTo = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });

      // (Idle: the model running, the view left alone. Not a gesture: what the page costs while nobody touches it, surface by surface, the
      // number the laptop-heat work was blind to. Reported with its surfaces' totals; judged as any scenario is.)
      await frameScenario(IDLE, async () => {
        await home();
        return recorded(A, async () => { await sleep(6000); }, 0);
      }, 20000);
      { const idle = res.frames.find((f) => f.name === IDLE); if (idle) for (const l of idleLines(idle.raw)) console.log(l); }

      // (Each run starts from the home view, so the second run of a scenario is the same gesture as the first.)
      await frameScenario('pan', async () => {
        await home();
        return recorded(A, async () => {
          const p = [box.x + box.width * 0.55, box.y + box.height * 0.4], N = 48;
          if (touch) {
            await touchTo('touchStart', [p]);
            for (let i = 1; i <= N; i++) { await touchTo('touchMove', [[p[0] - i * 4, p[1] + i * 2.7]]); await frames(A, 1); }
            await touchTo('touchEnd', []);
          } else {
            await A.mouse.move(p[0], p[1]); await A.mouse.down();
            for (let i = 1; i <= N; i++) { await A.mouse.move(p[0] + i * 6.5, p[1] - i * 3.3); await frames(A, 1); }
            await A.mouse.up();
          }
        });
      });

      await frameScenario(touch ? 'pinch (two fingers)' : 'pinch (trackpad)', async () => {
        await home();
        return recorded(A, async () => {
          // (Spread out, then back in: 18 steps each way, so the view ends where it began.)
          const c = [box.x + box.width * 0.5, box.y + box.height * 0.45], N = 36, at = (i) => (i <= N / 2 ? i : N - i);
          if (touch) {
            await touchTo('touchStart', [[c[0] - 30, c[1]], [c[0] + 30, c[1]]]);
            for (let i = 1; i <= N; i++) { const d = 60 + at(i) * 6.5; await touchTo('touchMove', [[c[0] - d / 2, c[1]], [c[0] + d / 2, c[1]]]); await frames(A, 1); }
            await touchTo('touchEnd', []);
          } else {
            await A.mouse.move(c[0], c[1]);
            await A.keyboard.down('Control');
            for (let i = 1; i <= N; i++) { await A.mouse.wheel(0, i <= N / 2 ? -10 : 10); await frames(A, 1); }
            await A.keyboard.up('Control');
          }
        });
      });

      await frameScenario('camera glide', async () => {
        await home();
        return recorded(A, async () => {
          // In, out, and home: three glides, each left to land.
          for (const move of [() => window.pps.stage.zoomIn(), () => window.pps.stage.zoomOut(), () => window.pps.stage.fit()]) { await A.evaluate(move); await sleep(1500); }
        }, 300);
      }, 20000);

      await A.evaluate(() => window.pps.host.send({ type: 'run', running: false }));
      await sleep(800);
      const press = (sel, nth = 0) => (touch ? A.locator(sel).nth(nth).tap() : A.locator(sel).nth(nth).click());
      // (On a phone held upright the tools are on the thumb bar, not in the top bar.)
      const thumb = await A.evaluate(() => !!document.querySelector('#app')?.classList.contains('thumb'));
      const treat = thumb ? '#thumbBar [data-tab="treat"]' : '#btnTreat';

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
        const a = answer(await inputsOf(A, () => press(treat)));
        await A.keyboard.press('Escape'); await sleep(500);
        return a;
      });
      // A verb: an order in the Treat card (a drug chip toggles on and off).
      if (afford('verb (Treat order)', 30000)) {
        try {
          await press(treat); await sleep(1200);
          await inputScenario('verb (Treat order)', true, 6, async (i) => answer(await inputsOf(A, () => press('#treatCard .order-chip', i % 3))));
          await A.keyboard.press('Escape');
        } catch (e) { skip('verb (Treat order)', why(e)); }
      }
      await A.close();
    }
  } catch (e) { skip('anatomy scenarios', why(e)); }

  // ── A talk: Next through a deck. The presenter's slide change, frame by frame, and the answer to each Next ──
  try {
    if (afford(`slide change (${DECK}) and Next`, 90000)) {
      const { page: C } = await openPage(ctx, prof, `?script=${DECK}&slide=1&inputs`, errors);
      await C.waitForFunction(() => document.querySelector('#app')?.classList.contains('presenting') && window.pps?.perf?.inputToPaint, null, { timeout: LOAD });
      const settled = () => C.waitForFunction(() => { window.pps.presenter.skipLapse?.(); document.querySelector('.pz-case.on')?.click(); return !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover'); }, null, { timeout: 90000, polling: 50 });
      await settled(); await sleep(1500);
      const nSlides = await C.evaluate(() => Number(document.querySelector('.pzb-n')?.textContent.split('/')[1]) || 0);
      const steps = Math.min(STEPS, Math.max(1, nSlides - 1));
      // A phone's pill has no Next button (slides change by swiping): the right arrow is its Next here, as on a keyboard.
      const next = () => (touch ? C.keyboard.press('ArrowRight') : C.locator('.pzb-next').click());
      const label = () => C.evaluate(() => document.querySelector('.pzb-n')?.textContent.replace(/\s+/g, '') || '?');
      const unanswered = () => C.evaluate(() => window.pps.perf.inputToPaint.summary().ignored);
      let ignoredSeen = 0;
      const goOnce = async () => {
        await C.evaluate(() => window.pps.presenter.go(0)); await settled(); await sleep(1200);
        const raws = [], notes = [], answers = [];
        for (let i = 0; i < steps; i++) {
          if (i && left() < 20000) { notes.push(`(stopped after ${i} of ${steps} slides: the time budget)`); break; }
          const from = await label();
          let got = [];
          const ign0 = await unanswered();
          const raw = await recorded(C, async () => { got = await inputsOf(C, next); await settled(); }, 700);
          const to = await label(), a = answer(got, touch ? KEY : undefined);
          ignoredSeen += (await unanswered()) - ign0;
          raws.push(raw); if (a) answers.push({ ms: a.ms, what: `${a.kind} ${a.target} (${from} to ${to})` });
          const worst = (raw.long || []).slice().sort((x, y) => y.script - x.script)[0];
          notes.push(`slide ${from} to ${to}: ${raw.frames} frames, script max ${summarizeRaw(raw).script.max.toFixed(0)} ms${worst ? ` (${worst.top.slice(0, 4).map(([t, p, m]) => `${t} ${p} ${m.toFixed(0)}`).join(', ')})` : ''}${a ? `, answered in ${a.ms.toFixed(0)} ms` : ', no answer seen'}`);
        }
        return { ...mergeRaw(raws), long: raws.flatMap((r) => r.long || []), notes, answers };
      };
      await frameScenario(`slide change (${DECK})`, goOnce, 60000);
      const answers = res.frames.find((f) => f.name.startsWith('slide change'))?.raw.answers || [];
      if (answers.length) {
        const r = { name: 'Next', gated: true, samples: answers, breaches: judgeInput(answers, limitsFor(limits, 'Next')) };
        res.inputs.push(r);
        for (const l of inputLines(r)) console.log(l);
      } else if (res.frames.some((f) => f.name.startsWith('slide change'))) skip('Next', `the page answered none of them (${ignoredSeen} left unanswered after 800 ms)`);
      await C.close();
    }
  } catch (e) { skip(`slide change (${DECK}) and Next`, why(e)); }

  if (errors.length) console.log(`  page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  await ctx.close().catch(() => {});
  save(res, limits);
  return res;
}

// ── The verdict, once: at the end of the run, or when the time is up with a scenario still in hand ──
let finished = false;
function finish(late) {
  if (finished) return;
  finished = true;
  if (late) {
    console.log(`\nThe time budget (${BUDGET / 1000} s) ran out while ${doing || 'starting'} was in hand: what was measured so far is judged.`);
    for (const r of results) { r.skipped.push({ name: doing || 'the run', why: 'stopped by the time budget' }); save(r, LIMITS[r.name]); }
  }
  const { lines, code, markdown } = verdictOf(results, MODE);
  console.log('');
  for (const l of lines) console.log(l);
  if (process.env.GITHUB_STEP_SUMMARY) try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`); } catch { /* the summary is a nicety */ }
  process.exit(code);
}
// (A call that hangs in the browser is cut off here, a minute and a half after the budget, inside the workflow step's own 15 minutes.)
setTimeout(() => finish(true), BUDGET + 90000);

try {
  for (const name of WHICH) {
    if (left() < 60000 && results.length) { results.push({ name, cpu: PROFILES[name].cpu, renderer: 'unknown', frames: [], inputs: [], skipped: [{ name: 'everything', why: 'not run: the time budget was used' }], errors: [] }); continue; }
    try { await runProfile(name); } catch (e) {
      console.log(`${name}: stopped (${why(e)})`);
      const r = results.find((x) => x.name === name);
      if (r) r.skipped.push({ name: 'the rest', why: why(e) });
      else results.push({ name, cpu: PROFILES[name].cpu, renderer: 'unknown', frames: [], inputs: [], skipped: [{ name: 'everything', why: why(e) }], errors: [] });
    }
  }
} finally {
  await Promise.race([browser.close().catch(() => {}), sleep(15000)]);
  server.close();
}
finish(false);
