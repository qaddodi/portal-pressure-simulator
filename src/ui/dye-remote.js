// The dye bolus as the figure sees it, its slugs stepped in a worker (dye-worker.js; recs-2 §3.1, 2 Nov 2026). The same calls as
// blood.js createBolus (inject, release, clear, step, field, active, injecting), so stage.js uses either. step() hands the worker the
// frame's time and the vessels' flows and lengths; field() answers from the last table the worker sent back (one step behind, the
// same lag every frame, so the dye moves evenly). While a step is out, the next frames' time is added up and sent with the next, so
// none is lost. An injection shows as active at once (the figure keeps drawing until the first table comes). Where no worker can be
// made, or with ?dyeworker=0, it is createBolus itself, on the main thread as before.
import { createBolus, DYE_BINS } from './blood.js?v=a70439097a';

export const DYE_WORKER = typeof Worker === 'function' && !(typeof location !== 'undefined' && /[?&]dyeworker=0\b/.test(location.search || ''));

/** A bolus for `edges`/`nodes`; `makeWorker()` returns the worker (stage.js builds it, so the bundle can point it at its file). */
export function createDyeRemote(edges, nodes, makeWorker) {
  let w = null;
  if (DYE_WORKER && makeWorker) try { w = makeWorker(); } catch { w = null; }
  if (!w) return createBolus(edges, nodes);
  const local = createBolus(edges, nodes);   // (taken over if the worker fails)
  let failed = false;
  const nE = edges.length;
  let fields = new Float32Array(nE * DYE_BINS), has = new Uint8Array(nE);
  let active = false, injecting = false, seq = 0, out = 0, gotSeq = 0, owed = 0, owedNet = null, clearedAt = 0;
  const plain = (a) => Float64Array.from(a);
  const send = (dt, net) => { out = ++seq; w.postMessage({ t: 'step', seq: out, dt, Q: plain(net.Q), vd: plain(net.vd), len: plain(net.len) }); };
  w.onmessage = (e) => {
    const m = e.data;
    if (m.seq !== out) return;
    out = 0;
    // (A table asked for before a clear is not shown.)
    if (m.seq > clearedAt) { fields = m.fields; has = m.has; active = m.active || pendingInject > 0; injecting = m.injecting || pendingInject > 0; gotSeq = m.seq; }
    pendingInject = 0;
    if (owedNet) { const n = owedNet, dt = owed; owed = 0; owedNet = null; send(dt, n); }
  };
  w.onerror = () => { failed = true; };
  let pendingInject = 0;
  w.postMessage({ t: 'init', edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })), nodes: nodes.map((n) => ({ id: n.id })) });
  return {
    inject(k, at = 0, opts = {}) {
      if (failed) return local.inject(k, at, opts);
      w.postMessage({ t: 'inject', k, at, opts: { seconds: opts.seconds, hold: !!opts.hold } });
      active = true; injecting = true; pendingInject = 1;
    },
    release() { if (failed) return local.release(); w.postMessage({ t: 'release' }); },
    clear() {
      if (failed) return local.clear();
      w.postMessage({ t: 'clear' });
      clearedAt = seq; fields.fill(0); has.fill(0); active = false; injecting = false; pendingInject = 0;
    },
    get active() { return failed ? local.active : active; },
    get injecting() { return failed ? local.injecting : injecting; },
    get count() { return failed ? local.count : has.reduce((a, b) => a + b, 0); },
    step(dt, net) {
      if (failed) return local.step(dt, net);
      if (out) { owed += dt; owedNet = net; return; }
      send(dt + owed, net); owed = 0; owedNet = null;
    },
    field(k, net, row) {
      if (failed) return local.field(k, net, row);
      if (!has[k]) { row.fill(0); return false; }
      row.set(fields.subarray(k * DYE_BINS, (k + 1) * DYE_BINS));
      return true;
    },
    get seq() { return gotSeq; },
    remote: true,
  };
}
