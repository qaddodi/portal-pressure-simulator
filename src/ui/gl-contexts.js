// WebGL2 context registry (production review PR-05, 4 Nov 2026). WebKit keeps about 16 live contexts per page and drops the oldest
// silently past that; nothing counted them. gl-state.js hands every context the page makes to noteContext() the moment it is made, so
// the count is a number: made, live (not lost, on a canvas still alive), lost, peak. It shows in ?perf and in `pps.contexts()`, and past
// WARN_AT live contexts the first time it is reached it is reported once through caught().
// Pure bookkeeping: no GL call, nothing drawn, nothing allocated per frame (a context is noted when it is made).
import { caught } from './caught.js';

/** The cap WebKit documents is about 16; warn one below it so there is room to act. */
export const WARN_AT = 14;
const refs = new Set();   // WeakRef to each context made, dropped when its object is collected or lost
let made = 0, lost = 0, peak = 0, warned = false;

function live() {
  let n = 0;
  for (const r of refs) {
    const gl = r.deref();
    if (!gl || gl.isContextLost?.()) { refs.delete(r); continue; }
    n++;
  }
  return n;
}

/** Called once for each new context (gl-state.js's getContext wrapper). `canvas` is the element or OffscreenCanvas that made it. */
export function noteContext(gl, canvas) {
  if (!gl || typeof WeakRef === 'undefined') return;
  made++;
  refs.add(new WeakRef(gl));
  canvas?.addEventListener?.('webglcontextlost', () => { lost++; }, { once: true });
  const n = live();
  if (n > peak) peak = n;
  if (n >= WARN_AT && !warned) { warned = true; caught('gl-contexts:cap', new Error(`${n} live WebGL contexts (WebKit drops the oldest past about 16)`)); }
}

/** { made, live, lost, peak }: made counts every context ever created, live those still usable now. */
export const contextStats = () => ({ made, live: live(), lost, peak });
export const contextText = () => { const s = contextStats(); return `webgl contexts: ${s.live} live, peak ${s.peak}, ${s.made} made, ${s.lost} lost`; };
if (typeof window !== 'undefined') { window.pps = window.pps || {}; window.pps.contexts = contextStats; }
