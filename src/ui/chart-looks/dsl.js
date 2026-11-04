// The constructors a chart's look entry is written with (docs/chart-looks-in-code-plan.md §1). They only make plain data: no logic, no
// reads. chart-looks/resolve.js turns the data into numbers and colours for one context.

/** A theme token, by its CSS name without the dashes: tok('text'). */
export const tok = (name) => ({ k: 'tok', n: name });
/** A colour the builder gives one piece (data-p-<name> holds a token name): param('rx'). */
export const param = (name) => ({ k: 'param', n: name });
/** CSS color-mix(in <space>, a pct%, b [pctB%]): space is 'srgb' or 'oklab'; a and b are colour values (tok, param, mix or a CSS string). */
export const mix = (space, a, pct, b, pctB) => ({ k: 'mix', space, a, pct, b, pctB });
/** A length in px. */
export const px = (n) => ({ k: 'px', n });
/** k times the chart host's base type size (HOSTS in index.js), not an ancestor's. */
export const em = (k) => ({ k: 'em', n: k });
/** x times the chart's own letter scale (--svk today). x is a number or a length. */
export const svk = (x) => ({ k: 'svk', x });
/** k times one of the card's type sizes: cap, lab, body, val, sm, chCap, fs12, fs14 (card-scale.js). */
const scaleOf = (name) => (m = 1) => ({ k: 'scale', name, m });
export const cap = scaleOf('cap'), lab = scaleOf('lab'), body = scaleOf('body'), val = scaleOf('val'), sm = scaleOf('sm'), chCap = scaleOf('chCap');
export const fs12 = scaleOf('fs12'), fs14 = scaleOf('fs14');
export const max = (...a) => ({ k: 'fn', f: 'max', a });
export const min = (...a) => ({ k: 'fn', f: 'min', a });
export const clamp = (lo, v, hi) => ({ k: 'fn', f: 'clamp', a: [lo, v, hi] });
/** A transition the picture runs itself: kind 'flip' | 'small' | 'surface' (the durations of ease.js), curve a CSS easing (default: arrive), delay in ms. */
export const ease = (kind, curve, delay = 0) => ({ k: 'ease', kind, curve, delay });
