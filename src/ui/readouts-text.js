// "Copy as text" for Tests > Readouts: the readings that are past a cut-off, written as one sentence for teaching notes or a feedback
// report. Pure (no page): the pane hands it the readings as its tiles print them, with each tile's own band word, so the sentence can
// never say a number or a word the tiles do not. Only readings outside their normal band are named, in the order of the circuit.
import { fmt } from './num.js';

// What each reading is called in running text (the tile's name is a label: "Portal pressure", "Shunted").
export const SPOKEN = {
  hvpg: 'HVPG', ppg: 'portal pressure gradient', pv: 'portal vein pressure', rpp: 'renal perfusion pressure',
  pvflow: 'portal flow', liver: 'sinusoidal flow', shunt: 'shunted blood', varix: 'varix wall stress', ascites: 'ascites', spleen: 'spleen length',
  map: 'blood pressure', hr: 'heart rate', co: 'cardiac output', ra: 'right atrial pressure', hb: 'hemoglobin',
};

/** One reading as the sentence writes it: "HVPG 15.7 mmHg (CSPH)". unit '%' sits against its number ("62% (Low)"), ux follows the unit ("70% of rupture"). */
export function phrase({ id, name, text, v, d = 1, u = '', ux = '', word = '' }) {
  const num = text ?? fmt(v, d);
  const unit = u === '%' ? `%${ux}` : u ? ` ${u}${ux}` : '';
  return `${name || SPOKEN[id] || id} ${num}${unit}${word ? ` (${word})` : ''}`;
}

/** The sentence: "<patient>: <reading>, <reading>." Nothing past a cut-off says so rather than copying an empty line. */
export function readoutsSentence(label, phrases) {
  const who = label || 'Patient';
  return phrases.length ? `${who}: ${phrases.join(', ')}.` : `${who}: no reading is past its cut-off.`;
}

/** The patient's name for a sentence or a history line: the preset's label, or Custom once the parameters have been moved. */
export const patientLabel = (st) => st.presetList?.find((x) => x.id === st.presetId)?.label || 'Custom';
