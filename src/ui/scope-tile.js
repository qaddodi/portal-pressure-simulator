// The endoscopic view as a tile of the readings card (slide field `scopeTile: true`): a small round picture of the distal esophagus
// at the varix's size now, so a time-lapse shows the varices swelling from small to large behind the chart. The picture is the
// instrument's own (endo-render.js, endo-size.js), made once for each step of 1/14 of its engorgement and eased in over the one before.
// It is laid by the GPU's chart drawer (trace-gl.js) as a texture: the new picture fades in over the old one kept on the GPU, no 2D canvas.
import { h } from './util.js?v=b1acbdf27d';
import { glWords } from './gl-words.js?v=b0b3cb3247';
import { renderEndo } from './endo-render.js?v=45668350ff';
import { endoGrow, LARGE_MM } from './endo-size.js?v=e0a58bf20e';
import { D_SURFACE, easeArrive } from './ease.js?v=7513a88c68';
import { createTraceGL, fitPen } from './trace-gl.js?v=2d7b4b37ee';
import { frameFor, cancelFrame } from './frame.js?v=1d147c7c9a';

const RES = 168, STEPS = 14, NONE_MM = 2.5;   // (2.5 mm: below it the metrics call it no varix)
export const scopeKey = (d) => (Number.isFinite(d) && d >= NONE_MM ? Math.round(endoGrow(d) * STEPS) : -1);
export const scopeWord = (d) => (!Number.isFinite(d) ? '' : d < NONE_MM ? 'No varices' : d >= LARGE_MM ? 'Large varices' : 'Small varices');
const nextFrame = frameFor('scope-tile');

/** The picture asked for in a task of its own (the first at once, a change 30 ms on, out of the model frame's own work). The newest ask
 *  decides: one for the picture already showing cancels a picture still waiting, so a reading that went one way and came back (a
 *  time-lapse scrubbed back, Back onto the slide) never ends on the picture it left while its word says the other. key(): the picture
 *  showing; show(k): draws picture k. */
export function pictureQueue(show, key, { setT = setTimeout, clearT = clearTimeout } = {}) {
  let timer = 0;
  return {
    ask(k) {
      clearT(timer); timer = 0;
      if (k === key()) return;
      timer = setT(() => { timer = 0; show(k); }, key() === null ? 0 : 30);
    },
    cancel() { clearT(timer); timer = 0; },
  };
}

export function createScopeTile() {
  const top = h('canvas', { class: 'pzs-top', width: RES, height: RES, role: 'img', 'aria-label': 'Endoscopic view of the esophagus' });
  const word = h('span', { class: 'pzs-word' });
  const disc = h('span', { class: 'pzs-disc' }, top);
  const el = h('div', { class: 'pzs-pic' }, disc, word);
  const wordW = glWords(word);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let key = null, img = null, ver = 0, swap = false, fadeT0 = -1, asked = 0, dead = false;
  const pen = createTraceGL(top, { redraw: () => paint() });
  // (one frame of the picture: the old one under the new while it fades in)
  function paint() {
    asked = 0;
    if (dead) return;
    const p = fitPen(top, pen), ctx = p.ctx, G = ctx.onGPU === true ? ctx.gpu : null;
    try {
      if (!G || !img) return;
      if (swap) { G.keepImage('pic', 'old'); swap = false; }
      const a = fadeT0 < 0 ? 1 : easeArrive(Math.min(1, (performance.now() - fadeT0) / D_SURFACE));
      if (a < 1 && G.hasImage('old')) G.image(null, 0, 0, p.w, p.h, 1, 'old');
      G.image(img, 0, 0, p.w, p.h, a, 'pic', img.glVer);
      if (a < 1) { if (!asked) asked = nextFrame(paint) || 1; } else fadeT0 = -1;
    } finally { ctx.end?.(); }
  }
  function show(k) {
    if (dead) return;
    const was = img;
    img = renderEndo(RES, { grow: Math.max(0, k) / STEPS, bands: 0, vis: k < 0 ? 0 : 1, red: 0 });
    img.glVer = ++ver;
    if (was && !reduce.matches && key !== null) { swap = true; fadeT0 = performance.now(); } else fadeT0 = -1;
    key = k;
    paint();
  }
  const queue = pictureQueue(show, () => key);
  return {
    el,
    /** d: the varix diameter now, in mm. */
    set(d) {
      if (dead) return;
      const k = scopeKey(d), w = scopeWord(d);
      wordW.set(w);   // (drawn on the GPU while it changes, gl-words.js)
      queue.ask(k);   // (out of the model frame's own work)
    },
    /** Lets go of the picture's GPU drawer, its words, its pending frame and its timer. Idempotent; set() does nothing after. */
    dispose() {
      if (dead) return;
      dead = true;
      queue.cancel();
      cancelFrame(asked); asked = 0;
      wordW.dispose();
      pen?.dispose();
      img = null; el.remove();
    },
  };
}
