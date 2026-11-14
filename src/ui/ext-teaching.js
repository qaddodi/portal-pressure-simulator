// Teaching cards, package H (25 Oct; review/deck-teaching-ideas/recommendations.md, section 4). What this package adds to slides,
// registered for slide-ext.js (see its header for each part's shape). A deck that sets none of its fields is unchanged.
//   tool: { kind: 'criteria', title?, rows, ticks? }   C2: a guideline's rule list in the data card, a live tick on rows read from the
//                                                     model (tool-criteria.js)
//   tool: { kind: 'trial', id }   a landmark trial: each arm's event rate as a large number over a bar, what was counted, follow-up, the trial's own
//                                 effect size, its source line and whether the slide's patient fits it (trials.js, guidelines/trials.md; tool-trial.js).
//                                 On a slide it stands under the teaching card's words, not in the data card (tool-trial.js trialBelow); the entry
//                                 here is its title and its warm
//   tool: { kind: 'forest', ids, highlight? }   the trials' ratios on one scale, one row a trial (trial-forest.js), in the data card
//   tool: { kind: 'path', of: an algorithm of path-data.js ALGOS, patient? }   a Baveno VIII flowchart with the patient's own path lit (tool-path.js)
//   tool: { kind: 'reading' }   the measurement tracing card: the slide's procedure (HVPG, EUS-PPG, PPG by IR, PPG through a TIPS) drawn as a monitor
//                                 tracing while it is taken, one reading at a time, then the gradient (tool-reading.js; the gradients talk)
import { createCriteria } from './tool-criteria.js';
import { createReading, readingTitle } from './tool-reading.js';
import { createPath } from './tool-path.js';
import { PATHS, knownOf } from './path-data.js';
import { createTrial } from './tool-trial.js';
import { createForest } from './trial-forest.js';
import { trialOf } from './trials.js';
import { loadMetrics } from './text-gl.js';

export default {
  tools: {
    path: { make: () => createPath(), warm: () => loadMetrics(), title: (t) => t?.title || PATHS[knownOf(t?.of)].label, short: (t) => t?.short || PATHS[knownOf(t?.of)].short },
    trial: { make: () => createTrial(), warm: () => loadMetrics(), title: (t) => trialOf(t?.id)?.name || 'Trial', short: (t) => trialOf(t?.id)?.name || 'Trial' },
    forest: { make: () => createForest({ host: 'forest' }), warm: () => loadMetrics(), title: (t) => t?.title || 'The trials on one scale', short: (t) => t?.short || 'Trials' },
    // (Its title is the one rule of every gradient card, monitor.js monitorTitle: "HVPG, catheter tracing" on the HVPG's slide, else "Pressure tracing". s: the slide.)
    reading: { make: () => createReading(), warm: () => loadMetrics(), title: (t, s) => t?.title || readingTitle(s?.procedure ?? t?.of), short: (t) => t?.short || 'Tracing' },
    criteria: { make: () => createCriteria(), title: (t) => t?.title || 'Criteria', short: (t) => t?.title || 'Criteria' },
  },
};
