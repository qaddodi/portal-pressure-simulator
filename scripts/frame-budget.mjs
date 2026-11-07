// The frame budget, engine-wide (2 Nov 2026, Mohammad: "need to make this game engine 120hz", "speed up every thing"): walks every
// slide change of every deck, the way Next does, and lists each main-thread stretch that would break a 120 Hz frame (8.3 ms), with
// what ran in it. It then ranks the causes over all the decks, so the next fix goes where most of the time goes.
//
// What it measures is the page's own CPU time, which is what a phone's main thread has to fit in 8.3 ms. The machine here has no GPU,
// so the draws are taken out (every WebGL draw and clear is a no-op; the renderer still reads as a GPU, so the app runs the iPhone's
// code path) and the GPU's own time is not in these numbers. Uploads stay in: they cost the main thread on every device.
//
// For each slide change, from the press until the slide is still:
//   long frames   the scheduler's frames over 8.3 ms of script (frame.js watchFrames), with the surfaces and named parts in them
//   long tasks    every task over 8.3 ms, inside the scheduler or not (a setTimeout, an event), from a CPU profile: the functions that
//                 took the time in it (self time) and its own length
//   budget        style and layout reads, DOM writes and bytes uploaded (motion-budget.js, ?budget=1), with the top callers
//
//   node scripts/frame-budget.mjs [--device iphone|mac|ipad] [--decks hvpg,varices] [--from 1] [--steps 99] [--json out.json]
//        [--query "x=0"] [--dir .|dist] [--hold 5] [--jobs 2]
//
// Report only: it never fails on a number. Compare the lines between builds, not with a device.
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { serve } from './serve.mjs';
import { DEVICES, CHROMIUM_ARGS } from './shoot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BUDGET = 1000 / 120;
const device = arg('device', 'iphone'), hold = +arg('hold', 5), jobs = Math.max(1, +arg('jobs', 2));
const from = Math.max(1, +arg('from', 1)), steps = +arg('steps', 99), extra = arg('query', ''), out = arg('json', '');
const ALL = ['circulation', 'sites', 'hvpg', 'ascites', 'varices', 'treatment', 'stiffness', 'lobule', 'shunts', 'tips-doppler', 'circuit',
  'doppler', 'endoscopy', 'prehepatic', 'variceal-bleed', 'two-inflows', 'ncph', 'outflow', 'recompensation', 'where', 'pregnancy',
  'encephalopathy', 'cause-treated', 'next-bleed', 'gastric-varices', 'hyperdynamic', 'choose-treatment', 'ten-years'];
const decks = arg('decks', '') ? arg('decks').split(',') : ALL;
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

// In the page before anything else: the renderer named as a GPU (shoot.mjs), and every draw a no-op (see above).
const INIT = () => {
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const P = C.prototype, gp = P.getParameter;
    P.getParameter = function (p) { return p === 0x9246 || p === 0x1F01 ? 'Apple M2 GPU' : gp.call(this, p); };
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer']) if (P[k]) P[k] = function () {};
  }
};

