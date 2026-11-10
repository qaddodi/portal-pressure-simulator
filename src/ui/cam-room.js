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
import { NODE_POS, EDGE_PATH, LABEL_VESSEL, HIDDEN_EDGES, HIDDEN_NODES, ANAT_HIDDEN_NODES } from './anatomy.js';
import { EDGES } from '../engine/topology.js';
import { flattenPath } from './shape-gl.js';
import { expandIds } from './slide-ext.js';

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
// Every drawn vessel's run is cut once, here at load (the plate's paths and stations are fixed), as one flat list of x, y, x, y…, so
// the camera's walk over a slide (anchorsOf, roomForSlide) asks for them and builds nothing.
const NONE = [];   // (an empty list that is only ever read)
const RUN_FLAT = new Map();
function flatRun(id) {
  const e = EDGE.get(id), a = NODE_POS[e.from]?.[0], b = NODE_POS[e.to]?.[0];
  const d = EDGE_PATH[id] || (a && b ? `M${a[0]} ${a[1]} L ${b[0]} ${b[1]}` : '');
  const flat = [];
  if (d) for (const piece of flattenPath(d, 0.5)) for (let i = 0; i < piece.pts.length; i++) flat.push(piece.pts[i]);
  return flat.length > 2 ? flat : null;
}
for (const e of EDGES) if (shown(e.id)) RUN_FLAT.set(e.id, flatRun(e.id));

// The run as a list of [x, y] points (a fresh one the first time it is asked for, then kept).
const RUNS = new Map();
export function vesselRun(id) {
  if (!shown(id)) return null;
  if (!RUNS.has(id)) {
    const flat = RUN_FLAT.get(id), pts = [];
    if (flat) for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
    RUNS.set(id, pts.length > 1 ? pts : null);
  }
  return RUNS.get(id);
}

// The point a walk found, and the places it has found so far for the anchors it is making (see walk).
const PT = { x: 0, y: 0 };

