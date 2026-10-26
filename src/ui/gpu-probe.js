// GPU time per step of the vessel renderer (veins-gl.js), for the debug overlay's "GPU time per step" (debug.js). Off, a
// step costs one check. On, each timed step waits for the GPU (gl.finish) before and after it, so its time is the GPU's own
// work rather than the moment the call was queued. That slows the page, so it is only for measuring. A step timed without a
// context (gl null) is the page's own script time.
const ORGANS_Q = typeof location !== 'undefined' ? location.search.match(/[?&]gpuorgans=(0|1|force)\b/)?.[1] : null;
/**
 * The notes the ?perf readout totals over a gesture's window (perf-readout.js), by fixed name so the totals stay a few dozen numbers:
 * what the vessel layer did (a whole draw and why, a pan shift, rows redrawn), what each surface submitted, what was uploaded,
 * and the work a moving camera should not need (a surface pass, a label solve, a safe-area scan). `twice`: the names whose
 * second note inside one frame is a surface drawn twice in it.
 */
export const COUNTED = {
  whole: 'vessels: whole draw', wholeWhy: 'vessels: whole draw because ', pan: 'vessels: pan shift', rows: 'vessels: rows redrawn',
  picture: 'picture: drawn', pictureWhole: 'picture: whole', organs: 'organ layers: rendered',
  glassDrawn: 'glass: drawn', glassCopy: 'glass: figure copied', glassSkip: 'glass: copy skipped (figure unchanged)',
  lobulePicture: 'lobule: vessels drawn', lobuleSurface: 'lobule: surface pass', lobuleSkip: 'lobule: surface pass skipped (camera only)',
  tissue: 'tissue: bitmap painted', ductules: 'lobule: ductules drawn',
  labelSolve: 'labels: solved', labelCarry: 'labels: carried', safe: 'safe area: cards measured',
};
/** The counted names whose count above 1 in one frame means a surface drawn twice in it. */
export const TWICE = new Set([COUNTED.picture, COUNTED.glassDrawn, COUNTED.lobulePicture]);
/** Why a whole draw happened, as counted: the reasons are this fixed list. */
export const WHY = ['no kept layer', 'radii changed', 'look changed', 'same place', 'moved too far', 'zoom or turn', 'tubes changed'];
export const gpuProbe = {
  on: false,
  // Script time only (the ?perf readout, perf-readout.js): no wait for the GPU, so the page runs as it does for everyone.
  cpuOnly: false,
  skipGL: false,   // (the ?perf test switch: the vessels' screen picture is not drawn)
  // The organs drawn as layers on the GPU (organs-gl.js), the changing ones painted live, instead of one picture: on by default
  // (Mohammad, 22 Oct: "Do the GPU draw for everything"), off with the ?perf switch "GPU organs" or ?gpuorgans=0 in the address;
  // never on a software renderer (stage.js gpuOrgansOn). onOrgans: the stage's call to make its picture again the other way.
  // (?gpuorgans=force: on the software renderer too, for the browser check of it, tests/e2e/plate-layers.mjs.)
  gpuOrgans: ORGANS_Q === 'force' ? 'force' : ORGANS_Q !== '0',
  onOrgans: null,
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
