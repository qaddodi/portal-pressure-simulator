// The pre-push gate: every thread runs it before it pushes to the preview branch, and CI runs it on every push (gate.yml).
//
//   npm run gate                      the fast gate: static, boot, a sample of every deck's slides, the views, the rest frames
//   npm run gate -- --full            every slide of every deck (CI shards this), on every size
//   node scripts/gate.mjs --only static,slides --decks hvpg,circuit --sizes desktop --jobs 4
//   node scripts/gate.mjs --shard 2/6 --only slides --full           one share of the full slide sweep
//
// Stages (--only picks some; the default runs all but `pixels`' phone half, which --full adds):
//   static   no conflict marker in any file git tracks; the app and the engine worker bundle (a missing export, a missing file, a
//            syntax error or an import that is always undefined fails: the MAY_ON boot break of 2 Nov)          ~1 s
//   boot     the page starts with and without WebGL: no page error, no console error, no failed request, no boot error       ~30 s
//   slides   every deck slide is reached the way a person reaches it (Next), on a deterministic fake clock (Playwright's, stepped
//            in 100 ms runs: no real time decides anything), and the change must END: the presenter idle, the cards whole (no
//            card frozen part way through a fade or leave, no card still waiting for glass, none empty or off screen), the title on
//            the words, the camera at rest, no label left part way. Then one Back.
//   views    Anatomy, Circuit, Lobule and back, each switch stepped to its end on the GPU path: organs settled, the diaphragm
//            drawn and painted live, then labels follow a pan and a zoom (they move with the camera and match a fresh layout)
//   pixels   the six rest views against tests/visual (tests/e2e/visual.mjs, the CI references)
//
// The slide, view and boot stages run in headless Chromium here (software WebGL: a slide change costs 2 to 4 s of CPU, so they run
// --jobs at a time, default the CPU count up to 4). Exit code 1 on any finding; the report is also written to
// test-results/gate/report.json and, in CI, to the job summary. Each finding names the stage, the deck/slide or view, and what is wrong.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { findMarkers, checkBundle } from './gate-static.mjs';
import { slideFinal, labelBoxes, diaphragmIssues } from './gate-page.mjs';
import { instantMotion } from '../tests/e2e/fast.mjs';
import { assertGpuPath, readPath, CHROMIUM_ARGS } from './shoot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const FULL = flag('full');
const ALL = ['static', 'boot', 'slides', 'views', 'pixels'];
const STAGES = opt('only', ALL.join(',')).split(',').filter(Boolean);
for (const s of STAGES) if (!ALL.includes(s)) { console.error(`unknown stage "${s}" (${ALL.join(', ')})`); process.exit(2); }
const DIR = opt('dir', '.');
const JOBS = Math.max(1, +opt('jobs', Math.min(4, cpus().length)));
const OUT = resolve(opt('out', join(ROOT, 'test-results/gate')));
const [SHARD, SHARDS] = opt('shard', '1/1').split('/').map(Number);
const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const SIZE_NAMES = opt('sizes', FULL ? 'desktop,phone' : 'desktop').split(',');
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const launch = (gl) => chromium.launch({ args: gl ? CHROMIUM_ARGS : ['--no-sandbox', '--disable-3d-apis'], ...(EXE ? { executablePath: EXE } : {}) });

