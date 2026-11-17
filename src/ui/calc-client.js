// The off-screen engine (moved out of presenter-visuals.js on 17 Nov 2026, so the Tests card can run settled sweeps on it too: Tests > IR > TIPS > Curves).
// One makeCalc() is a second engine in its own worker (or its own core on the main thread where no worker will start): request(type, payload) for one-off
// answers and sequence(steps, base, onStep) for a chain of settled states, each step the one before's snapshot with its change. The presenter makes one for
// its decks (presenter.js getCalc); sharedCalc() is one for everything else, made on first use and kept.
// A second engine in its own worker (the main thread when workers are unavailable) computes the slides'
// states, so the live figure keeps running while a presentation is prepared.
export function makeCalc() {
  const pending = new Map();
  let seq = 1, post = null, kill = () => {}, broken = false;
  // Every waiting request settles with an error: a page left open across an update can no longer load the engine (its
  // stamped files are gone from the cache and the server), and the presenter says so instead of waiting for ever.
  const fail = (message) => { broken = true; for (const [reqId, p] of pending) p.done({ type: 'error', reqId, message }); pending.clear(); };
  const onMsg = (m) => {
    const p = pending.get(m.reqId);
    if (!p) return;
    if (m.type === 'seqStep') { p.step?.(m); return; }
    pending.delete(m.reqId); p.done(m);
  };
  const ready = (async () => {
    let w = null;
    try {
      w = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('worker timeout')), 15000);   // (long: a slow load still gets the worker; host.js)
        w.onmessage = (e) => { if (e.data?.type === 'presets') { clearTimeout(t); res(); } };
        w.onerror = (e) => { clearTimeout(t); rej(e); };
        w.postMessage({ type: 'visibility', visible: false });
        w.postMessage({ type: 'run', running: false });
        w.postMessage({ type: 'presets', reqId: 0 });
      });
      w.onmessage = (e) => onMsg(e.data); w.onerror = (e) => { e.preventDefault?.(); fail('the engine stopped'); };
      post = (m) => w.postMessage(m); kill = () => w.terminate();
    } catch {
      if (w) { w.onmessage = w.onerror = null; w.terminate(); }   // (a worker that never said hello: not left running beside the page's own engine)
      try {
        const { createCore } = await import('../worker-core.js');
        const core = createCore((m) => setTimeout(() => onMsg(m), 0));
        core.handle({ type: 'visibility', visible: false }); core.handle({ type: 'run', running: false });
        post = (m) => core.handle(structuredClone(m)); kill = () => core.dispose();
      } catch { fail('the engine could not load'); }
    }
  })();
  const send = async (msg, entry) => {
    await ready;
    if (broken) { entry.done({ type: 'error', reqId: msg.reqId, message: 'the engine is unavailable' }); return; }
    pending.set(msg.reqId, entry); post(msg);
  };
  return {
    request: (type, payload = {}) => new Promise((done) => send({ type, reqId: seq++, ...payload }, { done })),
    sequence: (steps, base, step) => new Promise((done) => send({ type: 'sequence', reqId: seq++, steps, base }, { done, step })),
    kill: () => kill(),
    get broken() { return broken; },
  };
}

let shared = null;
/** The one calculator the Tests card (and anything else that is not a deck) shares, made on first use. */
export const sharedCalc = () => (shared ||= makeCalc());
