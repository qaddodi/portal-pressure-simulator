// Every change of a figure canvas's resolution eases (Mohammad, 30 Oct: "everything should transition ease nothing snaps"): the
// picture as it stood is kept, the canvas is resized and drawn again, and for FADE_MS a canvas laid over it shows the two mixed,
// old × a + new × (1 − a) ('lighter' adds premultiplied pixels exactly), while the canvas itself is hidden under it. Laying the old
// copy over the new one instead brightened every translucent pixel mid-fade (glows, organs: each showed through the other; his
// 30 Oct report), so the mix is made in one canvas and the sum of the two weights is always 1. follow() (optional) gives the old
// picture's transform each frame ([a, b, c, d, e, f], CSS px), so it moves with a view that moves meanwhile (stage.js). A second
// change while one still fades starts from the mix as it shows, so neither picture jumps.
// The canvas is hidden and shown again with its CSS opacity transition held off (app.css eases every canvas of the stage over
// .25 s): eased, it went on showing under the mix as the fade began, and at the end, with the mix gone, it came back up from 0,
// so the figure blinked out and in at every change (Mohammad, 30 Oct: "it flashes whenever it switches resolution"). The mix is
// moved by the canvas's own sub-pixel translate (stage.js subPixel), so neither picture shifts as the mix comes and goes, and it
// is drawn in the frame's final phase, after the figure's own pass, so the new picture in it is this frame's. A canvas that keeps no
// picture of its own between frames (the vessel canvas: veins-gl OWN_BUF) passes capture, which puts its whole current picture back
// on it just before each read, so a frame the figure did not draw in still mixes the picture, not an empty buffer.
import { finalFrameFor, noteDraw } from './frame.js?v=b11d87fd1b';
import { gpuProbe, COUNTED } from './gpu-probe.js?v=9832eccfbe';

export const FADE_MS = 350;
/** The old picture's weight u of the way through the fade: 1 to 0, smoothstep (no step at either end). */
export const fadeAlpha = (u) => { const t = Math.min(1, Math.max(0, u)); return 1 - t * t * (3 - 2 * t); };

const late = finalFrameFor('res-fade');
const fades = new Map();   // canvas → { cv (shown: the mix), old (the picture before), t0, follow, at (the translate it showed at), tr (the canvas's own inline transition), capture }

/** A CSS `translate` value as [x, y] px ('' is none). */
export const translateOf = (v) => { const [x = 0, y = 0] = String(v || '').trim().split(/\s+/).filter(Boolean).map((t) => parseFloat(t) || 0); return [x, y]; };
/** Where the old picture is drawn in the mix: it showed at p + at on screen, follow (m, CSS px) carries that to where it is now, and the
 *  mix itself shows moved by now: so q = m(p + at) − now. */
export function oldPlace(m, at, now) {
  const [a, b, c, d, e, f] = m || [1, 0, 0, 1, 0, 0];
  return [a, b, c, d, a * at[0] + c * at[1] + e - now[0], b * at[0] + d * at[1] + f - now[1]];
}
/** Sets an element's opacity at once, its CSS transition held off for that change only (the style is read in between, so the change
 *  is taken with no transition, and putting the transition back starts none). */
export function snapOpacity(el, v, tr = el.style.transition) {
  el.style.transition = 'none';
  el.style.opacity = v;
  void getComputedStyle(el).opacity;
  el.style.transition = tr;
}
let asked = false;

/** One frame of the mix: the canvas as drawn now, and where the old picture (moved by follow) still lies, old × a + new × (1 − a).
 *  (Outside it, at the edge a pan or a zoom out uncovers, the new picture is drawn whole: weighted 1 − a there with nothing to add,
 *  it let the page show through, brighter in the light theme.) */
export function mixInto(c, cv, old, canvas, a, m) {
  const w = canvas.offsetWidth || cv.width, h = canvas.offsetHeight || cv.height, sx = cv.width / w, sy = cv.height / h;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  c.clearRect(0, 0, cv.width, cv.height);
  c.drawImage(canvas, 0, 0, cv.width, cv.height);
  if (a <= 0) return;
  const [ma, mb, mc, md, me, mf] = m || [1, 0, 0, 1, 0, 0];
  c.save();
  c.setTransform(sx * ma, sy * mb, sx * mc, sy * md, sx * me, sy * mf);
  c.beginPath(); c.rect(0, 0, w, h); c.clip();   // (the old picture's own rectangle, where it is now)
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  c.globalAlpha = a;
  c.setTransform(sx * ma, sy * mb, sx * mc, sy * md, sx * me, sy * mf);
  c.drawImage(old, 0, 0, w, h);
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (a < 1) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - a; c.drawImage(canvas, 0, 0, cv.width, cv.height); }
  c.restore();
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
}

function end(canvas, f) { f.cv.remove(); f.cv.width = f.cv.height = 1; f.old.width = f.old.height = 1; snapOpacity(canvas, '', f.tr); fades.delete(canvas); }

