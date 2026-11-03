// Whether this browser can draw the sinusoid view (it needs WebGL2). Kept apart from sinusoid-view.js so the app's start-up and the
// presenter can ask without loading the view (the sinusoid view loads after the first paint, with the lobule).
import { heldGL } from './gl-state.js';
import { caught } from './caught.js';

let support = null;

/** WebGL contexts are made when the view that draws with them is about to show, and given back when it leaves (a page holds only so many:
 *  iOS Safari about 16, dropping the oldest, which is the figure's). */

/** Whether the page already holds a live WebGL2 context: the figure's canvas, or any other the state record tracks (the charts' pool).
 *  Asking one makes no new context. */
function hostHolds() {
  try {
    // (#veins is made by the stage with a webgl2 context already; a canvas holding another kind of context answers null, makes nothing.)
    const cv = typeof document !== 'undefined' && document.getElementById('veins');
    if (cv && cv.width > 0 && cv.getContext('webgl2')) return true;
  } catch (e) { caught('gl-support:18', e); /* (fall through to the record) */ }
  return !!heldGL();
}

/** Whether this browser can draw the sinusoid view (WebGL2). Asked before the view exists, it asks the host: a context the page already
 *  holds answers yes. With none held it makes none either: the interface's presence is the answer until the view makes its own context
 *  (noteSinusoidSupport), which replaces it. */
export function sinusoidSupported() {
  if (support == null) {
    try {
      if (hostHolds()) support = true;
      else if (typeof WebGL2RenderingContext !== 'undefined') return true;   // (a guess, not kept: asked again until a context answers)
      else {
        const gl = document.createElement('canvas').getContext('webgl2');
        support = !!gl;
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch { support = false; }
  }
  return support;
}

/** The sinusoid view made (or failed to make) its own context: that is the answer. */
export function noteSinusoidSupport(ok) { support = !!ok; }
