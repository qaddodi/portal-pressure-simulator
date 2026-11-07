// Every change of a figure canvas's resolution eases (Mohammad, 30 Oct: "everything should transition ease nothing snaps"): the
// picture as it stood is kept and, for FADE_MS, mixed into what the canvas draws next as old × a + new × (1 − a), the sum of the two
// weights always 1 (laying the old copy over the new one brightened every translucent pixel mid-fade, his 30 Oct report). follow()
// (optional) gives the old picture's transform each frame ([a, b, c, d, e, f], CSS px), so it moves with a view that moves meanwhile
// (stage.js). A second change while one still fades starts from the mix as it shows, so neither picture jumps. Since 1 Nov the mix is
// made only on the GPU, inside the canvas's own presents (res-fade-gl.js); the canvas stays shown, so its opacity is never touched.
import { finalFrameFor, noteDraw } from './frame.js';
import { D_SURFACE } from './ease.js';
import { keepOnGpu } from './res-fade-gl.js';
import { caught } from './caught.js';

export const FADE_MS = D_SURFACE;
/** The old picture's weight u of the way through the fade: 1 to 0, smoothstep (no step at either end). */
export const fadeAlpha = (u) => { const t = Math.min(1, Math.max(0, u)); return 1 - t * t * (3 - 2 * t); };

const late = finalFrameFor('res-fade');
// (Since 1 Nov 2026 (Mohammad: "Move everything to GPU") the fade runs only on the GPU (res-fade-gl.js): the picture before copied once
// inside the GPU and mixed in at each present of the canvas's own renderer (host: veins-gl top), the canvas left shown, nothing read
// back. The 2D mix (a WebGL canvas copied into a 2D canvas twice a frame) is gone, ?fadegpu=0 with it: a canvas with no such renderer
// (no WebGL, a lost context) takes its new resolution at once.)
const fades = new Map();   // canvas → { gpu, t0, follow, at (the translate it showed at), capture, w, h (its CSS box) }

// (A CSS `translate` value is read as the browser writes it: "12px 4px", "1.5px", "" for none. Each of its first two blank-separated words
// is parseFloat(word) || 0, read here digit by digit into a kept pair, so a frame that asks again builds no string and no list. A
// number with an exponent or more digits than a double holds exactly takes parseFloat itself; so does any text that is not plain ASCII.)
const POW10 = [1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22];
const isSpace = (c) => c === 32 || (c >= 9 && c <= 13);
function wordNumber(s, i, j) {
  let k = i, neg = false;
  const c0 = s.charCodeAt(k);
  if (c0 === 45 || c0 === 43) { neg = c0 === 45; k++; }
  let mant = 0, digits = 0, scale = 0, dot = false;
  for (; k < j; k++) {
    const c = s.charCodeAt(k);
    if (c >= 48 && c <= 57) { mant = mant * 10 + (c - 48); digits++; if (dot) scale++; }
    else if (c === 46 && !dot) dot = true;
    else break;
  }
  const next = k < j ? s.charCodeAt(k) : 0;
  if (digits > 15 || scale > 22 || next === 101 || next === 69 || (!digits && (next === 73 || next === 105))) return parseFloat(s.slice(i, j)) || 0;   // alloc-rare: an exponent, a very long number or "Infinity": the browser writes none of them into a translate
  if (!digits) return 0;
  const r = scale ? mant / POW10[scale] : mant;
  return (neg ? -r : r) || 0;
}
/** A CSS `translate` value as [x, y] px ('' is none), written into out. */
export function translateInto(out, v) {
  out[0] = 0; out[1] = 0;
  if (!v) return out;
  if (typeof v !== 'string') v = String(v);   // alloc-rare: a translate is always a string; anything else is not a style read
  const n = v.length;
  for (let i = 0; i < n; i++) if (v.charCodeAt(i) > 127) return translateSlow(out, v);
  let i = 0, w = 0;
  while (w < 2) {
    while (i < n && isSpace(v.charCodeAt(i))) i++;
    if (i >= n) break;
    let j = i;
    while (j < n && !isSpace(v.charCodeAt(j))) j++;
    out[w++] = wordNumber(v, i, j);
    i = j;
  }
  return out;
}
function translateSlow(out, v) {
  const [x = 0, y = 0] = v.trim().split(/\s+/).filter(Boolean).map((t) => parseFloat(t) || 0);   // alloc-rare: only text that is not plain ASCII, which the browser never writes into a translate
  out[0] = x; out[1] = y;
  return out;
}
/** A CSS `translate` value as [x, y] px ('' is none). */
export const translateOf = (v) => translateInto([0, 0], v);   // alloc-rare: for a caller that keeps the pair (the fade's start); a frame uses translateInto
/** Where the old picture is drawn in the mix, into out: it showed at p + at on screen, follow (m, CSS px) carries that to where it is now,
 *  and the mix itself shows moved by now: so q = m(p + at) − now. */
