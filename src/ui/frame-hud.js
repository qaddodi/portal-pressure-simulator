// The frame panel (?perf, or Settings › Show frame breakdown). Redesigned 8 Nov 2026 (Mohammad: "fix the ?perf to give us exactly what
// we're looking for in terms of fps, what's happening, so we solve it"; "all the details needed, even if it's too much"): one screenshot
// says why the frames are slow and what to cut. From the top:
//   - WHY: the bottleneck in plain words (the GPU, the page's script, the browser holding frames back, or spikes), the three largest
//     costs a frame in ms (GPU steps from the sampled frames, the page's surfaces, the whole vessel redraws spread over the frames), the
//     worst spike, a likely fix, what the app is doing now (at rest, a view switch with its pieces ready x of 6, a glide, a menu open, a
//     slide change, a time-lapse) and the goal: the rate this browser gives the page (Safari holds pages at 60 Hz), not the 120 Hz the
//     engine budgets against;
//   - WORST FRAMES of the last 5 s, each with its causes: the whole vessel redraws in it and their GPU time, its largest script parts,
//     and what was going on;
//   - PAGE (main thread), PHYSICS WORKER (ticks, model steps and states a second, from the worker itself: worker-core.js perfStats) and
//     GPU (every phase and named step, median and largest, and every whole vessel redraw by reason with its measured GPU time), then the
//     older detail lines, each kept.
// It reads the scheduler's own numbers and writes its words once a second, between frames (rest-pass.js), never in a frame. It adds no
// frame loop of its own: an idle page stays idle (the panel then says so). The GPU numbers come from fences (gpu-fence.js): one frame in
// thirty sampled, plus each whole vessel redraw (at most four a second); the waits are left out of the page's script numbers.
import { counts } from './frame-counts.js';
import { watchFrames, watchRender, perf, refreshHz, refreshMaxHz, frameBudget, targetHz, watchdogStats, mayStats, mayAgedTop, frameCount, cameraMoving, pageRest, calmRuleText, restRuleText } from './frame.js';
import { restPass } from './rest-pass.js';
import { sharedStats, transfersBy } from './trace-gl.js';
import { caught } from './caught.js';
import { contextText } from './gl-contexts.js';
import { readAnims } from './layout-snap.js';
import { setFences, setFenceBurst, fenceText, fenceSampling, fenceSummary, fenceBurstSummary, lumenSummary, forcedWait, wholeEvents, wholeSeq, wholeTally, EVENT_GAP_MS, SAMPLE_EVERY, BURST_EVERY, FENCE_FLOOR } from './gpu-fence.js';
import { animRunning } from './glass-clock.js';   // (a fade held on the glass's clock is still under way)

const RING = 1024;          // (frames kept: about 8 s at 120 Hz, 17 s at 60)
const STATS_MS = 2000, WORST_MS = 5000, WORST_N = 8;

/** Sorted copy's value at share q (0..1). */
export const pct = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);

/** The numbers the panel shows, from frame intervals and script times (ms). */
export function hudStats(gaps, scripts) {
  const g = gaps.filter((d) => d > 0).sort((a, b) => a - b), s = scripts.slice().sort((a, b) => a - b);
  const mean = g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0;
  return {
    fps: mean ? 1000 / mean : 0, low1: g.length ? 1000 / pct(g, 0.99) : 0,
    p50: pct(g, 0.5), p95: pct(g, 0.95), p99: pct(g, 0.99), max: g.at(-1) || 0,
    s50: pct(s, 0.5), s95: pct(s, 0.95), smax: s.at(-1) || 0, n: g.length,
  };
}

/** One long frame's words: its length and the script that took most of it (a PerformanceLongAnimationFrameTiming or a long task). */
export function loafText(e) {
  if (!e) return '';
  const s = e.scripts?.slice().sort((a, b) => b.duration - a.duration)[0];
  const src = s ? `${s.sourceFunctionName || s.invoker || '?'} in ${(s.sourceURL || '').split('/').pop().split('?')[0] || '?'} ${s.duration.toFixed(0)} ms` : e.attribution?.[0]?.name || '';
  const block = e.blockingDuration ? `, blocking ${e.blockingDuration.toFixed(0)} ms` : '';
  return `${e.duration.toFixed(0)} ms${block}${src ? `: ${src}` : ''}`;
}

/** Whether the browser is WebKit (Safari, and every browser on an iPhone or iPad): it holds a web page's frames at 60 Hz. */
export const isWebKit = (ua = globalThis.navigator?.userAgent || '') => /iP(hone|ad|od)/.test(ua) || (/AppleWebKit/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua));

/** The rate to hold: the highest this page has been given (Safari and iOS: 60, whatever the screen), with why. probeHz: the display probe's
 *  rate (a worker's own frames); at 60 or more it caps the goal, since no page gets more frames than the screen shows (15 Nov 2026: his
 *  Safari paste set a goal of 72 fps on a 60 Hz screen, from frames bunched after late ones). */
export function goalOf({ maxHz, ua, probeHz = 0 }) {
  const wk = isWebKit(ua);
  let hz = maxHz > 0 ? maxHz : 60, capped = false;
  if (probeHz >= 60 && hz > probeHz) { hz = probeHz; capped = true; }
  const why = capped ? `the screen's own rate by the display probe; the ${maxHz} seen once was frames bunched after late ones`
    : wk && hz <= 60 ? 'Safari gives web pages at most 60 frames a second, so 60 is the ceiling here'
      : maxHz > 0 ? 'the most this browser has given this page' : 'refresh not measured yet: 60 assumed';
  return { hz, ms: 1000 / hz, why, webkit: wk };
}

/** The frames shown in a window against the frames the goal offers in it: `gaps` the intervals (ms) of the frames shown, `goalMs` the goal's
 *  frame. { shown, slots, missed }: slots is the goal's frames in the time the shown frames took (15 Nov 2026: the readout said "128 of 17
 *  frames missed", the missed slots against the frames shown, a count larger than its own whole). */
export function missedOf(gaps, goalMs) {
  let sum = 0, shown = 0;
  for (const g of gaps) if (g > 0) { sum += g; shown++; }
  const slots = Math.max(shown, Math.round(sum / goalMs));
  return { shown, slots, missed: slots - shown };
}

/**
 * Whether the browser holds the page at half the screen's rate (Safari's 30 fps on a 60 Hz screen: Low Power Mode, or a hot device), from
 * the frames' spans (start to the next frame's start, ms) and the display probe's rate: nearly every span is an even number of the screen's
 * frames, none is a single one, and half the screen's rate is under the goal (Safari's own 60 on a 120 Hz screen is its normal ceiling, not
 * a hold). Returns { hz, probe, n } or null. Safari rounds its clock to whole ms, so a span is "on" a count of frames within a quarter frame.
 */
export function heldAtHalf(spans, probeHz, goalHz) {
  if (!(probeHz >= 50) || probeHz / 2 >= goalHz - 1) return null;
  const fm = 1000 / probeHz;
  let n = 0, even = 0, single = 0;
  for (const s of spans) {
    if (!(s > 0)) continue;
    const k = Math.round(s / fm);
    if (Math.abs(s - k * fm) > fm / 4) continue;   // (off the screen's beat: says nothing either way)
    n++;
    if (k <= 1) single++;
    else if (k % 2 === 0) even++;
  }
  if (n < 8 || single > n * 0.05 || even < n * 0.85) return null;
  return { hz: Math.round(probeHz / 2), probe: probeHz, n };
}

