// The pre-push gate: every thread runs it before it pushes to the preview branch, and CI runs it on request ([gate] or [gate-full] in a commit message, checks.yml).
//
//   npm run gate                      the pre-push gate (about six minutes on 4 cores): static, boot, five slides of each of eight decks, the views
//   npm run gate -- --pixels --decks all   what CI runs: the same on all 28 decks, and the rest frames against tests/visual
//   npm run gate -- --full            every slide of every deck (CI shards this), on every size
//   node scripts/gate.mjs --only static,slides --decks hvpg,circuit --sizes desktop --jobs 4
//   node scripts/gate.mjs --shard 2/6 --only slides --full           one share of the full slide sweep
//
// Stages (--only picks some; the default is every stage but `pixels`, which --pixels or --full adds):
//   static   no conflict marker in any file git tracks; the app and the engine worker bundle (a missing export, a missing file, a
//            syntax error or an import that is always undefined fails: the MAY_ON boot break of 2 Nov)          ~1 s
//   boot     the page starts with and without WebGL: no page error, no console error, no failed request, no boot error       ~30 s
//   slides   every deck slide is reached the way a person reaches it (Next), on a deterministic fake clock (Playwright's, stepped
//            in 100 ms runs: no real time decides anything), and the change must END: the presenter idle, the cards whole (no
//            card frozen part way through a fade or leave, no card still waiting for glass, none empty or off screen), the title on
//            the words, the camera at rest, no label left part way. Then one Back.
//   views    Anatomy, Circuit, Lobule and back, each switch waited out to its end on the GPU path (real time: the clock cannot drive software WebGL): organs settled, the diaphragm
//            drawn and painted live, then labels follow a pan and a zoom (they move with the camera and match a fresh layout)
//   pixels   the six rest views against tests/visual (tests/e2e/visual.mjs, the CI references)
//   motion   (only when named: --motion) the deck's cards MOVING on the GPU in real time, normal motion, sampled every frame: words, shade and
//            glass together through a Next, a Next during an entrance and a Back during one (scripts/gate-motion.mjs). The slides stage
//            above is a structural, final-state check without WebGL; it never judges motion, and its pass says nothing about it.
//
// The slide, view and boot stages run in headless Chromium here (software WebGL: a slide change costs 2 to 4 s of CPU, so they run
// --jobs at a time, default the CPU count up to 4). Exit code 1 on any finding; the report is also written to
// test-results/gate/report.json and, in CI, to the job summary. Each finding names the stage, the deck/slide or view, and what is wrong.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { findMarkers, checkBundle } from './gate-static.mjs';
import { slideFinal, labelState, labelFollow, diaphragmIssues } from './gate-page.mjs';
import { assertGpuLive, readPath } from './shoot.mjs';
import { motionIssues, startSampler, takeSamples } from './gate-motion.mjs';
import { beatCount } from '../src/ui/slide-beats.js';
import { EXE, launch, openPage, figureUp, stepUntil, stepFor, watchUntil, watchFor, ask, landed, pool as poolOf, gpuName } from './gate-clock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const FULL = flag('full');
const ALL = ['static', 'boot', 'slides', 'views', 'pixels', 'motion'];
// (pixels takes two more minutes and CI runs it on every push: a local run adds it with --pixels, --full has it. motion, the real-time GPU
// deck check (scripts/gate-motion.mjs), runs only when named: --motion or --only motion, one GPU browser at a time.)
const STAGES = opt('only', ALL.filter((s) => (s !== 'pixels' || flag('pixels') || FULL) && (s !== 'motion' || flag('motion'))).join(',')).split(',').filter(Boolean);
for (const s of STAGES) if (!ALL.includes(s)) { console.error(`unknown stage "${s}" (${ALL.join(', ')})`); process.exit(2); }
const DIR = opt('dir', '.');
const JOBS = Math.max(1, +opt('jobs', Math.min(4, cpus().length)));
const OUT = resolve(opt('out', join(ROOT, 'test-results/gate')));
const [SHARD, SHARDS] = opt('shard', '1/1').split('/').map(Number);
const SIZE_NAMES = opt('sizes', FULL ? 'desktop,phone' : 'desktop').split(',');

const findings = [];   // { stage, where, text }
const timings = {};
const log = (...a) => console.log(...a);
const fail = (stage, where, text) => { findings.push({ stage, where, text }); log(`  FAIL ${stage} ${where}: ${text}`); };

