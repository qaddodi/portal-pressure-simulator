// Accessibility beyond the keyboard (plan §6.1).
//
// The figure's accessible description is kept current with a one-line reading of the patient.

import { store, hiddenNow } from './store.js';
import { fmt } from './util.js';
import { EDGES } from '../engine/portal/topology.js';
import { judgeFlow } from './velNormal.js';
import { hvpgSev, HVPG_WORDS } from '../engine/portal/pressure-cuts.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

// The patient's reading in one line for the figure's accessible description
// ("Cirrhosis. Portal pressure 23 mmHg, HVPG 17.0 mmHg (CSPH). Large varices, 0.8 L ascites, flow toward the liver.").
// It hides what the figure hides. scenario: false leaves out the patient's name.
export function caption(f, { scenario = true } = {}) {
  if (!f) return '';
  const st = store.get(), m = f.metrics, hidden = hiddenNow(st);
  const scen = st.presetList?.find((p) => p.id === st.presetId)?.label || 'Custom patient';
  const parts = scenario ? [`${scen}.`] : [];
  if (f.bleed?.active) parts.push(`Active variceal bleed, HR ${fmt(m.vitals?.hr ?? m.hr, 0)}, MAP ${fmt(m.vitals?.map ?? m.map, 0)}.`);   // (the vitals as the bar reads them, over the breath)
  const p = [];
  // The absolute portal pressure is read out as a number, with no severity word of its own: no guideline grades it (R09, external production review, 15 Nov 2026; the
  // caption used to say "(raised)" and "(high)" from its own copy of the lines). The gradient carries the interpretation, the band the HVPG tile shows, from the same
  // table (pressure-cuts.js): "HVPG 17.0 (CSPH)", the number at one decimal as the tile prints and rates it ('10' for 9.6 read as past the CSPH line).
  if (!hidden?.has('pv')) p.push(`Portal pressure ${fmt(m.pv, 0)} mmHg`);
  if (!hidden?.has('trueHVPG')) { const h = +fmt(m.hvpg, 1); p.push(`HVPG ${fmt(m.hvpg, 1)} mmHg (${HVPG_WORDS[hvpgSev(h)][0]})`); }
  if (p.length) parts.push(p.join(', ') + '.');
  const q = (f.Qf || f.Q)[EI.PV_TRUNK];
  // (The same cut-offs as the Doppler's reading and the figure's labels, velNormal.js judgeFlow: a screen-reader listener keeps the direction of a slow flow.)
  const jf = judgeFlow(m.pvVelMean ?? m.pvVel, q, null, { ref: st.healthy?.Q?.[EI.PV_TRUNK] });
  const flow = jf.none ? 'no portal flow' : jf.stasis ? (jf.reversed ? 'sluggish, reversed portal flow' : 'sluggish portal flow')
    : jf.reversed ? 'flow reversed, away from the liver' : 'flow toward the liver';
  const e = [];
  if (m.varix.present) e.push(`${m.varix.grade.label === 'None' ? 'banded' : m.varix.grade.label.toLowerCase()} varices${m.varix.redWale ? ' with red wale signs' : ''}`);
  if (m.ascites.grade > 0) e.push(`${fmt(m.ascites.volume / 1000, 1)} L ascites`);
  e.push(flow);
  const tail = e.join(', ');
  parts.push(tail[0].toUpperCase() + tail.slice(1) + '.');
  return parts.join(' ');
}
