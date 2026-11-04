// The small model drawings' looks (docs/chart-looks-in-code-plan.md WP11c): the timeline's jump-day count (timeline.js), and the lobule view's
// slide pointer and fallback leaders (lobule-zoom.js). Written by hand from app.css in cascade order (the old line numbers beside each entry),
// the rules that only these model pieces used deleted in the same change.
// Kept on the sheet, and named here: app.css 304-318 .leader, .leader.hl/.focus/.scan, .leader-dot (the Anatomy's and Circuit's label leaders are
// page elements that stage.js and label-gl write with the same classes); the .lz-call pill's own rules (HTML); callout.js's glass outline (its
// colour is the callout's own --c, which stage.js sets) and gl-words.js (it draws a page element's own words in that element's computed style).
import { tok, ease } from './dsl.js';

const SURF = { opacity: ease('surface') };
// A leader and its dot leave with their label (.ld-gone), fade with a slide's unlit terms (.lz-dim), and are not drawn at all while label-gl draws
// them (cap-lead on the layer's root: 1719, !important, last). The state names are classes on the piece, or on the layer's root.
const LEAD_STATE = { gone: 'class:ld-gone', dim: 'class:lz-dim', cap: 'class:cap-lead', scan: 'class:scan' };
const LEAVE = [[{ gone: true }, { opacity: 0 }], [{ dim: true }, { opacity: 0.35 }], [{ cap: true }, { opacity: 0, ease: { opacity: null } }]];   // 1721, 5445, 1719

export const SMALL = {
  'small.root': { base: {} },
  // 1425 .tl-day-gl: the jump's day count, drawn over the clock's words in the clock's colour (.tl-time: 1426, the text-2 ink in every bar)
  'small.day': { base: { fill: tok('text-2') } },
  // 1733-1736 .lz-call-l, .lz-call-r: a slide's pointer at the lesion (a line and a ring), in the call's kind; in and out with the call's `on`
  'small.call': {
    state: { on: 'class:on', kind: 'data-kind' },
    base: { fill: 'none', stroke: tok('danger'), width: 4, opacity: 0, ease: SURF },
    when: [[{ kind: 'treat' }, { stroke: tok('accent') }], [{ kind: 'note' }, { stroke: tok('text-2') }], [{ on: true }, { opacity: 1 }]],
  },
  // 304-306, 317 .leader, 1720, 5443 (the layer's eases), .lz-hid
  'small.lead.line': {
    state: { ...LEAD_STATE, hid: 'class:lz-hid', hl: 'class:hl', focus: 'class:focus' },
    base: { fill: 'none', stroke: tok('leader'), width: 1, ease: SURF },
    when: [
      [{ hl: true }, { stroke: tok('accent'), width: 1.4 }],
      [{ focus: true }, { stroke: tok('accent'), width: 1.5, dash: [3, 3] }],
      [{ scan: true }, { stroke: tok('fibroscan'), width: 1.5 }],
      [{ hid: true }, { opacity: 0, ease: { opacity: null } }],
      ...LEAVE,
    ],
  },
  // 307, 318 .leader-dot, 1721, 5443
  'small.lead.dot': {
    state: LEAD_STATE,
    base: { fill: tok('stage-bg'), stroke: tok('text-2'), width: 1.3, ease: SURF },
    when: [[{ scan: true }, { stroke: tok('fibroscan'), width: 1.6 }], ...LEAVE],
  },
};
