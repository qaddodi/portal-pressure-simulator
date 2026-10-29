// Room for what a slide points at (camera critique, 29 Oct, recommendation A): the camera frames a region of the plate,
// grown to take in the slide's outlined organs (presenter.js camBox), and nothing warned an author when a ring, a label or a
// lit vessel sat outside that frame. Here every thing the slide points at becomes an anchor on the plate, and a frame that
// misses one grows to hold it, with a little room round it. Pure geometry, no DOM: the tests run it over every built-in deck
// (tests/camera-room.test.js), and the presenter's camBox is its one caller.
//
// An anchor is a thing and the places that show it, in world units. It is on screen when ANY of its places is inside the frame
// (a term that lights two vessels shows when either does), so one place far from the frame is not a miss while its sibling is in.
//   mark         the ring and callout, on the middle of the mark's first vessel (a free mark names a group: any of its vessels)
//   label        a station's callout, which hangs from the middle of the vessel it names (anatomy.js LABEL_VESSEL), else the station
//   lit vessels  a glow entry, or the vessels a term in the line lights (presenter.js slideTargets groups)
//   probe        the vessel a Doppler probe lies on
//   reading      a site's pressure pill (a station's reading on the figure)
import { NODE_POS, EDGE_PATH, LABEL_VESSEL, HIDDEN_EDGES, HIDDEN_NODES, ANAT_HIDDEN_NODES } from './anatomy.js?v=1902c96a72';
import { EDGES } from '../engine/topology.js?v=4044766e96';
import { pathCmds, flattenCmds } from './shape-gl.js?v=a5ba46162b';
import { expandIds } from './slide-ext.js?v=3f9a8d7da4';

/** The room kept round an anchor that the frame grows to hold, in world units (a ring and a label's dot need a little air). */
export const ROOM = 28;
/** An anchor within this of the frame's edge counts as outside it: a ring or a label cut by the edge is not on screen. */
export const INSET = 10;

// Station readings on the figure (presenter.js SITE_NODE): the station each hangs from.
const SITE_NODE = { pv: 'CONF', ivc: 'IVCS', ra: 'RA' };
const EDGE = new Map(EDGES.map((e) => [e.id, e]));
const shown = (id) => EDGE.has(id) && !HIDDEN_EDGES.has(id);

// A vessel's drawn centreline in the anatomic view (the plate's own path, or the straight run between its stations), cut into
// short chords; the vessels' small meander (a few units, stage.js) is left out. Null for a vessel the plate does not draw.
const RUNS = new Map();
export function vesselRun(id) {
  if (!shown(id)) return null;
  if (!RUNS.has(id)) {
    const e = EDGE.get(id), a = NODE_POS[e.from]?.[0], b = NODE_POS[e.to]?.[0];
    const d = EDGE_PATH[id] || (a && b ? `M${a[0]} ${a[1]} L ${b[0]} ${b[1]}` : '');
    const pts = d ? flattenCmds(pathCmds(d), 0.5).flatMap((p) => Array.from({ length: p.pts.length / 2 }, (_, i) => [p.pts[2 * i], p.pts[2 * i + 1]])) : [];
    RUNS.set(id, pts.length > 1 ? pts : null);
  }
  return RUNS.get(id);
}

/** The point half way along a run, by length (stage.js arcMid). */
export function middleOf(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (run + seg >= total / 2 && seg > 0) {
      const u = (total / 2 - run) / seg;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
    }
    run += seg;
  }
  return pts[0];
}

const onVessel = (id) => { const r = vesselRun(id); return r ? middleOf(r) : null; };
/** Where a station's callout attaches (stage.js labelAnchor): the middle of the vessel it names, else the station itself; null for a station the plate does not draw. */
export function stationAnchor(id) {
  if (HIDDEN_NODES.has(id) || ANAT_HIDDEN_NODES.has(id)) return null;
  return onVessel(LABEL_VESSEL[id]) || NODE_POS[id]?.[0] || null;
}

/**
 * Everything a slide points at, as anchors: [{ kind, name, at: [[x, y], …] }]. `tg` is presenter.js slideTargets(s) (its labels
 * and the groups of vessels its terms and glow light). An id the plate does not know comes back as { kind, name, at: [] }.
 */
export function anchorsOf(s, tg) {
  const out = [], add = (kind, name, at) => out.push({ kind, name, at: at.filter(Boolean) });
  const marks = s.marks || (s.mark ? [s.mark] : []);
  for (const m of marks) {
    const ids = [...expandIds(m.edges || [])].filter((e) => typeof e === 'string' && !HIDDEN_EDGES.has(e));
    if (ids.length) add('mark', `${m.label || 'mark'} (${ids[0]})`, (m.free ? ids : ids.slice(0, 1)).map(onVessel));
  }
  for (const id of new Set([...(s.labels || []), ...tg.labels])) {
    if (HIDDEN_NODES.has(id) || ANAT_HIDDEN_NODES.has(id)) continue;
    add('label', id, [stationAnchor(id)]);
  }
  const seen = new Set();
  for (const g of tg.groups || []) {
    const ids = g.filter((e) => !HIDDEN_EDGES.has(e)), key = ids.join();
    if (ids.length && !seen.has(key)) { seen.add(key); add('lit vessels', ids.join(' '), ids.map(onVessel)); }
  }
  // (A probe on a vessel the plate does not draw, the hepatic artery, is in the data card alone.)
  if (s.tool?.kind === 'doppler' && vesselRun(s.tool.vessel || 'PV_TRUNK')) add('probe', s.tool.vessel || 'PV_TRUNK', [onVessel(s.tool.vessel || 'PV_TRUNK')]);
  for (const k of new Set([...(s.sites || []), ...tg.sites])) if (SITE_NODE[k]) add('reading', k, [stationAnchor(SITE_NODE[k])]);
  return out;
}

// How far a point is outside a box shrunk by INSET (0 when it is inside).
const shortOf = (b, [x, y]) => Math.max(b[0] + INSET - x, x - (b[2] - INSET), b[1] + INSET - y, y - (b[3] - INSET), 0);
/** The anchors the frame misses, each with how far (units) its nearest place is from being inside: [{ ...anchor, short }]. */
export function missed(box, anchors) {
  return anchors.flatMap((a) => {
    const short = a.at.length ? Math.min(...a.at.map((p) => shortOf(box, p))) : Infinity;
    return short > 0 ? [{ ...a, short }] : [];
  });
}

/** The frame grown to hold every anchor it misses, ROOM round the place nearest to it. Unchanged when it holds them all. */
export function roomFor(box, anchors) {
  let b = box;
  for (const a of anchors) {
    if (!a.at.length) continue;
    const near = a.at.reduce((p, q) => (shortOf(b, q) < shortOf(b, p) ? q : p));
    if (shortOf(b, near) > 0) b = [Math.min(b[0], near[0] - ROOM), Math.min(b[1], near[1] - ROOM), Math.max(b[2], near[0] + ROOM), Math.max(b[3], near[1] + ROOM)];
  }
  return b;
}
