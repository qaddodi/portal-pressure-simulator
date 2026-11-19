// Number helpers for the readers: a report rounds what it says so two runs of one state compare equal (pps.screen() plan section 1, "Two forms").
export const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
export const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
/** Whole pixels (a box edge, a size). */
export const px = (v) => (Number.isFinite(v) ? Math.round(v) : null);
/** A box { left, top, right, bottom } or a DOMRect as [l, t, r, b] in whole pixels. */
export const box4 = (b) => (b ? [px(b.left), px(b.top), px(b.right), px(b.bottom)] : null);
/** A share 0..1 as a whole percent. */
export const pct = (v) => (Number.isFinite(v) ? Math.round(v * 100) : null);
