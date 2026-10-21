// The pressure profile on a slide (deck visuals V1, package B): tool { kind: 'profile' } draws the slide's pressure from gut
// to heart through the Patients chart's eight stations (anatomy.js PROFILE_PATHS), the healthy line dashed beneath it, the
// liver's stations on a soft band, and the HVPG (sinusoid to hepatic vein) and the PPG (portal vein to IVC) as brackets
// inside the plot, each label inside its bracket (in a band at the plot's foot where it has no clear room) (no wedged ring: Mohammad, 19 Oct, "No need for the wedge circle"). The sinusoid's station shows the wedged
// pressure (WHVP), the reading the HVPG is taken from, so the HVPG bracket is that point less the hepatic vein's (Mohammad,
// 19 Oct); it lies a little under the sinusoid's own pressure, the leak to the central vein (engine.js hvpgTrue). Where the line drops steeply is where the resistance is, so presinusoidal, sinusoidal and postsinusoidal resistance look different.
// tool: { kind: 'profile', from: true } adds the state before this slide's as a faint dotted line ('slide id' for another).
// Its numbers are the slide's own (its fingerprint, as the tiles read it: the same on every screen), easing to each new
// state; a what-if slider or compare button moves it with the tiles. The Patients chart (charts.js) is not changed.

import { PROFILE_PATHS } from './anatomy.js?v=9feb454ba3';
import { NODES } from '../engine/topology.js?v=4044766e96';
import { RATE } from './table-marks.js?v=1dc429fe31';
import { monotoneSegs } from './curve-near.js?v=9ff15157e9';
import { pressureColor } from './colormap.js?v=1092d36abc';

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

/** A fingerprint's profile: the eight stations' pressures (mmHg) in order, and its HVPG and PPG as the tiles give them;
 *  null without a fingerprint. */