const shortUrl = (u) => (u || '').replace(/^.*\/(src|styles)\//, '$1/').replace(/\?v=[0-9a-f]+/, '') || '(native)';

// Self time by function inside each long task, from a CPU profile. A "task" is a run of samples with no idle gap over 1 ms between them.
function tasksOf(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const idle = new Set(profile.nodes.filter((n) => ['(idle)', '(program)'].includes(n.callFrame.functionName)).map((n) => n.id));
  const name = (n) => `${n.callFrame.functionName || '(anonymous)'} ${shortUrl(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
  const tasks = [];
  let t = profile.startTime, cur = null;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    const id = profile.samples[i], dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    if (idle.has(id)) { if (cur && t / 1000 - cur.end > 1) { tasks.push(cur); cur = null; } continue; }
    const n = nodes.get(id);
    if (!cur) cur = { start: t / 1000, end: t / 1000, self: new Map() };
    cur.end = t / 1000 + dt;
    if (n.callFrame.functionName === '(garbage collector)') cur.self.set('(garbage collector)', (cur.self.get('(garbage collector)') || 0) + dt);
    else cur.self.set(name(n), (cur.self.get(name(n)) || 0) + dt);
  }
  if (cur) tasks.push(cur);
  return tasks.map((x) => ({ ms: x.end - x.start, start: x.start, self: [...x.self].sort((a, b) => b[1] - a[1]) }));
}

async function runDeck(browser, server, deck) {
  const ctx = await browser.newContext({ ...DEVICES[device], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(300000);
  await page.addInitScript(INIT);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  const rows = [];
  try {
    await page.goto(`${server.url}?script=${deck}&slide=${from}&budget=1${extra ? `&${extra}` : ''}`);
    await page.waitForFunction(() => window.pps?.presenter?.active?.() && !window.pps.presenter.busy(), null, { timeout: 300000, polling: 500 });
    await page.waitForTimeout(hold * 1000);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    const count = await page.evaluate(() => Number(document.querySelector('.pzb-n')?.textContent.split('/')[1]) || 0);
    for (let k = from; k < Math.min(count, from + steps); k++) {
      await page.evaluate(() => { window.__mb = window.pps.motionBudget.start('slide'); window.pps.perf.frames.start(); });
      await cdp.send('Profiler.start');
      await page.keyboard.press('ArrowRight');
      // Until still: the presenter not busy, then `hold` s more (the cards' entry, the camera's glide and the slide's own motion).
      for (let t0 = Date.now(); Date.now() - t0 < 60000; await page.waitForTimeout(500)) {
        if (await page.evaluate(() => { window.pps.presenter.skipLapse?.(); document.querySelector('.pz-case.on')?.click(); return !window.pps.presenter.busy(); })) break;
      }
      await page.waitForTimeout(hold * 1000);
      const { profile } = await cdp.send('Profiler.stop');
      const r = await page.evaluate(() => ({ b: window.pps.motionBudget.stop(window.__mb, 8), f: window.pps.perf.frames.stop() }));
      const tasks = tasksOf(profile).filter((x) => x.ms > BUDGET);
      const frames = r.f.scripts || [];
      rows.push({
        deck, change: `${k} to ${k + 1}`, frames: frames.length, overBudget: frames.filter((s) => s > BUDGET).length,
        worstFrame: Math.max(0, ...frames), tasks: tasks.map((x) => ({ ms: +x.ms.toFixed(1), top: x.self.slice(0, 6).map(([f, ms]) => [f, +ms.toFixed(1)]) })),
        long: r.f.long, reads: r.b.reads, writes: r.b.writes, upload: r.b.upload, readers: r.b.readers, written: r.b.written, uploaders: r.b.uploaders,
      });
      const row = rows.at(-1), worst = Math.max(0, ...row.tasks.map((x) => x.ms));
      console.log(`${deck} ${row.change}: ${row.tasks.length} tasks over 8.3 ms (worst ${worst.toFixed(0)} ms), ${row.overBudget}/${row.frames} frames over, ${row.reads} reads, ${row.writes} writes, ${(row.upload / 1048576).toFixed(1)} MB up`);
    }
  } catch (e) { console.log(`${deck}: stopped (${e.message.split('\n')[0]})`); }
  if (errors.length) console.log(`${deck}: page errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
  return rows;
}

const server = await serve(resolve(ROOT, arg('dir', '.')));
const browser = await chromium.launch({ args: [...CHROMIUM_ARGS, '--disable-gpu-compositing'], ...(EXE ? { executablePath: EXE } : {}) });
const all = [], queue = decks.slice();
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) all.push(...await runDeck(browser, server, queue.shift())); }));
await browser.close(); server.close();

// The ranking: each function's self time in tasks over budget, summed over every change, with how many changes it was in.
const by = new Map(), add = (m, k, v, where) => { const e = m.get(k) || { ms: 0, where: new Set() }; e.ms += v; e.where.add(where); m.set(k, e); };
const reads = new Map(), ups = new Map();
for (const r of all) {
  const where = `${r.deck} ${r.change}`;
  for (const t of r.tasks) for (const [f, ms] of t.top) add(by, f, ms, where);
  for (const [k, n] of r.readers || []) add(reads, k, n, where);
  for (const [k, kb] of r.uploaders || []) add(ups, k, kb, where);
}
const rank = (m, n, unit) => [...m].sort((a, b) => b[1].ms - a[1].ms).slice(0, n).map(([k, e]) => `  ${e.ms.toFixed(0).padStart(7)} ${unit}  ${k}  (${e.where.size} changes, e.g. ${[...e.where].slice(0, 3).join('; ')})`).join('\n');
const total = all.reduce((s, r) => s + r.tasks.reduce((a, t) => a + t.ms, 0), 0);
console.log(`\n${all.length} slide changes, ${all.reduce((s, r) => s + r.tasks.length, 0)} tasks over 8.3 ms, ${total.toFixed(0)} ms in them`);
console.log(`Top functions (self time in tasks over 8.3 ms):\n${rank(by, 40, 'ms')}`);
console.log(`Top layout and style readers (count):\n${rank(reads, 15, '  ')}`);
console.log(`Top uploaders (KB):\n${rank(ups, 15, 'KB')}`);
console.log(`Worst changes:\n${all.map((r) => [r, r.tasks.reduce((a, t) => a + t.ms, 0)]).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([r, ms]) => `  ${ms.toFixed(0).padStart(6)} ms  ${r.deck} ${r.change} (worst task ${Math.max(0, ...r.tasks.map((t) => t.ms)).toFixed(0)} ms: ${r.tasks.sort((a, b) => b.ms - a.ms)[0]?.top.slice(0, 3).map(([f, m]) => `${f} ${m}`).join(', ') || '-'})`).join('\n')}`);
if (out) writeFileSync(out, JSON.stringify(all, null, 2));
