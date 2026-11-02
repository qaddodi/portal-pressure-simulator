// The room a talk's cards leave on the figure (--pz-l, --pz-r, --pz-t, --pz-b on #app), held back through a slide change whose camera
// moves and written as the glide sets off (presenter.js insetsHold, insetsGo), so the figure's labels are laid out once, where it lands.
// Its own module so a test can drive it: a hold that outlived the talk wrote the last slide's room back onto Explore 2.5 s after the
// talk ended (the lobule and the figure then framed clear of cards no longer there), until the next talk.

export const INSET_KEYS = ['--pz-l', '--pz-r', '--pz-t', '--pz-b'];

export function createInsetHold(style, { ms = 2500, timers = globalThis } = {}) {
  let held = false, t = 0;
  const pend = new Map();
  const api = {
    get held() { return held; },
    /** A value for the room: written now, or kept until go() while held. */
    put(k, px) { if (held) pend.set(k, px); else style.setProperty(k, px); },
    /** Holds what put() writes, for at most ms (then written, as go() does; onLate is told). */
    hold(onLate) { held = true; timers.clearTimeout(t); t = timers.setTimeout(() => { t = 0; if (api.go()) onLate?.(); }, ms); },
    /** Writes what was held; true when something was. */
    go() {
      timers.clearTimeout(t); t = 0;
      if (!held) return false;
      held = false;
      for (const [k, v] of pend) style.setProperty(k, v);
      pend.clear();
      return true;
    },
    /** The talk is over: nothing held is written, now or later, and the room is taken off. */
    reset() {
      timers.clearTimeout(t); t = 0; held = false; pend.clear();
      for (const k of INSET_KEYS) style.removeProperty(k);
    },
  };
  return api;
}
