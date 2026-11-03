// Mid-transition glitch sweep: walks every deck slide forward and back (and the Circuit / Anatomy / Lobule switches, a pan and a pinch)
// on a fake, stepped clock, records the page at EVERY step through each change, and flags what a person would see for a frame or two.
// It sits on top of the pre-push gate (scripts/gate.mjs checks where a change ENDS; this checks the frames on the way).
//
//   node scripts/glitch-sweep.mjs --decks hvpg,circuit --sizes desktop,phone,sideways [--fps 30] [--ms 2000] [--shots 0|<every n>] [--out dir]
//   node scripts/glitch-sweep.mjs --scenarios views,gestures --sizes desktop,phone
//   node scripts/glitch-sweep.mjs --full --shard 2/8        every deck, a share of the units (a unit = deck x size, or a scenario x size)
//
// How time works (deterministic, nothing is decided by real time):
//   - Playwright's clock fakes requestAnimationFrame, timers, Date and performance.now. It is installed before the page loads and paused;
//     from then on time moves only when this file runs it, `dt` ms at a time (1000 / fps), every frame callback in order.
//   - CSS animations, transitions and element.animate() run on the document timeline, which that clock does not move. After every step
//     they are held (playbackRate 0) and set to the step's time, so a card's slide-in is at the same place on every run.
//   - The engine worker runs on real time: after every step a short real pause (--pace) lets its answers in (the gate does the same).
// By default the figure's WebGL canvases are not drawn (as in the gate: software GL costs seconds a frame) and every check is on the DOM.
// --gl draws the real GPU path and also looks at the pixels (black frames, flashes) on the frames chosen by --shots.
//
// Flags (rules over the series of frames; each finding names the frames, the clock time and what moved):
//   stuck-mid       a card frozen part way through a fade for 10+ frames, left in `pz-leave`, or the change still going when the window ends
//   frozen-zero     a card that should show sits at opacity 0 for the last frames of the window
//   flash           a card, label or tile drops from visible to nearly invisible and comes back within 8 frames
//   label-detached  a label moves differently from the anchor it labels, or sits far from it, in the same frame
//   width-jump      a number or word in a card, tile or readout changes width by 1 px+ while the card around it holds its width
//   glass           (frame-step rules) solid card, bare card, glass dropped, glass alone, opacity / size / position jumps
//   black / blank   (--gl) a frame that is almost all black, or a one-frame flash of brightness
//   error           a page error or a console error during the change
// Exit code 1 when anything is flagged. Frames are written as JSON (--out/<unit>.json) so a finding can be replayed at its frame.

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { CHROMIUM_ARGS, assertGpuLive } from './shoot.mjs';
import { findAnomalies, STEPPER, RECORD } from './frame-step.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

export const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  sideways: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the page side ----------------------------------------------------------------------------------------------------------

