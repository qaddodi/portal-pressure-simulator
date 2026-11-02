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
//
// ?slidetxn=0: the presenter keeps its own checks only (want and gen), as before.
import { caught } from './caught.js?v=b96b17594a';
export const SLIDE_TXN = !(typeof location !== 'undefined' && /[?&]slidetxn=0\b/.test(location.search || ''));

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