const pool = (tasks, jobs = JOBS) => poolOf(tasks, jobs);

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
  const app = await openPage(browser, url + '?preset=cirr-decomp', { clock: false, instant: false, init: gl ? gpuName : undefined });
  try {
    await figureUp(app.page);
    await app.page.waitForTimeout(1500);
    const info = await app.page.evaluate(() => ({ boot: window.ppsBootErrors || [], unsupported: window.ppsUnsupported, api: ['store', 'host', 'stage', 'presenter', 'card'].filter((k) => !window.pps?.[k]) }));
    for (const e of info.boot) fail('boot', name, `boot error: ${e}`);
    if (info.api.length) fail('boot', name, `window.pps lacks ${info.api.join(', ')}`);
    if (gl) { try { await assertGpuLive(app.page, name); } catch (e) { fail('boot', name, String(e.message).split('\n').slice(0, 3).join(' ')); } }
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
  // The pre-push run judges eight decks that between them hold every kind of slide (a case card, an instrument and data card, a table, a plane,
  // the ladders, the quadrant, the lobule dive, the Circuit view, an endoscopy): about two minutes. --decks all (CI) or --full takes all 28.
  const REP = ['hvpg', 'ascites', 'sites', 'doppler', 'lobule', 'circuit', 'endoscopy', 'outflow'];
  const given = opt('decks', '');
  const only = given === 'all' || FULL ? [] : given ? given.split(',').filter(Boolean) : REP;
  const decks = DECKS.filter((d) => !only.length || only.includes(d.id)).map((d) => ({ id: d.id, slides: withOverview(d).slides }));
  // The fast gate visits the first three slides, the middle one and the last of every deck (Next from the one before where it
  // is adjacent, a jump otherwise); the full gate visits every slide.
  return decks.map((d) => {
    const n = d.slides.length;
    const idx = FULL ? [...Array(n).keys()] : [...new Set([0, 1, 2, Math.floor(n / 2), n - 1].filter((i) => i < n))].sort((a, b) => a - b);   // (first three, the middle, the last)
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
    let at = 0, via = 'go';
    for (const i of deck.idx) {
      const s = deck.slides[i], where = `${tag} ${i + 1}/${deck.slides.length}`;
      if (i !== 0 || at !== 0) {
        const e0 = mark();
        if (i === at + 1) {
          // (A slide with views of the figure, camera beats or a revealing line, takes a Next for each before it leaves; its opening view comes with the Next that steps onto it.)
          for (let v = 1; v < (via === 'key' ? beatCount(deck.slides[at]) : 1); v++) { await page.keyboard.press('ArrowRight'); await stepFor(page, 2500); }
          await page.keyboard.press('ArrowRight'); via = 'key';
        } else { await page.evaluate((k) => window.pps.presenter.go(k), i); via = 'go'; }
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
  log('  (slides run WITHOUT WebGL and with reduced motion, on the SVG figure, by design: a structural, final-state check. The GPU figure is judged by the boot and views stages; the cards MOVING on the GPU only by the motion stage, --motion.)');
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
// The views: every switch is waited out to its end on the GPU path (real time: the clock cannot drive software WebGL), then the figure is judged. In the page.
const viewDone = (v) => {
  const st = window.pps.stage, on = document.querySelector('#viewSeg [aria-pressed="true"]')?.dataset.view;
  if (on !== v) return false;
  if (v === 'lobule') return st.lobuleOpen() && st.lobuleSettled();
  return !st.lobuleOpen() && !st.gliding() && !st.drifting() && st.organsSettled();   // (viewNow() is null for good on the circuit: its morph never returns to 0)
};
const solved = () => !window.pps.stage.labelSolving();
const camera = () => { const m = document.getElementById('world')?.getScreenCTM(); return m ? { k: Math.hypot(m.a, m.b), e: m.e, f: m.f } : null; };
const near = (pts, [x, y], r) => pts.some((p) => Math.hypot(p[0] - x, p[1] - y) <= r);
const nearest = (pts, [x, y]) => pts.reduce((m, p) => Math.min(m, Math.hypot(p[0] - x, p[1] - y)), Infinity);

// (real time, not the fake clock: see gate-clock.mjs watchUntil)
async function stageViews() {
  const server = await serve(resolve(ROOT, DIR));
  const browser = await launch(true);
  const app = await openPage(browser, server.url + '?preset=cirr-decomp', { size: 'small', clock: false, instant: false, motion: 'no-preference' });
  const { page } = app;
  const seen = new Set();
  const errs = (where) => { for (const e of app.errors) if (!seen.has(e)) { seen.add(e); fail('views', where, e); } };
  try {
    const t0 = Date.now(), say = (m) => log(`  views ${((Date.now() - t0) / 1000).toFixed(0)} s: ${m}`);
    const up = await watchUntil(page, () => !!window.pps?.store?.get().frame && !document.documentElement.dataset.boot, null, { maxFake: 90000, every: 500 });
    if (up < 0) return fail('views', 'boot', 'the figure never came up');
    say(`figure up after ${up} ms of clock`);
    // (The page takes the path a GPU-less machine takes: a page that names itself a GPU queues software draws at 120 Hz and never catches up; this one steps itself down to a few frames a second, as CI's runners do. The figure must still be the WebGL one.)
    const path = await readPath(page);
    if (path.veins !== 'webgl2' || !path.glOn || path.lost) return fail('views', 'boot', `the figure is not drawn with WebGL (${JSON.stringify(path)})`);
    try { await assertGpuLive(page, 'views stage, at the start', { software: true }); } catch (e) { return fail('views', 'gpu', String(e.message).split('\n').slice(0, 3).join(' ')); }
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));   // (the model paused: readings still, as visual.mjs does)
    await watchFor(page, 1500);
    const judge = async (v, step) => {
      const where = `${v} (${step})`;
      const took = await watchUntil(page, viewDone, v, { maxFake: step === 'start' ? 120000 : 60000 });
      say(`${where}: ended after ${took} ms of clock`);
      if (took < 0) return fail('views', where, `the switch never ended in 60 s  (${await page.evaluate(() => JSON.stringify({ view: document.querySelector('#viewSeg [aria-pressed="true"]')?.dataset.view, gliding: window.pps.stage.gliding(), drifting: window.pps.stage.drifting(), organs: window.pps.stage.organsSettled(), solving: window.pps.stage.labelSolving(), lobule: window.pps.stage.lobuleOpen() }))})`);
      await watchFor(page, 800); say(`${where}: settled, judging`);
      for (const t of await ask(page, diaphragmIssues)) if (v === 'anatomic' || v === 'circuit') fail('views', where, t);
      if (v === 'anatomic' && await watchUntil(page, () => document.querySelectorAll('#labels .lb:not(.lb-off)').length > 0 || (window.pps.stage.labelDrawn?.() || []).length > 0, null, { maxFake: 20000 }) < 0) fail('views', where, 'no label is drawn on the anatomy view (waited 20 s)');
      if (v !== 'lobule' && await watchUntil(page, solved, null, { maxFake: 45000 }) < 0) fail('views', where, 'the labels are still solving 45 s after the view settled (stuck)');
      errs(where);
    };
    await judge('anatomic', 'start');
    for (const [v, n] of [['circuit', 1], ['anatomic', 2], ['lobule', 1], ['anatomic', 3]]) {
      await page.evaluate((x) => document.querySelector(`#viewSeg [data-view="${x}"]`).click(), v);
      await judge(v, `switch ${n}`);
    }
    // labels follow a pan and a zoom (anatomy): they move with the camera, and none is left behind
    const box = await page.locator('.stage-view').boundingBox();
    const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.5;
    const settle = async () => { await watchUntil(page, () => !window.pps.stage.gliding() && !window.pps.stage.drifting(), null, { maxFake: 20000 }); await watchUntil(page, solved, null, { maxFake: 30000 }); await watchFor(page, 600); };
    // (A figure at its fitted size has no room to move: a drag pulls it against a rubber band and it springs back on release, so the pan is tried once zoomed a little.)
    await page.mouse.move(cx, cy);
    await page.keyboard.down('Control');
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -14); await watchFor(page, 120); }
    await page.keyboard.up('Control'); await settle();
    const b0 = await ask(page, labelState), m0 = await ask(page, camera);
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx - i * 12, cy + i * 6); await watchFor(page, 120); }
    await page.mouse.up();
    // (the page works through its queued pointer events on its own time: on a loaded CI runner the first look can come before it has begun, and settle() finds nothing gliding yet. Wait for the camera to move, up to 10 s; a drag that never moves it still fails below.)
    await watchUntil(page, (a) => { const m = document.getElementById('world')?.getScreenCTM(); return !!m && Math.hypot(m.e - a.e, m.f - a.f) > 20; }, m0, { maxFake: 10000 });
    await settle();
    const b1 = await ask(page, labelState), m1 = await ask(page, camera);
    const pan = [m1.e - m0.e, m1.f - m0.f];
    say(`pan: figure moved ${pan[0].toFixed(0)}, ${pan[1].toFixed(0)}; ${b0.pts.length} label(s) before, ${b1.pts.length} after, ${b1.anchors.length} anchored`);
    if (Math.hypot(...pan) < 20) fail('views', 'pan', `the drag did not move the figure (${pan[0].toFixed(0)}, ${pan[1].toFixed(0)})`);
    else if (b0.pts.length >= 3) {
      if (!b1.pts.length) fail('views', 'pan', 'every label vanished after a pan');
      else {
        const stayed = b0.pts.filter((p) => near(b1.pts, [p[0] + pan[0], p[1] + pan[1]], 16)).length;
        if (stayed < Math.ceil(b0.pts.length * 0.5)) fail('views', 'pan', `labels did not follow the pan: ${stayed} of ${b0.pts.length} are where the figure moved to (it moved ${pan[0].toFixed(0)}, ${pan[1].toFixed(0)})`);
      }
    }
    // zoom in about the centre (a trackpad pinch is Ctrl + wheel)
    await page.mouse.move(cx, cy);
    await page.keyboard.down('Control');
    for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -14); await watchFor(page, 120); }
    await page.keyboard.up('Control'); await settle();
    const b2 = await ask(page, labelState), m2 = await ask(page, camera);
    const k = m2.k / m1.k;
    say(`zoom: x${k.toFixed(2)}; ${b2.pts.length} label(s) after`);
    if (k < 1.1) fail('views', 'zoom', `the pinch did not zoom the figure (scale x${k.toFixed(2)})`);
    else if (b1.pts.length >= 3) {
      if (!b2.pts.length) fail('views', 'zoom', 'every label vanished after a zoom');
      else {
        const out = b1.pts.filter((p) => Math.hypot(p[0] - cx, p[1] - cy) > 120);
        const moved = out.filter((p) => !near(b2.pts, p, 3)).length;
        if (out.length >= 3 && moved < Math.ceil(out.length * 0.5)) fail('views', 'zoom', `labels did not follow the zoom (x${k.toFixed(2)}): ${out.length - moved} of ${out.length} labels far from the pinch stayed where they were`);
        const lost = b2.anchors.filter((a) => nearest(b2.pts, a) > 260).length;
        if (b2.anchors.length >= 3 && lost > b2.anchors.length * 0.4) fail('views', 'zoom', `${lost} of ${b2.anchors.length} labels are detached from the vessel they name (more than 260 px away)`);
      }
    }
    const lostPan = b1.anchors.filter((a) => nearest(b1.pts, a) > 260).length;
    if (b1.anchors.length >= 3 && lostPan > b1.anchors.length * 0.4) fail('views', 'pan', `${lostPan} of ${b1.anchors.length} labels are detached from the vessel they name (more than 260 px away)`);
    // The Circuit: its station readings ride a pinch and are laid out again where the stations are (the iPhone circuit bug of 2 Nov: they stayed where they were
    // before the zoom). The readings only show once the view has been moved a little, so one small pinch first; then a bigger one, judged right after the hand lets
    // go (the ride) and once the layout has landed (solved), against where each station is now.
    await page.evaluate(() => document.querySelector('#viewSeg [data-view="circuit"]').click());
    await judge('circuit', 'pinch');
    const pinch = async (n, dy) => { await page.mouse.move(cx, cy); await page.keyboard.down('Control'); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await watchFor(page, 120); } await page.keyboard.up('Control'); };
    await pinch(3, -14); await settle();
    const c0 = await ask(page, labelFollow);
    say(`circuit: ${c0.length} station label(s) before the pinch`);
    if (c0.length < 3) fail('views', 'circuit pinch', `only ${c0.length} station readings show in the Circuit after a small zoom`);
    else {
      await pinch(5, -14); await watchFor(page, 300);
      const c1 = await ask(page, labelFollow);
      await settle();
      const c2 = await ask(page, labelFollow);
      const follow = (c0, c) => {
        const moved = c0.map((a) => { const b = c.find((x) => x.k === a.k); return b && { k: a.k, dA: [b.ax - a.ax, b.ay - a.ay], dL: [b.lx - a.lx, b.ly - a.ly] }; }).filter((r) => r && Math.hypot(...r.dA) > 60);
        const ok = moved.filter((r) => Math.hypot(r.dL[0] - r.dA[0], r.dL[1] - r.dA[1]) <= Math.max(40, 0.4 * Math.hypot(...r.dA)));
        return { moved: moved.length, ok: ok.length, bad: moved.filter((r) => !ok.includes(r)).slice(0, 3).map((r) => `${r.k.slice(2)} (station moved ${r.dA.map(Math.round)}, label ${r.dL.map(Math.round)})`) };
      };
      // (Right after the hand lets go, the readings ride with their stations. Once the layout has landed it may have put a reading in another slot, so then only its distance from its station is judged, below.)
      for (const [when, c] of [['right after the pinch', c1]]) {
        const f = follow(c0, c);
        say(`circuit ${when}: ${f.ok} of ${f.moved} labels moved with their station`);
        if (f.moved >= 3 && f.ok < Math.ceil(f.moved * 0.7)) log(`  WARN circuit pinch (not a failure yet: it reads the layout's boxes, not the pictures the GPU drew, so it cannot tell a ride from a stuck label): labels stayed where they were before the zoom ${when}: only ${f.ok} of ${f.moved} moved with their station (${f.bad.join('; ')})`);
      }
      const far = c2.filter((r) => Math.hypot(r.lx - r.ax, r.ly - r.ay) > 260);
      if (c2.length >= 3 && far.length > c2.length * 0.2) fail('views', 'circuit pinch', `${far.length} of ${c2.length} readings are more than 260 px from the station they name once the layout landed (${far.slice(0, 3).map((r) => r.k.slice(2)).join(', ')})`);
    }
    try { await assertGpuLive(page, 'views stage, at the end', { software: true }); } catch (e) { fail('views', 'gpu', String(e.message).split('\n').slice(0, 3).join(' ')); }
    errs('circuit pinch');
    errs('pan and zoom');
  } finally { await app.close(); await browser.close(); server.close(); }
}

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

