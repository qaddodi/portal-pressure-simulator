// PLACEHOLDER, replaced at merge by the forest agent's file: the trials' ratios on one scale. This stand-in keeps the API (createForest({ host })
// → { el, configure({ ids, highlight, selected }), dispose }, and a pure forestLayout(trials, W, f, meas, opts)) and draws one row per trial,
// its name and its effect as reported, on the GPU through svg-gl with the trial card's looks.
import { h } from './util.js';
import { createSvgGL, svgModel as sv } from './svg-gl.js';
import { fittedType } from './chart-ctx.js';
import { measure } from './glyph-measure.js';
import { readMetric } from './layout-snap.js';
import { trialOf } from './trials.js';

const fx = (t) => t.effect || (t.ratios ?? []).map((r) => `${r.kind} ${r.est}`)[0] || '';

/** The rows for trials at width W, type size f: { texts: [{ x, y, t, look, anchor }], H }. */
export function forestLayout(trials, W, f, meas, opts = {}) {
  const texts = [], lh = f * 1.6;
  trials.forEach((t, i) => {
    const y = (i + 1) * lh, e = fx(t), ew = meas(e, `500 ${f}px Inter`);
    texts.push({ x: 0, y, t: t.short || t.name, look: 'trial.lab', anchor: 'start' }, { x: W, y, t: ew <= W / 2 ? e : '', look: 'trial.n', anchor: 'end' });
  });
  return { texts, H: Math.ceil(trials.length * lh + f * 0.6) };
}

export function createForest({ host } = {}) {
  const el = h('div', { class: 'pz-forest', role: 'group' });
  const gl = createSvgGL(el, { host: 'trial' });
  let ids = [];
  function draw() {
    const W = Math.round(readMetric(el, 'clientWidth') || 0);
    if (!W || !el.isConnected) return;
    const f = fittedType(el, gl, 12), L = forestLayout(ids.map(trialOf).filter(Boolean), W, f, measure);
    gl.show(sv('svg', { width: W, height: L.H, viewBox: `0 0 ${W} ${L.H}`, role: 'img' }, ...L.texts.map((s) => sv('text', { x: s.x, y: s.y, 'text-anchor': s.anchor, 'data-look': s.look }, s.t))), false);
    el.style.height = `${L.H}px`;
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(el);
  return {
    el,
    configure(o = {}) { ids = Array.isArray(o.ids) ? o.ids : []; draw(); },
    dispose() { ro?.disconnect(); gl.dispose?.(); },
  };
}
