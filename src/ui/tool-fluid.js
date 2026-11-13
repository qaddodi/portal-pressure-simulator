// Deck visuals, package G, V27: the fluid balance on a slide's data card, tool { kind: 'fluid' } (forces: true adds the forces
// across the sinusoid wall; caveat: true always shows the line that its rates are the model's own).
// A flow picture: the lymph made (the liver's and the gut's) splitting into what the lymphatics carry, what the belly takes
// back and what stays as ascites, each band as thick as its flow. The lymphatics' node runs on, dashed, to their capacity:
// the room they still have. These are the model's own terms
// (engine.js starling), read from the slide's fingerprint at rest and from the live model while a time-lapse, a what-if or a
// compare button moves it.

import { frame, cancelFrame } from './frame.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { chartCtx } from './chart-ctx.js';
import { h, fmt, clamp } from './util.js';
import { NODES } from '../engine/topology.js';
import { store } from './store.js';
import { measure } from './glyph-measure.js';
import { setGeo, setPts, setWords, setHidden } from './svg-gl.js';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const num = (x) => (Number.isFinite(+x) ? +x : null);

/** The fluid balance (mL/min) from a fingerprint (worker-core.js: hepLymph, splLymph, lymphCap, lymphOver, lymphBack, lymphNet)
 *  or from a live frame's metrics (metrics.ascites: hepLymph, splLymph, lymphCap, ratePerDay), or null when it has none.
 *  made = liver + gut; carried = what the lymphatics carry (made, up to their capacity); back = what the belly takes back;
 *  drained = carried + back; net = made − drained, the ascites made (negative while it shrinks). */
export function fluidOf(src) {
  if (!src) return null;
  let hep, spl, cap, over, back, net;
  if (src.ascites) {
    const a = src.ascites;
    hep = num(a.hepLymph); spl = num(a.splLymph); cap = num(a.lymphCap);
    if (hep == null || spl == null || cap == null || num(a.ratePerDay) == null) return null;
    over = Math.max(0, hep + spl - cap); net = a.ratePerDay / 1440; back = over - net;
  } else {
    hep = num(src.hepLymph); spl = num(src.splLymph); cap = num(src.lymphCap); over = num(src.lymphOver); back = num(src.lymphBack); net = num(src.lymphNet);
    if ([hep, spl, cap, over, back, net].some((x) => x == null)) return null;
  }
  const made = hep + spl, carried = Math.min(made, cap), drained = carried + back;
  return { hep, spl, made, cap, carried, spare: Math.max(0, cap - made), over, back, drained, net, perDay: net * 1440 };
}

/** The forces across the sinusoid wall (mmHg), as the engine's Starling step weighs them (engine.js starling): the pressure
 *  pushing fluid out (the sinusoids' pressure, a mix of the two lobes' sinusoids and central veins, less the pressure in the
 *  belly) against the blood's protein pulling it back in (the oncotic gap across the wall, times its reflection coefficient).
 *  The liver's lymph is 0.5 + 0.45 × the push beyond the pull and 0.75 (tests/deck-instruments.test.js checks it against the engine). */
export function sinusoidForces(P, params, iap) {
  if (!P || !params) return null;
  const at = (id) => P[NI[id]];
  const out = 0.6 * (0.7 * at('SIN_R') + 0.3 * at('CV_R')) + 0.4 * (0.7 * at('SIN_L') + 0.3 * at('CV_L')) - (iap ?? 5);
  const pic = 25 * ((params.albumin ?? 4) / 4), sig = 0.1 + 0.5 * (params.cirrhosis ?? 0), pull = sig * (pic - pic * (1 - sig) * 0.9);
  return Number.isFinite(out) && Number.isFinite(pull) ? { out, pull } : null;
}

/** The forces at a slide's state, from its fingerprint (worker-core.js: the liver's lymph and the albumin; the cirrhosis from
 *  the slide's params): the push read back from the engine's own liver lymph, which it sets (0.5 + 0.45 × the push beyond the
 *  pull and 0.75), so every screen shows the same number for the same slide, whatever the breath at the moment. null where
 *  the push is below that threshold (the lymph is at its floor and does not tell the push); the live frames show it then. */
export function pinnedForces(fp, params) {
  if (!fp || !params || !Number.isFinite(fp.hepLymph) || fp.hepLymph <= 0.5 + 1e-9) return null;
  const pic = 25 * ((fp.salb ?? params.albumin ?? 4) / 4), sig = 0.1 + 0.5 * (params.cirrhosis ?? 0), pull = sig * (pic - pic * (1 - sig) * 0.9);
  return { out: (fp.hepLymph - 0.5) / 0.45 + pull + 0.75, pull };
}

/** The bars' segments, as fractions of the scale they share (the largest of made, drained and the lymphatics' capacity). */
export function fluidBars(f) {
  const top = Math.max(f.made, f.drained, f.cap, 0.1) * 1.04, w = (x) => clamp(x / top, 0, 1);
  return { liver: w(f.hep), gut: w(f.spl), carried: w(f.carried), back: w(f.back), build: w(Math.max(0, f.net)), spare: w(f.spare) };
}

/** The line under the bars. */
export function fluidWords(f) {
  const d = Math.round(Math.abs(f.perDay) / 10) * 10;
  if (f.net > 0 && d >= 10) return `Ascites builds by about ${d} mL a day.`;
  if (f.net < 0 && d >= 10) return `Ascites shrinks by about ${d} mL a day.`;
  return f.over > 0.005 ? 'Ascites holds steady: the belly takes back the overflow.' : 'No ascites builds: the lymphatics carry it all.';
}

