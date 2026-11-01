// The History line for a change that was put away: what was on, said as what is off. The label of an active change ("TIPS 8 mm",
// "Splanchnic tone ×0.80") gets its number and unit cut, and a plain first word is lowered after "No", an acronym is not
// ("No TIPS", "No carvedilol"; the lowercasing alone made "No tips", "No rv contractility", "No splanchnic tone ×0.80").
// Pure text, so a test can read it with no DOM.

const lowerFirst = (s) => s.replace(/^\S+/, (w) => (/^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w));
const bare = (label) => label.replace(/ [×\d].*$/, '');

/** key: the active change's key (activeInterventions), label: its label. */
export function removedLabel(key, label) {
  const k = String(key), l = String(label);
  if (k.startsWith('sten:')) return `${l.replace(/ narrowed \d+%$/, '')} no longer narrowed`;
  if (k.startsWith('thr:')) return `${l.replace(/ thrombus \d+%$/, '')} thrombus cleared`;
  if (k === 'occ:C5') return 'Gastrorenal shunt open again';
  if (k.startsWith('occ:')) return `${l.replace(/ occluded$/, '')} open again`;
  if (k === 'C5') return 'Gastrorenal shunt present again';
  if (k === 'meal') return 'Back to fasting';
  if (k === 'albumin') return 'Albumin back to 4.0 g/dL';
  if (k === 'splTone' || k === 'sysTone' || k === 'habr' || k === 'contractility') return `${bare(l)} back to normal`;
  return `No ${lowerFirst(bare(l))}`;
}
