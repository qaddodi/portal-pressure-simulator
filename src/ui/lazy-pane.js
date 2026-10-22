// An instrument whose code loads after the first paint (the Doppler and the FibroScan; main.js lazy() holds the load). The dock builds its
// tab and an empty pane at once; the instrument takes the pane's place when it has arrived, and the dock refits the card around it.
// Until then the dock goes on feeding it, and what it is fed is kept, so it starts with what it would have had: the Doppler's trace
// holds the frames it was sent (`history` of them, each cut down by `slim`), the FibroScan the last it was given.
// An instrument that was loaded ahead (the handle already has it) is returned as it is.
import { h } from './util.js?v=be12b8e102';

/**
 * handle: lazy()'s { get, now }. cls: the classes the real pane has on its own element (so the empty one lays out as it will).
 * history: how many fed frames to keep for a trace (0: none). slim(f): what of a frame the instrument reads when it is only history.
 * onReady(): the instrument is in the pane (the dock fits its card around it and repaints).
 */
export function lazyPane({ id, label, handle, cls = '', history = 0, slim = (f) => f, onReady = () => {} }) {
  const here = handle.now();
  if (here) return here;
  const hole = h('div', { class: `instrument-view ${cls}`.trim() });
  let inst = null, loading = false, past = [], last = null, fed = null;
  /** Ask for the instrument's code now (the first time the pane is shown, or when the app is idle). */
  function need() {
    if (inst || loading) return;
    loading = true;
    hole.replaceChildren();
    handle.get().then((i) => {
      loading = false; inst = i;
      i.el.classList.remove('dock-pane'); i.el.classList.add('instrument-view');
      hole.replaceWith(i.el);
      past.pop();   // (the last frame is given whole, below)
      for (const f of past) i.ingest?.(f);
      if (last) i.ingest?.(last);
      if (fed) i.update?.(fed);
      past = []; last = fed = null;
      onReady();
    }, (err) => {
      loading = false;
      console.warn(`The ${label} did not load.`, err);
      hole.replaceChildren(h('p', { class: 'ctl-sub' }, `The ${label} did not load. Tap its tab to try again.`));
    });
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
    clear() { if (inst) inst.clear(); else { past = []; last = null; } },
  };
}
