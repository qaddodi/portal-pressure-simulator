// Deterministic frame-stepping capture of card motion (slide change, stacked card open/tuck, zoom, throw), headless on the real GPU path.
//
// Why: software GL takes seconds per frame, so a normal capture of a 0.5 s motion is a handful of random frames. Here time is OURS:
//   - Playwright's clock fakes requestAnimationFrame, setTimeout, Date and performance.now; one step runs the clock 1000/fps ms
//     (default 120 Hz = 8.33 ms), so every rAF/timer callback of that frame runs, in order, exactly once.
//   - CSS animations and transitions (they run on the document timeline, which the fake clock does not move) are held at
//     playbackRate 0 (playState stays "running", so code that tests for a running animation sees what it sees live) and their
//     currentTime is set to the step's time. A transition or animation first seen in a step starts at that step.
//   After each step the page is recorded (DOM state of every card and glass host) and optionally screenshotted, and a set of
//   anomaly rules runs over the series (solid card, glass dropped for a frame, opacity or size jumps, text going missing).
//
//   node scripts/frame-step.mjs --scenario next|back|fold-open|fold-tuck|zoom-in|zoom-out [--device mac|iphone|ipad ...] [--theme light|dark]
//        [--script <deck>] [--slide <n>] [--ms <motion length to step, default 1200>] [--fps 120] [--shots every|none|<n>] [--out <dir>] [--dir .|dist]
//   Output: <out>/frames.json (every frame's record), <out>/findings.txt, <out>/f0000.png ... and <out>/sheet.png (contact sheet) when shots are on.
//
// STATUS (2 Nov 2026), read before trusting a finding: what is verified is that CSS animations and transitions step deterministically
// (a slide change's card throw was recorded frame by frame: x, opacity, glass on/off). What is NOT verified: the page's own state after the
// clock swap. Late install (default) makes performance.now jump back, which threw "Invalid array length" and the next slide's cards never came
// in; `--early-clock` installs the clock before the page loads and the page then boots with solid cards and no stepping. Neither mode has
// produced a confirmed card glitch yet. Treat "no anomalies" as "not seen", not as "clean".
//
// As a module: import { capture, ANOMALY_RULES, findAnomalies } from './frame-step.mjs'.

import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, assertGpuLive } from './shoot.mjs';

// Like shoot.mjs CARDS_LANDED without the Doppler "Acquiring…" wait (that needs 1.5 s of recorded vessel, minutes on software GL):
// the root is out of prep, and every card is opaque with no finite animation running in it.
const LANDED = () => {
  const root = document.querySelector('.pz');
  if (!root || root.classList.contains('pz-prep') || 'bare' in root.dataset) return false;
  const cards = ['.pz-text', '.pz-data', '.pz-panel'].map((q) => document.querySelector(q)).filter((e) => e && !e.hidden && e.childElementCount);
  return cards.length > 0 && cards.every((e) => +getComputedStyle(e).opacity >= 0.99 && !e.classList.contains('pz-leave') && !e.getAnimations({ subtree: true }).some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)));
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Runs in the page, once: the stepper. */
export const STEPPER = () => {
  const born = new WeakMap();   // animation -> { at (ms of step time it began), base (its currentTime then) }
  const S = { T: 0 };
  S.hold = () => {
    for (const a of document.getAnimations()) {
      if (born.has(a)) { const b = born.get(a); const t = b.base + (S.T - b.at); try { a.currentTime = Math.max(0, t); const end = a.effect?.getComputedTiming().endTime; if (Number.isFinite(end) && t >= end && a.playState === 'running') { a.playbackRate = 1; a.finish(); } } catch { /* finished or not seekable */ } continue; }   // (held at rate 0 an animation never finishes by itself: one past its end is finished here, so its finish events and playState are as live)
      const ct = Number(a.currentTime) || 0;
      // first seen: a new animation starts now (its delay still counts), an older one carries on from where it is
      const fresh = S.T > 0 || ct < 1;
      born.set(a, { at: S.T, base: fresh ? 0 : ct });
      try { a.playbackRate = 0; a.currentTime = fresh ? 0 : ct; } catch { /* idem */ }
    }
  };
  // playbackRate 0 on a running animation stops it; those first seen get it above, the held ones keep it. (A new animation made in the
  // middle of a step is seen at that step's hold().)
  S.raf = 0; const r0 = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => r0((t) => { S.raf++; cb(t); });
  window.__fs = S;
  S.hold();
};

