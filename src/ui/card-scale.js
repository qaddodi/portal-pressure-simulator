// The teaching card's type scale as plain functions (docs/chart-looks-in-code-plan.md WP3). It MIRRORS the formulas the stylesheet writes
// as --s-cap … --s-title, --ch-cap, --pz-sm, --pz-num, --fs-12 and --fs-14, so a chart's looks written in code (chart-looks/dsl.js cap(),
// lab(), sm() …) get the same px the page's own words get. Nothing here reads a page: the caller hands over the numbers. Node-testable.
//
// This is the one deliberate, time-boxed double definition: the CSS formulas stay (WP12 deletes them and presenter writes the vars from here).
// Each block cites the styles/app.css lines it copies; a change to one is a change to both, and tests/card-scale.test.js pins them together.
//
// Inputs ({ vw, vh } are the window's css px):
//   layout  'wide' (Mac, iPad landscape, a phone on its side) | 'short' (wide under 860 px tall, .pz.short) | 'stack' (a phone upright) | 'tab' (an upright iPad) | 'low' (unused, kept as the CSS keeps it)
//   part    where the chart sits: 'text' | 'panel' | 'data' | 'table' | 'grid' | 'cell'  ('data' also serves an instrument inside the data card)
//   card    the words sit in the floating card (.pz-card, on every layout but stack)
//   ts      the text size setting (--ts)   bk, tk  the words' and title's steps (--pz-bk, --pz-tk)   dk  a data card's block step (--pz-dk)

// ── The roles: [floor, per --pzh, ceiling] (app.css:1876-1878) ──
const ROLE = { cap: [12, 1.733, 21], lab: [14, 2.022, 24.5], body: [17, 2.311, 28], val: [20, 3.178, 38.5], big: [28, 4.622, 56], title: [32, 6.356, 77] };
const NAMES = Object.keys(ROLE);
// The stacked layouts' roles, from the screen's short side (tokens.css --t-*; 100vmin).
const T = {
  cap: () => 12,
  lab: (m) => Math.min(14, Math.max(12, 12 + (m - 390) * 0.00392)),
  body: (m) => Math.min(16, Math.max(14, 14 + (m - 390) * 0.00392)),
  val: (m) => Math.min(22, Math.max(16, 16 + (m - 390) * 0.01176)),
  big: (m) => Math.min(32, Math.max(20, 20 + (m - 390) * 0.02353)),
  title: (m) => Math.min(44, Math.max(28, 28 + (m - 390) * 0.03137)),
};
const clamp = (lo, v, hi) => Math.min(Math.max(v, lo), hi);

/** --pzh in px (app.css:26-27): 1vh, and on an upright tablet the smaller of that and .75vw. */
export function pzh(vw, vh) { return vw >= 700 && vh >= vw ? Math.min(vh / 100, 0.75 * vw / 100) : vh / 100; }

const wide = (h, ts, pk = 1, k = 1) => { const o = {}; for (const n of NAMES) { const [lo, a, hi] = ROLE[n]; o[n] = clamp(lo, a * h, hi) * ts * pk * k; } return o; };
const tok = (m, ts, pk = 1) => { const o = {}; for (const n of NAMES) o[n] = T[n](m) * ts * pk; return o; };

