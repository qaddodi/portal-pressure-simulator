// Drops the first n items of an array in place, the way splice(0, n) does, without what splice costs on a frame path: no array of the
// removed items made, and no left-trim of the backing store (which leaves it too small, so the next push of every frame copies the whole
// array into a new one). The items shift down with one pass and the length shrinks; capacity stays, so a steady window allocates nothing.
// (2 Nov 2026, scripts/frame-alloc.mjs: pressure-time's fine buffers allocated 1.7 MB over 38 frames this way.)
export function dropFront(a, n) {
  const len = a.length;
  if (n <= 0) return a;
  if (n >= len) { a.length = 0; return a; }
  for (let i = n; i < len; i++) a[i - n] = a[i];
  a.length = len - n;
  return a;
}
