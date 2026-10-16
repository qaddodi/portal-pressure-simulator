// A software renderer's yield: only where the browser draws WebGL on the CPU (no usable GPU: SwiftShader, llvmpipe,
// Microsoft Basic Render Driver), never on a GPU.
//
// There a frame of the vessels costs the CPU 0.4 to 3 s (on a CI runner). Shown, it holds the page until it is drawn, and
// drawn back to back they left the page about one frame a second, its timers running 10 to 20 times late (a slide's timed
// steps, the workers computing the slides). Unseen (a canvas hidden), nothing holds the page, but the frames pile up behind
// one another for the GPU, which then runs for a minute after the page has gone, and the next page waits behind them.
// So a vessel frame is drawn only once the last one has finished on the GPU (a fence), and after a frame that held the
// page T ms, not before T ms more have passed: at least half the time is the page's. Neither is a frame rate: a quick
// frame waits as little. Only the model's own motion (the blood, the morph, an easing after its first frame) waits so:
// anything a person does is drawn at once, in the same frame as the rest of the page, so no frame shows the vessels behind
// it. A pan, zoom, glide, resize or forced draw passes ready(now, true); a store change other than the model's own frames,
// a theme, class or style change on the figure or above it, the system's light or dark, or a hover marks the yield
// (prompt(), see watchPerson) and the next frame is drawn at once. On a GPU the stage makes no yield at all
// (softwareYield(false) is null, and nothing is watched), so its frames run exactly as before.

// The renderer test, the same as veins-gl.js's (tests/sw-yield.test.js holds the two together): only a software rasterizer
// named by the WebGL renderer string. A masked or generic name (Safari's "Apple GPU", ANGLE Metal, Mali, Adreno, Intel) is a GPU.
const SOFTWARE = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;
/** Whether this WebGL context is drawn on the CPU. */
export function softwareGL(gl) {
  try {
    const ri = gl.getExtension('WEBGL_debug_renderer_info');
    return SOFTWARE.test(String(gl.getParameter(ri ? ri.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
  } catch { return false; }
}

// The store keys the model sets by itself while it runs (its frames and their history): no person changed anything.
const MODEL_KEYS = new Set(['frame', 'historyTick', 'lastHVPG']);
/** Calls `mark` on anything a person sets off that can change the picture: a store change other than the model's own, a
 *  class, style or theme on `el` or any element above it, the system's light or dark setting. (Only for a software yield.) */
export function watchPerson(store, el, mark) {
  store.on('*', (keys) => { if (!Array.isArray(keys) || keys.some((k) => !MODEL_KEYS.has(k))) mark(); });
  const mo = new MutationObserver(mark);
  for (let e = el; e; e = e.parentElement) mo.observe(e, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-noglass', 'data-mode'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', mark);
}

const MAX_WAIT = 2000;   // (one frame held up by something else, a long layout or a paused tab, never stalls the vessels longer)

/** gl: the vessel canvas's context, for the fence (none: the T ms wait alone). */
export function softwareYield(software, gl = null) {
  if (!software) return null;
  let drawn = null, free = 0, fence = null, asked = false;   // (drawn: when the last vessel frame was drawn, until the next frame starts; asked: a person's change waits to be drawn)
  const finished = () => {
    if (!fence) return true;
    let done = true;
    try { done = gl.isContextLost() || gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED; } catch { done = true; }
    if (done) { try { gl.deleteSync(fence); } catch { /* context lost */ } fence = null; }
    return done;
  };
  return {
    /** Whether a vessel frame may be drawn at `now` (false: the page's turn); `force`: a view change, resize or forced draw,
     *  drawn at once, as is a person's change (prompt). */
    ready(now, force = false) {
      if (drawn !== null) { free = now + Math.min(MAX_WAIT, Math.max(0, now - drawn)); drawn = null; }
      const done = finished();
      return force || asked || (done && now >= free);
    },
    /** A person changed something: the next vessel frame is drawn at once (the eased frames after it may wait again). */
    prompt() { asked = true; },
    /** A person's change still waits to be drawn. */
    get asked() { return asked; },
    /** A vessel frame was drawn in the frame at `now`: its fence follows its commands to the GPU. */
    drew(now) {
      drawn = now; asked = false;
      if (!gl) return;
      try {
        if (fence) gl.deleteSync(fence);
        fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
      } catch { fence = null; }
    },
  };
}