/** The six roles for one place on the card, in px (before the derived sizes). */
function roles(i, h, m) {
  const { layout, part, card, ts, bk, tk } = i;
  const stack = layout === 'stack' || layout === 'tab', low = layout === 'low', short = layout === 'short';
  const landSmall = i.vw > i.vh && i.vh <= 500;   // @media (orientation: landscape) and (max-height: 500px): app.css:1891
  const tp = stack ? (layout === 'tab' ? 1.39 : 1.45) : low ? 1.4 : landSmall ? 1.3 : 1;   // --pk on the words and the panel (app.css:1889-1891, 1895)
  if (part === 'text') {
    if (stack || low) return tok(m, ts, tp);                                                  // app.css:1884-1885, 1895-1896
    if (card) {                                                                               // app.css:1880-1883
      const r = wide(h, ts, tp, bk);
      r.cap = Math.max(12, r.cap); r.title = clamp(32, 5.546 * h, 67) * ts * tp * tk;
      return r;
    }
    return wide(h, ts, tp);                                                                   // app.css:1876-1878
  }
  if (part === 'panel') return stack ? tok(m, ts, tp) : short ? shortRoles(m, ts, wide(h, ts, tp)) : wide(h, ts, tp);   // app.css:1884, 6239
  if (part === 'table') {
    if (stack) return tok(m, ts);                                                             // app.css:1911
    if (landSmall) return { ...wide(h, ts, tp), ...pick(wide(h, ts), ['cap', 'lab', 'body', 'val']) };   // app.css:1912-1913
    return short ? shortRoles(m, ts, wide(h, ts, tp)) : wide(h, ts, tp);
  }
  if (part === 'grid' || part === 'cell') {
    if (stack || low) return { ...tok(m, ts, 1.15), title: tok(m, ts).title };                // app.css:2627
    return short ? shortRoles(m, ts, wide(h, ts, tp)) : wide(h, ts, tp);
  }
  // 'data' (and an instrument in it)
  if (stack) { const r = tok(m, ts), k = layout === 'tab' ? 1.3 : 1.15; r.cap *= k; r.lab *= k; return r; }   // app.css:2575-2576
  return short ? shortRoles(m, ts, wide(h, ts)) : wide(h, ts);
}
const pick = (o, ks) => { const r = {}; for (const k of ks) r[k] = o[k]; return r; };
// .pz.short (app.css:6239): the roles at the stacked layouts' own sizes, the label never under 12 px; title and big follow the base.
const shortRoles = (m, ts, base) => ({ ...base, ...pick(tok(m, ts), ['cap', 'body', 'val', 'big']), lab: Math.max(12, T.lab(m) * ts) });

const memo = new Map();   // alloc-rare: one frozen record for each distinct input, kept (a few dozen at most)
/**
 * The card's sizes at this place: { cap, lab, body, val, big, title, sm, num, chCap, chLab, fs12, fs14 } in px, as the CSS's --s-*, --pz-sm,
 * --pz-num, --ch-cap, --ch-lab, --fs-12 and --fs-14 compute there. The same input gives the same object, so setCtx sees no change.
 */
export function cardScale(inp) {
  const i = { vw: 1440, vh: 900, layout: 'wide', part: 'data', card: false, ts: 1, bk: 1, tk: 1, dk: 1, ...inp };
  const key = `${Math.round(i.vw)}|${Math.round(i.vh)}|${i.layout}|${i.part}|${i.card ? 1 : 0}|${+i.ts.toFixed(3)}|${+i.bk.toFixed(3)}|${+i.tk.toFixed(3)}|${+i.dk.toFixed(3)}`;
  let o = memo.get(key);
  if (o) return o;
  const h = pzh(i.vw, i.vh), m = Math.min(i.vw, i.vh), r = roles(i, h, m);
  const stack = i.layout === 'stack' || i.layout === 'tab';
  r.sm = stack ? r.cap : Math.max(12, r.cap * 0.74);                          // --pz-sm (app.css:2806; a stacked card has none: its cap)
  r.num = r.val * 1.08;                                                       // --pz-num (app.css:2806)
  const cellStack = stack || i.layout === 'low';
  r.chCap = cellStack ? r.cap : Math.max(12, r.cap * 0.74);                   // --ch-cap (app.css:2266, 2628)
  r.chLab = cellStack ? r.lab : r.chCap * 1.5;                                // --ch-lab
  r.fs12 = Math.max(r.cap, 12);                                               // --fs-12 (app.css .pz-tool: an instrument is not zoomed)
  r.fs14 = Math.max(r.cap * 1.12, 12.5);                                    // --fs-14
  memo.set(key, o = Object.freeze(r));
  return o;
}