/** The day strip's numbers (window: true), per day: each part rounded to 10 mL from the model's mL/min, then the
 *  sums taken from those parts, so every printed sum is exact (made = liver + gut; overflow = made beyond what the lymphatics
 *  can carry; each day = overflow − taken back). room is what the lymphatics could still take (negative once they are full). */
export function fluidDay(f) {
  const r = (x) => Math.round((Math.max(0, x) * 1440) / 10) * 10;
  const liver = r(f.hep), gut = r(f.spl), limit = r(f.cap), back = r(f.back);
  const made = liver + gut, carried = Math.min(made, limit), over = made - carried;
  return { liver, gut, made, limit, carried, over, back, net: over - back, room: limit - made };
}

/** A whole number of mL with its thousands comma (5,360), as the platelets print theirs. */
export const mlInt = (v) => Math.round(Math.max(0, v)).toLocaleString('en-US');

/** The day card's words (window: true) for a day's numbers (fluidDay): the answer in a sentence, the one line under it on what leaked and
 *  what the belly took back, the lymphatics' limit (with "full" once they can carry no more) and the day's change as its number. */
export function dayWords(d) {
  const title = d.net > 0 ? 'Ascites builds' : d.net < 0 ? 'Ascites shrinks' : d.over > 0 ? 'Ascites holds steady' : 'No ascites builds';
  const detail = d.over > 0
    ? (d.back > 0 ? `${mlInt(d.over)} leaks; the belly takes back ${mlInt(d.back)}.` : `${mlInt(d.over)} leaks and none is taken back.`)
    : d.back > 0 ? `Nothing leaks; the belly takes back ${mlInt(d.back)}.` : 'The lymphatics carry it all. Nothing leaks.';
  return { title, detail, limit: d.room > 0 ? `Limit ${mlInt(d.limit)}` : `Limit ${mlInt(d.limit)} · full`,
    net: d.net > 0 ? `▲ ${mlInt(d.net)}` : d.net < 0 ? `▼ ${mlInt(-d.net)}` : '0', dir: d.net > 0 ? 'up' : d.net < 0 ? 'down' : '' };
}

/** The lymph gauge's parts, as px of a track W wide, from the day's numbers in mL (continuous ones: the eased values while it moves):
 *  what the lymphatics carry (the lymph green) and, past their limit, what leaks (the ascites amber), on one scale with the room the
 *  lymphatics have left: carried + leaked + room. The limit is a tick where the carried part ends, drawn only while something leaks.
 *  A part with anything in it shows at least GAUGE_MARK px (so 10 mL a day is still a mark), continuous in its value, so an eased value
 *  never makes a step; GAUGE_GAP px keep the two parts apart. Returns px: car and over ({ x, w }) and tick ({ x, op }). */
export const GAUGE_GAP = 2, GAUGE_MARK = 2.5;
/** A set of gauge parts to write into (gaugePartsInto): kept by the caller, so a frame makes none. */
export const newGaugeParts = () => ({ car: { x: 0, w: 0 }, over: { x: 0, w: 0 }, tick: { x: 0, op: 0 } });
export function gaugePartsInto(out, g, W) {
  const carried = Math.max(0, g.carried), over = Math.max(0, g.over), room = Math.max(0, g.room), k = W / Math.max(carried + over + room, 1);
  const px = over * k, ow = px + GAUGE_MARK * clamp(px / 0.5, 0, 1), cw = Math.max(0, Math.min(carried * k, W - ow));
  out.car.x = 0; out.car.w = Math.max(0, cw - GAUGE_GAP * clamp(ow / (GAUGE_MARK + GAUGE_GAP), 0, 1));
  out.over.x = cw; out.over.w = ow;
  out.tick.x = cw; out.tick.op = clamp(px / 6, 0, 1);   // (fades in over its first 6 px of overflow, so it makes no step)
  return out;
}
export const gaugeParts = (g, W) => gaugePartsInto(newGaugeParts(), g, W);

/** The forces strip's parts, as px of a track W wide: the push from the blood's side and the pull from the tissue's side as two
 *  arrows meeting at the wall, each as long as its pressure (their sum is the track). */
export const newTugParts = () => ({ push: { x: 0, w: 0 }, pull: { x: 0, w: 0 }, wall: 0 });
export function tugPartsInto(T, out, pull, W) {
  const o = Math.max(0, out), p = Math.max(0, pull), wall = o + p > 0 ? (o / (o + p)) * W : W / 2;
  T.push.x = 0; T.push.w = Math.max(0, wall - 1.5); T.pull.x = wall + 1.5; T.pull.w = Math.max(0, W - wall - 1.5); T.wall = wall;
  return T;
}
export const tugParts = (out, pull, W) => tugPartsInto(newTugParts(), out, pull, W);

const mlMin = (x) => fmt(Math.max(0, x), x < 10 ? 1 : 0);

/** The flow picture's geometry for a width W (px, the card's own, so text stays at its CSS size): the liver's and the gut's
 *  lymph on the left, each a band as thick as its flow, splitting into what the lymphatics carry, what the belly takes back
 *  and what stays as ascites on the right. Bands are matched by sweeping both columns' running totals, so every mL/min that
 *  leaves the left arrives on the right. The lymphatics' node runs on, dashed, to their capacity (the room they still have).
 *  Labels sit beside their nodes, centres at least 18 px apart (13 px text with a gap over 4 px). */