function step() {
  asked = false;
  const now = performance.now();
  for (const [canvas, f] of fades) {
    const u = (now - f.t0) / FADE_MS;
    if (u >= 1 || !canvas.isConnected) { end(canvas, f); continue; }
    // (As many pixels as the sharper of the two pictures: a fade up to a finer canvas shows its detail all the way, not at the end.)
    if (canvas.width > f.cv.width || canvas.height > f.cv.height) { f.cv.width = Math.max(f.cv.width, canvas.width); f.cv.height = Math.max(f.cv.height, canvas.height); }
    const tr = canvas.style.translate || '';
    if (f.cv.style.translate !== tr) f.cv.style.translate = tr;
    try { f.capture?.(); mixInto(f.c, f.cv, f.old, canvas, fadeAlpha(u), oldPlace(f.follow?.(), f.at, translateOf(tr))); } catch { end(canvas, f); continue; }
    noteDraw('res-fade');
    if (gpuProbe.on) gpuProbe.note(COUNTED.fadeCopy, f.cv.width * f.cv.height * 4 / 1024);
  }
  if (fades.size) { asked = true; late(step); }
}

/** Keeps canvas's picture and shows it mixed into what the canvas is drawn next; call it just before the canvas is resized.
 *  capture (optional): puts the canvas's whole current picture on it, called just before each read of the canvas. */
export function fadeOver(canvas, follow = null, capture = null) {
  if (!canvas?.isConnected || canvas.width < 2 || canvas.height < 2 || !canvas.offsetWidth) return;
  const was = fades.get(canvas);
  // (The picture before: the mix on screen while a fade still runs, else the canvas.)
  const src = was ? was.cv : canvas;
  const at = translateOf(src.style.translate);   // (where the picture before shows: the canvas's, or the mix's, sub-pixel translate)
  const old = document.createElement('canvas');
  old.width = src.width; old.height = src.height;
  if (!was) try { capture?.(); } catch { /* (a lost context: the canvas is read as it is) */ }
  try { old.getContext('2d').drawImage(src, 0, 0); } catch { return; }   // (a canvas that cannot be read: it changes as it is)
  if (gpuProbe.on) gpuProbe.note(COUNTED.fadeCopy, old.width * old.height * 4 / 1024);
  let f = was;
  if (!f) {
    const cv = document.createElement('canvas');
    cv.className = 'res-fade'; cv.setAttribute('aria-hidden', 'true');
    Object.assign(cv.style, { position: 'absolute', left: `${canvas.offsetLeft}px`, top: `${canvas.offsetTop}px`, width: `${canvas.offsetWidth}px`,
      height: `${canvas.offsetHeight}px`, pointerEvents: 'none', zIndex: getComputedStyle(canvas).zIndex });
    f = { cv, c: cv.getContext('2d'), old: null, t0: 0, follow, at, tr: canvas.style.transition, capture };
    canvas.after(cv);
  } else f.old.width = f.old.height = 1;
  f.cv.width = old.width; f.cv.height = old.height;
  f.old = old; f.t0 = performance.now(); f.follow = follow; f.at = at; f.capture = capture;
  f.cv.style.translate = src.style.translate || '';
  mixInto(f.c, f.cv, old, canvas, 1, null);   // (the old picture alone, until the first frame of the fade)
  // (Hidden under the mix at once, never eased; its buffer is still drawn and read.)
  if (!was) { canvas.style.transition = 'none'; canvas.style.opacity = '0'; void getComputedStyle(canvas).opacity; }
  fades.set(canvas, f);
  if (!asked) { asked = true; late(step); }
}

/** Ends a fade over canvas at once: the mix goes and the canvas shows (a dive taking the canvas over). */
export function fadeStop(canvas) { const f = fades.get(canvas); if (f) end(canvas, f); }

/** Whether a mix is still showing over canvas (for tests). */
export const fading = (canvas) => fades.has(canvas);

// The lobule and the sinusoid (30 Oct, Mohammad: "when I check manual 25% for example the lobule doesn't change"): a change made
// while either shows is taken up at once, under the same FADE_MS ease. Their GPU canvases keep no picture after the frame they are
// drawn in, so the picture before is copied in the frame that draws it, never from a Settings click (lobule-zoom.js resSwap,
// sinusoid-view.js svSwap).
/** The layers that show, stacked into cv as the page stacks them (each stretched over the whole box, as its CSS stretches it).
 *  Skipped: a canvas out of the page, with no pixels, or hidden by its inline opacity or visibility. False when none shows or one
 *  cannot be read. */
export function stackInto(cv, layers) {
  const shown = layers.filter((l) => l?.isConnected && l.width > 0 && l.height > 0 && l.style.opacity !== '0' && l.style.visibility !== 'hidden');
  if (!shown.length) return false;
  cv.width = Math.max(...shown.map((l) => l.width)); cv.height = Math.max(...shown.map((l) => l.height));
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  c.clearRect(0, 0, cv.width, cv.height);
  try { for (const l of shown) c.drawImage(l, 0, 0, cv.width, cv.height); } catch { return false; }
  if (gpuProbe.on) gpuProbe.note(COUNTED.fadeCopy, cv.width * cv.height * 4 * shown.length / 1024);
  return true;
}
/** The CSS transform that carries a picture drawn at view v0 ({ k, x, y }: screen = world × k + (x, y)) to where view v puts it
 *  ('' when the view has not moved). With transform-origin 0 0. */
export function viewFollow(v0, v) {
  if (v0.k === v.k && v0.x === v.x && v0.y === v.y) return '';
  const r = v.k / v0.k;
  return `matrix(${r}, 0, 0, ${r}, ${v.x - v0.x * r}, ${v.y - v0.y * r})`;
}
