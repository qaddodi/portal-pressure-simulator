// Deck visuals, package C. Model charts: V4, V5 (review/deck-visuals-recs.md §9).
// What this package adds to slides, registered for slide-ext.js (see its header for each part's shape). A deck that sets none
// of its fields is unchanged.
//
//   tool: { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] }   a setting across its range
//         against one or two readings, the case's ring on each line (tool-curve.js)
//   tool: { kind: 'causes', metric: 'ppg' }   what raises the reading from healthy, a waterfall with a step per cause (tool-causes.js)
//   tool: { kind: 'course', reading: 'asc', from, event, wait, after, then }   one reading over the days after an event, on the rating's zones, a line per
//         treatment from the same day (tool-course.js)

import { createCurve, warmCurve, curveLines, lineMeta, axisMeta } from './tool-curve.js?v=d02fd985d6';
import { createCauses, metricOf } from './tool-causes.js?v=d5a34bf5cd';
import { createCourse, warmCourse, courseOf } from './tool-course.js?v=a6a6674004';
import { TILE } from './table-marks.js?v=bca5ebb624';

const lc = (s) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
// (A chart whose lines are different readings of one kind, the fundal and the esophageal varix, goes by the slide's `reading`.)
const names = (t) => (typeof t.reading === 'string' && t.reading ? [t.reading] : curveLines(t).map((k, j) => (j ? lc(lineMeta(k).name) : lineMeta(k).name)));
const causeName = (t) => ({ ppg: 'the PPG', hvpg: 'the HVPG', pv: 'the portal pressure' })[metricOf(t)] || lc(TILE[metricOf(t)]?.t || '');

export default {
  tools: {
    curve: {
      make: (env) => createCurve(env),
      warm: (t, ctx) => warmCurve(t, ctx),
      title: (t) => `${names(t).join(' and ')} by ${lc(axisMeta(t).name)}`,
      short: (t) => `By ${lc(axisMeta(t).name)}`,
    },
    causes: {
      make: (env) => createCauses(env),
      title: (t) => `What raises ${causeName(t)}`,
      short: () => 'What raises it',
    },
    course: {
      make: () => createCourse(),
      warm: (t, ctx) => warmCourse(t, ctx),
      title: (t) => courseOf(t).words.title,
      short: (t) => courseOf(t).words.short,
    },
  },
  // (The causes are the slide's own Why? contributions, worked out with its step on the presenter's worker.)
  steps: [(s) => (s?.tool?.kind === 'causes' ? { explain: metricOf(s.tool) } : null)],
};
