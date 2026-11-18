// The trial card's looks (tool-trial.js, host 'trial'; design A, "the two numbers", Mohammad 14 Nov 2026): the card's base type size is the
// host's (em(1)), its title and its arms' numbers a few steps larger; the words differ by weight and colour, so the card has one label style.
// An arm's bar and its key take the token their piece names (data-p-tone). TYPE holds each word's weight and size in em, the one table the
// layout measures with (tool-trial.js), so what is measured is what is drawn.
import { tok, mix, param, em, own } from './dsl.js';

/** look → [weight, size in em of the host's size]: the trial card's words. */
export const TYPE = {
  'trial.name': [650, 1.25], 'trial.src': [500, 1], 'trial.v': [500, 1], 'trial.lab': [500, 1], 'trial.pct': [650, 2.5], 'trial.n': [500, 1],
  'trial.eff': [650, 1.08], 'trial.note': [500, 1], 'trial.warn': [600, 1], 'trialfit.t': [500, 1.08],
};
const word = (look, fill) => ({ base: { weight: TYPE[look][0], size: em(TYPE[look][1]), fill } });

export const TRIAL = {
  // The trial's name, and its source line under it (journal, year, first author, people randomized; a Kaplan–Meier note)
  'trial.name': word('trial.name', tok('text')),
  'trial.src': word('trial.src', tok('text-3')),
  // What was counted, and for how long
  'trial.v': word('trial.v', tok('text-2')),
  // An arm's name, its key (the colour of its bar), its share as a large number, and the people in it
  'trial.lab': word('trial.lab', tok('text')),
  'trial.key': { base: { fill: mix('srgb', param('tone'), 72, 'transparent') } },
  'trial.pct': { base: { weight: TYPE['trial.pct'][0], size: em(TYPE['trial.pct'][1]), fill: tok('text'), letterSpacing: own(-0.03) } },
  'trial.n': word('trial.n', tok('text-3')),
  // The 0 to 100% track behind an arm's bar, and the bar itself in the arm's colour
  'trial.track': { base: { fill: mix('srgb', tok('text'), 10, 'transparent') } },
  'trial.bar': { base: { fill: mix('srgb', param('tone'), 72, 'transparent') } },
  // The trial's own effect size, a step heavier; a caveat a learner should keep; the mark of a trial not yet read against its paper
  'trial.eff': word('trial.eff', tok('text')),
  'trial.note': word('trial.note', tok('text-2')),
  'trial.warn': word('trial.warn', tok('caution')),
  // The line on whether the slide's patient fits the trial (only on a slide: trial-fit.js): a filled accent disc with a tick when the patient
  // fits, an open ring with a cross or a dash when not or when the model cannot tell, and its words
  'trialfit.ring': { base: { fill: 'none', stroke: tok('text-3'), width: 1.5 } },
  'trialfit.x': { base: { fill: 'none', stroke: tok('text-3'), width: 2, cap: 'round', join: 'round' } },
  'trialfit.t': word('trialfit.t', tok('text')),
};
