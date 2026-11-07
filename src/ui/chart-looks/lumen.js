// The vessel cross-section's looks (docs/chart-looks-in-code-plan.md WP10): tool-lumen.js, host 'lumen'. Written by hand from app.css's .gl-*
// rules (7431-7439, now deleted). The vessel's colour (--gl-v) was set by data-vessel on the card: the builder now writes data-vessel on the
// picture's root, and a state reads it. The words' size is the builder's font-size attribute (12 on screen, held between 9 and 12 units: it
// follows the picture's width), so no size here, as the criteria card's.
import { tok, mix, px, ease } from './dsl.js';

// --gl-v by vessel: 7431 portal, 7432 systemic, 7433 artery
const V = { portal: tok('tour-portal'), systemic: tok('tour-sys'), artery: tok('artery') };
const byVessel = (f) => [['systemic', V.systemic], ['artery', V.artery]].map(([name, c]) => [{ vessel: name }, f(c)]);
const STATE = { vessel: 'data-vessel' };

const NUMBER = { fill: tok('gl-in-ink'), halo: { stroke: tok('gl-in-edge'), width: 1.9, join: 'round' } };

export const LUMEN = {
  // 7434 .gl-wall: the vessel's wall, its colour mixed toward the card and toward the text
  'lumen.wall': {
    state: STATE,
    base: { fill: mix('srgb', V.portal, 30, tok('surface')), stroke: mix('srgb', V.portal, 75, tok('text')), width: 1.5 },
    when: byVessel((c) => ({ fill: mix('srgb', c, 30, tok('surface')), stroke: mix('srgb', c, 75, tok('text')) })),
  },
  // 7435 .gl-clot (also the tissue narrowing a stent)
  'lumen.clot': { base: { fill: tok('thrombus'), stroke: tok('thrombus-edge'), width: 0.8, join: 'round' } },
  // 7436 .gl-open: the open lumen; its strength eases
  'lumen.open': { state: STATE, base: { fill: V.portal, ease: { opacity: ease('small') } }, when: byVessel((c) => ({ fill: c })) },
  // 7439 .gl-stent: a stent's ring, easing in and out as the slide stents the vein
  'lumen.stent': { base: { fill: 'none', stroke: tok('stent-metal'), width: 2.2, dash: [4.6, 2.2], ease: { opacity: ease('surface') } } },
  // 7437 .gl-in: the share filled, white with a dark outline so it reads over the open lumen and the clot alike
  'lumen.in': { base: { ...NUMBER, font: [650, px(22)], baseline: 'central' } },
  // 7437-7438 .gl-in.gl-word: the name and "occluded", lighter and with a thinner outline; the size is the builder's attribute
  'lumen.word': { base: { ...NUMBER, weight: 600, baseline: 'central', halo: { stroke: tok('gl-in-edge'), width: 1.3, join: 'round' } } },
};
