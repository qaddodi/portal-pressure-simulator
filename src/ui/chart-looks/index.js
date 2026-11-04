// Every chart's look entries in one map, and the base type size of each chart host (docs/chart-looks-in-code-plan.md §1, §2).
// One import line is added for each chart package (plot.js, talk.js, …), and its LOOKS spread below.
import { PLOT } from './plot.js';
import { TALK } from './talk.js';

/** key → entry. A key is <group>.<part>[.<sub>] (lowercase, dots). */
export const LOOKS = {
  ...PLOT,
  ...TALK,
};

/** host name → (ctx) → the host's base type size in px, what an `em` of that host means. A host missing here is 12. */
export const HOSTS = {
  talk: (c) => c.scale.sm ?? 12,   // app.css 6177 .pz-talk { font-size: var(--pz-sm, var(--pz-psm, 12px)) }; --pz-psm on a stacked card = its cap = scale.sm
};
