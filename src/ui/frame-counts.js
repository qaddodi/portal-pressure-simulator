// Always-on counts of the heavy passes (a few integer increments a frame, nothing allocated), read once a second by the frame panel
// (Settings › Show frame breakdown, frame-hud.js): vessel-layer draws, picture composites, whole composites, shared glass blurs.
export const counts = { draw: 0, composite: 0, whole: 0, blur: 0 };
