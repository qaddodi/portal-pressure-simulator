// What the figure shows between the model's frames (combined plan M1): one filter for everything the model sets and the figure
// draws as a size or a colour, so nothing steps when the model does. A critically damped follow: two first-order stages of time
// constant tau in cascade, stepped exactly for any dt, so the shown value and its speed change continuously and trace the same
// curve at 60 or 120 Hz; a new target (a model frame, a slider) bends the speed instead of jumping it. It lands exactly on its
// target once both stages are within eps of it, so a settled figure is drawn exactly as the model has it.
//
// The vessels' widths (stage.js followWidth) and the lumens' colours (stage.js followColour) both use it, with the widths' time
// constant (W_TAU there). The blood keeps its own slower mean (blood.js, 1.5 s), which is meant to be seen.

/** One step: v the shown value, w the first stage, T the target. Returns { v, w } (one object, reused). */
const OUT = { v: 0, w: 0 };
export function follow2(v, w, T, dt, tau, eps) {
  const u = Math.max(0, dt) / tau, a = Math.exp(-u), e1 = w - T, e2 = v - T;
  w = T + e1 * a; v = T + (e2 + e1 * u) * a;
  if (Math.abs(T - w) < eps && Math.abs(w - v) < eps) w = v = T;
  OUT.v = v; OUT.w = w;
  return OUT;
}

/**
 * Colours that follow their targets: per key, `n` channels (two RGB colours: 6). step(key, target, dt, opts): the colour to show
 * now, written into `target`'s place (a new array per key, kept). opts.snap: show the target at once (a crossfade carries the
 * change, Reduce Motion, a vessel just shown). A change at rest of at most `small` on every channel (under what a display shows
 * apart: the running model's own steps) is shown at once too, so a model that only drifts costs no easing frames.
 * `moving`: whether any key stepped this round is still on its way (begin() starts a round).
 */
const makeState = (n) => ({ v: new Float64Array(n), w: new Float64Array(n), out: new Array(n) });   // (a key's state; made only while the pool below is still filling)   // alloc-rare: a pool's growth, only while a new key asks for its state
export function createColourFollow({ tau, eps = 0.002, small = 3 / 255, n = 6 } = {}) {
  const S = new Map();
  // The states of the keys not in use: a key first seen takes one, a key pruned gives its one back, so a stream of keys comes and goes
  // without making any. (A state's output list is read by the caller at once, as step returns it.)
  const spare = [];
  for (let i = 0; i < 96; i++) spare.push(makeState(n));
  const api = {
    moving: false,
    begin() { api.moving = false; },
    step(key, target, dt, snap = false) {
      let s = S.get(key);
      if (!s) {
        s = spare.pop() || makeState(n);
        for (let i = 0; i < n; i++) s.v[i] = s.w[i] = target[i];
        S.set(key, s); snap = true;
      }
      // (At rest: both stages together, where the last target was. Moving, a new target is followed on from where it is.)
      let rest = true, big = false;
      for (let i = 0; i < n; i++) {
        if (s.v[i] !== s.w[i]) rest = false;
        if (Math.abs(target[i] - s.v[i]) > small) big = true;
      }
      if (snap || (rest && !big)) { for (let i = 0; i < n; i++) { s.v[i] = s.w[i] = target[i]; s.out[i] = target[i]; } return s.out; }
      let still = true;
      for (let i = 0; i < n; i++) {
        const r = follow2(s.v[i], s.w[i], target[i], dt, tau, eps);
        s.v[i] = r.v; s.w[i] = r.w; s.out[i] = r.v;
        if (r.v !== target[i] || r.w !== target[i]) still = false;
      }
      if (!still) api.moving = true;
      return s.out;
    },
    /** Forget keys not stepped in `keep` (a Set): drawn again later, they start where they are told. */
    // (Keys alone, not each [key, state] pair: no pair is made for every key at every sync.)
    prune(keep) { for (const k of S.keys()) if (!keep.has(k)) { spare.push(S.get(k)); S.delete(k); } },
  };
  return api;
}

// ── The shown state of every number and trace (premium-feel R4) ──
// The engine posts a snapshot about every 95 ms and the page paints the newest one unblended (paint-gate.js). The widths and
// colours already follow it through follow2; the numbers and the traces that read off them (the bottom bar's tiles and bars,
// the Readouts tab, the Pressure chart and the six ladders, the Doppler and FibroScan readings, the HVPG card) follow it the same
// way, with the same time constant, so one model shows on one clock. Two rules keep it honest:
//  - a small step at rest (under what the number prints) is shown at once, so a steady model costs no frames;
//  - a change the model calls discontinuous (a reset, a patient, an intervention, a clock change: main.js noteJump) is never
//    blended into the state before it: every follower takes its next target at once. Charts keep the model's own time axis.
//  - a running model never rests (its means drift and its beat and breath wobble past `small` now and then), so "at rest" alone left a
//    follower on its way almost every frame, and every surface that repaints from it drew at the screen's rate for nothing. A value
//    whose two stages are both within `small` of its target is therefore shown at the target whether it was at rest or on its way
//    (the same step that was always shown at once), and a follower lands there, not only within `eps` of it: what is left to ease is
//    under half of the last digit printed, or under a quarter of a pixel of a bar, and cannot be seen.
export const SHOWN_TAU = 0.2;
/** A bar's `small` as a share of its scale: half a pixel or a little more on the widest bars (a tile's bar is 100 to 170 px). A move of
 *  a bar under that cannot be seen to glide, so it lands at once (see the rules above). */
