// The pressure profile on a slide (deck visuals V1, package B): tool { kind: 'profile' } draws the slide's pressure from gut
// to heart through the Patients chart's eight stations (anatomy.js PROFILE_PATHS), the healthy line dashed beneath it, the
// liver's stations on a soft band, and the HVPG (sinusoid to hepatic vein) and the PPG (portal vein to IVC) as brackets
// inside the plot, each label inside its bracket (in a band at the plot's foot where it has no clear room) (no wedged ring: Mohammad, 19 Oct, "No need for the wedge circle"). The sinusoid's station shows the wedged
// pressure (WHVP), the reading the HVPG is taken from, so the HVPG bracket is that point less the hepatic vein's (Mohammad,
// 19 Oct); it lies a little under the sinusoid's own pressure, the leak to the central vein (engine.js hvpgTrue). Where the line drops steeply is where the resistance is, so presinusoidal, sinusoidal and postsinusoidal resistance look different.
// tool: { kind: 'profile', from: true } adds the state before this slide's as a faint dotted line ('slide id' for another), named
// on itself "Before", or fromLabel (a few words, such as 'No Rx' or 'Day 0').
// Its numbers are the slide's own (its fingerprint, as the tiles read it: the same on every screen), easing to each new
// state; a what-if slider or compare button moves it with the tiles. The Patients chart (charts.js) is not changed.

import { frame, cancelFrame } from './frame.js';
import { restPass, cancelRest, restAttr } from './rest-pass.js';
import { PROFILE_PATHS } from './anatomy.js';
import { follow2, SHOWN_TAU } from './display-state.js';
import { NODES } from '../engine/topology.js';
import { RATE } from './table-marks.js';
import { monotoneSegs } from './curve-near.js';
import { plotPanel } from './plot-look.js';
import { pressureColor } from './colormap.js';
import { measure } from './glyph-measure.js';
import { hvpgRate, ppgRate } from '../engine/pressure-cuts.js';
import { numWords } from './num-words.js';
import { createSvgGL, svgModel, setWords, setGeo, setPts } from './svg-gl.js';
import { fittedType } from './chart-ctx.js';
import { reduceMotionMQ } from './motion.js';

const PATH = PROFILE_PATHS[0];
export const STATIONS = PATH.nodes;
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
// Short names where the full ones do not fit, then the shortest where those do not (a phone's or a Mac's card): clinical
// short forms, never an ellipsis or a full stop.
// The liver's three stations are named Pre-, Intra- and Post- on every card, one curly brace under them named sinusoidal, so they
// read as pre-, intra- and postsinusoidal and never as three sinusoidal stations (Mohammad, 19 Oct: "curly bracket underneath
// sinusoid and each x axis label is Pre Intra Post"; the hyphens and lower case, his pick the same day); the Intra- station still
// shows the wedged pressure (WHVP).
const LIVER_NAMES = { RPV: 'Pre-', SIN_R: 'Intra-', CV_R: 'Post-' };
export const BRACE_NAME = 'sinusoidal';
export const FULL_NAMES = { ...PATH.names, ...LIVER_NAMES };
export const SHORT_NAMES = { INT: 'Gut', CONF: 'PV', ...LIVER_NAMES, RHV: 'HV', IVCS: 'IVC', RA: 'RA' };
export const TIGHT_NAMES = SHORT_NAMES;
// (Read aloud: the stations' own names, the wedged reading named.)
const SPOKEN = { ...PATH.names, SIN_R: 'Sinusoid (WHVP)' };
// A station's reading where the tiles have one (so its number is the tile's), else the node's own pressure.
const AT_FP = { INT: 'int', CONF: 'pv', SIN_R: 'whvp', CV_R: 'cv', RHV: 'fhvp', IVCS: 'ivc', RA: 'ra' };
export const SPANS = [['hvpg', 'HVPG', 'SIN_R', 'RHV'], ['ppg', 'PPG', 'CONF', 'IVCS']];

// The route's three zones, each on its own soft tint (Mohammad, 22 Oct: "add one that is PRE, change LIVER to INTRA, and add POST", meaning
// pre-, intra- and posthepatic; the words are written out in full so they never read as the Pre- and Post- stations under the axis): before
// the liver (Gut, PV), in it (the stations on the LIVER band that was) and after it (HV, IVC, RA). A zone's name stands in the strip over the
// plot, as wide as it can be set: on one line, else with its letters closer, else on two lines ("PRE" over "HEPATIC"), else on two with
// its letters closer; the same for all three, so no name touches another or leaves its zone. A chart too narrow even for that keeps the
// tints and no names (never a bare PRE or POST, which would read as the Pre- and Post- stations).
export const ZONES = [{ cls: 'ppf-zone ppf-pre', one: 'PRE-HEPATIC', top: 'PRE' }, { cls: 'ppf-zone ppf-liver', one: 'INTRAHEPATIC', top: 'INTRA' },
  { cls: 'ppf-zone ppf-post', one: 'POST-HEPATIC', top: 'POST' }];
export const ZONE_SECOND = 'HEPATIC';
const ZONE_LOOK = ['prof.zone.pre', 'prof.zone.liver', 'prof.zone.post'];   // (the look of each zone's tint, in ZONES' order)
export const ZONE_GAP = 4;
/** The stations each zone covers: [first, last] indexes (none where the path has no liver). */
export function zoneSpans() {
  const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]);
  return i0 < 1 || i1 < i0 || i1 >= STATIONS.length - 1 ? [] : [[0, i0 - 1], [i0, i1], [i1 + 1, STATIONS.length - 1]];
}
// (A name's width: the text and, unless tight, the style's letter-spacing, .06 em a letter: styles/app.css .ppf-zone.)
// (Up to ZONE_MAX px the names are set in the chart's own type, as ever. Past it, on the six ladders' larger charts (Mohammad, 26 Oct: bigger
// type in each chart), they ease down towards ZONE_MIN: the strip over the plot stays one short line, the readings, the stations and the
// brackets grow and the plot does not give up two lines of height to three captions. The numbers (profileGeo's zb, hdr) follow zoneSize.)
export const ZONE_MAX = 16, ZONE_MIN = 13;
/** The room kept over the zones' names, between the band's top edge and the tops of the capitals, in zone-name em (Mohammad, 27 Oct: "the space above is
 *  tight, needs some margin above PRE, INTRA, POST-hepatic"): 0.5 em, about 8 px. */
export const ZONE_TOP = 0.5;
export const zoneSize = (f) => (f <= ZONE_MAX ? f : Math.max(ZONE_MIN, ZONE_MAX - (f - ZONE_MAX) * 0.75));
const zoneW = (t, f, tw, tight) => (zoneSize(f) / f) * (tw(t, 600) + (tight ? 0 : 0.06 * f * t.length));
/** The lines of zone k's name: one, or two ("PRE" over "HEPATIC"). */
const zoneLines = (k, lines) => (lines === 2 ? [ZONES[k].top, ZONE_SECOND] : [ZONES[k].one]);
/** How the three names are set in a chart whose stations stand slot px apart, in type f px: { lines: 1 | 2, tight } (tight: letters closer),
 *  or { lines: 0 } where none fits, each name at least ZONE_GAP px inside its own zone's width. Judged from the chart's width and type
 *  alone, so a chart never changes with its numbers. tw(t, weight): a text's width in px. */
export function zoneFit(slot, f, tw) {
  const sp = zoneSpans();
  for (const [lines, tight] of [[1, false], [1, true], [2, false], [2, true]]) {
    if (sp.every(([a, b], k) => Math.max(...zoneLines(k, lines).map((t) => zoneW(t, f, tw, tight))) + ZONE_GAP <= slot * (b - a + 1))) return { lines, tight };
  }
  return { lines: 0, tight: false };
}
/** The boxes the zone names take over the plot of the chart G (profileGeo), 2 px clear all round: what values, line names and brackets keep out of. */
export function zoneBoxes(G, tw) {
  const { f, zone } = G, zf = zoneSize(f), cap = 0.72 * zf;
  return zone.lines ? zoneSpans().map(([a, b], k) => {
    const m = (G.x(a) + G.x(b)) / 2, hw = Math.max(...zoneLines(k, zone.lines).map((t) => zoneW(t, f, tw, zone.tight))) / 2;
    return [m - hw - 2, m + hw + 2, G.T - G.zb - cap - (zone.lines === 2 ? 1.05 * zf : 0) - 2, G.T - G.zb + 2];
  }) : [];
}

// Where the resistance is, hatched red as the old ladder had it (Mohammad, 21 Oct: "can we add that red block thing that showed where
// the resistance is?"): each stretch from the portal vein on where the pressure falls more than BLOCK_FALL mmHg (the old ladder's
// rule), the block standing on the column of the station the pressure falls from (Mohammad, 22 Oct: "highlight the Pre number/column
// rather than in between"; so the fall from Pre- to Intra- marks Pre-, from Intra- to Post- marks Intra-, from the portal vein to Pre-
// marks the portal vein, and so on), hanging from the reading down to the level of the one it falls to. Where no stretch falls that
// much but the right atrium stands more than BLOCK_FALL over the healthy one, the pressure is held up past it, by the heart: the RA's
// own column, from its reading to zero (the old ladder's block on the RA). The reading, the line and the names are drawn over the
// block, so they stay whole. A healthy chart shows none. (The gut's own stretch, its capillaries to the portal vein, is never a block.)
export const BLOCK_FALL = 4;
/** The blocks of profile p (hl: the healthy one, or null): each stretch's first station index, the last station's for the heart. */
export function blocksOf(p, hl) {
  if (!p) return [];
  const out = [], n = p.v.length - 1;
  for (let i = STATIONS.indexOf('CONF'); i < n; i++) if (p.v[i] - p.v[i + 1] > BLOCK_FALL) out.push(i);
  if (!out.length && hl && p.v[n] - hl.v[n] > BLOCK_FALL) out.push(n);
  return out;
}
/** A block's width: centred on its station's column, as wide as the widest reading (two digits) with NUM_PAD + 3 px each side, so every
 *  block is as wide as the next and a reading's digits changing never moves an edge; never past its column's edge. → [x0, x1] */
export function blockSpan(cx, slot, tw) {
  const hw = Math.min(tw('00', 700) / 2 + NUM_PAD + 3, slot / 2 - 3);
  return [cx - hw, cx + hw];
}
/** Block i's box on the chart G (profileGeo) for profile p ({ v, top }): on station i's column, around its reading (NUM_PAD px over it)
 *  and down to the level of the next reading (the heart's: down to zero). → [x0, x1, y0, y1] */
export function blockBox(G, tw, p, i) {
  const { f } = G, n = p.v.length - 1, yg = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, p.top)) / p.top;
  const [x0, x1] = blockSpan(G.x(i), G.slot, tw), y0 = yg(p.v[i]) - 0.36 * f - NUM_PAD;
  return [x0, x1, y0, i >= n ? Math.max(y0 + 4, G.Z) : Math.max(y0 + 4, yg(p.v[i + 1]) + 0.36 * f)];
}

/** A fingerprint's profile: the eight stations' pressures (mmHg) in order, and its HVPG and PPG as the tiles give them;
 *  null without a fingerprint. */
export function profileOf(fp) {
  if (!fp) return null;
  const P = fp.at?.P;
  const v = STATIONS.map((n) => { const k = AT_FP[n], x = k && Number.isFinite(fp[k]) ? fp[k] : P ? P[NI[n]] : NaN; return Number.isFinite(x) ? +x : NaN; });
  if (v.some((x) => !Number.isFinite(x))) return null;
  return { v, hvpg: fp.hvpg, ppg: fp.ppg };
}

/** The instrument drawn once at its own size (w0 px wide, type f0) and scaled down as one piece to the room W it has: k, never above 1. Its type
 *  stays 12 px at least on the screen: where k would take it under, the picture is drawn in type larger by s (the chart's own layout then keeps
 *  everything clear at that size) and scaled by the same k, so the words come to 12 and the rest is the instrument's. (six site ladders) */
export function chartScale(W, w0, f0, floor = 12.02) {
  const k = Math.min(1, W / w0);
  return { k, s: Math.max(1, floor / (f0 * k)) };
}