/** Runs in the page: what the sweep reads every frame, on top of frame-step's card records (cards, glass hosts). */
const RECORD_MORE = () => {
  const S = (window.__gs ||= { ids: new WeakMap(), n: 0 });
  const id = (e) => { let v = S.ids.get(e); if (!v) { v = ++S.n; S.ids.set(e, v); } return v; };
  // an element's opacity as the eye gets it: its own times every ancestor's
  const eye = (e) => { let o = 1; for (let a = e; a && a.nodeType === 1; a = a.parentElement) { const c = getComputedStyle(a); if (c.display === 'none' || c.visibility === 'hidden') return 0; o *= +c.opacity; if (o === 0) return 0; } return +o.toFixed(3); };
  const out = { labels: [], nums: [], figure: null, busy: null, n: null, cam: null, load: false, cls: {} };
  const st = window.pps?.stage;
  const wr = document.querySelector('.stage-view')?.getBoundingClientRect();
  for (const g of document.querySelectorAll('#labels .lb')) {
    if (g.classList.contains('lb-off')) continue;
    const op = eye(g); if (op < 0.02) continue;
    const t = g.querySelector('text') || g, r = t.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const key = g.dataset.key || '', rec = { key, op, x: +(r.left + r.width / 2).toFixed(1), y: +(r.top + r.height / 2).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    if (key.startsWith('n:') && st?.labelAnchorOf) { try { const a = st.labelAnchorOf(key.slice(2)); if (a && Number.isFinite(a.x)) { rec.ax = +a.x.toFixed(1); rec.ay = +a.y.toFixed(1); } } catch { /* no anchor */ } }
    out.labels.push(rec);
  }
  // numbers and short words in the cards, tiles and readouts: one entry per leaf with a digit (capped), keyed by element
  for (const root of document.querySelectorAll('.pz-text, .pz-data, .pz-panel, .pz-case.on, #readouts, .readouts, .tile, .pz-tile')) {
    if (root.hidden) continue;
    const rr = root.getBoundingClientRect();
    for (const e of root.querySelectorAll('*')) {
      if (e.childElementCount || e.closest('.sr-only, [aria-hidden="true"]')) continue;
      const tx = e.textContent.trim(); if (!tx || tx.length > 24 || !/\d/.test(tx)) continue;
      const r = e.getBoundingClientRect(); if (r.width < 1) continue;
      out.nums.push({ id: id(e), t: tx, w: +r.width.toFixed(2), cw: +rr.width.toFixed(1), op: eye(e) });
      if (out.nums.length > 60) break;
    }
    if (out.nums.length > 60) break;
  }
  // what the GPU labels actually drew (boxes in px from the figure canvas's corner), and where each laid-out label should be: its anchor on
  // the figure now (client px) and the offset the layout gave it
  try {
    const d = st.labelDrawn?.(); out.drawn = d ? d.slice(0, 120).map((b) => [Math.round(b[0]), Math.round(b[1]), Math.round(b[2]), Math.round(b[3])]) : null;
    out.slots = [];
    for (const [k, v] of Object.entries(st.labelSlots?.() || {})) {
      if (!k.startsWith('n:')) continue;
      const a = st.labelAnchorOf(k.slice(2)); if (!a || !Number.isFinite(a.x)) continue;
      const [dx, dy] = v.split('/')[2].split(',').map(Number);
      out.slots.push([k, +a.x.toFixed(1), +a.y.toFixed(1), dx, dy]);
    }
  } catch { /* no labels yet */ }
  const cv = document.querySelector('#veins') || document.querySelector('.stage-view canvas');
  if (cv) { const c = getComputedStyle(cv); out.figure = { vis: c.visibility !== 'hidden' && c.display !== 'none', op: eye(cv), w: cv.clientWidth, test: 'testGl' in cv.dataset }; }
  try { out.busy = window.pps.presenter.busy(); } catch { out.busy = null; }
  out.n = document.querySelector('.pzb-n')?.getAttribute('aria-label') || null;
  try { const c = st.cameraState(); out.cam = [+c.k.toFixed(4), +c.x.toFixed(1), +c.y.toFixed(1)]; } catch { /* no camera */ }
  // what is on screen, not what the camera was last told: the figure's world-to-screen transform (it carries a glide that runs as an animation)
  try { const m = document.getElementById('world').getScreenCTM(); if (m) out.ctm = [+Math.hypot(m.a, m.b).toFixed(4), +m.e.toFixed(1), +m.f.toFixed(1)]; } catch { /* no world */ }
  out.load = !!document.querySelector('.pz-load.on');
  out.vw = innerWidth; out.vh = innerHeight; out.wr = wr ? [wr.left, wr.top, wr.width, wr.height] : null;
  return out;
};

/** In the page: slide `want` is up, the presenter idle and the cards in (what a person waits for before pressing Next again). */
const SETTLED = (want) => {
  document.querySelector('.pz-case.on')?.click();
  const root = document.querySelector('.pz');
  if (!root || window.pps.presenter.busy() || (want && Number((document.querySelector('.pzb-n')?.getAttribute('aria-label') || '').match(/Slide (\d+)/)?.[1]) !== want)) return false;
  if (root.classList.contains('pz-prep') || 'bare' in root.dataset || document.querySelector('.pz-load.on')) return false;
  const cards = ['.pz-text', '.pz-data', '.pz-panel'].map((q) => document.querySelector(q)).filter((e) => e && !e.hidden && e.childElementCount && !e.classList.contains('pz-hide'));
  return cards.every((e) => +getComputedStyle(e).opacity >= 0.99 && !e.classList.contains('pz-leave') && !e.getAnimations({ subtree: true }).some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime) && a.effect.getComputedTiming().endTime > 2));
};

/** In the page: why SETTLED is false, for a finding's text. */
const WHY = () => {
  const root = document.querySelector('.pz');
  const cards = ['.pz-text', '.pz-data', '.pz-panel'].map((q) => { const e = document.querySelector(q); return e ? `${q.slice(4)}:${e.hidden ? 'hidden' : 'op' + getComputedStyle(e).opacity}${e.classList.contains('pz-leave') ? '/leave' : ''}${e.classList.contains('pz-hide') ? '/hide' : ''}/anims${e.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).length}` : null; }).filter(Boolean).join(' ');
  const an = [...document.querySelectorAll('.pz-panel')].flatMap((e) => e.getAnimations({ subtree: true })).filter((a) => a.playState === 'running').slice(0, 3).map((a) => `${a.effect?.target?.className?.toString().slice(0, 30)}:${a.animationName || a.transitionProperty || 'waapi'}@${Math.round(a.currentTime)}/${a.effect?.getComputedTiming().endTime}`).join(',');
  return `anims[${an}] busy=${window.pps.presenter.busy()} label="${document.querySelector('.pzb-n')?.getAttribute('aria-label')}" root="${root?.className}" bare=${root && 'bare' in root.dataset} load=${!!document.querySelector('.pz-load.on')} ${cards}`;
};

/** Pixel read, in the page: mean brightness, and the share of near-black pixels, of a screenshot (sent as base64 JPEG). */
const PIXELS = async (b64) => {
  const img = new Image(); img.src = `data:image/jpeg;base64,${b64}`; await img.decode();
  const k = Math.min(1, 160 / img.width), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data; let sum = 0, dark = 0;
  for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; if (l < 12) dark++; }
  return { lum: +(sum / (d.length / 4)).toFixed(1), dark: +(dark / (d.length / 4)).toFixed(3) };
};

// ---- the driver -------------------------------------------------------------------------------------------------------------