export function oldPlaceInto(out, m, at, now) {
  const a = m ? m[0] : 1, b = m ? m[1] : 0, c = m ? m[2] : 0, d = m ? m[3] : 1, e = m ? m[4] : 0, f = m ? m[5] : 0;
  out[0] = a; out[1] = b; out[2] = c; out[3] = d;
  out[4] = a * at[0] + c * at[1] + e - now[0]; out[5] = b * at[0] + d * at[1] + f - now[1];
  return out;
}
export const oldPlace = (m, at, now) => oldPlaceInto([0, 0, 0, 0, 0, 0], m, at, now);   // alloc-rare: for a caller that keeps the place (the seed after a resize); a frame uses oldPlaceInto
let asked = false;

function endGpu(canvas, f) {
  f.gpu.release(); fades.delete(canvas);
  try { if (canvas.isConnected) f.capture?.(); } catch (e) { caught('res-fade:34', e); /* (a lost context: nothing to lay) */ }   // (the picture alone, at once)
}

function step() {
  asked = false;
  const now = performance.now();
  for (const [canvas, f] of fades) {
    const u = (now - f.t0) / FADE_MS;
    if (u >= 1 || !canvas.isConnected) { endGpu(canvas, f); continue; }
    f.gpu.set(fadeAlpha(u), oldPlaceInto(f.q, f.follow?.(), f.at, translateInto(f.now, canvas.style.translate)), f.w, f.h);
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
  if (was) was.gpu.release();
  const f = { gpu: keep, t0: performance.now(), follow, at: translateOf(canvas.style.translate), capture, w, h, q: [1, 0, 0, 1, 0, 0], now: [0, 0] };   // alloc-rare: once per resolution fade (a resize), with the two pairs its frames write into
  keep.set(1, null, w, h);
  fades.set(canvas, f);
  // (The caller resizes the canvas next, which clears it: the picture before is laid on it at once, before the page shows it blank.)
  queueMicrotask(() => {   // alloc-rare: once per resolution fade, right after the canvas is resized
    if (fades.get(canvas) !== f || (canvas.width === keep.w && canvas.height === keep.h)) return;
    try { keep.draw(1, oldPlace(null, f.at, translateOf(canvas.style.translate)), w, h, true); } catch (e) { caught('res-fade:71', e); /* (a lost context) */ }
  });
  if (!asked) { asked = true; late(step); }
}

/** Ends a fade over canvas at once (a dive taking the canvas over). */
export function fadeStop(canvas) { const f = fades.get(canvas); if (f) endGpu(canvas, f); }
/** Whether the fade over canvas runs on the GPU (inside its own presents): always, now. */

/** Whether a mix is still showing over canvas (for tests). */
export const fading = (canvas) => fades.has(canvas);

// The lobule and the sinusoid (30 Oct, Mohammad: "when I check manual 25% for example the lobule doesn't change"): a change made
// while either shows is taken up at once, under the same FADE_MS ease, on the GPU (lobule-zoom.js resSwap with res-cover-gl.js,
// sinusoid-view.js svSwap with sinusoid-gl.js keep/mix).
/** The CSS transform that carries a picture drawn at view v0 ({ k, x, y }: screen = world × k + (x, y)) to where view v puts it
 *  ('' when the view has not moved). With transform-origin 0 0. */
export function viewFollow(v0, v) {
  if (v0.k === v.k && v0.x === v.x && v0.y === v.y) return '';
  // (The string of the last six numbers is kept: a view that stands still for a frame, or the cover's step run twice, builds none.)
  if (v0.k === fk0 && v0.x === fx0 && v0.y === fy0 && v.k === fk && v.x === fx && v.y === fy) return fOut;
  fk0 = v0.k; fx0 = v0.x; fy0 = v0.y; fk = v.k; fx = v.x; fy = v.y;
  const r = v.k / v0.k;
  return (fOut = `matrix(${r}, 0, 0, ${r}, ${v.x - v0.x * r}, ${v.y - v0.y * r})`);
}
let fk0 = NaN, fx0 = NaN, fy0 = NaN, fk = NaN, fx = NaN, fy = NaN, fOut = '';
