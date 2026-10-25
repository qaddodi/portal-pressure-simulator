// An instrument whose code loads after the first paint (the Doppler and the FibroScan; main.js lazy() holds the load). The dock builds its
// tabs at once. A tab for an instrument that has not arrived waits for it (dock.js: the pane it leaves stays up until the instrument is ready,
// so no pane ever shows empty), and the dock asks for it as soon as the card opens, when a tab is touched, and when the app is idle.
// The dock goes on feeding it meanwhile, and what it is fed is kept, so it starts with what it would have had: the Doppler's trace holds the
// frames it was sent (`history` of them, each cut down by `slim`), the FibroScan the last it was given.
// An instrument that was loaded ahead (the handle already has it) is returned as it is.
import { h } from './util.js?v=d2c95a1b16';

/**
 * handle: lazy()'s { get, now }. cls: the classes the real pane has on its own element (so the empty one lays out as it will).
 * history: how many fed frames to keep for a trace (0: none). slim(f): what of a frame the instrument reads when it is only history.
 * onReady(): the instrument is in the pane (the dock fits its card around it and repaints).
 */
export function lazyPane({ id, label, handle, cls = '', history = 0, slim = (f) => f, onReady = () => {} }) {
  const here = handle.now();
  if (here) return here;
  const hole = h('div', { class: `instrument-view ${cls}`.trim() });   // (shown only if the load fails: the dock waits for the instrument before it shows the pane)
  let inst = null, waiting = null, past = [], last = null, fed = null, hist = null;
  /** Ask for the instrument's code. null once the instrument is in its pane; else a promise that settles (it never rejects) when it has
   *  come, or has failed (the pane then says so, and asking again tries again). */
  function need() {
    if (inst) return null;
    return (waiting ||= handle.get().then((i) => {
      inst = i;
      i.el.classList.remove('dock-pane'); i.el.classList.add('instrument-view');
      hole.replaceWith(i.el);
      past.pop();   // (the last frame is given whole, below)
      for (const f of past) i.ingest?.(f);
      if (last) i.ingest?.(last);
      if (fed) i.update?.(fed);
      if (hist) i.backfill?.(hist);   // (the steady state's last seconds, if one was sent before the instrument came: backfill.js)
      past = []; last = fed = hist = null;
      onReady();
    }, (err) => {
      console.warn(`The ${label} did not load.`, err);
      hole.replaceChildren(h('p', { class: 'ctl-sub' }, `The ${label} did not load. Tap its tab to try again.`));
    }).catch((err) => console.error(err)).then(() => { waiting = null; }));
  }
  return {
    id, label, el: hole, need,
    ingest(f) {
      if (inst) { inst.ingest(f); return; }
      last = f;
      if (history) { past.push(slim(f)); if (past.length > history) past.splice(0, past.length - history); }
    },
    update(f) { if (inst) inst.update(f); else fed = f; },
    redraw() { inst?.redraw?.(); },
    clear() { if (inst) inst.clear(); else { past = []; last = null; hist = null; } },
    backfill(hs) { if (inst) return inst.backfill?.(hs) ?? false; hist = hs; return false; },
  };
}

/**
 * For a dock: afterLoad(id, go) calls go() once the instrument for `id` is in its pane, and says whether it is waiting (true) or the
 * instrument is already there (false, go not called: the caller goes on at once). The pane the dock is leaving stays up meanwhile, so no
 * pane shows empty. The latest ask wins: a tab tapped while another is waited for takes its place.
 */
export function holdUntilLoaded(pane) {
  let seq = 0;
  return (id, go) => {
    const mine = ++seq, wait = pane(id)?.need?.();
    if (!wait) return false;
    wait.then(() => { if (mine === seq) go(); });
    return true;
  };
}
