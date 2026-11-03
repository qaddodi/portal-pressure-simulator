// One theme epoch (glitch audit TH1/TH2, 3 Nov 2026). A new look, a palette or the device's own light or dark used to reach each GPU
// surface through its own observer, timer or rest pass, so the figure, the words, the sliders, the labels and the glass changed colour
// in different frames, and under the in-app crossfade the late ones popped in under the fade.
//
// Here one observer sees the change and every surface that listens (onTheme) runs in the same scheduler frame, after the frame's reads
// (util.js has read the colour tokens again by then, in readFrame). themeSettled() is a promise for the in-app crossfade: it resolves
// once that frame has run and the rest passes asked for during it have drained, so the page the crossfade fades to is whole (capped).
import { frameFor } from './frame.js';
import { restPass } from './rest-pass.js';

const themeFrame = frameFor('theme');
const subs = new Set();   // alloc-rare: the surfaces that listen, added once as each is made
let ask = 0, waiting = [], epoch = 0;

/** Calls fn in the frame that follows every change of the page's look (and the device's own). Returns an off. */
export function onTheme(fn) { subs.add(fn); return () => subs.delete(fn); }
/** How many looks have been applied since the page opened. */
export const themeEpoch = () => epoch;

function run() {
  ask = 0; epoch++;
  for (const fn of subs) { try { fn(); } catch (e) { setTimeout(() => { throw e; }); } }
  // (Whatever those asked of the rest passes goes first in the queue: this one runs after them, and the frame after it has drawn them.)
  restPass(() => themeFrame(() => { const w = waiting; waiting = []; for (const done of w) done(); }));
}
function changed() { if (!ask) ask = themeFrame(run); }

if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
  new MutationObserver(changed).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', changed);
}

/** A promise that resolves when the look just applied has reached every surface (never later than `cap` ms: a hidden page or a surface
 *  that never answers must not hold a crossfade). */
export function themeSettled(cap = 350) {
  return new Promise((done) => {
    const t = setTimeout(done, cap);
    waiting.push(() => { clearTimeout(t); done(); });
    changed();   // (resolved even when nothing had been asked yet: the attributes are written before this is called)
  });
}
