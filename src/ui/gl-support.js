// Whether this browser can draw the sinusoid view (it needs WebGL2). Kept apart from sinusoid-view.js so the app's start-up and the
// presenter can ask without loading the view (the sinusoid view loads after the first paint, with the lobule).
let support = null;

/** WebGL contexts are made when the view that draws with them is about to show, and given back when it leaves (a page holds only so many:
 *  iOS Safari about 16, dropping the oldest, which is the figure's). ?ctxlazy=0 makes them at the start, as before. */
export const CTX_LAZY = !(typeof location !== 'undefined' && /[?&]ctxlazy=0\b/.test(location.search || ''));

/** A WebGL2 context the app already holds, if any: the figure's canvas, which the stage keeps. Asking it costs no new context. */
function heldContext() {
  try {
    // (#veins is made by the stage with a webgl2 context already; a canvas holding another kind of context answers null, makes nothing.)
    const cv = typeof document !== 'undefined' && document.getElementById('veins');
    return cv && cv.width > 0 && (cv.getContext('webgl2') || null);
  } catch { return null; }
}

/** Whether this browser can draw the sinusoid view (WebGL2). Asked before the view exists, it asks a context the page already holds;
 *  only with none does it make one canvas context, and that one is given back at once (a page holds only so many). Once the view
 *  has its own, that answer (noteSinusoidSupport) is the one kept. */
export function sinusoidSupported() {
  if (support == null) {
    try {
      const held = CTX_LAZY ? heldContext() : null;
      if (held) { support = true; return support; }
      const gl = document.createElement('canvas').getContext('webgl2');
      support = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { support = false; }
  }
  return support;
}

/** The sinusoid view made (or failed to make) its own context: that is the answer. */
export function noteSinusoidSupport(ok) { support = !!ok; }