// ---- motion ---------------------------------------------------------------------------------------------------------------
// The deck's cards moving on the GPU, judged frame by frame (recs R16; scripts/gate-motion.mjs): the complement of the slides stage, which
// judges only where a change ends. Software WebGL named as a GPU, normal motion, real time; a Next, a Next pressed again while the cards
// are still coming in, and a Back during an entrance. Every move must keep its words, shade and glass together in every sampled frame,
// and must have enough frames sampled to be judged at all.
async function stageMotion() {
  const decks = opt('decks', 'hvpg').split(',').filter((d) => d && d !== 'all');
  const server = await serve(resolve(ROOT, DIR));
  const browser = await launch(true);
  try {
    for (const id of decks) {
      const app = await openPage(browser, `${server.url}?script=${id}&slide=1`, { size: 'small', clock: false, instant: false, motion: 'no-preference', init: gpuName });
      const { page } = app;
      const t0 = Date.now(), say = (m) => log(`  motion ${id} ${((Date.now() - t0) / 1000).toFixed(0)} s: ${m}`);
      const seen = new Set();
      const errs = (where) => { for (const e of app.errors) if (!seen.has(e)) { seen.add(e); fail('motion', where, e); } };
      try {
        const up = await watchUntil(page, () => { document.querySelector('.pz-case.on')?.click(); return document.querySelector('#app')?.classList.contains('presenting') && !window.pps?.presenter?.busy(); }, null, { maxFake: 240000 });
        if (up < 0) { fail('motion', `${id} 1`, 'the deck never opened in 240 s'); continue; }
        try { await assertGpuLive(page, `motion ${id}`, { software: true, vessels: false }); } catch (e) { fail('motion', `${id} gpu`, String(e.message).split('\n').slice(0, 3).join(' ')); continue; }
        await page.evaluate(() => window.pps.host.send({ type: 'run', running: false }));   // (the model paused: the frames sampled are the cards')
        const hook = await page.evaluate(startSampler);
        if (hook !== true) fail('motion', id, `INCONCLUSIVE: ${hook}; the glass cannot be judged (the words and their shade still are)`);
        if (hook === 'no frame.js onFrameEnd') continue;
        const moving = () => !!document.querySelector('.pz-throwing');
        // (Software GL paints a few frames a second, so one 560 ms throw is one or two sampled frames: each kind of move is made REPS
        // times and judged on every frame of all of them together; a kind with too few judged frames is INCONCLUSIVE, never a pass.)
        const REPS = +opt('reps', 3);
        const kinds = [['Next', ['ArrowRight'], 1], ['Next, then Next again mid-entry', ['ArrowRight', 'ArrowRight'], 2], ['Next, then Back mid-entry', ['ArrowRight', 'ArrowLeft'], 0]];
        const total = await page.evaluate(() => Number(document.querySelector('.pzb-n')?.textContent.split('/')[1]) || 0);
        let at = 1;
        const go = async (where, keys, want) => {
          await page.evaluate(takeSamples);
          for (const [i, k] of keys.entries()) {
            if (i) await watchUntil(page, moving, null, { maxFake: 60000 });   // (the next key while the cards are still on their way)
            await page.keyboard.press(k);
          }
          const took = await watchUntil(page, landed, want, { maxFake: 240000 });
          if (took < 0) { fail('motion', where, 'the change never ended in 240 s'); return null; }
          await watchUntil(page, () => !document.querySelector('.pz-throwing'), null, { maxFake: 30000 });
          errs(where);
          return page.evaluate(takeSamples);
        };
        for (const [name, keys, step] of kinds) {
          const all = [];
          for (let r = 0; r < REPS; r++) {
            if (at + Math.max(step, 1) > total) { await page.evaluate(() => window.pps.presenter.go(0)); await watchUntil(page, landed, 1, { maxFake: 240000 }); at = 1; await page.evaluate(takeSamples); }
            const where = `${id} ${name}, ${at} to ${at + step}`;
            const got = await go(where, keys, at + step);
            if (!got) continue;
            at += step;
            const r1 = motionIssues(got);
            say(`${where}: ${r1.frames} moving frame(s) judged of ${got.length} sampled, ${r1.issues.length} issue(s)`);
            for (const t of r1.issues.slice(0, 6)) fail('motion', where, t);
            all.push(...got);
          }
          const r = motionIssues(all);
          say(`${id} ${name}: ${r.frames} moving frame(s) judged over ${REPS} move(s)`);
          if (r.inconclusive) fail('motion', `${id} ${name}`, `INCONCLUSIVE: ${r.why} over ${REPS} move(s)`);
        }
        try { await assertGpuLive(page, `motion ${id}, at the end`, { software: true, vessels: false }); } catch (e) { fail('motion', `${id} gpu`, String(e.message).split('\n').slice(0, 3).join(' ')); }
      } finally { await page.evaluate(() => window.__motionStop?.()).catch(() => {}); await app.close(); }
    }
  } finally { await browser.close(); server.close(); }
}

