// The device lap (?lap): a fixed route of about 90 seconds that the page drives on its own device and writes up as one block of text to paste
// back (recs P2, 13 Nov 2026). Mohammad's iPhone, iPad and Mac are the only real GPUs; every other check runs on software WebGL. Today a
// device test arrives as "it glitches when I do X"; a lap arrives as the frame, the surface and the phase, for every step of the same route.
//
// It reads and drives only what the app already has: the scheduler's frame watcher (frame.js watchFrames: each frame's interval, script
// time and the surfaces that ran in it), the counts of the heavy passes (frame-counts.js), the callbacks and draws per surface
// (perf().totals), what was caught (caught.js), what the presenter degraded, and the slowest inputs. Nothing is drawn by the lap itself.
// Battery temperature is not exposed to a web page, so heat is read from the frame rate and the work done at rest, start against end.
//
// Loaded only when the address has ?lap (main.js); without it this file is never fetched. The route changes the patient, the view and
// opens a talk; it puts the patient and the view back when it ends. The panel is written at a step's edge only, never inside a frame.
import { perf, watchFrames } from './frame.js';
import { counts } from './frame-counts.js';
import { createFrameRecorder, LONG_FRAME_MS } from './frame-stats.js';
import { caughtNow } from './caught.js';
import { surfaceLine, longFramesText, inputsText } from './perf-text.js';
import { contextText } from './gl-contexts.js';
import { sceneTier, tierLog } from './adapt-tier.js';
import { store, setViewKey } from './store.js';
import { RELEASE } from '../version.js';
import { currentLook } from './looks.js';
import { heldGL } from './gl-state.js';

/** The route: name, what it does (sync or async; a failure is written down and the lap goes on), and how long to hold still after it (ms). */
export const HOLD = { rest: 8000, view: 5000, patient: 6000, card: 5000, slide: 5000, tail: 3000 };

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
const pad = (s, n) => String(s).padEnd(n);
const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—');

/** The counts that move when the page works (read at a step's two edges): the vessel layer's draws, picture composites, whole composites,
 *  shared glass blurs, whole-canvas presents, and the scheduler's callbacks and real draws per surface. */
export function readCounts() {
  const t = perf().totals;
  return { draw: counts.draw, composite: counts.composite, whole: counts.whole, blur: counts.blur, present: sum(counts.present), asks: { ...t.asks }, drawn: { ...t.drawn }, frames: t.frames };
}

/** One step's numbers from its two edges and the frames recorded between them. Pure (the tests feed it). */
export function measureStep(name, t0, t1, a, b, rec) {
  const secs = Math.max(0.001, (t1 - t0) / 1000);
  const r = rec.snapshot(), gaps = r.gap, scripts = r.script;
  const frames = b.frames - a.frames;
  const per = (k) => (b[k] - a[k]) / secs;
  return {
    name, secs, frames, fps: frames / secs,
    gapP50: gaps.p50, gapP95: gaps.p95, gapMax: gaps.max, scriptP95: scripts.p95, scriptMax: scripts.max,
    long: rec.long.length, longList: rec.long.slice(),
    vesselDraws: per('draw'), composites: per('composite'), wholes: per('whole'), blurs: per('blur'), presents: per('present'),
    surfaces: surfaceLine({ asks: a.asks, drawn: a.drawn }, { asks: b.asks, drawn: b.drawn }),
  };
}

const stepRow = (s) => `${pad(s.name, 26)}${pad(f1(s.secs), 6)}${pad(s.frames, 7)}${pad(f1(s.fps), 6)}${pad(f1(s.gapP95), 8)}${pad(f1(s.gapMax), 8)}${pad(f1(s.scriptP95), 8)}${pad(s.long, 6)}${pad(f1(s.composites), 6)}${pad(f1(s.presents), 6)}${f1(s.vesselDraws)}`;
const HEAD = `${pad('step', 26)}${pad('secs', 6)}${pad('frames', 7)}${pad('fps', 6)}${pad('p95 ms', 8)}${pad('max ms', 8)}${pad('js p95', 8)}${pad('>50ms', 6)}${pad('comp/s', 6)}${pad('pres/s', 6)}vessel draws/s`;

