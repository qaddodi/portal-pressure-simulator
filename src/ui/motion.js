// The one motion module (production review PR-22, PR-28, 4 Nov 2026): the duration scale, the three curves, and the one Reduce Motion read.
//   durations  D_FLIP, D_SMALL, D_SURFACE (tokens.css --d-flip, --d-small, --d-surface), CAM_MS_MIN/MAX for the camera
//   curves     EASE_ARRIVE, EASE_MOVE, EASE_IN as CSS text; easeArrive, easeMove, easeIn as functions; cssCurve(text) for any other
//   reduced    reduceMotionMQ, the page's one MediaQueryList for prefers-reduced-motion, and reduced() for its current answer
// Policy (docs/ACCESSIBILITY.md): with Reduce Motion a state change is instant and the figure still follows the hand (following is not an
// animation). scripts/rules-lint.mjs keeps new code from reading the media query anywhere else or writing its own ease/lerp/cubic-bezier:
// import from here. (The scales themselves live in ease.js; this module is the name every other file imports.)
export {
  D_FLIP, D_SMALL, D_SURFACE, EASE_ARRIVE, EASE_MOVE, EASE_IN, RISE_PX, CAM_MS_MIN, CAM_MS_MAX,
  easeMove, easeArrive, easeIn, cubicBezier, cssCurve, camMs,
} from './ease.js';

/** The page's one prefers-reduced-motion list (a stand-in with matches:false where there is no matchMedia, as in a unit test). */
export const reduceMotionMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {}, removeEventListener() {} };
/** Whether Reduce Motion is on right now. */
export const reduced = () => reduceMotionMQ.matches;