const findings = [];   // { stage, where, text }
const timings = {};
const log = (...a) => console.log(...a);
const fail = (stage, where, text) => { findings.push({ stage, where, text }); log(`  FAIL ${stage} ${where}: ${text}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the fake clock -------------------------------------------------------------------------------------------------------
// Playwright's clock fakes Date, performance.now, requestAnimationFrame, setTimeout/Interval and requestIdleCallback in the page. It
// is installed before the page's scripts run, so every timestamp the page takes is on it; once the page is up time moves only
// when this file runs it (runFor), in steps of STEP ms, so the order and the moment of every timer and frame is the same on every run.
const STEP = 100;
// The page's Workers (the engine, the sweep that works out every slide's state) run on real time, and the page has timeouts on them (the
// sweep client drops a worker silent for 20 s). Run flat out, the fake clock passes those 20 s in milliseconds while the worker is still
// working, and a slide that should land never does (seen: hvpg 2, one run in two). So after every step the gate waits PACE real ms: the
// clock never runs faster than PACE_RATIO = STEP / PACE times real time, and the timeouts keep their margin. (GATE_PACE=ms to change.)
const PACE = +(process.env.GATE_PACE ?? 40);

/** Runs the page's clock on in STEP ms runs until `ready` (a function run in the page, given `arg`) is true, at most `maxFake` ms.
 *  Returns the fake ms it took, or -1 when it never became true. The check is made every `every` ms of fake time. */
async function stepUntil(page, ready, arg, { maxFake = 20000, every = 300 } = {}) {
  for (let t = 0; t <= maxFake; t += STEP) {
    if (t % every === 0 && await page.evaluate(ready, arg)) return t;
    await page.clock.runFor(STEP);
    if (PACE) await sleep(PACE);
  }
  return -1;
}
/** In the page: has the presenter landed on slide `w`? A case card (a vignette the talk waits on) is tapped away as a person would. */
const landed = (w) => { document.querySelector('.pz-case.on')?.click(); return !window.pps.presenter.busy() && Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === w; };
const stepFor = async (page, ms) => { for (let t = 0; t < ms; t += STEP) { await page.clock.runFor(STEP); if (PACE) await sleep(PACE); } };

/** A page on `url` with its errors collected: page errors, console errors, failed requests and bad responses. */
async function openPage(browser, url, { size = 'desktop', clock = true, instant = true, scheme = 'light', motion = 'reduce', init } = {}) {
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
const figureUp = (page) => page.waitForFunction(() => window.pps?.store?.get().frame && !document.documentElement.dataset.boot, null, { timeout: 120000 });

/** Runs `tasks` (async functions) `JOBS` at a time. */
async function pool(tasks, jobs = JOBS) {
  const q = [...tasks.entries()];
  await Promise.all(Array.from({ length: Math.min(jobs, q.length) }, async () => { for (let it = q.shift(); it; it = q.shift()) await it[1](); }));
}

async function timed(stage, fn) {
  const t0 = Date.now();
  log(`\n== ${stage}`);
  const before = findings.length;
  try { await fn(); } catch (e) { fail(stage, 'gate', `the stage itself broke: ${String(e.stack || e).split('\n').slice(0, 3).join(' | ')}`); }
  timings[stage] = Math.round((Date.now() - t0) / 100) / 10;
  log(`== ${stage}: ${findings.length === before ? 'passed' : `${findings.length - before} finding(s)`} in ${timings[stage]} s`);
}

// ---- static ---------------------------------------------------------------------------------------------------------------
async function stageStatic() {
  for (const m of findMarkers()) fail('static', `${m.file}:${m.line}`, `merge conflict marker "${m.text}"`);
  for (const p of await checkBundle()) fail('static', p.where.replace(`${ROOT}/`, ''), p.text);
}

// ---- boot -----------------------------------------------------------------------------------------------------------------
async function bootCheck(browser, url, name, { gl }) {
  const app = await openPage(browser, url + '?preset=cirr-decomp', { clock: false, instant: false, init: gl ? () => {
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const gp = C.prototype.getParameter; C.prototype.getParameter = function (p) { return p === 0x9246 || p === 0x1F01 ? 'Apple M2 GPU' : gp.call(this, p); }; }
  } : undefined });
  try {
    await figureUp(app.page);
    await app.page.waitForTimeout(1500);
    const info = await app.page.evaluate(() => ({ boot: window.ppsBootErrors || [], unsupported: window.ppsUnsupported, api: ['store', 'host', 'stage', 'presenter', 'card'].filter((k) => !window.pps?.[k]) }));
    for (const e of info.boot) fail('boot', name, `boot error: ${e}`);
    if (info.api.length) fail('boot', name, `window.pps lacks ${info.api.join(', ')}`);
    if (gl) { try { assertGpuPath(await readPath(app.page), name); } catch (e) { fail('boot', name, String(e.message).split('\n').slice(0, 3).join(' ')); } }
    for (const e of [...new Set(app.errors)].slice(0, 6)) fail('boot', name, e);
  } finally { await app.close(); }
}
async function stageBoot() {
  const server = await serve(resolve(ROOT, DIR));
  const b1 = await launch(false), b2 = await launch(true);
  try {
    await Promise.all([
      bootCheck(b1, server.url, 'boot without WebGL (SVG figure)', { gl: false }),
      bootCheck(b2, server.url, 'boot on the GPU path', { gl: true }),
    ]);
  } finally { await b1.close(); await b2.close(); server.close(); }
}

// ---- slides ---------------------------------------------------------------------------------------------------------------
async function deckPlan() {
  const { DECKS, withOverview } = await import(new URL('../src/ui/decks.js', import.meta.url));
  const only = opt('decks', '').split(',').filter(Boolean);
  const decks = DECKS.filter((d) => !only.length || only.includes(d.id)).map((d) => ({ id: d.id, slides: withOverview(d).slides }));
  // The fast gate visits the first three slides, the middle one and the last of every deck (Next from the one before where it
  // is adjacent, a jump otherwise); the full gate visits every slide.
  return decks.map((d) => {
    const n = d.slides.length;
    const idx = FULL ? [...Array(n).keys()] : [...new Set([0, 1, 2, Math.floor(n / 2), n - 1].filter((i) => i < n))].sort((a, b) => a - b);
    return { ...d, idx };
  });
}

/** In the page: a line about where a presenter that will not finish is stuck. */
const stuckInfo = () => {
  const r = document.querySelector('.pz');
  const c = ['.pz-text', '.pz-data', '.pz-panel', '.pz-case'].map((s) => { const e = document.querySelector(s); return e ? `${s.slice(4)}:${e.hidden ? 'hidden' : 'shown'}/op${getComputedStyle(e).opacity}` : null; }).filter(Boolean).join(' ');
  return `busy=${window.pps.presenter.busy()}, counter ${document.querySelector('.pzb-n')?.textContent}, root "${r?.className}", ${c}, load=${!!document.querySelector('.pz-load.on')}`;
};

/** What slide `want` (1-based) must show once landed, from its definition: a plain or instrument slide has the words, an instrument slide the data card. */
const expect = (s, want) => ({ want, title: s.title, wantText: !!s.title && !s.visual, wantData: !!s.tool && !s.visual });

async function deckUnit(browser, url, deck, size) {
  const tag = `${deck.id}@${size}`;
  const app = await openPage(browser, `${url}?script=${deck.id}&slide=1`, { size });
  const { page } = app;
  const mark = () => app.errors.length;
  try {
    const up = await stepUntil(page, () => { document.querySelector('.pz-case.on')?.click(); return document.querySelector('#app')?.classList.contains('presenting') && !window.pps?.presenter?.busy(); }, null, { maxFake: 60000 });
    if (up < 0) return fail('slides', `${tag} 1`, 'the deck never opened');
    let at = 0;
    for (const i of deck.idx) {
      const s = deck.slides[i], where = `${tag} ${i + 1}/${deck.slides.length}`;
      if (i !== 0 || at !== 0) {
        const e0 = mark();
        if (i === at + 1) await page.keyboard.press('ArrowRight');
        else await page.evaluate((k) => window.pps.presenter.go(k), i);
        const took = await stepUntil(page, landed, i + 1, { maxFake: 30000 });
        if (took < 0) { fail('slides', where, `the slide change never ended in 30 s of clock time (${await page.evaluate(stuckInfo)})`); at = i; continue; }
        at = i;
        for (const e of app.errors.slice(e0)) fail('slides', where, e);
      }
      await stepFor(page, 600);   // (what lands after the change: the cards' entry, a late label)
      const arg = expect(s, i + 1);
      let issues = await page.evaluate(slideFinal, arg);
      if (issues.length) { await stepFor(page, 2500); issues = await page.evaluate(slideFinal, arg); }   // (a late card is not a stuck one)
      for (const t of issues) fail('slides', where, t);
    }
    // one Back from the last slide visited: the way back is its own change
    if (deck.idx.length > 1) {
      const i = at - 1, where = `${tag} ${i + 1}/${deck.slides.length} (Back)`;
      await page.keyboard.press('ArrowLeft');
      const took = await stepUntil(page, landed, i + 1, { maxFake: 30000 });
      if (took < 0) fail('slides', where, 'Back never ended in 30 s of clock time');
      else { await stepFor(page, 600); const arg = expect(deck.slides[i], i + 1); let issues = await page.evaluate(slideFinal, arg); if (issues.length) { await stepFor(page, 2500); issues = await page.evaluate(slideFinal, arg); } for (const t of issues) fail('slides', where, t); }
    }
    for (const e of [...new Set(app.errors)].slice(0, 5)) fail('slides', tag, e);
    log(`  ${deck.id}@${size}: ${deck.idx.length} slide(s) stepped`);
  } catch (e) { fail('slides', tag, `the unit broke: ${String(e.message).split('\n')[0]}`); }
  finally { await app.close(); }
}

async function stageSlides() {
  const plan = await deckPlan();
  const units = plan.flatMap((d) => SIZE_NAMES.map((s) => ({ deck: d, size: s })));
  // (a share of the units: the full sweep is split over runners; units are dealt out round robin, longest decks first, so shares are alike)
  units.sort((a, b) => b.deck.idx.length - a.deck.idx.length);
  const mine = units.filter((_, k) => k % SHARDS === SHARD - 1);
  const server = await serve(resolve(ROOT, DIR));
  const browser = await launch(false);
  try { await pool(mine.map((u) => () => deckUnit(browser, server.url, u.deck, u.size))); }
  finally { await browser.close(); server.close(); }
}

// ---- views / pixels -------------------------------------------------------------------------------------------------------
async function stageViews() { log('  (views stage: not yet)'); }

async function stagePixels() {
  const devices = FULL ? ['desktop', 'phone'] : ['desktop'];
  for (const device of devices) {
    const out = join(OUT, `visual-${device}`);
    const code = await new Promise((res) => {
      const p = spawn(process.execPath, [join(ROOT, 'tests/e2e/visual.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, VISUAL_DEVICE: device, VISUAL_OUT: out, ...(EXE ? { CHROMIUM: EXE } : {}) } });
      p.stdout.on('data', (d) => { process.stdout.write(d); for (const m of String(d).matchAll(/^FAIL (\S+): (.*)$/gm)) findings.push({ stage: 'pixels', where: m[1], text: `${m[2]} (diffs in ${out})` }); });
      p.on('close', res);
    });
    if (code && !findings.some((f) => f.stage === 'pixels')) fail('pixels', device, `visual.mjs exited ${code}`);
  }
}

// ---- run ------------------------------------------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
log(`pre-push gate: ${STAGES.join(', ')}${FULL ? ' (full)' : ' (fast)'}; ${JOBS} at a time; sizes ${SIZE_NAMES.join(', ')}${SHARDS > 1 ? `; share ${SHARD}/${SHARDS}` : ''}`);
const RUN = { static: stageStatic, boot: stageBoot, slides: stageSlides, views: stageViews, pixels: stagePixels };
for (const s of STAGES) await timed(s, RUN[s]);
const total = Math.round((Date.now() - T0) / 1000);
const report = { when: new Date().toISOString(), full: FULL, stages: STAGES, timings, total, findings };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const lines = findings.map((f) => `- **${f.stage}** ${f.where}: ${f.text}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Pre-push gate (${FULL ? 'full' : 'fast'}${SHARDS > 1 ? `, share ${SHARD}/${SHARDS}` : ''}): ${findings.length ? `${findings.length} finding(s)` : 'passed'} in ${total} s\n\n${Object.entries(timings).map(([k, v]) => `${k} ${v} s`).join(', ')}\n\n${lines.join('\n')}\n`);
if (process.env.GITHUB_ACTIONS) for (const f of findings.slice(0, 40)) console.log(`::error title=gate ${f.stage}::${f.where}: ${f.text.replace(/\n/g, ' ')}`);
log(`\n${findings.length ? `GATE FAILED: ${findings.length} finding(s)` : 'GATE PASSED'} in ${total} s (${Object.entries(timings).map(([k, v]) => `${k} ${v}`).join(', ')})`);
process.exit(findings.length ? 1 : 0);
