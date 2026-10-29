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

const box4 = (c) => Array.isArray(c) && c.length === 4 && c.every(Number.isFinite);
const names = (c) => Array.isArray(c) && c.length > 0 && c.every((x) => typeof x === 'string' && x);

/** The by-name form: { on: [names], near?: region }. */
export const isCamOn = (c) => !!c && typeof c === 'object' && !Array.isArray(c) && Array.isArray(c.on);

/** The smallest box holding all of these boxes (null for none). */
export const unionBox = (boxes) => boxes.reduce((a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b), null);

/** The box a region form frames: a region's name, a raw box, or a list of region names (their union). Null where it names nothing
 *  the plate has (the by-name form frames what its names point at, `near` aside: pass `cam.near`). */
export function regionBox(cam, regions) {
  if (box4(cam)) return cam;
  if (typeof cam === 'string') return regions[cam] || null;
  if (names(cam)) return unionBox(cam.map((r) => regions[r]).filter(Boolean));
  return null;
}

/** `box` grown to take in `f` with room for its outline's glow (8 % of f's larger side, at least `floor` units: a lone station
 *  or a thin vessel still gets a box to frame). With no box, the room round f alone. */
export function growBox(box, f, floor = 0) {
  if (!f) return box;
  const m = Math.max(0.08 * Math.max(f[2] - f[0], f[3] - f[1]), floor);
  const g = [f[0] - m, f[1] - m, f[2] + m, f[3] + m];
  return box ? unionBox([box, g]) : g;
}

/** What the names of an `on` list point at, as { organs, edges, points, unknown }. A name is tried as a term target (its vessels and
 *  organ, a station's id too), an organ, a station (its place on the plate), else a vessel id. `unknown` holds a name that is none of
 *  them: a vessel is only known when `ctx.edges` (a Set of ids) is given. ctx: { targets, organs (Set), nodes ({ id: [[x, y], …] }), edges? } */
export function camNames(on, ctx) {
  const out = { organs: [], edges: [], points: [], unknown: [] };
  const add = (list, id) => { if (!list.includes(id)) list.push(id); };
  for (const n of on) {
    const t = typeof n === 'string' ? ctx.targets[n] : null;
    if (typeof n !== 'string') out.unknown.push(String(n));
    else if (t && (t.edges?.length || t.organ)) { for (const e of t.edges || []) add(out.edges, e); if (t.organ) add(out.organs, t.organ); }
    else if (ctx.organs.has(n)) add(out.organs, n);
    else if (ctx.nodes[n]?.[0]) out.points.push(ctx.nodes[n][0]);
    else if (!ctx.edges || ctx.edges.has(n)) add(out.edges, n);
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
