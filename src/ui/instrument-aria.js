// What a screen reader is told of an instrument that is a picture (A11-1): its canvas names the values it shows, not only what it is. Pure (no page): each
// instrument hands it the numbers it draws, written to the label between frames (class-soon.js attrSoon), so the label is always the picture's.
import { fmt } from './num.js';

/** The pressure profile: "Pressure profile, gut to heart: portal vein 18, hepatic vein 6, IVC 4 millimeters of mercury." items: [{ name, v }]; withheld: a slide hides the portal pressures. */
export function profileLabel(items, withheld = false) {
  if (withheld || !items.length) return 'Pressure profile along the selected path (the pressures are withheld)';
  return `Pressure profile, gut to heart: ${items.map(({ name, v }) => `${name} ${fmt(v, 0)}`).join(', ')} millimeters of mercury`;
}

/** The FibroScan panel: "Simulated FibroScan, liver: 21.4 kilopascals, borderline." word: the tile's own band word (table-marks RATE), or '' for none. */
export function fibroscanLabel(organ, v, word = '') {
  if (!Number.isFinite(v)) return `Simulated FibroScan, ${organ}: no reading`;
  return `Simulated FibroScan, ${organ}: ${fmt(v, 1)} kilopascals${word ? `, ${/^[A-Z][a-z]/.test(word) ? word[0].toLowerCase() + word.slice(1) : word}` : ''}`;
}

/** The endoscopic view: "Endoscopic view: large varices, 6.2 millimeters, red wale marks, 2 bands placed." diam: the size as the card prints it ("6.2 mm"). */
export function endoscopyLabel({ present, grade, diam, red, bands }) {
  if (!present) return 'Endoscopic view: no varices';
  const nb = Math.max(0, Math.round(bands || 0));
  return `Endoscopic view: ${String(grade).toLowerCase()} varices, ${String(diam).replace(/ mm$/, ' millimeters')}, ${red ? 'red wale marks' : 'no red wale marks'}, ${nb ? `${nb} ${nb === 1 ? 'band' : 'bands'} placed` : 'no bands placed'}`;
}
