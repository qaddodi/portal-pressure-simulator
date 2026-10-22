// Whether this browser can draw the sinusoid view (it needs WebGL2). Kept apart from sinusoid-view.js so the app's start-up and the
// presenter can ask without loading the view (the sinusoid view loads after the first paint, with the lobule).
let support = null;

/** Whether this browser can draw the sinusoid view (WebGL2). Asked before the view exists, it makes one canvas context and gives it
 *  straight back (a page holds only so many); once the view has its own, that answer (noteSinusoidSupport) is the one kept. */
export function sinusoidSupported() {
  if (support == null) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      support = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { support = false; }
  }
  return support;
}

/** The sinusoid view made (or failed to make) its own context: that is the answer. */
export function noteSinusoidSupport(ok) { support = !!ok; }