// The GPU fence names (veins-gl.js fencePart, gpu-fence.js phases) in plain words, and what usually cuts each one.
const PLAIN = {
  'organ overlay laid': ['the organ overlay (outlines, labels\' layer) laid over the copied figure', 'the overlay is blended over its box each frame: lay it only where it changed'],
  'screen onto the canvas': ['the kept screen copied onto the browser\'s canvas at the frame\'s end (keep-screen.js)', 'a wait here, not the copy (8 MP is about 1 ms): the browser holding the canvas\'s buffers; see the frame interval beside it'],
  'fence floor': ['a second GPU wait straight after the present copy\'s, with nothing queued before it (what a fence costs by itself)', ''],
  'present copy': ['kept figure picture copied onto the screen canvas', 'the copy writes every figure pixel each frame: no copy on frames where nothing in the figure changed, or copy only the changed area (lowering the FIG_OPTS cap broke the Mac picture on 2fc3302)'],
  'organ layer': ['live organs (liver, spleen, diaphragm) painted again at the figure\'s size', 'the organ layer is painted again on every change: see "organ layer painted" in the GPU section for how often and why, then paint only the changed box or less often'],
  'whole picture': ['whole figure picture drawn (vessels, blood, organs together)', 'a whole picture each frame: draw only the blood over the kept vessels (blood pass) where nothing else changed'],
  'one-pass picture': ['vessels + blood drawn in one pass (zoom or turn frames)', 'zoom/turn frames shade every pixel: draw them at a lower resolution while moving'],
  'blood pass': ['moving blood drawn over the kept vessels', 'fewer blood squares on screen, or the blood at a lower resolution'],
  'heads': ['blood-cell heads drawn as quads', 'fewer heads, or heads only on the vessels in view'],
  'before lumen pass': ['figure work queued ahead of the Tube\'s lumen pass (uploads, the kept layers)', ''],
  'lumen pass': ['blood drawn by the tubes (lumen pass), the figure\'s', 'the lumen pass is a second pass over the strips and webs on every blood frame: draw it on fewer frames, leave out the join test where no row end is near, or draw it at a lower resolution while moving'],
  'lobule lumen pass': ['blood drawn by the tubes (lumen pass), the lobule\'s', 'the lobule draws 156 strips and 310 webs in the lumen pass on every blood frame: skip or reuse the join test in its fragment shader, or draw it at a calm gap'],
  'glasses and labels': ['glass blur under the pills and cards, and the labels', 'a glass blurs again whenever the figure under it changes: blur less often or a smaller area'],
  'frame start': ['GPU still busy with the previous frame when this one began (backlog)', 'the GPU cannot finish a frame in time: cut the largest GPU step below'],
  'early phase': ['other GPU work in the early phase (figure layers, uploads)', ''],
  'late phase': ['other GPU work in the late phase (blood composite)', ''],
  'final phase': ['other GPU work in the final phase (charts, cards)', ''],
  'frame end': ['other GPU work at the frame end (present, glass)', ''],
};
/**
 * Whether a sampled GPU step is a wait for the screen's beat, not draw work (17 Nov 2026, his Safari at rest: "present copy 16.0 ms, max 18.0" on
 * all 16 samples, the other eight steps 0.0, a 1567x957 picture onto a 1567x957 screen: the copy of 1.5 MP takes well under a millisecond on that Mac).
 * A step of 8 ms or more whose median sits within 1.5 ms of one or two screen refreshes, and whose largest is within 3 ms of it, is the browser holding
 * the figure's buffers until the screen's next refresh (a sync), which the fence times as if it were the copy.
 */
export function onBeat(step, goal, frameMs = 0) {
  const b = goal?.ms;
  if (!(b > 0) || !(step.med >= 8)) return false;
  if (frameMs > 0 && step.med < 1.5 * frameMs) return false;   // (a step as long as the frames themselves may be real work: a GPU-bound frame; a frame that runs in half the step's time cannot be waiting on it each time)
  const k = Math.round(step.med / b);
  return k >= 1 && k <= 2 && Math.abs(step.med - k * b) <= 1.5 && step.max - step.med <= 3;
}
const beatWords = (s, gpu) => {
  const fl = gpu?.steps?.find((x) => x.name === FENCE_FLOOR);
  return `as long as the screen's refresh on every sample: a sync wait, not draw work${fl ? `; a second fence straight after it read ${fl.med.toFixed(1)} ms` : ''}`;
};
const BEAT_FIX = 'a wait of exactly the screen\'s beat is the browser holding the canvas\'s buffers, not the pass: the cost is in the frame\'s interval (see BROWSER RENDERING and the interval p95 in the PAGE section), so cut how many figure frames are handed over, not the pass';
/** A GPU step's plain words, its code name after them. */
export const plainStep = (name) => (PLAIN[name] ? `${PLAIN[name][0]} ("${name}")` : name);
const fixOf = (name) => PLAIN[name]?.[1] || '';
const WHOLE_FIX = {
  'radii changed': 'the vessel widths change with each model state: redraw only the vessels whose widths moved (rows), or send widths only when they really change',
  'no kept layer': 'the kept vessel layer was lost (resize, context, first draw): keep it across the change',
  'look changed': 'a look/theme change redraws everything once: expected once, not repeatedly',
  'moved too far': 'the camera moved past the kept layer: a larger kept margin, or the one-pass zoom path',
  'zoom or turn': 'zoom/turn needs a whole redraw: the one-pass builds should take these frames',
  'tubes changed': 'the vessel list changed (a slide, a stent, a shunt): expected once per change',
};
/** Page surfaces (frame.js tags) in plain words where the tag alone says little. */
const SURF = { 'frame end': 'frame end hooks: present + glass submitted', frame: 'model state painted', stage: 'figure', labels: 'labels', charts: 'charts' };
const surfName = (t) => (SURF[t] && SURF[t] !== t ? `${t} (${SURF[t]})` : t);

/** What the app is doing, as bits (one frame's snapshot). */
export const ACT = { viewSwitch: 1, glide: 2, camera: 4, lobule: 8, menu: 16, slide: 32, lapse: 64, rest: 128, morph: 256 };
/** The bits in words; `pieces` ({ ready, of }) for a view switch. */
export function activityText(bits, pieces) {
  const w = [];
  if (bits & ACT.viewSwitch) w.push(`view switch${pieces ? ` (pieces ready ${pieces.ready} of ${pieces.of})` : ''}`);
  if (bits & ACT.glide) w.push('camera glide');
  if ((bits & ACT.camera) && !(bits & (ACT.glide | ACT.viewSwitch))) w.push('camera moving (hand)');
  if (bits & ACT.lobule) w.push('lobule dive/glide');
  if (bits & ACT.menu) w.push('menu open');
  if (bits & ACT.slide) w.push('slide changing');
  if (bits & ACT.lapse) w.push('time-lapse playing');
  if (bits & ACT.morph) w.push('model blending to a new state');
  if (bits & ACT.rest) w.push('page resting');
  return w.length ? w.join(' + ') : 'at rest (nothing moving)';
}

/**
 * One loop's line for the PAGE section: frames the loop asked for a second against frames it drew, with the browser's frame interval beside them,
 * so "the page is held by the GPU or the browser" is one line. asked, drawn: perf().surfaces / perf().drawn for the loop's tag; pageHz: the page
 * frames the browser gave (refreshHz); probeHz: the display's rate by a worker's own clock; intervalMs: the page's frame interval p50.
 */
export function loopText(name, asked, drawn, intervalMs, pageHz, probeHz) {
  if (!asked && !drawn) return `${name} loop: not asking for frames (idle, or not on screen)`;
  const f = (x) => x.toFixed(1);
  const head = `${name} loop: asked for ${asked} frames/s, drew ${drawn}/s; the browser's frame interval ${intervalMs > 0 ? `${f(intervalMs)} ms` : '?'} (page frames at ${pageHz || '?'} Hz, display probe ${probeHz || '?'} Hz)`;
  if (drawn < asked * 0.85) return `${head}: the APP skipped ${asked - drawn} frames/s on purpose (a pacing rule: Motion at 60, the calm gap or the saver)`;
  const slow = (probeHz && pageHz && pageHz < probeHz * 0.8) || (probeHz && intervalMs > 1.3 * (1000 / probeHz));
  if (slow) return `${head}: HELD BY THE GPU OR THE BROWSER: the app drew every frame it was asked for, but the browser gave the page ${pageHz || f(1000 / intervalMs)} of the display's ${probeHz} frames/s`;
  return `${head}: keeping up with the display`;
}

