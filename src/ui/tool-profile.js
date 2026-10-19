// The pressure profile on a slide (deck visuals V1, package B): tool { kind: 'profile' } draws the slide's pressure from gut
// to heart through the Patients chart's eight stations (anatomy.js PROFILE_PATHS), the healthy line dashed beneath it, the
// liver's stations on a soft band, and the HVPG (sinusoid to hepatic vein) and the PPG (portal vein to IVC) as brackets
// under the names (no wedged ring: Mohammad, 19 Oct, "No need for the wedge circle"). The sinusoid's station shows the wedged
// pressure (WHVP), the reading the HVPG is taken from, so the HVPG bracket is that point less the hepatic vein's (Mohammad,
// 19 Oct); it lies a little under the sinusoid's own pressure, the leak to the central vein (engine.js hvpgTrue). Where the line drops steeply is where the resistance is, so presinusoidal, sinusoidal and postsinusoidal resistance look different.
// tool: { kind: 'profile', from: true } adds the state before this slide's as a faint dotted line ('slide id' for another).
// Its numbers are the slide's own (its fingerprint, as the tiles read it: the same on every screen), easing to each new
// state; a what-if slider or compare button moves it with the tiles. The Patients chart (charts.js) is not changed.

import { PROFILE_PATHS } from './anatomy.js?v=8374d8e213';
import { NODES } from '../engine/topology.js?v=4044766e96';
import { RATE } from './table-marks.js?v=810c0a1575';
import { monotoneSegs } from './curve-near.js?v=9ff15157e9';
import { pressureColor } from './colormap.js?v=b2067d6101';

const PATH = PROFILE_PATHS[0];
export const STATIONS = PATH.nodes;
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
// Short names where the full ones do not fit, then the shortest where those do not (a phone's or a Mac's card): clinical
// short forms, never an ellipsis or a full stop.
// (The sinusoid's station is named for the wedged reading it shows wherever that fits, 'Sin' only on the narrowest card.)
export const FULL_NAMES = { ...PATH.names, SIN_R: 'Sinusoid (WHVP)' };
export const SHORT_NAMES = { INT: 'Gut', CONF: 'PV', RPV: 'Venule', SIN_R: 'WHVP', CV_R: 'CV', RHV: 'HV', IVCS: 'IVC', RA: 'RA' };
export const TIGHT_NAMES = { INT: 'Gut', CONF: 'PV', RPV: 'Ven', SIN_R: 'WHVP', CV_R: 'CV', RHV: 'HV', IVCS: 'IVC', RA: 'RA' };
const TIGHTEST = { ...TIGHT_NAMES, SIN_R: 'Sin' };
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
 *  ones, else the shortest, each name at least NAME_GAP px from the next; two staggered rows only where even the shortest
 *  touch (narrower than any card draws it). tw: a text's width in px. → { names, rows } */
export const NAME_GAP = 6;
export function nameFit(slot, tw) {
  const [full, short, tight, tightest] = [FULL_NAMES, SHORT_NAMES, TIGHT_NAMES, TIGHTEST].map((m) => STATIONS.map((n) => m[n]));
  const fits = (ns) => ns.every((n, i) => !i || (tw(ns[i - 1]) + tw(n)) / 2 + NAME_GAP <= slot);
  for (const names of [full, short, tight, tightest]) if (fits(names)) return { names, rows: 1 };
  return { names: tight, rows: 2 };
}