/** Runs in the page: what every card and glass host looks like right now. */
export const RECORD = () => {
  const q = (s) => [...document.querySelectorAll(s)];
  const vis = (e) => { const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden'; };
  const rec = (e, name) => {
    const r = e.getBoundingClientRect(), c = getComputedStyle(e);
    return {
      name, cls: String(e.className).replace(/\s+/g, ' ').slice(0, 80),
      x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      op: +(+c.opacity).toFixed(3), tr: c.transform === 'none' ? '' : c.transform, filter: c.backdropFilter && c.backdropFilter !== 'none' ? 'bf' : '',
      bg: c.backgroundColor, gl: e.hasAttribute('data-gl'), wait: e.hasAttribute('data-gl-wait'), morph: e.hasAttribute('data-gl-morph'),
      hidden: e.hidden, text: (e.innerText || '').trim().length, words: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30),
    };
  };
  const out = [];
  const seen = new Set();
  for (const [s, n] of [['.pz-shade', 'shade'], ['.pz-text', 'text'], ['.pz-data', 'data'], ['.pz-panel', 'panel'], ['.pz-case', 'case']]) {
    for (const e of q(s)) if (vis(e) && !seen.has(e)) { seen.add(e); out.push(rec(e, n)); }
  }
  for (const e of q('[data-gl],[data-gl-wait]')) if (!seen.has(e)) { seen.add(e); out.push(rec(e, 'glass-host')); }
  const root = document.querySelector('.pz');
  return { cards: out, slide: root?.dataset.slide ?? null, rootCls: root ? String(root.className).replace(/\s+/g, ' ') : null, anims: document.getAnimations().length, raf: window.__fs?.raf ?? 0, now: Math.round(performance.now()) };
};

const SCENARIOS = {
  // key: what is pressed at step 0
  next: { key: 'ArrowRight' },
  back: { key: 'ArrowLeft' },
  'fold-open': { key: 'ArrowUp' },
  'fold-tuck': { key: 'ArrowDown' },
  // zoom is a tap on the stacked data card (Mac / iPad landscape); "zoom-out" taps it again
  'zoom-in': { click: '.pz-data' },
  'zoom-out': { click: '.pz-data', pre: { click: '.pz-data', ms: 900 } },
  // the timeline's jump (Fast-forward menu, third row): the day count runs up on the GPU
  'day-jump': { click: '.time-pop .menu-item:nth-child(3)', pre: { click: '.tl-ff', ms: 400 } },
};

