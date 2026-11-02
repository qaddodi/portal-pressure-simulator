// Every change of a figure canvas's resolution eases (Mohammad, 30 Oct: "everything should transition ease nothing snaps"): the
// picture as it stood is kept and, for FADE_MS, mixed into what the canvas draws next as old × a + new × (1 − a), the sum of the two
// weights always 1 (laying the old copy over the new one brightened every translucent pixel mid-fade, his 30 Oct report). follow()
// (optional) gives the old picture's transform each frame ([a, b, c, d, e, f], CSS px), so it moves with a view that moves meanwhile
// (stage.js). A second change while one still fades starts from the mix as it shows, so neither picture jumps. Since 1 Nov the mix is
// made only on the GPU, inside the canvas's own presents (res-fade-gl.js); the canvas stays shown, so its opacity is never touched.
import { finalFrameFor, noteDraw } from './frame.js?v=31edc44488';
import { D_SURFACE } from './ease.js?v=7513a88c68';
import { keepOnGpu } from './res-fade-gl.js?v=3cf9d3504d';

export const FADE_MS = D_SURFACE;
/** The old picture's weight u of the way through the fade: 1 to 0, smoothstep (no step at either end). */
export const fadeAlpha = (u) => { const t = Math.min(1, Math.max(0, u)); return 1 - t * t * (3 - 2 * t); };

const late = finalFrameFor('res-fade');
// (Since 1 Nov 2026 (Mohammad: "Move everything to GPU") the fade runs only on the GPU (res-fade-gl.js): the picture before copied once
// inside the GPU and mixed in at each present of the canvas's own renderer (host: veins-gl top), the canvas left shown, nothing read
// back. The 2D mix (a WebGL canvas copied into a 2D canvas twice a frame) is gone, ?fadegpu=0 with it: a canvas with no such renderer
// (no WebGL, a lost context) takes its new resolution at once.)
const fades = new Map();   // canvas → { gpu, t0, follow, at (the translate it showed at), capture, w, h (its CSS box) }

/** A CSS `translate` value as [x, y] px ('' is none). */
export const translateOf = (v) => { const [x = 0, y = 0] = String(v || '').trim().split(/\s+/).filter(Boolean).map((t) => parseFloat(t) || 0); return [x, y]; };
/** Where the old picture is drawn in the mix: it showed at p + at on screen, follow (m, CSS px) carries that to where it is now, and the
 *  mix itself shows moved by now: so q = m(p + at) − now. */
export function oldPlace(m, at, now) {
  const [a, b, c, d, e, f] = m || [1, 0, 0, 1, 0, 0];
  return [a, b, c, d, a * at[0] + c * at[1] + e - now[0], b * at[0] + d * at[1] + f - now[1]];
}
let asked = false;

function endGpu(canvas, f) {
  f.gpu.remove(); fades.delete(canvas);
  try { if (canvas.isConnected) f.capture?.(); } catch { /* (a lost context: nothing to lay) */ }   // (the picture alone, at once)
}

function step() {
  asked = false;
  const now = performance.now();
  for (const [canvas, f] of fades) {
    const u = (now - f.t0) / FADE_MS;
    if (u >= 1 || !canvas.isConnected) { endGpu(canvas, f); continue; }
    f.gpu.set(fadeAlpha(u), oldPlace(f.follow?.(), f.at, translateOf(canvas.style.translate)), f.w, f.h);
    try { f.capture?.(); } catch { endGpu(canvas, f); continue; }
    noteDraw('res-fade');
  }
  if (fades.size) { asked = true; late(step); }
}

/** Keeps canvas's picture and shows it mixed into what the canvas is drawn next, on the GPU; call it just before the canvas is resized.
 *  follow (optional): the old picture's transform each frame. capture (optional): puts the canvas's whole current picture on it, called
 *  just before each read. host: the canvas's own renderer's { gl, canvas, add } (veins-gl top). box: the canvas's CSS size { w, h },
 *  as its owner last laid it out (no layout is read here). Without a host the change is taken at once. */
export function fadeOver(canvas, follow = null, capture = null, host = null, box = null) {
  if (!host?.gl || host.canvas !== canvas || !canvas?.isConnected || canvas.width < 2 || canvas.height < 2) return;
  const w = box?.w, h = box?.h;
  if (!(w > 0 && h > 0)) return;
  const was = fades.get(canvas);
  // (The picture before: the canvas as presented now, with the mix still under way when one is.)
  try { capture?.(); } catch { return; }
  const keep = keepOnGpu(host);
  // (Its program still compiling (res-fade-gl warmFade), or a context that cannot: the new picture comes in as it is, no frame waits.)
  if (!keep) return;
  if (was) was.gpu.remove();
  const f = { gpu: keep, t0: performance.now(), follow, at: translateOf(canvas.style.translate), capture, w, h };
  keep.set(1, null, w, h);
  fades.set(canvas, f);
  // (The caller resizes the canvas next, which clears it: the picture before is laid on it at once, before the page shows it blank.)
  queueMicrotask(() => {
    if (fades.get(canvas) !== f || (canvas.width === keep.w && canvas.height === keep.h)) return;
    try { keep.draw(1, oldPlace(null, f.at, translateOf(canvas.style.translate)), w, h, true); } catch { /* (a lost context) */ }
  });
  if (!asked) { asked = true; late(step); }
}

/** Ends a fade over canvas at once (a dive taking the canvas over). */
export function fadeStop(canvas) { const f = fades.get(canvas); if (f) endGpu(canvas, f); }
/** Whether the fade over canvas runs on the GPU (inside its own presents): always, now. */
export const fadingOnGpu = (canvas) => fades.has(canvas);

/** Whether a mix is still showing over canvas (for tests). */
export const fading = (canvas) => fades.has(canvas);

// The lobule and the sinusoid (30 Oct, Mohammad: "when I check manual 25% for example the lobule doesn't change"): a change made
// while either shows is taken up at once, under the same FADE_MS ease, on the GPU (lobule-zoom.js resSwap with res-cover-gl.js,
// sinusoid-view.js svSwap with sinusoid-gl.js keep/mix).
/** The CSS transform that carries a picture drawn at view v0 ({ k, x, y }: screen = world × k + (x, y)) to where view v puts it
 *  ('' when the view has not moved). With transform-origin 0 0. */
export function viewFollow(v0, v) {
  if (v0.k === v.k && v0.x === v.x && v0.y === v.y) return '';
  const r = v.k / v0.k;
  return `matrix(${r}, 0, 0, ${r}, ${v.x - v0.x * r}, ${v.y - v0.y * r})`;
}