// The point half way along a run of m points (xy: their x, y, x, y… list), by length (stage.js arcMid), into out.
function middleInto(xy, m, out) {
  let total = 0;
  for (let i = 1; i < m; i++) total += Math.hypot(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
  let run = 0;
  for (let i = 1; i < m; i++) {
    const seg = Math.hypot(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
    if (run + seg >= total / 2 && seg > 0) {
      const u = (total / 2 - run) / seg;
      out.x = xy[2 * i - 2] + (xy[2 * i] - xy[2 * i - 2]) * u; out.y = xy[2 * i - 1] + (xy[2 * i + 1] - xy[2 * i - 1]) * u;
      return out;
    }
    run += seg;
  }
  out.x = xy[0]; out.y = xy[1];
  return out;
}
const XY = [];   // (middleOf's points as a flat list)
/** The point half way along a run, by length (stage.js arcMid). */
export function middleOf(pts) {
  if (!pts.length) return pts[0];
  for (let i = 0; i < pts.length; i++) { XY[2 * i] = pts[i][0]; XY[2 * i + 1] = pts[i][1]; }
  middleInto(XY, pts.length, PT);
  return [PT.x, PT.y];
}

// Where a vessel's middle is, into out (false: the plate does not draw it).
function onVesselInto(id, out) {
  const flat = RUN_FLAT.get(id);
  if (!flat) return false;
  middleInto(flat, flat.length / 2, out);
  return true;
}
// Where a station's callout attaches, into out: the middle of the vessel it names, else the station itself (false: the plate does not draw it).
function stationInto(id, out) {
  if (HIDDEN_NODES.has(id) || ANAT_HIDDEN_NODES.has(id)) return false;
  if (onVesselInto(LABEL_VESSEL[id], out)) return true;
  const p = NODE_POS[id]?.[0];
  if (!p) return false;
  out.x = p[0]; out.y = p[1];
  return true;
}
/** Where a station's callout attaches (stage.js labelAnchor): the middle of the vessel it names, else the station itself; null for a station the plate does not draw. */
export function stationAnchor(id) { return stationInto(id, PT) ? [PT.x, PT.y] : null; }

// The anchors of a slide (see anchorsOf), as the walk finds them: for anchor i its kind AK, what it was made from AR (and AF: the first
// id of a mark), and its places, AC[i] of them from place AO[i] on in the lists QX, QY. Kept between walks and written in place; a consumer
// reads them at once, before anything else walks.
const AK = [], AR = [], AF = [], AO = [], AC = [], QX = [], QY = [];
let AN = 0, QN = 0;
const begin = (kind, ref, first) => { AK[AN] = kind; AR[AN] = ref; AF[AN] = first; AO[AN] = QN; AC[AN] = 0; return AN++; };
const addPlace = (i) => { QX[QN] = PT.x; QY[QN] = PT.y; QN++; AC[i]++; };
const seenIn = (list, upto, id) => { for (let j = 0; j < upto; j++) if (list[j] === id) return true; return false; };
// Two groups of vessels the same once the hidden ones are left out (the key a group is told apart by).
function sameLit(g1, g2) {
  let i = 0, j = 0;
  for (;;) {
    while (i < g1.length && HIDDEN_EDGES.has(g1[i])) i++;
    while (j < g2.length && HIDDEN_EDGES.has(g2[j])) j++;
    if (i >= g1.length || j >= g2.length) return i >= g1.length && j >= g2.length;
    if (g1[i++] !== g2[j++]) return false;
  }
}
function walkMark(m) {
  let i = -1;
  for (const e of expandIds(m.edges || NONE)) {
    if (typeof e !== 'string' || HIDDEN_EDGES.has(e)) continue;
    if (i < 0) { i = begin('mark', m, e); if (onVesselInto(e, PT)) addPlace(i); } else if (m.free && onVesselInto(e, PT)) addPlace(i);
  }
}
function walkLabel(id) {
  if (HIDDEN_NODES.has(id) || ANAT_HIDDEN_NODES.has(id)) return;
  const i = begin('label', id, null);
  if (stationInto(id, PT)) addPlace(i);
}
function walkReading(k) {
  if (!SITE_NODE[k]) return;
  const i = begin('reading', k, null);
  if (stationInto(SITE_NODE[k], PT)) addPlace(i);
}
function walkGroup(g) {
  let n = 0;
  for (let q = 0; q < g.length; q++) if (!HIDDEN_EDGES.has(g[q])) n++;
  if (!n) return;
  for (let j = 0; j < AN; j++) if (AK[j] === 'lit vessels' && sameLit(AR[j], g)) return;
  const i = begin('lit vessels', g, null);
  for (let q = 0; q < g.length; q++) if (!HIDDEN_EDGES.has(g[q]) && onVesselInto(g[q], PT)) addPlace(i);
}
// Everything a slide points at, in the order anchorsOf lists it (a label or site named twice is one anchor, as a Set made it).
function walk(s, tg) {
  AN = 0; QN = 0;
  if (s.marks) { for (const m of s.marks) walkMark(m); } else if (s.mark) walkMark(s.mark);
  const sl = s.labels || NONE, tl = tg.labels;
  for (let i = 0; i < sl.length; i++) if (!seenIn(sl, i, sl[i])) walkLabel(sl[i]);
  for (let i = 0; i < tl.length; i++) if (!seenIn(sl, sl.length, tl[i]) && !seenIn(tl, i, tl[i])) walkLabel(tl[i]);
  for (const g of tg.groups || NONE) walkGroup(g);
  // (A probe on a vessel the plate does not draw, the hepatic artery, is in the data card alone.)
  if (s.tool?.kind === 'doppler' && s.tool.probe !== 'scope') {   // (a scope-sourced Doppler draws no probe, presenter-tools.js)
    const v = s.tool.vessel || 'PV_TRUNK';
    if (onVesselInto(v, PT)) addPlace(begin('probe', v, null));
  }
  const ss = s.sites || NONE, ts = tg.sites;
  for (let i = 0; i < ss.length; i++) if (!seenIn(ss, i, ss[i])) walkReading(ss[i]);
  for (let i = 0; i < ts.length; i++) if (!seenIn(ss, ss.length, ts[i]) && !seenIn(ts, i, ts[i])) walkReading(ts[i]);
}
// An anchor's name, for the walk that says what is missed (never needed by the camera).
function nameOf(i) {
  if (AK[i] === 'mark') return `${AR[i].label || 'mark'} (${AF[i]})`;   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
  if (AK[i] === 'lit vessels') return AR[i].filter((e) => !HIDDEN_EDGES.has(e)).join(' ');   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
  return AR[i];
}

/**
 * Everything a slide points at, as anchors: [{ kind, name, at: [[x, y], …] }]. `tg` is presenter.js slideTargets(s) (its labels
 * and the groups of vessels its terms and glow light). An id the plate does not know comes back as { kind, name, at: [] }.
 * (Fresh lists, for a caller that keeps them: the tests, the authoring walk. The camera uses roomForSlide, which builds none.)
 */
export function anchorsOf(s, tg) {
  walk(s, tg);
  const out = [];   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
  for (let i = 0; i < AN; i++) {
    const at = [];   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
    for (let q = AO[i]; q < AO[i] + AC[i]; q++) at.push([QX[q], QY[q]]);   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
    out.push({ kind: AK[i], name: nameOf(i), at });   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
    AR[i] = AF[i] = null;
  }
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
    const near = a.at.reduce((p, q) => (shortOf(b, q) < shortOf(b, p) ? q : p));   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
    if (shortOf(b, near) > 0) b = [Math.min(b[0], near[0] - ROOM), Math.min(b[1], near[1] - ROOM), Math.max(b[2], near[0] + ROOM), Math.max(b[3], near[1] + ROOM)];   // alloc-rare: framing a slide's camera, once per slide arrival, view change or card grab (presenter.js camBox), never per frame
  }
  return b;
}

// How far (x, y) is outside the box [x0, y0, x1, y1] shrunk by INSET (0 when it is inside).
const shortTo = (x0, y0, x1, y1, x, y) => Math.max(x0 + INSET - x, x - (x1 - INSET), y0 + INSET - y, y - (y1 - INSET), 0);
/**
 * roomFor(box, anchorsOf(s, tg)) written into `out` (four numbers, the caller's, kept: not the box, which may be a region of the plate),
 * walking the slide's anchors without building any; returns out.
 */
export function roomForSlide(box, s, tg, out) {
  walk(s, tg);
  let x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3];
  for (let i = 0; i < AN; i++) {
    const o = AO[i];
    if (AC[i]) {
      let nx = QX[o], ny = QY[o], ns = shortTo(x0, y0, x1, y1, nx, ny);
      for (let q = o + 1; q < o + AC[i]; q++) { const sh = shortTo(x0, y0, x1, y1, QX[q], QY[q]); if (sh < ns) { nx = QX[q]; ny = QY[q]; ns = sh; } }
      if (ns > 0) { x0 = Math.min(x0, nx - ROOM); y0 = Math.min(y0, ny - ROOM); x1 = Math.max(x1, nx + ROOM); y1 = Math.max(y1, ny + ROOM); }
    }
    AR[i] = AF[i] = null;
  }
  out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1;
  return out;
}
