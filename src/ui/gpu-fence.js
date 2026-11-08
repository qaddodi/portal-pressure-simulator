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
export function setFences(v) { on = !!v; if (!on) { sampling = sampled = false; n = 0; at = 0; } }
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
  sampled = false;
  sampling = on && !!gl && frame % SAMPLE_EVERY === 0;
  if (sampling) cur[0] = wait();
}
/** frame.js: the commands of phase `i` (1 early, 2 late, 3 final, 4 the frame's end) have been issued. */
export function fenceMark(i) {
  if (!sampling) return;
  cur[i] = wait();
  if (i === PHASES - 1) {
    waits.set(cur, at * PHASES); at = (at + 1) % KEEP; if (n < KEEP) n++;
    sampling = false; sampled = true;
  }
}
const sortBuf = new Float64Array(KEEP);
function median(i) {
  for (let k = 0; k < n; k++) sortBuf[k] = waits[k * PHASES + i];
  sortBuf.fill(Infinity, n); sortBuf.sort();
  return sortBuf[n >> 1];
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
  let total = 0; for (let i = 1; i < PHASES; i++) total += median(i);
  return `gpu (${n} sampled frames, 1 in ${SAMPLE_EVERY}, each phase's wait for the GPU): backlog at frame start ${f(0)} ms; early ${f(1)}, late ${f(2)}, final ${f(3)}, frame end ${f(4)} ms; this frame's passes ${total.toFixed(1)} ms`;
}
