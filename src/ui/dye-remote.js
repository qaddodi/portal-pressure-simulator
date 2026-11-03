// The dye bolus as the figure sees it, its slugs stepped in a worker (dye-worker.js; recs-2 §3.1, 2 Nov 2026). The same calls as
// blood.js createBolus (inject, release, clear, step, field, active, injecting), so stage.js uses either. step() hands the worker the
// frame's time and the vessels' flows and lengths; field() answers from the last table the worker sent back (one step behind, the
// same lag every frame, so the dye moves evenly). While a step is out, the next frames' time is added up and sent with the next, so
// none is lost. A clear starts a new generation: the time owed and the reply to a step sent before it are dropped, so only time after
// the clear ever advances a later injection. If the worker fails (an error, an unreadable reply, a step unanswered for DYE_TIMEOUT_MS)
// it is terminated and the bolus goes on the main thread: the dye in transit is cancelled (the worker held it), the injections still
// running (held ones included) start again where they were, and nothing is left running or pending. dispose() ends the worker.
// An injection shows as active at once (the figure keeps drawing until the first table comes). Where no worker can be made, it is
// createBolus itself, on the main thread as before.
import { createBolus, DYE_BINS, DYE_SECONDS, DYE_MAX_HOLD } from './blood.js';

export const DYE_WORKER = typeof Worker === 'function';

export const DYE_TIMEOUT_MS = 5000;

// Kept for good, never written: what a failed worker leaves (no table), and the options of a call that gives none.
const NO_FIELDS = new Float32Array(0), NO_HAS = new Uint8Array(0), NO_OPTS = {};

