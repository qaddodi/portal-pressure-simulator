// Slow-motion bench (card gallery, plan 2.8): the page and the model at a quarter or a tenth of speed, or held and stepped one frame at a time.
// It drives the test clock (src/test-clock.js speed, src/ui/test-mode.js pps.testClock({ speed }) and ({ step })): app time is the page's clock, so every
// card entry, camera move and fade slows together, and the engine (ticked from the same clock) follows. Use it for "it popped" and "it flickered",
// which happen in one or two frames: set a speed, then press Next in the app (or play a move from the Camera bench) and watch.
// Leaving the bench puts the clock back as it was found (off, or at its own speed).
import { benchRoot, h, statusLine, ppsOf } from './ui.js';

/** The speeds on offer: label, the clock's speed. Order is the button order. */
export const SPEEDS = Object.freeze([
  { id: 'full', label: '1×', speed: 1 },
  { id: 'half', label: '½', speed: 0.5 },
  { id: 'quarter', label: '¼', speed: 0.25 },
  { id: 'tenth', label: '1/10', speed: 0.1 },
  { id: 'twentieth', label: '1/20', speed: 0.05 },
  { id: 'hold', label: 'Hold', speed: 0 },
]);
/** Frame steps on offer (frames of app time at 60 a second). */
export const STEPS = Object.freeze([1, 2, 5, 10]);

/** How long one second of the app takes on the wall at a speed: "4 s" at ¼, "held" at 0. */
export function realSecondsPer(speed) {
  if (!(speed > 0)) return 'held';
  const k = 1 / speed;
  return `${Number.isInteger(k) ? k : k.toFixed(1)} s`;
}
/** The one line the bench shows for a clock state ({ on, speed, offset... } from pps.testClock()). */
export function describe(state) {
  if (!state?.on) return 'Real time: the test clock is off.';
  const sp = state.speed ?? 1;
  if (sp === 0) return 'Held. Step a frame to move; nothing else runs.';
  if (sp === 1) return 'Test clock on at real pace.';
  return `Slow motion at ${sp < 0.1 ? sp.toFixed(2) : +sp.toFixed(2)}×: one app second takes ${realSecondsPer(sp)}.`;
}

export default {
  id: 'slow-motion',
  title: 'Slow motion',
  mount(host, ctx) {
    const pps = ppsOf(ctx);
    benchRoot(host, 'Slow motion', 'Runs the page and the model on the test clock at a fraction of speed, or held, so a one- or two-frame glitch can be watched. Pick a speed, then press Next in the app or play a move; Step moves a held page by whole frames.');
    const say = statusLine();
    let wasOn = null, wasSpeed = 1, gone = false, timer = 0, busy = false;
    const speedBtns = new Map(), stepBtns = [];
    const call = async (arg) => (pps?.testClock ? pps.testClock(arg) : null);

    async function refresh() {
      const st = await call(undefined).catch(() => null);
      if (gone) return;
      if (!st) { say.set('The app\'s test clock is not available here (pps.testClock).', 'bad'); return; }
      const sp = st.on ? st.speed ?? 1 : 1;
      for (const [id, b] of speedBtns) b.setAttribute('aria-pressed', String(st.on && SPEEDS.find((s) => s.id === id).speed === sp));
      for (const b of stepBtns) b.disabled = !(st.on && sp === 0);
      say.set(describe(st), st.on && sp < 1 ? 'warn' : '');
    }
    async function setSpeed(speed) {
      if (busy) return; busy = true;
      try {
        const st0 = await call(undefined);
        if (wasOn === null) { wasOn = !!st0?.on; wasSpeed = st0?.speed ?? 1; }
        // (The clock on at real pace first, with the rate it is given, then the speed: a page that was not on it has its clocks swapped in the same call.)
        await call({ rate: st0?.rate >= 1 ? st0.rate : 1, speed });
      } catch (err) { say.set(`The clock would not change: ${err?.message || err}`, 'bad'); } finally { busy = false; }
      await refresh();
    }
    async function step(n) {
      if (busy) return; busy = true;
      try { await call({ step: n }); } catch (err) { say.set(`Step failed: ${err?.message || err}`, 'bad'); } finally { busy = false; }
      await refresh();
    }

    const row = h('div', { class: 'gb-row' }, h('span', { class: 'gb-note' }, 'Speed'));
    for (const s of SPEEDS) {
      const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setSpeed(s.speed) }, s.label);
      speedBtns.set(s.id, b); row.append(b);
    }
    const stepRow = h('div', { class: 'gb-row' }, h('span', { class: 'gb-note' }, 'Step (held only)'));
    for (const n of STEPS) { const b = h('button', { type: 'button', disabled: true, onclick: () => step(n) }, `+${n} frame${n > 1 ? 's' : ''}`); stepBtns.push(b); stepRow.append(b); }
    host.append(row, stepRow, say, h('p', { class: 'gb-note' }, 'The camera and card timings in the Camera bench read app time, so they stretch with the speed. Hold also stops the model; Step runs the engine\'s ticks with the frames.'));

    // (A slow chain of timeouts keeps the buttons true when something else changes the clock: never an interval.)
    const poll = () => { timer = setTimeout(() => { if (gone) return; refresh().finally(() => { if (!gone) poll(); }); }, 1000); };   // alloc-rare: once a second, a timer chain, not a frame callback
    refresh().then(poll);

    return () => {
      gone = true; clearTimeout(timer);
      // (Put back as found: off if it was off, else the speed it had.)
      if (wasOn === false) call(false); else if (wasOn) call({ speed: wasSpeed });
    };
  },
};
