// The ascites volume the figure draws. The model's volume trickles in or out on every update, by a fraction of a mL; drawn
// as it comes, each trickle counted as the fluid moving, and repainted the whole picture ten or more times a second. The
// drawn volume moves only once the model's has moved FLUID_STEP mL from it (under a tenth of a pixel of surface, fully
// zoomed in), so a slow drift still lands when it adds up, and an empty abdomen is reached exactly.
export const FLUID_STEP = 0.1;   // mL

/** The volume to draw next: `drawn` (the last one drawn, null at first) unless the model's `v` has moved a step from it. */
export const fluidTarget = (drawn, v, step = FLUID_STEP) => (drawn === null || Math.abs(v - drawn) >= step || (v === 0 && drawn !== 0) ? v : drawn);
