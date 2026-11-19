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
import { EDGES, STENT_SITES } from '../engine/portal/topology.js';
import { endSiteOf, geomDefault, geomFix, kindOf } from '../engine/portal/stent-geom.js';

/** The time constant of the follow (s): about 90 % of the way in D_SMALL. */
export const LESION_TAU = D_SMALL / 2400;
/** Within this of the params' amount (a fraction of the vessel) it lands. */
export const LESION_SNAP = 0.004;

/** Within this of a stent geometry's number (cm) it lands. */
export const GEOM_SNAP = 0.005;
const GEOM_FIELDS = ['len', 'waist', 'trans', 'red'];   // (red: the waist's share of the diameter, eased like the lengths so a waist closes and opens smoothly)
const STENT_KIND = new Map(EDGES.filter((e) => kindOf(e)).map((e) => [e.id, kindOf(e)]));

const step = (cur, goal, dt, snap = LESION_SNAP) => {
  if (cur === goal) return goal;
  const v = cur + (goal - cur) * (1 - Math.exp(-Math.max(0, dt) / LESION_TAU));
  return Math.abs(goal - v) < snap ? goal : v;
};
// A stent's geometry as the params hold it (a missing leg is its defaults, as the engine reads it: stent-geom.js geomOf), each field made
// whole: the waist and the transitions always fit inside the stent.
const geomGoal = (p, id) => { const k = STENT_KIND.get(id); return k ? geomFix(p?.[id], k) : null; };   // alloc-rare: the lesions' own follow, run when a geometry is still on its way

export function lesionEase() {
  let sten = null, thr = null, geo = null, geoRaw, geoRest = false, siteU = null, siteKey = [null, null, null], siteRest = false;   // the amounts as drawn, by vessel (null: nothing drawn yet); the stents' geometry as drawn, by stent
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
  // The stents' waist length, ends and length follow the params the same way (a drag of Waist length, or Abrupt to Tapered, is a number that
  // eases, so the drawn waist grows and the pressure colour's step slides, never pops). A leg the params lack is the stent's defaults,
  // the same the engine eases from; one that lands on its defaults leaves the record.
  const geoFollow = (drawn, raw, dt) => {
    let moving = false;
    const next = {};
    const ids = new Set([...Object.keys(raw || {}), ...Object.keys(drawn || {})]);
    for (const id of ids) {
      const goal = geomGoal(raw, id), cur = goal && geomFix(drawn?.[id], STENT_KIND.get(id));
      if (!goal) continue;
      const o = {};
      let same = true;
      for (const f of GEOM_FIELDS) { o[f] = step(cur[f], goal[f], dt, GEOM_SNAP); if (o[f] !== goal[f]) moving = true; if (o[f] !== geomDefault(STENT_KIND.get(id))[f]) same = false; }
      if (!same || raw?.[id]) next[id] = o;
    }
    return { next, moving };
  };
  // (The geometry the last call worked from, and that it rested on it: the params' record is replaced when a number changes, so the same record at rest is nothing to do, and no frame at rest makes anything.)
  const geoDiffers = (raw, drawn) => {
    if (raw === geoRaw && geoRest) return false;
    for (const id of new Set([...Object.keys(raw || {}), ...Object.keys(drawn || {})])) {
      const goal = geomGoal(raw, id);
      if (!goal) continue;
      const cur = goal && geomFix(drawn?.[id], STENT_KIND.get(id));
      for (const f of GEOM_FIELDS) if (cur[f] !== goal[f]) return true;
    }
    return false;
  };
  // Where a stent's end stenosis sits eases too (Proximal to Distal: stent-geom.js endSiteOf; the waist is always mid stent),
  // so the stenosis and the clamp's arrows glide along the stent instead of jumping from one end to the other. A narrowing that comes stands where it is
  // set at once. The drawn site is kept as the fraction of the path, by stent, and handed on as params.stentSiteU while it is on its way.
  const siteGoal = (p, id) => STENT_SITES[endSiteOf(p, id)];
  const siteFollow = (p, dt) => {
    let moving = false;
    const next = {};
    for (const id of Object.keys(p.stenosis || {})) {
      if (!STENT_KIND.has(id) || !(p.stenosis[id] > 0)) continue;
      const goal = siteGoal(p, id), v = step(siteU?.[id] ?? goal, goal, dt, 0.002);
      if (v !== goal) moving = true;
      next[id] = v;
    }
    return { next, moving };
  };
  const siteSame = (p) => p.stenosisSite === siteKey[0] && p.stenosis === siteKey[1] && p.stentGeom === siteKey[2];
  return {
    /**
     * The params with their narrowings and clots as drawn after `dt` seconds more (the same object when both rest on the params'
     * amounts). The first call takes the params as they stand, and so does `quiet` (Reduce Motion).
     */
    view(p, dt = 0, quiet = false) {
      if (!p) return p;
      if (sten === null || quiet) { sten = { ...(p.stenosis || {}) }; thr = { ...(p.thrombus || {}) }; geo = { ...(p.stentGeom || {}) }; geoRaw = p.stentGeom; geoRest = true; siteU = siteFollow(p, 0).next; siteKey[0] = p.stenosisSite; siteKey[1] = p.stenosis; siteKey[2] = p.stentGeom; siteRest = true; return p; }
      const a = follow(sten, p.stenosis, dt), b = follow(thr, p.thrombus, dt);
      let gm = false;
      if (!(p.stentGeom === geoRaw && geoRest)) { const c = geoFollow(geo, p.stentGeom, dt); geo = c.next; geoRaw = p.stentGeom; geoRest = !c.moving; gm = c.moving; }
      sten = a.next; thr = b.next;
      // (The narrowings the clots and sliders just changed are in `p`; the site follows them. At rest on the same records it is nothing to do.)
      let sm = false;
      if (!(siteRest && siteSame(p) && !a.moving)) { const c = siteFollow(p, dt); siteU = c.next; sm = c.moving; siteKey[0] = p.stenosisSite; siteKey[1] = p.stenosis; siteKey[2] = p.stentGeom; siteRest = !sm; }
      return a.moving || b.moving || gm || sm ? { ...p, stenosis: { ...sten }, thrombus: { ...thr }, stentGeom: gm ? { ...geo } : p.stentGeom, stentSiteU: sm ? { ...siteU } : undefined } : p;
    },
    /** Whether the lesions as drawn are still on their way to the params'. */
    differs(p) {
      if (sten === null || !p) return false;
      for (const [id, goal] of goals(p.stenosis, sten)) if ((sten[id] ?? 0) !== goal) return true;
      for (const [id, goal] of goals(p.thrombus, thr)) if ((thr[id] ?? 0) !== goal) return true;
      if (geoDiffers(p.stentGeom, geo)) return true;
      for (const id of Object.keys(p.stenosis || {})) if (STENT_KIND.has(id) && p.stenosis[id] > 0 && (siteU?.[id] ?? siteGoal(p, id)) !== siteGoal(p, id)) return true;
      return false;
    },
  };
}
