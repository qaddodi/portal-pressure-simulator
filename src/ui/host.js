// Engine host: Web Worker when available, same-thread fallback otherwise (blueprint §7.7, §13.4).

let impl = null;
const handlers = new Map();
let reqSeq = 1;
const pending = new Map();

function dispatch(msg) {
  if (msg.reqId && pending.has(msg.reqId)) {
    // An engine error rejects its request, so nothing waits on it forever.
    const p = pending.get(msg.reqId); pending.delete(msg.reqId);
    if (msg.type === 'error') p.reject(new Error(msg.message)); else p.resolve(msg);
  }
  (handlers.get(msg.type) || []).forEach((fn) => fn(msg));
}

function crashed(message) {
  for (const [id, p] of pending) { pending.delete(id); p.reject(new Error(message)); }
  dispatch({ type: 'crash', message });
}

export const WORKER_WAIT = 15000;

export async function startHost() {
  let w;
  try {
    w = new Worker(new URL('../worker.js?v=948d87ec58', import.meta.url), { type: 'module' });
    await new Promise((resolve, reject) => {
      // A worker that cannot start fails at once (onerror); the timeout only catches one that never answers. It is long, so
      // a slow first load (the worker's modules arrive one round trip after another) still gets the worker, not the main
      // thread for the whole session.
      const t = setTimeout(() => reject(new Error('worker timeout')), WORKER_WAIT);
      w.onmessage = (e) => { clearTimeout(t); w.onmessage = (ev) => dispatch(ev.data); dispatch(e.data); resolve(); };
      w.onerror = (e) => { clearTimeout(t); reject(e); };
      w.postMessage({ type: 'init' });
    });
    // After start-up an uncaught error inside the worker is a crash: say so (main.js offers Reload or Restart),
    // and settle every request still waiting, so nothing hangs on an engine that will not answer.
    w.onerror = (e) => { e.preventDefault?.(); crashed(e.message || 'The engine stopped.'); };
    impl = { post: (m) => w.postMessage(m), kind: 'worker' };
  } catch (err) {
    // A slow module load can finish after the timeout. Never leave a second
    // engine alive, or let its late frames reach the fallback's subscribers.
    if (w) { w.onmessage = null; w.onerror = null; w.terminate(); }
    console.warn('Web Worker unavailable, running engine on main thread.', err);
    const { createCore } = await import('../worker-core.js?v=805de43406');
    const core = createCore((m) => setTimeout(() => dispatch(m), 0));
    impl = { post: (m) => core.handle(structuredClone(m)), kind: 'main' };
    impl.post({ type: 'init' });
  }
  return impl.kind;
}

export const host = {
  send(msg) { impl?.post(msg); },
  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(fn);
  },
  request(type, payload = {}) {
    const reqId = reqSeq++;
    return new Promise((resolve, reject) => { pending.set(reqId, { resolve, reject }); impl.post({ type, reqId, ...payload }); });
  },
};
