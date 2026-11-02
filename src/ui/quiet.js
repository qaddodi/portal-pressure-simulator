// When the person last had a hand on the page, for the work that must stay out of a gesture's way (shader publishing, module
// warm-up, the organ pictures' refinement). One set of listeners for the whole app: every caller reads the same clock.
//
//   leftAlone(ms)   true once no input has come for `ms` and no finger or button is down (a press held over 5 s with no input stops
//                   counting, so nothing waits for a release that was lost)
//   whenQuiet(fn)   calls fn once the page has been left alone for ms, polled with timers (never a frame loop)

/** A clock of input on `target` (the window): createQuiet is separate from the shared one below so a test can feed it events. */
export function createQuiet(target = globalThis, now = () => performance.now()) {
  let inputAt = -1e9;
  const pressed = new Set();
  if (typeof target.addEventListener === 'function') {
    const on = (ev, fn) => target.addEventListener(ev, fn, { passive: true, capture: true });
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) on(ev, (e) => { if (ev !== 'pointermove' || e.buttons) inputAt = now(); });
    // A finger or button still down, held still or not. (A mouse let go outside the window is seen on its next move.)
    on('pointerdown', (e) => pressed.add(e.pointerId));
    for (const ev of ['pointerup', 'pointercancel']) on(ev, (e) => pressed.delete(e.pointerId));
    on('pointermove', (e) => { if (!e.buttons) pressed.delete(e.pointerId); });
    on('blur', () => pressed.clear());
  }
  const since = () => now() - inputAt;
  const leftAlone = (ms) => !(pressed.size && since() < 5000) && since() >= ms;
  /** Calls fn once the page has been left alone for `ms`; checked every `poll` ms. Returns a cancel. */
  function whenQuiet(fn, ms = 700, poll = 400) {
    let t = 0, dead = false;
    const go = () => { t = 0; if (dead) return; if (leftAlone(ms)) fn(); else t = setTimeout(go, poll); };   // alloc-rare: one per request to run work once the page is quiet (a view's first build, start-up warm-ups), never per frame
    t = setTimeout(go, 0);
    return () => { dead = true; clearTimeout(t); };   // alloc-rare: the cancel of that one request, never per frame
  }
  return { since, leftAlone, whenQuiet };
}

/** True while the loading cover is up (index.html sets data-boot="hold" before anything else runs). */
export const booting = () => globalThis.document?.documentElement?.dataset?.boot === 'hold';
/** Start-up work that would land in the first seconds of use (a shader compile, a view's first build) is done under the loading
 *  cover instead: while the cover is up, the cover waits for `p` (capped in index.html), so the person never meets that work in a
 *  pan or a tap. After the cover has gone it does nothing. Returns p. */
export function holdCover(p) {
  if (booting() && p && typeof p.then === 'function') (globalThis.ppsHold ||= []).push(p);   // alloc-rare: made once, on the first hold, and only while the loading cover is up
  return p;
}

const shared = createQuiet();
/** Milliseconds since the last input. */
export const sinceInput = shared.since;
export const leftAlone = shared.leftAlone;
export const whenQuiet = shared.whenQuiet;
