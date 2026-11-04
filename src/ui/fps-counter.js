// A frame-rate counter in the bottom-left corner (Settings, "Show frame rate"; off unless turned on, Mohammad 4 Nov 2026).
//
// Its words are drawn on the GPU by gl-words.js (the shared svg-gl context), so the counter writes nothing into the page in a frame.
// "fps" is its own element, set once and kept (keep: true), so it never redraws; only the digits change. The reading is taken twice a
// second; the digits then count toward it, a few numbers per step, instead of flipping. Nothing runs while it is off: no element, no frame
// callback, no GPU picture.
//
//   setFpsCounter(true | false)   // shows or removes it; idempotent

import { h } from './util.js';
import { glWords } from './gl-words.js';
import { frameFor } from './frame.js';

const EVERY = 500;   // ms between readings
const STEP = 32;     // ms between steps of the count
const next = frameFor('fps-counter');
let el = null, num = null, unit = null, ask = 0, t0 = 0, tStep = 0, n = 0, shown = 0, target = 0;

const tick = (t) => {
  if (!el) return;   // (turned off: the callback already asked for ends here)
  ask = next(tick);
  n++;
  if (!t0) { t0 = t; return; }
  if (t - t0 >= EVERY) { target = Math.round((n * 1000) / (t - t0)); t0 = t; n = 0; }
  if (shown !== target && t - tStep >= STEP) {
    tStep = t;
    const d = target - shown;
    shown += Math.abs(d) <= 2 ? d : Math.ceil(Math.abs(d) / 4) * Math.sign(d);   // (closes a gap in about six steps)
    num.set(String(shown));
  }
};

export function setFpsCounter(on) {
  if (!on === !el) return;
  if (on) {
    const a = h('span', { class: 'fps-num' }), b = h('span', { class: 'fps-unit' });
    el = h('div', { class: 'fps-counter', 'aria-hidden': 'true' }, a, b);
    document.body.appendChild(el);
    num = glWords(a); unit = glWords(b, { keep: true });
    num.set('--'); unit.set('fps');
    t0 = 0; n = 0; shown = 0; target = 0; tStep = 0;
    ask = next(tick);
  } else {
    ask = 0;
    num.dispose(); unit.dispose(); num = unit = null;
    el.remove(); el = null;
  }
}
