// The HVPG catheter's tracing as a slide's data card (tool: { kind: 'hvpg' }): the monitor of the HVPG procedure (hvpg-proc.js
// createHvpgMonitor), the catheter on the figure beside it (presenter.js cathBeside) driven by this card's balloon. Going forward onto the slide it sweeps the free pressure, inflates the balloon and
// climbs to the wedge, then holds the result, all on the procedure's own clock (hvpg-clock.js); the balloon is driven here from that clock
// (and handed to the figure's catheter, watch: it inflates as the tracing says "balloon up"). Jumped to or gone back to, it shows the finished tracing at once. When the model changes on
// the slide (a drug, a button, a time-lapse) the free and wedged levels and the HVPG ease to the new numbers. The HVPG it prints is the
// difference of the two readings as shown (tenthGap), so WHVP minus FHVP reads exactly.
//
// With tool: { kind: 'hvpg', catheter: true } on a slide whose catheter is on the figure (cath: 'free', 'wedge' or 'result') the card plays
// nothing of its own: it shows the step the catheter is at, the figure's balloon sets the pressure's rise (balloon, driven by the presenter
// every frame), and the slide's readings are the ones the catheter's callouts print. The same card stays up from one such slide to the
// next (card-keep.js), and the trace carries on from where the last slide left it.

import { createHvpgMonitor } from './hvpg-proc.js';
import { T, ease, k01 } from './hvpg-clock.js';
import { frameFor, cancelFrame } from './frame.js';
import { tenthGap } from '../engine/gap.js';
import { follow2, SHOWN_TAU } from './display-state.js';
import { reduceMotionMQ } from './motion.js';
const nextFrame = frameFor('tool-hvpg');
const REDUCED = () => typeof matchMedia === 'function' && reduceMotionMQ.matches;
/** The readings a card shows from a fingerprint (or the live metrics): the two pressures, and the HVPG as the difference of them as printed. */
export const levelsOf = (m) => (m && Number.isFinite(m.fhvp) && Number.isFinite(m.whvp) ? { fhvp: m.fhvp, whvp: m.whvp, hvpg: tenthGap(m.whvp, m.fhvp, m.hvpg) } : null);
/** How long the free sweep lasts before the balloon starts, and the stretch between the balloon being up and the result taking over (ms on the procedure's clock). */
export const SWEEP_FREE_MS = T.inflate - 80 - (T.free - 300);   // motion-scale: own pace (the sweep, from the procedure's table)
export const SWEEP_SETTLE_MS = T.callout - T.wedge;   // motion-scale: own pace (the sweep, from the procedure's table)
/** The catheter steps a card can follow (a slide's cath). */
export const STEPS = ['free', 'wedge', 'result'];