/** How the lap reads on heat: the two rest steps (before and after everything else) set side by side, and the frame rate of the first third
 *  of the route against the last third. A rate that falls, or work at rest that grows, is a device getting hot or a page that keeps what it made. */
export function heatLines(steps) {
  const rests = steps.filter((s) => /^rest/.test(s.name));
  const out = [];
  if (rests.length >= 2) {
    const a = rests[0], z = rests.at(-1);
    out.push(`Rest, start against end (nothing touched, ${f1(a.secs)} s and ${f1(z.secs)} s): frames/s ${f1(a.fps)} then ${f1(z.fps)}; compositions/s ${f1(a.composites)} then ${f1(z.composites)}; whole-canvas presents/s ${f1(a.presents)} then ${f1(z.presents)}; vessel-layer draws/s ${f1(a.vesselDraws)} then ${f1(z.vesselDraws)}.`);
    if (a.surfaces) out.push(`Rest at the start ${a.surfaces.trim()}`);
    if (z.surfaces) out.push(`Rest at the end ${z.surfaces.trim()}`);
  }
  const moving = steps.filter((s) => !/^rest/.test(s.name) && s.secs > 2 && s.fps > 0);
  if (moving.length >= 6) {
    const third = Math.floor(moving.length / 3);
    const avg = (l) => l.reduce((n, s) => n + s.p95Fps, 0) / l.length;
    const withFps = moving.map((s) => ({ ...s, p95Fps: s.gapP95 > 0 ? 1000 / s.gapP95 : s.fps }));
    const first = avg(withFps.slice(0, third)), last = avg(withFps.slice(-third));
    out.push(`Frame rate at its p95 interval, first third of the route ${f1(first)} fps, last third ${f1(last)} fps${last < first * 0.85 ? ' (it fell by more than a seventh: heat, or a page that slowed as it went)' : ''}.`);
  }
  return out;
}

/** The refresh the page was offered: the fastest median interval of any step (a step that moves runs at the screen's rate), taken to the nearest rate screens run at. */
export function refreshFrom(steps) {
  const p50 = steps.map((s) => s.gapP50).filter((v) => v > 2 && v < 100);
  if (!p50.length) return 0;
  const hz = 1000 / Math.min(...p50);
  return [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240].reduce((best, r) => (Math.abs(r - hz) < Math.abs(best - hz) ? r : best));
}

/** The whole report. `info` is the device's own facts (see deviceInfo); `steps` the measured steps; `ex` the extras read at the end. Pure. */
export function lapText({ info, steps, ex, done, wanted, secs }) {
  const lines = [];
  lines.push(`Device lap · ${info.release}${info.preview ? ` · ${info.preview}` : ''} · ${info.when}`);
  lines.push(info.ua);
  lines.push(`screen ${info.screen} @${info.dpr}x, refresh offered to the page ${info.hz || '?'} Hz, renderer ${info.renderer}, ${info.look}; ${info.mode}`);
  lines.push(`${done} of ${wanted} steps ran in ${f1(secs)} s${done < wanted ? ' (the lap was stopped early)' : ''}.`);
  lines.push('');
  lines.push(HEAD);
  for (const s of steps) lines.push(stepRow(s));
  lines.push('');
  lines.push(...heatLines(steps));
  const failed = steps.filter((s) => s.failed);
  if (failed.length) { lines.push(''); lines.push(`Steps that failed: ${failed.map((s) => `${s.name} (${s.failed})`).join('; ')}`); }
  lines.push('');
  const slow = steps.filter((s) => s.long).sort((a, b) => b.long - a.long);
  lines.push(slow.length ? `Frames over ${LONG_FRAME_MS} ms by step: ${slow.map((s) => `${s.name} ${s.long}`).join(', ')}` : `No frame over ${LONG_FRAME_MS} ms in the lap.`);
  if (ex.longFrames) lines.push(ex.longFrames);
  if (ex.inputs) lines.push(ex.inputs);
  lines.push('');
  const c = Object.entries(ex.caught || {});
  lines.push(c.length ? `Caught by the app (${c.length}): ${c.map(([k, v]) => `${k} ×${v.n} "${String(v.last).slice(0, 90)}"`).join('; ')}` : 'Caught by the app: nothing.');
  lines.push(ex.degraded ? `Slides shown unprepared (presenter degraded): ${ex.degraded.n}${ex.degraded.last ? `, last "${ex.degraded.last}"` : ''}.` : 'Slides shown unprepared: not read (no talk ran).');
  lines.push(ex.contexts);
  lines.push(ex.tier);
  return lines.join('\n');
}

