// The room a data card's instrument has for its pictures (--pz-room, px). Pure: the caller hands over the numbers it measured (presenter-zoom.js toolRoom).
// Every instrument sizes its picture against this, never against the window and never against its own height: a window-share budget (the path card's 0.55
// of the height) ignored where the card stands under the words, so pictures ran 10 to 74 px past their card on a short Mac and an iPad (deck sweep, 19 Nov 2026).

/** cap: the card's height cap; pad: its padding and border, top and bottom; parts: the heights (with margins) of every other part it holds; gap: the card's row gap; rows: how many parts it holds, the instrument included. */
export function toolRoomOf({ cap, pad = 0, parts = [], gap = 0, rows = parts.length + 1 }) {
  if (!(cap > 0)) return 0;
  const used = pad + parts.reduce((a, b) => a + (b > 0 ? b : 0), 0) + gap * Math.max(0, rows - 1);
  return Math.max(0, Math.floor(cap - used));
}
