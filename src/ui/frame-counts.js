// Always-on counts of the heavy passes (a few integer increments a frame, nothing allocated), read once a second by the frame panel
// (Settings › Show frame breakdown, frame-hud.js): vessel-layer draws, picture composites, whole composites, shared glass blurs.
export const counts = { draw: 0, composite: 0, whole: 0, blur: 0, why: {}, refused: {}, blurs: {} };   // (blurs: the shared glass blurs by look, so the panel says which glass blurs each frame)
/** One more for a reason (a kept record per reason; only a new reason makes a key). */
export const tally = (rec, k) => { rec[k] = (rec[k] || 0) + 1; };
