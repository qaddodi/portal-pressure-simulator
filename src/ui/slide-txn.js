// A slide change as one transaction (review pass 2, priority 3; 2 Nov 2026).
//
// Every Next, Back or jump begins a transaction with an id of its own (a generation). Beginning one supersedes the one before: it is
// cancelled at once, its AbortSignal fires, and what it took (cards it made inert, preparation jobs, timers) is given back by the
// release functions it registered (onRelease), newest first. The slide change checks live() after every asynchronous boundary, and
// publishes only through publish(fn), which runs fn only while the transaction is still the current one, so content, visibility,
// the camera's destination and who owns the cards' input are committed together by the change that is current, never by a stale one.
// Old cards are disowned (own(els): inert, so no tap or focus reaches a card on its way out or held out of sight) until the change's
// commit gives them back (restore) or the next transaction does.
//
//   const txns = createTxns();
//   const t = txns.begin({ to, dir });   t.live()  t.signal  t.onRelease(fn)  t.publish(fn) → bool  t.own(els)  t.restore(els)  t.end()
//   txns.current()  txns.stats()
import { caught } from './caught.js';

export function createTxns() {
  let cur = null, ids = 0;
  const st = { begun: 0, superseded: 0, published: 0, stale: 0, ended: 0, released: 0, owned: 0 };
  function release(t) {
    const fns = t.releases.splice(0).reverse();
    for (const f of fns) { try { f(); } catch (e) { setTimeout(() => { throw e; }); } st.released++; }
  }
  function begin(meta = {}) {
    const was = cur;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = {
      id: ++ids, meta, over: false, releases: [], disowned: new Set(),
      signal: ctl?.signal || null,
      live: () => cur === t && !t.over,
      onRelease(fn) { if (t.over) { try { fn(); } catch (e) { caught('slide-txn:32', e); /* given back already */ } return; } t.releases.push(fn); },
      /** Runs fn only while this is the current transaction; false (and counted stale) otherwise. */
      publish(fn) { if (!t.live()) { st.stale++; return false; } fn?.(); st.published++; return true; },
      /** Takes els' input away (inert) for the change: given back by restore, end, or the next transaction. */
      own(els) {
        for (const el of els) {
          if (!el || t.disowned.has(el) || el.inert) continue;
          el.inert = true; t.disowned.add(el); st.owned++;
        }
      },
      /** Gives els (all, with none) their input back. */
      restore(els) {
        for (const el of els || [...t.disowned]) { if (!t.disowned.delete(el)) continue; el.inert = false; }
      },
      /** The change is over (landed, or given up): what it holds is given back. A transaction ends once. */
      end() { if (t.over) return; t.over = true; t.restore(); release(t); if (cur === t) cur = null; st.ended++; },
    };
    t.onRelease(() => ctl?.abort());
    cur = t;
    st.begun++;
    if (was && !was.over) {
      st.superseded++;
      // (Cards the old change disowned and the new one has not: given back only by the new one's commit, so they stay out of reach.)
      for (const el of was.disowned) { was.disowned.delete(el); t.disowned.add(el); }
      was.end();
    }
    return t;
  }
  return { begin, current: () => cur, stats: () => ({ ...st, id: ids }) };
}

// (createScope lives in scope.js now; re-exported here so the presenter and its tests keep their import.)
export { createScope } from './scope.js';

/**
 * A counted lease on a shared hold (R02, 3 Nov 2026): take() returns a release that works once (a second call does nothing), so a
 * move that is cut, thrown or finished twice cannot give back a hold another move took. onFirst runs when the count leaves 0 and
 * onLast when it returns to 0; a take with the count above 0 changes nothing. count() is what is held now.
 */
export function createLease(onFirst, onLast) {
  let n = 0;
  return {
    take() {
      if (++n === 1) { try { onFirst?.(); } catch (e) { caught('slide-txn:lease', e); } }
      let held = true;
      return () => {
        if (!held) return false;
        held = false;
        if (--n === 0) { try { onLast?.(); } catch (e) { caught('slide-txn:lease', e); } }
        return true;
      };
    },
    count: () => n,
  };
}
