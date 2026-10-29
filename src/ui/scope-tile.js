// The endoscopic view as a tile of the readings card (slide field `scopeTile: true`): a small round picture of the distal esophagus
// at the varix's size now, so a time-lapse shows the varices swelling from small to large behind the chart. The picture is the
// instrument's own (endo-render.js, endo-size.js), drawn once for each step of 1/14 of its engorgement and eased from the one before.
import { h } from './util.js?v=58b547f8d4';
import { renderEndo } from './endo-render.js?v=4ff328cb91';
import { endoGrow, LARGE_MM } from './endo-size.js?v=e0a58bf20e';

const RES = 168, STEPS = 14, NONE_MM = 2.5;   // (2.5 mm: below it the metrics call it no varix)
export const scopeKey = (d) => (Number.isFinite(d) && d >= NONE_MM ? Math.round(endoGrow(d) * STEPS) : -1);
export const scopeWord = (d) => (!Number.isFinite(d) ? '' : d < NONE_MM ? 'No varices' : d >= LARGE_MM ? 'Large varices' : 'Small varices');

export function createScopeTile() {
  const under = h('canvas', { class: 'pzs-under', width: RES, height: RES, 'aria-hidden': 'true' });
  const top = h('canvas', { class: 'pzs-top', width: RES, height: RES, role: 'img', 'aria-label': 'Endoscopic view of the esophagus' });
  const word = h('span', { class: 'pzs-word' });
  const el = h('div', { class: 'pzs-pic' }, h('span', { class: 'pzs-disc' }, under, top), word);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let key = null, timer = 0;
  function paint(k) {
    const img = renderEndo(RES, { grow: Math.max(0, k) / STEPS, bands: 0, vis: k < 0 ? 0 : 1, red: 0 });
    under.getContext('2d').drawImage(top, 0, 0);
    const c = top.getContext('2d');
    c.clearRect(0, 0, RES, RES); c.drawImage(img, 0, 0);
    if (!reduce.matches && key !== null) top.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
    key = k;
  }
  return {
    el,
    /** d: the varix diameter now, in mm. */
    set(d) {
      const k = scopeKey(d), w = scopeWord(d);
      if (word.textContent !== w) word.textContent = w;
      if (k === key) return;
      clearTimeout(timer);
      timer = setTimeout(() => paint(k), key === null ? 0 : 30);   // (out of the model frame's own work)
    },
  };
}