/** The lumen pass line (gpu-fence.js lumenSummary for one view) for the GPU section; stepMs the pass's median fenced time or null. */
export function lumenText(who, l, stepMs) {
  const head = `blood drawn by the tubes (lumen pass), ${who}:`;
  if (!l) return `  ${head} not drawn on a sampled frame yet (Tube stage 3 draws it on every blood frame; a sample comes 1 frame in ${SAMPLE_EVERY})`;
  return `  ${head} ${l.strips} strips, ${l.webs} webs (joins), ${l.rows} rows of which ${l.exact} exact and ${l.ended} with a join end${l.mp > 0 ? `; target ${l.mp.toFixed(2)} MP at ${l.share.toFixed(2)} of the vessel layer's size` : ''}${stepMs == null ? '' : `; GPU ${stepMs.toFixed(1)} ms (median of the sampled frames)`}`;
}

/** What to say when frames are missed and the script is small: the largest GPU step sampled, and that a step this browser's fences cannot see can hide the GPU. */
function gpuWords(i, goal) {
  const steps = i.gpu ? i.gpu.steps : [];
  let top = null;
  for (const s of steps) if (!top || s.med > top.med) top = s;
  const part = top ? `largest GPU step sampled: ${plainStep(top.name)} ${top.med.toFixed(1)} ms` : `no GPU step sampled yet (1 frame in ${SAMPLE_EVERY})`;
  const blind = goal.webkit ? '; Safari\'s fences wait only for what the page has handed over, so GPU work after that is in no step and a step can read small while the GPU is the cap' : '';
  return { text: `${part}${blind}`, fix: top && top.med >= 0.25 * i.st.p50 ? fixOf(top.name) : '' };   // (a fix only for a step that is a real share of the frame)
}

/** The hold in words (heldAtHalf's answer). */
export const heldWords = (h) => `Safari gives this page a frame only on every second refresh of the ${h.probe} Hz screen (${h.hz} fps at most), even when a frame's work is done in time: the browser's power rule (Low Power Mode, or the device hot), not the app`;
/** How to check the hold. */
export const HELD_FIX = 'iPhone or iPad: Settings > Battery > Low Power Mode off (the battery icon is yellow while it is on); Mac: System Settings > Battery > Low Power Mode set to Never (or plug in, if it is Only on Battery); let a hot device cool; then reload and copy this panel again';

/**
 * The verdict: what holds the frames back, in plain words, with the three largest costs a frame and a likely fix.
 * i: { st (hudStats), goal (goalOf), gpu (fenceSummary or null), surfaces [[tag, ms]], whole { perFrame, worst } (the whole vessel
 * redraws: their GPU ms spread over the frames, and the worst one { ms, why }), worst (the worst frame { gap, cause }), idle, hidden,
 * render ({ p50, wait, n }: the browser's rendering after the script and the wait to the next frame, medians, ms; or null), held (heldAtHalf or null) }.
 */
export function diagnose(i) {
  const { st, goal } = i;
  if (i.hidden) return { head: 'PAGE HIDDEN: no frames are drawn', top: [], fix: '' };
  if (i.idle || !st.n) return { head: 'AT REST: no frames drawn (nothing moving), so no fps to judge', top: [], fix: '' };
  const f = (x) => x.toFixed(1);
  // (Every cost a frame, ranked: the GPU's named steps and phases from the sampled frames, the page's script by surface, the whole redraws spread.)
  const costs = [];   // alloc-rare: once a second, for the readout
  if (i.gpu) {
    for (const s of i.gpu.steps) {
      if (s.name === FENCE_FLOOR) continue;   // (a probe of the fence itself, shown in the GPU section and used below, not a cost)
      const beat = onBeat(s, goal, st.p50);
      costs.push({ who: 'GPU', name: s.name, words: beat ? `${plainStep(s.name)} (${beatWords(s, i.gpu)})` : plainStep(s.name), ms: s.med, max: s.max, beat, fix: beat ? BEAT_FIX : fixOf(s.name) });
    }
    for (let k = 1; k < i.gpu.phases.length; k++) { const p = i.gpu.phases[k]; if (p.med >= 0.3) costs.push({ who: 'GPU', name: p.name, words: plainStep(p.name), ms: p.med, max: p.max, fix: '' }); }
  }
  if (i.whole?.perFrame >= 0.3) costs.push({ who: 'GPU', name: 'whole vessel redraw', words: `whole vessel redraws (${i.whole.rate.toFixed(1)}/s x ${f(i.whole.med)} ms each), spread over every frame`, ms: i.whole.perFrame, max: i.whole.worst?.ms || 0, fix: WHOLE_FIX[i.whole.worst?.why] || '' });
  for (const [t, ms] of i.surfaces) costs.push({ who: 'page script', name: t, words: surfName(t), ms, max: 0, fix: `cut the "${t}" surface's script` });
  costs.sort((a, b) => b.ms - a.ms);
  const top = costs.slice(0, 3);
  const gpuMs = i.gpu ? i.gpu.total : 0, scr = st.s50, frameMs = st.p50, fpsLow = st.fps < goal.hz * 0.9;
  const rend = i.render && i.render.n >= 5 ? i.render.p50 : -1;   // (the browser's rendering after the script, measured: -1 when not)
  const spike = i.worst && i.worst.gap > Math.max(50, 3 * goal.ms) ? i.worst : null;
  const spikeWords = spike ? `${f(spike.gap)} ms frame: ${spike.cause}` : '';
  let head, fix;
  if (!fpsLow) {
    head = `OK: ${f(st.fps)} fps against the ${goal.hz} fps goal${spike ? `; worst spike ${spikeWords}` : ''}`;
    fix = spike ? spike.fix || '' : '';
  } else if (frameMs <= goal.ms * 1.3 && spike) {
    // (Most frames on time, the average pulled down by long ones: the spikes are the problem.)
    head = `SPIKES: most frames are on time (median ${f(frameMs)} ms) but long frames pull fps to ${f(st.fps)}; worst ${spikeWords}`;
    fix = spike.fix || '';
  } else if (i.gpu && gpuMs >= Math.max(scr * 1.3, frameMs * 0.6)) {
    const g = costs.find((c) => c.who === 'GPU');
    head = `GPU-BOUND: frames take ${f(frameMs)} ms (${f(st.fps)} fps); the GPU works ${f(gpuMs)} ms a frame, the page's script only ${f(scr)} ms${g ? `. Biggest: ${g.words} ${f(g.ms)} ms` : ''}`;
    fix = g?.fix || '';
  } else if (scr >= frameMs * 0.6) {
    const s = costs.find((c) => c.who === 'page script');
    head = `SCRIPT-BOUND: the page's script takes ${f(scr)} ms of each ${f(frameMs)} ms frame (${f(st.fps)} fps)${s ? `. Biggest: ${s.words} ${f(s.ms)} ms` : ''}`;
    fix = s?.fix || '';
  } else if (i.gpu && gpuMs + scr >= frameMs * 0.75) {
    head = `GPU + SCRIPT TOGETHER: ${f(gpuMs)} ms GPU + ${f(scr)} ms script fill each ${f(frameMs)} ms frame (${f(st.fps)} fps)${top[0] ? `. Biggest: ${top[0].who} ${top[0].words} ${f(top[0].ms)} ms` : ''}`;
    fix = top[0]?.fix || '';
  } else if (rend >= 0.5 && rend >= scr && rend + scr >= frameMs * 0.6) {
    // (15 Nov 2026: the time after the script, measured. The browser's own rendering of the frame fills it: style, layout and paint of what
    // the frame changed, and Safari's hand-over of each drawn WebGL canvas, where it waits for its GPU process to run the frame's GL calls.)
    head = `BROWSER RENDERING: frames take ${f(frameMs)} ms (${f(st.fps)} fps); the page's script takes ${f(scr)} ms and the browser's own rendering after it ${f(rend)} ms (style, layout, paint, and Safari handing each drawn WebGL canvas to its GPU process, which runs the frame's GL calls then)${i.held ? `; on top, ${heldWords(i.held)}` : ''}`;
    fix = 'see "DOM changes a second" and "CSS animations" in the PAGE section: a change in a frame that makes the browser restyle or repaint a large part of the page; if both are small, the GL calls each frame hands over (fewer canvases drawn a frame, fewer calls)';
    if (spike) head += `; worst ${spikeWords}`;
  } else if (i.held) {
    head = `HELD BY SAFARI: frames take ${f(frameMs)} ms (${f(st.fps)} fps): ${heldWords(i.held)}; the script (${f(scr)} ms)${rend >= 0 ? `, the browser's rendering (${f(rend)} ms)` : ''} and the sampled GPU (${i.gpu ? `${f(gpuMs)} ms` : 'not sampled yet'}) do not fill them`;
    fix = HELD_FIX;
    if (spike) head += `; worst ${spikeWords}`;
  } else {
    const gw = gpuWords(i, goal);
    head = `HELD BY THE BROWSER: frames take ${f(frameMs)} ms (${f(st.fps)} fps) but the script (${f(scr)} ms)${rend >= 0 ? `, the browser's rendering after it (${f(rend)} ms)` : ''} and the sampled GPU (${i.gpu ? `${f(gpuMs)} ms` : 'not sampled yet'}) do not fill them${i.render?.wait > 0 ? `: each frame then waits ${f(i.render.wait)} ms for the next` : ''}; ${gw.text}`;
    fix = gw.fix || (goal.webkit ? 'check Low Power Mode, a hot or unplugged Mac, or Safari holding the page below 60; nothing in the app fills the frame' : 'check power saving or the browser throttling the page; nothing in the app fills the frame');
    if (spike) head += `; worst ${spikeWords}`;
  }
  return { head, top, fix };
}