/** The axis's top: the highest point of the lines drawn, up to the next 5 (10 over 40), at least 15. */
export const axisTop = (...lines) => {
  const top = Math.max(15, ...lines.filter(Boolean).flatMap((l) => l.v));
  const step = top > 40 ? 10 : 5;
  return Math.ceil(top / step - 1e-9) * step;
};

/** How the station names fit slots px apart, each centred under its own dot on one row: the full names, else the short
 *  ones, else the shortest, each name at least NAME_GAP px from the next; else the shortest eased apart along the row, no
 *  name more than a quarter slot off its dot (nearer its own than its neighbour's); else the wedge station's name alone on
 *  a second row under its dot; two staggered rows only where even that touches (narrower than any card draws it).
 *  tw: a text's width in px. → { names, rows, dx, low } (dx: each name's shift from its dot, px; low: on the second row) */
export const NAME_GAP = 6;
export function nameFit(slot, tw) {
  const [full, short, tight] = [FULL_NAMES, SHORT_NAMES, TIGHT_NAMES].map((m) => STATIONS.map((n) => m[n]));
  const all = STATIONS.map((_, i) => i), none = all.map(() => false), M = slot / 4;
  // The shifts that keep the names at idx (one row, in order) NAME_GAP apart, none more than M off its dot: each pair too
  // close moves apart, half each, until every pair clears; null where they cannot. ease0: centred only.
  const lackOf = (ns, idx, dx, k) => (tw(ns[idx[k - 1]]) + tw(ns[idx[k]])) / 2 + NAME_GAP - (slot * (idx[k] - idx[k - 1]) + dx[k] - dx[k - 1]);
  const clear = (ns, idx, dx) => idx.every((_, k) => !k || lackOf(ns, idx, dx, k) <= 1e-9);
  const ease = (ns, idx, m) => {
    const dx = idx.map(() => 0);
    for (let it = 0; it < 200 && m && !clear(ns, idx, dx); it++) {
      for (let k = 1; k < idx.length; k++) {
        const lack = lackOf(ns, idx, dx, k);
        if (lack <= 0) continue;
        const a = Math.min(lack / 2, dx[k - 1] + m), b = Math.min(lack - a, m - dx[k]);
        dx[k - 1] -= a + Math.min(lack - a - b, dx[k - 1] - a + m); dx[k] += b;
      }
    }
    return clear(ns, idx, dx) ? dx : null;
  };
  const full1 = (dx) => all.map((i) => dx[i]);
  for (const names of [full, short, tight]) if (ease(names, all, 0)) return { names, rows: 1, dx: all.map(() => 0), low: none };
  let dx = ease(tight, all, M);
  if (dx) return { names: tight, rows: 1, dx: full1(dx), low: none };
  // (The wedge station's name alone on a second row under its dot, the rest eased on the first.)
  const si = STATIONS.indexOf('SIN_R'), rest = all.filter((i) => i !== si);
  dx = ease(tight, rest, M);
  if (dx) { const out = all.map(() => 0); rest.forEach((i, k) => { out[i] = dx[k]; }); return { names: tight, rows: 2, dx: out, low: all.map((i) => i === si) }; }
  return { names: tight, rows: 2, dx: all.map(() => 0), low: all.map((i) => i % 2 === 1) };
}

/** The chart's layout for w × h px in type f px: margins, the plot, the name rows and the liver's brace under them. A bracket
 *  whose label fits on one line inside it is one line tall; one too short for that stands its name over its value inside it
 *  (judged from the widest value, 00.0, so nothing changes height while the numbers ease). inside: the HVPG and PPG brackets
 *  stand in the plot where placeBrackets finds them room; else (band) the plot keeps a band at its foot for them, under its zero
 *  line and over its axis, the PPG's lowest. B: the axis; Z: the zero line (B when inside). need: the height the chart takes with
 *  its plot at its smallest, the band kept. */
export function profileGeo(w, h, f, tw, inside = false) {
  const L = Math.ceil(tw('30') + 12), R = w - 10, slot = (R - L) / STATIONS.length, fit = nameFit(slot, tw);
  // (The plot starts a little over 1.4 em under the chart's top: the zones' tints rise over it in a strip that carries their names, the card
  // title stands above the chart in the card's header, and no key row is kept (the healthy line is named on itself, the unit sits in the
  // bottom row). Mohammad, 21 Oct: "better compaction or less wasted space on top". The layouts' box heights (styles/app.css --prof-h) are
  // shorter by the 1.6 em this gave back, so the plot keeps (nearly) its height. The names' baseline zb stands over the plot clear of a
  // reading at the plot's top, and of a block hanging from one (its box and its halo, 2 px over them), so a name never touches them. One line of names, or two where the narrowest
  // zone cannot hold its name; none where even that does not fit, the strip then only a lip over the readings.)
  const zone = zoneFit(slot, f, tw), zb = 0.36 * f + 6, zf = zoneSize(f), hdr = zone.lines ? zb + (0.84 + ZONE_TOP) * zf + (zone.lines === 2 ? 1.05 * zf : 0) : 0.36 * f + 4;
  const T = 0.2 * f + hdr, nameH = fit.rows * 1.25 * f + 0.4 * f;
  const brFit = SPANS.map(([, name, a, b]) => bracketFit(slot * (STATIONS.indexOf(b) - STATIONS.indexOf(a)), name, tw, f));
  const brMode = brFit.map((q) => q.mode), brFs = brFit.map((q) => q.fs);
  const half = brMode.map((m) => (m === 'stack' ? 0.91 : 0.36) * f + 1), bandH = 3 * BR_PAD + 2 * (half[0] + half[1]), band = inside ? 0 : bandH;
  // (The liver's brace and its name under the names: the brace 0.55 em deep, its name's baseline 1 em under its tip.)
  const braceH = 1.85 * f;
  const B = Math.max(T + 3 * f + band, h - nameH - braceH - 0.5 * f), y1 = B - BR_PAD - half[1];
  const x = (i) => L + slot * (i + 0.5);
  return { w, h, f, L, R, T, B, Z: B - band, slot, x, fit, brMode, brFs, inside, zone, zb, hdr, need: T + 3 * f + bandH + nameH + braceH + 0.5 * f,
    braceY: B + nameH - 0.1 * f,
    nameX: (i) => x(i) + fit.dx[i], nameY: (i) => B + 1.05 * f + (fit.low[i] ? 1.25 * f : 0),
    brY: (k) => (k ? y1 : y1 - half[1] - BR_PAD - half[0]) };
}

/** The lines as fine polylines (the smooth curves drawn, not their chords), for the labels to keep clear of. */
export function curveRuns(lines) {
  return lines.map((pts) => {
    const segs = monotoneSegs(pts);
    if (!segs) return pts;
    const out = [pts[0]];
    for (const [x0, y0, ax, ay, bx, by, x1, y1] of segs) for (let k = 1; k <= 10; k++) {
      const t = k / 10, u = 1 - t;
      out.push([u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x1, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y1]);
    }
    return out;
  });
}

/** Does the segment [x0, y0]–[x1, y1] enter the box [bx0, bx1, by0, by1]? (Clipped to the box's x span, then its y span.) */
function segHits([x0, y0], [x1, y1], [bx0, bx1, by0, by1]) {
  if (Math.max(x0, x1) < bx0 || Math.min(x0, x1) > bx1 || Math.max(y0, y1) < by0 || Math.min(y0, y1) > by1) return false;
  if (x1 === x0) return true;
  const yAt = (x) => y0 + (y1 - y0) * (x - x0) / (x1 - x0), xa = Math.max(Math.min(x0, x1), bx0), xb = Math.min(Math.max(x0, x1), bx1);
  const ya = yAt(xa), yb = yAt(xb);
  return Math.max(ya, yb) >= by0 && Math.min(ya, yb) <= by1;
}

/** Do the segments a–b and c–d cross? */
function segsCross([ax, ay], [bx, by], [cx, cy], [dx, dy]) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
}

/** A placer for labels: boxes [x0, x1, y0, y1] (each a word with its halo) inside [top, bottom], [gx, gy] clear of every
 *  box placed before and 1.5 px clear of the given obstacles, and clear of the lines (runs: polylines, each with its weight:
 *  the slide's own line 4, the others 1) by pad px. free(b): nothing in the way; lineCost(b): the weight of the lines it
 *  touches; cost(b): that, or Infinity where it may not go (out of bounds, on a word or a mark). */
export function labelPlacer(runs, obstacles, top, bottom, weights = [], [gx, gy] = [3, 2], pad = 1.2) {
  const segs = runs.flatMap((l, k) => l.slice(1).map((p, i) => [l[i], p, weights[k] ?? 1]));
  const boxes = [];
  const lineCost = (b) => {
    const e = [b[0] - pad, b[1] + pad, b[2] - pad, b[3] + pad], hit = new Set();
    for (const [p, q, wt] of segs) if (!hit.has(wt) && segHits(p, q, e)) hit.add(wt);
    return [...hit].reduce((a, w) => a + w, 0);
  };
  const near = (b) => boxes.some((o) => b[0] < o[1] + gx && o[0] < b[1] + gx && b[2] < o[3] + gy && o[2] < b[3] + gy)
    || obstacles.some((o) => b[0] < o[1] + 1.5 && o[0] < b[1] + 1.5 && b[2] < o[3] + 1.5 && o[2] < b[3] + 1.5);
  const cost = (b) => (b[2] < top || b[3] > bottom || near(b) ? Infinity : lineCost(b));
  // (Where no place may be had: how much it overlaps, counting the gaps, so the least crowded one can be taken.)
  const ov = (b, o, g, h) => Math.max(0, Math.min(b[1], o[1]) - Math.max(b[0], o[0]) + g) * Math.max(0, Math.min(b[3], o[3]) - Math.max(b[2], o[2]) + h);
  const crowd = (b) => (b[2] < top || b[3] > bottom ? 1e9 : 0) + boxes.reduce((a, o) => a + ov(b, o, gx, gy), 0) + obstacles.reduce((a, o) => a + ov(b, o, 2, 2), 0);
  return { boxes, cost, crowd, lineCost, free: (b) => cost(b) === 0, take(b) { boxes.push(b); } };
}

/** Where each value goes: the nearest place to its dot that touches no line (its own, the others, the axis), no other
 *  word and no mark, and that is clearly nearer its own dot than any other point; tried above it, under it and beside it,
 *  at its own height or a little up or down, and shifted along. The values with the fewest such places choose first.
 *  Where a value has none, it sits right beside its own dot across its OWN line only (its halo breaking the line), else
 *  in the least crowded place. pts: [[x, y]] of the line, others: other lines' points, extra: [[x, y]] points off the line
 *  with a value (labels follows pts then extra), dots: [x, y, r], obstacles: more boxes to keep clear of, axis: the
 *  axis line's y. → [{ s: -1 above | 1 under | 0 beside, dx, by }]: the value's middle dx from its point, its baseline
 *  by under it. */
