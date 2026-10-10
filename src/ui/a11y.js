// Accessibility beyond the keyboard (plan §6.1).
//
// The figure's accessible description is kept current with the narrator's one-line reading.

import { store, hiddenNow } from './store.js?v=5edd069b32';
import { fmt } from './util.js?v=e0101a3fa2';
import { EDGES } from '../engine/topology.js?v=706a39d50b';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

// Narrator: the patient's reading in one line for the caption under the figure
// ("Cirrhosis. Portal pressure 23 mmHg, HVPG 17. Large varices, 0.8 L ascites, flow toward the liver.").
// It hides what the case hides. scenario: false leaves out the patient's name.
export function caption(f, { scenario = true } = {}) {
  if (!f) return '';
  const st = store.get(), m = f.metrics, hidden = hiddenNow(st);
  const scen = st.presetList?.find((p) => p.id === st.presetId)?.label || 'Custom patient';
  const parts = scenario ? [`${scen}.`] : [];
  if (f.bleed?.active) parts.push(`Active variceal bleed, HR ${fmt(m.hr, 0)}, MAP ${fmt(m.map, 0)}.`);
  const p = [];
  if (!hidden?.has('pv')) p.push(`Portal pressure ${fmt(m.pv, 0)} mmHg${m.pv <= 10 ? '' : m.pv < 15 ? ' (raised)' : ' (high)'}`);
  if (!hidden?.has('trueHVPG')) p.push(`HVPG ${fmt(m.hvpg, 0)}`);
  if (p.length) parts.push(p.join(', ') + '.');
  const q = (f.Qf || f.Q)[EI.PV_TRUNK];
  const flow = q < -0.05 ? 'flow reversed, away from the liver' : Math.abs(m.pvVel) < 9 ? 'sluggish portal flow' : 'flow toward the liver';
  const e = [];
  if (m.varix.d >= 2.5) e.push(`${m.varix.grade.label.toLowerCase()} varices${m.varix.redWale ? ' with red wale signs' : ''}`);
  if (m.ascites.grade > 0) e.push(`${fmt(m.ascites.volume / 1000, 1)} L ascites`);
  e.push(flow);
  const tail = e.join(', ');
  parts.push(tail[0].toUpperCase() + tail.slice(1) + '.');
  return parts.join(' ');
}