// ---- run ------------------------------------------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
log(`pre-push gate: ${STAGES.join(', ')}${FULL ? ' (full)' : ' (fast)'}; ${JOBS} at a time; sizes ${SIZE_NAMES.join(', ')}${SHARDS > 1 ? `; share ${SHARD}/${SHARDS}` : ''}`);
const RUN = { static: stageStatic, boot: stageBoot, slides: stageSlides, views: stageViews, pixels: stagePixels, motion: stageMotion };
for (const s of STAGES) await timed(s, RUN[s]);
const total = Math.round((Date.now() - T0) / 1000);
const report = { when: new Date().toISOString(), full: FULL, stages: STAGES, timings, total, findings };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const lines = findings.map((f) => `- **${f.stage}** ${f.where}: ${f.text}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Pre-push gate (${FULL ? 'full' : 'fast'}${SHARDS > 1 ? `, share ${SHARD}/${SHARDS}` : ''}): ${findings.length ? `${findings.length} finding(s)` : 'passed'} in ${total} s\n\n${Object.entries(timings).map(([k, v]) => `${k} ${v} s`).join(', ')}\n\n${lines.join('\n')}\n`);
if (process.env.GITHUB_ACTIONS) for (const f of findings.slice(0, 40)) console.log(`::error title=gate ${f.stage}::${f.where}: ${f.text.replace(/\n/g, ' ')}`);
log(`\n${findings.length ? `GATE FAILED: ${findings.length} finding(s)` : 'GATE PASSED'} in ${total} s (${Object.entries(timings).map(([k, v]) => `${k} ${v}`).join(', ')})`);
process.exit(findings.length ? 1 : 0);
