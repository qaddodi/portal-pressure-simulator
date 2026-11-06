// The two sizes a phone's Tests card hands its panes from its own height (dock.js sizeObserver writes them, dock-sheet.js writes them too as a pull
// lands and measures with them as it begins, so the card's landing changes nothing that the pull did not already show).
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** { plot, square } in px for a card h0 px tall that is held upright (a phone's or an upright tablet's sheet). */
export const sheetDockVars = (h0, phone) => ({ plot: clamp(h0 - (phone ? 150 : 190), 190, 420), square: clamp(h0 - 160, 220, 380) });
