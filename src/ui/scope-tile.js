// The endoscopic view as a tile of the readings card (slide field `scopeTile: true`): a small round picture of the distal esophagus
// at the varix's size now, so a time-lapse shows the varices swelling from small to large behind the chart. The picture is the
// instrument's own (endo-render.js, endo-size.js), made once for each step of 1/14 of its engorgement and eased in over the one before.
// It is laid by the GPU's chart drawer (trace-gl.js) as a texture: the new picture fades in over the old one kept on the GPU, no 2D canvas.
import { h } from './util.js?v=32eb592c68';
import { glWords } from './gl-words.js?v=7d02dbc1d5';
import { renderEndo } from './endo-render.js?v=d048c30c72';
import { endoGrow, LARGE_MM } from './endo-size.js?v=e0a58bf20e';
import { D_SURFACE, easeArrive } from './ease.js?v=7513a88c68';
import { createTraceGL, fitPen } from './trace-gl.js?v=b65adf6b44';
import { frameFor, cancelFrame } from './frame.js?v=1d147c7c9a';

const RES = 168, STEPS = 14, NONE_MM = 2.5;   // (2.5 mm: below it the metrics call it no varix)
export const scopeKey = (d) => (Number.isFinite(d) && d >= NONE_MM ? Math.round(endoGrow(d) * STEPS) : -1);
export const scopeWord = (d) => (!Number.isFinite(d) ? '' : d < NONE_MM ? 'No varices' : d >= LARGE_MM ? 'Large varices' : 'Small varices');
const nextFrame = frameFor('scope-tile');

export function createScopeTile() {
  const top = h('canvas', { class: 'pzs-top', width: RES, height: RES, role: 'img', 'aria-label': 'Endoscopic view of the esophagus' });
  const word = h('span', { class: 'pzs-word' });
  const disc = h('span', { class: 'pzs-disc' }, top);
  const el = h('div', { class: 'pzs-pic' }, disc, word);
  const wordW = glWords(word);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let key = null, timer = 0, img = null, ver = 0, swap = false, fadeT0 = -1, asked = 0, dead = false;
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
  return {
    el,
    /** d: the varix diameter now, in mm. */
    set(d) {
      if (dead) return;
      const k = scopeKey(d), w = scopeWord(d);
      wordW.set(w);   // (drawn on the GPU while it changes, gl-words.js)
      if (k === key) return;
      clearTimeout(timer);
      timer = setTimeout(() => show(k), key === null ? 0 : 30);   // (out of the model frame's own work)
    },
    /** Lets go of the picture's GPU drawer, its words, its pending frame and its timer. Idempotent; set() does nothing after. */
    dispose() {
      if (dead) return;
      dead = true;
      clearTimeout(timer); timer = 0;
      cancelFrame(asked); asked = 0;
      wordW.dispose();
      pen?.dispose();
      img = null; el.remove();
    },
  };
}
