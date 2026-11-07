// Every chart's look entries in one map, and the base type size of each chart host (docs/chart-looks-in-code-plan.md §1, §2).
// One import line is added for each chart package (plot.js, talk.js, …), and its LOOKS spread below.
import { PLOT } from './plot.js';
import { TALK } from './talk.js';
import { CRIT } from './crit.js';
import { CARD } from './card.js';
import { INST } from './inst.js';
import { SMALL } from './small.js';
import { CAUSES } from './causes.js';
import { PLANE } from './plane.js';
import { FLUID } from './fluid.js';
import { LUMEN } from './lumen.js';
import { TIME } from './time.js';
import { PROFILE } from './profile.js';
import { FLOWS } from './flows.js';
import { PATH } from './path.js';

/** key → entry. A key is <group>.<part>[.<sub>] (lowercase, dots). */
export const LOOKS = {
  ...PLOT,
  ...TALK,
  ...CRIT,
  ...CARD,
  ...INST,
  ...SMALL,
  ...CAUSES,
  ...PLANE,
  ...FLUID,
  ...LUMEN,
  ...TIME,
  ...PROFILE,
  ...FLOWS,
  ...PATH,
};

/** host name → (ctx) → the host's base type size in px, what an `em` of that host means. A host missing here is 12. */
export const HOSTS = {
  flowtime: (c) => c.scale.sm ?? 12,   // (a fitted chart: chart-ctx.js fittedType hands over the size it is drawn in, px, which wins; this is the card's small size it grows from)
  curve: (c) => c.scale.sm ?? 12,   // (the curve and the course)
  talk: (c) => c.scale.sm ?? 12,   // app.css 6177 .pz-talk { font-size: var(--pz-sm, var(--pz-psm, 12px)) }; --pz-psm on a stacked card = its cap = scale.sm
  crit: (c) => Math.max(12, c.scale.sm ?? 14),   // app.css 7533 .pz-crit { font-size: max(12px, var(--bs, 14px)) }; --bs is the card's --pz-sm (a stacked or low card: its --pz-psm, = scale.sm)
  causes: (c) => c.scale.sm ?? 12,   // app.css 7184 .pz-cbars { font-size: var(--pz-sm, var(--pz-psm, 12px)) }, the same rule
  plane: (c) => c.scale.cap ?? 12,   // app.css 7318 .pze-plot { font-size: var(--s-cap) }
  planecard: (c) => (c.in === 'cell' ? c.scale.chCap : c.scale.cap) ?? 12,   // 7320 .pze-plot.pze-incard { font-size: var(--ch-cap, var(--s-cap)) }; --ch-cap is set in a card's cell only (2266, 2628)
  fluid: (c) => Math.max(c.scale.fs12 ?? 12, 12),   // app.css .gf { font-size: var(--gs-fs) }; --gs-fs: var(--fs-12) = scale.fs12 (the strip is not zoomed by the card)
  // app.css 7096 .pz-tool .pz-inst:is(.pz-prof, .pz-flows) { font-size: var(--pz-sm, var(--pz-psm, 12px)) }; in a ladder's cell 2252 .pz-cc > .pz-prof { font-size: calc(var(--lad-f) * var(--lad-s)) }, --lad-f = --ch-cap
  prof: (c) => (c.in === 'cell' ? (c.scale.chCap ?? 12) * c.lad : c.scale.sm ?? 12),
  flows: (c) => c.scale.sm ?? 12,
  // the phone grid's strips: 2255 (a case's own strip: the card's label size), 2258 (the names strip over the six: its cap size)
  pstrip: (c) => c.scale.lab ?? 12,
  pstriph: (c) => c.scale.cap ?? 12,
  path: () => 12,   // (the guideline path card's small map: its words are 12 px, styles/path.css)
};
