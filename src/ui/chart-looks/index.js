// Every chart's look entries in one map, and the base type size of each chart host (docs/chart-looks-in-code-plan.md §1, §2).
// One import line is added for each chart package (plot.js, talk.js, …), and its LOOKS spread below.
import { PLOT } from './plot.js';
import { TALK } from './talk.js';
import { CRIT } from './crit.js';
import { CARD } from './card.js';
import { INST } from './inst.js';
import { CAUSES } from './causes.js';
import { PLANE } from './plane.js';
import { FLUID } from './fluid.js';
import { LUMEN } from './lumen.js';

/** key → entry. A key is <group>.<part>[.<sub>] (lowercase, dots). */
export const LOOKS = {
  ...PLOT,
  ...TALK,
  ...CRIT,
  ...CARD,
  ...INST,
  ...CAUSES,
  ...PLANE,
  ...FLUID,
  ...LUMEN,
};

/** host name → (ctx) → the host's base type size in px, what an `em` of that host means. A host missing here is 12. */
export const HOSTS = {
  talk: (c) => c.scale.sm ?? 12,   // app.css 6177 .pz-talk { font-size: var(--pz-sm, var(--pz-psm, 12px)) }; --pz-psm on a stacked card = its cap = scale.sm
  crit: (c) => Math.max(12, c.scale.sm ?? 14),   // app.css 7533 .pz-crit { font-size: max(12px, var(--bs, 14px)) }; --bs is the card's --pz-sm (a stacked or low card: its --pz-psm, = scale.sm)
  causes: (c) => c.scale.sm ?? 12,   // app.css 7184 .pz-cbars { font-size: var(--pz-sm, var(--pz-psm, 12px)) }, the same rule
  plane: (c) => c.scale.cap ?? 12,   // app.css 7318 .pze-plot { font-size: var(--s-cap) }
  planecard: (c) => (c.in === 'cell' ? c.scale.chCap : c.scale.cap) ?? 12,   // 7320 .pze-plot.pze-incard { font-size: var(--ch-cap, var(--s-cap)) }; --ch-cap is set in a card's cell only (2266, 2628)
  fluid: (c) => Math.max(c.scale.fs12 ?? 12, 12 / ((c.fit || 1) * (c.dk || 1))),   // app.css 7466 .gf { font-size: var(--gs-fs) }; --gs-fs: max(var(--fs-12), 12px / (--pz-fit * --pz-dk)), --fs-12 = scale.fs12
};
