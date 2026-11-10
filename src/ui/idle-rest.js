// Idle rest (idle heat, 1 Nov; Mohammad: 30 s, never in a talk). Left alone, the app drew the whole figure fresh on every screen
// frame for as long as it stayed open: the blood moves and the model breathes. After AFTER_MS with no input (pointer, key, wheel,
// touch, scroll, the page shown again), and only while canRest() allows it, onRest() is called once; the first input after that
// calls onWake() in the same event, before the page handles it. Nothing here draws: the caller eases the figure in and out.

export const REST_AFTER_MS = 30000;
const INPUTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll', 'focusin'];

/**
 * createIdleRest({ after, canRest, onRest, onWake, target, now, setTimer, clearTimer }): { resting(), poke(), dispose() }.
 * after: ms of no input before resting, or a function giving it (asked each time).
 * canRest(): whether resting is allowed now (asked when the time is up, and again every 5 s while it says no).
 * onInput(): called at every input, before anything else (frame.js noteInput: the touch devices' rest pacing restarts its clock from it, H1).
 * target: where the inputs are listened for (window); now/setTimer/clearTimer: the clock (tests pass their own).
 */
export function createIdleRest({ after = REST_AFTER_MS, canRest = () => true, onRest = () => {}, onWake = () => {}, onInput = () => {}, target = globalThis.window,
  now = () => performance.now(), setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t), doc = globalThis.document } = {}) {
  const afterMs = () => (typeof after === 'function' ? after() : after);   // (a talk rests sooner than Explore: the delay is asked each time)
  let last = now(), timer = 0, resting = false;
  const arm = (ms) => { clearTimer(timer); timer = setTimer(check, Math.max(50, ms)); };
  function check() {
    timer = 0;
    if (resting) return;
    const idle = now() - last;
    const wait = afterMs();
    if (idle < wait) { arm(wait - idle); return; }
    if (doc?.hidden || !canRest()) { arm(Math.min(wait, 5000)); return; }   // (asked again soon: a talk or a time-lapse may end without an input)
    resting = true;
    onRest();
  }
  // (A pointer move only stamps the time while awake: no timer is reset per move, the check reads the stamp when it fires.)
  function poke() {
    last = now();
    onInput(last);
    if (resting) { resting = false; onWake(); arm(afterMs()); }
    else if (!timer) arm(afterMs());
  }
  const onVis = () => { if (!doc.hidden) poke(); };
  const opts = { capture: true, passive: true };
  for (const t of INPUTS) target?.addEventListener(t, poke, opts);
  doc?.addEventListener?.('visibilitychange', onVis);
  arm(afterMs());
  return {
    resting: () => resting,
    poke,
    dispose() { clearTimer(timer); for (const t of INPUTS) target?.removeEventListener(t, poke, opts); doc?.removeEventListener?.('visibilitychange', onVis); },
  };
}
