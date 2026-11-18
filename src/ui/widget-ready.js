// Whether a card's GPU widgets (its sliders, buttons and toasts' pictures, widget-gl.js) are up (18 Nov 2026, Mohammad, the iPhone: "the card's content is showing before it's styled or loaded: default sliders
// and layout"). A widget's own page look is only its fallback and gives way when the GPU's picture is up (.wgl-on); a card's words came in while it still showed that fallback. The glass's clock now waits
// for them (glass-gl.js widgetsPending), for at most HOLD_MAX_MS of a card; a screen whose widgets never come up (no context to spare) is found out after two such waits, and waits no more.
export const widgetState = { live: 0, misses: 0 };
/** Whether a card's widgets are still to come up: one of its .wgl canvases whose element has not gone .wgl-on, on a screen where they do or may. */
export function widgetsPending(card) {
  if (!card?.querySelector) return false;
  if (!widgetState.live && widgetState.misses >= 2) return false;   // (no widget has ever come up here, and two cards waited for nothing: the page's own look it is)
  const w = card.querySelectorAll('.wgl');
  for (let i = 0; i < w.length; i++) { const p = w[i].parentElement; if (p && !p.classList.contains('wgl-on')) return true; }
  return false;
}
