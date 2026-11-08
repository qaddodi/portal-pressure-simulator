// The plane's looks (docs/chart-looks-in-code-plan.md WP9): visual-plane.js, hosts 'plane' (a summary's plot) and 'planecard' (the plot on a data
// card). Written by hand from app.css's .pze-* rules in cascade order (the old line numbers beside each entry), those rules deleted in the same
// change. The plot's own box, the key and the table's trace cells (.pze-plot, .pze-planewrap, .pze-key, .pze-ckey, .pze-wbox…) are page elements,
// not model pieces, and stay on the stylesheet; their --pze-* swatch colours are printed from theme-tokens.js.
//
// Two states come from the plot, not from the piece: `axes` (the scatter's plot, app.css 7343 .pze-plot.pze-axes { --surface: var(--surface-2) }:
// inside it every halo and fill that read the card's colour read the plot's own tone) is data-axes on the model's root; `cw` (a card's zone
// words, 7365) is the .pze-cwords group they sit in.
import { tok, mix, ease } from './dsl.js';

// Colours that never change with the look, all tokens (theme-tokens.js): the pressure ramp's violet and wine stops, and pure black.
const VIOLET = tok('ramp-violet'), WINE = tok('ramp-wine'), BLACK = tok('pze-black');

// One row for each zone tone: [tone, its colour, % of it in the fill on the card (light looks), % in a dark look (over black), % in its words' ink].
// The fill is `--pze-<tone>` and the words' ink `--pze-<tone>-ink` of app.css 7295-7311 (now printed from theme-tokens.js for the keys' swatches).
// In a dark look the ink is the text colour itself. The mixes below must read as those tokens do: tests/plane-looks.test.js pins them.
const TONES = [
  ['ok', tok('ok'), 28, 42, 55],
  ['mid', tok('caution'), 40, 55, 40],
  ['hi', tok('danger'), 30, 50, 55],
  ['ppg', tok('tr-hv'), 32, 45, 30],
  ['hvpg', VIOLET, 24, 55, 25],
  ['both', WINE, 26, 55, 35],
];
const NAMES = TONES.map((t) => t[0]);
const fillL = (c, p, surface = tok('surface')) => mix('srgb', c, p, surface);
const fillD = (c, p) => mix('srgb', c, p, BLACK);
const inkL = (c, p) => mix('srgb', c, p, tok('text'));

// 7327-7332 .pze-zone: the zone's tint (data-tone); no tone is the plot's quiet panel colour
const zone = {
  state: { tone: 'data-tone', axes: 'data-axes' },
  base: { fill: tok('surface-2') },
  when: [
    ...TONES.map(([t, c, l]) => [{ tone: t }, { fill: fillL(c, l) }]),
    ...TONES.map(([t, c, l]) => [{ tone: t, axes: true }, { fill: fillL(c, l, tok('surface-2')) }]),   // (--pze-* read the plot's own --surface)
    ...TONES.map(([t, c, , d]) => [{ tone: t, dark: true }, { fill: fillD(c, d) }]),
  ],
};

// 7334-7337, 7365, 7372-7377 .pze-zt: a zone's words (data-tone), in the tone's ink; words of a box (pze-bxw) quiet; words that must sit across a
// line (pze-onl) have a halo of the zone's own fill so the line hides behind them
const zt = {
  state: { tone: 'data-tone', onl: 'class:pze-onl', bxw: 'class:pze-bxw', cw: 'class:pze-cwords', axes: 'data-axes' },
  base: { weight: 700, fill: tok('text-2') },
  when: [
    ...TONES.map(([t, c, , , i]) => [{ tone: t }, { fill: inkL(c, i) }]),
    [{ tone: NAMES, dark: true }, { fill: tok('text') }],
    [{ bxw: true }, { weight: 600, fill: tok('text-2') }],
    ...TONES.map(([t, c, l]) => [{ onl: true, tone: t }, { halo: { stroke: fillL(c, l), width: 6, join: 'round' } }]),
    ...TONES.map(([t, c, l]) => [{ onl: true, tone: t, axes: true }, { halo: { stroke: fillL(c, l, tok('surface-2')), width: 6, join: 'round' } }]),
    ...TONES.map(([t, c, , d]) => [{ onl: true, tone: t, dark: true }, { halo: { stroke: fillD(c, d), width: 6, join: 'round' } }]),
    [{ cw: true }, { ease: { opacity: ease('flip') } }],   // 7365 .pze-cwords .pze-zt
  ],
};

// A halo in the card's colour: what the plot's own tone replaces in a scatter (axes)
const HALO = (w) => ({ halo: { stroke: tok('surface'), width: w, join: 'round' } });
const HALO_AXES = (w) => [{ axes: true }, { halo: { stroke: tok('surface-2'), width: w, join: 'round' } }];   // (the row that swaps the halo's colour in a scatter)
// The patient's site colour (data-site on the point's group; 3085-3091 [data-site] { --site }): the tour's portal and systemic ends, mixed
const SITE = [
  [{ site: 'pre' }, tok('tour-portal')],
  [{ site: 'presin' }, mix('srgb', tok('tour-portal'), 80, tok('tour-sys'))],
  [{ site: 'sin' }, mix('srgb', tok('tour-portal'), 60, tok('tour-sys'))],
  [{ site: 'postsin' }, mix('srgb', tok('tour-portal'), 40, tok('tour-sys'))],
  [{ site: 'post' }, mix('srgb', tok('tour-portal'), 20, tok('tour-sys'))],
  [{ site: 'cardiac' }, tok('tour-sys')],
];
// A property that takes the site's colour (default text-2, as `var(--site, var(--text-2))`; `[data-site="none"]` takes text-3)
const siteRows = (prop) => [[{ site: 'none' }, { [prop]: tok('text-3') }], ...SITE.map(([c, v]) => [c, { [prop]: v }])];

