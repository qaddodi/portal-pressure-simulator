// The tortuous collaterals' serpentine (stage-paths.js wiggle), pure: the base wave plus a second harmonic on an incommensurate period
// (WIGGLE_K2 times the base wave number, a ratio that is no whole number, so the two never line up) at a third of the base amplitude
// (visual-style V3): one pure sine read as a spring.
export const WIGGLE_K2 = 2.618, WIGGLE_A2 = 1 / 3;
/** The lateral offset of the wiggle at arc length `d`: amplitude `amp`, envelope `env` (0 … 1), base wave number `k`, phase `seed`. */
export const wiggleAt = (amp, env, d, k, seed) => amp * env * (Math.sin(d * k + seed) + WIGGLE_A2 * Math.sin(d * k * WIGGLE_K2 + seed * 1.9 + 1.3));
