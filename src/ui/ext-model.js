// Deck visuals, package C. Model charts: V4, V5 (review/deck-visuals-recs.md §9).
// What this package adds to slides, registered for slide-ext.js (see its header for each part's shape). A deck that sets none
// of its fields is unchanged.
//
//   tool: { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] }   a setting across its range
//         against one or two readings, the case's ring on each line (tool-curve.js)
//   tool: { kind: 'causes', metric: 'ppg' }   what raises the reading from healthy, a bar per cause (tool-causes.js)

import { createCurve, curveLines, lineMeta, axisMeta } from './tool-curve.js?v=ecabdb96fc';
import { createCauses, metricOf } from './tool-causes.js?v=d2eb4b5ac6';
import { TILE } from './table-marks.js?v=810c0a1575';

const lc = (s) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const names = (t) => curveLines(t).map((k, j) => (j ? lc(lineMeta(k).name) : lineMeta(k).name));
const causeName = (t) => ({ ppg: 'the PPG', hvpg: 'the HVPG', pv: 'the portal pressure' })[metricOf(t)] || lc(TILE[metricOf(t)]?.t || '');

export default {
  tools: {
    curve: {
      make: (env) => createCurve(env),
      title: (t) => `${names(t).join(' and ')} by ${lc(axisMeta(t).name)}`,
      short: (t) => `By ${lc(axisMeta(t).name)}`,
    },
    causes: {
      make: (env) => createCauses(env),
      title: (t) => `What raises ${causeName(t)}`,
      short: () => 'What raises it',
    },
  },
  // (The causes are the slide's own Why? contributions, worked out with its step on the presenter's worker.)
  steps: [(s) => (s?.tool?.kind === 'causes' ? { explain: metricOf(s.tool) } : null)],
};
