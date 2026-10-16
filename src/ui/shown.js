// The readings as the bottom bar shows them (dock.js: the model's value over about a second, so the beat does not flicker
// it): other views that print the same quantity read it from here, so one number never shows as 0.5 in one place and 0.6
// in another (sweep batch 03, shot 21: the Pressure chart's HVPG and PPG brackets beside the bar's).
const shown = new Map();
export const setShown = (id, v) => { shown.set(id, v); };
/** The bar's value for readout `id` when it has one, else `fallback`. */
export const shownOr = (id, fallback) => { const v = shown.get(id); return Number.isFinite(v) ? v : fallback; };
