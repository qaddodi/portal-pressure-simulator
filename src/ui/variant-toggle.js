// The variant toggle on a teaching card (the slide's `compare` buttons, presenter-question.js): what it changes, said in words above its buttons
// and to a screen reader. The buttons alone (None / Usual / Strong, Anatomy / Circuit) never said what they act on (play-test, 16 Nov 2026,
// Carvedilol slide 5). One table for every kind of toggle, so a new kind names itself in one place.
import { isResponse } from './nsbb-response.js';

/** { caption, aria } for a compare list: caption is the short clinical label shown above the buttons, aria the longer sentence a screen reader gets. */
export function toggleLabels(compare) {
  const has = (k) => compare.some((o) => o.params && k in o.params);
  if (has('stentGeom')) return { caption: 'Geometry', aria: 'Change the stent\'s geometry on the live model' };
  if (has('stenosisSite')) return { caption: 'Stenosis site', aria: 'Move the stent\'s stenosis on the live model' };
  if (compare.some((o) => o.lens)) return { caption: 'Color the vessels by', aria: 'Color the vessels by' };
  if (compare.some((o) => o.gate)) return { caption: 'Sample the stent at', aria: 'Sample the stent at' };
  if (compare.some((o) => o.tool)) return { caption: 'Instrument view', aria: 'Change the instrument\'s view' };
  if (has('fenestrae')) return { caption: 'Fenestrae', aria: 'Open or close the fenestrae on the live model' };
  if (isResponse(compare)) return { caption: 'Beta-blocker response', aria: 'Change how well the beta-blocker works on the live model' };
  return { caption: 'Treatment', aria: 'Switch treatment on the live model' };
}
