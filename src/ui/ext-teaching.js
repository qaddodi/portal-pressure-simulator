// Teaching cards, package H (25 Oct; review/deck-teaching-ideas/recommendations.md, section 4). What this package adds to slides,
// registered for slide-ext.js (see its header for each part's shape). A deck that sets none of its fields is unchanged.
//   tool: { kind: 'criteria', title?, rows, ticks? }   C2: a guideline's rule list in the data card, a live tick on rows read from the
//                                                     model (tool-criteria.js)
import { createCriteria } from './tool-criteria.js?v=c3e511e5bd';

export default {
  tools: {
    criteria: { make: () => createCriteria(), title: (t) => t?.title || 'Criteria', short: (t) => t?.title || 'Criteria' },
  },
};
