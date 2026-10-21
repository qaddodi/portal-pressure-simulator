// GPU time per step of the vessel renderer (veins-gl.js), for the debug overlay's "GPU time per step" (debug.js). Off, a
// step costs one check. On, each timed step waits for the GPU (gl.finish) before and after it, so its time is the GPU's own
// work rather than the moment the call was queued. That slows the page, so it is only for measuring. A step timed without a
// context (gl null) is the page's own script time.
export const gpuProbe = {
  on: false,
  // Script time only (the ?perf readout, perf-readout.js): no wait for the GPU, so the page runs as it does for everyone.
  cpuOnly: false,
  skipGL: false,   // (the ?perf test switch: the vessels' screen picture is not drawn)
  parts: {},
  stack: [],
  /** Runs f as the step `name` and returns its result; a step inside another counts only toward its own name. */
  time(gl, name, f) {
    if (!this.on) return f();
    // Work queued before the step by untimed calls (uploads made on the way) is waited for first, as its own share.
    const ts = performance.now();
    if (this.cpuOnly) gl = null;
    if (gl) { gl.finish(); this.add('other GPU', performance.now() - ts); }
    const t0 = performance.now();
    this.stack.push(0);
    try { return f(); } finally {
      gl?.finish();
      const t1 = performance.now(), inner = this.stack.pop();
      this.add(name, t1 - t0 - inner);
      if (this.stack.length) this.stack[this.stack.length - 1] += t1 - ts;
    }
  },
  add(name, ms) { this.parts[name] = (this.parts[name] || 0) + ms; },
  /** The time per step since the last take. */
  take() { const p = this.parts; this.parts = {}; return p; },
  // Things that happened, with no time of their own to give (an organ SVG the browser read in, its size): counted and summed.
  notes: {},
  note(name, v = 0) { if (!this.on) return; const n = this.notes[name] || (this.notes[name] = [0, 0]); n[0]++; n[1] += v; },
  /** The notes since the last take: name → [count, sum]. */
  takeNotes() { const n = this.notes; this.notes = {}; return n; },
  // Things measured as they stand rather than summed (how much of the screen a frame repaints): the latest value of each.
  gauges: {},
  gauge(name, v) { if (this.on) this.gauges[name] = v; },
  /** The gauges since the last take: name → latest value. */
  takeGauges() { const g = this.gauges; this.gauges = {}; return g; },
};
