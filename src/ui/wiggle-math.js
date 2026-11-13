// The tortuous collaterals' serpentine (stage-paths.js wiggle), pure: the base wave plus a second harmonic on an incommensurate period
// (WIGGLE_K2 times the base wave number, a ratio that is no whole number, so the two never line up) at a third of the base amplitude
// (visual-style V3): one pure sine read as a spring.
// PARKED at 0 (8 Nov 2026, Mohammad: "the varices look super jagged"): at a third of the amplitude and 2.6 times the wave number the second wave was shorter than
// the path's samples could follow and the strands kinked. It needs a longer period (and the strands sampled finer) before it comes back.
export const WIGGLE_K2 = 2.618, WIGGLE_A2 = 0;
/** The lateral offset of the wiggle at arc length `d`: amplitude `amp`, envelope `env` (0 … 1), base wave number `k`, phase `seed`. */
export const wiggleAt = (amp, env, d, k, seed) => amp * env * (Math.sin(d * k + seed) + WIGGLE_A2 * Math.sin(d * k * WIGGLE_K2 + seed * 1.9 + 1.3));
