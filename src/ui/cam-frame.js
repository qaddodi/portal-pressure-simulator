// A slide's camera, framed by name (slide field `cam`). No DOM here: the sums behind presenter.js camBox, kept apart so unit tests
// can load them. The older forms are unchanged; the last two are opt-in.
//
//   cam: 'portal'                                  a region of REGIONS (decks.js)
//   cam: [x0, y0, x1, y1]                          a raw box, anatomy world units
//   cam: ['portal', 'spleen']                      the union of those regions
//   cam: { on: ['PV_TRUNK', 'spleen'] }            what the names point at, with a little room round it
//   cam: { on: ['@collaterals'], near: 'portal' }  that region, grown to take in what is named
//   ('fit', 'lobule…' and 'sinusoid' as before; they are no business of this module.)
//
// `on` takes what a slide's glow takes: a vessel id (PV_TRUNK), an organ (spleen), a term target (varix), a station (CONF, AO) or a
// '@set' (presenter camOn). The camera lands on the box the names fill, the same way it lands on a region: centred in the room the
// cards leave and no closer than the slide's kMax.

import { CIRCUIT_ZONES } from './anatomy.js';

// The Circuit view's named regions (circuit world units, x 30-1360, y 30-730; the series row runs along y 345). A circuit slide's `cam` names
// one of these, gives a raw box or says 'fit'; with no `cam`, its `zone` names the region (presenter.js). The zones come from CIRCUIT_ZONES.
const ZB = (i, y0, y1) => [CIRCUIT_ZONES[i][1], y0, CIRCUIT_ZONES[i][2], y1];
export const CIRC_REGIONS = {
  splanchnic: [60, 100, 640, 470],            // the gut beds and the portal veins (zone 'splanchnic')
  portal: ZB(1, 230, 470),
  liver: [600, 225, 1030, 470],               // the sinusoids, with the TIPS lane above them
  hepatic: ZB(3, 230, 470),
  heart: ZB(4, 200, 500),
  series: [440, 230, 1180, 470],              // portal vein to IVC: the span the PPG bracket reads
  gutLiver: [60, 230, 950, 470],              // gut to liver
  collaterals: [380, 90, 1200, 700],          // the liver and the lanes above and below it
  tips: [560, 190, 1060, 470],                // the liver and the stent's lane
};

const box4 = (c) => Array.isArray(c) && c.length === 4 && c.every(Number.isFinite);
const names = (c) => {
  if (!Array.isArray(c) || c.length === 0) return false;
  for (let i = 0; i < c.length; i++) if (!(typeof c[i] === 'string' && c[i])) return false;
  return true;
};

/** The by-name form: { on: [names], near?: region }. */
export const isCamOn = (c) => !!c && typeof c === 'object' && !Array.isArray(c) && Array.isArray(c.on);

/** The smallest box holding all of these boxes (null for none). */
export function unionBox(boxes) {
  if (boxes.length === 0) return null;
  if (boxes.length === 1) return boxes[0];   // (the one box itself, as it always was)
  let x0 = boxes[0][0], y0 = boxes[0][1], x1 = boxes[0][2], y1 = boxes[0][3];
  for (let i = 1; i < boxes.length; i++) {
    const b = boxes[i];
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
  }
  return [x0, y0, x1, y1];   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
}

/** The box a region form frames: a region's name, a raw box, or a list of region names (their union). Null where it names nothing
 *  the plate has (the by-name form frames what its names point at, `near` aside: pass `cam.near`). */
export function regionBox(cam, regions) {
  if (box4(cam)) return cam;
  if (typeof cam === 'string') return regions[cam] || null;
  if (names(cam)) {
    // (The union of the regions the plate has, without a list of them made first: none is null, one is that region itself.)
    let first = null, found = 0, x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    for (let i = 0; i < cam.length; i++) {
      const b = regions[cam[i]];
      if (!b) continue;
      if (found === 0) { first = b; x0 = b[0]; y0 = b[1]; x1 = b[2]; y1 = b[3]; }
      else { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
      found++;
    }
    return found === 0 ? null : found === 1 ? first : [x0, y0, x1, y1];   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
  }
  return null;
}

/** `box` grown to take in `f` with room for its outline's glow (8 % of f's larger side, at least `floor` units: a lone station
 *  or a thin vessel still gets a box to frame). With no box, the room round f alone. */
export function growBox(box, f, floor = 0) {
  if (!f) return box;
  const m = Math.max(0.08 * Math.max(f[2] - f[0], f[3] - f[1]), floor);
  if (!box) return [f[0] - m, f[1] - m, f[2] + m, f[3] + m];   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
  return [Math.min(box[0], f[0] - m), Math.min(box[1], f[1] - m), Math.max(box[2], f[2] + m), Math.max(box[3], f[3] + m)];   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
}

// (The result is one kept object with its four lists, cleared and refilled by each call: the presenter reads it as it frames, at once.)
const NAMES = { organs: [], edges: [], points: [], unknown: [] };
const addNew = (list, id) => { if (!list.includes(id)) list.push(id); };
/** What the names of an `on` list point at, as { organs, edges, points, unknown }. A name is tried as a term target (its vessels and
 *  organ, a station's id too), an organ, a station (its place on the plate), else a vessel id. `unknown` holds a name that is none of
 *  them: a vessel is only known when `ctx.edges` (a Set of ids) is given. ctx: { targets, organs (Set), nodes ({ id: [[x, y], …] }), edges? } */
export function camNames(on, ctx) {
  const out = NAMES;
  out.organs.length = 0; out.edges.length = 0; out.points.length = 0; out.unknown.length = 0;
  for (const n of on) {
    const t = typeof n === 'string' ? ctx.targets[n] : null;
    if (typeof n !== 'string') out.unknown.push(String(n));   // alloc-rare: only a name that is not a string, a slide-data error that deck checks report; never per frame
    else if (t && (t.edges?.length || t.organ)) { if (t.edges) for (const e of t.edges) addNew(out.edges, e); if (t.organ) addNew(out.organs, t.organ); }
    else if (ctx.organs.has(n)) addNew(out.organs, n);
    else if (ctx.nodes[n]?.[0]) out.points.push(ctx.nodes[n][0]);
    else if (!ctx.edges || ctx.edges.has(n)) addNew(out.edges, n);
    else out.unknown.push(n);
  }
  return out;
}

/** What is wrong with a slide's anatomy `cam` (deck checks): its shape, or a region the plate has no name for. A lobule or sinusoid
 *  cam is scale-switch.js's to check. */
export function camProblems(cam, regions) {
  if (cam === undefined || cam === 'fit' || (typeof cam === 'string' && /^(lobule|sinusoid)/.test(cam))) return [];
  if (typeof cam === 'string') return regions[cam] ? [] : [`no region ${cam}`];
  if (box4(cam)) return cam[2] > cam[0] && cam[3] > cam[1] ? [] : ['a box needs x0 < x1 and y0 < y1'];
  if (Array.isArray(cam)) return names(cam) ? cam.filter((r) => !regions[r]).map((r) => `no region ${r}`) : ['a camera list holds region names, or four numbers for a box'];
  if (isCamOn(cam)) {
    const out = Object.keys(cam).filter((k) => k !== 'on' && k !== 'near').map((k) => `unknown field ${k}`);
    if (!names(cam.on)) out.push('on must list at least one name');
    if (cam.near !== undefined && !regions[cam.near]) out.push(`near: no region ${cam.near}`);
    return out;
  }
  return ['a camera is a region, a box, a list of regions, \'fit\' or { on: [names] }'];
}
