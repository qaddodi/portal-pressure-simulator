// The event labels of the talk-so-far chart (presenter-tools.js talkTrace): what was measured or done at each time
// point, written at 45° along the top of the chart. The chart makes room for them: a pad above the plot, and a right
// edge pulled in until the last label ends inside the picture, so nothing is clipped on any screen.

const CW = 9.2;                  // average width of a label's characters at its 16 px (styles/app.css .ptk-ev)
const SLANT = Math.SQRT1_2;      // sin and cos of 45°
export const LABEL_MAX = 24;     // longer ticks are cut with an ellipsis

/** A tick as the chart shows it. */
export const traceLabel = (t) => { const s = (t || '').trim(); return s.length > LABEL_MAX ? s.slice(0, LABEL_MAX - 1).trimEnd() + '…' : s; };

/** The time point under a state: its days so far, unless the state sits on the same day as the one before (a slide that changes
 *  the patient at the same visit, as a drug does): that one is `same`, or the slide's own words. */
export function traceWhen(own, whenNow, whenBefore, same = 'Same day') {
  return own || (whenBefore != null && whenNow === whenBefore ? same : whenNow);
}

/** Room the chart needs for its 45° labels: the plot's right edge R, and the pad above it. */
export function traceLabelRoom(ticks, { W = 520, L = 46, right = 64 } = {}) {
  const dx = ticks.map((t) => Math.ceil(traceLabel(t).length * CW * SLANT));
  const n = Math.max(ticks.length, 2), at = (i, r) => L + (r - L) * (ticks.length < 2 ? 0.5 : i / (n - 1));
  let R = W - right;
  while (R > L + 160 && dx.some((d, i) => at(i, R) + 6 + d > W - 4)) R -= 4;
  return { R, pad: dx.length ? Math.max(...dx) + 4 : 0 };
}
