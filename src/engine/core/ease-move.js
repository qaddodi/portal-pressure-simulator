// The quintic smootherstep the page's moves and the engine's morph share (ui/ease.js re-exports it). It lives with the engine so the simulation
// worker imports nothing from ui/ (bible ENG-12, 19 Nov 2026): the engine and its host stay free of the page's code.
export const easeMove = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
