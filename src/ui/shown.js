// The readings as the bottom bar shows them (dock.js: the model's value over about a second, so the beat does not flicker
// it): other views that print the same quantity read it from here, so one number never shows as 0.5 in one place and 0.6
// in another (sweep batch 03, shot 21: the Pressure chart's HVPG and PPG brackets beside the bar's).
// The bar writes what it shows in each display frame (the shown state below), so a view that draws in the same frame reads it too.
import { createShownState, FILL_SMALL, fillQ } from './display-state.js';
export { FILL_SMALL, fillQ };
import { frameFor, cancelFrame, restGapFor } from './frame.js';
const shown = new Map();
export const setShown = (id, v) => { shown.set(id, v); };
/** The bar's value for readout `id` when it has one, else `fallback`. */
export const shownOr = (id, fallback) => { const v = shown.get(id); return Number.isFinite(v) ? v : fallback; };
// The page's one shown state (display-state.js createShownState, premium-feel R4): the bottom bar's tiles and bars, the Readouts tab
// and whoever reads them follow the model through it, stepped once per display frame in the scheduler's early phase.
// (At rest (frame.js restGapFor: 4 s with no input and nothing moving) the followers step 30 a second (20 in a talk left 30 s), waiting on a timer
// between steps, not asking the page for every screen frame: a running model's tiles, bars and marks glide on after each digit it crosses, and
// each step wrote the cards, woke the glass and the readers beside it, 40 times a second on Mohammad's iPhone at rest (the lap, 13 Nov 2026).
// The filter is exact in time (display-state.js follow2), so the glide ends where it did, in fewer steps. Any input gives the full rate back.)
const askFrame = frameFor('shown');
let pend = null, timer = 0, frameId = 0, lastStep = -Infinity;
const run = (t) => { frameId = 0; const f = pend; pend = null; lastStep = performance.now(); f?.(t); };
const fire = () => { timer = 0; if (pend && !frameId) frameId = askFrame(run); };
export function askShown(fn) {
  pend = fn;
  if (timer || frameId) return 1;
  const gap = restGapFor(performance.now()), left = gap - (performance.now() - lastStep);
  if (gap && left > 8) timer = setTimeout(fire, left - 8);
  else frameId = askFrame(run);
  return 1;
}
export function cancelShown() { pend = null; clearTimeout(timer); timer = 0; if (frameId) cancelFrame(frameId); frameId = 0; }
export const shownState = createShownState({ ask: askShown, cancel: cancelShown });
