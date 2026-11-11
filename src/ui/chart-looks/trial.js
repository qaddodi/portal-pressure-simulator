// The trial card's looks (tool-trial.js, host 'trial'): the card's one type size is the host's (em(1)), the words differ by weight and
// colour only, so the card has one label style. An arm's bar takes the token its piece names (data-p-tone).
import { tok, mix, param, em } from './dsl.js';

const halo = { stroke: tok('surface'), width: 3, join: 'round' };
const word = (weight, fill) => ({ base: { weight, size: em(1), fill } });

export const TRIAL = {
  // A field's name at the left (Who, Counted, Followed, Effect): quiet
  'trial.k': word(500, tok('text-3')),
  // A field's words
  'trial.v': word(500, tok('text')),
  // An arm's name, and the people in it at the right
  'trial.arm': word(650, tok('text')),
  'trial.n': word(500, tok('text-2')),
  // The 0 to 100% track behind an arm's bar, and the bar itself in the arm's colour
  'trial.track': { base: { fill: mix('srgb', tok('text'), 9, 'transparent') } },
  'trial.bar': { base: { fill: mix('srgb', param('tone'), 72, 'transparent') } },
  // The arm's percent, on its bar (a halo in the card's colour) or just past its end
  'trial.pct': { base: { weight: 700, size: em(1), fill: tok('text'), halo } },
  // The effect size, set a step heavier than the other fields
  'trial.eff': word(650, tok('text')),
  // The source line at the foot, and the mark of a trial not yet read against its paper
  'trial.src': word(500, tok('text-3')),
  'trial.warn': word(600, tok('caution')),
};
