// The marks a treatment leaves on the figure (a stent's mesh, a shunt's sutures, the tie on a divided vein, the cross on a closed
// shunt, the splenic patches, the variceal bands) come in and go with a fade, not a pop. The overlays are built again whole whenever
// what they show changes (stage.js updateOverlays), so a mark's shown amount lives here, by a key of its own, across those builds.
//
//   const fade = markFade();
//   fade.begin();                          // a build starts: nothing is wanted yet
//   const a = fade.want('stent:TIPS', { vessel: 'TIPS' });   // the mark is wanted: how much of it shows now (0 … 1, eased)
//   fade.hold('stent:TIPS', el);           // the element built for it, so a mark that goes can be drawn again while it fades
//   fade.end(canLeave);                    // the build is done: marks no longer wanted start to fade out, or go at once
//   fade.step(dt);                         // each frame: { moving, gone } (the elements of marks that finished going)
//
// The first build only shows what is already there (a patient loaded, the page opened): no mark fades in from nothing then.
// A mark fades in over D_SURFACE and out over D_SMALL (a leave takes the step below its entrance).
import { D_SMALL, D_SURFACE } from './ease.js';
import { smooth01 } from './motion.js';

export const MARK_IN_MS = D_SURFACE, MARK_OUT_MS = D_SMALL;
/** The smoothstep every other fade of the figure takes (a clamp's, an organ outline's): motion.js smooth01, the one a time ease goes through. */
export const markEase = smooth01;

export function markFade({ inMs = MARK_IN_MS, outMs = MARK_OUT_MS } = {}) {
  const marks = new Map();   // key → { a (0 … 1 shown), on (wanted), seen (wanted in the build now running), el, meta }
  let built = false;         // a first build has happened: a mark that appears after it fades in
  const stepped = { moving: false, gone: [] };   // what step() returns: one record, written in place at each step (read it before the next one)
  const api = {
    /** A build of the overlays starts. */
    begin() { for (const m of marks.values()) m.seen = false; },
    /**
     * The mark `key` is wanted. meta: what decides whether it may fade out later (see end). instant: it shows whole at once (Reduce Motion).
     * Returns its eased amount (0 … 1).
     */
    want(key, meta = null, instant = false) {
      let m = marks.get(key);
      if (!m) { m = { a: built && !instant ? 0 : 1, on: true, seen: true, el: null, meta }; marks.set(key, m); }
      m.seen = true; m.on = true; m.meta = meta ?? m.meta;
      return markEase(m.a);
    },
    /** The element built for `key` this build (kept, to be drawn again if the mark goes while it fades). */
    hold(key, el) { const m = marks.get(key); if (m) m.el = el; },
    /**
     * The build is done. Each mark that was not wanted in it either fades out (when `canLeave(key, meta, fading)` allows: what it was built on
     * is still there) or goes at once; one already fading out is asked again at each build. Returns [key, element, meta] of the marks
     * fading out, to be drawn again in the new build.
     */
    end(canLeave = () => true) {
      const out = [];
      for (const [key, m] of marks) {
        if (m.seen) continue;
        if (!(m.a > 0 && m.el && canLeave(key, m.meta, !m.on))) { marks.delete(key); continue; }
        m.on = false;
        out.push([key, m.el, m.meta]);
      }
      built = true;
      return out;
    },
    /**
     * Moves every mark toward its goal by `dt` ms. { moving: any still moves, gone: the elements of the marks that have finished going,
     * which leave the list }. (The same record each time, written in place.)
     */
    step(dt, quiet = false) {
      let moving = false;
      const gone = stepped.gone;
      gone.length = 0;
      for (const [key, m] of marks) {
        const goal = m.on ? 1 : 0;
        if (m.a !== goal) {
          m.a = quiet ? goal : goal ? Math.min(1, m.a + dt / inMs) : Math.max(0, m.a - dt / outMs);
          if (m.a !== goal) moving = true;
        }
        if (!m.on && m.a === 0) { if (m.el) gone.push(m.el); marks.delete(key); }
      }
      stepped.moving = moving;
      return stepped;
    },
    /** How much of `key` shows (eased 0 … 1); 1 for a key that is not a mark. */
    amount(key) { const m = marks.get(key); return m ? markEase(m.a) : 1; },
    has: (key) => marks.has(key),
    /** Whether any mark is coming or going now. */
    moving() { for (const m of marks.values()) if (m.a !== (m.on ? 1 : 0)) return true; return false; },
    /** Each mark held, [key, element, amount] (to lay an opacity on the drawn element). */
    each(fn) { for (const [key, m] of marks) if (m.el) fn(key, m.el, markEase(m.a)); },
    /** Every mark and how much of it shows (eased 0 … 1), for tests. */
    amounts() { return Object.fromEntries([...marks].map(([key, m]) => [key, +markEase(m.a).toFixed(3)])); },
    get size() { return marks.size; },
  };
  return api;
}
