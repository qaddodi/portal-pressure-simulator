import { APPENDIX_TIP, ABDOMEN_FLOOR } from './anatomy.js?v=1902c96a72';

// The ascites volume the figure draws. The model's volume trickles in or out on every update, by a fraction of a mL; drawn
// as it comes, each trickle counted as the fluid moving, and repainted the whole picture ten or more times a second. The
// drawn volume moves only once the model's has moved FLUID_STEP mL from it (under a tenth of a pixel of surface, fully
// zoomed in), so a slow drift still lands when it adds up, and an empty abdomen is reached exactly.
export const FLUID_STEP = 0.1;   // mL

/** The volume to draw next: `drawn` (the last one drawn, null at first) unless the model's `v` has moved a step from it. */
export const fluidTarget = (drawn, v, step = FLUID_STEP) => (drawn === null || Math.abs(v - drawn) >= step || (v === 0 && drawn !== 0) ? v : drawn);

// The pool the figure draws, as a share of its full look: none while the readout grades the belly "None" (under 150 mL,
// shown as 0.0 or 0.1 L), fading in over the next 150 mL. Drawn from the first mL, a refilling belly showed a pool (and,
// with the belly selected, a solid highlight of it) while the Ascites test read 0.0 L "None".
export const POOL_MIN = 150;   // mL
export const poolFade = (v) => Math.min(1, Math.max(0, (v - POOL_MIN) / 150));

// How high the pool stands at volume `v` (mL), on the drawn scale (volume^0.6, then slow off the floor so a small pool stays a
// thin layer): its height above the level it rises from (h), its ripple's amplitude, and that level (floor). An empty belly's
// level is POOL_GAP below the appendix's drawn tip (anatomy.js APPENDIX_TIP: the same path and world space the stage draws it
// in), so the first pool lies wholly under the appendix; the level then rises with the pool to the cavity's old floor by the
// fullest belly, so the top of the scale does not move. The level moves only with the eased volume, so it never jumps.
export const FLUID_TOP = 485, FLUID_CURVE = 3.2, POOL_GAP = 12;
export const POOL_START = APPENDIX_TIP + POOL_GAP;
export const fluidFloorAt = (h) => POOL_START + (ABDOMEN_FLOOR + 5 - POOL_START) * Math.min(1, h / FLUID_TOP);
export function fluidLevel(v) {
  const uv = Math.pow(Math.min(1, Math.max(0, v / 8500)), 0.6), h = FLUID_TOP * Math.pow(uv, FLUID_CURVE);
  return { h, amp: 2 * Math.min(1, uv * 4), floor: fluidFloorAt(h) };
}
/** The surface's resting height at world x for a pool `h` high: a meniscus that deepens as it fills (no ripple). */
export const fluidBase = (x, h) => { const c = (x - 712) / 400; return fluidFloorAt(h) - h * (0.8 + 0.2 * c * c * Math.min(1, h / FLUID_TOP)); };
