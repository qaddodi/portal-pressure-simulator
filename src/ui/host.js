// Engine host: Web Worker when available, same-thread fallback otherwise (blueprint §7.7, §13.4).

let impl = null;
let liveWorker = null;      // the engine's worker while it is healthy
let failed = false;         // the worker stopped for good (an uncaught error): sends and requests are refused until restartHost()
const handlers = new Map();
let reqSeq = 1;
const pending = new Map();

function dispatch(msg) {
  if (msg.reqId && pending.has(msg.reqId)) {
    // An engine error rejects its request, so nothing waits on it forever.
    const p = pending.get(msg.reqId); pending.delete(msg.reqId); clearTimeout(p.timer);
    if (msg.type === 'error') p.reject(new Error(msg.message)); else p.resolve(msg);
  }
  // (By index over the handlers there were when the message came: one subscribed by a handler is told from the next message on, as forEach did.)
  const list = handlers.get(msg.type);
  if (list) for (let i = 0, n = list.length; i < n; i++) list[i](msg);
}

function crashed(message) {
  // The worker is gone: mark the host failed, let go of the worker, then settle every request still waiting.
  failed = true;
  if (liveWorker) { liveWorker.onmessage = null; liveWorker.onerror = null; try { liveWorker.terminate(); } catch { /* already gone */ } liveWorker = null; }
  impl = { post() { /* a stopped engine takes nothing */ }, kind: 'failed' };
  for (const [id, p] of pending) { pending.delete(id); clearTimeout(p.timer); p.reject(new Error(message)); }
  dispatch({ type: 'crash', message });
}

export const WORKER_WAIT = 15000;
/** How long a request may wait for its answer before it is rejected (a slow preset on a phone still fits). */
export const REQUEST_WAIT = 30000;

// The engine's worker starts in main(), once every module is in. It starts once.
let hostStart = null;
export function startHost() { return (hostStart ??= startHostNow()); }

async function startHostNow() {
  failed = false;
  let w;
  try {
    w = new Worker(new URL('../worker.js?v=ec3e33f710', import.meta.url), { type: 'module' });
    await new Promise((resolve, reject) => {
      // A worker that cannot start fails at once (onerror); the timeout only catches one that never answers. It is long, so
      // a slow first load (the worker's modules arrive one round trip after another) still gets the worker, not the main
      // thread for the whole session.
      const t = setTimeout(() => reject(new Error('worker timeout')), WORKER_WAIT);
      w.onmessage = (e) => { clearTimeout(t); w.onmessage = (ev) => dispatch(ev.data); dispatch(e.data); resolve(); };
      w.onerror = (e) => { clearTimeout(t); reject(e); };
      w.postMessage({ type: 'init', delta: true });
    });
    // After start-up an uncaught error inside the worker is a crash: say so (main.js offers Reload or Restart),
    // and settle every request still waiting, so nothing hangs on an engine that will not answer.
    w.onerror = (e) => { e.preventDefault?.(); crashed(e.message || 'The engine stopped.'); };
    liveWorker = w;
    impl = { post: (m) => w.postMessage(m), kind: 'worker' };
  } catch (err) {
    // A slow module load can finish after the timeout. Never leave a second
    // engine alive, or let its late frames reach the fallback's subscribers.
    if (w) { w.onmessage = null; w.onerror = null; w.terminate(); }
    console.warn('Web Worker unavailable, running engine on main thread.', err);
    const { createCore } = await import('../worker-core.js?v=efbb9ec33c');
    const core = createCore((m) => setTimeout(() => dispatch(m), 0));
    impl = { post: (m) => core.handle(structuredClone(m)), kind: 'main' };
    impl.post({ type: 'init', delta: true });
  }
  return impl.kind;
}

/** True once the engine's worker has stopped; restartHost() brings an engine back. */
export function hostFailed() { return failed; }

/** A new engine in place of a stopped one (a fresh worker, or the main thread where no worker will start). The handlers stay
 *  subscribed; the caller sends again what the engine had been told (visibility, speed) and loads its patient. */
export async function restartHost() {
  if (!failed) return impl?.kind;
  hostStart = null; impl = null;
  return startHost();
}

export const host = {
  send(msg) { impl?.post(msg); },
  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(fn);
  },
  request(type, payload) {
    if (failed || !impl) return Promise.reject(new Error('The engine is not running.'));
    const reqId = reqSeq++;
    return new Promise((resolve, reject) => {   // alloc-rare: a request is one user action (a history snapshot, a preset, a why), never a frame's: the promise, its timer and its message are the request itself
      // (No answer in REQUEST_WAIT: rejected, so a caller is never parked on an engine that will not reply.)
      const timer = setTimeout(() => { if (pending.delete(reqId)) reject(new Error(`The engine did not answer ${type}.`)); }, REQUEST_WAIT);   // alloc-rare: the request's own timer, one per user action
      pending.set(reqId, { resolve, reject, timer });   // alloc-rare: the request's own record, one per user action
      try { impl.post({ type, reqId, ...payload }); } catch (err) { pending.delete(reqId); clearTimeout(timer); reject(err); }   // alloc-rare: the request's own message, one per user action
    });
  },
};
