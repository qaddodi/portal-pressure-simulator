// A card's own height glides when its content asks (17 Nov 2026, Mohammad's "nothing pops", and option A's tray: the card's foot jumped as a tray opened).
// The card is laid out at its new height at once; what is seen moves by transforms only (FLIP): its plate, the glass the figure's GPU draws from the plate's
// box, is scaled from the old height to the new about the edge that stays (the top on the shelf, the foot on a phone's card, which stands on its foot), and
// on a phone's card the words ride from where they stood, since its top moved. The glass reads a scaled plate's box in every frame while it moves
// (glass-gl.js: a transform it cannot follow by itself is read again each frame), and keeps the plate's own round corners at every height.
// Content asks with an 'ac-resize' event from inside the card, sent just before the change it makes (stent-editor.js: a tray opening, moving or going);
// a card that is entering, leaving or turning to another structure never glides (B, 13 Nov: that is the old card out and the new one in).

import { D_SURFACE, EASE_ARRIVE } from './ease.js';

export const GLIDE_EVENT = 'ac-resize';

/** The keyframes for a card going from h0 to h1 px tall: the plate's scale, and on a card standing on its foot, the words' ride. */
export function glideFrames(h0, h1, foot) {
  const k = h0 / h1, d = h1 - h0;
  return {
    origin: foot ? '50% 100%' : '50% 0',
    plate: [{ transform: `scaleY(${k.toFixed(4)})` }, { transform: 'none' }],
    words: foot ? [{ transform: `translateY(${d.toFixed(1)}px)` }, { transform: 'none' }] : null,
  };
}

/** glideCard(el, h0, h1, { foot }): the card el, just laid out at h1 px after h0, seen to glide there. Returns its animations (none for a change under 1 px). */
export function glideCard(el, h0, h1, { foot = false, prior = [] } = {}) {
  for (const a of prior) a.cancel?.();
  if (!(h0 > 0) || !(h1 > 0) || Math.abs(h1 - h0) < 1) return [];
  const plate = el.querySelector(':scope > .sheet-plate');
  const f = glideFrames(h0, h1, foot), o = { duration: D_SURFACE, easing: EASE_ARRIVE }, out = [];
  if (plate?.animate) { plate.style.transformOrigin = f.origin; out.push(plate.animate(f.plate, o)); }   // (a write on the change, never in a frame)
  if (f.words) for (const c of el.children) if (c !== plate && c.animate) out.push(c.animate(f.words, o));
  return out;
}
