// Tap a label to explain it (N4, V-LIT-7; Mohammad, 3 Nov 2026). During a talk a tap on a label lights it and what it names, the other labels
// step back to 35 % (14.3 B), and a one-line tooltip with the structure's name and live value rides under the label. A second tap on it, or
// Next, clears it. The tooltip is a line of the label's own picture (label-gl.js, label-captions.js), so it is drawn by the GPU in the frame
// that draws the label and moves with it; the tap is judged against what the GPU last drew (the layer's snapshot), never the page's boxes.
//
// This file is the pure part: which drawn label a tap lands on, what the tooltip says, and the toggle. The layers do the lighting.

export const DIM_ALPHA = 0.35;   // (what the labels that are not explained step back to: V-LIT-3, 14.3 B)
const MIN_SHOWN = 0.2;           // (a label drawn fainter than this is on its way in or out: a tap does not land on it)

/**
 * The drawn label a tap at (x, y) lands on: the item of `items` ({ key, x, y, w, h, a }, one layer's snapshot in page px) whose box, grown
 * by `slop` px (a finger's reach), holds the point. Of several, the most shown, then the nearest centre. `keep(key)` leaves out a label
 * that cannot be explained (a mark, a chart's own words). Returns the item or null; reads, never writes.
 */
export function hitLabel(items, x, y, slop = 6, keep = null) {
  let best = null, bestA = -1, bestD = Infinity;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!(it.a >= MIN_SHOWN) || it.clipped === true && it.w <= 0) continue;
    if (x < it.x - slop || x > it.x + it.w + slop || y < it.y - slop || y > it.y + it.h + slop) continue;
    if (keep && !keep(it.key)) continue;
    const d = Math.hypot(x - (it.x + it.w / 2), y - (it.y + it.h / 2));
    if (it.a > bestA + 0.05 || (Math.abs(it.a - bestA) <= 0.05 && d < bestD)) { best = it; bestA = it.a; bestD = d; }
  }
  return best;
}

/** The tooltip's words: "Portal vein · 22.4 mmHg · 1.1 L/min". `parts` are the pieces ({ name, value, unit } and any of flow, vel, note); a piece with no number is left out. */
export function explainText({ name, what = '', value, unit = 'mmHg', flow, vel, note } = {}) {
  const out = [];
  if (name) out.push(name);
  if (Number.isFinite(value)) out.push(`${what ? `${what} ` : ''}${value.toFixed(1)} ${unit}`.trim());
  if (Number.isFinite(flow) && Math.abs(flow) >= 0.05) out.push(`${flow.toFixed(1)} L/min`);
  if (Number.isFinite(vel)) out.push(`${vel.toFixed(0)} cm/s`);
  if (note) out.push(note);
  return out.join(' · ');
}

/**
 * The explained label, as a toggle: tap(key) explains that label, or clears when it is the one already explained; clear() ends it (Next, a
 * view switch, the talk's end). `onChange(key|null)` is called only when the key changes. get key() is the explained label or null.
 */
export function createExplain(onChange = null) {
  let key = null;
  const set = (k) => { if (k === key) return key; key = k; onChange?.(key); return key; };
  return {
    get key() { return key; },
    tap(k) { return set(k == null || k === key ? null : k); },
    clear() { return set(null); },
    is(k) { return key != null && key === k; },
    /** What a label of this key should look like now: 'on' (the explained one), 'dim' (another while one is explained), or '' (none explained). */
    state(k) { return key == null ? '' : k === key ? 'on' : 'dim'; },
  };
}
