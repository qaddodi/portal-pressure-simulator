// The rounded plot, one look for the app's graphs (his G2 pick, 27 Oct, the first-visit graph on Stiffness slide 5).
//
// A graph's plot is one soft rounded shape: its fills (zones, a panel behind the lines) clipped to rounded corners that reach the
// card's own edges, its axis numbers written on it in the FibroScan readings' style (white with a dark outline, .pz-pn) rather
// than in a margin of their own, no axis lines (the shape's edge is the axis). Where a plot is filled with zones (the planes,
// the criteria graph) the numbers sit on the plot itself; where data lines run (the relation and time charts) they sit in a
// narrow strip inside the shape's edge, which no line enters, so a number never touches a line.
//
//   const p = plotPanel(sv, x, y, w, h);       p.clip (a <clipPath> for defs), p.url (its clip-path value), p.back (the panel's rect)
//
// sv is the caller's own element builder (sv(tag, attrs, ...kids)), so each chart keeps its way of writing numbers into attributes.

export const PLOT_R = 10;
/** The corner radius of a plot w × h px: 10 px, less on a plot too small for it (a quarter of its shorter side). */
export const plotR = (w, h) => Math.max(0, Math.min(PLOT_R, w / 4, h / 4));
let n = 0;
/** A rounded panel x, y, w, h: { id, r, clip, url, back }. clip is the <clipPath> to put in defs, url the value for a clip-path
 *  attribute (a group of fills that must keep the corners), back the panel's own rect (class pz-plotbg; null with fill: false). */
export function plotPanel(sv, x, y, w, h, { fill = true } = {}) {
  const id = `pzr${++n}`, r = plotR(w, h);
  return {
    id, r, url: `url(#${id})`,
    clip: sv('clipPath', { id }, sv('rect', { x, y, width: w, height: h, rx: r })),
    back: fill ? sv('rect', { class: 'pz-plotbg', x, y, width: w, height: h, rx: r }) : null,
  };
}
