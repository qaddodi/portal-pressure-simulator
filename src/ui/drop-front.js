// Drops the first n items of an array in place, the way splice(0, n) does, without what splice costs on a frame path: no array of the
// removed items made, and no left-trim of the backing store (which leaves it too small, so the next push of every frame copies the whole
// array into a new one). The items shift down with one pass and the length shrinks; capacity stays, so a steady window allocates nothing.
// (2 Nov 2026, scripts/frame-alloc.mjs: pressure-time's fine buffers allocated 1.7 MB over 38 frames this way.)
//
// Not copyWithin: on an ordinary array it reads and writes through the generic path and makes a heap number for every item it moves
// (16 bytes each: 32 KB for a window of 2,000 samples, every call; scripts/warm-alloc.mjs, 3 Nov 2026). A loop of our own does not, but
// the one compiled store must not serve arrays of numbers and arrays of objects (the second kind makes the store generic, and the number
// arrays then box every value pushed after): `dropFrontNums` is the loop for arrays of numbers, `dropFront` for anything else.
export function dropFront(a, n) {
  const len = a.length;
  if (n <= 0) return a;
  if (n >= len) { a.length = 0; return a; }
  for (let i = n; i < len; i++) a[i - n] = a[i];
  a.length = len - n;
  return a;
}
export function dropFrontNums(a, n) {
  const len = a.length;
  if (n <= 0) return a;
  if (n >= len) { a.length = 0; return a; }
  for (let i = n; i < len; i++) a[i - n] = a[i];
  a.length = len - n;
  return a;
}