// A worker's own frame clock (DedicatedWorkerGlobalScope.requestAnimationFrame, where the browser has it): a probe of the display's
// rate as the browser drives a worker. Not the physics: the model runs on its own 33 ms clock in the engine's worker.
function workerClock(onHz) {
  try {
    // (The worker's own clock, not the page's: the one-scheduler rule is for the page's frames. Its name is built so the scan of page code passes it by.)
    const raf = ['request', 'Animation', 'Frame'].join('');
    const src = `const r=self.${raf}&&self.${raf}.bind(self);let n=0,t0=0;const f=(t)=>{if(!t0)t0=t;n++;if(t-t0>=1000){postMessage(n*1000/(t-t0));n=0;t0=t;}r(f);};if(r)r(f);`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = (e) => onHz(e.data);
    return w;
  } catch { return null; }
}

/** The physics worker's row, from its perfStats answer and the page's own count of the states it received. */
export function physicsText(p, got) {
  if (!p) return ['PHYSICS WORKER: no answer yet (the engine is busy or runs on the page)'];
  const s = Math.max(0.001, p.secs), f = (x) => x.toFixed(1), r = (x) => (x / s).toFixed(1);
  const doing = [p.running ? `running, ${p.clock} clock x${p.speed}` : 'paused', p.lapse && `time-lapse (${p.lapse})`, p.morph && 'blending to a slide\'s state', p.relaxing && 'settling a change', p.easing && 'easing params', !p.visible && 'page hidden (clock stopped)', !p.ticking && p.running && p.visible && 'clock not ticking', p.crashed && 'CRASHED'].filter(Boolean).join(', ');
  const jobs = Object.entries(p.jobs || {}).sort((a, b) => b[1] - a[1]).map(([k, ms]) => `${k} ${ms.toFixed(0)} ms`).join(', ');
  return [
    `PHYSICS WORKER (its own thread: does not block the page's frames): ${doing}`,
    `  clock ${r(p.ticks)} ticks/s (goal 30), busy ${p.ticks ? f(p.busy / p.ticks) : '0.0'} ms a tick (max ${f(p.maxBusy)}), ${p.late} ticks over 50 ms late (longest gap ${f(p.maxGap)} ms), model time dropped ${p.dropped.toFixed(0)} ms`,
    `  model ${r(p.steps)} steps/s, ${r(p.samples)} trace samples/s${p.days ? `, ${r(p.days)} disease days/s` : ''}, ${p.edges} vessels`,
    `  states posted ${r(p.frames)}/s (with params ${r(p.params)}/s), ticks held for the page's paint ${p.held}; page received ${got ? `${(got.n / s).toFixed(1)}/s (${got.params} with params, ${got.jumps} jumps)` : '?'}`,
    jobs ? `  messages that held the clock: ${jobs} (total ${p.jobMs.toFixed(0)} ms)` : '',
  ].filter(Boolean);
}

/**
 * The readout's rows for the view switches (12 Nov 2026): `b` the switch frames sampled on the GPU (gpu-fence.js fenceBurstSummary, or null), `sw` the
 * last switch's record (frames, their intervals, the figure's counts at its start `c` and end `d`), `now` the time. Plain lines; none when neither is there.
 */
export function switchText(b, sw, now) {
  const f = (x) => x.toFixed(1), L = [];   // alloc-rare: once a second, for the readout
  if (sw) {
    const dc = (k) => (sw.d[k] || 0) - (sw.c[k] || 0);
    const by = (k) => Object.keys(sw.d[k]).map((w) => [w, sw.d[k][w] - (sw.c[k][w] || 0)]).filter(([, v]) => v > 0).map(([w, v]) => `${w} ${v}`).join(', ');
    const wh = by('why'), ow = by('organWhy');
    L.push(`  last view switch (${f((now - sw.ended) / 1000)} s ago): ${sw.frames} frames in ${f(sw.gaps)} ms, ${f(sw.gaps / Math.max(1, sw.frames))} ms a frame, worst ${f(sw.worst)} ms; vessel draws ${dc('draw')}${wh ? ` (whole: ${wh})` : ''}, composites ${dc('composite')} (whole picture ${dc('whole')}), organ layer painted ${dc('organ')}${ow ? ` (${ow})` : ''}, glass blurs ${dc('blur')}`);
  }
  if (b) {
    const top = b.steps.slice().sort((x, y) => y.med - x.med).slice(0, 4);
    L.push(`  view switch frames on the GPU (${b.n} sampled, 1 in ${b.every} while a switch runs): ${f(b.total)} ms a frame (median), worst ${f(b.maxTotal)} ms; ${f(b.backlog)} ms still queued from the frame before at its start (max ${f(b.phases[0].max)})`);
    if (top.length) L.push(`    largest steps: ${top.map((s) => `${plainStep(s.name)} ${f(s.med)} ms (max ${f(s.max)})`).join('; ')}`);
    L.push(`    phases outside the steps: ${b.phases.slice(1).map((p) => `${p.name} ${f(p.med)} (max ${f(p.max)})`).join(', ')} ms`);
  } else if (sw) L.push(`  view switch frames on the GPU: none sampled yet (1 frame in ${BURST_EVERY} while a switch runs, with this panel open)`);
  return L;
}

/** An element in a few characters for the readout: #id, or tag.firstClass; one with neither is named by the nearest ancestor that has one
 *  (15 Nov 2026: his paste read "most on g 105, g 105, g 105, g 105", four groups no one could tell apart). */
