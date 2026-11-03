// Replay the change (vision N8, 3 Nov 2026): a slide that plays a change (a drug or other params, an action, days, a lapse, a procedure)
// can run it again from the slide before's state, without Back then Next. The cards stay where they are (V-SLIDE-3); the figure, the
// numbers and the charts ease back to where the change began and play it again on the GPU, as the slide's own first play did.
// This module is the decision only: whether a slide can be replayed, and what the replay plays; presenter.js runs it.

/** Whether slide s (at index i) plays a change that can be replayed. A visual, a first slide, a catheter slide (it drives its own
 *  camera and monitor) and a slide whose change is only the patient arriving (a case card) have nothing to run again. */
export function replayable(s, i) {
  if (!s || i < 1 || s.visual || s.cath || s.vignette) return false;
  return !!(s.preset || s.params || s.action || s.days || s.procedure);
}

/** What the replay plays after the figure has eased back: 'lapse' (its days), 'procedure' (its steps) or 'change' (the easing to the
 *  slide's state). */
export function replayKind(s) {
  return s.lapse ? 'lapse' : s.procedure ? 'procedure' : 'change';
}

/** The state the replay eases back to: a lapse's own start, a procedure's state before it, else the last state before the slide.
 *  states: the deck's computed states; stateOf: slide → the state index it shows. Returns the state, or null if it is not computed. */
export function replayFrom(s, i, states, stateOf) {
  const own = states[stateOf[i]];
  if (s.lapse && own?.start) return own.start;
  if (s.procedure && own?.before) return own.before;
  return states[stateOf[i - 1]] || null;
}
