// The stage's side of the binning worker (sweep-worker.js): requests out, one promise each, and a worker that can die. A worker that
// errors, answers with something unreadable or sits on a request past its time is dropped whole: its handlers cut, it terminated,
// its reference cleared, and every request it still held rejected, so none is left pending and the callers fall back (a piece of
// the change between views is binned on the main thread; the lobule's first frame bins its own vessels). The next request makes a
// fresh worker; after SWEEP_MAX_FAILS failures in a row none is made and requests reject at once (the same fallback), so a worker
// that cannot run is not started again and again. A reply of any kind, even an error for one request, shows the worker alive and
// ends the count. (B20, bugs-recs 2 Nov 2026.)
export const SWEEP_TIMEOUT = 20000, SWEEP_MAX_FAILS = 3;

/** `make()` returns a new worker (stage.js builds it, so the bundle can point it at its file). */
export function createSweepClient(make, { timeout = SWEEP_TIMEOUT, maxFails = SWEEP_MAX_FAILS } = {}) {
  let w = null, fails = 0, seq = 0;
  const wait = new Map();
  const settle = (id) => { const p = wait.get(id); if (p) { wait.delete(id); clearTimeout(p.timer); } return p; };
  // Drops worker `dead` (a no-op once it is not the current one): cut, terminated, cleared, its requests rejected.
  const drop = (dead, why) => {
    if (w !== dead) return;
    w = null; fails++;
    dead.onmessage = dead.onerror = dead.onmessageerror = null;
    try { dead.terminate(); } catch { /* (already gone) */ }
    for (const id of wait.keys()) settle(id)?.no(why);   // (a Map visits what is left when an entry is deleted during the walk)
  };
  const start = () => {
    const nw = make();
    if (!nw) throw new Error('no worker');
    nw.onmessage = (e) => {
      if (w !== nw) return;
      fails = 0;
      const p = settle(e.data?.id);
      if (p) (e.data.error ? p.no(e.data.error) : p.ok(e.data.b));
    };
    nw.onerror = () => drop(nw, 'worker');
    nw.onmessageerror = () => drop(nw, 'worker');
    return nw;
  };
  return {
    request(msg) {
      if (!w) {
        if (fails >= maxFails) return Promise.reject('worker failed');
        try { w = start(); } catch { w = null; fails++; return Promise.reject('no worker'); }
      }
      const cur = w, id = ++seq;
      return new Promise((ok, no) => {
        wait.set(id, { ok, no, timer: setTimeout(() => drop(cur, 'timeout'), timeout) });
        try { cur.postMessage({ id, ...msg }); } catch (err) { settle(id); no(String(err?.message || err)); }   // (a message that cannot be sent: that request only)
      });
    },
    /** Ends the worker, if any, and rejects what it held. */
    dispose() { if (w) drop(w, 'disposed'); fails = 0; },
    get pending() { return wait.size; },
    get alive() { return !!w; },
  };
}
