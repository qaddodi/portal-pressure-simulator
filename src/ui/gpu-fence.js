// GPU fences along the frame, for the ?perf readout (8 Nov 2026, Mohammad's Mac: 31 fps with 2 ms of script, "GPU-bound", and nothing in
// the readout said what the GPU was doing or whether it was the GPU at all). While the readout asks (setFences(true)), the scheduler plants a
// fence in the figure's context at the frame's start and after each phase (frame.js flush: start, early, late, final, the frame's end).
// A timer polls them between frames (never a wait: getSyncParameter asks whether the GPU has passed the fence, it does not block), so each
// fence's signal time is known to a few ms. From them the readout tells:
// - the backlog at the frame's start: how long after the start fence was planted the GPU reached it (0: the GPU was idle as the frame began;
//   a page whose frames come at 30 Hz with a backlog near 0 and a short tail is not GPU-bound, it is held by the browser);
// - the GPU's own time for each phase's commands: one fence's signal minus the one before it;
// - the tail: how long after the frame's script ended the GPU finished the frame's commands (the frame's GPU time past the main thread's).
// Nothing runs while the readout is off: no fence, no timer, no record. Fences are on the figure's context alone (setFenceContext, veins-gl.js);
// the charts' shared context is not fenced (its hand-over waits are inside the script time already).

const PHASES = ['start', 'early', 'late', 'final', 'end'];
const KEEP = 64;   // (frames kept, a ring)
let gl = null, on = false, pollT = 0;
// alloc-rare: the ring of frame records is made once with the module; a frame writes into its slot
const ring = [];
for (let i = 0; i < KEEP; i++) ring.push({ frame: 0, scriptEnd: 0, n: 0, fences: new Array(PHASES.length).fill(null), at: new Float64Array(PHASES.length), sig: new Float64Array(PHASES.length).fill(-1), done: true });
let ringAt = 0, cur = null, pending = 0;

/** The figure's context, where the fences are planted (veins-gl.js, when the renderer is made; null when it goes). */
export function setFenceContext(g) { gl = g; }
/** Whether the readout wants fences (frame-hud.js turns them on while it shows). */
export function setFences(v) { on = !!v; if (!on) { for (const r of ring) dropFences(r); } }
export const fencesOn = () => on;
function dropFences(r) {
  for (let i = 0; i < r.fences.length; i++) { const f = r.fences[i]; if (f) { try { gl?.deleteSync(f); } catch { /* lost */ } r.fences[i] = null; } }
  r.done = true;
}
/** frame.js: the frame `frame` begins. */
export function fenceFrame(frame) {
  if (!on || !gl) { cur = null; return; }
  const r = ring[ringAt]; ringAt = (ringAt + 1) % KEEP;
  if (!r.done) { dropFences(r); pending = Math.max(0, pending - 1); }
  r.frame = frame; r.n = 0; r.scriptEnd = 0; r.done = false;
  for (let i = 0; i < PHASES.length; i++) { r.sig[i] = -1; r.at[i] = 0; }
  cur = r;
  fenceMark(0);
}
/** frame.js: the commands of phase `i` (0 start, 1 early, 2 late, 3 final, 4 the frame's end) have been issued. */
export function fenceMark(i) {
  const r = cur;
  if (!r || !gl) return;
  let f = null;
  try { if (!gl.isContextLost()) { f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); } } catch { f = null; }
  r.fences[i] = f; r.at[i] = performance.now(); r.n = i + 1;
  if (i === PHASES.length - 1) { r.scriptEnd = r.at[i]; cur = null; pending++; if (!pollT) pollT = setTimeout(poll, 2); }
}
function poll() {
  pollT = 0;
  if (!on || !gl) return;
  const t = performance.now();
  let left = 0;
  for (const r of ring) {
    if (r.done) continue;
    let all = true;
    for (let i = 0; i < r.n; i++) {
      if (r.sig[i] >= 0) continue;
      const f = r.fences[i];
      if (!f) { r.sig[i] = r.at[i]; continue; }   // (no fence could be made: counted as done at once)
      let ok;
      try { ok = gl.isContextLost() || gl.getSyncParameter(f, gl.SYNC_STATUS) === gl.SIGNALED; } catch { ok = true; }
      if (!ok) { all = false; break; }   // (fences signal in order: the ones after wait)
      r.sig[i] = t;
      try { gl.deleteSync(f); } catch { /* lost */ }
      r.fences[i] = null;
    }
    if (all) { r.done = true; pending = Math.max(0, pending - 1); } else left++;
  }
  if (left) pollT = setTimeout(poll, 2);
}
/** The last `n` finished frames' numbers, oldest first: { frame, backlog, phase: [early, late, final, end] GPU ms, tail }. For the readout. */
export function fenceReport(n = KEEP) {
  const out = [];   // alloc-rare: the readout's once-a-second report
  const ordered = [];
  for (let k = 0; k < KEEP; k++) ordered.push(ring[(ringAt + k) % KEEP]);
  for (const r of ordered) {
    if (!r.done || !r.frame || r.n < PHASES.length) continue;
    const backlog = Math.max(0, r.sig[0] - r.at[0]);
    const phase = [];
    for (let i = 1; i < PHASES.length; i++) phase.push(Math.max(0, r.sig[i] - Math.max(r.sig[i - 1], r.at[i])));
    out.push({ frame: r.frame, backlog, phase, tail: Math.max(0, r.sig[PHASES.length - 1] - r.scriptEnd) });
  }
  return out.slice(-n);
}
/** The readout's line: medians over the frames kept, or '' with none. */
export function fenceText() {
  const rs = fenceReport();
  if (!rs.length) return on ? (gl ? 'gpu fences: no frame finished yet' : 'gpu fences: no figure context') : '';
  const med = (f) => { const a = rs.map(f).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };   // alloc-rare: once a second, for the readout
  const p = (i) => med((r) => r.phase[i]).toFixed(1);
  return `gpu (${rs.length} frames, fences, ~2 ms steps): backlog at frame start ${med((r) => r.backlog).toFixed(1)} ms; GPU per phase early ${p(0)}, late ${p(1)}, final ${p(2)}, frame end ${p(3)} ms; tail after script ${med((r) => r.tail).toFixed(1)} ms`;
}
