// A narrowing and a clot as the figure draws them. The params hold them whole (a slide or a preset sets a clot at 80 % in one write; a
// treatment sets a narrowing back to nothing), and the tube's waist, the clot lying in the lumen and the narrowing's "60 %" were built
// straight from them, so a clot appeared at its full thickness and length in one frame and a narrowing pinched in at once. The lesions
// the figure draws follow the params in a moment (LESION_TAU), so a clot thickens from the wall and lengthens (clot-shape.js already
// makes both smooth in the occlusion) and a waist closes or opens, a slider's drag included.
//
//   const lesions = lesionEase();
//   const p = lesions.view(rawParams, dt, quiet);    // the params with the lesions as drawn now (rawParams itself when they rest)
//   lesions.differs(rawParams);                      // whether they are still on their way
import { D_SMALL } from './ease.js';

/** The time constant of the follow (s): about 90 % of the way in D_SMALL. */
export const LESION_TAU = D_SMALL / 2400;
/** Within this of the params' amount (a fraction of the vessel) it lands. */
export const LESION_SNAP = 0.004;

const step = (cur, goal, dt) => {
  if (cur === goal) return goal;
  const v = cur + (goal - cur) * (1 - Math.exp(-Math.max(0, dt) / LESION_TAU));
  return Math.abs(goal - v) < LESION_SNAP ? goal : v;
};

export function lesionEase() {
  let sten = null, thr = null;   // the amounts as drawn, by vessel (null: nothing drawn yet)
  const goals = (m, drawn) => {
    const out = new Map();
    for (const id of Object.keys(m || {})) out.set(id, m[id] || 0);
    for (const id of Object.keys(drawn || {})) if (!out.has(id)) out.set(id, 0);
    return out;
  };
  const follow = (drawn, raw, dt) => {
    let moving = false;
    const next = {};
    for (const [id, goal] of goals(raw, drawn)) {
      const v = step(drawn[id] ?? 0, goal, dt);
      if (v !== goal) moving = true;
      if (v > 0 || goal > 0) next[id] = v;
    }
    return { next, moving };
  };
  return {
    /**
     * The params with their narrowings and clots as drawn after `dt` seconds more (the same object when both rest on the params'
     * amounts). The first call takes the params as they stand, and so does `quiet` (Reduce Motion).
     */
    view(p, dt = 0, quiet = false) {
      if (!p) return p;
      if (sten === null || quiet) { sten = { ...(p.stenosis || {}) }; thr = { ...(p.thrombus || {}) }; return p; }
      const a = follow(sten, p.stenosis, dt), b = follow(thr, p.thrombus, dt);
      sten = a.next; thr = b.next;
      return a.moving || b.moving ? { ...p, stenosis: { ...sten }, thrombus: { ...thr } } : p;
    },
    /** Whether the lesions as drawn are still on their way to the params'. */
    differs(p) {
      if (sten === null || !p) return false;
      for (const [id, goal] of goals(p.stenosis, sten)) if ((sten[id] ?? 0) !== goal) return true;
      for (const [id, goal] of goals(p.thrombus, thr)) if ((thr[id] ?? 0) !== goal) return true;
      return false;
    },
  };
}