const KEYS = ['fhvp', 'whvp'];
export function createHvpgCard() {
  const mon = createHvpgMonitor();
  const el = mon.el;
  let target = null, cur = null, pending = 'result', token = 0, raf = 0, last = 0, done = false;
  let reached = false, kept = null;   // (reached: the catheter on the figure is parked in the hepatic vein, presenter.js; kept: the slide's readings, held until it is, so nothing is recorded before)
  let step = null, shown = false;   // (step: the catheter step this card follows, null when it plays on its own clock; shown: the card is on a slide now)
  // (The balloon this card's own tracing has up, 0 down … 1 wedged, and who is told of it: the presenter's catheter on the figure beside the card
  // (watch). The figure's balloon is the tracing's own, so the catheter inflates exactly as the card says "balloon up" and is down while it is free.)
  let bal = 0, watcher = null;
  const tell = (b) => { bal = b; if (watcher) watcher(b); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // (A sweep ends when another starts or the card leaves its slide (park), never because the card is off the page a moment: a card zoomed
  // open, or moved as its slide settles, is put back, and a sweep that gave up there left the tracing stopped at "balloon up" for good.)
  const gone = (my) => my !== token || !shown;
  // The levels ease to the target on each frame they move; the monitor reads `cur` in place, so a sweep in progress picks them up too.
  // (On the shown state's filter, display-state.js follow2, premium-feel R4: the bar's and the figure's one clock. curW: its first stage.)
  const curW = { fhvp: 0, whvp: 0 };   // (kept: written in place; curWOn says it holds a first stage)
  let curWOn = false;
  function tween(now) {
    raf = 0;
    if (!cur || !target) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    let moving = false;
    if (!curWOn) { curW.fhvp = cur.fhvp; curW.whvp = cur.whvp; curWOn = true; }
    for (let i = 0; i < KEYS.length; i++) {
      const key = KEYS[i];
      if (REDUCED()) { cur[key] = curW[key] = target[key]; continue; }
      const r = follow2(cur[key], curW[key], target[key], dt, SHOWN_TAU, 0.02);
      cur[key] = r.v; curW[key] = r.w;
      if (r.v !== target[key] || r.w !== target[key]) moving = true;
    }
    cur.hvpg = tenthGap(cur.whvp, cur.fhvp, target.hvpg);
    if (done) mon.set('result', cur, 1);
    if (moving && el.isConnected) raf = nextFrame(tween);
  }
  const follow = () => { if (!raf && cur && target) { last = performance.now(); raf = nextFrame(tween); } };
  async function sweep(my) {
    mon.set('free', cur, 0);
    await wait(SWEEP_FREE_MS);
    if (gone(my)) return;
    mon.set('wedge', cur, 0);
    const t0 = performance.now();
    await new Promise((fin) => {
      const tick = (now) => {
        if (gone(my)) { fin(); return; }
        const k = k01(now - t0, 0, T.wedge - T.inflate);
        mon.balloon(ease(k)); tell(ease(k));
        if (k < 1) nextFrame(tick); else fin();
      };
      nextFrame(tick);
    });
    if (gone(my)) return;
    await wait(SWEEP_SETTLE_MS);
    if (gone(my)) return;
    done = true;
    mon.set('result', cur, 1);
  }
  function start(how) {
    token++;
    cur = { ...target }; curWOn = false;
    done = false;
    if (how === 'sweep' && !REDUCED()) { tell(0); sweep(token); }
    else { done = true; mon.set('result', cur, 1, true); tell(1); }
  }
  return {
    id: 'hvpg', label: 'HVPG, catheter tracing', el,
    /** The slide's options: with catheter: true, the step of the slide's catheter (cath) is the one the card shows. */
    configure(t, ctx) { step = t?.catheter && STEPS.includes(ctx?.slide?.cath) ? ctx.slide.cath : null; shown = true; },
    /** The card has left the screen (another slide's instrument, or none): it draws nothing more. */
    park() { shown = false; watcher = null; },
    /** Tell fn the tracing's balloon each time it moves (the catheter on the figure beside this card, presenter.js cathBeside); null stops. Returns the balloon now. */
    watch(fn) { watcher = typeof fn === 'function' ? fn : null; return bal; },
    /** The catheter on the figure is parked in the hepatic vein (true) or on its way / gone (false): the tracing starts only then (a trace already begun carries on). */
    reach(b) {
      if (b === reached) return;
      reached = b;
      if (step && shown && b && kept && !mon.started()) mon.set(step, kept);
    },
    /** The catheter's balloon (0 down … 1 wedged), every frame the figure moves it: the trace rides it. */
    balloon(b) { if (step && shown) mon.balloon(b); },
    /** The slide is shown: forward onto it from the slide before (and the card was not already this one's), the tracing plays; otherwise it is finished. */
    arrive({ forward = false, again = false } = {}) { pending = forward && !again ? 'sweep' : 'result'; if (!step) bal = pending === 'sweep' ? 0 : 1; },
    /** The slide's settled readings (the tiles' numbers, eased as the model changes): the levels take them. */
    pin(fp) {
      const lv = levelsOf(fp);
      if (!lv) return;
      if (step) { kept = fp; if (shown) { if (reached || mon.started()) mon.set(step, fp); else mon.hold(); } return; }   // (the catheter sets the pace; the readings are the slide's, as its callouts print them)
      target = lv;
      if (pending) { const how = pending; pending = null; start(how); return; }
      follow();
    },
    dispose() { token++; cancelFrame(raf); raf = 0; },
  };
}