/** Rules over the series of frames: [{ frame, rule, detail }]. */
export function findAnomalies(frames) {
  const out = [];
  const add = (f, rule, detail) => out.push({ frame: f, rule, detail });
  const key = (c, i) => `${c.name}#${i}`;
  for (let i = 0; i < frames.length; i++) {
    const cur = frames[i].cards, prev = i ? frames[i - 1].cards : [];
    for (const c of cur) {
      const shown = c.op > 0.05 && c.w > 40 && c.h > 20;
      const isCard = c.name === 'shade' || c.name === 'data' || c.name === 'panel' || c.name === 'case';
      // 1. a visible glass card with neither GPU frost nor the bare wait: the solid CSS card
      if (c.name === 'shade' && shown && !c.gl && !c.wait) add(i, 'solid-card', `shade at ${c.x},${c.y} ${c.w}x${c.h} op ${c.op}: no data-gl (solid/unfrosted) bg=${c.bg}`);
      // 2. bare (no glass yet, no solid) while visible: the glass alone/ the words on nothing
      if (c.name === 'shade' && shown && c.wait && !c.gl) add(i, 'bare-card', `shade at ${c.x},${c.y} op ${c.op}: data-gl-wait without glass (bare)`);
      // 3. text missing in a shown card
      if ((c.name === 'text' || c.name === 'data') && shown && !c.text) add(i, 'card-no-text', `${c.name} op ${c.op} shows ${c.w}x${c.h} with no text`);
      // frame-to-frame
      const p = prev.find((q) => q.name === c.name && q.cls.split(' ')[0] === c.cls.split(' ')[0]);
      if (p && isCard) {
        if (Math.abs(c.op - p.op) > 0.45) add(i, 'opacity-jump', `${c.name} ${p.op} -> ${c.op} in one frame`);
        if (Math.abs(c.h - p.h) > 10 && c.op > 0.05 && p.op > 0.05) add(i, 'height-jump', `${c.name} height ${p.h} -> ${c.h}`);
        if (Math.abs(c.w - p.w) > 10 && c.op > 0.05 && p.op > 0.05) add(i, 'width-jump', `${c.name} width ${p.w} -> ${c.w}`);
        if (Math.abs(c.y - p.y) > 80 && c.op > 0.05 && p.op > 0.05) add(i, 'jump-y', `${c.name} y ${p.y} -> ${c.y}`);
        if (Math.abs(c.x - p.x) > 220 && c.op > 0.05 && p.op > 0.05) add(i, 'jump-x', `${c.name} x ${p.x} -> ${c.x}`);
        if (p.gl && !c.gl && shown) add(i, 'glass-dropped', `${c.name} lost data-gl while shown (op ${c.op})`);
      }
    }
    // a glass host whose card (shade) is gone in this frame: frost alone
    for (const c of cur) {
      if (c.name === 'glass-host' && c.gl && c.op > 0.05 && c.w > 40) {
        const card = cur.find((q) => q.name !== 'glass-host' && q.op > 0.05 && q.x <= c.x + 2 && q.y <= c.y + 2 && q.x + q.w >= c.x + c.w - 2 && q.y + q.h >= c.y + c.h - 2);
        void card; void key;
      }
    }
    // the shade (glass) shown while every words/data card over it is faded: glass alone
    const sh = cur.filter((c) => c.name === 'shade' && c.op > 0.3 && c.gl);
    const words = cur.filter((c) => (c.name === 'text' || c.name === 'data' || c.name === 'panel') && c.op > 0.3 && c.text);
    if (sh.length && !words.length && frames[i].rootCls && !/pz-prep/.test(frames[i].rootCls)) add(i, 'glass-alone', `${sh.length} frosted card(s) at op>0.3 with no words visible`);
  }
  // collapse runs of the same rule+detail head into ranges
  const merged = [];
  for (const a of out) {
    const last = merged.find((m) => m.rule === a.rule && m.to === a.frame - 1 && m.detail.split(' ')[0] === a.detail.split(' ')[0]);
    if (last) { last.to = a.frame; last.n++; } else merged.push({ rule: a.rule, from: a.frame, to: a.frame, n: 1, detail: a.detail });
  }
  return merged;
}
export const ANOMALY_RULES = ['solid-card', 'bare-card', 'card-no-text', 'opacity-jump', 'height-jump', 'width-jump', 'jump-y', 'jump-x', 'glass-dropped', 'glass-alone'];

