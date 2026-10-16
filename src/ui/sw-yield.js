// A software renderer's yield: only where the browser draws WebGL on the CPU (no usable GPU: SwiftShader, llvmpipe,
// Microsoft Basic Render Driver), never on a GPU.
//
// There a frame of the vessels costs the CPU 0.4 to 3 s (on a CI runner). Shown, it holds the page until it is drawn, and
// drawn back to back they left the page about one frame a second, its timers running 10 to 20 times late (a slide's timed
// steps, the workers computing the slides). Unseen (a canvas hidden), nothing holds the page, but the frames pile up behind
// one another for the GPU, which then runs for a minute after the page has gone, and the next page waits behind them.
// So a vessel frame is drawn only once the last one has finished on the GPU (a fence), and after a frame that held the
// page T ms, not before T ms more have passed: at least half the time is the page's. Neither is a frame rate: a quick
// frame waits as little. Only the model's own motion (the blood, an easing) waits so: a pan, zoom, glide, resize or forced
// draw is drawn at once (ready(now, true)), in the same frame as the rest of the figure, so no frame shows the vessels
// behind it. On a GPU the stage makes no yield at all (softwareYield(false) is null), so its frames run exactly as before.

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

const MAX_WAIT = 2000;   // (one frame held up by something else, a long layout or a paused tab, never stalls the vessels longer)

/** gl: the vessel canvas's context, for the fence (none: the T ms wait alone). */
export function softwareYield(software, gl = null) {
  if (!software) return null;
  let drawn = null, free = 0, fence = null;   // (drawn: when the last vessel frame was drawn, until the next frame starts)
  const finished = () => {
    if (!fence) return true;
    let done = true;
    try { done = gl.isContextLost() || gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED; } catch { done = true; }
    if (done) { try { gl.deleteSync(fence); } catch { /* context lost */ } fence = null; }
    return done;
  };
  return {
    /** Whether a vessel frame may be drawn at `now` (false: the page's turn); `force`: a view change, resize or forced draw, drawn at once. */
    ready(now, force = false) {
      if (drawn !== null) { free = now + Math.min(MAX_WAIT, Math.max(0, now - drawn)); drawn = null; }
      const done = finished();
      return force || (done && now >= free);
    },
    /** A vessel frame was drawn in the frame at `now`: its fence follows its commands to the GPU. */
    drew(now) {
      drawn = now;
      if (!gl) return;
      try {
        if (fence) gl.deleteSync(fence);
        fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
      } catch { fence = null; }
    },
  };
}