export const FILL_SMALL = 0.005;
/** A bar's start and length as written to the page: in steps of 1/2048 of its track (a twentieth to a tenth of a device pixel on a tile's bar),
 *  so a drift the screen cannot show writes nothing, and no style or paint is asked for it. */
export const fillQ = (n) => Math.round(n * 2048) / 2048;
let jumps = 0;
/** The model just jumped (main.js, from the frame's jump flag or a clock change): every follower takes its next target at once. */
export function noteJump() { jumps++; }
/** How many jumps so far: a follower that saw another count snaps. */
export const jumpCount = () => jumps;

/**
 * One scalar that follows its target (a reading's shown value): step(target, dt) → the value to show now. snap: show the target
 * at once. small: a step at rest of at most this much is shown at once. A jump since the last step (noteJump) snaps too.
 * `moving` while it is on its way.
 */
export function createFollow({ tau = SHOWN_TAU, eps = 0.005, small = 0 } = {}) {
  const s = { v: NaN, w: NaN, T: NaN, epoch: -1, moving: false };
  return {
    get moving() { return s.moving; },
    get value() { return s.v; },
    step(T, dt, snap = false) {
      if (!Number.isFinite(T)) { s.v = s.w = s.T = T; s.moving = false; return T; }
      // (Both stages within `small` of the target, at rest or on the way: it is shown as it is, see the shown state's rules above.)
      if (snap || !Number.isFinite(s.v) || !Number.isFinite(s.w) || s.epoch !== jumps || (Math.abs(T - s.v) <= small && Math.abs(T - s.w) <= small)) {
        s.v = s.w = s.T = T; s.epoch = jumps; s.moving = false; return T;
      }
      const r = follow2(s.v, s.w, T, dt, tau, eps);
      s.v = r.v; s.w = r.w; s.T = T;
      if (Math.abs(T - s.v) <= small && Math.abs(T - s.w) <= small) s.v = s.w = T;   // (landed: what is left cannot be seen)
      s.moving = s.v !== T || s.w !== T;
      return s.v;
    },
    snap(T) { s.v = s.w = s.T = T; s.epoch = jumps; s.moving = false; },
  };
}

/**
 * The page's shown readings, keyed by name, stepped once per display frame while any is on its way (the scheduler's early phase:
 * whoever draws from them later in the frame draws this frame's values). set(key, target, { snap, small, eps }) takes a model frame's
 * value and returns the value to show now (across: it eases across a jump too, for a piece whose move was always a glide, a bar's
 * length); get(key) the value shown (undefined: none). on(cb): cb() after each frame's step, while
 * anything moves (a surface repaints from the shown values then). ask/cancel: the scheduler (frame.js frame, cancelFrame).
 */
export function createShownState({ tau = SHOWN_TAU, ask, cancel = () => {}, now = () => performance.now() } = {}) {
  const S = new Map(), subs = new Set();
  let raf = 0, last = 0;
  function tick(t) {
    raf = 0;
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
    last = t;
    let any = false;
    for (const s of S.values()) {
      if (!s.moving) continue;
      if (s.epoch !== jumps && !s.across) { s.v = s.w = s.T; s.moving = false; continue; }
      const r = follow2(s.v, s.w, s.T, dt, tau, s.eps);
      s.v = r.v; s.w = r.w;
      if (Math.abs(s.T - s.v) <= s.small && Math.abs(s.T - s.w) <= s.small) s.v = s.w = s.T;   // (landed: what is left cannot be seen)
      s.moving = s.v !== s.T || s.w !== s.T;
      if (s.moving) any = true;
    }
    api.moving = any;
    for (const cb of subs) { try { cb(); } catch (e) { setTimeout(() => { throw e; }); } }
    if (any && ask) raf = ask(tick);
  }
  const api = {
    moving: false,
    set(key, T, { snap = false, small = 0, eps = 0.005, across = false } = {}) {
      if (!Number.isFinite(T)) { S.delete(key); return T; }
      let s = S.get(key);
      if (!s) { s = { v: T, w: T, T, eps, small, epoch: jumps, moving: false, across }; S.set(key, s); return T; }
      s.eps = eps; s.small = small; s.across = across;
      if (across) s.epoch = jumps;
      if (snap || s.epoch !== jumps || (Math.abs(T - s.v) <= small && Math.abs(T - s.w) <= small)) { s.v = s.w = s.T = T; s.epoch = jumps; s.moving = false; return T; }
      s.T = T;
      if (s.v !== T || s.w !== T) {
        s.moving = true; api.moving = true;
        if (!raf && ask) { last = now(); raf = ask(tick); }
      }
      return s.v;
    },
    get(key) { return S.get(key)?.v; },
    /** The value shown for key, or fallback where there is none. */
    or(key, fallback) { const v = S.get(key)?.v; return Number.isFinite(v) ? v : fallback; },
    delete(key) { S.delete(key); },
    on(cb) { subs.add(cb); return () => subs.delete(cb); },
    /** (Tests: step one frame at time t.) */
    tick,
    stop() { if (raf) cancel(raf); raf = 0; },
  };
  return api;
}