/** Boots the app, installs the fake clock, waits for the slide to land, does the scenario's action and steps `ms` of motion. */
export async function capture({ scenario, device = 'mac', theme = 'light', script = 'hvpg', slide = 4, ms = 1200, fps = 120, shots = 'every', out, dir = '.', query = '', pace = 0, early = false } = {}) {
  const sc = SCENARIOS[scenario];
  if (!sc) throw new Error(`unknown scenario "${scenario}" (${Object.keys(SCENARIOS).join(', ')})`);
  mkdirSync(out, { recursive: true });
  const app = await openApp({ fakeClock: early, device, theme, dir, query: `?script=${script}&slide=${slide}${query ? `&${query}` : ''}` });
  const { page } = app;
  try {
    // 1. let the slide land on real time (software GL: slow), then hand time over to the stepper
    await app.settle({ wait: 20, vessels: false, hold: false, max: 1, cards: 0 });
    for (let k = 0; k < 240 && !(await page.evaluate(LANDED)); k++) await page.waitForTimeout(1000);
    if (!(await page.evaluate(LANDED))) throw new Error('the slide had not landed (cards still coming in) before the capture started; raise the wait');
    if (process.env.FS_LOG) console.error('landed; installing clock');
    if (early) {
      const T0 = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(T0 + 3000);   // (time runs by itself for 3 s more, then holds)
    } else {
      // installed late, the fake performance.now restarts near 0, so a timestamp the page took earlier is AHEAD of it (seen: "Invalid array length")
      const pre = await page.evaluate(() => performance.now());
      const T0 = Date.now();
      await page.clock.install({ time: T0 });
      await page.clock.pauseAt(T0 + 3000);
      // (3 Nov 2026: the fake performance.now starts at 0 and had only run 3 s, the page's own was minutes in: every ease read a negative
      // elapsed time, the camera blew up and binVeins threw "Invalid array length". Jump the fake clock past where the page's was: a
      // fastForward fires each timer once, not once per frame of the jump.)
      const cur = await page.evaluate(() => performance.now());
      if (pre + 200 > cur) await page.clock.fastForward(Math.ceil(pre + 200 - cur));
    }
    await page.waitForTimeout(3500);
    await page.clock.runFor(60);
    await page.evaluate(STEPPER);
    const dt = 1000 / fps;
    const step = async () => {
      await page.clock.runFor(dt);
      await page.evaluate((d) => { window.__fs.T += d; window.__fs.hold(); }, dt);
      if (pace) await page.waitForTimeout(pace);   // (real time for the page's own async work: promises, GPU uploads; the clock does not move)
    };
    const doAct = async (a) => {
      if (a.key) await page.keyboard.press(a.key);
      if (a.click) await page.locator(a.click).first().click({ force: true, noWaitAfter: true });
    };
    if (sc.pre) { await doAct(sc.pre); for (let t = 0; t < sc.pre.ms; t += dt) await step(); }
    // 2. the action, then frame 0 is the instant after it
    await page.evaluate(() => { window.__fs.T = 0; });
    await doAct(sc);
    await page.evaluate(() => window.__fs.hold());
    const frames = [];
    const n = Math.ceil(ms / dt);
    const shotEvery = shots === 'none' ? 0 : shots === 'every' ? 1 : Number(shots) || 1;
    for (let i = 0; i <= n; i++) {
      if (i) await step();
      if (process.env.FS_LOG) console.error(`step ${i}/${n} ${new Date().toISOString().slice(11, 19)}`);
      const rec = await page.evaluate(RECORD);
      rec.t = +(i * dt).toFixed(2);
      frames.push(rec);
      if (shotEvery && i % shotEvery === 0) await page.screenshot({ path: join(out, `f${String(i).padStart(4, '0')}.png`), timeout: 150000 });
    }
    await assertGpuLive(page, 'frame-step, after the last frame', { vessels: false });   // (a fallback to the SVG vessels or a lost context part way through makes every frame above a picture of the wrong figure)
    const findings = findAnomalies(frames);
    writeFileSync(join(out, 'frames.json'), JSON.stringify(frames));
    const txt = findings.length
      ? findings.map((f) => `${f.rule.padEnd(14)} frames ${f.from}-${f.to} (${(f.from * dt).toFixed(0)}-${(f.to * dt).toFixed(0)} ms, ${f.n} frames): ${f.detail}`).join('\n')
      : 'no anomalies';
    writeFileSync(join(out, 'findings.txt'), `${scenario} ${device} ${theme} ${script}#${slide}, ${n + 1} frames at ${fps} Hz\n${txt}\n${app.errors.length ? `page errors: ${app.errors.slice(0, 5).join(' | ')}\n` : ''}`);
    if (shotEvery) {
      try {
        const pngs = frames.map((_, i) => join(out, `f${String(i).padStart(4, '0')}.png`)).filter((_, i) => i % shotEvery === 0);
        const every = Math.max(1, Math.ceil(pngs.length / 24));
        execFileSync('montage', [...pngs.filter((_, i) => i % every === 0), '-tile', '6x', '-geometry', '320x+4+4', '-label', '%f', join(out, 'sheet.png')]);
      } catch { /* no ImageMagick: the frames stand alone */ }
    }
    return { frames, findings, errors: app.errors };
  } finally { await app.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const scenario = arg('scenario');
  if (!scenario) { console.error('usage: node scripts/frame-step.mjs --scenario next|back|fold-open|fold-tuck|zoom-in|zoom-out [--device mac|iphone|ipad] [--theme light|dark] [--script deck] [--slide n] [--ms 1200] [--fps 120] [--pace <real ms to wait after each step, default 0>] [--shots every|none|n] [--out dir] [--dir .|dist]'); process.exit(2); }
  const out = resolve(arg('out', join(ROOT, 'frame-step-out', `${scenario}-${arg('device', 'mac')}`)));
  try {
    const r = await capture({ scenario, device: arg('device', 'mac'), theme: arg('theme', 'light'), script: arg('script', 'hvpg'), slide: Number(arg('slide', 4)), ms: Number(arg('ms', 1200)), fps: Number(arg('fps', 120)), shots: arg('shots', 'every'), out, dir: arg('dir', '.'), query: arg('query', ''), pace: Number(arg('pace', 0)), early: process.argv.includes('--early-clock') });
    console.log(`${r.frames.length} frames -> ${out}`);
    console.log(r.findings.length ? r.findings.map((f) => `  ${f.rule} frames ${f.from}-${f.to}: ${f.detail}`).join('\n') : '  no anomalies');
  } catch (e) { console.error(`frame-step FAILED: ${e.message}`); process.exit(1); }
}
