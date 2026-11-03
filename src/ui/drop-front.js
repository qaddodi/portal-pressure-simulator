// Drops the first n items of an array in place, the way splice(0, n) does, without what splice costs on a frame path: no array of the
// removed items made, and no left-trim of the backing store (which leaves it too small, so the next push of every frame copies the whole
// array into a new one). The items shift down with one pass and the length shrinks; capacity stays, so a steady window allocates nothing.
// (2 Nov 2026, scripts/frame-alloc.mjs: pressure-time's fine buffers allocated 1.7 MB over 38 frames this way.)
export function dropFront(a, n) {
  const len = a.length;
  if (n <= 0) return a;
  if (n >= len) { a.length = 0; return a; }
  // (copyWithin, not a loop of our own: this one function serves arrays of numbers and arrays of objects, and its store, made generic by the
  // second kind, turned the number arrays into arrays of heap numbers once it was compiled, a new heap number for every value pushed after.)
  a.copyWithin(0, n);
  a.length = len - n;
  return a;
}
