// The stiffness bar's looks (stiff-bar.js, host 'stiff'; review F5, 15 Nov 2026): Baveno VIII's rule of five under the FibroScan number. One type
// size (the host's, em(1)), a step under it for the ticks and the zone words, told apart by weight and colour. The zones take the status colours
// as tints over whatever the card is, so they read on every look; no line stands over the card's edge, and no glow.
import { tok, mix, em } from './dsl.js';

/** look → [weight, size in em of the host's size]: the bar's words, the one table the layout measures with (stiff-bar.js). */
export const TYPE = {
  'stiff.tk': [500, 0.92], 'stiff.zl': [600, 0.85], 'stiff.plt': [500, 1], 'stiff.v': [650, 1], 'stiff.note': [500, 0.92],
};
const word = (look, fill) => ({ base: { weight: TYPE[look][0], size: em(TYPE[look][1]), fill } });
const tint = (name, pct) => ({ base: { fill: mix('srgb', tok(name), pct, 'transparent') } });
const ink = (name) => mix('srgb', tok(name), 72, tok('text'));   // (a status colour as words: pulled toward the card's ink so it reads on a light look)

export const STIFF = {
  // The four zones of the bar (below 10, 10 to 15, 15 to 25, 25 and over): the status tints, stronger as the risk rises
  'stiff.z0': tint('ok', 24),
  'stiff.z1': tint('caution', 20),
  'stiff.z2': tint('caution', 36),
  'stiff.z3': tint('danger', 34),
  // A congested liver: the rules' zones do not apply, so the bar is one neutral tint
  'stiff.zn': tint('text-3', 18),
  // The five ticks' numbers, and each zone's words
  'stiff.tk': word('stiff.tk', tok('text-3')),
  'stiff.zl': word('stiff.zl', tok('text-2')),
  // The patient's mark: a small arrow over the bar and the bar's own stem through it
  'stiff.mk': { base: { fill: tok('text') } },
  // The platelet row: its words, and the verdict in the colour of what it says
  'stiff.plt': word('stiff.plt', tok('text-2')),
  'stiff.v.ok': { base: { weight: TYPE['stiff.v'][0], size: em(TYPE['stiff.v'][1]), fill: ink('ok') } },
  'stiff.v.mid': { base: { weight: TYPE['stiff.v'][0], size: em(TYPE['stiff.v'][1]), fill: ink('caution') } },
  'stiff.v.hi': { base: { weight: TYPE['stiff.v'][0], size: em(TYPE['stiff.v'][1]), fill: ink('danger') } },
  // The rule, once, under it all
  'stiff.note': word('stiff.note', tok('text-3')),
};