export const PLANE = {
  'plane.zone': zone,
  // 7333 .pze-box: a deck's own box, a dashed outline
  'plane.box': { base: { fill: 'none', stroke: tok('text-2'), width: 1.5, dash: [6, 5] } },
  'plane.zt': zt,
  // 7338 .pze-cut: a cut-off line
  'plane.cut': { base: { stroke: tok('text-3'), width: 1, dash: [3, 4] } },
  // 7339, 7346 .pze-diag (.pze-axes .pze-diag a step stronger): where the two readings are equal
  'plane.diag': { state: { axes: 'data-axes' }, base: { stroke: tok('text-3'), width: 1.5, dash: [3, 4] }, when: [[{ axes: true }, { stroke: tok('text-2') }]] },
  // lines of equal resistance (iso, visual-plane.js): a quiet ray from the origin, its name in the diagonal's ink
  'plane.iso': { base: { stroke: tok('text-3'), width: 1.25, opacity: 0.6 } },
  'plane.isot': { state: { axes: 'data-axes' }, base: { weight: 600, fill: tok('text-3') }, when: [[{ axes: true }, { halo: { stroke: tok('surface-2'), width: 4, join: 'round' } }]] },
  // 7344 .pze-grid, 7345 .pze-axis: a scatter's hairlines and its two axis lines
  'plane.grid': { base: { stroke: mix('srgb', tok('border-strong'), 70, 'transparent'), width: 1 } },
  'plane.axis': { base: { stroke: tok('text-3'), width: 1.5 } },
  // 7347, 7349 .pze-dt: the diagonal's name (in a scatter the grid breaks behind it)
  'plane.dt': { state: { axes: 'data-axes' }, base: { weight: 600, fill: tok('text-2') }, when: [[{ axes: true }, { halo: { stroke: tok('surface-2'), width: 4, join: 'round' } }]] },
  // 7350 .pze-ln: a cut-off line's own name
  'plane.ln': { base: { weight: 600, fill: tok('text') } },
  // 7352-7353 .pze-t, .pze-t.on: a number on the plot; a cut-off's number full
  'plane.t': { state: { on: 'class:on' }, base: { fill: tok('text-2'), weight: 600 }, when: [[{ on: true }, { fill: tok('text'), weight: 700 }]] },
  // 7354 .pze-ax: an axis's name
  'plane.ax': { base: { fill: tok('text-2'), weight: 500 } },
  // 7357 .pze-pt circle: a patient's point, filled in the site's colour, a ring of the card's colour round it
  'plane.pt.dot': {
    state: { site: 'data-site', axes: 'data-axes' },
    base: { fill: tok('text-2'), stroke: tok('surface'), width: 3 },
    when: [...siteRows('fill'), [{ axes: true }, { stroke: tok('surface-2') }]],
  },
  // 7358 .pze-pt text: the patient's name, a halo of the card's colour
  'plane.pt.name': {
    state: { axes: 'data-axes' },
    base: { weight: 600, fill: tok('text'), ...HALO(3) },
    when: [HALO_AXES(3)],
  },
  // 7359 .pze-lead: the line from a point to its name
  'plane.lead': { base: { stroke: tok('text-2'), width: 1, opacity: 0.7 } },
  // 7360 .pze-path: from where the patient started
  'plane.path': { state: { site: 'data-site' }, base: { stroke: tok('text-2'), width: 1.5, opacity: 0.5 }, when: siteRows('stroke') },
  // 7361 .pze-pt .pze-was: where he started, a hollow ring in the site's colour
  'plane.was': {
    state: { site: 'data-site', axes: 'data-axes' },
    base: { fill: tok('surface'), stroke: tok('text-2'), width: 2 },
    when: [...siteRows('stroke'), [{ axes: true }, { fill: tok('surface-2') }]],
  },
  // 7362 .pze-ring: the case's dot glides and fades on the surface ease
  'plane.ring': { base: { ease: { opacity: ease('surface'), transform: ease('surface') } } },
  // 7363 .pze-ring .pze-halo: the clear gap round the dot, in the card's own colour; 7364 .pze-dot
  'plane.halo': { state: { axes: 'data-axes' }, base: { fill: tok('surface') }, when: [[{ axes: true }, { fill: tok('surface-2') }]] },
  'plane.dot': { base: { fill: tok('text') } },
  // 7368 .pze-trail: the patient's trail eases in once
  'plane.trail': { base: { ease: { opacity: ease('surface') } } },
  // 7369 .pze-walk: the line through the stops and the way the dot went
  'plane.walk': { base: { fill: 'none', stroke: tok('text'), strokeOpacity: 0.7, width: 1.6, cap: 'round', join: 'round' } },
  // 7370 .pze-stop: a hollow ring where he stood on the slides before
  'plane.stop': { base: { fill: 'none', stroke: tok('text'), width: 1.6 } },
  // 7371 .pze-sn: its short name, a halo of the card's colour
  'plane.sn': { state: { axes: 'data-axes' }, base: { fill: tok('text'), weight: 600, ...HALO(3) }, when: [HALO_AXES(3)] },
};
