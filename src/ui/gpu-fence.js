// The GPU's time along the frame, for the ?perf readout (8 Nov 2026, Mohammad's Mac: 30 ms frames with 2 ms of script, "GPU-bound", and
// nothing in the readout said what the GPU was doing). While the readout shows (setFences(true)), one frame in SAMPLE_EVERY is a sample: the
// scheduler plants a fence in the figure's context at its start and after each phase (frame.js flush: start, early, late, final, the frame's
// end) and times the call. In Safari a fence is a round trip to the GPU process that returns once the context's queue has been worked through,
// so the call takes as long as the GPU needs for everything queued before it: at the start that is the backlog the last frame left, after a
// phase it is that phase's own passes. (First built as fences polled between frames, 787f66b: on that Mac the fence calls themselves waited,
// 25 ms a frame over five of them, so the readout measured its own waits and the page under ?perf ran a frame behind. Sampled, one frame in
// thirty waits; the rest run as they do for everyone, and the readout leaves the sampled frame out of its script and interval numbers.)
// Nothing runs while the readout is off: no fence, no record. Fences are planted in the figure's context alone (setFenceContext, veins-gl.js).

export const SAMPLE_EVERY = 30;
const PHASES = 5;   // start (the backlog), early, late, final, the frame's end
const KEEP = 16;    // (samples kept, a ring)
let gl = null, on = false, sampling = false, sampled = false;
// alloc-rare: the ring of samples is made once with the module; a sample writes into its row
const waits = new Float64Array(KEEP * PHASES);
let at = 0, n = 0;
const cur = new Float64Array(PHASES);

/** The figure's context, where the fences are planted (veins-gl.js, when the renderer is made; null when it goes). */
export function setFenceContext(g) { gl = g; }
/** Whether the readout wants the samples (frame-hud.js turns them on while it shows). */
export function setFences(v) { on = !!v; if (!on) { sampling = sampled = false; n = 0; at = 0; stepN.fill(0); stepAt.fill(0); ev = null; lumenSeen[0] = lumenSeen[1] = 0; } }
export const fencesOn = () => on;
/** Whether the frame running now (or the one that just ended) is a sample, whose script time is the GPU's wait: the readout leaves it out. */
export const fenceSampling = () => sampling || sampled;
function wait() {
  const t0 = performance.now();
  try { if (!gl.isContextLost()) { const f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); if (f) gl.deleteSync(f); } } catch { /* lost: nothing to wait for */ }
  return performance.now() - t0;
}
/** frame.js: the frame `frame` begins. */
export function fenceFrame(frame) {
  frameNo = frame; forcedMs = 0; phaseAt = 1;
  // (A whole draw asked for outside a frame (a resize, a timer) is measured at the next frame's start: everything since it is its own.)
  if (ev) endEvent(wait(), 'the next frame\'s start (asked outside a frame)', false);
  sampled = false;
  sampling = on && !!gl && frame % SAMPLE_EVERY === 0;
  if (sampling) { cur.fill(0); cur[0] = wait(); }
}
/** frame.js: the commands of phase `i` (1 early, 2 late, 3 final, 4 the frame's end) have been issued. */
export function fenceMark(i) {
  phaseAt = i + 1;
  if (ev && !sampling) { endEvent(wait(), PHASE_NAMES[i]); return; }
  if (!sampling) return;
  const w = wait();
  cur[i] += w;
  if (ev) endEvent(w, PHASE_NAMES[i]);
  if (i === PHASES - 1) {
    waits.set(cur, at * PHASES); at = (at + 1) % KEEP; if (n < KEEP) n++;
    sampling = false; sampled = true;
  }
}
// (Named steps inside a phase, for the sampled frame alone: veins-gl.js marks the blood pass, the heads, the present copy and the glasses and labels
// over it, so a late phase of 26 ms (Mohammad's Mac, 8 Nov 2026) says which of its passes took it. STEP_MAX names, each a ring of KEEP waits.)
const STEP_MAX = 12;
const stepNames = [], stepWaits = new Float64Array(STEP_MAX * KEEP), stepN = new Int32Array(STEP_MAX), stepAt = new Int32Array(STEP_MAX);
/** veins-gl.js: the commands of the step `name` have been issued (a sampled frame waits for them and keeps the wait under that name). */
export function fencePart(name) {
  if (ev && !sampling) { endEvent(wait(), name); return; }
  if (!sampling) return;
  let i = stepNames.indexOf(name);
  if (i < 0) { if (stepNames.length >= STEP_MAX) return; i = stepNames.length; stepNames.push(name); }   // alloc-rare: a step's name is kept the first time it is seen
  const w = wait();
  stepWaits[i * KEEP + stepAt[i]] = w; stepAt[i] = (stepAt[i] + 1) % KEEP; if (stepN[i] < KEEP) stepN[i]++;
  if (ev) endEvent(w, name);
}

