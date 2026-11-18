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
