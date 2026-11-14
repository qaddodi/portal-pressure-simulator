// The forest plot's looks (trial-forest.js, host 'forest'): one type size (the host's, em(1)) and a step under it for the quieter words, told
// apart by weight and colour. A trial that fits the patient is in full ink, the others in the muted tone (the .dim keys). No glow, no box round
// a reading: the row picked has a faint wash behind it, as a picked tab has.
import { tok, mix, param, em } from './dsl.js';

const word = (weight, fill, size = 1) => ({ base: { weight, size: em(size), fill } });
const ink = tok('text'), quiet = tok('text-3');
const halo = { stroke: tok('surface'), width: 3, join: 'round' };
const muted = mix('srgb', tok('text'), 42, 'transparent');

export const FOREST = {
  // A group's name (Hazard ratio (HR), Odds ratio (OR), Relative risk (RR))
  'forest.grp': word(600, quiet, 0.92),
  // A trial's short name, in full ink when it fits the patient, quieter when not; what its ratio counts, after it
  'forest.nm': word(600, ink),
  'forest.nm.dim': word(500, quiet),
  'forest.of': word(500, quiet, 0.92),
  // The ratio and its interval, with its kind ("HR 0.51 (0.26–0.97)"), at the right
  'forest.val': word(500, tok('text-2'), 0.92),
  'forest.val.dim': word(500, quiet, 0.92),
  // The interval's line and the estimate's square
  'forest.ci': { base: { fill: 'none', stroke: ink, width: 2, cap: 'round' } },
  'forest.ci.dim': { base: { fill: 'none', stroke: muted, width: 2, cap: 'round' } },
  'forest.mk': { base: { fill: ink } },
  'forest.mk.dim': { base: { fill: muted } },
  // The line at 1 (no difference), the axis and its ticks, and the hairlines between the parts
  'forest.ref': { base: { fill: 'none', stroke: mix('srgb', tok('text'), 38, 'transparent'), width: 1 } },
  'forest.axis': { base: { fill: 'none', stroke: mix('srgb', tok('border-strong'), 80, 'transparent'), width: 1 } },
  'forest.rule': { base: { fill: 'none', stroke: tok('hairline'), width: 1 } },
  'forest.tick': word(500, quiet, 0.92),
  'forest.ends': word(500, quiet, 0.92),
  // The row picked: a faint wash behind it
  'forest.sel': { base: { fill: mix('srgb', tok('text'), 7, 'transparent') } },
  // The picked trial's line (its two rates) and its detail
  'forest.dt': word(600, ink),
  'forest.dx': word(500, tok('text-2'), 0.92),
  // The name over the trials with no ratio
  'forest.k': word(500, quiet, 0.92),
  // The Trials tab's arm bars (trial-forest.js armsLayout, host 'trial'): an arm's name and its people at the right, the 0 to 100% track,
  // the bar in the arm's colour (data-p-tone) and its percent on the bar (a halo in the card's colour) or just past its end. Their own keys:
  // the deck card's trial.* looks are design A's, sized for its large numbers.
  'forest.arm': word(650, ink),
  'forest.armn': word(500, tok('text-2')),
  'forest.track': { base: { fill: mix('srgb', tok('text'), 9, 'transparent') } },
  'forest.bar': { base: { fill: mix('srgb', param('tone'), 72, 'transparent') } },
  'forest.pct': { base: { weight: 700, size: em(1), fill: ink, halo } },
};
