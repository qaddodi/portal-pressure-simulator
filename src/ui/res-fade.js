// Every change of a figure canvas's resolution eases (Mohammad, 30 Oct: "everything should transition ease nothing snaps"): the
// picture as it stood is kept, the canvas is resized and drawn again, and for FADE_MS a canvas laid over it shows the two mixed,
// old × a + new × (1 − a) ('lighter' adds premultiplied pixels exactly), while the canvas itself is hidden under it. Laying the old
// copy over the new one instead brightened every translucent pixel mid-fade (glows, organs: each showed through the other; his
// 30 Oct report), so the mix is made in one canvas and the sum of the two weights is always 1. follow() (optional) gives the old
// picture's transform each frame ([a, b, c, d, e, f], CSS px), so it moves with a view that moves meanwhile (stage.js). A second
// change while one still fades starts from the mix as it shows, so neither picture jumps.
import { lateFrameFor } from './frame.js?v=c868718bdd';

export const FADE_MS = 350;
/** The old picture's weight u of the way through the fade: 1 to 0, smoothstep (no step at either end). */
export const fadeAlpha = (u) => { const t = Math.min(1, Math.max(0, u)); return 1 - t * t * (3 - 2 * t); };

const late = lateFrameFor('res-fade');
const fades = new Map();   // canvas → { cv (shown: the mix), old (the picture before), t0, follow }
let asked = false;

/** One frame of the mix: the old picture at weight a (moved by follow), the canvas as drawn now at 1 − a, added. */
export function mixInto(c, cv, old, canvas, a, m) {
  const w = canvas.offsetWidth || cv.width, h = canvas.offsetHeight || cv.height, sx = cv.width / w, sy = cv.height / h;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  c.clearRect(0, 0, cv.width, cv.height);
  if (a > 0) {
    const [ma, mb, mc, md, me, mf] = m || [1, 0, 0, 1, 0, 0];
    c.globalAlpha = a;
    c.setTransform(sx * ma, sy * mb, sx * mc, sy * md, sx * me, sy * mf);
    c.drawImage(old, 0, 0, w, h);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (a < 1) {
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - a;
    c.drawImage(canvas, 0, 0, cv.width, cv.height);
  }
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
}

function end(canvas, f) { f.cv.remove(); f.cv.width = f.cv.height = 1; f.old.width = f.old.height = 1; canvas.style.opacity = ''; fades.delete(canvas); }

function step() {
  asked = false;
  const now = performance.now();
  for (const [canvas, f] of fades) {
    const u = (now - f.t0) / FADE_MS;
    if (u >= 1 || !canvas.isConnected) { end(canvas, f); continue; }
    try { mixInto(f.c, f.cv, f.old, canvas, fadeAlpha(u), f.follow?.()); } catch { end(canvas, f); }
  }
  if (fades.size) { asked = true; late(step); }
}

/** Keeps canvas's picture and shows it mixed into what the canvas is drawn next; call it just before the canvas is resized. */
export function fadeOver(canvas, follow = null) {
  if (!canvas?.isConnected || canvas.width < 2 || canvas.height < 2 || !canvas.offsetWidth) return;
  const was = fades.get(canvas);
  // (The picture before: the mix on screen while a fade still runs, else the canvas.)
  const src = was ? was.cv : canvas;
  const old = document.createElement('canvas');
  old.width = src.width; old.height = src.height;
  try { old.getContext('2d').drawImage(src, 0, 0); } catch { return; }   // (a canvas that cannot be read: it changes as it is)
  let f = was;
  if (!f) {
    const cv = document.createElement('canvas');
    cv.className = 'res-fade'; cv.setAttribute('aria-hidden', 'true');
    Object.assign(cv.style, { position: 'absolute', left: `${canvas.offsetLeft}px`, top: `${canvas.offsetTop}px`, width: `${canvas.offsetWidth}px`,
      height: `${canvas.offsetHeight}px`, pointerEvents: 'none', zIndex: getComputedStyle(canvas).zIndex });
    f = { cv, c: cv.getContext('2d'), old: null, t0: 0, follow };
    canvas.after(cv);
  } else f.old.width = f.old.height = 1;
  f.cv.width = old.width; f.cv.height = old.height;
  f.old = old; f.t0 = performance.now(); f.follow = follow;
  mixInto(f.c, f.cv, old, canvas, 1, null);   // (the old picture alone, until the first frame of the fade)
  canvas.style.opacity = '0';   // (hidden under the mix; its buffer is still drawn and read)
  fades.set(canvas, f);
  if (!asked) { asked = true; late(step); }
}

/** Whether a mix is still showing over canvas (for tests). */
export const fading = (canvas) => fades.has(canvas);
