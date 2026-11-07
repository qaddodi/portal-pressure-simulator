// PSVD or NCPF diagnostic score. Baveno VIII Fig. 4 and 8.44 (checked on guidelines/baveno-viii-2026.pdf, 7 Nov 2026):
//   clinical signs of portal hypertension: specific +3, non-specific +2, none 0. Liver histology: major lesion +5, minor +2, normal 0.
//   Associated conditions +1 or 0. Concomitant cause of cirrhosis -1 or 0. Totals 0-2 no PSVD or NCPF, 3-4 possible (other investigations
//   such as biopsy or LSM, refer to an expert vascular liver centre, follow for new signs), 5 or more definite. The figure prints "0-1" and
//   "2" as two cells. The score only applies when cirrhosis is excluded on an adequate biopsy (the card's foot says only the figure: that
//   condition is in the notes).
// The patient is the slide's own answers: { sg, hi, ac, cc }, each the index of the option chosen in its row (0 = the first listed).
import { scoreKit } from './helpers.js';

const rows = [
  { k: 'sg', n: 'Clinical signs of portal hypertension', d: 'Specific: medium or large oesophageal varices, gastric varices, portosystemic collaterals, SSM >40 kPa without a myeloproliferative neoplasm. Non-specific: ascites, small varices, platelets <150, splenomegaly.', o: [['Specific', 3], ['Non-specific', 2], ['None', 0]] },
  { k: 'hi', n: 'Liver histology', d: 'Obliterative portal venopathy or other vascular lesions.', o: [['Major lesion', 5], ['Minor lesion', 2], ['Normal', 0]] },
  { k: 'ac', n: 'Associated conditions', d: 'Conditions linked to PSVD.', o: [['Present', 1], ['Absent', 0]] },
  { k: 'cc', n: 'Concomitant cause of cirrhosis', o: [['Present', -1], ['Absent', 0]] },
];
const zones = [[0, 2, 'No PSVD or NCPF', 'n'], [3, 4, 'Possible', 'warn'], [5, 99, 'Definite', 'bad']];
const verdict = (t) => (t >= 5
  ? { head: 'Definite PSVD or NCPF', tone: 'bad', z: 2, next: '' }
  : t >= 3
    ? { head: 'Possible PSVD or NCPF', tone: 'warn', z: 1, next: 'More investigations (biopsy, stiffness), refer to an expert vascular liver centre, and follow for new signs.' }
    : { head: 'Not PSVD or NCPF', tone: 'n', z: 0, next: '' });

const defaults = { sg: 1, hi: 1, ac: 1, cc: 1 };

export default {
  id: 'psvdscore',
  label: 'PSVD or NCPF diagnostic score',
  kind: 'score',
  source: 'Baveno VIII',
  cite: 'Fig. 4',
  ...scoreKit({ rows, verdict, zones, defaults, stmt: '8.44' }),
  presets: [['Ascites and a minor lesion', { sg: 1, hi: 1, ac: 1, cc: 1 }], ['Varices and a major lesion', { sg: 0, hi: 0, ac: 1, cc: 1 }], ['Splenomegaly only', { sg: 1, hi: 2, ac: 1, cc: 1 }]],
  worst: { sg: 1, hi: 1, ac: 1, cc: 1 },   // (the Possible band: it has the one reading that is more than a heading)
  notes: 'The PSVD or NCPF diagnostic score adds four rows (8.44, Fig. 4): clinical signs of portal hypertension (specific +3, non-specific +2, none 0), liver histology (a major lesion of obliterative portal venopathy or another vascular lesion +5, a minor lesion +2, normal 0), associated conditions (+1 or 0) and a concomitant cause of cirrhosis (-1 or 0). A total of 0 to 2 is not PSVD or NCPF, 3 to 4 is possible (further investigations such as biopsy or stiffness, referral to an expert vascular liver centre, and follow-up for new signs) and 5 or more is definite. The score applies only when cirrhosis has been excluded on an adequate biopsy.',
};
