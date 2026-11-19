// Number helpers for the readers: a report rounds what it says so two runs of one state compare equal (pps.screen() plan section 1, "Two forms").
export const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
export const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
/** Whole pixels (a box edge, a size). */
export const px = (v) => (Number.isFinite(v) ? Math.round(v) : null);
/** A box { left, top, right, bottom } or a DOMRect as [l, t, r, b] in whole pixels. */
export const box4 = (b) => (b ? [px(b.left), px(b.top), px(b.right), px(b.bottom)] : null);
/** A share 0..1 as a whole percent. */
export const pct = (v) => (Number.isFinite(v) ? Math.round(v * 100) : null);

/** What each card root is called in words. The one table: the labels part (read-labels.js CARD_NAMES) imports it from here, so one card has one name in a report. */
export const CARD_KINDS = { '.pz-case': 'case card', '.pz-text': 'teaching card', '.pz-data': 'data card', '.pz-panel': 'top card', '.action-card': 'structure card', '#dock': 'Tests card', '.toast': 'toast' };