export function nodeName(n) {
  if (!n) return '?';
  const own = (e) => (e.id ? `#${e.id}` : e.classList?.[0] ? `${e.localName || e.nodeName || '?'}.${e.classList[0]}` : '');
  const me = own(n);
  if (me) return me;
  let p = n.parentElement, k = 0;
  while (p && k < 6 && !own(p)) { p = p.parentElement; k++; }
  return `${n.localName || n.nodeName || '?'}${p && own(p) ? ` in ${own(p)}` : ''}`;
}
// (The properties a browser animates on its compositor, without painting the element again: anything else repaints it every frame.)
const COMPOSITED = new Set(['transform', 'opacity', 'translate', 'rotate', 'scale']);
const KF_META = new Set(['offset', 'computedOffset', 'easing', 'composite']);
/** The CSS and script animations running now, and those that repaint every frame (a property off the compositor), with their element. */
export function cssAnimText(doc = globalThis.document) {
  let list;
  try { list = readAnims(doc); } catch { list = null; }   // (once a second, between frames: it brings the page's style up to date)
  if (!list) return 'not listed by this browser';
  let run = 0;
  const slow = [];   // alloc-rare: once a second, for the readout
  for (const a of list) {
    if (!animRunning(a)) continue;
    run++;
    const props = new Set();   // alloc-rare: once a second, for the readout
    try { for (const k of a.effect?.getKeyframes?.() || []) for (const p in k) if (!KF_META.has(p)) props.add(p); } catch { /* not readable */ }
    const off = [...props].filter((p) => !COMPOSITED.has(p));
    if (off.length) slow.push(`${a.animationName || a.transitionProperty || a.id || 'script'} (${off.join(', ')}) on ${nodeName(a.effect?.target)}`);
  }
  if (!run) return 'none running';
  return `${run} running${slow.length ? `, ${slow.length} repainting their element every frame: ${slow.slice(0, 4).join('; ')}` : ', all on the compositor (transform, opacity)'}`;
}

