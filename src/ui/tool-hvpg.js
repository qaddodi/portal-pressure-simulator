// The HVPG catheter's tracing as a slide's data card (tool: { kind: 'hvpg' }): the one pressure monitor (monitor.js, through hvpg-proc.js
// createHvpgMonitor), the catheter on the figure beside it (presenter.js cathBeside) driven by this card's balloon. Stepped onto going forward it shows the
// free pressure (FHVP) and waits; each Next takes the next reading, as on every measurement in the app (Mohammad, 13 Nov 2026: "it should just do the
// readings as i click next", "FHVP.. then WHVP then HVPG"): the balloon up and the pressure riding it to the wedge (WHVP), then the HVPG. Back takes them
// back the same way: the HVPG off, then the balloon down and the trace with it. Its balloon is handed to the figure's catheter (watch), so it inflates as
// the tracing says "balloon up". Jumped to or gone back to, it shows the finished tracing at once (and Back leaves the slide). When the model changes on
// the slide (a drug, a button, a time-lapse) the free and wedged levels and the HVPG ease to the new numbers. The HVPG it prints is the difference of the
// two readings as shown (tenthGap), so WHVP minus FHVP reads exactly.
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
  // (The reading this card's own steps are at (0 FHVP, 1 WHVP, 2 HVPG), and whether they were stepped on this visit: Back takes back only those.)
  let at = 2, stepped = false;
  // (A step ends when another starts or the card leaves its slide (park), never because the card is off the page a moment: a card zoomed
  // open, or moved as its slide settles, is put back.)
  const gone = (my) => my !== token || !shown;
  // The levels ease to the target on each frame they move; the monitor reads `cur` in place, so a step in progress picks them up too.
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
  // The balloon from a to b on the procedure's clock (its fill time, hvpg-clock.js T), the trace riding it and the figure's balloon told each frame.
  function ride(my, a, b) {
    const t0 = performance.now();
    const tick = (now) => {
      if (gone(my)) return;
      const k = REDUCED() ? 1 : k01(now - t0, 0, T.wedge - T.inflate), v = a + (b - a) * ease(k);
      mon.balloon(v); tell(v);
      if (k < 1) nextFrame(tick);
    };
    nextFrame(tick);
  }
  function start(how) {
    token++;
    cur = { ...target }; curWOn = false;
    stepped = how === 'steps';
    if (stepped) { done = false; at = 0; tell(0); mon.set('free', cur, 0); }
    else { done = true; at = 2; mon.set('result', cur, 1, true); tell(1); }
  }
  /** Next (dir 1) or Back (-1) on the slide: the next reading or the last one taken back (true), or nothing left to step (false: the slide moves on). */
  function stepBy(dir) {
    if (step || !shown || !cur || !target) return false;
    if (dir > 0) {
      if (at === 0) { at = 1; mon.set('wedge', cur, 0); ride(++token, 0, 1); return true; }
      if (at === 1) { at = 2; token++; done = true; mon.set('result', cur, 1); tell(1); return true; }
      return false;
    }
    if (!stepped) return false;
    if (at === 2) { at = 1; token++; done = false; mon.set('wedge', cur, 1, true); tell(1); return true; }
    if (at === 1) { at = 0; mon.set('free', cur, 1); ride(++token, 1, 0); return true; }
    return false;
  }
  return {
    id: 'hvpg', label: 'HVPG, catheter tracing', el,
    /** The slide's options: with catheter: true, the step of the slide's catheter (cath) is the one the card shows. */
    configure(t, ctx) { step = t?.catheter && STEPS.includes(ctx?.slide?.cath) ? ctx.slide.cath : null; shown = true; },
    /** The card has left the screen (another slide's instrument, or none): it draws nothing more. */
    park() { shown = false; watcher = null; token++; },
    step: stepBy,
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
    /** The slide is shown: forward onto it from the slide before (and the card was not already this one's), the tracing starts at the free pressure and each Next takes a reading; otherwise it is finished. */
    arrive({ forward = false, again = false } = {}) { pending = forward && !again ? 'steps' : 'result'; if (!step) bal = pending === 'steps' ? 0 : 1; },
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
