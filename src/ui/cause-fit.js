// Where the first row's cause fits beside its site tag (the six-case grid, presenter.js fitRow): the size that fills the room the tag
// leaves, in proportion, never under the floor (12 px on the screen); 'under' when even the floor is too wide for the room, so the
// cause goes under the tag, whole, instead of running out of its card.
//   size: the cause's font size; width: its width at that size; room: what the tag leaves of the row; floor: the smallest size.
//   All in the row's own px. → { size, under }
export function causeFit(size, width, room, floor) {
  if (!(width > room + 0.5)) return { size, under: false };
  const out = Math.min(size, Math.max(floor, size * room / width));   // (never larger than it was drawn)
  return { size: out, under: width * out / size > room + 0.5 };
}