/** The device's own facts. */
export function deviceInfo() {
  // (The renderer is asked of a context the page already holds: the lap makes none of its own.)
  let renderer = '?';
  try {
    const gl = heldGL(), ri = gl?.getExtension('WEBGL_debug_renderer_info');
    renderer = gl ? String(gl.getParameter(ri ? ri.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'no WebGL2 context held';
  } catch { /* a device that will not say */ }
  const root = document.documentElement;
  const badge = document.getElementById('preview-badge');
  return {
    release: RELEASE, preview: badge ? badge.textContent.trim().replace(/\s+/g, ' ') : '', when: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio, hz: 0, renderer,
    look: `renderer ${root.dataset.renderer || '?'}, quality ${root.dataset.quality ?? '?'}, look ${currentLook()}`,
    mode: `mode ${store.get().mode}, view ${store.get().lobule ? 'lobule' : store.get().view}, patient ${store.get().presetId || '?'}`,
  };
}

/**
 * Runs `steps` one after another: each is { name, run(), hold }. Before a step the counts are read, the frame recorder is cut, `run` is
 * awaited (a failure is written on the step, not thrown), then the page is held for `hold` ms; after it the step is measured. `sleep`,
 * `now`, `read` and `newRecorder` are the world (the tests give their own). Returns the measured steps. `onStep(name, i, n)` is told as each begins.
 */
export async function runSteps(steps, { sleep, now, read = readCounts, newRecorder = () => createFrameRecorder({ keepLong: 8 }), watch = watchFrames, onStep = () => {}, stopped = () => false }) {
  let rec = newRecorder();
  const off = watch((f) => rec.add(f));
  const out = [];
  try {
    for (let i = 0; i < steps.length; i++) {
      if (stopped()) break;
      const st = steps[i];
      onStep(st.name, i, steps.length);
      rec = newRecorder();
      const t0 = now(), a = read();
      let failed = '';
      try { await st.run?.(); } catch (e) { failed = String(e?.message || e).slice(0, 80); }
      await sleep(st.hold);
      const t1 = now(), b = read();
      const m = measureStep(st.name, t0, t1, a, b, rec);
      if (failed) m.failed = failed;
      out.push(m);
    }
  } finally { off(); }
  return out;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} took over ${ms / 1000} s`)), ms))]);

/** The route, built against the live app (window.pps). `back` is what to put back at the end. */
export function buildRoute(pps, back) {
  const tests = () => document.getElementById('tabInstruments')?.click();
  const testsOpen = () => document.getElementById('app')?.classList.contains('dock-open');
  const slides = [0, 1, 2, 3, 4, 5];
  return [
    { name: 'rest, start', hold: HOLD.rest },
    { name: 'Anatomy to Circuit', run: () => setViewKey('circuit'), hold: HOLD.view },
    { name: 'Circuit to Anatomy', run: () => setViewKey('anatomy'), hold: HOLD.view },
    { name: 'Anatomy to Lobule', run: () => setViewKey('lobule'), hold: HOLD.view },
    { name: 'Lobule to Anatomy', run: () => setViewKey('anatomy'), hold: HOLD.tail },
    { name: 'patient change', run: () => timeout(pps.loadPreset('cirr-decomp'), 15000, 'the patient'), hold: HOLD.patient },
    { name: 'Tests open', run: () => { if (!testsOpen()) tests(); }, hold: HOLD.card },
    { name: 'Tests closed', run: () => { if (testsOpen()) tests(); }, hold: HOLD.tail },
    { name: 'talk: slide 1', run: () => timeout(pps.presenter.start('circuit', 0), 20000, 'the talk'), hold: HOLD.slide + 1000 },
    ...slides.slice(1).map((i) => ({ name: `talk: slide ${i + 1}`, run: () => pps.presenter.go(i), hold: HOLD.slide })),
    { name: 'talk closed', run: () => pps.presenter.stop(), hold: HOLD.tail },
    { name: 'put back', run: () => back(), hold: 2000 },
    { name: 'rest, end', hold: HOLD.rest - 2000 },
  ];
}

// ── the panel ──────────────────────────────────────────────────────────────────────────────────────
const CSS = 'position:fixed;left:max(8px, env(safe-area-inset-left));right:max(8px, env(safe-area-inset-right));top:calc(56px + env(safe-area-inset-top));z-index:var(--z-diag);max-width:560px;max-height:60vh;overflow:auto;padding:10px 12px;border-radius:12px;background:rgb(24 24 28 / .94);color:#fff;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;';   // colour-exempt: a measuring aid, as the ?perf readout
const BTN = 'font:inherit;color:#fff;background:rgb(255 255 255 / .16);border:0;border-radius:8px;padding:8px 12px;min-height:36px;margin:6px 8px 0 0;';   // colour-exempt: a measuring aid

export function startLap() {
  const pps = window.pps;
  const el = document.createElement('div');
  el.id = 'lapPanel';
  el.dataset.perfIgnore = '';
  el.style.cssText = CSS;
  const head = document.createElement('div');
  const out = document.createElement('pre');
  out.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:8px 0 0;font:inherit;user-select:text';
  const bar = document.createElement('div');
  const go = document.createElement('button'), copy = document.createElement('button'), stop = document.createElement('button');
  go.style.cssText = copy.style.cssText = stop.style.cssText = BTN;
  go.textContent = 'Start the lap'; copy.textContent = 'Copy'; stop.textContent = 'Stop';
  copy.hidden = stop.hidden = true;
  head.textContent = 'Device lap: about 90 seconds. Put the device down and leave it alone once you tap Start. It changes the patient and view and opens a talk, then puts them back. When it ends, tap Copy and paste the result into the chat.';
  bar.append(go, stop, copy);
  el.append(head, bar, out);
  document.body.append(el);
  let text = '', halt = false, running = false;
  const back = (() => { const st = store.get(); return () => { setViewKey(st.lobule ? 'lobule' : st.view === 'circuit' ? 'circuit' : 'anatomy'); return st.presetId && st.presetId !== 'cirr-decomp' ? timeout(pps.loadPreset(st.presetId), 15000, 'the patient') : null; }; })();
  go.onclick = async () => {
    if (running) return;
    running = true; halt = false; go.hidden = true; copy.hidden = true; stop.hidden = false;
    const info = deviceInfo();
    const route = buildRoute(pps, back);
    const t0 = performance.now();
    let steps = [];
    try {
      steps = await runSteps(route, { sleep: wait, now: () => performance.now(), onStep: (name, i, n) => { head.textContent = `Lap: step ${i + 1} of ${n}, ${name}. Leave the device alone.`; }, stopped: () => halt });
    } catch (e) { out.textContent = `The lap failed: ${e?.message || e}`; }
    info.hz = refreshFrom(steps);
    const pm = pps.perf?.inputToPaint;
    const deg = pps.presenter?.degraded?.() || null;
    // (frameLog: the long frames of the whole lap are listed per step by the counts above; the log of the newest ones is the recorder's, kept per step.)
    const longs = steps.flatMap((s) => s.longList.map((f) => ({ ...f, step: s.name })));
    text = lapText({
      info, steps, done: steps.length, wanted: route.length, secs: (performance.now() - t0) / 1000,
      ex: { longFrames: longs.length ? longFramesText(longs.slice(-12)) : '', inputs: inputsText(pm), caught: caughtNow(), degraded: deg, contexts: contextText(), tier: `Quality tier: ${sceneTier() ? `${Math.round(sceneTier() * 100)}%` : 'Full'}${tierLog().length ? `; ${tierLog().length} change${tierLog().length > 1 ? 's' : ''}, last ${tierLog().at(-1).from}→${tierLog().at(-1).to}: ${tierLog().at(-1).why}` : ''}` },
    });
    out.textContent = text;
    head.textContent = `Lap done in ${((performance.now() - t0) / 1000).toFixed(0)} s. Tap Copy and paste it into the chat.`;
    stop.hidden = true; copy.hidden = false; go.hidden = false; go.textContent = 'Run it again'; running = false;
  };
  stop.onclick = () => { halt = true; stop.textContent = 'Stopping…'; };
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select the text'; }
      ta.remove();
    }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
  };
  return el;
}