/** The chart's layout for w × h px in type f px: margins, the plot, the name rows and the two bracket rows. */
export function profileGeo(w, h, f, tw) {
  const L = Math.ceil(tw('30') + 12), R = w - 10, slot = (R - L) / STATIONS.length, fit = nameFit(slot, tw);
  const keyH = 1.6 * f, T = keyH + 1.5 * f, nameH = fit.rows * 1.25 * f + 0.4 * f, brH = 1.55 * f;
  const B = Math.max(T + 3 * f, h - nameH - 2 * brH - 0.5 * f);
  const x = (i) => L + slot * (i + 0.5);
  return { w, h, f, L, R, T, B, slot, x, fit, keyH, nameY: (i) => B + 1.05 * f + (fit.rows > 1 && i % 2 ? 1.25 * f : 0), brY: (k) => B + nameH + brH * (k + 0.55) };
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

/** A bracket's label and where it goes: inside its span with a gap in the bar, else just past its right end, else before
 *  its left end. → { x, anchor, gap: [x0, x1] | null } */
export function bracketLabel(x0, x1, wd, R, L) {
  if (x1 - x0 - wd >= 20) { const m = (x0 + x1) / 2; return { x: m, anchor: 'middle', gap: [m - wd / 2 - 5, m + wd / 2 + 5] }; }
  if (x1 + 6 + wd <= R + 6) return { x: x1 + 6, anchor: 'start', gap: null };
  return { x: Math.max(L - 6, x0 - 6), anchor: 'end', gap: null };
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

/** The key's entries, and whether the unit fits on the key's row. */
function keyFit(G, tw, hasBf) {
  const key = [['Now', 'now'], ['Healthy', 'hl'], ...(hasBf ? [['Before', 'bf']] : [])];
  const keyW = key.reduce((a, [t]) => a + tw(t, 500) + 30, 0);
  return { key, unitOnKey: G.R - keyW >= tw('mmHg', 500) + 6 };
}

/** Where the values go on the chart G (profileGeo) for the profile goal, with the healthy line hl and the earlier one bf
 *  (profiles or null): valueSides's answer. tw(t, weight): a text's width in px. */
export function placeValues(G, tw, goal, hl, bf) {
  const { f } = G, dotR = Math.max(4, 0.36 * f);
  const yg = (v) => G.B - (G.B - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]);
  const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]), { unitOnKey } = keyFit(G, tw, !!bf);
  // (The words over the plot a value keeps clear of: the liver's name, and the unit when the key needs its row.)
  const cap = 0.72 * f, word = (x0, x1, base) => [x0 - 2, x1 + 2, base - cap - 2, base + 2], lw = (tw('LIVER', 600) + 0.3 * f) / 2;   // (its letters spaced .06em)
  const overWords = [...(i0 >= 0 ? [word((G.x(i0) + G.x(i1)) / 2 - lw, (G.x(i0) + G.x(i1)) / 2 + lw, G.T - 0.35 * f)] : []),
    ...(unitOnKey ? [] : [word(0, tw('mmHg', 500), G.T - 0.95 * f)])];
  const pg = ptsG(goal);
  return valueSides(pg, [hl, bf].filter(Boolean).map(ptsG), goal.v.map(one), f, (t) => tw(t), G.keyH + 0.2 * f,
    { bottom: G.B, axis: G.B, left: G.L + 2, right: G.R + 8, dotR, obstacles: overWords, dots: pg.map(([x, yy]) => [x, yy, dotR + 1]) });
}

