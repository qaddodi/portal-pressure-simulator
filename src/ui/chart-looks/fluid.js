// The fluid balance's looks (docs/chart-looks-in-code-plan.md WP10): tool-fluid.js, host 'fluid'. Written by hand from app.css's .gf-* and
// .gs-* rules (7448-7507, the model's rules now deleted), in cascade order. Three pictures use them: the flow picture (gf), the day strip's
// parts (gs) and the sinusoid-wall tug (gs). The card's own rows, swatches and track are page elements and keep their rules.
// The colours are the card's scoped variables written out (they were set on `.gf`, app.css 7445 and 7466-7471). The page keeps the five the
// swatches and the track read (--gs-lymph, --gs-carried, --gs-back, --gs-build, --gs-dash, --gs-slot): change one here, change it there.
import { tok, mix, px, em, ease } from './dsl.js';

// ── the card's colours (7445, 7467-7469) ──
const CARRIED = mix('srgb', tok('text'), 42, tok('surface'));        // --gf-carried, and --gs-pull
// --gs-lymph: the lymph green, 55 % of it in a dark look (7470-7471, the attribute and the system-dark copies)
const LYMPH = tok('sv-gl-lymph-hi'), LYMPH_DARK = mix('srgb', tok('sv-gl-lymph-hi'), 55, tok('surface'));
const lymph = { fill: LYMPH }, lymphDark = { fill: LYMPH_DARK };
const BACK = mix('srgb', tok('tour-sys'), 80, tok('surface'));       // --gs-back (--gf-back is the plain systemic vein)
const DASH = [3, 2.5];

const node = (fill, extra = {}) => ({ base: { fill, ...extra } });
const band = (fill) => ({ base: { fill, opacity: 0.55, ease: { opacity: ease('small') } } });   // 7450, with 7452-7454 for the fill

export const FLUID = {
  // ── the flow picture ──
  // 7448 .gf-t: a node's name and its number (13 px, central on its line); its tspans inherit it
  'fluid.flow.t': { base: { font: [500, px(13)], fill: tok('text-2'), baseline: 'central' } },
  'fluid.flow.span': { base: {} },
  // 7449 .gf-tv: the number in it
  'fluid.flow.tv': { base: { weight: 650, fill: tok('text') } },
  // 7450-7454 .gf-band, .gf-carried, .gf-back, .gf-build: a band as thick as its flow, in its fate's colour; its strength eases
  'fluid.band.carried': band(CARRIED),
  'fluid.band.back': band(tok('tour-sys')),
  'fluid.band.build': band(tok('ascites')),
  // 7451-7455 .gf-node.*: the two sources and the three fates
  'fluid.node.liver': node(tok('organ-liver')),
  'fluid.node.gut': node(tok('organ-gut')),
  'fluid.node.carried': node(CARRIED),
  'fluid.node.back': node(tok('tour-sys')),
  // (the build-up keeps the soft ascites colour, edged in it mixed toward the text colour so it reads at 3:1 or more)
  'fluid.node.build': node(tok('ascites'), { stroke: mix('srgb', tok('ascites'), 40, tok('text')), width: 1 }),
  // 7456 .gf-room: the room the lymphatics have left, a dashed outline
  'fluid.room': { base: { fill: 'none', stroke: CARRIED, width: 1.5, dash: DASH } },

  // ── the day strip (7466-7507) ──
  // 7491 .gs-seg and 7493-7494: a part of the strip, in its fate's colour
  'fluid.seg.car': { base: lymph, when: [[{ dark: true }, lymphDark]] },
  'fluid.seg.blue': { base: { fill: BACK } },
  'fluid.seg.shrink': { base: { fill: tok('ok') } },
  'fluid.seg.build': { base: { fill: tok('caution') } },
  'fluid.seg.push': { base: { fill: tok('tour-portal') } },
  'fluid.seg.pull': { base: { fill: CARRIED } },
  // 7492 .gs-ghost: the lymphatics' spare room as a dashed outline (--gs-dash: the lymph mixed toward the quiet text; its strength is its width)
  'fluid.seg.ghost': {
    base: { fill: 'none', stroke: mix('srgb', LYMPH, 40, tok('text-2')), width: 1.5, dash: DASH },
    when: [[{ dark: true }, { stroke: mix('srgb', LYMPH_DARK, 40, tok('text-2')) }]],
  },
  // 7496 .gs-brk: the Leaked bracket
  'fluid.brk': { base: { fill: 'none', stroke: mix('srgb', tok('text'), 45, 'transparent'), width: 1.5, join: 'miter' } },
  // 7497 .gs-in (the font is the strip's own, 1em of the card's text size): a word set inside a part
  'fluid.in': { base: { font: [600, em(1)], fill: tok('text'), baseline: 'central' } },
  // 7507 .gs-wall: the sinusoid wall the push and the pull meet at
  'fluid.wall': { base: { fill: 'none', stroke: mix('srgb', tok('text'), 60, 'transparent'), width: 1.5, dash: DASH } },
};
