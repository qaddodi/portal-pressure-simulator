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
 */
export function changedRows(data, last, stride, rows) {
  const n = rows * stride;
  let i = 0;
  while (i < n && data[i] === last[i]) i++;
  if (i === n) return null;
  let j = n - 1;
  while (j > i && data[j] === last[j]) j--;
  const lo = Math.floor(i / stride), hi = Math.floor(j / stride);
  last.set(data.subarray(lo * stride, (hi + 1) * stride), lo * stride);
  return [lo, hi];
}
