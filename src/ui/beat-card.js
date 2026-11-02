// The beat-by-beat card on a slide (Mohammad's pick d1b, 29 Oct; mocks in review/pressure-beat-card-ideas): a black EKG strip and the wedged
// and free hepatic pressures on one sheet of paper, the HVPG the shaded gap between them, the portal pressure dashed over the wedged, the
// readings in a column beside, and where the patient stood before the slide's event as two dotted lines with the old gap faint grey behind.
// These are the layout's numbers, in CSS pixels; pressure-time.js draws it.

/** The pressure scale's top: a multiple of 5, 20 or more, over every value shown (now and before) with 2 mmHg to spare. */
export function beatTop(values) {
  let mx = 0;
  for (let i = 0; i < values.length; i++) { const v = values[i]; if (Number.isFinite(v) && v > mx) mx = v; }
  return Math.max(20, Math.ceil((mx + 2) / 5) * 5);
}

/** The column's height at full size, below its first line (26 px down): with the changes since before and the three lines' key, without the
 *  changes, and without the key too. A shorter card first sets the parts closer (down to 0.75 of it), then leaves out the changes, then
 *  the key: what it shows always fits, and none of it is smaller than its 12 px floor. */
export const COL_NEED = { full: 287, plain: 249, bare: 127 };
// (The plan is one kept object, rewritten by each call: the caller reads it at once, as the card draws.)
const PLAN = { k: 1, deltas: true, rows: true };
export function colPlan(h, deltas) {
  const room = h - 30;
  for (let i = deltas ? 0 : 1; i < 3; i++) {
    const need = i === 0 ? COL_NEED.full : i === 1 ? COL_NEED.plain : COL_NEED.bare;
    if (room >= need * 0.75 || i === 2) { PLAN.k = Math.min(1, room / need); PLAN.deltas = i === 0; PLAN.rows = i < 2; return PLAN; }
  }
}

/**
 * Where the card's parts go in a canvas w × h.
 * wide: the readings stand in a column beside the plot (colX: its left edge); otherwise one header line on top and each line's value at its end.
 * L, R: the plot's left and right; ekg: the strip's top and bottom (null: off on the slide, or no room: the strip goes first); top, bot: the
 * pressures' plot.
 * The result is one kept object (its ekg too), rewritten by each call: read it before the next call.
 */
const LAYOUT = { wide: false, colX: null, L: 0, R: 0, head: 0, ekg: null, top: 0, bot: 0 };
const STRIP = { top: 0, bot: 0 };
export function beatLayout(w, h, withEkg = true) {
  const wide = w >= 440 && h >= 170;
  const colW = wide ? Math.round(Math.min(176, Math.max(140, w * 0.3))) : 0;
  const L = 36, R = wide ? w - colW - 30 : w - 116;   // (wide: the caliper's room between the plot and the column; narrow: the end values, "17.1 WHVP" 8 px in from the edge (it was cut at the edge on a phone, 31 Oct))
  const head = wide ? 0 : 30, B = 24;
  const avail = h - head - B - 14;
  const ekgH = withEkg && avail >= 100 ? Math.round(Math.min(46, Math.max(26, avail * 0.15))) : 0;   // (a strip, not a chart: Mohammad 29 Oct, "not that long")
  const y0 = 10 + head;
  let ekg = null;
  if (ekgH) { ekg = STRIP; ekg.top = y0; ekg.bot = y0 + ekgH; }
  const top = (ekg ? ekg.bot + 12 : y0) + 4, bot = h - B;
  const o = LAYOUT;
  o.wide = wide; o.colX = wide ? R + 30 : null; o.L = L; o.R = R; o.head = head; o.ekg = ekg; o.top = top; o.bot = bot;
  return o;
}

/** The paper's square: one mmHg high. Its fine lines are drawn only where a square is 4.5 px or more; the heavy ones (every 5) always. */
export const paperFine = (sq) => sq >= 4.5;

/**
 * Where "before the bleed" goes: above the old gap's upper dotted line, else under its lower one, wherever the label's box keeps clear of
 * every line drawn under it (spans: [yMin, yMax] in px, each line's extent over the label's width) and stays in the plot. null: nowhere.
 */
const labelClear = (y0, spans, top, bot, hgt) => {
  if (!(y0 >= top && y0 + hgt <= bot)) return false;
  for (let i = 0; i < spans.length; i++) { const sp = spans[i]; if (!(sp[1] < y0 - 2 || sp[0] > y0 + hgt + 2)) return false; }
  return true;
};
export function beforeLabelY(yUpper, yLower, spans, top, bot, hgt = 18) {
  const above = yUpper - 4 - hgt, below = yLower + 4;
  return labelClear(above, spans, top, bot, hgt) ? above : labelClear(below, spans, top, bot, hgt) ? below : null;
}

/** The change since before, as the column writes it: "▲ 39 since before", or '' when it has not moved (under half a unit at its decimals). */
// (The card asks for each of its two texts several times a frame with the same numbers: the last text per decimals is kept, and made
// again only when a number changed.)
const lastNow = [], lastWas = [], lastText = [];
const roundTo = (v, dec) => Math.round(v * 10 ** dec) / 10 ** dec;
export function sinceText(now, was, dec) {
  if (!Number.isFinite(now) || !Number.isFinite(was)) return '';
  if (lastNow[dec] === now && lastWas[dec] === was && lastText[dec] !== undefined) return lastText[dec];
  const d = roundTo(roundTo(now, dec) - roundTo(was, dec), dec);
  const text = Math.abs(d) < 10 ** -dec / 2 ? '' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(dec)} since before`;
  lastNow[dec] = now; lastWas[dec] = was; lastText[dec] = text;
  return text;
}