/** A bolus for `edges`/`nodes`; `makeWorker()` returns the worker (stage.js builds it, so the bundle can point it at its file). */
export function createDyeRemote(edges, nodes, makeWorker, { now = () => performance.now(), timeout = DYE_TIMEOUT_MS } = {}) {
  let w = null;
  if (DYE_WORKER && makeWorker) try { w = makeWorker(); } catch { w = null; }
  if (!w) return createBolus(edges, nodes);
  const local = createBolus(edges, nodes);   // (taken over if the worker fails)
  let failed = false;
  const nE = edges.length;
  let fields = new Float32Array(nE * DYE_BINS), has = new Uint8Array(nE);
  let active = false, injecting = false, seq = 0, out = 0, sentAt = 0, gotSeq = 0, owed = 0, owedNet = null, pendingInject = 0;
  // The injections still running, as createBolus keeps them (edge -> { at, left, hold, held }): what the local bolus starts again on a failure.
  const runs = new Map();
  // The step message and its three arrays are kept and written afresh for each send: postMessage copies what it is given when it is
  // called (structured clone), so the next send may write them again. Each array has one place per vessel (the net's own arrays do).
  const msgQ = new Float64Array(nE), msgVd = new Float64Array(nE), msgLen = new Float64Array(nE);
  const msg = { t: 'step', seq: 0, dt: 0, Q: msgQ, vd: msgVd, len: msgLen };
  const send = (dt, net) => {
    out = ++seq; sentAt = now();
    for (let i = 0; i < nE; i++) { msgQ[i] = net.Q[i]; msgVd[i] = net.vd[i]; msgLen[i] = net.len[i]; }
    msg.seq = out; msg.dt = dt;
    w.postMessage(msg);
  };
  const handBack = { seconds: 0, hold: false };   // (the options of each run handed back to the local bolus, which reads them at once)
  const injMsg = { t: 'inject', k: 0, at: 0, opts: { seconds: 0, hold: false } };   // (the inject message, written afresh for each send: postMessage copies it)
  const fail = (why) => {
    if (failed) return;
    failed = true;
    const dead = w;
    w = null; out = 0; owed = 0; owedNet = null; pendingInject = 0;
    dead.onmessage = dead.onerror = dead.onmessageerror = null;
    try { dead.terminate(); } catch { /* (already gone) */ }
    for (const [k, r] of runs) { handBack.seconds = Math.max(r.left, 1e-3); handBack.hold = r.hold; local.inject(k, r.at, handBack); }
    runs.clear();
    fields = NO_FIELDS; has = NO_HAS;
    if (typeof console !== 'undefined') console.warn('dye worker failed (' + why + '): the dye in transit is cleared, running injections go on');   // alloc-rare: the worker's failure, once (failed is then set for good)
  };
  w.onmessage = (e) => {
    const m = e.data;
    if (failed || m.seq !== out) return;   // (a reply to a step sent before a clear: out was reset by the clear, so it is not the one awaited)
    out = 0;
    fields = m.fields; has = m.has; active = m.active || pendingInject > 0; injecting = m.injecting || pendingInject > 0; gotSeq = m.seq;
    pendingInject = 0;
    if (owedNet) { const n = owedNet, dt = owed; owed = 0; owedNet = null; try { send(dt, n); } catch { fail('post'); } }
  };
  w.onerror = () => fail('error');
  w.onmessageerror = () => fail('message');
  try { w.postMessage({ t: 'init', edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })), nodes: nodes.map((n) => ({ id: n.id })) }); } catch { fail('post'); }
  const post = (m) => { try { w.postMessage(m); return true; } catch { fail('post'); return false; } };
  return {
    inject(k, at = 0, opts = NO_OPTS) {
      if (failed) return local.inject(k, at, opts);
      const seconds = opts.seconds ?? DYE_SECONDS, hold = !!opts.hold, r = runs.get(k);
      if (r) { r.left = Math.max(r.left, seconds); r.hold = r.hold || hold; } else runs.set(k, { at, left: seconds, hold, held: 0 });   // alloc-rare: one record for each injection started (a learner's action), never per frame
      injMsg.k = k; injMsg.at = at; injMsg.opts.seconds = opts.seconds; injMsg.opts.hold = hold;
      if (!post(injMsg)) return local.inject(k, at, opts);
      active = true; injecting = true; pendingInject = 1;
    },
    release() { if (failed) return local.release(); for (const r of runs.values()) r.hold = false; post({ t: 'release' }); },
    clear() {
      if (failed) return local.clear();
      post({ t: 'clear' });
      // (A new generation: the step out, if any, is no longer awaited, and what was owed was time before the clear.)
      out = 0; owed = 0; owedNet = null; runs.clear();
      fields.fill(0); has.fill(0); active = false; injecting = false; pendingInject = 0;
    },
    get active() { return failed ? local.active : active; },
    get injecting() { return failed ? local.injecting : injecting; },
    get count() { return failed ? local.count : has.reduce((a, b) => a + b, 0); },
    step(dt, net) {
      if (failed) return local.step(dt, net);
      for (const [k, r] of runs) { r.left -= dt; r.held += dt; if (r.held >= DYE_MAX_HOLD) r.hold = false; if (r.left <= 0 && !r.hold) runs.delete(k); }
      if (out) {
        if (now() - sentAt > timeout) { fail('timeout'); return local.step(dt + owed, net); }
        owed += dt; owedNet = net; return;
      }
      const t = dt + owed;
      owed = 0; owedNet = null;
      try { send(t, net); } catch { fail('post'); local.step(t, net); }
    },
    field(k, net, row) {
      if (failed) return local.field(k, net, row);
      if (!has[k]) { row.fill(0); return false; }
      row.set(fields.subarray(k * DYE_BINS, (k + 1) * DYE_BINS));
      return true;
    },
    get seq() { return gotSeq; },
    /** True while the worker steps the bolus (stage.js asks a paused step of it); false on the main thread after a failure. */
    get remote() { return !failed; },
    get failed() { return failed; },
    /** Ends the worker; what is left runs on the main thread, cleared. */
    dispose() { if (!failed) { fail('disposed'); local.clear(); } },
  };
}
