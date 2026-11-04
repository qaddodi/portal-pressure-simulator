// The deck's own diagrams (docs/chart-looks-in-code-plan.md WP11a): presenter.js's still column (hosts 'col'), the SAAG map ('quad') and the
// two walls ('walls'). Written by hand from app.css's .pz-col .c-*, .pzq-* and .pzw-* model rules in cascade order (the old line numbers
// beside each entry), those rules deleted in the same change. The cards' page elements (.pzt-*, .pz-quads li, .pzw-t/-s/-c/-c2, the panels)
// are HTML and keep their rules. A word's size is its font-size attribute (presenter's fsOf), so no entry sets one. Pieces with no look of
// their own (the root, groups, clip paths) are named here too, empty, so the picture asks the page nothing about them.
import { tok, mix, own, ease } from './dsl.js';

const NONE = { base: {} };
const REDUCE = [{ motion: 'reduce' }, { ease: { opacity: null, transform: null } }];   // 2159 .pz-col * { transition: none !important }
// A part of the column that comes in once the card is in (the class `in` on the model's root): a strength 0 until then, after its delay.
const COMES = (base, delay) => ({ state: { on: 'class:in' }, base: { ...base, opacity: 0, ease: { opacity: ease('surface', undefined, delay) } }, when: [[{ on: true }, { opacity: 1 }], REDUCE] });
const WEDGE76 = mix('srgb', tok('tr-wedge'), 76, tok('surface'));
const HV46 = mix('srgb', tok('tr-hv'), 46, tok('surface'));
// 2392 --pzq-1..4 (the tints of the SAAG map's quadrants; the page keeps the same four for the numbered rows beside it)
const QUAD = [mix('srgb', tok('ok'), 15, tok('surface')), mix('srgb', tok('ramp-violet'), 16, tok('surface')), mix('srgb', tok('tr-hv'), 15, tok('surface')), mix('srgb', tok('ramp-wine'), 17, tok('surface'))];
// 3085-3091 [data-site] --site: a site's colour, on the point's group
const SITE = [
  [{ site: 'pre' }, tok('tour-portal')],
  [{ site: 'presin' }, mix('srgb', tok('tour-portal'), 80, tok('tour-sys'))],
  [{ site: 'sin' }, mix('srgb', tok('tour-portal'), 60, tok('tour-sys'))],
  [{ site: 'postsin' }, mix('srgb', tok('tour-portal'), 40, tok('tour-sys'))],
  [{ site: 'post' }, mix('srgb', tok('tour-portal'), 20, tok('tour-sys'))],
  [{ site: 'cardiac' }, tok('tour-sys')],
];
// 2401 transition-delay: calc(var(--i, 0) * 180ms + 300ms): the points come in one after the other (a card has a dozen at most; 32 rows)
const STEP = Array.from({ length: 32 }, (_, i) => [{ i: String(i) }, { ease: { opacity: ease('surface', undefined, 300 + 180 * i), transform: ease('surface', undefined, 300 + 180 * i) } }]);