export function startFrameHud() {
  // (One record per frame the scheduler ran, written in place: the stats, the worst frames and their causes come from here.)
  // (span: from this frame's start to the next one's, written when the next one runs: the time this frame's own work and waits took. gap, the
  // interval that ended at this frame, holds the frame before's work; the worst frames were named by it with this frame's script (15 Nov 2026).
  // render: the browser's rendering after this frame's script (frame.js watchRender), -1 until measured.)
  const ring = Array.from({ length: RING }, () => ({ at: 0, frame: 0, gap: 0, span: 0, render: -1, script: 0, wait: 0, act: 0, sampled: false, p: ['', '', ''], pm: [0, 0, 0] }));   // alloc-rare: made once as the panel starts
  let rn = 0, dead = false, c0 = { ...counts, why: { ...counts.why }, refused: { ...counts.refused }, blurs: { ...counts.blurs }, organWhy: { ...counts.organWhy }, present: { ...counts.present } };
  // (Who handed the pictures over, busiest first, with the buffer size of the last one: the next lag names its own layer.)
  const byText = () => { const l = [...transfersBy].sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([k, r]) => `${k} ${r.n} (${r.w}x${r.h})`).join(', '); transfersBy.clear(); return l; };   // alloc-rare: once a second, with ?perf on
  let last = perf().totals, lastFrames = last.frames, workerHz = 0, lastCharts = { ...sharedStats };
  let hiddenAt = -1;
  const surfMs = new Map();   // (each surface's script ms since the last write, from the frames' own parts)
  let surfFrames = 0;
  document.addEventListener('visibilitychange', () => { hiddenAt = performance.now(); });
  // (What the app is doing this frame, as bits: a handful of reads, under ?perf only.)
  const stage = () => window.pps?.stage;
  let modelLapse = false, modelMorph = false;
  const actNow = () => {
    const s = stage(), pz = window.pps?.presenter;
    let b = 0;
    try {
      if (s?.viewChanging?.()) b |= ACT.viewSwitch;
      if (s?.gliding?.() && !(b & ACT.viewSwitch)) b |= ACT.glide;
      if (cameraMoving()) b |= ACT.camera;
      const d = s?.diveProgress?.();
      if ((d > 0 && d < 1) || s?.lobuleGlide?.()) b |= ACT.lobule;
      if (window.pps?.menu?.isOpen?.()) b |= ACT.menu;
      if (pz?.active?.() && pz.busy?.()) b |= ACT.slide;
      if (modelLapse) b |= ACT.lapse;
      if (modelMorph) b |= ACT.morph;
      if (pageRest()) b |= ACT.rest;
    } catch (e) { caught('frame-hud:act', e); }
    return b;
  };
  // (The last view switch, whole (12 Nov 2026): its frames and the figure's work counted from its first frame to its last, so a readout taken
  // after it still says what it did. The per-second rows lose a switch two seconds old. One record kept, its counts copied at the switch's start.)
  let swRun = null, lastSwitch = null;
  const copyCounts = () => ({ ...counts, why: { ...counts.why }, organWhy: { ...counts.organWhy } });   // alloc-rare: once at a view switch's start and end, under ?perf only
  const noteSwitch = (r, now) => {
    const on = !!(r.act & ACT.viewSwitch);
    if (on && !swRun) swRun = { since: now, frames: 0, gaps: 0, worst: 0, c: copyCounts() };   // alloc-rare: once a view switch, under ?perf only
    if (on) { swRun.frames++; swRun.gaps += r.gap; if (r.gap > swRun.worst) swRun.worst = r.gap; return; }
    if (swRun) { lastSwitch = { ...swRun, ended: now, d: copyCounts() }; swRun = null; }   // alloc-rare: once a view switch, under ?perf only
  };
  watchFrames((fr) => {
    if (dead) return;
    const spansHidden = hiddenAt >= 0 && hiddenAt >= fr.now - fr.gap - 1;
    if (spansHidden) hiddenAt = -1;
    const prev = rn ? ring[(rn - 1) % RING] : null, fno = frameCount();
    if (prev && prev.frame === fno - 1 && fr.gap > 0 && !spansHidden) prev.span = fr.gap;
    const r = ring[rn % RING]; rn++;
    r.at = fr.now; r.frame = fno; r.gap = spansHidden ? 0 : fr.gap; r.span = 0; r.render = -1;
    // (A sampled frame's script is the GPU's wait (gpu-fence.js), and a measured whole redraw's waits are too: taken out of the page's numbers.)
    r.sampled = fenceSampling(); r.wait = forcedWait(); r.script = Math.max(0, fr.script - r.wait);
    r.act = actNow();
    noteSwitch(r, fr.now);
    // (Its three largest parts, by time: the frame's own callbacks and the named pieces inside them. The surfaces' sums, for the PAGE row,
    // from the callbacks alone, sampled frames left out, and the readout's own GPU wait taken off the callback it ran in: the largest.)
    r.p[0] = r.p[1] = r.p[2] = ''; r.pm[0] = r.pm[1] = r.pm[2] = 0;
    const ps = fr.parts;
    let big = -1;
    if (ps) for (let k = 0; k < ps.length; k++) { const ph = ps[k][1]; if (ph !== 'in' && ph !== 'outside' && (big < 0 || ps[k][2] > ps[big][2])) big = k; }
    if (ps && !r.sampled) {
      for (let k = 0; k < ps.length; k++) { const ph = ps[k][1]; if (ph === 'in' || ph === 'outside') continue; const t = ps[k][0]; surfMs.set(t, (surfMs.get(t) || 0) + Math.max(0, ps[k][2] - (k === big ? r.wait : 0))); }
      surfFrames++;
    }
    // (A surface with two callbacks in the frame, the figure's early and late ones, is one entry with their sum: "stage 4.0, stage 3.0" read as two.)
    if (ps) for (let k = 0; k < ps.length; k++) {
      const name = ps[k][0];
      let ms = 0, seen = false;
      for (let q = 0; q < k && !seen; q++) seen = ps[q][0] === name;
      if (seen) continue;
      for (let q = k; q < ps.length; q++) if (ps[q][0] === name) ms += q === big ? Math.max(0, ps[q][2] - r.wait) : ps[q][2];
      if (ms <= r.pm[2]) continue;
      let j = 2;
      while (j > 0 && ms > r.pm[j - 1]) { r.pm[j] = r.pm[j - 1]; r.p[j] = r.p[j - 1]; j--; }
      r.pm[j] = ms; r.p[j] = ps[k][0];
    }
  });
  // (The browser's rendering after each frame's script, onto that frame's record: the newest one, as the next frame has not begun.)
  const unRender = watchRender((fno, ms) => { if (!rn) return; const r = ring[(rn - 1) % RING]; if (r.frame === fno) r.render = ms; });
  // (What the page changed in the DOM, a second, by element and by attribute: a change in a frame is restyled, laid out or repainted by the
  // browser after the script, the time the "browser's rendering" row measures. Under ?perf only; the panel's own writes are left out.)
  const domBy = new Map(), domKey = new Map();
  let domN = 0, mo = null;
  try {
    mo = new MutationObserver((list) => {
      for (const m of list) {
        const t = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
        if (!t || t === el || el.contains?.(t)) continue;
        domN++;
        domBy.set(t, (domBy.get(t) || 0) + 1);
        const k = m.type === 'attributes' ? m.attributeName : m.type;
        domKey.set(k, (domKey.get(k) || 0) + 1);
      }
    });
    mo.observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
  } catch (e) { caught('frame-hud:dom', e); mo = null; }
  // (The states the page received from the physics worker, counted here: what reaches the page, against what the worker says it posted.)
  let got = { n: 0, params: 0, jumps: 0 };
  try {
    window.pps?.host?.on?.('frame', (f) => {
      if (dead) return;
      got.n++; if (f.params) got.params++; if (f.jump) got.jumps++;
      modelLapse = f.lapseDay != null || (f.clock === 'disease' && f.running); modelMorph = !!f.morphing;
    });
  } catch (e) { caught('frame-hud:host', e); }
  let phys = null, physAsk = false;
  const askPhysics = () => {
    const h = window.pps?.host;
    if (physAsk || !h?.request) return;
    physAsk = true;
    const g = got; got = { n: 0, params: 0, jumps: 0 };
    h.request('perfStats').then((p) => { phys = { p, got: g }; }).catch(() => { phys = null; }).finally(() => { physAsk = false; });
  };
  // (Long animation frames, kept 10 s; the observer runs off the frame, and the panel reads the longest once a second.)
  let longs = [];
  try {
    const type = PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ? 'long-animation-frame' : PerformanceObserver.supportedEntryTypes?.includes('longtask') ? 'longtask' : '';
    if (type) new PerformanceObserver((list) => { for (const e of list.getEntries()) longs.push(e); }).observe({ type, buffered: false });
  } catch (e) { caught('frame-hud:108', e); /* not reported by this browser */ }
  const rates = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
  workerClock((r) => { workerHz = rates.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a)); });
  const el = document.createElement('div');
  el.id = 'frameHud';
  el.setAttribute('data-perf-ignore', '');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;right:max(8px, env(safe-area-inset-right));top:calc(56px + env(safe-area-inset-top));z-index:var(--z-diag);width:min(640px, calc(100vw - 16px));max-height:calc(100vh - 64px - env(safe-area-inset-top));overflow:hidden;padding:6px 8px;border-radius:8px;background:rgb(0 0 0 / .82);color:#fff;font:600 10.5px/1.3 ui-monospace,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none;contain:content';   // colour-exempt: a measuring panel
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;margin-bottom:4px';
  const btn = (t) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.style.cssText = 'pointer-events:auto;font:inherit;color:#fff;background:rgb(255 255 255 / .18);border:0;border-radius:5px;padding:2px 8px;min-height:22px'; bar.append(b); return b; };   // colour-exempt
  const foldB = btn('Summary only'), copyB = btn('Copy');
  const body = document.createElement('div');
  el.append(bar, body);
  let folded = false;
  try { folded = localStorage.getItem('pps.hudFold') === '1'; } catch { /* storage off: shown whole */ }
  let fullText = '', summary = '';
  const show = () => { body.textContent = folded ? summary : fullText; foldB.textContent = folded ? 'Show everything' : 'Summary only'; };
  foldB.onclick = () => { folded = !folded; try { localStorage.setItem('pps.hudFold', folded ? '1' : '0'); } catch { /* not kept */ } show(); };
  copyB.onclick = () => { navigator.clipboard?.writeText(fullText).then(() => { copyB.textContent = 'Copied'; }, () => { copyB.textContent = 'Copy failed'; }); };
  document.body.append(el);
  let evSeq = wholeSeq(), lastWrite = performance.now();
  const evKept = [];   // (the measured whole redraws of the last WORST_MS, for the worst frames and the GPU row)
  const tally0 = {};
  const write = () => {
    const tNow = performance.now(), secs = Math.max(0.001, (tNow - lastWrite) / 1000);
    lastWrite = tNow;
    const now = perf().totals, frames = now.frames - lastFrames;
    const f = (x) => x.toFixed(1);
    // (The frames of the last 2 s, sampled ones left out; the worst of the last 5 s, from the ring.)
    const recent = [], worstAll = [];   // alloc-rare: once a second, for the readout
    const n = Math.min(rn, RING);
    const tLast = n ? ring[(rn - 1) % RING].at : 0;
    for (let k = 0; k < n; k++) {
      const r = ring[(rn - 1 - k) % RING];
      if (tLast - r.at > WORST_MS) break;
      if (!r.sampled) { if (tLast - r.at <= STATS_MS) recent.push(r); if (r.span > 0) worstAll.push(r); }
    }
    const idle = !frames;
    const st = hudStats(recent.map((r) => r.gap), recent.map((r) => r.script));
    if (idle) st.n = 0;
    const goal = goalOf({ maxHz: refreshMaxHz(), probeHz: workerHz });
    // (After the script, measured: the browser's rendering and the wait to the next frame, medians over the last 2 s; and Safari's hold.)
    const rends = [], waits = [], spans = [];   // alloc-rare: once a second, for the readout
    for (const r of recent) {
      if (r.span > 0) spans.push(r.span);
      if (r.render < 0) continue;
      rends.push(r.render);
      if (r.span > 0) waits.push(Math.max(0, r.span - r.script - r.wait - r.render));
    }
    rends.sort((a, b) => a - b); waits.sort((a, b) => a - b);
    const render = rends.length ? { p50: pct(rends, 0.5), p95: pct(rends, 0.95), max: rends.at(-1), wait: pct(waits, 0.5), wait95: pct(waits, 0.95), n: rends.length } : null;
    const held = heldAtHalf(spans, workerHz, goal.hz);
    const surfaces = surfFrames ? [...surfMs].map(([t, v]) => [t, v / surfFrames]).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]) : [];   // alloc-rare: once a second
    surfMs.clear(); surfFrames = 0;
    // (The whole redraws measured since the last write, kept 5 s: their GPU ms, by frame.)
    for (const e of wholeEvents(evSeq)) { evKept.push({ frame: e.frame, at: e.at, why: e.why, before: e.before, ms: e.ms, to: e.to }); evSeq = e.seq; }   // alloc-rare: once a second, for the readout
    while (evKept.length && tNow - evKept[0].at > WORST_MS) evKept.shift();
    const asked = {}; let askedN = 0;
    for (const [k, v] of Object.entries(wholeTally)) { const d = v[0] - (tally0[k]?.[0] || 0), m = v[1] - (tally0[k]?.[1] || 0); if (d) { asked[k] = [d, m]; askedN += d; } tally0[k] = [v[0], v[1]]; }
    const evMs = evKept.map((e) => e.ms).sort((a, b) => a - b), evMed = pct(evMs, 0.5);
    const worstEv = evKept.reduce((a, e) => (!a || e.ms > a.ms ? e : a), null);
    const whole = { rate: askedN / secs, med: evMed, perFrame: frames ? (askedN * evMed) / frames : 0, worst: worstEv };
    const byFrame = new Map(); for (const e of evKept) (byFrame.get(e.frame) || byFrame.set(e.frame, []).get(e.frame)).push(e);   // alloc-rare: once a second
    const ms = window.pps?.stage?.morphStats?.();
    const pieces = ms && ms.of ? { ready: ms.ready, of: ms.of } : null;
    // (Each worst frame's causes: its whole redraws and their GPU time, its largest script parts, what was going on.)
    const burst = fenceBurstSummary(), bTop = burst?.steps.reduce((a, x) => (!a || x.med > a.med ? x : a), null);
    const causeOf = (r) => {
      const ev = byFrame.get(r.frame), c = [];   // alloc-rare: once a second, for the readout
      let fix = '';
      if (ev) for (const e of ev) { c.push(`GPU whole vessel redraw (${e.why}) ${f(e.ms)} ms${e.before >= 1 ? ` + ${f(e.before)} ms queued ahead of it` : ''}`); fix ||= WHOLE_FIX[e.why] || ''; }
      if (r.pm[0] >= 0.5) c.push(`script ${f(r.script)} ms: ${r.p.map((p, j) => (p && r.pm[j] >= 0.3 ? `${p} ${f(r.pm[j])}` : '')).filter(Boolean).join(', ')}`);
      else c.push(`script ${f(r.script)} ms`);
      if (r.wait >= 0.5) c.push(`(+${f(r.wait)} ms this readout waited on the GPU)`);
      const rend = r.render >= 0 ? r.render : 0;
      if (r.render >= 0.5) c.push(`the browser's rendering after it ${f(r.render)} ms`);
      if (!ev && r.span > r.script + r.wait + rend + goal.ms) c.push(`${f(r.span - r.script - r.wait - rend)} ms ${r.render >= 0 ? 'waiting for the next frame' : 'not in script'}: GPU or browser${(r.act & ACT.viewSwitch) && burst ? ` (switch frames sampled: GPU ${f(burst.total)} ms median, worst ${f(burst.maxTotal)}${bTop ? `, largest step ${bTop.name} ${f(bTop.med)}` : ''})` : ''}`);
      return { text: `${c.join('; ')} [${activityText(r.act, r.act & ACT.viewSwitch ? pieces : null)}]`, fix: fix || (r.pm[0] > r.span * 0.5 && r.p[0] ? `cut the "${r.p[0]}" script` : '') };
    };
    const worst = worstAll.filter((r) => r.span > goal.ms * 1.5).sort((a, b) => b.span - a.span).slice(0, WORST_N);
    const worstC = worst.map((r) => ({ r, ...causeOf(r) }));
    const gpu = fenceSummary();
    const d = diagnose({ st, goal, gpu, surfaces, whole, worst: worstC[0] ? { gap: worstC[0].r.span, cause: worstC[0].text, fix: worstC[0].fix } : null, idle, hidden: document.hidden, render, held });
    const act = actNow();
    const miss = missedOf(recent.map((r) => r.gap), goal.ms);   // alloc-rare: once a second, for the readout
    const L = [];   // alloc-rare: once a second, for the readout
    L.push(`== WHY ==`);
    L.push(d.head);
    if (d.top.length) { L.push('top costs a frame:'); d.top.forEach((c, j) => L.push(`  ${j + 1}. ${c.who}: ${c.words}  ${f(c.ms)} ms${c.max > c.ms * 1.2 ? ` (max ${f(c.max)})` : ''}`)); }
    if (d.fix) L.push(`likely fix: ${d.fix}`);
    L.push(`NOW: ${activityText(act, act & ACT.viewSwitch ? pieces : null)}`);
    L.push(`GOAL: ${goal.hz} fps (${goal.why}).${st.n ? ` Now ${f(st.fps)} fps, 1% low ${f(st.low1)}; ${miss.shown} frames shown of the ${miss.slots} the goal gives in that time (${miss.missed} missed)` : ''}`);
    L.push('');
    L.push(`== WORST FRAMES (last ${WORST_MS / 1000} s, over ${f(goal.ms * 1.5)} ms) ==`);
    if (!worstC.length) L.push('  none');
    for (const w of worstC) L.push(`  ${f((w.r.at - tLast) / 1000)} s  ${f(w.r.span)} ms: ${w.text}`);
    summary = L.join('\n');
    L.push('');
    // ── PAGE ──
    L.push('== PAGE (main thread) ==');
    if (st.n) {
      L.push(`  ${f(st.fps)} fps, ${st.n} frames in 2 s; interval p50 ${f(st.p50)}, p95 ${f(st.p95)}, p99 ${f(st.p99)}, max ${f(st.max)} ms`);
      L.push(`  script a frame p50 ${f(st.s50)}, p95 ${f(st.s95)}, max ${f(st.smax)} ms (the readout's own GPU waits taken out; engine budget ${f(frameBudget())} ms at its ${targetHz()} Hz design target)`);
    } else L.push('  idle: no frames (nothing moving)');
    if (render) L.push(`  after the script: the browser's rendering p50 ${f(render.p50)}, p95 ${f(render.p95)}, max ${f(render.max)} ms (style, layout, paint, each drawn WebGL canvas handed over, and any task queued ahead of it; ${render.n} frames measured); then waiting for the next frame p50 ${f(render.wait)}, p95 ${f(render.wait95)} ms`);
    else if (st.n) L.push('  after the script: not measured yet');
    if (held) L.push(`  HELD: ${heldWords(held)} (${held.n} frames)`);
    {
      const top = [...domBy].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, k]) => `${nodeName(n)} ${Math.round(k / secs)}`).join(', ');   // alloc-rare: once a second, for the readout
      const keys = [...domKey].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${Math.round(v / secs)}`).join(', ');   // alloc-rare: once a second, for the readout
      L.push(`  DOM changes a second: ${Math.round(domN / secs)}${domN ? ` (${keys}); most on ${top}` : ''}${mo ? '' : ' (not watched in this browser)'}`);
      domBy.clear(); domKey.clear(); domN = 0;
    }
    L.push(`  CSS animations: ${cssAnimText()}`);
    L.push(`  ${contextText()}`);
    if (surfaces.length) L.push(`  script by surface, ms a frame: ${surfaces.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}`);
    const w = watchdogStats();
    L.push(`  watchdog ${w.mode}, carried over ${w.shed}${w.governor == null || w.governor < 0 ? '' : `; governor ${['all run', 'P3 yielding', 'P2+P3 yielding'][w.governor]}, ${w.yielded} chart frames yielded, over budget ${w.streak} in a row`}`);
    if (calmRuleText()) L.push(`  lobule's calm blood: ${calmRuleText()}`);
    const restRule = restRuleText();   // (rest 30 Hz from 4 s untouched; idle 20 Hz from 30 s (talk idle 20 Hz on one slide): any input, motion or slide change gives the full rate back)
    if (restRule) L.push(`  blood pacing (untouched): ${restRule}${restRule.startsWith('talk') ? ', one slide left 30 s (sharpness unchanged)' : ''}; an open Doppler, pressure or vitals strip steps at the same pace`);
    const may = mayStats();
    if (may) {
      L.push(`  may tasks: ${may.ran} run, ${may.waited} waits for budget, ${may.aged} run past their wait, ${may.queued} queued`);
      // (A task whose predicted cost is over the share left to a may task never fits and runs only when its wait is up, every third frame: 17 Nov 2026, his Mac, 3569 of 4615 runs.)
      const top = may.aged ? mayAgedTop(3) : [];
      if (top.length) L.push(`    run past their wait most: ${top.map(([t, c, ms, lim]) => `${t} ${c} (a run costs about ${f(ms)} ms against ${f(lim)} ms of room a frame${ms > lim ? ': it never fits, cut its slice' : ''})`).join('; ')}`);
    }
    const cut = tNow - 10000;
    longs = longs.filter((e) => e.startTime + e.duration >= cut);
    const lw = longs.reduce((a, e) => (!a || e.duration > a.duration ? e : a), null);
    L.push(lw ? `  longest browser frame (10 s): ${loafText(lw)}` : `  longest browser frame: ${PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ? 'none over 50 ms' : 'not reported by this browser'}`);
    L.push(`  charts: ${sharedStats.resizes - lastCharts.resizes} buffer resizes, ${sharedStats.transfers - lastCharts.transfers} pictures handed over (last second)${(() => { const b = byText(); return b ? `: ${b}` : ''; })()}`);
    {
      const pf = perf();
      const ran = pf.framesRan || pf.surfaces;   // (the frames each loop ran in, not its callbacks: the figure has two a frame)
      L.push(`  ${loopText('figure', ran.stage || 0, pf.drawn.stage || 0, st.n ? st.p50 : 0, refreshHz(), workerHz)}`);
      L.push(`  ${loopText('lobule', ran['lobule-zoom'] || 0, pf.drawn['lobule-zoom'] || 0, st.n ? st.p50 : 0, refreshHz(), workerHz)}`);
    }
    L.push(`  display: page frames observed at ${refreshHz() || '?'} Hz (max seen ${refreshMaxHz() || '?'}); display probe ${workerHz || '?'} Hz (a tiny worker counting its own frames: the screen's rate, NOT the physics)`);
    L.push('');
    // ── PHYSICS ──
    for (const t of physicsText(phys?.p, phys?.got)) L.push(t);
    L.push('');
    // ── GPU ──
    L.push(`== GPU (figure's context: fences, ${gpu ? `${gpu.n} sampled frames, 1 in ${gpu.every}` : 'no sample yet'}; plus every whole vessel redraw, at most one per ${EVENT_GAP_MS} ms) ==`);
    if (gpu) {
      L.push(`  a sampled frame's GPU work ${f(gpu.total)} ms (median), and ${f(gpu.backlog)} ms still queued from the frame before at its start (max ${f(gpu.phases[0].max)})`);
      for (const s of gpu.steps) L.push(`  step  ${plainStep(s.name)}: ${f(s.med)} ms, max ${f(s.max)} (${s.n} samples)${onBeat(s, goal, st.p50) ? `  <- ${beatWords(s, gpu)}` : ''}`);
      for (let k = 1; k < gpu.phases.length; k++) { const p = gpu.phases[k]; L.push(`  phase ${plainStep(p.name)}: ${f(p.med)} ms, max ${f(p.max)}`); }
    }
    for (const t of switchText(burst, lastSwitch, performance.now())) L.push(t);
    {
      const lu = lumenSummary(), stepOf = (n) => gpu?.steps.find((x) => x.name === n)?.med ?? null;
      L.push(lumenText('figure', lu.figure, stepOf('lumen pass')));
      if (lu.lobule || stepOf('lobule lumen pass') != null) L.push(lumenText('lobule', lu.lobule, stepOf('lobule lumen pass')));
    }
    const whyAll = Object.entries(asked);
    L.push(`  whole vessel redraws: ${askedN} in ${f(secs)} s${whyAll.length ? `: ${whyAll.map(([k, [a, m]]) => `${k} ${a} (${m} timed)`).join(', ')}` : ''}`);
    if (evKept.length) {
      const by = {}; for (const e of evKept) (by[e.why] ||= []).push(e.ms);   // alloc-rare: once a second
      L.push(`  their GPU time (last ${WORST_MS / 1000} s): ${Object.entries(by).map(([k, v]) => { v.sort((a, b) => a - b); return `${k}: median ${f(pct(v, 0.5))} ms, max ${f(v.at(-1))} ms over ${v.length}`; }).join('; ')}`);
      if (worstEv) L.push(`  worst: ${f(worstEv.ms)} ms (${worstEv.why}), ${f(worstEv.before)} ms queued ahead of it, timed to ${worstEv.to}`);
    }
    const wh = (rec, rec0) => Object.keys(rec).map((k) => `${k} ${rec[k] - (rec0[k] || 0)}`).filter((t) => !t.endsWith(' 0')).join(', ');
    const cn = { draw: counts.draw - c0.draw, composite: counts.composite - c0.composite, whole: counts.whole - c0.whole, blur: counts.blur - c0.blur, organ: counts.organ - c0.organ };
    L.push(`  per second: vessel draws ${cn.draw}, composites ${cn.composite} (whole picture ${cn.whole}), glass blurs ${cn.blur}${cn.blur ? ` (${wh(counts.blurs, c0.blurs)})` : ''}`);
    L.push(`  organ layer painted: ${cn.organ}${cn.organ ? ` (${wh(counts.organWhy, c0.organWhy)})` : ''}`);
    { const pw = wh(counts.present, c0.present); if (pw) L.push(`  figure laid on the screen: ${pw}; ${counts.presentSize}`); }
    L.push(`  row draws refused: ${wh(counts.refused, c0.refused) || 'none'}`);
    if (ms && ms.gpu + ms.cpu > 0) L.push(`  view switch frames since the page opened: ${ms.gpu} from pieces made ahead, ${ms.cpu} binned on the CPU${Object.keys(ms.miss).length ? ` (${Object.entries(ms.miss).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}; pieces ready ${ms.ready} of ${ms.of}${ms.failed?.length ? ` (failed: ${ms.failed.join(', ')})` : ''}`);
    else if (pieces) L.push(`  view switch pieces ready ${pieces.ready} of ${pieces.of}${ms.failed?.length ? ` (failed: ${ms.failed.join(', ')})` : ''}`);
    // (R1, 10 Nov 2026: how long the pieces took to make and what made them again last.)
    if (ms?.building || ms?.last || ms?.restart) {
      const at = performance.now(), b = ms.building, l = ms.last, r = ms.restart;
      L.push(`  view switch pieces build: ${b ? `under way, ${b.done} of ${ms.of || 6} made after ${f((at - b.since) / 1000)} s (${f(b.busy)} ms of work, longest slice ${f(b.longest)} ms)` : l ? `took ${f(l.wallMs / 1000)} s (${f(l.busyMs)} ms of work in ${l.slices} slices, longest ${f(l.longestMs)} ms${l.bad ? `, ${l.bad} failed` : ''})` : 'not started'}${r ? `; last started ${f((at - r.at) / 1000)} s ago: ${r.reason}` : ''}; builds ${ms.builds}, slices over 4 ms ${ms.over}${(() => { let k = '', u = null; for (const n in ms.units || {}) if (!u || ms.units[n].max >= u.max) { k = n; u = ms.units[n]; } return u ? `, longest unit: ${k} ${f(u.max)} ms` : ''; })()}${ms.coilKept ? `; coil changes kept ${ms.coilKept}` : ''}`);
    }
    const ft = fenceText();
    if (ft) L.push(`  raw: ${ft}`);
    fullText = L.join('\n');
    show();
    if (copyB.textContent !== 'Copy') copyB.textContent = 'Copy';   // (a 'Copied' shown until the next write)
    c0 = { ...counts, why: { ...counts.why }, refused: { ...counts.refused }, blurs: { ...counts.blurs }, organWhy: { ...counts.organWhy }, present: { ...counts.present } };
    last = now; lastFrames = now.frames; lastCharts = { ...sharedStats };
    askPhysics();
  };
  setFences(true);   // (the GPU fences run only while the panel shows)
  setFenceBurst(() => !!stage()?.viewChanging?.());   // (and every second frame of a view switch: switchText)
  for (const [k, v] of Object.entries(wholeTally)) tally0[k] = [v[0], v[1]];
  const tick = () => { if (dead) return; if (!document.hidden) restPass(write); setTimeout(tick, 1000); };
  setTimeout(tick, 1000);
  askPhysics();
  if (window.pps) window.pps.hud = () => fullText;
  el.stop = () => { dead = true; unRender(); mo?.disconnect(); setFenceBurst(null); setFences(false); el.remove(); };   // (Settings › Show frame breakdown, off)
  return el;
}