export const FLOW_H = 128;
// (The picture's nodes and bands are kept, one of each there can be, and written in place: a frame makes none. fluidFlows hands
// the same shape back as it always did: left and right (nodes with id, v, h, lh, y, cy, room), bands (from, to, ly, ry, t).)
const FLOW_MAXB = 64, FLOW_LW = 78, FLOW_RW = 142, FLOW_NW = 8, FLOW_LINE = 18, FLOW_MIN = 2;
const flowNode = (id) => ({ id, v: 0, h: 0, lh: 0, y: 0, cy: 0, room: 0, show: false });
const FLOW_BANDS = [];
for (const a of ['liver', 'gut']) for (const b of ['carried', 'back', 'build']) FLOW_BANDS.push({ from: a, to: b, key: `${a}-${b}`, ly: 0, ry: 0, t: 0 });
/** A layout to write into (fluidFlowsInto): kept by the caller. */
export const newFlows = () => ({ xL: 0, xR: 0, NW: FLOW_NW, left: [], right: [], bands: [], W: 0, H: 0,
  nodes: { liver: flowNode('liver'), gut: flowNode('gut'), carried: flowNode('carried'), back: flowNode('back'), build: flowNode('build') } });
const thick = (v, k) => (v > 0.005 ? Math.max(FLOW_MIN, v * k) : 0);
// (a column: nodes stacked with gaps so the labels at their centres keep LINE apart, then centred in H)
function flowColumn(nodes, H) {
  let y = 0, prev = null;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (prev) y += Math.max(6, FLOW_LINE - prev.lh / 2 - n.lh / 2);
    n.y = y; y += n.h; prev = n;
  }
  const top = Math.max(0, (H - y) / 2);
  for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; n.y += top; n.cy = n.y + n.lh / 2; }
}
export function fluidFlowsInto(L, f, W, H = FLOW_H) {
  const xL = FLOW_LW, xR = Math.max(xL + FLOW_NW + 40, W - FLOW_RW - FLOW_NW);
  const into = Math.max(0, f.made - f.carried), back = Math.min(Math.max(0, f.back), into), build = Math.max(0, into - back);
  const k = FLOW_MAXB / Math.max(f.made, f.cap + into, 0.1);
  const N = L.nodes, liver = N.liver, gut = N.gut, carried = N.carried, nBack = N.back, nBuild = N.build;
  liver.show = gut.show = carried.show = nBack.show = nBuild.show = false;
  liver.v = f.hep; gut.v = f.spl;
  liver.h = liver.lh = thick(f.hep, k); gut.h = gut.lh = thick(f.spl, k); liver.room = gut.room = 0;
  liver.show = gut.show = true;
  L.left.length = 0; L.left.push(liver, gut);
  flowColumn(L.left, H);
  const roomH = f.spare > 0.005 ? f.spare * k : 0;
  carried.v = f.carried; carried.h = thick(f.carried, k) + roomH; carried.lh = thick(f.carried, k); carried.room = roomH; carried.show = true;
  nBack.v = back; nBack.h = nBack.lh = thick(back, k); nBack.room = 0; nBack.show = f.back > 0.005;
  nBuild.v = build; nBuild.h = nBuild.lh = thick(build, k); nBuild.room = 0; nBuild.show = f.net > 0.005 || f.perDay <= -10;
  L.right.length = 0; L.right.push(carried);
  if (nBack.show) L.right.push(nBack);
  if (nBuild.show) L.right.push(nBuild);
  flowColumn(L.right, H);
  // (each band: where the left node's share starts and the right node's share starts, by running totals)
  L.bands.length = 0;
  let a0 = 0;
  for (let i = 0; i < L.left.length; i++) {
    const Ln = L.left[i], a1 = a0 + Ln.v; let b0 = 0;
    for (let j = 0; j < L.right.length; j++) {
      const R = L.right[j], b1 = b0 + R.v, lo = Math.max(a0, b0), hi = Math.min(a1, b1);
      if (hi - lo > 1e-6) {
        const tk = (hi - lo) * k, ly = Ln.y + (lo - a0) * k * (Ln.lh / Math.max(Ln.v * k, 1e-9)), ry = R.y + (lo - b0) * k * (R.lh / Math.max(R.v * k, 1e-9));
        const B = FLOW_BANDS[(Ln === liver ? 0 : 3) + (R === carried ? 0 : R === nBack ? 1 : 2)];
        B.ly = ly; B.ry = ry; B.t = Math.max(1, Math.min(tk, Ln.lh, R.lh));
        L.bands.push(B);
      }
      b0 = b1;
    }
    a0 = a1;
  }
  L.xL = xL; L.xR = xR; L.W = W; L.H = H;
  return L;
}
export const fluidFlows = (f, W, H = FLOW_H) => fluidFlowsInto(newFlows(), f, W, H);

// (2 Nov 2026: the flow picture is a model drawn on the GPU, svg-gl.js: the same tree, of plain elements, never painted by the browser.)
const sv = (tag, a = {}) => svgModel(tag, a);
// (A band's outline as points for the picture: its top edge, a cubic from (x0, y0) to (x1, y1) with its ends' tangents level, then its
// lower edge back, BAND_N segments each: the same curve the path's C commands drew.)
const BAND_N = 40, BAND_PTS = 4 * (BAND_N + 1);
const bandPts = (buf, x0, y0, x1, y1, t) => {
  const m = (x0 + x1) / 2;
  for (let i = 0; i <= BAND_N; i++) {
    const u = i / BAND_N, v = 1 - u, c0 = v * v * v, c1 = 3 * v * v * u, c2 = 3 * v * u * u, c3 = u * u * u;
    const x = c0 * x0 + (c1 + c2) * m + c3 * x1;
    buf[2 * i] = x; buf[2 * i + 1] = (c0 + c1) * y0 + (c2 + c3) * y1;
    const r = 2 * (2 * BAND_N + 1 - i);   // (the lower edge, running back from (x1, y1 + t) to (x0, y0 + t))
    buf[r] = x; buf[r + 1] = (c0 + c1) * (y0 + t) + (c2 + c3) * (y1 + t);
  }
};
const NAMES = { liver: 'Liver', gut: 'Gut', carried: 'Lymphatics', back: 'Taken back', build: 'Ascites' };
const FILL = { liver: 'gf-liver', gut: 'gf-gut', carried: 'gf-carried', back: 'gf-back', build: 'gf-build' };

