// A card or sheet is coming or going (17 Nov 2026, the tester: TIPS card open and close, frames 112 to 139 ms apart against 55 to 62 for the vessel card; stepped, one frame of the card's
// entrance held a 98 to 110 ms "label presolve" slice, the labels of the other view solved ahead, begun the moment the card changed what the stage shows). Work made for a rest that
// comes after (the presolve, the view switch's pieces) waits until the card has landed: whoever starts a card's entrance or exit says how long it runs, and the work asks how much is left.
let until = 0;

/** A card or sheet moves for the next `ms` (kept at the latest end asked). */
export function cardMoveFor(ms) {
  const t = performance.now() + ms;
  if (t > until) until = t;
}
/** Milliseconds a card or sheet still has to go: 0 when none moves. */
export function cardMoveLeft() {
  const left = until - performance.now();
  return left > 0 ? left : 0;
}