// ── The Tube's lumen pass, what it drew (R3, 10 Nov 2026). The pass runs on every blood frame as a second geometry pass; its time is the step
// 'lumen pass' (the lobule's: 'lobule lumen pass'), and these are its counts, kept from the sampled frame beside the step: strips and webs
// (joins) drawn, the rows in the pass, how many of them are exact, how many carry a join end. A number per slot in a typed array: nothing allocates.
const LUMEN_N = 7;   // (the fifth is the join ends; the sixth the target's size in MP and the seventh its share of the vessel layer's: PL item 4)
const lumenSeen = new Uint8Array(2), lumenNums = new Float64Array(2 * LUMEN_N), lumenTmp = new Float64Array(LUMEN_N);
/** veins-gl.js: the lumen pass of the figure (lobule false) or the lobule has been drawn; `counts(out)` fills [strips, webs, rows, exact, ended, target MP, share]. Kept on a sampled frame only. */
export function fenceLumen(lobule, counts) {
  if (!sampling) return;
  counts(lumenTmp);
  const k = lobule ? 1 : 0;
  for (let i = 0; i < LUMEN_N; i++) lumenNums[k * LUMEN_N + i] = lumenTmp[i];
  lumenSeen[k] = 1;
}
/** The lumen pass's counts from the last sampled frame that drew it: { strips, webs, rows, exact, ended } for the figure and the lobule, null where none yet. */
export function lumenSummary() {
  const one = (k) => (lumenSeen[k] ? { strips: lumenNums[k * LUMEN_N], webs: lumenNums[k * LUMEN_N + 1], rows: lumenNums[k * LUMEN_N + 2], exact: lumenNums[k * LUMEN_N + 3], ended: lumenNums[k * LUMEN_N + 4], mp: lumenNums[k * LUMEN_N + 5], share: lumenNums[k * LUMEN_N + 6] } : null);   // alloc-rare: once a second, for the readout
  return { figure: one(0), lobule: one(1) };
}

// ── Every whole vessel redraw, measured (8 Nov 2026, Mohammad: "?perf to give us exactly what we're looking for"). A whole redraw of the
// vessel layer (veins-gl.js draw: tally(counts.why, reason)) is the costliest pass the figure has, and one in thirty frames sampled
// missed most of them: a 163 ms "radii changed" redraw showed only as a long frame with no cause. While the readout shows, each whole
// redraw (at most one in EVENT_GAP_MS, the rest counted) waits for the GPU twice: once as it is asked for (the queue ahead of it,
// `before`) and once at the next fence point after it (the layer pass and the picture over it: its own GPU time). frame-counts.js calls
// fenceWhole; the frame panel (frame-hud.js) lists them with their frame. The waits are the page's script in that frame: forcedWait()
// says how long, so the panel takes them out of its script numbers.
const PHASE_NAMES = ['frame start', 'early phase', 'late phase', 'final phase', 'frame end'];
export const EVENT_GAP_MS = 250;
const EV_KEEP = 48;
// alloc-rare: the ring of measured redraws is made once with the module; a redraw writes into its row
const evRing = Array.from({ length: EV_KEEP }, () => ({ seq: 0, frame: 0, at: 0, why: '', before: 0, ms: 0, to: '' }));
let ev = null, evSeq = 0, evLast = -1e9, frameNo = 0, forcedMs = 0, phaseAt = 1;
/** The whole redraws asked for since the readout started: by reason, [asked, measured]. */
export const wholeTally = {};
function endEvent(ms, to, inScript = true) {
  ev.ms = ms; ev.to = to; ev.frame = frameNo;
  if (!sampling && inScript) forcedMs += ms;
  ev = null;
}
/** frame-counts.js: a whole vessel redraw for `why` is about to be drawn. */
export function fenceWhole(why) {
  if (!on || !gl) return;
  const t = wholeTally[why] || (wholeTally[why] = [0, 0]);   // alloc-rare: a reason's record is made the first time it is seen
  t[0]++;
  const now = performance.now();
  if (ev || now - evLast < EVENT_GAP_MS) return;
  evLast = now; t[1]++;
  const before = wait();
  // (In a sampled frame the wait ahead belongs to the phase under way: added to it, so the phase's own fence, finding the queue worked, loses nothing.)
  if (sampling) cur[Math.min(PHASES - 1, phaseAt)] += before; else forcedMs += before;
  const r = evRing[evSeq % EV_KEEP];
  r.seq = ++evSeq; r.frame = frameNo; r.at = now; r.why = why; r.before = before; r.ms = 0; r.to = '';
  ev = r;
}
/** The measured redraws after `seq` (oldest first; the one still waiting for its fence left out). */
export function wholeEvents(seq = 0) {
  const out = [];   // alloc-rare: once a second, for the readout
  for (let k = Math.max(seq + 1, evSeq - EV_KEEP + 1); k <= evSeq; k++) { const r = evRing[(k - 1) % EV_KEEP]; if (r.seq === k && r !== ev) out.push(r); }
  return out;
}
export const wholeSeq = () => evSeq;
/** The waits this frame made for the readout outside a sample (the whole redraws measured): ms of its script that were the GPU's. */
export const forcedWait = () => forcedMs;
const sortBuf = new Float64Array(KEEP);
function stepMedian(i) {
  for (let k = 0; k < stepN[i]; k++) sortBuf[k] = stepWaits[i * KEEP + k];
  sortBuf.fill(Infinity, stepN[i]); sortBuf.sort();
  return sortBuf[stepN[i] >> 1];
}
function median(i) {
  for (let k = 0; k < n; k++) sortBuf[k] = waits[k * PHASES + i];
  sortBuf.fill(Infinity, n); sortBuf.sort();
  return sortBuf[n >> 1];
}
function phaseMax(i) { let m = 0; for (let k = 0; k < n; k++) m = Math.max(m, waits[k * PHASES + i]); return m; }
function stepMax(i) { let m = 0; for (let k = 0; k < stepN[i]; k++) m = Math.max(m, stepWaits[i * KEEP + k]); return m; }
/** The samples kept as numbers, for the frame panel's plain words (frame-hud.js): each phase's and each named step's median and
 * largest wait (ms), how many samples, and the sampled frame's GPU total (the phases and steps, the backlog apart). null with none. */