export function valueSides(pts, others, labels, f, tw, top, { bottom = Infinity, left = -Infinity, right = Infinity, extra = [], dots = [], dotR = 0.36 * f, obstacles = [], axis = null } = {}) {
  const lines = [...curveRuns([pts, ...others]), ...(axis == null ? [] : [[[left - 50, axis], [right + 50, axis]]])];
  // (The ceiling holds the digits' ink: their 2 px halo, which draws nothing, may cross it. A value whose dot stands at the
  // very top of the plot (schistosomiasis' gut, 24.1 of 25, on the Mac card) keeps its place over the dot.)
  const all = [...pts, ...extra], cap = 0.72 * f, halo = 2, between = curveRuns(others);
  const place = labelPlacer(lines, [...dots.map(([x, y, r]) => [x - r + 1, x + r - 1, y - r + 1, y + r - 1]), ...obstacles], top - halo, bottom,
    [4, ...others.map(() => 1), 2]);
  // (A word's box: its digits' ink and halo, the baseline by under the point.)
  const boxOf = (i, dx, by) => { const [x, y] = all[i], wd = tw(labels[i]) / 2; return [x + dx - wd - halo, x + dx + wd + halo, y + by - cap - halo, y + by + halo]; };
  const mid = (b) => [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2];
  // (Clearly its own: its middle at most 0.8 of the way to any other point.)
  const mine = (i, b) => { const [cx, cy] = mid(b), d = Math.hypot(cx - all[i][0], cy - all[i][1]);
    return all.every(([ox, oy], j) => j === i || d <= 0.8 * Math.hypot(cx - ox, cy - oy)); };
  const cands = (i) => {
    const wd = tw(labels[i]) / 2, r = dotR + 1.8, st = 0.3 * f, out = [];
    // (Shifted along in sixteenths of its width: on the Mac card's cirrhosis patient the confluence value clears the right
    // portal vein's by 3.7 px at nine sixteenths and misses it by 0.1 px at a half.)
    for (let k = 0; k <= 5; k++) for (const sx of [0, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24].flatMap((m) => [m / 16, -m / 16])]) {
      out.push({ s: -1, dx: sx * wd, by: -r - halo - k * st, pen: 0 });
      out.push({ s: 1, dx: sx * wd, by: r + cap + halo + k * st, pen: 0.25 * f });
    }
    for (let k = -5; k <= 5; k++) for (const sd of [1, -1]) {
      out.push({ s: 0, dx: sd * (r + 1 + wd + halo), by: 0.36 * f + k * st, pen: 0.4 * f });
      out.push({ s: 0, dx: sd * (r + 10 + wd + halo), by: 0.36 * f + k * st, pen: 0.8 * f });   // (past a mark beside it)
    }
    // (A place with another line between the value and its dot reads as that line's: never a clear place, and in the
    // fallbacks after every other.)
    const across = (b) => { const [x, y] = all[i], [cx, cy] = mid(b), q = [Math.max(b[0], Math.min(x, b[1])), Math.max(b[2], Math.min(y, b[3]))];
      return cx === x && cy === y ? false : between.some((l) => l.slice(1).some((p, k) => segsCross(l[k], p, [x, y], q))); };
    return out.map((c) => ({ ...c, b: boxOf(i, c.dx, c.by) })).filter((c) => c.b[0] >= left && c.b[1] <= right)
      .map((c) => ({ ...c, x: across(c.b) })).map((c) => ({ ...c, d: Math.hypot(...mid(c.b).map((v, k) => v - all[i][k])) + c.pen + (c.x ? 10 * f : 0) })).sort((a, b) => a.d - b.d);
  };
  const C = all.map((_, i) => cands(i));
  const ok = (i, c) => !c.x && mine(i, c.b) && place.cost(c.b) === 0;
  const S = C.map((cs, i) => cs.filter((c) => ok(i, c)).slice(0, 80));
  const order = all.map((_, i) => i).filter((i) => S[i].length).sort((a, b) => S[a].length - S[b].length || a - b);
  const rest = all.map((_, i) => i).filter((i) => !S[i].length);
  const sides = [];
  // (First every value in a clear place at once: the fewest choices first, each nearest first, stepping back where a
  // later one finds none left.)
  let steps = 0;
  const fit = (k, order) => {
    if (k === order.length) return true;
    const i = order[k];
    for (const c of S[i]) {
      if (++steps > 20000) return false;
      if (place.cost(c.b) !== 0) continue;
      place.take(c.b);
      // (A place that leaves a later value no clear place of its own is not tried further: on a Mac card where three lines
      // meet at the right, a value over its dot can hem in its three neighbours, and the search ran out of steps finding out.)
      if (order.slice(k + 1).some((j) => !S[j].some((o) => place.cost(o.b) === 0))) { place.boxes.pop(); continue; }
      sides[i] = { s: c.s, dx: c.dx, by: c.by, box: c.b, tier: 0, across: c.x };
      if (fit(k + 1, order)) return true;
      place.boxes.pop();
    }
    return false;
  };
  let placed = fit(0, order), giveUp = [];
  // (Where they cannot all have one, every value but one does, the one with the most choices given up first; it then takes
  // the best place left.)
  for (let j = order.length - 1; !placed && j >= 0; j--) {
    place.boxes.length = 0; steps = 0;
    if (fit(0, order.filter((_, k) => k !== j))) { placed = true; giveUp = [order[j]]; }
  }
  if (!placed) { place.boxes.length = 0; giveUp = order; }
  for (const i of [...giveUp, ...rest]) {
    let c = C[i].find((c) => ok(i, c)), tier = 0;
    // (No clear place, as where three lines crowd a small chart: across its own line only, right by its dot; else across
    // the axis too, under its dot; else across another line, clear of every word; else the least crowded.)
    const by = (c) => !c.x && Math.hypot(...mid(c.b).map((v, k) => v - all[i][k])) < 1.9 * f && mine(i, c.b);
    if (!c) { tier = 1; c = C[i].find((c) => by(c) && place.cost(c.b) === 4); }
    if (!c) { tier = 2; c = C[i].find((c) => by(c) && [2, 6].includes(place.cost(c.b))); }
    // (Across a line, clear of every word, on its own dot's side of the others: a value past another line reads as its.)
    const far = (c) => place.cost(c.b) + (c.x ? 100 : 0);
    if (!c) { tier = 3; c = C[i].filter((c) => mine(i, c.b) && Number.isFinite(place.cost(c.b))).reduce((a, c) => (!a || far(c) < far(a) ? c : a), null); }
    if (!c) tier = 4;
    c ??= C[i].reduce((a, c) => (place.crowd(c.b) + (mine(i, c.b) ? 0 : 1e7) + place.lineCost(c.b) * 1e6 < place.crowd(a.b) + (mine(i, a.b) ? 0 : 1e7) + place.lineCost(a.b) * 1e6 ? c : a), C[i][0]);
    place.take(c.b);
    sides[i] = { s: c.s, dx: c.dx, by: c.by, box: c.b, tier, across: c.x };
  }
  return sides;
}

