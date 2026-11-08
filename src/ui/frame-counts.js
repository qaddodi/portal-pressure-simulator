// Always-on counts of the heavy passes (a few integer increments a frame, nothing allocated), read once a second by the frame panel
// (Settings › Show frame breakdown, frame-hud.js): vessel-layer draws, picture composites, whole composites, shared glass blurs.
import { fenceWhole } from './gpu-fence.js';
export const counts = { draw: 0, composite: 0, whole: 0, blur: 0, organ: 0, why: {}, refused: {}, blurs: {}, organWhy: {} };   // (organ: the live organ layer painted again (veins-gl overPrep), organWhy: by reason)   // (blurs: the shared glass blurs by look, so the panel says which glass blurs each frame)
/** One more for a reason (a kept record per reason; only a new reason makes a key). A whole vessel redraw's reason (counts.why) is
 *  also told to the GPU fences, which time it while the frame panel shows (gpu-fence.js fenceWhole; one check when it does not). */
export const tally = (rec, k) => { rec[k] = (rec[k] || 0) + 1; if (rec === counts.why) fenceWhole(k); };
