// A soft fade for an opacity the GPU's painters read from an attribute: two follows in series (as the vessels' widths, W_TAU), not one
// timed curve that starts fast and restarts at every new target. It comes in and goes out gently, about a second from none to all,
// and a target that moves again part-way only bends the fade it is on. Used by the skin tint around the navel (the caput medusae),
// which popped in and out (11 Nov 2026).
const TAU = 0.22;   // s, each of the two follows

/**
 * `write(text)` puts the opacity where it is read; `frame(cb)` asks for a frame (cb gets its time in ms) and `cancel(id)` takes it back;
 * `reduced()` says whether Reduce Motion is on; `now()` is the clock. Returns { to(v), shown() }.
 */
export function createSoftFade({ write, frame, cancel, reduced, now }) {
  const e = { v1: 0, v2: 0, to: 0, last: 0, raf: 0 };
  const step = (t) => {
    e.raf = 0;
    const dt = Math.min(0.1, Math.max(0, (t - e.last) / 1000)), a = -Math.expm1(-dt / TAU);
    e.last = t;
    e.v1 += (e.to - e.v1) * a;
    e.v2 += (e.v1 - e.v2) * a;
    const done = Math.abs(e.to - e.v1) < 0.004 && Math.abs(e.to - e.v2) < 0.004;
    if (done) e.v1 = e.v2 = e.to;
    write(done ? e.to.toFixed(2) : e.v2.toFixed(3));
    if (!done) e.raf = frame(step);
  };
  return {
    to(v) {
      e.to = +v;
      if (reduced()) { if (e.raf) cancel(e.raf); e.raf = 0; e.v1 = e.v2 = e.to; write(String(v)); return; }
      if (e.raf || (e.to === e.v2 && e.to === e.v1)) return;
      e.last = now();
      e.raf = frame(step);
    },
    shown: () => e.v2,
  };
}