/** The SVG path of the smooth line through pts (monotone: never overshoots a station). */
export function smoothD(pts) {
  const segs = monotoneSegs(pts), p = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  if (!segs) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${p(x, y)}`).join('');
  return `M${p(pts[0][0], pts[0][1])}` + segs.map(([, , ax, ay, bx, by, x1, y1]) => `C${p(ax, ay)} ${p(bx, by)} ${p(x1, y1)}`).join('');
}

/** A bracket's label, always between its two ends (x0, x1): centred with a gap in the bar where it fits with 8 px of bar each
 *  side ('gap'); else centred between the ends with the bar left out, 4 px clear of each end ('tight'); else its name over its
 *  value, centred, the bar broken round the wider of the two where there is room ('stack'). wd: the label's width on one line;
 *  parts: the name's and the value's widths. → { mode, x (its middle), gap: [x0, x1] (where the bar breaks) | null } */
export const BR_CLEAR = 4;
export function bracketLabel(x0, x1, wd, parts = [wd, 0]) {
  const m = (x0 + x1) / 2, span = x1 - x0;
  if (span - wd >= 26) return { mode: 'gap', x: m, gap: [m - wd / 2 - 5, m + wd / 2 + 5] };
  if (wd <= span - 2 * BR_CLEAR) return { mode: 'tight', x: m, gap: [x0, x1] };
  const ws = Math.max(...parts);
  return { mode: 'stack', x: m, gap: ws + 20 <= span ? [m - ws / 2 - 5, m + ws / 2 + 5] : [x0, x1] };
}

/** How a bracket span px long lays out its label (judged from the widest value, 00, so nothing changes while the numbers ease):
 *  on one line with the bar each side, at the chart's type size f or smaller; else on one line with the bar left out; never under BR_MIN px (Mohammad,
 *  19 Oct: "HVPG can fit in one line inside the bracket, can make it smaller text"); else its name over its value at f.
 *  tw(t, weight): a text's width at f. → { mode (bracketLabel's), fs (the label's type size, px) } */
export const BR_MIN = 12;
export function bracketFit(span, name, tw, f) {
  const wd = tw(`${name} 00`, 700), parts = [tw(name, 600), tw('00', 700)];
  const at = (fs) => bracketLabel(0, span, wd * fs / f, parts.map((q) => q * fs / f)).mode;
  // (The bar showing each side of it first, as the PPG's does, in smaller type where that keeps it (Mohammad, 19 Oct: "the bracket
  // horizontal lines should show for HVPG, if not make it a bit smaller"); else between the ends with the bar left out. Each the
  // largest size, to a tenth of a px, that does it.)
  const size = (room) => Math.min(f, Math.floor(10 * f * room / wd) / 10);
  const fs = size(span - 26);
  if (fs >= BR_MIN && at(fs) === 'gap') return { mode: 'gap', fs };
  // (Too short for 8 px of bar each side of the widest value even at BR_MIN px: the size that keeps BAR_MIN px each side of it, or
  // BR_MIN px, the smallest, so the bar still shows each side of the values that leave it room (oneLineGap; Mohammad, 19 Oct, on
  // 8ebf324: "still no bracket on HVPG").)
  const small = Math.max(BR_MIN, size(span - 2 * (LABEL_PAD + BAR_MIN)));
  if (at(small) !== 'stack') return { mode: 'tight', fs: small };
  return { mode: 'stack', fs: f };
}

/** Where the bar of a bracket from x0 to x1 breaks round a one-line label lw px wide, centred: LABEL_PAD px each side of it, the bar
 *  drawn where BAR_MIN px of it or more shows each side; else [x0, x1] (no bar, the ends only). */
export const LABEL_PAD = 5, BAR_MIN = 4;
export function oneLineGap(x0, x1, lw) {
  const m = (x0 + x1) / 2;
  return (x1 - x0 - lw) / 2 - LABEL_PAD >= BAR_MIN ? [m - lw / 2 - LABEL_PAD, m + lw / 2 + LABEL_PAD] : [x0, x1];
}

/** A curly brace from xa to xb, its back at y0 and its tip d under it at the middle. */
export function braceD(xa, xb, y0, d) {
  const m = (xa + xb) / 2, r = Math.min(d, (xb - xa) / 8), y1 = y0 + d / 2, p = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  return `M${p(xa, y0)}Q${p(xa, y1)} ${p(xa + r, y1)}L${p(m - r, y1)}Q${p(m, y1)} ${p(m, y0 + d)}Q${p(m, y1)} ${p(m + r, y1)}L${p(xb - r, y1)}Q${p(xb, y1)} ${p(xb, y0)}`;
}

// (2 Nov 2026: the chart and the strips are models drawn on the GPU, svg-gl.js: the same tree, of plain elements, never painted by the browser.)
const sv = svgModel;
// The block's hatching: bold diagonal red stripes over a faint red tint (styles/app.css .pz-hb, .pz-hs), as the old ladder's.
const hatchDef = (id, s) => sv('pattern', { id, width: s, height: s, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
  sv('rect', { class: 'pz-hb', 'data-look': 'card.hatch.bg', width: s, height: s }), sv('rect', { class: 'pz-hs', 'data-look': 'card.hatch.stripe', width: s / 2, height: s }));
const one = (v) => (Math.round(v * 10) / 10).toFixed(1);
const lerp = (a, b, k) => a + (b - a) * k;
// (a word's width as Inter sets it, from the GPU atlas's own metrics: no canvas)
const textW = (t, f, wt = 600) => measure(t, `${wt} ${f}px Inter`);

/** (Legacy: the chart writes each value on its dot, numberSides, clear of the zones' names by the strip's own height; this is where the values
 *  would stand beside their dots, kept as the placer's checks use it, with the old LIVER word's box as its one obstacle.)
 *  Where the values go on the chart G (profileGeo) for the profile goal, with the healthy line hl and the earlier one bf
 *  (profiles or null): valueSides's answer. tw(t, weight): a text's width in px. */
export function placeValues(G, tw, goal, hl, bf) {
  const { f } = G, dotR = Math.max(4, 0.36 * f);
  const yg = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]);
  // (The strip over the liver's band, where its name stands, stays clear of values.)
  const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]), cap = 0.72 * f, lw = (tw('LIVER', 600) + 0.3 * f) / 2;
  const overWords = i0 >= 0 ? [[(G.x(i0) + G.x(i1)) / 2 - lw - 2, (G.x(i0) + G.x(i1)) / 2 + lw + 2, G.T - 0.35 * f - cap - 2, G.T - 0.35 * f + 2]] : [];
  const pg = ptsG(goal);
  return valueSides(pg, [hl, bf].filter(Boolean).map(ptsG), goal.v.map(one), f, (t) => tw(t), G.T - 1.3 * f,
    { bottom: G.Z, axis: G.Z, left: G.L + 2, right: G.R + 8, dotR, obstacles: overWords, dots: pg.map(([x, yy]) => [x, yy, dotR + 1]) });
}

/** Each station's value written where its dot would be, a whole number (Mohammad, 19 Oct: "use whole numbers here and put them
 *  instead of the dots with clearance around them"): the line stops NUM_PAD px short of it. → the sides placeValues would give,
 *  each value centred on its point, with its box. */
export const NUM_PAD = 4;
export const whole = (v) => String(Math.round(v));
export function numberSides(G, tw, goal) {
  const { f } = G, yg = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top;
  return goal.v.map((v, i) => {
    const x = G.x(i), y = yg(v), hw = tw(whole(v), 700) / 2;
    return { s: 0, dx: 0, by: 0.36 * f, box: [x - hw, x + hw, y - 0.36 * f, y + 0.36 * f] };
  });
}

/** A case's HVPG and PPG for a phone's pills (Mohammad, 23 Oct: "for the phone view, it should have the HVPG PPG pills"): [{ k, name, v, rate }],
 *  HVPG first, each v the whole mmHg the chart's bracket and pill read and rate the rating of the same cut-offs (table-marks.js RATE), so a
 *  case's pills tint as the chart's do. [] where the fingerprint has no profile. */
export function pillReadings(fp) {
  const p = profileOf(fp);
  return p ? SPANS.filter(([k]) => Number.isFinite(p[k])).map(([k, name]) => ({ k, name, v: whole(p[k]), rate: RATE[k](p[k])[0] })) : [];
}
/** The two readings as pills in the plot's top right (Mohammad, 22 Oct: "add two pills HVPG and PPG ... on top right for each card"):
 *  "HVPG 4" and "PPG 16", each as wide as its name and the widest value (00), so a number changing never moves an edge. → { w: [HVPG's,
 *  PPG's], h, pad } in px. */
export const PILL_GAP = 4;
export function pillSize(G, tw) {
  const { f } = G, pad = 0.6 * f;
  return { w: SPANS.map(([, name]) => tw(`${name} 00`, 700) + 2 * pad), h: 1.5 * f, pad };
}
/** Where the two pills stand on the chart G for the goal profile (hl, bf: the healthy and the earlier line; sides: numberSides; brk: the
 *  brackets' rows, where they are settled first): the nearest place to the plot's top right corner (the slide left plus the slide down, a
 *  row of the two before a column of them) that keeps BR_PAD px clear of every line, dot, reading, block, zone name and bracket. The brackets
 *  and the lines' names then keep clear of them. → [HVPG's box, PPG's box] ([x0, x1, y0, y1]), or null where the plot has no such place. */
export function placePills(G, tw, goal, hl, bf, sides, brk = null) {
  const { f } = G, dotR = Math.max(4, 0.36 * f), { w, h } = pillSize(G, tw);
  const yg = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]);
  const pg = ptsG(goal), runs = curveRuns([pg, ...[hl, bf].filter(Boolean).map(ptsG)]);
  const place = labelPlacer(runs, [], G.T, G.Z - BR_PAD, [], [BR_PAD, BR_PAD], BR_PAD);
  for (const [x, y] of pg) place.take([x - dotR - 1, x + dotR + 1, y - dotR - 1, y + dotR + 1]);
  for (const v of sides || []) if (v?.box) place.take(v.box);
  for (const i of blocksOf(goal, hl)) place.take(blockBox(G, tw, goal, i));
  for (const b of zoneBoxes(G, tw)) place.take(b);
  if (brk) for (const r of [0, 1]) place.take(bracketBox(G, r, brk[r]));
  const row = (x1, y) => [[x1 - w[1] - PILL_GAP - w[0], x1 - w[1] - PILL_GAP, y, y + h], [x1 - w[1], x1, y, y + h]];
  const col = (x1, y) => [[x1 - w[0], x1, y, y + h], [x1 - w[1], x1, y + h + PILL_GAP, y + 2 * h + PILL_GAP]];
  // (The nearest clear place to the corner: the distance is the slide left plus the slide down, a row before a column at the same distance.)
  let best = null;
  for (let dx = 0; dx <= G.R - G.L - Math.min(w[0], w[1]) && (!best || dx < best.d); dx += 3) {
    for (let y = G.T + 3; y <= G.Z - h - 3 && (!best || dx + y - G.T < best.d); y += 2) {
      for (const mk of [row, col]) {
        const bs = mk(G.R - dx, y), d = dx + (y - G.T) + (mk === col ? 0.5 : 0);
        if ((!best || d < best.d) && bs.every((b) => b[0] >= G.L && b[3] <= G.Z - 3 && place.cost(b) === 0)) best = { d, bs };
      }
    }
  }
  return best ? best.bs : null;
}

/** The healthy and earlier lines named on the drawing, not in a key (Mohammad, 19 Oct): each name just over or under its own
 *  line, nearest the line's right end, BR_PAD px clear of every line, dot, value, bracket and the liver's name.
 *  → [{ t, c, x, y }] (x the middle, y the baseline), or null where one has no such place (the key then shows). */
export const NAME_REACH = 3;   // (rows of type a line's name may stand from its line when no place at the line is clear)
export function placeLineNames(G, tw, goal, hl, bf, sides, brk, bfName = 'Before', pills = []) {
  const named = [[hl, 'Healthy', 'hl'], [bf, bfName, 'bf']].filter(([p]) => p);
  if (!named.length) return [];
  const { f } = G, dotR = Math.max(4, 0.36 * f), cap = 0.72 * f;
  const yg = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]);
  const pg = ptsG(goal), runs = curveRuns([pg, ...named.map(([p]) => ptsG(p))]);
  const place = labelPlacer(runs, [], G.T, G.Z - BR_PAD, [], [BR_PAD, BR_PAD], BR_PAD);
  for (const [x, y] of pg) place.take([x - dotR - 1, x + dotR + 1, y - dotR - 1, y + dotR + 1]);
  for (const v of sides || []) if (v?.box) place.take(v.box);
  for (const i of blocksOf(goal, hl)) place.take(blockBox(G, tw, goal, i));   // (clear of the red blocks)
  for (const r of [0, 1]) place.take(bracketBox(G, r, brk ? brk[r] : G.brY(r)));
  for (const b of zoneBoxes(G, tw)) place.take(b);
  for (const b of pills) place.take(b);
  // (A snug placer holding the same boxes, 1 px clear of everything, for a plot too crowded for BR_PAD.)
  const snug = labelPlacer(runs, [], G.T, G.Z - BR_PAD, [], [1, 1], 1);
  place.boxes.forEach((b) => snug.take(b));
  const out = [];
  for (const [, t, c] of named) {
    const run = runs[1 + out.length], w = tw(t, 500);
    let got = null, best = null;
    for (let q = run.length - 1; q >= 0 && !got; q--) {
      const [x, y] = run[q], cx = Math.max(G.L + w / 2 + 2, Math.min(G.R - w / 2, x));
      for (const base of [y - BR_PAD - 1.5, y + BR_PAD + 1.5 + cap]) {
        const b = [cx - w / 2, cx + w / 2, base - cap, base + 0.2 * f];
        if (place.cost(b) === 0) { got = { t, c, x: cx, y: base, b }; break; }
        // (Never a key instead (Mohammad, 21 Oct: "Put healthy on the dashed line and then no need for a legend"): where no place is
        // clear, the least crowded one beside its own line, inside the plot.)
        // (A word or a dot under it is worse than any line through it: "Healthy" was written over RA's "3", Sites 3 on a phone, 31 Oct.)
        const cr = place.crowd(b), k = (cr > 0 ? 1e6 + cr : 0) + 1e4 * place.lineCost(b);
        if (b[2] >= G.T && b[3] <= G.Z && (!best || k < best.k)) best = { t, c, x: cx, y: base, b, k };
      }
    }
    // (No clear place at its own line's side: the nearest one a little further off, over or under the line (up to NAME_REACH rows of type), so the name
    // is not written over the line or a number (Healthy over the line between the 7 and the 5, Circulation 5 on a Mac and Sites 8 on an iPad, 1 Nov); and
    // in a plot too crowded even for that, the nearest place that merely stands clear of every line and word by 1 px. The places clear before are still
    // the ones taken.)
    for (const pl of [place, snug]) {
      for (let k = pl === place ? 1 : 0; k <= NAME_REACH * 2 && !got; k++) {
        for (let q = run.length - 1; q >= 0 && !got; q--) {
          const [x, y] = run[q], cx = Math.max(G.L + w / 2 + 2, Math.min(G.R - w / 2, x));
          for (const base of [y - BR_PAD - 1.5 - 0.5 * f * k, y + BR_PAD + 1.5 + cap + 0.5 * f * k]) {
            const b = [cx - w / 2, cx + w / 2, base - cap, base + 0.2 * f];
            if (pl.cost(b) === 0) { got = { t, c, x: cx, y: base, b }; break; }
          }
        }
      }
    }
    got = got || best;
    if (!got) continue;
    place.take(got.b); snug.take(got.b);
    out.push({ t: got.t, c: got.c, x: got.x, y: got.y });
  }
  return out;
}

/** A bracket's box, its bar at yy (G a profileGeo, r its row): the ticks and the label, a pixel round. */
export function bracketBox(G, r, yy) {
  const [, , a, b] = SPANS[r], { f } = G, x0 = G.x(STATIONS.indexOf(a)), x1 = G.x(STATIONS.indexOf(b));
  const up = G.brMode[r] === 'stack' ? 0.91 * f : 0.36 * f, down = G.brMode[r] === 'stack' ? 0.91 * f : 0.36 * f;
  return [x0 - 1, x1 + 1, yy - up - 1, yy + down + 1];
}

/** Where the HVPG and the PPG brackets stand inside the plot (Mohammad, 19 Oct: "put the HVPG and PPG brackets INSIDE the chart"):
 *  each as low as it can go, at least BR_PAD px from every line (the slide's, the healthy one, the earlier one), dot, value
 *  (sides: placeValues's answer), the zones' names, the pills (given), the axis and each other.
 *  → [yy of the HVPG's bar, yy of the PPG's], or null where the two have no such places (the plot then keeps a band for them). */
export const BR_PAD = 4;
export function placeBrackets(G, tw, goal, hl, bf, sides, prev = null, pills = []) {
  const { f } = G, dotR = Math.max(4, 0.36 * f);
  const yg = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]);
  const pg = ptsG(goal), runs = curveRuns([pg, ...[hl, bf].filter(Boolean).map(ptsG)]);
  const place = labelPlacer(runs, [], G.T, G.Z - BR_PAD, [], [BR_PAD, BR_PAD], BR_PAD);
  for (const [x, y] of pg) place.take([x - dotR - 1, x + dotR + 1, y - dotR - 1, y + dotR + 1]);
  for (const v of sides || []) if (v?.box) place.take(v.box);
  for (const i of blocksOf(goal, hl)) place.take(blockBox(G, tw, goal, i));   // (clear of the red blocks)
  for (const b of zoneBoxes(G, tw)) place.take(b);
  for (const b of pills) place.take(b);
  // (Every clear height for each, then the pair standing lowest that keeps the two apart: under the curve where it has room,
  // else over it.)
  const ys = [0, 1].map((r) => {
    const b0 = bracketBox(G, r, 0), out = [];
    for (let yy = G.Z - BR_PAD - b0[3]; yy >= G.T - b0[2]; yy -= 1) if (place.cost(bracketBox(G, r, yy)) === 0) out.push(yy);
    return out;
  });
  const apart = (p, q) => { const a = bracketBox(G, 0, p), b = bracketBox(G, 1, q); return Math.max(b[0] - a[1], a[0] - b[1], b[2] - a[3], a[2] - b[3]) >= BR_PAD; };
  // (prev: the rows they stand on now, for a new state of the same chart (a what-if slider, the next slide). A bracket whose row is
  // still clear keeps it, so the brackets stay put while the numbers change (Mohammad, 19 Oct: "HVPG and PPG keep jumping up and
  // down"); one that must move takes the clear row nearest its old one.)
  if (prev) {
    const has = (r) => ys[r].some((v) => Math.abs(v - prev[r]) < 0.01), keep = [has(0), has(1)];
    if (keep[0] && keep[1] && apart(prev[0], prev[1])) return prev.slice();
    const near = (r, ok) => ys[r].filter(ok).reduce((a, v) => (a == null || Math.abs(v - prev[r]) < Math.abs(a - prev[r]) ? v : a), null);
    if (keep[1]) { const p = near(0, (v) => apart(v, prev[1])); if (p != null) return [p, prev[1]]; }
    if (keep[0]) { const q = near(1, (v) => apart(prev[0], v)); if (q != null) return [prev[0], q]; }
    let pair = null, d = Infinity;
    for (const p of ys[0]) for (const q of ys[1]) {
      const dd = Math.abs(p - prev[0]) + Math.abs(q - prev[1]);
      if (dd < d && apart(p, q)) { d = dd; pair = [p, q]; }
    }
    if (pair) return pair;
  }
  let best = null;
  for (const q of ys[1]) for (const p of ys[0]) if ((!best || p + q > best[0] + best[1]) && apart(p, q)) { best = [p, q]; break; }
  return best;
}

const FADE_MS = 420;

// ── The chart as a model that stays (2 Nov 2026, zero-allocation pass) ──
// The chart used to be built afresh, tree and strings, in every frame of a glide. Now its pieces are made once for a size (buildModel,
// between frames) and a frame of a glide only writes numbers into them: the places of the line, the readings, the gridlines, the blocks,
// the brackets and the pills (setGeo, setPts), and the words of a reading from a table (numWords). The plan (where the pills, the brackets
// and the lines' names stand) is settled between frames, as the goal changes (draw); each state of a bracket or pill that changes colour
// with its rating is a piece of its own (ok, mid, hi), the one showing at full strength and the others at none, so a rating never asks
// for a look to be read in a frame.
const TONES = ['ok', 'mid', 'hi'], LINE_NAMES = ['hl', 'bf'];
const toneOf = (r) => (r === 'hi' ? 2 : r === 'mid' ? 1 : 0);
const RATES = [hvpgRate, ppgRate];   // (the brackets' and pills' ratings, in SPANS' order)
const V_MAX = 300;   // (a reading's width is tabled to here, a whole mmHg at a time; past it the last one stands)
const whole0 = (v) => { const r = Math.round(v); return r > V_MAX ? V_MAX : r > 0 ? r : 0; };
const SEG_K = 10;   // (steps of a span of the smooth line)
const NS = STATIONS.length;
const PT_MAX = (NS - 1) * SEG_K + 1 + 2;
const mSl = new Float64Array(NS), mTn = new Float64Array(NS), mDx = new Float64Array(NS);
/** The monotone smooth line through the n points (xs, ys) (curve-near.js monotoneSegs's own control points), as a polyline of SEG_K steps a span
 *  written into out; the number of points. Nothing is made. */
function smoothInto(xs, ys, n, out) {
  for (let i = 0; i < n - 1; i++) { mDx[i] = xs[i + 1] - xs[i] || 1e-6; mSl[i] = (ys[i + 1] - ys[i]) / mDx[i]; }
  mTn[0] = mSl[0];
  for (let i = 1; i < n - 1; i++) mTn[i] = mSl[i - 1] * mSl[i] <= 0 ? 0 : (mSl[i - 1] + mSl[i]) / 2;
  mTn[n - 1] = mSl[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (mSl[i] === 0) { mTn[i] = mTn[i + 1] = 0; continue; }
    const a = mTn[i] / mSl[i], b = mTn[i + 1] / mSl[i], h2 = a * a + b * b;
    if (h2 > 9) { const k = 3 / Math.sqrt(h2); mTn[i] = k * a * mSl[i]; mTn[i + 1] = k * b * mSl[i]; }
  }
  out[0] = xs[0]; out[1] = ys[0];
  let q = 1;
  for (let i = 0; i < n - 1; i++) {
    const d = mDx[i] / 3, x0 = xs[i], y0 = ys[i], x1 = xs[i + 1], y1 = ys[i + 1], ax = x0 + d, ay = y0 + mTn[i] * d, bx = x1 - d, by = y1 - mTn[i + 1] * d;
    for (let j = 1; j <= SEG_K; j++) {
      const t = j / SEG_K, u = 1 - t;
      out[2 * q] = u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x1;
      out[2 * q + 1] = u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y1;
      q++;
    }
  }
  return q;
}
/** The ease of a glide begun at a.t0, 0 to 1 over FADE_MS. */
const glideE = (a, now) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (now - a.t0) / FADE_MS)));
const glideX = (a, now) => lerp(a.fx, a.x, glideE(a, now));
const glideY = (a, now) => lerp(a.fy, a.y, glideE(a, now));
const fadeK = (row, now) => (row.from == null ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (now - row.t0) / FADE_MS))));
const blkOp = (b, now) => b.from + (b.a - b.from) * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (now - b.t0) / FADE_MS))));

export function createProfileTool() {
  const el = document.createElement('div');
  el.className = 'pz-prof';
  const gl = createSvgGL(el, { host: 'prof' });
  const reduceMQ = reduceMotionMQ;
  let goal = null, shown = null, ref = null, cfg = { from: null }, ctx0 = null, raf = 0, plan = null, stale = false, size = '', wantMin = null;
  let fSeen = 0;   // (the type size it was drawn at, x100: a zoom the box's own size does not show)
  let S = null, geoNow = null;   // (the model drawn and the layout it was made for)
  // (The numbers a glide writes into, kept: the shown state and the first stage of its filter.)
  const shownO = { v: new Float64Array(NS), hvpg: 0, ppg: 0, top: 15 }, shownWo = { v: new Float64Array(NS), hvpg: 0, ppg: 0, top: 15 };
  // (Each bracket's row as drawn: where it stands, where it stood, and when it began to fade from that one to this one. A bracket that
  // must move fades out where it was as it fades in where it goes, so it never sweeps across the line or the numbers.)
  const rows = [null, null];
  let fading = false;
  // (Where each line's name stands, and where it glides from: a name that must move eases there, never jumps (Mohammad's NEVER SNAP).)
  const nameAt = {};
  // (The same for each pill: where it stands, where it glides from, and when it began.)
  const pillAt = [null, null], pillK = { a: 0, from: 0, t0: 0, boxes: null };
  // (Each block as it fades: its goal, 1 shown or 0 gone, the opacity it fades from, and when it began. A block comes and goes with
  // an ease, never at once.)
  const blkS = STATIONS.map(() => ({ a: 0, from: 0, t0: 0 })), blkLive = new Uint8Array(NS);
  // (A question slide's hold (slide hold: true): the red blocks and the HVPG and PPG brackets stay
  // out, as the answer would be read off them; heldK eases the brackets out and in as a block fades, and the blocks go and come by blkS.)
  let held = false, lastFp = null;
  const heldK = { a: 1, from: 1, t0: 0 };
  // (The numbers drawn: the goal's, eased; the healthy and earlier lines as they are.)
  const healthy = () => profileOf(ctx0?.healthy?.());
  function before() {
    if (!cfg.from || !ctx0) return null;
    const slides = ctx0.slides || ctx0.deck?.slides || [];   // (the slides as shown, the outline first: index counts in them)
    if (typeof cfg.from === 'string') return profileOf(ctx0.fpOf?.(cfg.from));
    for (let j = (ctx0.index ?? 0) - 1; j >= 0; j--) {
      const fp = slides[j]?.id ? ctx0.fpOf?.(slides[j].id) : null;
      if (fp && fp !== ctx0.fp) return profileOf(fp);
    }
    return null;
  }
  // (Drawn at its box's own size, never a size of its own: drawn taller than its box, the picture was scaled down to fit it, its
  // words under 12 px and its values crowded, Sites 4 and 5. Not drawn until the box has a size.)
  // (Read between frames, never in a glide's frame: as the box is observed at a new size, as the card fits, for a new slide's card (a
  // rest pass, rest-pass.js); the frames draw at the size last read. fs: the box's own type size.)
  let sz0 = null, fs0 = 12, measuring = 0;
  const measure0 = () => {
    const w = el.clientWidth, hh = el.clientHeight, z = w ? el.getBoundingClientRect().width / w : 1;
    // (The box's own type size from the chart's looks table: the card's sizes handed over, never read off the page.)
    fs0 = fittedType(el, gl) || 12;
    if (!w || !hh) { sz0 = null; return null; }
    // (Zoomed by the page or an ancestor (the card's own fit leaves the chart unzoomed: styles/app.css): the type is set larger by as
    // much, never under 12 px on the screen.)
    const f = Math.max(fs0, z > 0.2 && z < 1 ? 12 / z : 0);
    gl.setCtx({ px: f });   // (the size the chart is drawn at: an em of its pieces' looks)
    sz0 = [w, hh, f];
    return sz0;
  };
  const size0 = () => sz0;
  const setMin = () => { el.style.minHeight = wantMin; };   // (a rest pass's, between frames)
  // Drawn again, between frames: the plan for the goal, the layout, and the model where its size or layout changed; then the numbers.
  function draw() { layout(); paintNow(performance.now()); gl.paint(); }
  function layout() {
    if (!shown) { gl.clear(); S = null; return; }
    const sz = size0();
    if (!sz) return;
    const [w, hh, f] = sz, tw = (t, wt) => textW(t, f, wt);
    size = `${Math.round(w)}x${Math.round(hh)}`; fSeen = Math.round(f * 100);
    const hl = healthy(), bf = ref;
    // (Each value's place and the brackets' are settled once per state, from where the lines will end up, so they never flip while
    // the lines glide. The brackets stand inside the plot where they clear everything; else in a band at the plot's foot.)
    // (A new state of the same chart at the same size keeps the brackets where they stand while they stay clear, and keeps the band
    // once the plot has needed it, so the plot never changes height under a what-if slider.)
    if (!plan || stale) {
      const old = plan && plan.size === size ? plan : null;
      const band = !!old && !old.inside;
      let g = profileGeo(w, hh, f, tw, true), s = numberSides(g, tw, goal), pl = placePills(g, tw, goal, hl, bf, s);
      let brk = band ? null : placeBrackets(g, tw, goal, hl, bf, s, old?.brk, pl || []);
      // (Where the pills cost the brackets their place in the plot, the brackets keep it and the pills take the nearest clear place left, or stand
      // down where there is none: they repeat the brackets' numbers, and the plot keeps its height.)
      if (!brk && !band) { brk = placeBrackets(g, tw, goal, hl, bf, s, old?.brk, []); pl = brk ? placePills(g, tw, goal, hl, bf, s, brk) : null; }
      if (!brk) { g = profileGeo(w, hh, f, tw); s = numberSides(g, tw, goal); pl = placePills(g, tw, goal, hl, bf, s); }   // (the band at the plot's foot)
      plan = { size, inside: !!brk, sides: s, brk, pills: pl, names: placeLineNames(g, tw, goal, hl, bf, s, brk, cfg.fromLabel, pl || []) };
      // (The pills fade in and out as a block does, and where they stand they glide from where they stood: they never jump.)
      const t1 = performance.now(), had = pillK.a;
      if (pl) {
        pl.forEach(([px0, , py0], k) => {
          const cur = pillAt[k];
          if (!cur || !old || reduceMQ.matches || !had) { pillAt[k] = { x: px0, y: py0, fx: px0, fy: py0, t0: 0 }; return; }
          if (Math.abs(cur.x - px0) < 0.01 && Math.abs(cur.y - py0) < 0.01) return;
          const gx = glideX(cur, t1), gy = glideY(cur, t1);
          pillAt[k] = { x: px0, y: py0, fx: gx, fy: gy, t0: t1 };
        });
        pillK.boxes = pl;
      }
      if (had !== (pl ? 1 : 0)) Object.assign(pillK, { from: !old || reduceMQ.matches ? (pl ? 1 : 0) : blkOp(pillK, t1), a: pl ? 1 : 0, t0: t1 });
      else if (!old) Object.assign(pillK, { from: pillK.a, t0: 0 });
      for (const n of plan.names || []) {
        const cur = nameAt[n.c], t1 = performance.now();
        if (!cur || !old || reduceMQ.matches) { nameAt[n.c] = { x: n.x, y: n.y, fx: n.x, fy: n.y, t0: 0 }; continue; }
        if (Math.abs(cur.x - n.x) < 0.01 && Math.abs(cur.y - n.y) < 0.01) continue;
        const px = glideX(cur, t1), py = glideY(cur, t1);
        nameAt[n.c] = { x: n.x, y: n.y, fx: px, fy: py, t0: t1 };
      }
      stale = false;
      const now = performance.now();
      SPANS.forEach((_, r) => {
        const yy = plan.inside ? plan.brk[r] : profileGeo(w, hh, f, tw).brY(r), cur = rows[r];
        if (!old || !cur || reduceMQ.matches || old.inside !== plan.inside) { rows[r] = { y: yy, from: null, t0: 0 }; return; }
        if (Math.abs(cur.y - yy) < 0.01) return;
        // (Retargeted mid-fade: from the copy showing most, at the opacity it shows, so nothing blinks.)
        const e = cur.from == null ? 1 : fadeK(cur, now), from = e >= 0.5 ? cur.y : cur.from, op = Math.max(e, 1 - e);
        rows[r] = { y: yy, from, t0: now - FADE_MS * Math.acos(2 * op - 1) / Math.PI };
      });
    }
    geoNow = profileGeo(w, hh, f, tw, plan.inside);
    // (A box shorter than the chart at its smallest with the band (a bracket's name over its value takes a taller row) asks for that
    // much: judged from that layout alone, so the box never flips between two heights.)
    const need = profileGeo(w, hh, f, tw).need;
    const cssMin = 11 * fs0, want = need > cssMin + 0.5 ? `${Math.ceil(need)}px` : '';
    // (laid out between frames, never in the frame that drew: the next frame draws in the taller box)
    if (el.style.minHeight !== want && wantMin !== want) { wantMin = want; restPass(setMin); }
    // (Gridlines for the highest the axis may reach while it glides, in steps of eight.)
    const cap = Math.max(16, Math.ceil((Math.max(goal.top, shown.top) / 5 + 2) / 8) * 8), key = `${w}|${hh}|${f.toFixed(3)}|${plan.inside}|${cap}`;
    if (!S || S.key !== key) { S = buildModel(w, hh, f, tw, key, cap); syncPlan(hl, bf, tw); paintNow(performance.now()); gl.show(S.svg); return; }
    syncPlan(hl, bf, tw);
  }
  // What the plan and the profiles hold for the model: the healthy and earlier lines' numbers, the lines' names and the readings' places.
  function syncPlan(hl, bf, tw) {
    const m = S;
    m.hlOn = !!hl; m.bfOn = !!bf;
    for (let i = 0; i < NS; i++) { m.hlV[i] = hl ? hl.v[i] : 0; m.bfV[i] = bf ? bf.v[i] : 0; m.by[i] = plan.sides?.[i]?.by ?? 0.36 * m.f; }
    for (const c of ['hl', 'bf']) m.nameOn[c] = false;
    for (const n of plan.names || []) { m.nameOn[n.c] = true; setWords(m.nameEl[n.c], n.t); }
    const labels = goal.v.map(whole);
    restAttr(m.svg, 'aria-label', `Pressure from gut to heart: ${STATIONS.map((n, i) => `${SPOKEN[n]} ${labels[i]}`).join(', ')} mmHg. HVPG ${whole(goal.hvpg)}, PPG ${whole(goal.ppg)}.`);
    void tw;
  }
  // The pieces of the chart at its size, once (never in a frame): the tree a frame writes its numbers into.
  function buildModel(w, hh, f, tw, key, cap) {
    const G = geoNow, gid = `pzpg-${Math.random().toString(36).slice(2, 8)}`, M = { key, w, hh, f, G, tw, gid, cap };
    M.xs = new Float64Array(NS); M.py = new Float64Array(NS); M.hy = new Float64Array(NS); M.by = new Float64Array(NS);
    M.hlV = new Float64Array(NS); M.bfV = new Float64Array(NS);
    for (let i = 0; i < NS; i++) M.xs[i] = G.x(i);
    M.line = new Float64Array(2 * PT_MAX); M.hbuf = new Float64Array(2 * PT_MAX); M.bbuf = new Float64Array(2 * PT_MAX);
    M.hlOn = false; M.bfOn = false; M.nameOn = { hl: false, bf: false }; M.nameEl = {};
    // (A reading's half-width, bold, for each whole mmHg: where the line stops short of it.)
    M.lab = new Float64Array(V_MAX + 1);
    for (let v = 0; v <= V_MAX; v++) M.lab[v] = tw(String(v), 700) / 2;
    const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]);
    const band = plotPanel(sv, 0, G.T - G.hdr, w, G.B - (G.T - G.hdr), { fill: false });
    const blkRect = ([x0, x1, y0, y1], at = {}) => sv('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: Math.min(4, (x1 - x0) / 2), ...at });
    // (The gradient and the mask of the line: a stop's colour and a hole's place are written each frame.)
    M.stops = STATIONS.map((_, i) => sv('stop', { offset: (i / (NS - 1)).toFixed(3), 'stop-color': pressureColor(0) }));
    M.holes = STATIONS.map(() => sv('rect', { x: 0, y: 0, width: 0, height: 0, rx: NUM_PAD, fill: '#000' }));   // colour-exempt: a mask
    M.bx = []; M.blk = []; M.clip = [];
    for (let i = 0; i < NS; i++) {
      const [bx0, bx1] = blockSpan(G.x(i), G.slot, tw);
      M.bx.push([bx0, bx1]);
      M.blk.push(blkRect([bx0, bx1, 0, 0], { class: 'ppf-blk', 'data-look': 'prof.blk', fill: `url(#${gid}-h)`, opacity: 0 }));
      M.clip.push(blkRect([bx0, bx1, 0, 0]));
    }
    // (The gridlines: as many as the axis may need, each shown or not by its strength.)
    M.gl = []; M.gt = [];
    for (let k = 0; k < cap; k++) {
      const ln = sv('line', { 'data-look': 'plot.grid.line', x1: G.L, x2: G.R, y1: 0, y2: 0 }), tx = k ? sv('text', { 'data-look': 'plot.grid.text', x: G.L - 6, y: 0, 'text-anchor': 'end' }, '') : null;
      M.gl.push(ln); M.gt.push(tx);
    }
    const grid = M.gl.map((ln, k) => sv('g', { class: 'ptk-grid', opacity: 0 }, ln, M.gt[k]));
    M.grid = grid;
    M.hlP = [0, 1].map(() => sv('path', { class: 'ppf-hl', 'data-look': 'prof.hl', d: 'M0 0', mask: `url(#${gid}-m)`, opacity: 0 }));
    M.bfP = [0, 1].map(() => sv('path', { class: 'ppf-bf', 'data-look': 'prof.bf', d: 'M0 0', mask: `url(#${gid}-m)`, opacity: 0 }));
    M.fill = sv('path', { class: 'ppf-fill', 'data-look': 'prof.fill', d: 'M0 0', fill: `url(#${gid})` });
    M.lineP = sv('path', { class: 'ppf-line', 'data-look': 'prof.line', d: 'M0 0', stroke: `url(#${gid})`, mask: `url(#${gid}-m)` });
    M.vt = STATIONS.map((_, i) => sv('text', { class: 'ppf-v', 'data-look': 'prof.v', x: M.xs[i], y: 0, 'text-anchor': 'middle' }, ''));
    for (const c of ['hl', 'bf']) M.nameEl[c] = sv('text', { class: `ppf-lname ${c}`, 'data-look': 'prof.name', x: 0, y: 0, 'text-anchor': 'middle', opacity: 0 }, '');
    // (The brackets: for each of the two, two places (where it stands, where it stood) and in each the three ratings' pieces.)
    M.br = SPANS.map(([k, name, a, b], r) => {
      const x0 = G.x(STATIONS.indexOf(a)), x1 = G.x(STATIONS.indexOf(b)), fs = G.brFs[r], z = fs / f, stack = G.brMode[r] === 'stack', mid = (x0 + x1) / 2;
      const gap = new Float64Array(2 * (V_MAX + 1));   // (where the bar breaks round each whole reading)
      for (let v = 0; v <= V_MAX; v++) {
        const s = String(v);
        if (stack) {
          const ws = Math.max(tw(name, 600), tw(s, 700));
          gap[2 * v] = ws + 20 <= x1 - x0 ? mid - ws / 2 - 5 : x0; gap[2 * v + 1] = ws + 20 <= x1 - x0 ? mid + ws / 2 + 5 : x1;
        } else {
          const lw = z * tw(`${name} ${s}`, 700);
          const wide = (x1 - x0 - lw) / 2 - LABEL_PAD >= BAR_MIN;
          gap[2 * v] = wide ? mid - lw / 2 - LABEL_PAD : x0; gap[2 * v + 1] = wide ? mid + lw / 2 + LABEL_PAD : x1;
        }
      }
      const slots = [0, 1].map(() => {
        const buf = new Float64Array(24), tones = TONES.map((rate) => {
          const path = sv('path', { 'data-look': 'prof.br.path', d: 'M0 0' });
          const val = sv('tspan', stack ? { 'data-look': 'prof.tspan', x: mid, dy: (1.1 * f).toFixed(2) } : { 'data-look': 'prof.tspan' }, '0');
          // (A bracket set smaller to fit says so on its words: the look leaves the size alone.)
          const txt = sv('text', { 'data-look': 'prof.br.text', 'font-size': (fs < f - 0.01 ? fs : f).toFixed(2), x: mid, y: 0, 'text-anchor': 'middle' }, sv('tspan', { class: 'k', 'data-look': 'prof.br.k' }, stack ? name : `${name} `), val);
          const gEl = sv('g', { class: 'ppf-br', 'data-rate': rate, 'data-k': k, 'data-mode': G.brMode[r], opacity: 0 }, path, txt);
          return { g: gEl, path, txt, val };
        });
        return { buf, tones };
      });
      return { key: k, x0, x1, fs, stack, mid, gap, slots };
    });
    // (The two pills, a piece for each rating.)
    const ps = pillSize(G, tw);
    M.pill = SPANS.map(([k, name], q) => ({ key: k, w: ps.w[q], h: ps.h, tones: TONES.map((rate) => {
      const rect = sv('rect', { 'data-look': 'prof.pill.rect', x: 0, y: 0, width: ps.w[q], height: ps.h, rx: ps.h / 2 }), val = sv('tspan', { 'data-look': 'prof.tspan' }, '0');
      const txt = sv('text', { 'data-look': 'prof.pill.text', x: 0, y: 0, 'text-anchor': 'middle' }, sv('tspan', { class: 'k', 'data-look': 'prof.pill.k' }, `${name} `), val);
      return { g: sv('g', { class: 'ppf-pill', 'data-rate': rate, 'data-k': k, opacity: 0 }, rect, txt), rect, txt, val };
    }) }));
    M.svg = sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px`, 'aria-label': 'Pressure from gut to heart' },
      sv('defs', {}, band.clip, hatchDef(`${gid}-h`, 8), sv('clipPath', { id: `${gid}-c` }, M.clip), sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: G.x(0), x2: G.x(NS - 1), y1: 0, y2: 0 }, M.stops),
        // (The lines stop NUM_PAD px short of each number written on them.)
        sv('mask', { id: `${gid}-m`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: hh },
          sv('rect', { x: 0, y: 0, width: w, height: hh, fill: '#fff' }),   // colour-exempt: a mask
          M.holes)),
      // The route's three zones on soft tints, each named over the plot (every ladder, every deck: Mohammad, 21 Oct, "return the word liver",
      // 22 Oct, PRE / INTRA / POST written out in full): the names stand in one line, or in two where a zone is too narrow for its name.
      zoneSpans().map(([a, b], k, sp) => {
        const m = (G.x(a) + G.x(b)) / 2, y0 = G.T - G.hdr, ls = zoneLines(k, G.zone.lines);
        const zf = zoneSize(f), tx0 = k ? G.x(a) - G.slot / 2 : 0, tx1 = k < sp.length - 1 ? G.x(b) + G.slot / 2 : w;
        // (A zone's name is set at zoneSize and spaced .06 em, 0 when tight: the look gives its weight and ink, these two are the piece's own.)
        return sv('g', { class: G.zone.tight ? `${ZONES[k].cls} tight` : ZONES[k].cls }, sv('rect', { 'data-look': ZONE_LOOK[k], x: tx0, width: tx1 - tx0, y: y0, height: G.B - y0, 'clip-path': band.url }),
          G.zone.lines ? ls.map((t, j) => sv('text', { 'data-look': 'prof.zone.text', 'font-size': (zf < f - 0.01 ? zf : f).toFixed(2), 'letter-spacing': G.zone.tight ? '0' : '0.06em', x: m, y: G.T - G.zb - (ls.length - 1 - j) * 1.05 * zf, 'text-anchor': 'middle' }, t)) : null);
      }),
      grid,
      // (The unit in the bottom row, at the left, level with the brace's name: Mohammad, 21 Oct, "Remove mmHg from above put it below".)
      sv('text', { class: 'ptk-unit', 'data-look': 'plot.unit', x: 0, y: G.braceY + 1.55 * f }, 'mmHg'),
      M.hlP[0], M.bfP[0], M.fill,
      // The blocks, over the fill and under the line and the readings; the healthy and the earlier lines are drawn again over them, clipped to
      // them, so those show whole too (Mohammad, 22 Oct: the line and the numbers stay visible over the block).
      M.blk,
      sv('g', { 'clip-path': `url(#${gid}-c)` }, M.hlP[1], M.bfP[1]),
      sv('line', { class: 'ppf-axis', 'data-look': 'prof.axis', x1: G.L, x2: G.R, y1: G.B, y2: G.B }),
      M.lineP,
      M.vt,
      M.nameEl.hl, M.nameEl.bf,
      STATIONS.map((n, i) => sv('text', { class: n in LIVER_NAMES ? 'ppf-name liv' : 'ppf-name', 'data-look': 'prof.name', x: G.nameX(i), y: G.nameY(i), 'text-anchor': 'middle' }, G.fit.names[i])),
      // (One brace under Pre, Intra and Post, inside the liver's band, named Sinusoidal under its tip.)
      i0 >= 0 ? sv('g', { class: 'ppf-brace' }, sv('path', { 'data-look': 'prof.brace.path', d: braceD(G.x(i0) - 0.42 * G.slot, G.x(i1) + 0.42 * G.slot, G.braceY, 0.55 * f) }),
        sv('text', { 'data-look': 'prof.brace.text', x: (G.x(i0) + G.x(i1)) / 2, y: G.braceY + 1.55 * f, 'text-anchor': 'middle' }, BRACE_NAME)) : null,
      // The HVPG (sinusoid to hepatic vein) and the PPG (portal vein − IVC) as brackets inside the plot (else in a band at its foot), in
      // their cut-off colours, each label inside its own bracket.
      M.br.flatMap((b) => b.slots.flatMap((s) => s.tones.map((q) => q.g))),
      // The two readings as pills in the plot's top right, tinted as the brackets rate them, over everything else (the plan keeps them clear).
      M.pill.flatMap((p) => p.tones.map((q) => q.g)));
    return M;
  }
  // A frame of a glide: the numbers of every piece at the shown state, at time t. Nothing is made: setGeo and setPts keep numbers and
  // points on the pieces, a reading's words come from a table, and the picture is asked to draw (gl.paint).
  function paintNow(t) {
    const m = S;
    if (!m || !shown) return;
    const G = m.G, f = m.f, top = shown.top, Z = G.Z, Tp = G.T, xs = m.xs, py = m.py, sh = shown.v;
    for (let i = 0; i < NS; i++) {
      const v = sh[i], yv = Z - (Z - Tp) * Math.max(0, Math.min(v, top)) / top;
      py[i] = yv;
      setGeo(m.stops[i], 'stop-color', pressureColor(v));
      // (The reading on its dot, a whole number, and the hole in the line's mask round it.)
      const hw = m.lab[whole0(v)], hole = m.holes[i];
      setWords(m.vt[i], numWords(v, 0)); setGeo(m.vt[i], 'y', yv + m.by[i]);
      setGeo(hole, 'x', xs[i] - hw - NUM_PAD); setGeo(hole, 'y', yv - 0.36 * f - NUM_PAD); setGeo(hole, 'width', 2 * (hw + NUM_PAD)); setGeo(hole, 'height', 0.72 * f + 2 * NUM_PAD);
    }
    // (The line, and its fill closed down to the zero line.)
    const np = smoothInto(xs, py, NS, m.line);
    setPts(m.lineP, m.line, np, false);
    m.line[2 * np] = xs[NS - 1]; m.line[2 * np + 1] = Z; m.line[2 * np + 2] = xs[0]; m.line[2 * np + 3] = Z;
    setPts(m.fill, m.line, np + 2, true);
    // (The healthy and the earlier lines, each drawn twice: whole, and again clipped to the blocks.)
    for (let q = 0; q < 2; q++) {
      const on = q ? m.bfOn : m.hlOn, V = q ? m.bfV : m.hlV, buf = q ? m.bbuf : m.hbuf, els = q ? m.bfP : m.hlP;
      for (let s = 0; s < 2; s++) setGeo(els[s], 'opacity', on ? 1 : 0);
      if (!on) continue;
      for (let i = 0; i < NS; i++) m.hy[i] = Z - (Z - Tp) * Math.max(0, Math.min(V[i], top)) / top;
      const n2 = smoothInto(xs, m.hy, NS, buf);
      setPts(els[0], buf, n2, false); setPts(els[1], buf, n2, false);
    }
    // (The gridlines: every 5 (10 over 40), every other where they would crowd.)
    const step = top > 40 ? 10 : 5, every = (Z - Tp) / (top / step) < 1.3 * f ? 2 * step : step, cnt = Math.floor(top / every) + 1;
    for (let k = 0; k < m.cap; k++) {
      const on = k < cnt, gEl = m.grid[k];
      setGeo(gEl, 'opacity', on ? 1 : 0);
      if (!on) continue;
      const v = Math.max(0, Math.min(k * every, top)), yy = Z - (Z - Tp) * v / top, ln = m.gl[k];
      setGeo(ln, 'y1', yy); setGeo(ln, 'y2', yy);
      // (No 0 on the axis, Mohammad, 27 Oct: "0 is kinda implied"; its line stays.)
      if (k) { const tx = m.gt[k]; setWords(tx, numWords(k * every, 0)); setGeo(tx, 'y', yy + 0.35 * f); }
    }
    // (The blocks showing, each where the shown line falls so it moves with the line as it eases, and how far each has faded in.)
    for (let i = 0; i < NS; i++) {
      const b = blkS[i], op = blkLive[i] ? blkOp(b, t) : 0, rect = m.blk[i], clip = m.clip[i];
      if (op >= 0.005) {
        const y0 = py[i] - 0.36 * f - NUM_PAD, y1 = i >= NS - 1 ? Math.max(y0 + 4, Z) : Math.max(y0 + 4, py[i + 1] + 0.36 * f), x0 = m.bx[i][0], w0 = m.bx[i][1] - x0;
        setGeo(rect, 'y', y0); setGeo(rect, 'height', y1 - y0); setGeo(rect, 'x', x0); setGeo(rect, 'width', w0); setGeo(rect, 'opacity', op < 1 ? op : 1);
        setGeo(clip, 'y', y0); setGeo(clip, 'height', y1 - y0); setGeo(clip, 'x', x0); setGeo(clip, 'width', w0);
      } else { setGeo(rect, 'opacity', 0); setGeo(clip, 'width', 0); setGeo(clip, 'height', 0); }
      if (blkLive[i] && !b.a && t - b.t0 >= FADE_MS) blkLive[i] = 0;
    }
    // (The lines' names, where the glide has them.)
    for (let ci = 0; ci < 2; ci++) {
      const c = LINE_NAMES[ci], e = m.nameEl[c], a = nameAt[c];
      if (m.nameOn[c] && a) { setGeo(e, 'opacity', 1); setGeo(e, 'x', glideX(a, t)); setGeo(e, 'y', glideY(a, t)); } else setGeo(e, 'opacity', 0);
    }
    // (The brackets: a row that moves fades out where it was as it fades in where it goes; held, they ease out.)
    const hk = blkOp(heldK, t);
    for (let r = 0; r < 2; r++) {
      const b = m.br[r], v = shown[b.key], vi = whole0(v), row = rows[r], e = row ? fadeK(row, t) : 1, tone = toneOf(RATES[r](v));
      if (row && row.from != null && e >= 1) row.from = null;
      for (let s = 0; s < 2; s++) {
        const slot = b.slots[s];
        let on = false, yy = 0, op = 0;
        if (row && hk >= 0.005) {
          if (row.from == null) { if (s === 0) { on = true; yy = row.y; op = hk; } }
          else if (s === 0) { on = true; yy = row.from; op = (1 - e) * hk; } else { on = true; yy = row.y; op = e * hk; }
        }
        for (let q = 0; q < 3; q++) setGeo(slot.tones[q].g, 'opacity', on && q === tone ? (op < 1 ? op : 1) : 0);
        if (!on) continue;
        const buf = slot.buf, x0 = b.x0, x1 = b.x1, lo = b.gap[2 * vi], hi = b.gap[2 * vi + 1], q = slot.tones[tone];
        buf[0] = x0; buf[1] = yy - 0.3 * f; buf[2] = x0; buf[3] = yy + 0.3 * f; buf[4] = NaN; buf[5] = 0;
        buf[6] = x1; buf[7] = yy - 0.3 * f; buf[8] = x1; buf[9] = yy + 0.3 * f;
        let n = 5;
        if (!(hi - lo >= x1 - x0 - 0.5)) {   // (the bar, broken round the label)
          buf[10] = NaN; buf[11] = 0; buf[12] = x0; buf[13] = yy; buf[14] = lo; buf[15] = yy; buf[16] = NaN; buf[17] = 0; buf[18] = hi; buf[19] = yy; buf[20] = x1; buf[21] = yy;
          n = 11;
        }
        setPts(q.path, buf, n, false);
        setWords(q.val, numWords(v, 0)); setGeo(q.txt, 'y', b.stack ? yy - 0.19 * f : yy + 0.36 * b.fs);
      }
    }
    // (The two readings as pills in the plot's top right, gliding where they must move.)
    const po = pillK.boxes ? blkOp(pillK, t) : 0;
    for (let k = 0; k < 2; k++) {
      const p = m.pill[k], v = shown[p.key], tone = toneOf(RATES[k](v)), box = pillK.boxes?.[k], at = pillAt[k], on = !!box && po >= 0.005;
      for (let q = 0; q < 3; q++) setGeo(p.tones[q].g, 'opacity', on && q === tone ? (po < 0.995 ? po : 1) : 0);
      if (!on) continue;
      const gx = at ? glideX(at, t) : box[0], gy = at ? glideY(at, t) : box[2], q = p.tones[tone];
      setGeo(q.rect, 'x', gx); setGeo(q.rect, 'y', gy);
      setGeo(q.txt, 'x', gx + (box[1] - box[0]) / 2); setGeo(q.txt, 'y', gy + (box[3] - box[2]) / 2 + 0.36 * f);
      setWords(q.val, numWords(v, 0));
    }
    // (Frames keep coming while anything still fades or glides.)
    fading = (rows[0]?.from != null) || (rows[1]?.from != null) || (nameAt.hl ? t - nameAt.hl.t0 < FADE_MS : false) || (nameAt.bf ? t - nameAt.bf.t0 < FADE_MS : false)
      || (pillAt[0] ? t - pillAt[0].t0 < FADE_MS : false) || (pillAt[1] ? t - pillAt[1].t0 < FADE_MS : false) || t - pillK.t0 < FADE_MS || t - heldK.t0 < FADE_MS;
    for (let i = 0; i < NS && !fading; i++) if (blkLive[i] && t - blkS[i].t0 < FADE_MS) fading = true;
  }
  // (The numbers glide on the shown state's filter, display-state.js follow2, premium-feel R4: the widths', the bar's and the charts' one
  // clock, the same curve at 60 or 120 Hz. shownWo: its first stage. tickAt: the last step's time, 0 at rest.)
  let shownW = null, tickAt = 0;
  const NEAR_V = 0.02, NEAR_TOP = 0.05;
  const copyGoal = (to, from) => { for (let i = 0; i < NS; i++) to.v[i] = from.v[i]; to.hvpg = from.hvpg; to.ppg = from.ppg; to.top = from.top; };
  function tick(now = performance.now()) {
    raf = 0;
    if (!goal) return;
    const dt = tickAt ? Math.min(0.1, Math.max(0, (now - tickAt) / 1000)) : 0;
    tickAt = now;
    let done;
    if (reduceMQ.matches || !shown || !shownW) { if (!shown) shown = shownO; if (!shownW) shownW = shownWo; copyGoal(shown, goal); done = true; }
    else {
      done = true;
      for (let i = 0; i < NS; i++) {
        const r = follow2(shown.v[i], shownW.v[i], goal.v[i], dt, SHOWN_TAU, 0.005);
        shown.v[i] = r.v; shownW.v[i] = r.w;
        if (!(Math.abs(shown.v[i] - goal.v[i]) < NEAR_V && Math.abs(shownW.v[i] - goal.v[i]) < NEAR_V)) done = false;
      }
      let r = follow2(shown.hvpg, shownW.hvpg, goal.hvpg, dt, SHOWN_TAU, 0.005); shown.hvpg = r.v; shownW.hvpg = r.w;
      r = follow2(shown.ppg, shownW.ppg, goal.ppg, dt, SHOWN_TAU, 0.005); shown.ppg = r.v; shownW.ppg = r.w;
      r = follow2(shown.top, shownW.top, goal.top, dt, SHOWN_TAU, 0.005); shown.top = r.v; shownW.top = r.w;
      if (!(Math.abs(shown.top - goal.top) < NEAR_TOP && Math.abs(shownW.top - goal.top) < NEAR_TOP)) done = false;
    }
    if (done) { copyGoal(shown, goal); copyGoal(shownW, goal); tickAt = 0; }
    if (el.isConnected || !done || fading) paintNow(performance.now());
    gl.paint();   // (the picture draws the moved pieces in this same frame)
    if (!done || fading) raf = frame(tick, 'tool-profile');
  }
  function aim(fp) {
    const p = profileOf(fp);
    if (!p) return;
    lastFp = fp;
    ref = before();
    goal = { ...p, top: axisTop(p, healthy(), ref) };
    // (The first state is shown at once; the goals after it are glided to.)
    if (!shown) { shown = shownO; shownW = shownWo; copyGoal(shown, goal); copyGoal(shownW, goal); tickAt = 0; }
    const want = new Set(held ? [] : blocksOf(goal, healthy())), t = performance.now();
    for (let i = 0; i < NS; i++) {
      const a = want.has(i) ? 1 : 0, b = blkLive[i] ? blkS[i] : null;
      if (!b || b.a !== a) { blkS[i].from = reduceMQ.matches ? a : b ? blkOp(b, t) : 0; blkS[i].a = a; blkS[i].t0 = t; blkLive[i] = 1; }
    }
    stale = true;
    if (!sz0) { if (!measuring) measuring = restPass(() => { measuring = 0; if (el.isConnected) measure0(); if (goal && sz0 && el.isConnected) draw(); if (goal && !raf) raf = frame(tick, 'tool-profile'); }); return; }
    // (Planned and drawn at the new goal between frames, the glide's frames then only move the numbers.)
    if (el.isConnected) draw();
    if (!raf) raf = frame(tick, 'tool-profile');
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (el.isConnected) measure0(); if (shown && el.isConnected && size !== `${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`) { plan = null; draw(); } }).observe(el);
  return {
    el,
    /** The card has fitted: drawn again if its zoom, and so the chart's type, is not what it was drawn at (the observer does not see a zoom). */
    refit() { const sz = shown && el.isConnected ? measure0() : null; if (sz && Math.round(sz[2] * 100) !== fSeen) { plan = null; draw(); } },
    /** The slide's options and context (presenter-tools.js show), before its numbers. */
    // (A new slide's card, as the slide is set up: read now the first time, else again between frames. Its first drawing is made there too, at
    // the slide's numbers, and placed with its looks read (svg-gl g.show): the card comes in with the chart already drawn, never empty with it
    // popping in a moment later (Mohammad, 2 Nov 2026, "this arrived empty then flashed the graph").)
    configure(t, ctx) { if (!sz0) measure0(); else if (!measuring) measuring = restPass(() => { measuring = 0; if (el.isConnected) measure0(); });
      cfg = { from: t?.from ?? null, fromLabel: typeof t?.fromLabel === 'string' && t.fromLabel.trim() ? t.fromLabel.trim() : 'Before' }; ctx0 = ctx || null; if (ctx?.fp) aim(ctx.fp); },
    /** The numbers the slide's tiles show: the slide's state, or a what-if slider's or a compare button's. */
    pin(fp) { if (el.isConnected && fp) aim(fp); },
    /** The answer held back (a question slide): no red blocks and no HVPG or PPG brackets, the line and its numbers as they are. On release
     *  they ease in; instant: set at once (the card is still out of sight). */
    hold(on, instant = false) {
      on = !!on;
      const t = performance.now(), a = on ? 0 : 1, now = instant || reduceMQ.matches ? a : blkOp(heldK, t);
      if (on === held && heldK.a === a && (!instant || heldK.from === a)) return;
      held = on; Object.assign(heldK, { a, from: now, t0: instant ? 0 : t });
      if (lastFp) aim(lastFp);
      if (instant) for (let i = 0; i < NS; i++) if (blkLive[i]) { blkS[i].from = blkS[i].a; blkS[i].t0 = 0; }
      if (!raf) raf = frame(tick, 'tool-profile');
    },
    /** Drawn again at once for a type size that changed in a box that did not (the six ladders' scaled copies, presenter.js fitChart). */
    redraw() { if (shown && el.isConnected) { measure0(); plan = null; draw(); } },
    clear() {},
    dispose() { if (raf) cancelFrame(raf); raf = 0; cancelRest(measuring); measuring = 0; gl.dispose(); },
  };
}