export const CARD = {
  // ── the still column (2138-2158) ──
  'card.root': NONE,
  'card.g': NONE,
  // 2139 .pz-col text: the names, 600 in the quiet ink, .02em apart
  'card.col.text': { base: { weight: 600, fill: tok('text-3'), letterSpacing: own(0.02) } },
  // 2140 .c-top: the heading over the column, in the wedge colour, in after 1.9 s
  'card.col.top': COMES({ weight: 600, fill: tok('tr-wedge'), letterSpacing: own(0.02) }, 1900),
  // 2141 .c-pv: the portal vein's lumen
  'card.col.pv': { base: { fill: mix('srgb', tok('tr-pv'), 60, tok('surface')) } },
  // 2142 .c-flow: the moving blood beyond the narrowing
  'card.col.flow': { base: { fill: HV46 } },
  // 2143 .c-lane: a sinusoid
  'card.col.lane': { base: { fill: 'none', stroke: HV46, width: 4, cap: 'round' } },
  // 2143-2144 .c-lane.c-link-b: the link between two of them
  'card.col.link.b': { base: { fill: 'none', stroke: HV46, width: 2.6, cap: 'butt' } },
  // 2145 .c-edge: the vessel's outline
  'card.col.edge': { base: { fill: 'none', stroke: mix('srgb', tok('text'), 30, 'transparent'), width: 1, join: 'round' } },
  // 2147, 2157 .c-fill: the wedge-coloured lumen slides in from its right end (its transform, 1.6 s, after .5 s)
  'card.col.fill': { base: { fill: WEDGE76, ease: { transform: ease(1600, undefined, 500) } }, when: [REDUCE] },
  // 2148, 2157 .c-lane-f: the lane, filled in the wedge colour, fades in after .5 s
  'card.col.lane.f': { state: { on: 'class:in' }, base: { fill: 'none', stroke: WEDGE76, width: 4, cap: 'round', dash: [], dashOffset: 0, opacity: 0, ease: { opacity: ease('surface', undefined, 500) } }, when: [[{ on: true }, { opacity: 1 }], REDUCE] },
  // 2149, 2157 .c-lane-f.c-link: the link, after 1.1 s
  'card.col.link.f': { state: { on: 'class:in' }, base: { fill: 'none', stroke: WEDGE76, width: 2.6, cap: 'butt', dash: [], dashOffset: 0, opacity: 0, ease: { opacity: ease('surface', undefined, 1100) } }, when: [[{ on: true }, { opacity: 1 }], REDUCE] },
  // 2150 .c-bal: the balloon
  'card.col.bal': { base: { fill: mix('srgb', tok('caution'), 30, tok('surface')), stroke: mix('srgb', tok('caution'), 90, 'transparent'), width: 1.5 } },
  // 2151 .c-cath: the catheter
  'card.col.cath': { base: { fill: 'none', stroke: mix('srgb', tok('text'), 62, 'transparent'), width: 2.6, cap: 'round' } },
  // 2152 .c-tip: its tip
  'card.col.tip': { base: { fill: mix('srgb', tok('text'), 80, 'transparent') } },
  // 2153 .c-brk: the bracket under the column, in after 1.9 s
  'card.col.brk': COMES({ fill: 'none', stroke: tok('tr-wedge'), width: 1.8, cap: 'round', join: 'round' }, 1900),
  // 2154 .c-blk: the narrowing's red strokes, in after 1.8 s
  'card.col.blk': COMES({ fill: 'none', stroke: tok('danger'), width: 3, cap: 'round' }, 1800),
  // 2155 .c-lead: the red leader line
  'card.col.lead': COMES({ fill: 'none', stroke: tok('danger'), width: 1.4, cap: 'round' }, 1800),
  // 2156, 2139 .c-blkt: the red words
  'card.col.blkt': COMES({ weight: 600, fill: tok('danger'), letterSpacing: own(0.02) }, 1800),

  // ── the SAAG map (2392-2404) ──
  // 2393-2394 .pzq-q rect: a quadrant's tint
  'card.quad.rect': { state: { q: 'data-q' }, base: { fill: tok('surface-2') }, when: [[{ q: '1' }, { fill: QUAD[0] }], [{ q: '2' }, { fill: QUAD[1] }], [{ q: '3' }, { fill: QUAD[2] }], [{ q: '4' }, { fill: QUAD[3] }]] },
  // 2395 .pzq-n: a quadrant's number
  'card.quad.n': { base: { weight: 700, fill: tok('text-3') } },
  // 2396 .pzq-cut: the two cut-offs
  'card.quad.cut': { base: { stroke: tok('text-2'), width: 3, dash: [10, 8] } },
  // 2397 .pzq-axis
  'card.quad.axis': { base: { stroke: tok('border-strong'), width: 2 } },
  // 2398-2399 .pzq-t, .pzq-t.on: a tick's number; the cut-off's is bolder and darker
  'card.quad.t': { state: { on: 'class:on' }, base: { weight: 500, fill: tok('text-3') }, when: [[{ on: true }, { weight: 700, fill: tok('text') }]] },
  // 2400 .pzq-ax: an axis name
  'card.quad.ax': { base: { weight: 600, fill: tok('text-2') } },
  // 2401-2402 .pzq-pt: a patient's point comes in (a strength and a rise) one after the other
  'card.quad.pt': { state: { on: 'class:in', i: 'data-i' }, base: { opacity: 0, ease: { opacity: ease('surface', undefined, 300), transform: ease('surface', undefined, 300) } }, when: [[{ on: true }, { opacity: 1 }], ...STEP, REDUCE] },
  // 2403 .pzq-pt circle: filled in its site's colour (the group's data-site), ringed in the card's tone
  'card.quad.dot': { state: { site: 'data-site' }, base: { fill: tok('text-3'), stroke: tok('surface'), width: 5 }, when: SITE.map(([c, fill]) => [c, { fill }]) },
  // 2404 .pzq-pt text: a patient's name
  'card.quad.name': { base: { weight: 700, fill: tok('text') } },

  // ── the two walls (2419-2431) ──
  // 2419 .pzw-l: a band's name
  'card.walls.l': { base: { weight: 600, fill: tok('text-3') } },
  // 2422 .pzw-lumen
  'card.walls.lumen': { base: { fill: mix('srgb', tok('tour-portal'), 26, tok('surface')) } },
  // 2423 .pzw-wall
  'card.walls.wall': { base: { fill: mix('srgb', tok('tour-portal'), 62, tok('text')) } },
  // 2424 .pzw-bm: the basement membrane
  'card.walls.bm': { base: { fill: tok('text'), opacity: 0.75 } },
  // 2425 .pzw-tissue
  'card.walls.tissue': { base: { fill: tok('surface-2') } },
  // 2426 .pzw-hep: the liver cells
  'card.walls.hep': { base: { fill: mix('srgb', tok('pz-hepatocyte'), 34, tok('surface')) } },
  // 2427 .pzw-disse
  'card.walls.disse': { base: { fill: mix('srgb', tok('ok'), 18, tok('surface')) } },
  // 2428 .pzw-alb (--pz-albumin is --albumin)
  'card.walls.alb': { base: { fill: tok('albumin') } },
  // 2428, 2433 .pzw-alb.pzw-cross: albumin rising through a pore; its strength is the scene's loop (presenter's noteLoop), nothing until it starts
  'card.walls.cross': { base: { fill: tok('albumin'), opacity: 0 } },
  // 2429-2430 .pzw-flow(.big): the flow up through the wall
  'card.walls.flow': { state: { big: 'class:big' }, base: { fill: 'none', stroke: tok('tour-sys'), width: 4, cap: 'round' }, when: [[{ big: true }, { width: 7 }]] },
  // 2431 .pzw-head: its arrow head
  'card.walls.head': { base: { fill: tok('tour-sys') } },
};
