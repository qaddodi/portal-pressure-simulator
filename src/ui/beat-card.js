// The beat-by-beat card on a slide (Mohammad's pick d1b, 29 Oct; mocks in review/pressure-beat-card-ideas): a black EKG strip and the wedged
// and free hepatic pressures on one sheet of paper, the HVPG the shaded gap between them, the portal pressure dashed over the wedged, the
// readings in a column beside, and where the patient stood before the slide's event as two dotted lines with the old gap faint grey behind.
// These are the layout's numbers, in CSS pixels; pressure-time.js draws it.

/** The pressure scale's top: a multiple of 5, 20 or more, over every value shown (now and before) with 2 mmHg to spare. */
export function beatTop(values) {
  const mx = Math.max(0, ...values.filter(Number.isFinite));
  return Math.max(20, Math.ceil((mx + 2) / 5) * 5);
}

/** The column's height at full size, below its first line (26 px down): with the changes since before and the three lines' key, without the
 *  changes, and without the key too. A shorter card first sets the parts closer (down to 0.75 of it), then leaves out the changes, then
 *  the key: what it shows always fits, and none of it is smaller than its 12 px floor. */
export const COL_NEED = { full: 287, plain: 249, bare: 127 };
export function colPlan(h, deltas) {
  const room = h - 30;
  for (const [want, d, rows] of [['full', true, true], ['plain', false, true], ['bare', false, false]]) {
    if (want === 'full' && !deltas) continue;
    const need = COL_NEED[want];
    if (room >= need * 0.75 || want === 'bare') return { k: Math.min(1, room / need), deltas: d, rows };
  }
}

/**
 * Where the card's parts go in a canvas w × h.
 * wide: the readings stand in a column beside the plot (colX: its left edge); otherwise one header line on top and each line's value at its end.
 * L, R: the plot's left and right; ekg: the strip's top and bottom (null: off on the slide, or no room: the strip goes first); top, bot: the
 * pressures' plot.
 */
export function beatLayout(w, h, withEkg = true) {
  const wide = w >= 440 && h >= 170;
  const colW = wide ? Math.round(Math.min(176, Math.max(140, w * 0.3))) : 0;
  const L = 36, R = wide ? w - colW - 30 : w - 96;   // (wide: the caliper's room between the plot and the column; narrow: the end values)
  const head = wide ? 0 : 30, B = 24;
  const avail = h - head - B - 14;
  const ekgH = withEkg && avail >= 100 ? Math.round(Math.min(46, Math.max(26, avail * 0.15))) : 0;   // (a strip, not a chart: Mohammad 29 Oct, "not that long")
  const y0 = 10 + head;
  const ekg = ekgH ? { top: y0, bot: y0 + ekgH } : null;
  const top = (ekg ? ekg.bot + 12 : y0) + 4, bot = h - B;
  return { wide, colX: wide ? R + 30 : null, L, R, head, ekg, top, bot };
}

/** The paper's square: one mmHg high. Its fine lines are drawn only where a square is 4.5 px or more; the heavy ones (every 5) always. */
export const paperFine = (sq) => sq >= 4.5;

/**
 * Where "before the bleed" goes: above the old gap's upper dotted line, else under its lower one, wherever the label's box keeps clear of
 * every line drawn under it (spans: [yMin, yMax] in px, each line's extent over the label's width) and stays in the plot. null: nowhere.
 */
export function beforeLabelY(yUpper, yLower, spans, top, bot, hgt = 18) {
  const clear = (y0) => y0 >= top && y0 + hgt <= bot && spans.every(([a, b]) => b < y0 - 2 || a > y0 + hgt + 2);
  const above = yUpper - 4 - hgt, below = yLower + 4;
  return clear(above) ? above : clear(below) ? below : null;
}

/** The change since before, as the column writes it: "▲ 39 since before", or '' when it has not moved (under half a unit at its decimals). */
export function sinceText(now, was, dec) {
  if (!Number.isFinite(now) || !Number.isFinite(was)) return '';
  const r = (v) => Math.round(v * 10 ** dec) / 10 ** dec, d = r(r(now) - r(was));
  if (Math.abs(d) < 10 ** -dec / 2) return '';
  return `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(dec)} since before`;
}