/** One case's pressures on one line (Mohammad, 21 Oct: "for phone, we should just make it one line with the red block of course,
 *  similar to what we had before"): a phone's six-case grid draws each case as its eight readings joined by the line, in the chart's
 *  colours, with the chart's red blocks between the readings where the pressure falls (blocksOf); the stations are named once over the
 *  six, by a names-only strip (createProfileStrip(true)), each name over its column. Drawn at its box's own width, lettered at its
 *  own font size (never under 12 px). set(fp, healthy): the case's fingerprint, and the healthy one's (or a function giving it). */
export function createProfileStrip(namesOnly = false) {
  const el = document.createElement('div');
  el.className = namesOnly ? 'pz-pstrip names' : 'pz-pstrip';
  const gl = createSvgGL(el, { host: namesOnly ? 'pstriph' : 'pstrip' });
  let fp = null, hlOf = null, size = '';
  const xOf = (w) => { const slot = (w - 10) / STATIONS.length; return { slot, x: (i) => slot * (i + 0.5) }; };
  function drawStrip() {
    const w = el.clientWidth;
    if (!w) return;
    // (The strip's type size from the looks table: the card's label size, or its cap size over the six, never read off the page; 12 px at least.)
    const f = fittedType(el, gl, 12), tw = (t, wt) => textW(t, f, wt), { slot, x } = xOf(w);
    size = String(Math.round(w));
    const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]);
    if (namesOnly) {
      // (Over the liver's three names, the chart's curly brace named sinusoidal, turned to open down onto them (Mohammad, 21 Oct: "pre,
      // intra, post should have the curly bracket that says sinusoidal on top of it").)
      const fit = nameFit(slot, tw), ends = 1.85 * f, base = ends + 1.05 * f, hh = Math.ceil(base + (fit.rows - 1) * 1.25 * f + 0.3 * f);
      el.style.height = `${hh}px`;
      gl.swap(sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, style: `font-size: ${f.toFixed(2)}px` },
        i0 >= 0 ? sv('g', { class: 'ppf-brace' }, sv('path', { 'data-look': 'prof.brace.path', d: braceD(x(i0) - 0.42 * slot, x(i1) + 0.42 * slot, 0, 0.55 * f), transform: `translate(0 ${ends.toFixed(2)}) scale(1 -1)` }),
          sv('text', { 'data-look': 'prof.brace.text', x: (x(i0) + x(i1)) / 2, y: 0.95 * f, 'text-anchor': 'middle' }, BRACE_NAME)) : null,
        STATIONS.map((n, i) => sv('text', { class: n in LIVER_NAMES ? 'ppf-name liv' : 'ppf-name', 'data-look': 'prof.name', x: x(i) + fit.dx[i], y: base + (fit.low[i] ? 1.25 * f : 0), 'text-anchor': 'middle' }, fit.names[i]))));
      return;
    }
    const p = profileOf(fp);
    if (!p) { gl.clear(); return; }
    const hl = profileOf(typeof hlOf === 'function' ? hlOf() : hlOf), n = p.v.length - 1;
    const hh = Math.ceil(1.9 * f), cy = hh / 2, labels = p.v.map(whole), hw = labels.map((t) => tw(t, 700) / 2), pad = NUM_PAD;
    el.style.height = `${hh}px`;
    const gid = `pzps-${Math.random().toString(36).slice(2, 8)}`;
    const box = (i) => blockSpan(x(i), slot, tw);   // (each block on its station's column, as the chart's)
    gl.swap(sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px`,
      'aria-label': `Pressure from gut to heart: ${STATIONS.map((s, i) => `${SPOKEN[s]} ${labels[i]}`).join(', ')} mmHg.` },
      sv('defs', {}, hatchDef(`${gid}-h`, 7), sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: x(0), x2: x(n), y1: 0, y2: 0 },
        p.v.map((v, i) => sv('stop', { offset: (i / n).toFixed(3), 'stop-color': pressureColor(v) })))),
      // (The chart's three zones on their tints, across the line's full height, so each case shows where the liver is: Mohammad, 21 Oct,
      // "every graph has a background behind the pre, intra, and post numbers"; 22 Oct, a tint before and after it too. Tint only, no
      // names (the names strip over the six carries the brace). Under the blocks, the line and the numbers, a hair apart.)
      zoneSpans().map(([a, b], k) => sv('g', { class: ZONES[k].cls },
        sv('rect', { 'data-look': ZONE_LOOK[k], x: x(a) - slot / 2 + 0.5, y: 0, width: slot * (b - a + 1) - 1, height: hh, rx: 4 }))),
      // (Each block on its station's column, behind the line and the readings, which keep their outline: Mohammad, 22 Oct.)
      blocksOf(p, hl).map((i) => { const [x0, x1] = box(i); return sv('rect', { class: 'ppf-blk', 'data-look': 'prof.blk', x: x0, y: 1, width: x1 - x0, height: hh - 2, rx: Math.min(4, (x1 - x0) / 2), fill: `url(#${gid}-h)` }); }),
      // (The line stops NUM_PAD px short of each reading, as on the chart.)
      sv('path', { class: 'pps-line', 'data-look': 'prof.strip.line', stroke: `url(#${gid})`, d: p.v.slice(0, n).map((_, i) => `M${(x(i) + hw[i] + pad).toFixed(1)} ${cy}H${(x(i + 1) - hw[i + 1] - pad).toFixed(1)}`).join('') }),
      labels.map((t, i) => sv('text', { class: 'pps-v', 'data-look': 'prof.strip.v', x: x(i), y: cy + 0.36 * f, 'text-anchor': 'middle' }, t))));
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (el.isConnected && size !== String(Math.round(el.clientWidth))) drawStrip(); }).observe(el);
  return {
    el,
    set(f0, healthy) { fp = f0; hlOf = healthy; drawStrip(); },
    draw: drawStrip,
  };
}
