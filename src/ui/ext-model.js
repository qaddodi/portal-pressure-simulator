// Deck visuals, package C. Model charts: V4, V5 (review/deck-visuals-recs.md §9).
// What this package adds to slides, registered for slide-ext.js (see its header for each part's shape). A deck that sets none
// of its fields is unchanged.
//
//   tool: { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] }   a setting across its range
//         against one or two readings, the case's ring on each line (tool-curve.js)
//   tool: { kind: 'course', reading: 'asc', from, event, wait, after, then }   one reading over the days after an event, on the rating's zones, a line per
//         treatment from the same day (tool-course.js)

import { lcFirst } from '../engine/lc-first.js';
import { createCurve, warmCurve, curveLines, lineMeta, axisMeta } from './tool-curve.js';
import { createCourse, warmCourse, courseOf } from './tool-course.js';

const lc = lcFirst;
// (A chart whose lines are different readings of one kind, the fundal and the esophageal varix, goes by the slide's `reading`.)
const names = (t) => (typeof t.reading === 'string' && t.reading ? [t.reading] : curveLines(t).map((k, j) => (j ? lc(lineMeta(k).name) : lineMeta(k).name)));

export default {
  tools: {
    curve: {
      make: (env) => createCurve(env),
      warm: (t, ctx) => warmCurve(t, ctx),
      title: (t) => `${names(t).join(' and ')} by ${lc(axisMeta(t).name)}`,
      short: (t) => `By ${lc(axisMeta(t).name)}`,
    },
    course: {
      make: () => createCourse(),
      warm: (t, ctx) => warmCourse(t, ctx),
      title: (t) => courseOf(t).words.title,
      short: (t) => courseOf(t).words.short,
    },
  },
};