// One part of a strip (a coloured part, the dashed room left, an arrow of the tug) is a piece of a model the GPU draws (svg-gl.js), the
// same as the flow picture above it: its outline is points in a kept buffer, written in place each frame, so the page is neither laid
// out nor repainted and no string is made. An end is rounded (a corner as wide as `ends` says, in em, and as tall) or a point; shorter
// than its two ends, both shrink together, as the old pieces did. el._at(x, w, y0, y1, em) puts it from x, w px long, between y0 and y1.
const END_ROUND = 0, END_POINT = 1, CORNER_N = 6, PART_PTS = 8 * (CORNER_N + 1);
const COS = new Float64Array(CORNER_N + 1), SIN = new Float64Array(CORNER_N + 1);
for (let i = 0; i <= CORNER_N; i++) { COS[i] = Math.cos((Math.PI / 2) * (i / CORNER_N)); SIN[i] = Math.sin((Math.PI / 2) * (i / CORNER_N)); }
const put = (b, n, x, y) => { b[2 * n] = x; b[2 * n + 1] = y; return n + 1; };
/** A part's outline into b (x, y pairs; returns how many): clockwise from the top edge, x to x + w, y0 to y1. eL and eR are its ends' sizes
 *  in px (a corner's width and height, or a point's length), kL and kR their kinds. */
export function partPts(b, x, w, y0, y1, eL, eR, kL, kR) {
  if (!(w > 0.01)) return 0;
  const k = Math.min(1, w / Math.max(eL + eR, 1e-6)), l = eL * k, r = eR * k, x1 = x + w, ym = (y0 + y1) / 2;
  let n = 0;
  if (kR === END_POINT) { n = put(b, n, x1 - r, y0); n = put(b, n, x1, ym); n = put(b, n, x1 - r, y1); }
  else {
    for (let i = 0; i <= CORNER_N; i++) n = put(b, n, x1 - r + r * SIN[i], y0 + eR - eR * COS[i]);   // (top right, from the top edge round to the side)
    for (let i = 0; i <= CORNER_N; i++) n = put(b, n, x1 - r + r * COS[i], y1 - eR + eR * SIN[i]);   // (bottom right, from the side round to the bottom edge)
  }
  if (kL === END_POINT) { n = put(b, n, x + l, y1); n = put(b, n, x, ym); n = put(b, n, x + l, y0); }
  else {
    for (let i = 0; i <= CORNER_N; i++) n = put(b, n, x + l - l * SIN[i], y1 - eL + eL * COS[i]);   // (bottom left)
    for (let i = 0; i <= CORNER_N; i++) n = put(b, n, x + l - l * COS[i], y0 + eL - eL * SIN[i]);   // (top left)
  }
  return n;
}
function span(look, cls, ends = [0.4, 0.4], kinds = [END_ROUND, END_ROUND], inset = 0, hid = false) {
  const shape = { ends, kinds };   // (el._shape(ends, kinds) changes them: the thin gauges of the day card are rounded, the old arrows were pointed)
  const el = svgModel('path', hid ? { class: cls, 'data-look': look, opacity: '0' } : { class: cls, 'data-look': look });
  const buf = new Float64Array(PART_PTS);
  el._shape = (e, k) => { shape.ends = e; shape.kinds = k; };
  el._at = (x, w, y0, y1, em) => {
    if (!em) return;
    setPts(el, buf, partPts(buf, x + inset, w - 2 * inset, y0 + inset, y1 - inset, shape.ends[0] * em, shape.ends[1] * em, shape.kinds[0], shape.kinds[1]), true);
  };
  return el;
}
// A word set inside a part: it fades with its goal (it fits where the part is going: fit() below) and with the part's own length, so
// it never spills out of a part that is still growing or shrinking under it. Its place follows the part's.
function inWord(pad) {
  const el = svgModel('text', { class: 'gs-in', 'data-look': 'fluid.in', opacity: '0' });
  const L = { el, pad, on: false, v: 0, need: 0 };
  L.at = (x, w, cy, em) => {
    setGeo(el, 'x', x + pad * em); setGeo(el, 'y', cy);
    setGeo(el, 'opacity', L.v * clamp(1 + (w - L.need - (pad + 0.5) * em) / (0.5 * em), 0, 1));
  };
  return L;
}

