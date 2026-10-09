// The Guidelines instrument: the guideline lens (next-level blueprint E2) as a tab in Measure. It reads
// the patient through the Baveno VII rules (AASLD 2024 where it agrees), each with the rule it used and
// a one-line reason from the live readings. The rules themselves are in engine/guidelines.js.

import { h } from './util.js?v=86153645a3';
import { store, hiddenNow } from './store.js?v=1d7cd9b00f';
import { guidelineLens } from '../engine/guidelines.js?v=61be844d06';

const DOT = { yes: 'danger', maybe: 'caution', no: 'ok', na: 'none' };

export function createGuidelines() {
  const stageEl = h('p', { class: 'gl-stage' });
  const inputs = h('dl', { class: 'gl-inputs' });
  const notes = h('div', { class: 'gl-notes' });
  const list = h('ol', { class: 'gl-rules' });
  const off = h('p', { class: 'gl-off', hidden: true }, 'The guideline lens is off during a case, so it does not give the answer away.');
  const foot = h('p', { class: 'ctl-sub gl-foot' },
    'Illustrative: read from the model, never patient advice. Sources: Baveno VII (de Franchis et al., J Hepatol 2022) and the AASLD 2024 practice guidance (Kaplan et al., Hepatology 2024). Every rule is listed in About the model.');
  const body = h('div', { class: 'gl-body' }, h('div', { class: 'gl-head' }, h('span', { class: 'gl-cap' }, 'Where this patient sits'), stageEl), inputs, notes, list);
  const el = h('div', { class: 'dock-pane gl-pane', 'data-pane': 'guidelines' }, off, body, foot);
  let key = '', last = 0;

  function update(f) {
    const st = store.get(), now = performance.now();
    const inCase = st.mode === 'cases';
    off.hidden = !inCase; body.hidden = inCase;
    if (inCase || (now - last < 400 && key)) return;
    last = now;
    const m = f.metrics;
    const hvpg = hiddenNow(st)?.has('trueHVPG') ? (st.lastHVPG?.hvpg ?? null) : m.hvpg;
    const L = guidelineLens(m, st.params, hvpg);
    const k = JSON.stringify(L);
    if (k === key) return;
    key = k;
    stageEl.textContent = L.stage;
    inputs.replaceChildren(...L.inputs.map(([a, b]) => h('div', {}, h('dt', {}, a), h('dd', {}, b))));
    notes.replaceChildren(...L.notes.map((n) => h('p', { class: 'gl-note' }, n)));
    list.replaceChildren(...L.rules.map((r) => h('li', { class: 'gl-rule', 'data-state': r.state },
      h('div', { class: 'gl-top' }, h('i', { class: 'dot', 'data-sev': DOT[r.state], 'aria-hidden': 'true' }), h('b', {}, r.title), h('span', { class: 'gl-verdict' }, r.verdict)),
      h('p', { class: 'gl-reason' }, r.reason),
      h('p', { class: 'gl-crit' }, r.rule, ' ', r.src.map((s) => h('span', { class: 'gl-src' }, s))))));
  }
  return { id: 'guidelines', label: 'Guideline lens', el, update };
}

/** The verdict shown on the tab. */
export function guidelineTab(f) {
  const st = store.get();
  if (st.mode === 'cases') return 'Off in cases';
  const hvpg = hiddenNow(st)?.has('trueHVPG') ? (st.lastHVPG?.hvpg ?? null) : f.metrics.hvpg;
  return guidelineLens(f.metrics, st.params, hvpg).stage.replace(/^cACLD, /, '');
}
