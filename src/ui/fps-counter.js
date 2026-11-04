// A frame-rate counter in the bottom-left corner (Settings, "Show frame rate"; off unless turned on, Mohammad 4 Nov 2026).
//
// Its numbers are drawn on the GPU by gl-words.js (the shared svg-gl context), so the counter itself writes nothing into the page in a
// frame. A frame costs one counter increment; the reading is taken twice a second and only then is a word set. Nothing runs while it is off:
// no element, no frame callback, no GPU picture.
//
//   setFpsCounter(true | false)   // shows or removes it; idempotent

import { h } from './util.js';
import { glWords } from './gl-words.js';

const EVERY = 500;   // ms between readings
let el = null, words = null, raf = 0, t0 = 0, n = 0;

const tick = (t) => {
  raf = requestAnimationFrame(tick);
  n++;
  if (!t0) { t0 = t; return; }
  const dt = t - t0;
  if (dt < EVERY) return;
  words.set(String(Math.round((n * 1000) / dt)), 'fps');
  t0 = t; n = 0;
};

export function setFpsCounter(on) {
  if (!on === !el) return;
  if (on) {
    el = h('div', { class: 'fps-counter', 'aria-hidden': 'true' });
    document.body.appendChild(el);
    words = glWords(el);
    words.set('--', 'fps');
    t0 = 0; n = 0;
    raf = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(raf); raf = 0;
    words.dispose(); words = null;
    el.remove(); el = null;
  }
}
