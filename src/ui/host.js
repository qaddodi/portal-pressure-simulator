// Engine host: Web Worker when available, same-thread fallback otherwise (blueprint §7.7, §13.4).

let impl = null;
const handlers = new Map();
let reqSeq = 1;
const pending = new Map();

function dispatch(msg) {
  if (msg.reqId && pending.has(msg.reqId)) {
    const res = pending.get(msg.reqId); pending.delete(msg.reqId); res(msg);
  }
  (handlers.get(msg.type) || []).forEach((fn) => fn(msg));
}

export async function startHost() {
  try {
    const w = new Worker(new URL('../worker.js?v=3291da8915', import.meta.url), { type: 'module' });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('worker timeout')), 4000);
      w.onmessage = (e) => { clearTimeout(t); w.onmessage = (ev) => dispatch(ev.data); dispatch(e.data); resolve(); };
      w.onerror = (e) => { clearTimeout(t); reject(e); };
      w.postMessage({ type: 'init' });
    });
    impl = { post: (m) => w.postMessage(m), kind: 'worker' };
  } catch (err) {
    console.warn('Web Worker unavailable, running engine on main thread.', err);
    const { createCore } = await import('../worker-core.js?v=c3d984ada1');
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
    return new Promise((resolve) => { pending.set(reqId, resolve); impl.post({ type, reqId, ...payload }); });
  },
};