export function profileOf(fp) {
  if (!fp) return null;
  const P = fp.at?.P;
  const v = STATIONS.map((n) => { const k = AT_FP[n], x = k && Number.isFinite(fp[k]) ? fp[k] : P ? P[NI[n]] : NaN; return Number.isFinite(x) ? +x : NaN; });
  if (v.some((x) => !Number.isFinite(x))) return null;
  return { v, hvpg: fp.hvpg, ppg: fp.ppg };
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
  // (No key and no title over the plot any more: the healthy line is named on itself, the unit sits in the bottom row (Mohammad, 21 Oct).)
  const keyH = 1.6 * f, T = keyH + 1.5 * f, nameH = fit.rows * 1.25 * f + 0.4 * f;
  const brFit = SPANS.map(([, name, a, b]) => bracketFit(slot * (STATIONS.indexOf(b) - STATIONS.indexOf(a)), name, tw, f));
  const brMode = brFit.map((q) => q.mode), brFs = brFit.map((q) => q.fs);
  const half = brMode.map((m) => (m === 'stack' ? 0.91 : 0.36) * f + 1), bandH = 3 * BR_PAD + 2 * (half[0] + half[1]), band = inside ? 0 : bandH;
  // (The liver's brace and its name under the names: the brace 0.55 em deep, its name's baseline 1 em under its tip.)
  const braceH = 1.85 * f;
  const B = Math.max(T + 3 * f + band, h - nameH - braceH - 0.5 * f), y1 = B - BR_PAD - half[1];
  const x = (i) => L + slot * (i + 0.5);
  return { w, h, f, L, R, T, B, Z: B - band, slot, x, fit, keyH, brMode, brFs, inside, need: T + 3 * f + bandH + nameH + braceH + 0.5 * f,
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
  const place = labelPlacer(lines, [...dots.map(([x, y, r]) => [x - r + 1, x + r - 1, y - r + 1, y + r - 1]), ...obstacles], top, bottom,
    [4, ...others.map(() => 1), 2]);
  const all = [...pts, ...extra], cap = 0.72 * f, halo = 2, between = curveRuns(others);
  // (A word's box: its digits' ink and halo, the baseline by under the point.)
  const boxOf = (i, dx, by) => { const [x, y] = all[i], wd = tw(labels[i]) / 2; return [x + dx - wd - halo, x + dx + wd + halo, y + by - cap - halo, y + by + halo]; };
  const mid = (b) => [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2];
  // (Clearly its own: its middle at most 0.8 of the way to any other point.)
  const mine = (i, b) => { const [cx, cy] = mid(b), d = Math.hypot(cx - all[i][0], cy - all[i][1]);
    return all.every(([ox, oy], j) => j === i || d <= 0.8 * Math.hypot(cx - ox, cy - oy)); };
  const cands = (i) => {
    const wd = tw(labels[i]) / 2, r = dotR + 1.8, st = 0.3 * f, out = [];
    for (let k = 0; k <= 5; k++) for (const sx of [0, ...[1, 2, 3, 4, 5, 6, 8, 10, 12].flatMap((m) => [m / 8, -m / 8])]) {
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
  const S = C.map((cs, i) => cs.filter((c) => ok(i, c)).slice(0, 40));
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
      if (++steps > 4000) return false;
      if (place.cost(c.b) !== 0) continue;
      place.take(c.b);
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

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
const one = (v) => (Math.round(v * 10) / 10).toFixed(1);
const lerp = (a, b, k) => a + (b - a) * k;
let mctx = null;
const textW = (t, f, wt = 600) => {
  if (mctx === null) mctx = (typeof document !== 'undefined' && document.createElement?.('canvas')?.getContext?.('2d')) || false;
  if (!mctx?.measureText) return t.length * f * 0.58;
  mctx.font = `${wt} ${f}px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`;
  return mctx.measureText(t).width;
};

/** Where the values go on the chart G (profileGeo) for the profile goal, with the healthy line hl and the earlier one bf
 *  (profiles or null): valueSides's answer. tw(t, weight): a text's width in px. */
export function placeValues(G, tw, goal, hl, bf) {
  const { f } = G, dotR = Math.max(4, 0.36 * f);
  const yg = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]);
  // (The strip over the liver's band where its name stood stays clear of values, though the name is gone (the brace names the liver,
  // Mohammad, 21 Oct): left open, values moved up into it and others lost their clear places.)
  const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]), cap = 0.72 * f, lw = (tw('LIVER', 600) + 0.3 * f) / 2;
  const overWords = i0 >= 0 ? [[(G.x(i0) + G.x(i1)) / 2 - lw - 2, (G.x(i0) + G.x(i1)) / 2 + lw + 2, G.T - 0.35 * f - cap - 2, G.T - 0.35 * f + 2]] : [];
  const pg = ptsG(goal);
  return valueSides(pg, [hl, bf].filter(Boolean).map(ptsG), goal.v.map(one), f, (t) => tw(t), G.keyH + 0.2 * f,
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

/** The healthy and earlier lines named on the drawing, not in a key (Mohammad, 19 Oct): each name just over or under its own
 *  line, nearest the line's right end, BR_PAD px clear of every line, dot, value, bracket and the liver's name.
 *  → [{ t, c, x, y }] (x the middle, y the baseline), or null where one has no such place (the key then shows). */
export function placeLineNames(G, tw, goal, hl, bf, sides, brk) {
  const named = [[hl, 'Healthy', 'hl'], [bf, 'Before', 'bf']].filter(([p]) => p);
  if (!named.length) return [];
  const { f } = G, dotR = Math.max(4, 0.36 * f), cap = 0.72 * f;
  const yg = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]);
  const pg = ptsG(goal), runs = curveRuns([pg, ...named.map(([p]) => ptsG(p))]);
  const place = labelPlacer(runs, [], G.T, G.Z - BR_PAD, [], [BR_PAD, BR_PAD], BR_PAD);
  for (const [x, y] of pg) place.take([x - dotR - 1, x + dotR + 1, y - dotR - 1, y + dotR + 1]);
  for (const v of sides || []) if (v?.box) place.take(v.box);
  for (const r of [0, 1]) place.take(bracketBox(G, r, brk ? brk[r] : G.brY(r)));
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
        const k = place.crowd(b) + 1e4 * place.lineCost(b);
        if (b[2] >= G.T && b[3] <= G.Z && (!best || k < best.k)) best = { t, c, x: cx, y: base, b, k };
      }
    }
    got = got || best;
    if (!got) continue;
    place.take(got.b);
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
 *  (sides: placeValues's answer), the liver's name, the axis and each other.
 *  → [yy of the HVPG's bar, yy of the PPG's], or null where the two have no such places (the plot then keeps a band for them). */
export const BR_PAD = 4;
export function placeBrackets(G, tw, goal, hl, bf, sides, prev = null) {
  const { f } = G, dotR = Math.max(4, 0.36 * f);
  const yg = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]);
  const pg = ptsG(goal), runs = curveRuns([pg, ...[hl, bf].filter(Boolean).map(ptsG)]);
  const place = labelPlacer(runs, [], G.T, G.Z - BR_PAD, [], [BR_PAD, BR_PAD], BR_PAD);
  for (const [x, y] of pg) place.take([x - dotR - 1, x + dotR + 1, y - dotR - 1, y + dotR + 1]);
  for (const v of sides || []) if (v?.box) place.take(v.box);
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
export function createProfileTool() {
  const el = document.createElement('div');
  el.className = 'pz-prof';
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  let goal = null, shown = null, ref = null, cfg = { from: null }, ctx0 = null, raf = 0, plan = null, stale = false, size = '';
  // (Each bracket's row as drawn: where it stands, where it stood, and when it began to fade from that one to this one. A bracket that
  // must move fades out where it was as it fades in where it goes, so it never sweeps across the line or the numbers.)
  const rows = [null, null];
  let fading = false;
  // (The numbers drawn: the goal's, eased; the healthy and earlier lines as they are.)
  const healthy = () => profileOf(ctx0?.healthy?.());
  function before() {
    if (!cfg.from || !ctx0) return null;
    const slides = ctx0.deck?.slides || [];
    if (typeof cfg.from === 'string') return profileOf(ctx0.fpOf?.(cfg.from));
    for (let j = (ctx0.index ?? 0) - 1; j >= 0; j--) {
      const fp = slides[j]?.id ? ctx0.fpOf?.(slides[j].id) : null;
      if (fp && fp !== ctx0.fp) return profileOf(fp);
    }
    return null;
  }
  // (Drawn at its box's own size, never a size of its own: drawn taller than its box, the picture was scaled down to fit it, its
  // words under 12 px and its values crowded, Sites 4 and 5. Not drawn until the box has a size.)
  const size0 = () => {
    const w = el.clientWidth, hh = el.clientHeight, z = w ? el.getBoundingClientRect().width / w : 1;
    if (!w || !hh) return null;
    // (Zoomed by the page or an ancestor (the card's own fit leaves the chart unzoomed: styles/app.css): the type is set larger by as
    // much, never under 12 px on the screen.)
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? 12 / z : 0);
    return [w, hh, f];
  };
  function draw() {
    if (!shown) { el.replaceChildren(); return; }
    const sz = size0();
    if (!sz) return;
    const [w, hh, f] = sz, tw = (t, wt) => textW(t, f, wt);
    size = `${Math.round(w)}x${Math.round(hh)}`;
    const hl = healthy(), bf = ref;
    // (Each value's place and the brackets' are settled once per state, from where the lines will end up, so they never flip while
    // the lines glide. The brackets stand inside the plot where they clear everything; else in a band at the plot's foot.)
    // (A new state of the same chart at the same size keeps the brackets where they stand while they stay clear, and keeps the band
    // once the plot has needed it, so the plot never changes height under a what-if slider.)
    if (!plan || stale) {
      const old = plan && plan.size === size ? plan : null;
      let g = profileGeo(w, hh, f, tw, true), s = numberSides(g, tw, goal);
      const brk = old && !old.inside ? null : placeBrackets(g, tw, goal, hl, bf, s, old?.brk);
      if (!brk) { g = profileGeo(w, hh, f, tw); s = numberSides(g, tw, goal); }   // (the band at the plot's foot)
      plan = { size, inside: !!brk, sides: s, brk, names: placeLineNames(g, tw, goal, hl, bf, s, brk) };
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
    const G = profileGeo(w, hh, f, tw, plan.inside), sides = plan.sides;
    // (A box shorter than the chart at its smallest with the band (a bracket's name over its value takes a taller row) asks for that
    // much: judged from that layout alone, so the box never flips between two heights.)
    const need = profileGeo(w, hh, f, tw).need;
    const cssMin = 11 * (parseFloat(getComputedStyle(el).fontSize) || 12), want = need > cssMin + 0.5 ? `${Math.ceil(need)}px` : '';
    if (el.style.minHeight !== want) el.style.minHeight = want;
    const top = shown.top, y = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, top)) / top;
    const pts = (p) => p.v.map((v, i) => [G.x(i), y(v)]);
    const now = pts(shown), labels = shown.v.map(whole);
    const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]);
    const step = top > 40 ? 10 : 5, every = (G.Z - G.T) / (top / step) < 1.3 * f ? 2 * step : step;
    const col = (v) => pressureColor(v);
    const gid = `pzpg-${Math.random().toString(36).slice(2, 8)}`;
    const valY = (cy, k) => cy + sides[k].by, t = performance.now();
    const svg = sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px`,
      'aria-label': `Pressure from gut to heart: ${STATIONS.map((n, i) => `${SPOKEN[n]} ${labels[i]}`).join(', ')} mmHg. HVPG ${whole(shown.hvpg)}, PPG ${whole(shown.ppg)}.` },
      sv('defs', {}, sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: G.x(0), x2: G.x(STATIONS.length - 1), y1: 0, y2: 0 },
        shown.v.map((v, i) => sv('stop', { offset: (i / (STATIONS.length - 1)).toFixed(3), 'stop-color': col(v) }))),
        // (The lines stop NUM_PAD px short of each number written on them.)
        sv('mask', { id: `${gid}-m`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: hh },
          sv('rect', { x: 0, y: 0, width: w, height: hh, fill: '#fff' }),   // colour-exempt: a mask
          now.map(([cx, cy], i) => { const hw = tw(labels[i], 700) / 2; return sv('rect', { x: cx - hw - NUM_PAD, y: cy - 0.36 * f - NUM_PAD, width: 2 * (hw + NUM_PAD), height: 0.72 * f + 2 * NUM_PAD, rx: NUM_PAD, fill: '#000' }); }))),   // colour-exempt: a mask
      // The liver's stations on a soft band (named by the Sinusoidal brace under them, no LIVER over it: Mohammad, 21 Oct).
      i0 >= 0 ? sv('g', { class: 'ppf-liver' }, sv('rect', { x: G.x(i0) - G.slot / 2, width: G.slot * (i1 - i0 + 1), y: G.T - 1.3 * f, height: G.B - G.T + 1.3 * f })) : null,
      Array.from({ length: Math.floor(top / every) + 1 }, (_, k) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: G.L, x2: G.R, y1: y(k * every), y2: y(k * every) }),
        sv('text', { x: G.L - 6, y: y(k * every) + 0.35 * f, 'text-anchor': 'end' }, String(k * every)))),
      // (The unit in the bottom row, at the left, level with the brace's name: Mohammad, 21 Oct, "Remove mmHg from above put it below".)
      sv('text', { class: 'ptk-unit', x: 0, y: G.braceY + 1.55 * f }, 'mmHg'),
      hl ? sv('path', { class: 'ppf-hl', d: smoothD(pts(hl)), mask: `url(#${gid}-m)` }) : null,
      bf ? sv('path', { class: 'ppf-bf', d: smoothD(pts(bf)), mask: `url(#${gid}-m)` }) : null,
      sv('path', { class: 'ppf-fill', d: `${smoothD(now)}L${G.x(STATIONS.length - 1).toFixed(1)} ${G.Z}L${G.x(0).toFixed(1)} ${G.Z}Z`, style: `fill: url(#${gid})` }),
      sv('line', { class: 'ppf-axis', x1: G.L, x2: G.R, y1: G.B, y2: G.B }),
      sv('path', { class: 'ppf-line', d: smoothD(now), style: `stroke: url(#${gid})`, mask: `url(#${gid}-m)` }),
      now.map(([cx, cy], i) => sv('text', { class: 'ppf-v', x: cx, y: valY(cy, i), 'text-anchor': 'middle' }, labels[i])),
      (plan.names || []).map((n) => sv('text', { class: `ppf-lname ${n.c}`, x: n.x, y: n.y, 'text-anchor': 'middle' }, n.t)),
      STATIONS.map((n, i) => sv('text', { class: n in LIVER_NAMES ? 'ppf-name liv' : 'ppf-name', x: G.nameX(i), y: G.nameY(i), 'text-anchor': 'middle' }, G.fit.names[i])),
      // (One brace under Pre, Intra and Post, inside the liver's band, named Sinusoidal under its tip.)
      i0 >= 0 ? sv('g', { class: 'ppf-brace' }, sv('path', { d: braceD(G.x(i0) - 0.42 * G.slot, G.x(i1) + 0.42 * G.slot, G.braceY, 0.55 * f) }),
        sv('text', { x: (G.x(i0) + G.x(i1)) / 2, y: G.braceY + 1.55 * f, 'text-anchor': 'middle' }, BRACE_NAME)) : null,
      // The HVPG (sinusoid to hepatic vein) and the PPG (portal vein − IVC) as brackets inside the plot (else in a band at its foot), in
      // their cut-off colours, each label inside its own bracket.
      SPANS.flatMap(([k, name, a, b], r) => {
        const v = shown[k], rate = RATE[k](v)[0];
        const x0 = G.x(STATIONS.indexOf(a)), x1 = G.x(STATIONS.indexOf(b)), val = whole(v);
        // (Laid out as the geometry planned the row: one line, at its own type size where the chart's would not fit, or the name over
        // the value. On one line, the gap in the bar follows the label's own width; the bar is left out only where this value leaves
        // under BAR_MIN px of it each side.)
        const fs = G.brFs[r], z = fs / f, stack = G.brMode[r] === 'stack';
        const lb = bracketLabel(x0, x1, z * tw(`${name} ${val}`, 700), [z * tw(name, 600), z * tw(val, 700)]);
        const gap = stack ? bracketLabel(x0, x1, Infinity, [tw(name, 600), tw(val, 700)]).gap : oneLineGap(x0, x1, z * tw(`${name} ${val}`, 700));
        const brk1 = (yy, op) => {
          const bar = gap[1] - gap[0] >= x1 - x0 - 0.5 ? '' : `M${x0} ${yy}H${gap[0]}M${gap[1]} ${yy}H${x1}`;
          return sv('g', { class: 'ppf-br', 'data-rate': rate, 'data-k': k, 'data-mode': G.brMode[r], opacity: op < 1 ? op.toFixed(3) : null,
            style: fs < f - 0.01 ? `font-size: ${fs.toFixed(2)}px` : null },
            sv('path', { d: `M${x0} ${yy - 0.3 * f}V${yy + 0.3 * f}M${x1} ${yy - 0.3 * f}V${yy + 0.3 * f}${bar}` }),
            stack ? sv('text', { x: lb.x, y: yy - 0.19 * f, 'text-anchor': 'middle' }, sv('tspan', { class: 'k' }, name), sv('tspan', { x: lb.x, dy: `${(1.1 * f).toFixed(2)}` }, val))
              : sv('text', { x: lb.x, y: yy + 0.36 * fs, 'text-anchor': 'middle' }, sv('tspan', { class: 'k' }, `${name} `), val));
        };
        const row = rows[r] || { y: plan.inside ? plan.brk[r] : G.brY(r), from: null }, e = fadeK(row, t);
        if (row.from != null && e >= 1) row.from = null;
        return row.from == null ? [brk1(row.y, 1)] : [brk1(row.from, 1 - e), brk1(row.y, e)];
      }));
    fading = rows.some((row) => row?.from != null);
    el.replaceChildren(svg);
  }
  const fadeK = (row, now) => (row.from == null ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (now - row.t0) / FADE_MS))));
  function tick() {
    raf = 0;
    if (!goal) return;
    const k = reduceMQ.matches || !shown ? 1 : 0.2;
    const mix = (a, b) => lerp(a, b, k);
    shown = shown ? { v: shown.v.map((x, i) => mix(x, goal.v[i])), hvpg: mix(shown.hvpg, goal.hvpg), ppg: mix(shown.ppg, goal.ppg), top: mix(shown.top, goal.top) } : { ...goal };
    const done = shown.v.every((x, i) => Math.abs(x - goal.v[i]) < 0.02) && Math.abs(shown.top - goal.top) < 0.05;
    if (done) shown = { ...goal, v: goal.v.slice() };
    if (el.isConnected || !done || fading) draw();
    if (!done || fading) raf = requestAnimationFrame(tick);
  }
  function aim(fp) {
    const p = profileOf(fp);
    if (!p) return;
    ref = before();
    goal = { ...p, top: axisTop(p, healthy(), ref) };
    stale = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (shown && el.isConnected && size !== `${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`) { plan = null; draw(); } }).observe(el);
  return {
    el,
    /** The slide's options and context (presenter-tools.js show), before its numbers. */
    configure(t, ctx) { cfg = { from: t?.from ?? null }; ctx0 = ctx || null; if (ctx?.fp) aim(ctx.fp); },
    /** The numbers the slide's tiles show: the slide's state, or a what-if slider's or a compare button's. */
    pin(fp) { if (el.isConnected && fp) aim(fp); },
    clear() {},
    dispose() { if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}
