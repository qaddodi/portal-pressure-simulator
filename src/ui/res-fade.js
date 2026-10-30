// Every change of a figure canvas's resolution eases (Mohammad, 30 Oct: "everything should transition ease nothing snaps"): the
// picture as it stood is copied into a canvas laid over it, the canvas is resized and drawn again beneath, and the copy fades out
// over FADE_MS. follow() (optional) gives the copy's CSS transform each frame, so it moves with a view that moves meanwhile
// (stage.js: from the transform the copied picture was drawn in to the one drawn now). A second change while one still fades
// copies the canvas with the fading copy laid over it as it shows, so neither picture jumps.
import { lateFrameFor } from './frame.js?v=2a020ae210';

export const FADE_MS = 350;
/** The copy's opacity u of the way through its fade: 1 to 0, smoothstep (no step at either end). */
export const fadeAlpha = (u) => { const t = Math.min(1, Math.max(0, u)); return 1 - t * t * (3 - 2 * t); };

const late = lateFrameFor('res-fade');
const fades = new Map();   // canvas → { cv, t0, follow, a }
let asked = false;

function step() {
  asked = false;
  const now = performance.now();
  for (const [canvas, f] of fades) {
    const u = (now - f.t0) / FADE_MS;
    if (u >= 1 || !canvas.isConnected) { f.cv.remove(); f.cv.width = f.cv.height = 1; fades.delete(canvas); continue; }
    f.a = fadeAlpha(u);
    f.cv.style.opacity = f.a.toFixed(3);
    f.cv.style.transform = f.follow?.() || '';
  }
  if (fades.size) { asked = true; late(step); }
}

/** Lays a copy of canvas's picture over it, to fade out from the next frame on; call it just before the canvas is resized. */
export function fadeOver(canvas, follow = null) {
  if (!canvas?.isConnected || canvas.width < 2 || canvas.height < 2 || !canvas.offsetWidth) return;
  const old = fades.get(canvas);
  const cv = document.createElement('canvas');
  cv.className = 'res-fade'; cv.setAttribute('aria-hidden', 'true');
  cv.width = canvas.width; cv.height = canvas.height;
  const cs = getComputedStyle(canvas);
  Object.assign(cv.style, { position: 'absolute', left: `${canvas.offsetLeft}px`, top: `${canvas.offsetTop}px`, width: `${canvas.offsetWidth}px`,
    height: `${canvas.offsetHeight}px`, pointerEvents: 'none', transformOrigin: '0 0', zIndex: cs.zIndex, opacity: '1' });
  const c = cv.getContext('2d');
  try {
    c.drawImage(canvas, 0, 0);
    if (old) {
      // (The fading copy as it shows now: its opacity, and its transform in CSS px, scaled to this copy's pixels.)
      const sx = cv.width / canvas.offsetWidth, sy = cv.height / canvas.offsetHeight;
      const m = new DOMMatrix(old.cv.style.transform || undefined);
      c.globalAlpha = old.a;
      c.setTransform(sx * m.a, sy * m.b, sx * m.c, sy * m.d, sx * m.e, sy * m.f);
      c.drawImage(old.cv, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
    }
  } catch { return; }   // (a canvas that cannot be read: it changes as it is)
  if (old) old.cv.remove();
  canvas.after(cv);
  fades.set(canvas, { cv, t0: performance.now(), follow, a: 1 });
  if (!asked) { asked = true; late(step); }
}

/** Whether a copy is still fading over canvas (for tests). */
export const fading = (canvas) => fades.has(canvas);