export function createFluid() {
  // The flow picture: one SVG drawn at the card's own width (a ResizeObserver redraws it), so its 13 px labels stay 13 px.
  const flow = sv('svg', { class: 'gf-flow', height: FLOW_H, 'aria-hidden': 'true' });
  const gBands = sv('g'), gNodes = sv('g'), gText = sv('g');
  flow.append(gBands, gNodes, gText);
  // (its box, FLOW_H tall at the card's width, which the GPU's picture fills)
  const flowBox = h('div', { class: 'gf-flowbox', style: `height: ${FLOW_H}px` }, flow), gl = createSvgGL(flowBox, { host: 'fluid' });
  const bandEls = {}, nodeEls = {}, roomEl = sv('rect', { class: 'gf-room', 'data-look': 'fluid.room', rx: 2 }), textEls = {};
  gNodes.append(roomEl);
  for (const id of Object.keys(NAMES)) {
    nodeEls[id] = sv('rect', { class: `gf-node ${FILL[id]}`, 'data-look': `fluid.node.${id}`, rx: 2 }); gNodes.append(nodeEls[id]);
    const t = sv('text', { class: 'gf-t', 'data-look': 'fluid.flow.t' }), n = sv('tspan', { 'data-look': 'fluid.flow.span' }), v = sv('tspan', { class: 'gf-tv', 'data-look': 'fluid.flow.tv', dx: 5 });
    t.append(n, v); n.textContent = NAMES[id]; textEls[id] = { t, v }; gText.append(t);
  }
  const bandBufs = {};   // (each band's points, kept)
  for (const a of ['liver', 'gut']) for (const b of ['carried', 'back', 'build']) { bandEls[`${a}-${b}`] = sv('path', { class: `gf-band ${FILL[b]}`, 'data-look': `fluid.band.${b}` }); bandBufs[`${a}-${b}`] = new Float64Array(BAND_PTS); gBands.append(bandEls[`${a}-${b}`]); }
  for (const id of ['liver', 'gut']) textEls[id].t.setAttribute('text-anchor', 'end');   // (the left names stand left of their nodes)
  const unit = h('span', { class: 'gf-unit' }, 'mL/min');
  const words = h('p', { class: 'gf-words' });
  const caveat = h('p', { class: 'gf-caveat' }, 'Model rates, not clinical figures.');
  // The day card (window: true; Mohammad's pick "C, Two tiles", 13 Nov 2026: the day strip of 21 Oct had too many rows at once): two quiet
  // tiles side by side, the lymph made against what the lymphatics can carry and the net pressure across the sinusoid wall, each a number
  // and one thin gauge; under them the answer in a sentence with the day's change, and one line on what leaked and what the belly took
  // back. Every row is one line, so the card keeps one size whatever the model does; the numbers and words swap in place and the gauges
  // ease. The gauges are models the GPU draws over their slots (gaugeParts has the sizes).
  const num = () => h('b', {}, '');
  const sMade = num(), sLimit = h('span', { class: 'gc-foot' }, ''), sNet = num(), sTitle = h('span', {}), sDetail = h('p', { class: 'gc-detail' }, '');
  const wNum = num(), wUnit = h('small', {}, 'mmHg out'), wFoot = h('span', { class: 'gc-foot' }, '');
  const segCar = span('fluid.seg.car', 'gs-seg gs-car', [0.25, 0.25]), segOver = span('fluid.seg.build', 'gs-seg gs-over', [0.25, 0.25]);
  const limitTick = svgModel('path', { class: 'gs-tick', 'data-look': 'fluid.tick', opacity: '0' }), tickBuf = new Float64Array(4);
  const stripModel = svgModel('svg', { class: 'gs-svg', 'aria-hidden': 'true' }, segCar, segOver, limitTick);
  const trk = h('div', { class: 'gs-trk' });
  // (The model is in its box before the picture is made, as the flow picture's is: a piece added after would start a look read of its own.)
  const plate = h('div', { class: 'gs-plate' }, trk, stripModel);
  const glStrip = createSvgGL(plate, { host: 'fluid' });
  glStrip.cv.setAttribute('aria-hidden', 'true'); glStrip.cv.removeAttribute('role');   // (the card's own label says it; the picture is a drawing of it)
  const wallHost = h('div', { class: 'gc-tugbox' });
  const lyTile = h('div', { class: 'gc-tile' }, h('div', { class: 'gc-cap' }, 'Lymph made'), h('div', { class: 'gc-n' }, sMade, h('small', {}, 'mL')), plate, sLimit);
  const wallTile = h('div', { class: 'gc-tile' }, h('div', { class: 'gc-cap' }, 'Across the wall'), h('div', { class: 'gc-n' }, wNum, wUnit), wallHost, wFoot);
  const tiles = h('div', { class: 'gc-tiles' }, lyTile, wallTile);
  const ansRow = h('div', { class: 'gc-ans' }, h('span', { class: 'gc-t' }, sTitle), sNet);
  const win = h('div', { class: 'gs gc' }, tiles, ansRow, sDetail);
  // The forces across the sinusoid wall (forces: true): a line naming the wall and the net, over one strip: the push from the
  // blood's side and the pull from the tissue's side as two arrows meeting at the wall, each as long as its pressure, named inside.
  const fNet = h('b'), lPush = inWord(0.6), lPull = inWord(1.1);
  const segPush = span('fluid.seg.push', 'gs-seg gs-push', [0.4, 0.7], [END_ROUND, END_POINT]), segPull = span('fluid.seg.pull', 'gs-seg gs-pull', [0.7, 0.4], [END_POINT, END_ROUND]);
  const wall = svgModel('path', { class: 'gs-wall', 'data-look': 'fluid.wall' }), wallBuf = new Float64Array(4);
  const tugModel = svgModel('svg', { class: 'gs-svg', 'aria-hidden': 'true' }, segPush, segPull, wall, lPush.el, lPull.el);
  const tug = h('div', { class: 'gs-trk gs-tug' }, tugModel);
  const glTug = createSvgGL(tug, { host: 'fluid' });
  glTug.cv.setAttribute('aria-hidden', 'true'); glTug.cv.removeAttribute('role');
  const forces = h('div', { class: 'gs-forces' }, h('div', { class: 'gs-fcap' }, h('span', {}, 'Across the sinusoid wall · mmHg'), h('span', {}, fNet)), tug);
  const el = h('div', { class: 'gf', role: 'img' }, win, flowBox, unit, words, forces, caveat);
  const set = (n, t) => { if (n.textContent === t) return false; n.textContent = t; return true; };
  // (A part goes where its points are written: span() above; the wall is a line.)
  let em = 0;   // (the strip's type size, px: read with the labels' fit)
  // (The day card's plate is its track with TICK_OUT em of air above and below it; the forces strip's tug is its track alone.)
  const BAR = 1.25, GAUGE = 0.5, TICK_OUT = 0.18;   // (the bar of the forces strip, in em; the day card's thin gauges, and how far the limit's tick stands out of one)
  let bar = BAR;
  const place = (n, p, top) => n._at(p.x, p.w, top, top + bar * em, em);
  let W = 0, TW = 0, FW = 0, goal = null, shown = null, fGoal = null, fShown = null, raf = 0, last = 0, day = null, labSig = '';
  // (What a frame writes into: kept, so it makes none.)
  const goalO = {}, shownO = {}, fShownO = { out: 0, pull: 0 };
  const dayO = { carried: 0, over: 0, back: 0, room: 0 };
  const gaugeP = newGaugeParts(), tugP = newTugParts(), flowL = newFlows();
  const NODE_IDS = Object.keys(NAMES), shownNode = {}, flowKeys = Object.keys(bandEls);   // (which node pieces are on, which band pieces drew: kept)
  // (everything eases: the drawn values follow the goal over about half a second; the numbers swap in place)
  const KEYS = ['hep', 'spl', 'made', 'cap', 'carried', 'spare', 'back', 'net', 'perDay'], GKEYS = KEYS.concat(['dCar', 'dOver', 'dBack', 'dRoom']);
  const dayOf = (f) => { dayO.carried = f.dCar; dayO.over = f.dOver; dayO.back = f.dBack; dayO.room = f.dRoom; return dayO; };
  // A label sits inside its part when it fits (the text and 1.05 em beside it), else it is hidden; decided from where the parts
  // are going, never from where they are mid-ease, so a label fades once, not as the part grows past it.
  // (A label's width from Inter's own metrics, the ones the GPU sets words with (glyph-measure.js), not from the page: the strip's words
  // change with every model step of a time-lapse, and each candidate was set into a hidden span and read back, a forced layout each,
  // several a step (2 Nov, his Mac: Ascites 4 with Fluid balance open at 16 fps). The widths and the type size are read from the page
  // only when the strip's size changes.)
  const fit = (L, cands, room, em) => {
    for (const c of cands) {
      const w = measure(c, `600 ${em}px Inter`);
      // (natural width only: a part too short for the words at the card's type size shows none, never a squeezed run; an unread size shows none)
      if (em >= 9 && w + em * 1.05 <= room) { setWords(L.el, c); L.need = w; L.on = true; return true; }
    }
    L.on = false;
    return false;
  };
  // The card's type size, what an em of the strip is: handed to the three pictures with the card's layout and zoom (chart-ctx.js), and asked of
  // the table's host (chart-looks/index.js HOSTS.fluid), never of the page's style. Made when the strip's widths change, not in a frame.
  const hostEm = () => {
    try { const cx = chartCtx(win); delete cx.svk; gl.setCtx(cx); glStrip.setCtx(cx); glTug.setCtx(cx); } catch { /* (no card round it yet: the sizes as they stand) */ }
    return glStrip.hostSize() || 14;
  };
  let sizeSig = '', roSeen = false;
  function labels() {
    const sized = roSeen, tw = sized ? TW : trk.clientWidth, fw = sized ? FW : tug.clientWidth;   // (the observer's widths once it has reported)
    const sig = `${tw}|${fw}|${day ? JSON.stringify(day) : ''}|${fGoal ? `${fmt(fGoal.out, 1)}${fmt(fGoal.pull, 1)}` : ''}`;
    if (sig === labSig) return;
    labSig = sig;
    if (sizeSig !== `${tw}|${fw}` || !em) { sizeSig = `${tw}|${fw}`; em = hostEm(); }
    if (fGoal && fw && !opts.window) {   // (the words in the arrows: the strip under the flow picture; the day card's tile has none)
      const T = tugParts(fGoal.out, fGoal.pull, fw), pad = em * 0.7;
      fit(lPush, [`Pushing out ${fmt(fGoal.out, 1)}`, fmt(fGoal.out, 1)], T.push.w - pad, em);
      fit(lPull, [`Pulling in ${fmt(fGoal.pull, 1)}`, fmt(fGoal.pull, 1)], T.pull.w - pad, em);
    }
  }
  function draw() {
    gl.paint();   // (the picture draws what this frame writes, in this same frame)
    if (opts.window) {
      const tw = TW;   // (the widths as the observer last read them: a glide's frame reads no layout)
      if (shown && tw > 0 && 'dCar' in shown) {
        const P = gaugePartsInto(gaugeP, dayOf(shown), tw), top = TICK_OUT * em, gh = GAUGE * em;   // (the plate has TICK_OUT em of air above and below the track, for the tick)
        place(segCar, P.car, top); place(segOver, P.over, top);
        // (the limit: a short line across the gauge where the carried part ends, standing out of it a little above and below)
        tickBuf[0] = P.tick.x; tickBuf[1] = top - TICK_OUT * em; tickBuf[2] = P.tick.x; tickBuf[3] = top + gh + TICK_OUT * em;
        setPts(limitTick, tickBuf, 2, false);
        setGeo(limitTick, 'opacity', P.tick.op);
        glStrip.paint();
      }
    } else if (shown && W > 0) {
      const L = fluidFlowsInto(flowL, shown, W);
      for (let i = 0; i < flowKeys.length; i++) setPts(bandEls[flowKeys[i]], bandBufs[flowKeys[i]], 0, true);
      for (let i = 0; i < L.bands.length; i++) {
        const b = L.bands[i];
        bandPts(bandBufs[b.key], L.xL + L.NW, b.ly, L.xR, b.ry, b.t);
        setPts(bandEls[b.key], bandBufs[b.key], 2 * (BAND_N + 1), true);
      }
      for (let i = 0; i < NODE_IDS.length; i++) shownNode[NODE_IDS[i]] = false;
      for (let i = 0; i < L.left.length; i++) shownNode[L.left[i].id] = true;
      for (let i = 0; i < L.right.length; i++) shownNode[L.right[i].id] = true;
      for (let i = 0; i < NODE_IDS.length; i++) {
        const id = NODE_IDS[i], on = shownNode[id];
        setHidden(nodeEls[id], !on); setHidden(textEls[id].t, !on);
      }
      for (let i = 0; i < L.left.length; i++) {
        const n = L.left[i], r = nodeEls[n.id], t = textEls[n.id].t;
        setGeo(r, 'x', L.xL); setGeo(r, 'y', n.y); setGeo(r, 'width', L.NW); setGeo(r, 'height', Math.max(n.lh, 0.01));
        setGeo(t, 'x', L.xL - 6); setGeo(t, 'y', n.cy);
      }
      for (let i = 0; i < L.right.length; i++) {
        const n = L.right[i], r = nodeEls[n.id], t = textEls[n.id].t;
        setGeo(r, 'x', L.xR); setGeo(r, 'y', n.y); setGeo(r, 'width', L.NW); setGeo(r, 'height', Math.max(n.lh, 0.01));
        setGeo(t, 'x', L.xR + L.NW + 6); setGeo(t, 'y', n.cy);
        if (n.id === 'carried') {
          const on = n.room > 0.5;
          setHidden(roomEl, !on);
          setGeo(roomEl, 'x', L.xR + 0.75); setGeo(roomEl, 'y', n.y + n.lh); setGeo(roomEl, 'width', L.NW - 1.5); setGeo(roomEl, 'height', Math.max(0, n.room - 0.75));
        }
      }
    }
    const fw = FW;
    if (fShown && fw > 0) {
      const T = tugPartsInto(tugP, fShown.out, fShown.pull, fw), cy = bar * em / 2;
      place(segPush, T.push, 0); place(segPull, T.pull, 0);
      lPush.at(T.push.x, T.push.w, cy, em); lPull.at(T.pull.x, T.pull.w, cy, em);
      wallBuf[0] = T.wall + 0.75; wallBuf[1] = 0; wallBuf[2] = T.wall + 0.75; wallBuf[3] = bar * em;
      setPts(wall, wallBuf, opts.window ? 0 : 2, false);   // (the day card's tile has no dashed line at the wall: the gap between the two parts is the wall)
      glTug.paint();
    }
  }
  // (A word fades to where its goal says: shown when it fits where its part is going, else gone: kept on the word, drawn by the picture.)
  const fadeWord = (L, a) => {
    const to = L.on ? 1 : 0, d = to - L.v;
    if (Math.abs(d) > 0.01) { L.v += a * d; return true; }
    L.v = to;
    return false;
  };
  function tick(now) {
    raf = 0;
    if (dead) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now;
    const a = 1 - Math.exp(-dt / 0.15);
    let moving = false;
    if (goal) {
      if (!shown) { for (let i = 0; i < GKEYS.length; i++) if (GKEYS[i] in goal) shownO[GKEYS[i]] = goal[GKEYS[i]]; shown = shownO; }
      for (let i = 0; i < GKEYS.length; i++) {
        const k = GKEYS[i];
        if (!(k in goal)) continue;
        if (!(k in shown)) shown[k] = goal[k];
        const d = goal[k] - shown[k];
        if (Math.abs(d) > (k.charCodeAt(0) === 100 ? 0.05 : 1e-4)) { shown[k] += a * d; moving = true; } else shown[k] = goal[k];
      }
    }
    if (fGoal) {
      if (!fShown) { fShownO.out = fGoal.out; fShownO.pull = fGoal.pull; fShown = fShownO; }
      for (let i = 0; i < 2; i++) { const k = i ? 'pull' : 'out', d = fGoal[k] - fShown[k]; if (Math.abs(d) > 1e-3) { fShown[k] += a * d; moving = true; } else fShown[k] = fGoal[k]; }
    }
    let fading = false;
    if (fadeWord(lPush, a)) fading = true;
    if (fadeWord(lPull, a)) fading = true;
    draw();
    if (moving || fading) raf = frame(tick, 'tool-fluid'); else last = 0;
  }
  let dead = false, ro = null;
  const kick = () => { if (!dead && !raf && typeof requestAnimationFrame === 'function') raf = frame(tick, 'tool-fluid'); };
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => { W = flowBox.getBoundingClientRect().width; gl.relook(); glStrip.relook(); glTug.relook(); TW = trk.clientWidth; FW = tug.clientWidth; roSeen = true; labSig = ''; labels(); draw(); kick(); });
    ro.observe(el); ro.observe(trk); ro.observe(tug); ro.observe(flowBox);
  }
  document.fonts?.ready.then(() => { labSig = ''; labels(); });
  let opts = {}, pinned = null;
  function paint(f) {
    if (!f) return;
    for (let i = 0; i < KEYS.length; i++) goalO[KEYS[i]] = f[KEYS[i]];
    goal = goalO;
    const into = Math.max(0, f.made - f.carried);
    set(textEls.liver.v, mlMin(f.hep)); set(textEls.gut.v, mlMin(f.spl));
    set(textEls.carried.v, f.spare > 0.05 ? `${mlMin(f.carried)} of ${mlMin(f.cap)}` : mlMin(f.carried));
    set(textEls.back.v, mlMin(f.back));
    set(textEls.build.v, f.net < 0 ? `−${mlMin(-f.net)}` : mlMin(Math.max(0, into - Math.min(f.back, into))));
    set(words, fluidWords(f));
    if (opts.window) {
      const d = fluidDay(f), sw = dayWords(d);
      day = d;
      Object.assign(goal, { dCar: d.carried, dOver: d.over, dBack: d.back, dRoom: Math.max(0, d.room) });
      set(sMade, mlInt(d.made)); set(sLimit, sw.limit); set(sTitle, sw.title); set(sNet, sw.net); set(sDetail, sw.detail);
      sNet.dataset.dir = sw.dir;
      el.setAttribute('aria-label', `Fluid balance, mL a day: ${sw.title}${d.net ? `, ${mlInt(Math.abs(d.net))}` : ''}. ${mlInt(d.made)} of lymph made (liver ${mlInt(d.liver)}, gut ${mlInt(d.gut)}); the lymphatics carry ${mlInt(d.carried)} of the ${mlInt(d.limit)} they can${d.room > 0 ? `, ${mlInt(d.room)} to spare` : ''}. ${sw.detail}`);
      labels(); kick();
      return;
    }
    el.setAttribute('aria-label', `Fluid balance: ${mlMin(f.made)} mL/min of lymph made (liver ${mlMin(f.hep)}, gut ${mlMin(f.spl)}); the lymphatics carry ${mlMin(f.carried)} of the ${mlMin(f.cap)} they can, the belly takes back ${mlMin(f.back)}. ${fluidWords(f)}`);
    kick();
  }
  // (Live, the push swings with each breath, as the belly's pressure does: eased over a few seconds, so it reads the
  // breath's middle, not its moment. At rest the slide's own state sets both.)
  let fAvg = null, fAt = 0, fPin = null;
  function paintForces(fr) {
    if (!opts.forces) return;
    let fo = fPin;
    if (!fo) {
      const raw = sinusoidForces(fr?.Pf || fr?.P, store.get().params, fr?.metrics?.ascites?.iap);
      if (!raw) return;
      const now = performance.now(), a = fAvg ? 1 - Math.exp(-Math.min(1, (now - fAt) / 1000) / 3) : 1;
      fAt = now; fAvg = fAvg ? { out: fAvg.out + a * (raw.out - fAvg.out), pull: fAvg.pull + a * (raw.pull - fAvg.pull) } : raw;
      fo = fAvg;
    }
    const net = fo.out - fo.pull;
    set(fNet, `${fmt(Math.max(0, fo.out), 1)} out − ${fmt(fo.pull, 1)} in = net ${fmt(Math.abs(net), 1)} ${net >= 0 ? 'out' : 'in'}`);
    set(wNum, fmt(Math.abs(net), 1)); set(wUnit, net >= 0 ? 'mmHg out' : 'mmHg in'); set(wFoot, `Push ${fmt(Math.max(0, fo.out), 1)} · Pull ${fmt(fo.pull, 1)}`);   // (the two forces' values live here, in the page's own words: the bars' words sit inside only when they fit)
    fGoal = { out: Math.max(0, fo.out), pull: fo.pull }; labels(); kick();
  }
  return {
    el,
    // The slide's own state at rest (a fingerprint with the fluid terms); a live one without them (a time-lapse or a what-if,
    // presenter liveFp) hands the bars to the live model's frames until the slide's state is pinned again.
    pin(fp) { const f = fluidOf(fp); pinned = f; if (f) paint(f); fPin = f ? pinnedForces(fp, store.get().params) : null; if (fPin) paintForces(null); },
    update(fr) {
      if (!pinned) paint(fluidOf(fr?.metrics));
      paintForces(fr);
    },
    // (The caveat shows on a slide whose patient is on diuretics, or whose compare buttons give them, or that asks for it:
    // set once for the slide, so the card keeps its size while a button is pressed.)
    configure(t, ctx) {
      opts = t || {};
      forces.hidden = !opts.forces || !!opts.window;   // (the day card has its wall pressure in a tile of its own)
      const cav = !!(opts.caveat || ctx?.params?.diuretics || ctx?.slide?.compare?.some?.((c) => c?.params?.diuretics));
      // (window: true draws the day strip in place of the flow picture; its title carries the unit, and it has no caveat line:
      // Mohammad removed it, 20 Oct)
      const wo = !!opts.window;
      el.classList.toggle('gf-window', wo);
      win.hidden = !wo; flowBox.hidden = wo;
      unit.hidden = words.hidden = wo;
      caveat.hidden = wo || !cav;
      // (the day card: the lymph tile alone where the slide has no forces, or both side by side; the forces' track stands in the wall tile
      // as a thin gauge, rounded and without words, and goes back under the flow picture otherwise)
      wallTile.hidden = !(wo && opts.forces); tiles.classList.toggle('solo', !(wo && opts.forces));
      (wo && opts.forces ? wallHost : forces).append(tug);
      bar = wo ? GAUGE : BAR;
      segPush._shape(wo ? [0.25, 0.25] : [0.4, 0.7], wo ? [END_ROUND, END_ROUND] : [END_ROUND, END_POINT]);
      segPull._shape(wo ? [0.25, 0.25] : [0.7, 0.4], wo ? [END_ROUND, END_ROUND] : [END_POINT, END_ROUND]);
      lPush.on = lPull.on = false; lPush.v = lPull.v = 0;
      labSig = '';
      if (pinned) paint(pinned);
    },
    // (2 Nov 2026, bug sweep: each presentation makes its own instrument (presenter-tools.js dispose), and this one had no dispose: its
    // GPU drawer (buffers, arrays and textures in the shared chart context), its observer and its frame stayed for the session.)
    dispose() {
      if (dead) return;
      dead = true;
      cancelFrame(raf); raf = 0;
      ro?.disconnect(); ro = null;
      gl.dispose?.(); glStrip.dispose?.(); glTug.dispose?.();
    },
  };
}