export function fenceSummary() {
  if (!on || !n) return null;
  const phases = [], steps = [];   // alloc-rare: once a second, for the readout
  let total = 0;
  for (let i = 0; i < PHASES; i++) { const med = median(i); phases.push({ name: PHASE_NAMES[i], med, max: phaseMax(i) }); if (i) total += med; }
  for (let i = 0; i < stepNames.length; i++) if (stepN[i]) { const med = stepMedian(i); total += med; steps.push({ name: stepNames[i], med, max: stepMax(i), n: stepN[i] }); }
  return { n, every: SAMPLE_EVERY, phases, steps, total, backlog: phases[0].med };
}
/** The samples kept, oldest first: [backlog, early, late, final, end] ms each. For the tests and the console. */
export function fenceReport() {
  const out = [];   // alloc-rare: a read for the tests and the console, never a frame
  for (let k = 0; k < n; k++) { const r = (at - n + k + KEEP) % KEEP; out.push(Array.from(waits.subarray(r * PHASES, r * PHASES + PHASES))); }
  return out;
}
/** The readout's line: medians over the samples kept, or '' with none. */
export function fenceText() {
  if (!on) return '';
  if (!n) return gl ? `gpu: no sample yet (one frame in ${SAMPLE_EVERY} waits for the GPU)` : 'gpu: no figure context';
  const f = (i) => median(i).toFixed(1);
  // (A named step's wait is taken out of its phase's: the phase's fence comes after it and finds the queue already worked. So "late 0.0" beside
  // "present copy 33" (Mohammad's Mac, 8 Nov 2026) is one wait, read in the step; the frame's total counts both.)
  let total = 0; for (let i = 1; i < PHASES; i++) total += median(i);
  let steps = '';
  for (let i = 0; i < stepNames.length; i++) if (stepN[i]) { const w = stepMedian(i); total += w; steps += `${steps ? ', ' : ''}${stepNames[i]} ${w.toFixed(1)}`; }   // alloc-rare: once a second, for the readout
  return `gpu (${n} sampled frames, 1 in ${SAMPLE_EVERY}, each phase's wait for the GPU): backlog at frame start ${f(0)} ms; early ${f(1)}, late ${f(2)}, final ${f(3)}, frame end ${f(4)} ms; this frame's passes ${total.toFixed(1)} ms${steps ? `; inside (taken out of the phases): ${steps}` : ''}`;
}