/** A page on `url` whose clock is fake and paused, its motion held, its errors collected. */
async function openPage(browser, url, { size = 'desktop', scheme = 'light', gl = false, dpr = 0 } = {}) {
  const ctx = await browser.newContext({ ...SIZES[size], ...(dpr ? { deviceScaleFactor: dpr } : {}), colorScheme: scheme, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const gp = C.prototype.getParameter; C.prototype.getParameter = function (p) { return p === 0x9246 || p === 0x1F01 ? 'Apple M2 GPU' : gp.call(this, p); }; }
  });
  await ctx.addInitScript(() => {
    // requestAnimationFrame is a queue the sweep drains once per step (window.__tick): one app frame per recorded frame, in a fixed order
    const q = new Map(); let n = 0;
    window.requestAnimationFrame = (cb) => { q.set(++n, cb); return n; };
    window.cancelAnimationFrame = (id) => { q.delete(id); };
    window.__tick = () => { const t = performance.now(), run = [...q]; q.clear(); for (const [, cb] of run) { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } } };
  });
  if (!gl) await ctx.addInitScript(() => {
    // not drawn on screen (as the gate): a software GL read-back costs seconds a frame, and these checks judge boxes and words
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) { if (/webgl/.test(type)) this.dataset.testGl = ''; return getContext.call(this, type, ...a); };
    const put = () => { const s = document.createElement('style'); s.textContent = 'canvas[data-test-gl]{visibility:hidden!important}'; document.documentElement.append(s); };
    if (document.documentElement) put(); else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); put(); } }).observe(document, { childList: true });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console error: ${m.text().split('\n')[0].slice(0, 200)}`); });
  await page.clock.install();
  await page.goto(url);
  await page.clock.pauseAt(Date.now() + 1000);
  return { page, ctx, errors, close: () => ctx.close() };
}

/** The stepper: one fake frame at a time, with the held animations moved on to match. */
function stepper(page, { fps, pace, anim = 'before' }) {
  const dt = 1000 / fps;
  const S = { t: 0, installed: false, prof: { run: 0, hold: 0, rec: 0 } };
  /** One frame of `ms`: the browser's order is animations (style update), then timers, then the frame callbacks. 'before' does that;
   *  'after' (the first version of this file) ran the callbacks first and moved the animations afterwards, so anything that reads an
   *  animation in a callback saw the previous frame's value. The frame callbacks run once per step (the page's rAF is a queue this file drains). */
  S.advance = async (ms) => {
    const a = Date.now();
    if (anim === 'before') await page.evaluate((d) => { if (window.__fs) { window.__fs.T += d; window.__fs.hold(); } }, ms);
    await page.clock.runFor(ms);
    const b = Date.now();
    await page.evaluate(([d, mode]) => { window.__tick(); if (mode !== 'before' && window.__fs) { window.__fs.T += d; window.__fs.hold(); } }, [ms, anim]);
    S.prof.run += b - a; S.prof.hold += Date.now() - b;
    S.t += ms;
  };
  S.one = async () => { await S.advance(dt); if (pace) await sleep(pace); };
  /** Coarse steps (100 ms, like the gate) until `ready(arg)` is true in the page. Returns the fake ms taken or -1. */
  S.until = async (ready, arg, maxFake = 30000) => {
    for (let t = 0; t <= maxFake; t += 100) {
      if (await page.evaluate(ready, arg)) return t;
      await S.advance(100);
      if (pace) await sleep(Math.max(pace, 30));
    }
    return -1;
  };
  S.install = async () => { await page.evaluate(STEPPER); S.installed = true; };
  S.dt = dt;
  return S;
}

/** Records `frames` frames after `act` ran, each step followed by a record of the page (and a screenshot when `shot(i)`). */
async function film(page, S, frames, { gl, shotEvery, shotDir, tag, events = [] }) {
  const out = [];
  for (let i = 0; i <= frames; i++) {
    for (const [at, fn] of events) if (at === i) { await fn(i); await page.evaluate(() => window.__fs.hold()); }
    const q0 = Date.now(); if (i) await S.one(); if (process.env.GS_LOG) S.prof.tot = (S.prof.tot || 0) + Date.now() - q0;
    const r0 = Date.now(); const rec = await page.evaluate(RECORD); rec.more = await page.evaluate(RECORD_MORE); S.prof.rec += Date.now() - r0;
    rec.t = +(i * S.dt).toFixed(1);
    if (gl && shotEvery && i % shotEvery === 0) {
      const buf = await page.screenshot({ type: 'jpeg', quality: 50, timeout: 150000, scale: 'css' });
      rec.px = await page.evaluate(PIXELS, buf.toString('base64'));
      if (shotDir) { mkdirSync(shotDir, { recursive: true }); writeFileSync(join(shotDir, `${tag}-f${String(i).padStart(3, '0')}.jpg`), buf); }
    }
    out.push(rec);
    if (process.env.GS_LOG && i % 10 === 0) console.log(`   frame ${i} at ${Date.now() % 100000}`);
  }
  return out;
}

// ---- rules over a series ----------------------------------------------------------------------------------------------------

/** [{ rule, from, to, detail }] over frames of { cards, more, px?, t }. `expect` is what the landed slide must show. */
export function judge(frames, { expect = {}, glass = false, restFrom = null, camRest = true } = {}) {
  const out = [];
  const add = (rule, from, to, detail) => out.push({ rule, from, to, detail });
  const N = frames.length, last = frames[N - 1];
  // glass and card rules (frame-step's)
  if (glass) for (const f of findAnomalies(frames)) add(`glass:${f.rule}`, f.from, f.to, f.detail);
  // stuck mid-transition and frozen at zero
  const tail = frames.slice(Math.max(0, N - 10));
  for (const name of ['text', 'data', 'panel']) {
    const at = (f) => f.cards.find((c) => c.name === name && !c.hidden && c.text && c.w > 40);
    const ser = tail.map(at);
    if (ser.every(Boolean)) {
      const ops = ser.map((c) => c.op), cls = ser[0].cls;
      if (!/pz-hide/.test(cls) && Math.max(...ops) - Math.min(...ops) < 0.005 && ops[0] > 0.02 && ops[0] < 0.98) add('stuck-mid', N - 10, N - 1, `the ${name} card sits at opacity ${ops[0]} for the last ${ser.length} frames`);
      if (ser.every((c) => /pz-leave/.test(c.cls))) add('stuck-mid', N - 10, N - 1, `the ${name} card is still in pz-leave at the end`);
      if (!/pz-hide|pz-leave/.test(cls) && ops.every((o) => o === 0) && expect[name]) add('frozen-zero', N - 10, N - 1, `the ${name} card holds content but sits at opacity 0 at the end`);
    } else if (expect[name] && !ser.some(Boolean) && !tail.some((f) => f.cards.some((c) => c.name === name && c.w > 40))) add('frozen-zero', N - 10, N - 1, `the ${name} card the slide should show is absent at the end`);
  }
  if (last.more.busy) add('stuck-mid', N - 1, N - 1, `the presenter is still changing slide when the window ends (counter ${last.more.n})`);
  if (last.more.load) add('stuck-mid', N - 1, N - 1, 'the loading cover is still up when the window ends');
  // the camera comes to rest: still moving in the last frames of the window, or moving after the hand lifted (a flick, a spring, a refit)
  const camOf = (f) => f.more.ctm || f.more.cam;
  const camMoved = (a, b) => { const p = camOf(a), q = camOf(b); return p && q ? Math.hypot(q[1] - p[1], q[2] - p[2]) + Math.abs(Math.log(q[0] / p[0])) * 400 : 0; };
  if (camRest && N > 6) {
    const m = camMoved(frames[N - 6], frames[N - 1]);
    if (m > 1) add('camera-moving', N - 6, N - 1, `the camera is still moving at the end of the window (${m.toFixed(1)} px over the last 5 frames)`);
  }
  if (restFrom != null) for (let i = restFrom + 1; i < N; i++) { const m = camMoved(frames[i - 1], frames[i]); if (m > 20) add('moves-after-release', i, i, `the view jumped ${m.toFixed(1)} px in one frame after the hand lifted (a spring-back past the limits is eased over several frames; this is a snap)`); }
  // flashes: a visible thing that vanishes and returns within 8 frames
  const series = new Map();   // "kind:key" -> [ [frame, op], ... ]
  frames.forEach((f, i) => {
    for (const c of f.cards) if (['text', 'data', 'panel', 'shade'].includes(c.name)) { const k = `card:${c.name}`; (series.get(k) || series.set(k, []).get(k)).push([i, c.hidden ? 0 : c.op]); }
    for (const l of f.more.labels) (series.get(`label:${l.key}`) || series.set(`label:${l.key}`, []).get(`label:${l.key}`)).push([i, l.op]);
  });
  for (const [k, s] of series) {
    // a label simply absent from a frame (op < 0.02 is not recorded) counts as 0: fill from the frame numbers
    const byFrame = new Map(s); const ops = Array.from({ length: N }, (_, i) => byFrame.get(i) ?? 0);
    for (let i = 1; i < N - 1; i++) {
      if (ops[i - 1] < 0.9) continue;
      let j = i; while (j < N && ops[j] <= 0.3) j++;
      if (j > i && j < N && j - i <= 8 && ops[j] >= 0.9 && ops[i] <= 0.3) { add('flash', i, j - 1, `${k} 1 -> ${ops[i]} for ${j - i} frame(s) -> ${ops[j]}`); i = j; }
    }
  }
  // labels against their anchors. A label may trail its anchor by a frame in a pipelined renderer, so one frame of lag is not a finding:
  // a label that stands still against its moving anchor (under 40% of its move) for two frames running is.
  const isMoving = (a, b) => camMoved(a, b) > 0.01;
  const lagRun = new Map();
  for (let i = 1; i < N; i++) {
    const a = frames[i - 1], b = frames[i], prev = new Map(a.more.labels.map((l) => [l.key, l]));
    for (const l of b.more.labels) {
      const p = prev.get(l.key); if (!p || p.op < 0.5 || l.op < 0.5 || l.ax == null || p.ax == null) continue;
      const dl = Math.hypot(l.x - p.x, l.y - p.y), da = Math.hypot(l.ax - p.ax, l.ay - p.ay);
      const lag = Math.hypot(l.x - p.x - (l.ax - p.ax), l.y - p.y - (l.ay - p.ay));
      const bad = lag > 14 && isMoving(a, b) && dl < 0.4 * da;
      const r = lagRun.get(l.key);
      if (bad) { if (r && r.last === i - 1) { r.last = i; r.n++; r.da += da; r.dl += dl; if (r.n === 2) add('label-detached', r.first, i, `"${l.key}" does not keep up with its anchor (moved ${r.dl.toFixed(1)} px while the anchor moved ${r.da.toFixed(1)} px over ${r.n} frames)`); else if (r.n > 2) add('label-detached', r.first, i, `"${l.key}" does not keep up with its anchor (moved ${r.dl.toFixed(1)} px while the anchor moved ${r.da.toFixed(1)} px over ${r.n} frames)`); } else lagRun.set(l.key, { first: i, last: i, n: 1, da, dl }); }
      const far = Math.hypot(l.x - l.ax, l.y - l.ay), lim = Math.max(280, 0.36 * Math.min(b.more.vw, 1400));
      if (far > lim) add('label-detached', i, i, `"${l.key}" sits ${far.toFixed(0)} px from its anchor (limit ${lim.toFixed(0)})`);
    }
  }
  // What the GPU labels drew against what the layout (the page's label model) says is on screen. A label model entry (a visible `.lb`) must have
  // a drawn box at its spot; a drawn box nothing in the model explains is a label left behind. Only judged when the GPU labels are drawing.
  const near = (cx, cy, boxes, ox, oy) => { let d = 1e9; for (const b of boxes) d = Math.min(d, Math.hypot((b[0] + b[2]) / 2 + ox - cx, (b[1] + b[3]) / 2 + oy - cy)); return d; };
  const drawing = frames.some((f) => f.more.drawn && f.more.drawn.length > 3);
  if (drawing) {
    const missRun = new Map();
    for (let i = 0; i < N; i++) {
      const f = frames[i], d = f.more.drawn || [], ox = f.more.wr ? f.more.wr[0] : 0, oy = f.more.wr ? f.more.wr[1] : 0;
      for (const l of f.more.labels) {
        if (l.op < 0.9 || !l.key.startsWith('n:') || l.glNot) continue;
        const dist = d.length ? near(l.x, l.y, d, ox, oy) : 1e9;
        const r = missRun.get(l.key);
        if (dist > 40) { if (r && r.last === i - 1) { r.last = i; r.n++; r.worst = Math.max(r.worst, dist); } else missRun.set(l.key, { first: i, last: i, n: 1, worst: dist }); }
        else if (r) { if (r.n >= 3) add('label-stale', r.first, r.last, `"${l.key}" is laid out at ${Math.round(l.x)},${Math.round(l.y)} but the GPU drew nothing within 40 px of it for ${r.n} frames (up to ${Math.round(r.worst)} px away)`); missRun.delete(l.key); }
      }
      for (const [k, r] of [...missRun]) if (r.last < i && r.n >= 3) { add('label-stale', r.first, r.last, `"${k}" is laid out where the GPU drew nothing for ${r.n} frames (up to ${Math.round(r.worst)} px away)`); missRun.delete(k); }
    }
    for (const [k, r] of missRun) if (r.n >= 3) add('label-stale', r.first, r.last, `"${k}" is laid out where the GPU drew nothing for ${r.n} frames (up to ${Math.round(r.worst)} px away)`);
    // left behind: at the end of the window, drawn boxes no laid-out label or mark explains (a label of a view that has gone, or of a slide that has gone)
    const end = frames[N - 1], ox = end.more.wr ? end.more.wr[0] : 0, oy = end.more.wr ? end.more.wr[1] : 0;
    const spots = end.more.labels.map((l) => [l.x, l.y]);
    const orphans = (end.more.drawn || []).filter((b) => { const cx = (b[0] + b[2]) / 2 + ox, cy = (b[1] + b[3]) / 2 + oy; return !spots.some(([x, y]) => Math.hypot(x - cx, y - cy) < 40); });
    const first = frames[0], base = (first.more.drawn || []).filter((b) => { const cx = (b[0] + b[2]) / 2 + ox, cy = (b[1] + b[3]) / 2 + oy; return !first.more.labels.some((l) => Math.hypot(l.x - cx, l.y - cy) < 40); }).length;
    if (orphans.length > base + 2 && N > 10) add('label-lingers', N - 1, N - 1, `${orphans.length} drawn label box(es) at the end of the window have no laid-out label (${base} at the start): ${orphans.slice(0, 3).map((b) => `${b[0]},${b[1]}-${b[2]},${b[3]}`).join(' ')}`);
  }
  // text width: a number or word changes width while its card holds still
  const byId = new Map();
  frames.forEach((f, i) => { for (const n of f.more.nums) (byId.get(n.id) || byId.set(n.id, []).get(n.id)).push([i, n]); });
  for (const [, s] of byId) {
    for (let k = 1; k < s.length; k++) {
      const [i0, a] = s[k - 1], [i1, b] = s[k];
      if (i1 !== i0 + 1 || a.op < 0.9 || b.op < 0.9) continue;
      if (Math.abs(b.w - a.w) >= 1 && Math.abs(b.cw - a.cw) < 0.5) add('width-jump', i1, i1, `"${a.t}" -> "${b.t}" ${a.w} -> ${b.w} px wide while its card held ${b.cw} px`);
    }
  }
  // pixels (--gl)
  const lum = frames.map((f) => f.px).filter(Boolean);
  if (lum.length) {
    const sorted = lum.map((p) => p.lum).sort((x, y) => x - y), med = sorted[sorted.length >> 1];
    frames.forEach((f, i) => {
      if (!f.px) return;
      if (f.px.dark > 0.85 && med > 40) add('black', i, i, `${(f.px.dark * 100).toFixed(0)}% of the frame is black (typical brightness ${med})`);
      else if (Math.abs(f.px.lum - med) > 60 && i > 0 && i < N - 1) add('blank', i, i, `brightness ${f.px.lum} against a typical ${med}`);
    });
  }
  // merge consecutive hits of the same rule and subject
  out.sort((x, y) => x.rule.localeCompare(y.rule) || x.from - y.from);
  const merged = [];
  for (const a of out) {
    const head = a.detail.split(/\s[0-9-]/)[0];
    const m = merged.find((q) => q.rule === a.rule && q.head === head && a.from <= q.to + 1);
    if (m) { m.to = Math.max(m.to, a.to); m.n++; } else merged.push({ ...a, head, n: 1 });
  }
  return merged.map(({ head, ...r }) => r).sort((x, y) => x.from - y.from);
}

// ---- scenarios --------------------------------------------------------------------------------------------------------------

const findings = [];
const fail = (unit, f, frames, fps) => findings.push({ unit, rule: f.rule, from: f.from, to: f.to, ms: [Math.round(frames[f.from]?.t ?? 0), Math.round(frames[f.to]?.t ?? 0)], n: f.n, detail: f.detail });

/** One deck at one size: every slide Next (forward), then Back down to the first. */
async function deckUnit(browser, url, deck, size, o) {
  const unit = `${deck.id}@${size}`;
  const app = await openPage(browser, `${url}?script=${deck.id}&slide=1`, { size, gl: o.gl, dpr: o.dpr });
  const { page } = app;
  const S = stepper(page, o);
  const dump = { unit, passes: [] };
  try {
    const up = await S.until(() => document.querySelector('#app')?.classList.contains('presenting') && !!window.pps?.presenter, null, 60000);
    if (up >= 0) await S.install();
    const settled = up >= 0 ? await S.until(SETTLED, 1, 60000) : -1;
    if (up < 0 || settled < 0) { findings.push({ unit, rule: 'error', from: 0, to: 0, ms: [0, 0], n: 1, detail: up < 0 ? 'the deck never opened in 60 s of clock time' : `slide 1 never settled in 60 s of clock time (${await page.evaluate(WHY)})` }); return; }
    if (!flag('svg')) await assertGpuLive(page, unit, { vessels: o.gl });
    const n = deck.slides.length, order = [];
    for (let i = 1; i < n; i++) order.push({ to: i, key: 'ArrowRight', dir: 'next' });
    for (let i = n - 2; i >= 0; i--) order.push({ to: i, key: 'ArrowLeft', dir: 'back' });
    const picks = o.slides ? order.filter((s) => o.slides.includes(s.to + 1)) : order;
    for (const step of picks) {
      const where = `${unit} ${step.dir} -> ${step.to + 1}/${n}`;
      // reach the slide before this one if it is not where we are (a pick that skips): coarse, unrecorded
      const here = await page.evaluate(() => Number((document.querySelector('.pzb-n')?.getAttribute('aria-label') || '').match(/Slide (\d+)/)?.[1]));
      const from = step.dir === 'next' ? step.to : step.to + 2;
      if (process.env.GS_LOG) console.log(`\n  ${where}: on ${here}, want ${from}`);
      if (here !== from) {
        await page.evaluate((k) => window.pps.presenter.go(k), from - 1);
        const took = await S.until(SETTLED, from, 40000); if (process.env.GS_LOG) console.log(`  reach took ${took}`); if (took < 0) { if (process.env.GS_LOG) console.log(await page.evaluate(() => { const r = document.querySelector('.pz'); return `busy=${window.pps.presenter.busy()} n=${document.querySelector('.pzb-n')?.textContent} root=${r?.className} case=${!!document.querySelector('.pz-case.on')}`; })); findings.push({ unit: where, rule: 'error', from: 0, to: 0, ms: [0, 0], n: 1, detail: `could not reach slide ${from} first` }); continue; }
      }
      const e0 = app.errors.length, tA = Date.now();
      await page.keyboard.press(step.key);
      if (process.env.GS_LOG) console.log(`\n  key pressed after ${Date.now() - tA} ms; prof ${JSON.stringify(S.prof)}`);
      await page.evaluate(() => window.__fs.hold());
      if (process.env.GS_LOG) console.log(`\n  held after ${Date.now() - tA} ms`);
      const lapseMs = deck.slides[step.to].lapse?.seconds ? deck.slides[step.to].lapse.seconds * 1000 + 1500 : 0;
      const frames = await film(page, S, Math.ceil(Math.max(o.ms, lapseMs) / S.dt), { ...o, tag: `${deck.id}-${size}-${step.dir}${step.to + 1}`, shotDir: o.shotDir });
      // the change may outlast the window (a time-lapse): coarse until it ends, then a short tail recorded again
      if (frames.at(-1).more.busy) { await S.until(SETTLED, step.to + 1, 40000); const tailF = await film(page, S, Math.ceil(600 / S.dt), { ...o, tag: `${deck.id}-${size}-${step.dir}${step.to + 1}t`, shotDir: o.shotDir }); frames.push(...tailF.map((f, k) => ({ ...f, t: frames.at(-1).t + (k + 1) * S.dt }))); }
      if (process.env.GS_LOG) console.log(`\n  ${where}: ${frames.length} frames in ${Date.now() - tA} ms real, busy at end ${frames.at(-1).more.busy}; run ${S.prof.run} hold ${S.prof.hold} rec ${S.prof.rec}`);
      // a camera glide longer than the window is followed (up to 4 s more) so only a camera that never comes to rest is flagged
      for (let k = 0; k < 4; k++) {
        const n = frames.length, cm = frames[n - 1].more.cam, c0 = frames[Math.max(0, n - 6)].more.cam;
        if (!cm || !c0 || Math.hypot(cm[1] - c0[1], cm[2] - c0[2]) + Math.abs(Math.log(cm[0] / c0[0])) * 400 <= 1) break;
        const more = await film(page, S, Math.ceil(1000 / S.dt), { ...o, gl: false, tag: '', events: [] });
        frames.push(...more.slice(1).map((f, j) => ({ ...f, t: frames.at(-1).t + (j + 1) * S.dt })));
      }
      const s = deck.slides[step.to];
      const exp = { text: !!s.title && !s.visual, data: !!s.tool && !s.visual };
      for (const f of judge(frames, { expect: exp, glass: o.gl })) fail(where, f, frames, o.fps);
      for (const e of app.errors.slice(e0)) findings.push({ unit: where, rule: 'error', from: 0, to: frames.length - 1, ms: [0, Math.round(frames.at(-1).t)], n: 1, detail: e });
      if (o.keep) dump.passes.push({ where, frames });
      process.stdout.write('.');
    }
    if (!flag('svg')) await assertGpuLive(page, `${unit} (end of the run)`, { vessels: o.gl });
  } catch (e) { findings.push({ unit, rule: 'error', from: 0, to: 0, ms: [0, 0], n: 1, detail: `the unit broke: ${String(e.stack || e).split('\n').slice(0, 2).join(' | ')}` }); }
  finally { if (o.keep) { mkdirSync(o.out, { recursive: true }); writeFileSync(join(o.out, `${unit}.json`), JSON.stringify(dump)); } await app.close(); console.log(` ${unit}`); }
}

/** The main app (no deck) at one size: view switches (including a switch reversed half way), then pan and pinch. */
async function scenarioUnit(browser, url, name, size, o) {
  const unit = `${name}@${size}`;
  const app = await openPage(browser, `${url}?preset=cirr-decomp`, { size, gl: o.gl, dpr: o.dpr });
  const { page } = app;
  const S = stepper(page, o);
  const dump = { unit, passes: [] };
  const run = async (what, frames, opts = {}) => {
    const e0 = app.errors.length;
    const fr = await film(page, S, frames, { ...o, tag: `${name}-${size}-${what}`, shotDir: o.shotDir, events: opts.events });
    for (const f of judge(fr, { glass: o.gl, ...opts.judge })) fail(`${unit} ${what}`, f, fr, o.fps);
    for (const e of app.errors.slice(e0)) findings.push({ unit: `${unit} ${what}`, rule: 'error', from: 0, to: fr.length - 1, ms: [0, Math.round(fr.at(-1).t)], n: 1, detail: e });
    if (o.keep) dump.passes.push({ where: `${unit} ${what}`, frames: fr });
    process.stdout.write('.');
    return fr;
  };
  const fr = (ms) => Math.ceil(ms / S.dt);
  const view = (v) => () => page.evaluate((v) => document.querySelector(`#viewSeg [data-view="${v}"]`)?.click(), v);
  try {
    if ((await S.until(() => !!window.pps?.store?.get().frame && !document.documentElement.dataset.boot, null, 90000)) < 0) { findings.push({ unit, rule: 'error', from: 0, to: 0, ms: [0, 0], n: 1, detail: 'the figure never came up' }); return; }
    await S.install();
    for (let t = 0; t < 4000; t += 100) { await S.advance(100); await sleep(30); }
    if (!flag('svg')) await assertGpuLive(page, unit, { vessels: o.gl });
    if (process.env.GS_DEBUG) { await run('probe-circuit', 20, { events: [[1, view('circuit')]] }); for (let t = 0; t < 6000; t += 100) { await S.advance(100); await sleep(30); } console.log(await page.evaluate(() => { const st = window.pps.stage; return JSON.stringify({ drawn: st.labelDrawn()?.length ?? null, gl: document.querySelectorAll('.lb[data-gl]').length, lbs: document.querySelectorAll('#labels .lb').length, off: document.querySelectorAll('#labels .lb.lb-off').length, stats: st.labelStats?.(), v: { ...document.querySelector('.stage-view').dataset }, tg: !!document.querySelector('canvas[data-test-gl]'), lg: !!document.querySelector('#labelGl'), cls: document.querySelector('#labelGl')?.className }); })); return; }
    if (name === 'views') {
      await run('anatomy-to-circuit', fr(2500), { events: [[1, view('circuit')]] });
      await run('circuit-to-anatomy', fr(2500), { events: [[1, view('anatomic')]] });
      await run('circuit-reversed-twice', fr(3000), { events: [[1, view('circuit')], [fr(300), view('anatomic')], [fr(600), view('circuit')]] });
      await run('circuit-to-anatomy-settle', fr(2500), { events: [[1, view('anatomic')]] });
      await run('anatomy-to-lobule', fr(3500), { events: [[1, view('lobule')]] });
      await run('lobule-to-anatomy', fr(3500), { events: [[1, view('anatomic')]] });
      await run('lobule-reversed', fr(4000), { events: [[1, view('lobule')], [fr(500), view('anatomic')], [fr(1200), view('lobule')]] });
      await run('lobule-to-circuit', fr(3500), { events: [[1, view('circuit')]] });
    } else if (name === 'circuit') {
      // the Circuit view: pinch and pan on it (the labels must ride the figure), then back to Anatomy (the Circuit's labels must go)
      await run('anatomy-to-circuit', fr(3000), { events: [[1, view('circuit')]] });
      const box = await page.locator('.stage-view').boundingBox();
      const c = [box.x + box.width * 0.4, box.y + box.height * 0.4];
      const isTouch = !!SIZES[size].hasTouch, cdp = isTouch ? await page.context().newCDPSession(page) : null;
      const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
      const steps = 10, pinch = [[0, () => (isTouch ? tp('touchStart', [[c[0] - 30, c[1]], [c[0] + 30, c[1]]]) : (page.mouse.move(c[0], c[1]), page.keyboard.down('Control')))]];
      for (let k = 1; k <= steps; k++) pinch.push([k, () => (isTouch ? tp('touchMove', [[c[0] - (30 + k * 2.5), c[1]], [c[0] + (30 + k * 2.5), c[1]]]) : page.mouse.wheel(0, -12))]);
      pinch.push([steps + 1, () => (isTouch ? tp('touchEnd', []) : page.keyboard.up('Control'))]);
      await run('circuit-pinch', fr(2500), { events: pinch, judge: { restFrom: steps + 1 } });
      await run('circuit-to-anatomy', fr(3500), { events: [[1, view('anatomic')]] });
    } else if (name === 'gestures') {
      const box = await page.locator('.stage-view').boundingBox();
      const c = [box.x + box.width * 0.35, box.y + box.height * 0.4];
      const touch = o.cdp ? null : null;
      void touch;
      const isTouch = !!SIZES[size].hasTouch;
      const cdp = isTouch ? await page.context().newCDPSession(page) : null;
      const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
      const steps = 12;
      const pinch = [[0, () => (isTouch ? tp('touchStart', [[c[0] - 30, c[1]], [c[0] + 30, c[1]]]) : (page.mouse.move(c[0], c[1]), page.keyboard.down('Control')))]];
      for (let k = 1; k <= steps; k++) pinch.push([k, () => (isTouch ? tp('touchMove', [[c[0] - (30 + k * 3), c[1]], [c[0] + (30 + k * 3), c[1]]]) : page.mouse.wheel(0, -30))]);
      pinch.push([steps + 1, () => (isTouch ? tp('touchEnd', []) : page.keyboard.up('Control'))]);
      await run('pinch-out', 40, { events: pinch, judge: { restFrom: steps + 1 } });
      const back = [[0, () => (isTouch ? tp('touchStart', [[c[0] - 66, c[1]], [c[0] + 66, c[1]]]) : (page.mouse.move(c[0], c[1]), page.keyboard.down('Control')))]];
      for (let k = 1; k <= steps; k++) back.push([k, () => (isTouch ? tp('touchMove', [[c[0] - (66 - k * 3), c[1]], [c[0] + (66 - k * 3), c[1]]]) : page.mouse.wheel(0, 30))]);
      back.push([steps + 1, () => (isTouch ? tp('touchEnd', []) : page.keyboard.up('Control'))]);
      await run('pinch-in', 40, { events: back, judge: { restFrom: steps + 1 } });
      const p = [box.x + box.width * 0.55, box.y + box.height * 0.45];
      const pan = [[0, () => (isTouch ? tp('touchStart', [p]) : (page.mouse.move(p[0], p[1]), page.mouse.down()))]];
      for (let k = 1; k <= steps; k++) pan.push([k, () => (isTouch ? tp('touchMove', [[p[0] - k * 9, p[1] + k * 6]]) : page.mouse.move(p[0] - k * 9, p[1] + k * 6))]);
      pan.push([steps + 1, () => (isTouch ? tp('touchEnd', []) : page.mouse.up())]);
      await run('pan', 40, { events: pan, judge: { restFrom: steps + 1 } });
      // a view switch while the camera is still settling from a gesture
      await run('pinch-then-circuit', 60, { events: [...pinch.slice(0, 6), [fr(500), view('circuit')]], judge: { restFrom: null } });
    }
    if (!flag('svg')) await assertGpuLive(page, `${unit} (end of the run)`, { vessels: o.gl });
  } catch (e) { findings.push({ unit, rule: 'error', from: 0, to: 0, ms: [0, 0], n: 1, detail: `the unit broke: ${String(e.stack || e).split('\n').slice(0, 2).join(' | ')}` }); }
  finally { if (o.keep) { mkdirSync(o.out, { recursive: true }); writeFileSync(join(o.out, `${unit}.json`), JSON.stringify(dump)); } await app.close(); console.log(` ${unit}`); }
}

