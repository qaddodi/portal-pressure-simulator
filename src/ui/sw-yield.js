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
import { caught } from './caught.js';
const SOFTWARE = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;
/** Whether this WebGL context is drawn on the CPU. */
export function softwareGL(gl) {
  let name;
  try {
    const ri = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(gl.getParameter(ri ? ri.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); // alloc-rare: once, when a WebGL context is made, never per frame
  } catch { name = ''; }
  return rendererVerdict(SOFTWARE.test(name), name);
}
// A rasterizer the renderer string names outright (Chrome's SwiftShader, Mesa's llvmpipe and softpipe, Windows' WARP "Basic Render
// Driver") draws on the CPU whatever else the browser says: failIfMajorPerformanceCaveat is a browser's blocklist, not a test of the
// rasterizer (Firefox on llvmpipe, a headless Chrome given --ignore-gpu-blocklist, both hand out the context). Only the vaguer
// "Software" match is still asked of the browser. (Review pass 2, item 12: a genuinely software renderer is never put on the GPU path.)
const RASTERIZER = /SwiftShader|llvmpipe|softpipe|Basic Render/i;

// The software path (8 frames a second at half the pixels) must never be taken on a device with a real GPU (120 Hz recs P3, 2 Nov 2026).
// A renderer named as software is asked once more, of the browser itself: a context made with failIfMajorPerformanceCaveat is refused
// where the browser draws on the CPU, so a context it does give means the drawing is accelerated whatever the name says, and the GPU
// path is kept.
let accel = null;
/** Whether the browser says WebGL is hardware-accelerated here (a context with failIfMajorPerformanceCaveat given), asked once. */
export function browserAccelerated() {
  if (accel !== null) return accel;
  accel = false;
  try {
    const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    const g = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) || c.getContext('webgl', { failIfMajorPerformanceCaveat: true }); // alloc-rare: once, when a WebGL context is made, never per frame
    accel = !!g;
    g?.getExtension('WEBGL_lose_context')?.loseContext();   // (the probe's context given back at once: no slot of the page's held)
  } catch { accel = false; }
  return accel;
}
/** The final word on software, from the renderer's name (`named`) and the browser's own answer. */
export function rendererVerdict(named, name = '') {
  if (!named) return false;
  if (RASTERIZER.test(String(name))) return true; // alloc-rare: once, when a WebGL context is made, never per frame
  return !browserAccelerated();
}

const MAX_WAIT = 2000;   // (one frame held up by something else, a long layout or a paused tab, never stalls the vessels longer)

/** gl: the vessel canvas's context, for the fence (none: the T ms wait alone). */
export function softwareYield(software, gl = null) {
  if (!software) return null;
  let drawn = null, free = 0, fence = null;   // (drawn: when the last vessel frame was drawn, until the next frame starts)
  const finished = () => { // alloc-rare: once, when a WebGL context is made, never per frame
    if (!fence) return true;
    let done;
    try { done = gl.isContextLost() || gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED; } catch { done = true; }
    if (done) { try { gl.deleteSync(fence); } catch (e) { caught('sw-yield:66', e); /* context lost */ } fence = null; }
    return done;
  };
  return { // alloc-rare: once, when a WebGL context is made, never per frame
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
