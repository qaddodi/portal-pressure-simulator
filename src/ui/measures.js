// Three different pressure measurements, kept apart on purpose:
//   vessel pressure   the mean pressure at one place (what the vessel color and label show);
//   HVPG              wedged minus free hepatic venous pressure;
//   direct gradient   portal vein minus a chosen systemic reference (here the suprahepatic IVC).
// Only the last two are differences, so only they carry clinical annotations. Absolute
// pressure at a vessel has no threshold. Used by the pressure landscape.

import { store } from './store.js?v=9c069d2ebf';
import { h, fmt } from './util.js?v=994e190477';
import { NODES, EDGES } from '../engine/topology.js?v=29d10ad9ef';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

// Reference the direct gradient is taken against. One place to change if the model moves it.
export const SYSTEMIC_REFERENCE = { id: 'IVCS', name: 'suprahepatic IVC' };

export const MEASURE_TITLE = 'Three different measurements';

// The annotation beside each gradient, with its clinical context. PMIDs are PubMed IDs.
const NOTE = {
  hvpg: 'In cirrhosis, HVPG ≥ 10 mmHg is clinically significant portal hypertension (Baveno VII). Measured during an acute variceal bleed, ≥ 20 mmHg predicts early treatment failure and death (PMID 18093686); it is not a danger level for every vein. HVPG reads low in presinusoidal disease.',
  direct: 'Measured directly, for example at TIPS or by endoscopic ultrasound. It is not HVPG: in presinusoidal disease it can be high while HVPG stays low (PSVD cohort: mean 16.7 vs 5.5 mmHg, PMID 40251984). 12 mmHg is a usual post-TIPS target, not a bleeding threshold: bleeding occurs below 12 in directly measured series (PMID 7485008).',
};

/** What the vessel-pressure row is about: the selected node or vessel, else the portal vein. */
function place(f) {
  const P = f.Pf || f.P, sel = store.get().selection;
  if (sel?.type === 'node' && NI[sel.id] != null) return { name: NODES[NI[sel.id]].label, p: [P[NI[sel.id]]] };
  if (sel?.type === 'edge' && EI[sel.id] != null) {
    const e = EDGES[EI[sel.id]];
    return { name: e.label || e.id, p: [P[NI[e.from]], P[NI[e.to]]] };
  }
  return { name: 'Portal vein', p: [P[NI.CONF]] };
}

/** The three rows for a frame, honouring what a case hides from the learner. */
export function measurementRows(f) {
  const st = store.get(), m = f.metrics, hidden = st.hiddenReadouts;
  if (st.imaging) return null;
  const mmHg = (v) => `${fmt(v, 1)} mmHg`;
  const at = place(f);
  const pvHidden = hidden?.has('pv');
  // A case can hide the true HVPG until the learner measures it with the catheter.
  const meas = hidden?.has('trueHVPG') ? st.lastHVPG : null;
  const hvHidden = hidden?.has('trueHVPG') && !meas;
  const hv = meas || m;
  const diff = m.ppg - m.hvpg;
  return [
    { id: 'vessel', name: 'Vessel pressure', value: pvHidden ? '?' : at.p.map((v) => fmt(v, 1)).join(' → ') + ' mmHg',
      def: `Mean pressure at ${at.name.toLowerCase()}${at.p.length > 1 ? ' (upstream → downstream)' : ''}. Drawn as vessel color and a numeric label.`, note: '' },
    { id: 'hvpg', name: 'HVPG', value: hvHidden ? '?' : mmHg(hv.hvpg),
      def: hvHidden ? 'Wedged − free hepatic venous pressure. Hidden in this case.' : `Wedged − free hepatic venous pressure: ${fmt(hv.whvp, 1)} − ${fmt(hv.fhvp, 1)}.`, note: NOTE.hvpg },
    { id: 'direct', name: 'Direct portal–systemic gradient', value: pvHidden ? '?' : mmHg(m.ppg),
      def: pvHidden ? `Portal vein − ${SYSTEMIC_REFERENCE.name}.` : `Portal vein − ${SYSTEMIC_REFERENCE.name}: ${fmt(m.pv, 1)} − ${fmt(m.ivc, 1)}.`, note: NOTE.direct,
      flag: !pvHidden && !hvHidden && diff >= 5 ? `Here the direct gradient is ${fmt(diff, 1)} mmHg above HVPG: the resistance lies before the sinusoids.` : '' },
  ];
}

/** Live card (pressure landscape). */
export function createMeasureCard() {
  const el = h('div', { class: 'mcard', role: 'group', 'aria-label': MEASURE_TITLE });
  let key = '';
  function update(f) {
    const rows = f && measurementRows(f);
    if (!rows) { key = ''; el.replaceChildren(h('div', { class: 'mc-t' }, MEASURE_TITLE), h('div', { class: 'mc-d' }, 'Pressures are unmeasured in this case.')); return; }
    const k = JSON.stringify(rows);
    if (k === key) return;
    key = k;
    el.replaceChildren(h('div', { class: 'mc-t' }, MEASURE_TITLE), ...rows.map((r) => h('div', { class: 'mc-row', 'data-k': r.id },
      h('div', { class: 'mc-h' }, h('span', { class: 'mc-n' }, r.name), h('b', { class: 'mc-v' }, r.value)),
      h('div', { class: 'mc-d' }, r.def),
      r.flag ? h('div', { class: 'mc-f' }, r.flag) : null,
      r.note ? h('div', { class: 'mc-a' }, r.note) : null)));
  }
  return { el, update };
}