async function main() {
  const { DECKS, withOverview } = await import(new URL('../src/ui/decks.js', import.meta.url));
  const only = opt('decks', '').split(',').filter(Boolean);
  const decks = DECKS.filter((d) => (flag('full') && !only.length) || only.includes(d.id)).map((d) => ({ id: d.id, slides: withOverview(d).slides }));
  const sizes = opt('sizes', 'desktop,phone,sideways').split(',');
  const o = { dpr: +opt('dpr', 1), anim: opt('anim', 'before'), fps: +opt('fps', 30), ms: +opt('ms', 2000), pace: +opt('pace', 8), gl: flag('gl'), shotEvery: +opt('shots', 0), shotDir: opt('shot-dir', ''), out: resolve(opt('out', join(ROOT, 'test-results/glitch-sweep'))), keep: !flag('no-json'), slides: opt('slides', '') ? opt('slides', '').split(',').map(Number) : null };
  const [shard, shards] = opt('shard', '1/1').split('/').map(Number);
  const jobs = Math.max(1, +opt('jobs', Math.min(3, cpus().length)));
  const scen = opt('scenarios', '').split(',').filter(Boolean);
  const units = [...decks.flatMap((d) => sizes.map((s) => ({ d, s }))), ...scen.flatMap((n) => sizes.map((s) => ({ n, s })))].filter((_, k) => k % shards === shard - 1);
  const server = await serve(ROOT);
  const browser = await chromium.launch({ args: flag('svg') ? ['--no-sandbox', '--disable-3d-apis'] : CHROMIUM_ARGS, ...(EXE ? { executablePath: EXE } : {}) });
  const q = [...units];
  const t0 = Date.now();
  try { await Promise.all(Array.from({ length: Math.min(jobs, q.length) }, async () => { for (let u = q.shift(); u; u = q.shift()) await (u.n ? scenarioUnit(browser, server.url, u.n, u.s, o) : deckUnit(browser, server.url, u.d, u.s, o)); })); }
  finally { await browser.close(); server.close(); }
  mkdirSync(o.out, { recursive: true });
  writeFileSync(join(o.out, 'findings.json'), JSON.stringify(findings, null, 1));
  const by = {};
  for (const f of findings) (by[f.rule] ||= []).push(f);
  console.log(`\n${findings.length} finding(s) in ${Math.round((Date.now() - t0) / 1000)} s over ${units.length} unit(s)`);
  for (const [r, l] of Object.entries(by)) { console.log(`\n== ${r} (${l.length})`); for (const f of l.slice(0, +opt('show', 40))) console.log(`  ${f.unit} frames ${f.from}-${f.to} (${f.ms[0]}-${f.ms[1]} ms, x${f.n}): ${f.detail}`); }
  process.exit(findings.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
