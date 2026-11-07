// Teaching cards, package H (25 Oct; review/deck-teaching-ideas/recommendations.md, section 4). What this package adds to slides,
// registered for slide-ext.js (see its header for each part's shape). A deck that sets none of its fields is unchanged.
//   tool: { kind: 'criteria', title?, rows, ticks? }   C2: a guideline's rule list in the data card, a live tick on rows read from the
//                                                     model (tool-criteria.js)
//   tool: { kind: 'path', of: an algorithm of path-data.js ALGOS, patient? }   a Baveno VIII flowchart with the patient's own path lit (tool-path.js)
import { createCriteria } from './tool-criteria.js';
import { createPath } from './tool-path.js';
import { PATHS, knownOf } from './path-data.js';
import { loadMetrics } from './text-gl.js';

export default {
  tools: {
    path: { make: () => createPath(), warm: () => loadMetrics(), title: (t) => t?.title || PATHS[knownOf(t?.of)].label, short: (t) => t?.short || PATHS[knownOf(t?.of)].short },
    criteria: { make: () => createCriteria(), title: (t) => t?.title || 'Criteria', short: (t) => t?.title || 'Criteria' },
  },
};
