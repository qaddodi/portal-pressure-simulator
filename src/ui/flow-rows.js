// The per-vessel blood table (stage.js stepBlood → veins-gl.js setFlow), kept without a whole-table clear or a whole upload
// each frame: a row is written whole when its vessel draws, a row that stops drawing is cleared once, and only the span of
// rows that differ from what the GPU last took goes up again (none at all while paused, when nothing moves).

/**
 * Clears, once, each row that was written last frame (was[r]) and not this one (now[r]): with every drawn row written whole,
 * the table then ends exactly as a clear of the whole table before the writes would leave it. `now` becomes the next frame's
 * `was`, and `now` is emptied for the next frame. Returns how many rows were cleared.
 */
export function retireRows(data, was, now, stride) {
  let n = 0;
  for (let r = 0; r < was.length; r++) {
    if (was[r] && !now[r]) { data.fill(0, r * stride, (r + 1) * stride); n++; }
  }
  was.set(now); now.fill(0);
  return n;
}

/**
 * The rows of `data` (its first `rows` rows) that differ from `last`, as one inclusive span [lo, hi], or null when none
 * does. The span is copied into `last`, so it then holds what the GPU holds once the caller uploads it. One span, not one
 * upload per changed row: the moving blood changes most rows of a frame, and one call costs less than many small ones.
 * `out`: a pair kept by the caller, written with [lo, hi] and returned in place of a new one.
 */
export function changedRows(data, last, stride, rows, out = null) {
  const n = rows * stride;
  let i = 0;
  while (i < n && data[i] === last[i]) i++;
  if (i === n) return null;
  let j = n - 1;
  while (j > i && data[j] === last[j]) j--;
  const lo = Math.floor(i / stride), hi = Math.floor(j / stride);
  for (let k = lo * stride, e = (hi + 1) * stride; k < e; k++) last[k] = data[k];
  if (out) { out[0] = lo; out[1] = hi; return out; }
  return [lo, hi];   // alloc-rare: the answer for a caller that passes no `out`; every caller on a frame path (veins-gl's SPAN) passes one
}

/**
 * Whether the blood table `data` would show the same as `kept` (what the GPU last took): every value within a hundredth of
 * itself (and 0.001), except the columns in `fixed` (a stream's distance and drift, a chain's place along its root: world
 * units or cells, where a hundredth of a long distance is a visible shift), which must stay within 0.001. Used while the
 * blood stands still: the model's own small wobble (a flow moving by a fraction of a percent) then changes a streak's
 * density by less than a level of 255 and nothing is sent, so the figure is not drawn again for it. A change that adds up
 * past the bound is sent, since it is measured against what was last sent, not against the last frame.
 */
export function flowClose(data, kept, stride, rows, fixed = FLOW_FIXED, rel = 0.01, abs = 1e-3) {
  const n = rows * stride;
  if (!kept || kept.length < n) return false;
  for (let i = 0; i < n; i++) {
    const a = data[i], b = kept[i];
    if (a === b) continue;
    const d = Math.abs(a - b);
    if (d <= abs) continue;
    if (fixed[i % stride] || d > abs + rel * Math.abs(b)) return false;
  }
  return true;
}
// (The blood table's columns kept to 0.001 by flowClose: 0 the stream's distance, 14 its drift, 17 and 18 a chain's A and B,
// 20 and 21 the root's distance and drift, 24 and 25 a stream's anchor (its clock and speed factor). stage.js stepBlood lists the columns.)
export const FLOW_FIXED = (() => { const f = new Uint8Array(64); for (const c of [0, 14, 17, 18, 20, 21, 24, 25]) f[c] = 1; return f; })();
