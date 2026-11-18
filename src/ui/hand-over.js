// The hand-over between a card's two layouts (the side card or shelf of a Mac and an iPad held sideways, the bottom sheet of a phone and an iPad held upright).
// A turn of the device changes which one a card has: its words are laid out again at the new width and height, so the place it was scrolled to means nothing
// (F35, iPad 1024 x 768 to 768 x 1024: the Tests card stayed scrolled mid-content, its head, switch and tabs out of view and a PPG value without its label).
// `keep` is the card's own memory of the layout it was last placed in: { mode }. Returns true when the layout changed, and then every scroller is put back to its top.
export function handOver(keep, mode, scrollers) {
  if (keep.mode === mode) return false;
  const was = keep.mode;
  keep.mode = mode;
  if (was === undefined) return false;   // (the first placement: nothing was scrolled in another layout)
  for (const el of scrollers) if (el) el.scrollTop = 0;   // (a write: nothing is read from the page)
  return true;
}
