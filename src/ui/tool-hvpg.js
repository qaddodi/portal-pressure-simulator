// The HVPG catheter's tracing as a slide's data card (tool: { kind: 'hvpg' }): the monitor of the HVPG procedure (hvpg-proc.js
// createHvpgMonitor) with no catheter on the figure. Going forward onto the slide it sweeps the free pressure, inflates the balloon and
// climbs to the wedge, then holds the result, all on the procedure's own clock (hvpg-clock.js); the balloon is driven here from that clock
// since there is no catheter to read it from. Jumped to or gone back to, it shows the finished tracing at once. When the model changes on
// the slide (a drug, a button, a time-lapse) the free and wedged levels and the HVPG ease to the new numbers. The HVPG it prints is the
// difference of the two readings as shown (tenthGap), so WHVP minus FHVP reads exactly.
//
// With tool: { kind: 'hvpg', catheter: true } on a slide whose catheter is on the figure (cath: 'free', 'wedge' or 'result') the card plays
// nothing of its own: it shows the step the catheter is at, the figure's balloon sets the pressure's rise (balloon, driven by the presenter
// every frame), and the slide's readings are the ones the catheter's callouts print. The same card stays up from one such slide to the
// next (card-keep.js), and the trace carries on from where the last slide left it.

import { createHvpgMonitor } from './hvpg-proc.js?v=c793a707c4';
import { T, ease, k01 } from './hvpg-clock.js?v=553551a92a';
import { frameFor, cancelFrame } from './frame.js?v=7254a8a850';
import { tenthGap } from '../engine/gap.js?v=3aabfbb29b';
const nextFrame = frameFor('tool-hvpg');

const EASE_S = 0.22;
const REDUCED = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The readings a card shows from a fingerprint (or the live metrics): the two pressures, and the HVPG as the difference of them as printed. */
export const levelsOf = (m) => (m && Number.isFinite(m.fhvp) && Number.isFinite(m.whvp) ? { fhvp: m.fhvp, whvp: m.whvp, hvpg: tenthGap(m.whvp, m.fhvp, m.hvpg) } : null);
/** How long the free sweep lasts before the balloon starts, and the stretch between the balloon being up and the result taking over (ms on the procedure's clock). */
export const SWEEP_FREE_MS = T.inflate - 80 - (T.free - 300);
export const SWEEP_SETTLE_MS = T.callout - T.wedge;
/** The catheter steps a card can follow (a slide's cath). */
export const STEPS = ['free', 'wedge', 'result'];

export function createHvpgCard() {
  const mon = createHvpgMonitor();
  const el = mon.el;
  let target = null, cur = null, pending = 'result', token = 0, raf = 0, last = 0, done = false;
  let step = null, shown = false;   // (step: the catheter step this card follows, null when it plays on its own clock; shown: the card is on a slide now)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const gone = (my) => my !== token || !el.isConnected;
  // The levels ease to the target on each frame they move; the monitor reads `cur` in place, so a sweep in progress picks them up too.
  function tween(now) {
    raf = 0;
    if (!cur || !target) return;
    const k = REDUCED() ? 1 : 1 - Math.exp(-Math.min(0.1, Math.max(0, (now - last) / 1000)) / EASE_S);
    last = now;
    let moving = false;
    for (const key of ['fhvp', 'whvp']) {
      const d = target[key] - cur[key];
      if (Math.abs(d) < 0.02) cur[key] = target[key]; else { cur[key] += d * k; moving = true; }
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
        mon.balloon(ease(k));
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
    cur = { ...target };
    done = false;
    if (how === 'sweep' && !REDUCED()) sweep(token);
    else { done = true; mon.set('result', cur, 1, true); }
  }
  return {
    id: 'hvpg', label: 'HVPG, catheter tracing', el,
    /** The slide's options: with catheter: true, the step of the slide's catheter (cath) is the one the card shows. */
    configure(t, ctx) { step = t?.catheter && STEPS.includes(ctx?.slide?.cath) ? ctx.slide.cath : null; shown = true; },
    /** The card has left the screen (another slide's instrument, or none): it draws nothing more. */
    park() { shown = false; },
    /** The catheter's balloon (0 down … 1 wedged), every frame the figure moves it: the trace rides it. */
    balloon(b) { if (step && shown) mon.balloon(b); },
    /** The slide is shown: forward onto it from the slide before (and the card was not already this one's), the tracing plays; otherwise it is finished. */
    arrive({ forward = false, again = false } = {}) { pending = forward && !again ? 'sweep' : 'result'; },
    /** The slide's settled readings (the tiles' numbers, eased as the model changes): the levels take them. */
    pin(fp) {
      const lv = levelsOf(fp);
      if (!lv) return;
      if (step) { if (shown) mon.set(step, fp); return; }   // (the catheter sets the pace; the readings are the slide's, as its callouts print them)
      target = lv;
      if (pending) { const how = pending; pending = null; start(how); return; }
      follow();
    },
    dispose() { token++; cancelFrame(raf); raf = 0; },
  };
}
