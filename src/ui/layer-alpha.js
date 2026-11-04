// How much of a page layer shows: the product of the opacities from an element up to the root, and whether it is hidden. For a layer the
// GPU draws in a canvas that is not inside the layer (the lobule's and the sinusoid's captions, drawn in the figure's context: L1 of
// docs/gpu-two-contexts-plan.md), so the page's own fades of it (the camera's, the sinusoid's, a slide's hush, the lobule's own fade)
// still reach the picture, as they reached the canvas that used to sit inside it.
//
// Nothing is read in a frame while nothing changed. A change of class (or of the near elements' style) marks the answer stale; the next
// call reads each element's opacity and its running opacity transitions or animations ONCE (Element.getAnimations, label-track.js), then
// follows them from their timing with no read of the page, until they end (the end is an event, and marks it stale again).
//   const la = createLayerAlpha(labelsBox, { near: lzEl, onChange: () => cap.paint() });
//   la.now()      // 0..1, this frame
//   la.moving     // a fade is still running (the owner keeps drawing frames)
//   la.dispose()

import { trackOf, trackAt } from './label-track.js';

const NO_PAINT = () => false;
const EVENTS = ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel'];

/** The last keyframe's opacity of an animation, or NaN. */
function toOf(a) {
  try { const kf = a.effect.getKeyframes(); for (let i = kf.length - 1; i >= 0; i--) if (kf[i].opacity != null && kf[i].opacity !== '') return parseFloat(kf[i].opacity); } catch { /* not a keyframe effect */ }
  return NaN;
}
/** The element's running animations that move its opacity. */
function animsOf(e) {
  try { return (e.getAnimations?.() || []).filter(animatesOpacity); } catch { return []; }
}
const animatesOpacity = (a) => { try { return a.effect.getKeyframes().some((k) => k.opacity != null && k.opacity !== ''); } catch { return false; } };

/**
 * `leaf`: the layer's element. `near`: the last element up the chain whose inline style is watched too (the layer's own fades are
 * scripted there); farther ones are watched by class only, so a write to their style (a camera's transform every frame) asks for nothing.
 * `shared`: see below. `gcs`: getComputedStyle (a stand-in in the tests).
 */
export function createLayerAlpha(leaf, { near = null, shared = null, onChange = null, gcs = (e) => getComputedStyle(e) } = {}) {
  const chain = [];
  // (`shared`: a canvas the layer is drawn in that has the same ancestors above some point: the fades of those reach the canvas on their own, and
  // are left out here, so they are not applied twice.)
  let cut = Infinity;
  for (let e = leaf; e; e = e.parentElement) { if (shared && cut === Infinity && e.contains?.(shared)) cut = chain.length; chain.push(e); }
  const n = chain.length;
  const vals = new Float64Array(n).fill(1);
  const trks = new Array(n).fill(null);
  let hidden = false, dirty = true, dead = false;
  const api = { moving: false, now, dispose };
  const changed = () => { if (dead) return; dirty = true; onChange?.(); };
  const nearIdx = near ? Math.max(0, chain.indexOf(near)) : 0;
  const moNear = typeof MutationObserver === 'function' ? new MutationObserver(changed) : null;
  const moFar = typeof MutationObserver === 'function' ? new MutationObserver(changed) : null;
  for (let i = 0; i < n; i++) {
    if (i <= nearIdx) moNear?.observe(chain[i], { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    else moFar?.observe(chain[i], { attributes: true, attributeFilter: ['class', 'hidden', 'data-theme', 'data-palette', 'data-mode'] });
  }
  const set = new Set(chain);
  const onEvent = (ev) => { if (set.has(ev.target)) changed(); };
  const doc = leaf.ownerDocument;
  for (const t of EVENTS) doc?.addEventListener(t, onEvent, true);

  function reread(t) {
    dirty = false;
    for (let i = 0; i < n; i++) {
      if (i >= cut) { vals[i] = 1; trks[i] = null; continue; }   // (the canvas has these ancestors too: their own fades reach it, and their classes are still watched)
      const e = chain[i], cs = gcs(e), v = parseFloat(cs.opacity);
      vals[i] = Number.isFinite(v) ? v : 1;
      if (i === 0) hidden = cs.visibility === 'hidden' || cs.display === 'none';
      trks[i] = null;
      const list = animsOf(e);
      if (!list.length) continue;
      let m;
      try { m = trackOf(list, e, NO_PAINT, t, toOf(list[list.length - 1])); } catch { m = null; }
      if (m?.ops.length) trks[i] = m;   // (one that cannot be followed exactly is taken at the opacity read now; its end is an event that reads again)
    }
  }
  function now() {
    if (dead) return 0;
    const t = performance.now();
    if (moNear) for (const mo of [moNear, moFar]) if (mo.takeRecords().length) dirty = true;
    api.moving = false;
    for (let i = 0; i < n; i++) { const m = trks[i]; if (m && m.end <= t) dirty = true; }   // (a fade that ended: read the page's own opacity again)
    if (dirty) reread(t);
    if (hidden) return 0;
    let a = 1;
    for (let i = 0; i < n; i++) {
      const m = trks[i];
      let v = vals[i];
      if (m) { const o = trackAt(m, t).op; if (o != null && Number.isFinite(o)) v = o; if (m.end > t) api.moving = true; }
      a *= v;
      if (a <= 0) return 0;
    }
    return a;
  }
  function dispose() {
    if (dead) return;
    dead = true;
    moNear?.disconnect(); moFar?.disconnect();
    for (const t of EVENTS) doc?.removeEventListener(t, onEvent, true);
  }
  return api;
}
