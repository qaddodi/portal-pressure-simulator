// Whether a card's GPU widgets (its sliders, buttons and readouts' pictures, widget-gl.js) are up (18 Nov 2026, Mohammad, the iPhone: "the card opens half-rendered: a default background, sliders that are not in their final render,
// then it switches to the real look"). A widget's own page look is only its fallback and gives way when the GPU's picture is up (.wgl-on). card.js builds a card that is coming up from nothing
// without showing it (ac-prep) and opens it once its widgets are up, for at most PREP_MAX_MS; a screen whose widgets never come up (no context to spare) is found out after two such waits and waits no more.
export const widgetState = { live: 0, misses: 0 };
/** Whether a card's widgets are still to come up: one of its .wgl canvases whose element has not gone .wgl-on, on a screen where they do or may. */
export function widgetsPending(card) {
  if (!card?.querySelectorAll) return false;
  if (!widgetState.live && widgetState.misses >= 2) return false;   // (no widget has ever come up here, and two cards waited for nothing: the page's own look it is)
  // (A slider's picture is made when its box is first seen near the screen (slider-gl.js), a frame or more after the card is built: the box is waited for as well as the canvas, or a card with sliders
  // read as ready in the moment before they were made, opened, and drew them in front of the reader.)
  const w = card.querySelectorAll('.range-wrap, .wgl');
  for (let i = 0; i < w.length; i++) {
    const host = w[i].classList.contains('wgl') ? w[i].parentElement : w[i];
    if (host && !host.classList.contains('wgl-on')) return true;
  }
  return false;
}

export const PREP_MAX_MS = 450;
/** Shows `el` by calling go() once its GPU widgets are drawn and the fonts are in: at once when nothing is pending (no hold, nothing changes); otherwise the element is held (prep-hold: laid out, not seen, no
 *  animation running, app-03-layouts.css) and go() is called, at most `max` ms later, with the hold taken off in the same task, so its plate, its glass and its words all begin in the same frame, on the final render.
 *  Returns the cancel. A wait that ran out is counted against the screen's widgets (widgetsPending). 18 Nov 2026, Mohammad: no surface opens half-rendered. */
export function enterWhenReady(el, go, max = PREP_MAX_MS, hold = true) {
  const fontsIn = () => typeof document === 'undefined' || document.fonts?.status !== 'loading';
  if (!widgetsPending(el) && fontsIn()) { go(); return () => {}; }
  if (hold) el.classList.add('prep-hold');   // (a surface already held out of sight by its own means, a thrown deck card at opacity 0, passes hold = false)
  const t0 = performance.now();
  let timer = 0, dead = false;
  const poll = () => {
    if (dead) return;
    if (!el.isConnected || el.hidden) { el.classList.remove('prep-hold'); return; }   // (put away before it was shown: nothing to show)
    const up = !widgetsPending(el) && fontsIn(), late = performance.now() - t0 >= max;
    if (!up && !late) { timer = setTimeout(poll, 24); return; }
    if (!up) widgetState.misses++;
    el.classList.remove('prep-hold');
    go();
  };
  timer = setTimeout(poll, 0);
  return () => { dead = true; clearTimeout(timer); };   // (the hold stays: an element put away before it was shown goes while still unseen, not in a flash)
}
