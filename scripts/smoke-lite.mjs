// The one browser check, on request only ([smoke] in a commit message, or the Actions tab: checks.yml). Never before a push.
// It asks only "does the built app start and open?", on the GPU path (software WebGL named as a GPU, since CI has no graphics card):
//
//   static   no conflict marker; the app and the worker bundle (scripts/gate-static.mjs)                       ~1 s
//   boot     the page starts on the GPU path, desktop and phone: no page error, console error, failed request or boot error
//   views    Anatomy, Circuit, Lobule and back: each switch ends, with no error
//   decks    slide 1 of every deck opens and lands, desktop: no error
//
// It judges no pixels and no timings: a software renderer on a shared runner says nothing about either on a real GPU.
//
//   node scripts/smoke-lite.mjs [dir]        dir: the site (default dist; the repository root works too)
//   --jobs 3                                 decks at a time

import { appendFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { findMarkers, checkBundle } from './gate-static.mjs';
import { assertGpuLive } from './shoot.mjs';
import { launch, openPage, figureUp, watchUntil, landed, pool, gpuName } from './gate-clock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DIR = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'dist';
const JOBS = Math.max(1, +opt('jobs', Math.min(3, cpus().length)));

const findings = [];
const fail = (stage, where, text) => { findings.push({ stage, where, text }); console.log(`  FAIL ${stage} ${where}: ${text}`); };
const first = (e) => String(e?.message || e).split('\n')[0];
const GL = { clock: false, instant: false, init: gpuName };

const server = await serve(resolve(ROOT, DIR));
const browser = await launch(true);
const T0 = Date.now();
try {
  console.log('== static');
  for (const m of findMarkers()) fail('static', `${m.file}:${m.line}`, `merge conflict marker "${m.text}"`);
  for (const p of await checkBundle()) fail('static', p.where.replace(`${ROOT}/`, ''), p.text);

  console.log('== boot');
  await Promise.all(['desktop', 'phone'].map(async (size) => {
    const app = await openPage(browser, `${server.url}?preset=cirr-decomp`, { ...GL, size });
    try {
      await figureUp(app.page);
      const info = await app.page.evaluate(() => ({ boot: window.ppsBootErrors || [], api: ['store', 'host', 'stage', 'presenter', 'card'].filter((k) => !window.pps?.[k]) }));
      for (const e of info.boot) fail('boot', size, `boot error: ${e}`);
      if (info.api.length) fail('boot', size, `window.pps lacks ${info.api.join(', ')}`);
      try { await assertGpuLive(app.page, `boot ${size}`, { software: true }); } catch (e) { fail('boot', size, first(e)); }
      for (const e of [...new Set(app.errors)].slice(0, 6)) fail('boot', size, e);
    } catch (e) { fail('boot', size, `the page never came up: ${first(e)}`); }
    finally { await app.close(); }
  }));

  console.log('== views');
  {
    const app = await openPage(browser, `${server.url}?preset=cirr-decomp`, { ...GL, size: 'small', motion: 'no-preference' });
    const done = (v) => {
      const st = window.pps.stage, on = document.querySelector('#viewSeg [aria-pressed="true"]')?.dataset.view;
      if (on !== v) return false;
      return v === 'lobule' ? st.lobuleOpen() && st.lobuleSettled() : !st.lobuleOpen() && !st.gliding() && !st.drifting() && st.organsSettled();
    };
    try {
      await figureUp(app.page);
      if (await watchUntil(app.page, done, 'anatomic', { maxFake: 120000 }) < 0) fail('views', 'anatomic (start)', 'the view never settled in 120 s');
      for (const v of ['circuit', 'anatomic', 'lobule', 'anatomic']) {
        const e0 = app.errors.length;
        await app.page.evaluate((x) => document.querySelector(`#viewSeg [data-view="${x}"]`).click(), v);
        if (await watchUntil(app.page, done, v, { maxFake: 60000 }) < 0) fail('views', v, 'the switch never ended in 60 s');
        for (const e of [...new Set(app.errors.slice(e0))].slice(0, 4)) fail('views', v, e);
      }
    } catch (e) { fail('views', 'page', first(e)); }
    finally { await app.close(); }
  }

  console.log('== decks');
  const { DECKS } = await import(new URL('../src/ui/decks.js', import.meta.url));
  await pool(DECKS.map((d) => async () => {
    const app = await openPage(browser, `${server.url}?script=${d.id}&slide=1`, { ...GL, size: 'desktop' });
    try {
      const open = () => { document.querySelector('.pz-case.on')?.click(); return document.querySelector('#app')?.classList.contains('presenting'); };
      if (await watchUntil(app.page, open, null, { maxFake: 120000 }) < 0) fail('decks', d.id, 'the deck never opened in 120 s');
      else if (await watchUntil(app.page, landed, 1, { maxFake: 60000 }) < 0) fail('decks', d.id, 'slide 1 never landed in 60 s');
      for (const e of [...new Set(app.errors)].slice(0, 4)) fail('decks', d.id, e);
      console.log(`  ${d.id}: opened`);
    } catch (e) { fail('decks', d.id, first(e)); }
    finally { await app.close(); }
  }), JOBS);
} finally { await browser.close(); server.close(); }

const total = Math.round((Date.now() - T0) / 1000);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Smoke: ${findings.length ? `${findings.length} finding(s)` : 'passed'} in ${total} s\n\n${findings.map((f) => `- **${f.stage}** ${f.where}: ${f.text}`).join('\n')}\n`);
if (process.env.GITHUB_ACTIONS) for (const f of findings.slice(0, 40)) console.log(`::error title=smoke ${f.stage}::${f.where}: ${f.text.replace(/\n/g, ' ')}`);
console.log(`\n${findings.length ? `SMOKE FAILED: ${findings.length} finding(s)` : 'SMOKE PASSED'} in ${total} s`);
process.exit(findings.length ? 1 : 0);