export function createProfileTool() {
  const el = document.createElement('div');
  el.className = 'pz-prof';
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  let goal = null, shown = null, ref = null, cfg = { from: null }, ctx0 = null, raf = 0, sides = null, size = '';
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
  const size0 = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    // (The card zooms its contents on a Mac and an iPad: the type is set larger by as much, never under 12 px on the screen.)
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? 12 / z : 0);
    return [Math.max(200, w || 420), Math.max(10 * f, el.clientHeight || 240), f];
  };
  function draw() {
    if (!shown) { el.replaceChildren(); return; }
    const [w, hh, f] = size0(), tw = (t, wt) => textW(t, f, wt);
    size = `${Math.round(w)}x${Math.round(hh)}`;
    const G = profileGeo(w, hh, f, tw), hl = healthy(), bf = ref;
    const top = shown.top, y = (v) => G.B - (G.B - G.T) * Math.max(0, Math.min(v, top)) / top;
    const pts = (p) => p.v.map((v, i) => [G.x(i), y(v)]);
    const now = pts(shown), labels = shown.v.map(one), dotR = Math.max(4, 0.36 * f);
    // (Each value's place is settled once per state, from where the lines will end up, so it never flips while they glide.)
    const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]);
    const { key, unitOnKey } = keyFit(G, tw, !!bf);
    let kx = G.R;
    sides ??= placeValues(G, tw, goal, hl, bf);
    const step = top > 40 ? 10 : 5, every = (G.B - G.T) / (top / step) < 1.3 * f ? 2 * step : step;
    const col = (v) => pressureColor(v);
    const gid = `pzpg-${Math.random().toString(36).slice(2, 8)}`;
    const keyEls = key.slice().reverse().map(([t, c]) => { const tx = kx, gx = tx - tw(t, 500) - 6; kx -= tw(t, 500) + 30; return sv('g', { class: `ppf-key ${c}` },
      sv('line', { x1: gx - 18, x2: gx, y1: 0.75 * f, y2: 0.75 * f }),
      sv('text', { x: tx, y: 0.75 * f + 0.36 * f, 'text-anchor': 'end' }, t)); });
    const valY = (cy, k) => cy + sides[k].by;
    const svg = sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px`,
      'aria-label': `Pressure from gut to heart: ${STATIONS.map((n, i) => `${FULL_NAMES[n]} ${labels[i]}`).join(', ')} mmHg. HVPG ${one(shown.hvpg)}, PPG ${one(shown.ppg)}.` },
      sv('defs', {}, sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: G.x(0), x2: G.x(STATIONS.length - 1), y1: 0, y2: 0 },
        shown.v.map((v, i) => sv('stop', { offset: (i / (STATIONS.length - 1)).toFixed(3), 'stop-color': col(v) })))),
      // The liver's stations on a soft band, named over the plot.
      i0 >= 0 ? sv('g', { class: 'ppf-liver' }, sv('rect', { x: G.x(i0) - G.slot / 2, width: G.slot * (i1 - i0 + 1), y: G.T - 1.3 * f, height: G.B - G.T + 1.3 * f }),
        sv('text', { x: (G.x(i0) + G.x(i1)) / 2, y: G.T - 0.35 * f, 'text-anchor': 'middle' }, 'LIVER')) : null,
      Array.from({ length: Math.floor(top / every) + 1 }, (_, k) => sv('g', { class: 'ptk-grid' }, sv('line', { x1: G.L, x2: G.R, y1: y(k * every), y2: y(k * every) }),
        sv('text', { x: G.L - 6, y: y(k * every) + 0.35 * f, 'text-anchor': 'end' }, String(k * every)))),
      // (The unit at the top left, on the key's row; over the axis's numbers when the key needs the row.)
      sv('text', { class: 'ptk-unit', x: 0, y: unitOnKey ? 0.75 * f + 0.36 * f : G.T - 0.95 * f }, 'mmHg'),
      keyEls,
      hl ? sv('path', { class: 'ppf-hl', d: smoothD(pts(hl)) }) : null,
      bf ? sv('path', { class: 'ppf-bf', d: smoothD(pts(bf)) }) : null,
      sv('path', { class: 'ppf-fill', d: `${smoothD(now)}L${G.x(STATIONS.length - 1).toFixed(1)} ${G.B}L${G.x(0).toFixed(1)} ${G.B}Z`, style: `fill: url(#${gid})` }),
      sv('line', { class: 'ppf-axis', x1: G.L, x2: G.R, y1: G.B, y2: G.B }),
      sv('path', { class: 'ppf-line', d: smoothD(now), style: `stroke: url(#${gid})` }),
      now.map(([cx, cy], i) => sv('circle', { class: 'ppf-dot', cx, cy, r: dotR, style: `fill: ${col(shown.v[i])}` })),
      now.map(([cx, cy], i) => sv('text', { class: 'ppf-v', x: cx + sides[i].dx, y: valY(cy, i), 'text-anchor': 'middle' }, labels[i])),
      STATIONS.map((n, i) => sv('text', { class: 'ppf-name', x: G.x(i), y: G.nameY(i), 'text-anchor': 'middle' }, G.fit.names[i])),
      // The HVPG (sinusoid to hepatic vein) and the PPG (portal vein − IVC) as brackets under the names, in their cut-off colours.
      SPANS.map(([k, name, a, b], r) => {
        const v = shown[k], rate = RATE[k](v)[0];
        const x0 = G.x(STATIONS.indexOf(a)), x1 = G.x(STATIONS.indexOf(b)), yy = G.brY(r), txt = `${name} ${one(v)}`;
        const lb = bracketLabel(x0, x1, tw(txt, 700), G.R, G.L), bar = lb.gap ? `M${x0} ${yy}H${lb.gap[0]}M${lb.gap[1]} ${yy}H${x1}` : `M${x0} ${yy}H${x1}`;
        return sv('g', { class: 'ppf-br', 'data-rate': rate, 'data-k': k },
          sv('path', { d: `M${x0} ${yy - 0.3 * f}V${yy + 0.3 * f}M${x1} ${yy - 0.3 * f}V${yy + 0.3 * f}${bar}` }),
          sv('text', { x: lb.x, y: yy + 0.36 * f, 'text-anchor': lb.anchor }, sv('tspan', { class: 'k' }, `${name} `), one(v)));
      }));
    el.replaceChildren(svg);
  }
  function tick() {
    raf = 0;
    if (!goal) return;
    const k = reduceMQ.matches || !shown ? 1 : 0.2;
    const mix = (a, b) => lerp(a, b, k);
    shown = shown ? { v: shown.v.map((x, i) => mix(x, goal.v[i])), hvpg: mix(shown.hvpg, goal.hvpg), ppg: mix(shown.ppg, goal.ppg), top: mix(shown.top, goal.top) } : { ...goal };
    const done = shown.v.every((x, i) => Math.abs(x - goal.v[i]) < 0.02) && Math.abs(shown.top - goal.top) < 0.05;
    if (done) shown = { ...goal, v: goal.v.slice() };
    if (el.isConnected || !done) draw();
    if (!done) raf = requestAnimationFrame(tick);
  }
  function aim(fp) {
    const p = profileOf(fp);
    if (!p) return;
    ref = before();
    goal = { ...p, top: axisTop(p, healthy(), ref) };
    sides = null;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (shown && el.isConnected && size !== `${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`) { sides = null; draw(); } }).observe(el);
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
