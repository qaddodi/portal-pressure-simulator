// Deck visuals, package G, V27: the fluid balance on a slide's data card, tool { kind: 'fluid' } (forces: true adds the forces
// across the sinusoid wall; caveat: true always shows the line that its rates are the model's own).
// A flow picture: the lymph made (the liver's and the gut's) splitting into what the lymphatics carry, what the belly takes
// back and what stays as ascites, each band as thick as its flow. The lymphatics' node runs on, dashed, to their capacity:
// the room they still have. These are the model's own terms
// (engine.js starling), read from the slide's fingerprint at rest and from the live model while a time-lapse, a what-if or a
// compare button moves it.

import { frame } from './frame.js?v=226365e6e2';
import { h, fmt, clamp } from './util.js?v=a7f8549e15';
import { NODES } from '../engine/topology.js?v=4044766e96';
import { store } from './store.js?v=926dabfaef';

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

/** The day strip's words (window: true) for a day's numbers: the carried part's label (with "full" once the lymphatics can carry
 *  no more), the room they have left, what the day's change is called, and the name of its swatch. */
export function stripWords(d) {
  const carried = `Carried ${mlInt(d.carried)}`;
  return { carried: [d.room > 0 ? carried : `${carried} · full`, carried], spare: d.room > 0 ? `${mlInt(d.room)} to spare` : '',
    day: d.net > 0 ? 'ascites builds' : d.net < 0 ? 'ascites shrinks' : d.over > 0 ? 'steady' : 'no ascites', net: d.net < 0 ? 'Shrinks' : 'Builds' };
}

/** The day strip's parts, as px of a track W wide, from the day's numbers in mL (continuous ones: the eased values while it moves):
 *  carried (what the lymphatics carry), then what the belly reabsorbs of what leaked (blue), what it reabsorbs beyond that (shrink:
 *  the ascites going down) and what stays (build: the ascites going up); the dashed room (what the lymphatics could still carry)
 *  follows them. The strip is the day's flow on one scale: carried + the larger of leaked and reabsorbed + the room. A part with
 *  anything in it shows at least STRIP_MARK px (so 10 mL a day is still a mark), continuous in its value, so an eased value never
 *  makes a step; STRIP_GAP px keep the parts apart. The bracket spans what leaked, from where the carried part ends.
 *  Returns px: car, blue, shrink, build and room ({ x, w }; room also op, its opacity, which follows its width) and brk ({ x, w, op }). */
export const STRIP_GAP = 2, STRIP_MARK = 2.5;
export function stripParts(g, W) {
  const carried = Math.max(0, g.carried), over = Math.max(0, g.over), back = Math.max(0, g.back), room = Math.max(0, g.room);
  const k = W / Math.max(carried + Math.max(back, over) + room, 1);
  const mark = (v) => { const px = v * k; return px + STRIP_MARK * clamp(px / 0.5, 0, 1); };
  const w = { blue: mark(Math.min(back, over)), shrink: mark(Math.max(0, back - over)), build: mark(Math.max(0, over - back)), room: room * k };
  w.car = Math.max(0, Math.min(carried * k, W - w.blue - w.shrink - w.build - w.room));
  // (the parts run end to end, each drawn short of the next by the gap once anything follows it)
  const order = ['car', 'blue', 'shrink', 'build', 'room'], out = {};
  let x = 0;
  order.forEach((id, i) => {
    const after = order.slice(i + 1).reduce((a, n) => a + w[n], 0);
    out[id] = { x, w: Math.max(0, w[id] - (id === 'room' ? 0 : STRIP_GAP * clamp(after / (STRIP_MARK + STRIP_GAP), 0, 1))) };
    x += w[id];
  });
  out.room.op = clamp(w.room / 12, 0, 1);
  out.brk = { x: w.car, w: w.blue + w.build, op: clamp(over * k / 0.5, 0, 1) };
  return out;
}

/** The forces strip's parts, as px of a track W wide: the push from the blood's side and the pull from the tissue's side as two
 *  arrows meeting at the wall, each as long as its pressure (their sum is the track). */
export function tugParts(out, pull, W) {
  const o = Math.max(0, out), p = Math.max(0, pull), wall = o + p > 0 ? (o / (o + p)) * W : W / 2;
  return { push: { x: 0, w: Math.max(0, wall - 1.5) }, pull: { x: wall + 1.5, w: Math.max(0, W - wall - 1.5) }, wall };
}

const mlMin = (x) => fmt(Math.max(0, x), x < 10 ? 1 : 0);

/** The flow picture's geometry for a width W (px, the card's own, so text stays at its CSS size): the liver's and the gut's
 *  lymph on the left, each a band as thick as its flow, splitting into what the lymphatics carry, what the belly takes back
 *  and what stays as ascites on the right. Bands are matched by sweeping both columns' running totals, so every mL/min that
 *  leaves the left arrives on the right. The lymphatics' node runs on, dashed, to their capacity (the room they still have).
 *  Labels sit beside their nodes, centres at least 18 px apart (13 px text with a gap over 4 px). */
export const FLOW_H = 128;
export function fluidFlows(f, W, H = FLOW_H) {
  const LW = 78, RW = 142, NW = 8, MAXB = 64, LINE = 18, MIN = 2;
  const xL = LW, xR = Math.max(xL + NW + 40, W - RW - NW);
  const into = Math.max(0, f.made - f.carried), back = Math.min(Math.max(0, f.back), into), build = Math.max(0, into - back);
  const k = MAXB / Math.max(f.made, f.cap + into, 0.1);
  const th = (v) => (v > 0.005 ? Math.max(MIN, v * k) : 0);
  // (a column: nodes stacked with gaps so the labels at their centres keep LINE apart, then centred in H)
  const column = (nodes) => {
    let y = 0, prev = null;
    for (const n of nodes) {
      if (prev) y += Math.max(6, LINE - prev.lh / 2 - n.lh / 2);
      n.y = y; y += n.h; prev = n;
    }
    const top = Math.max(0, (H - y) / 2);
    for (const n of nodes) { n.y += top; n.cy = n.y + n.lh / 2; }
    return nodes;
  };
  const left = column([{ id: 'liver', v: f.hep }, { id: 'gut', v: f.spl }].map((n) => ({ ...n, h: th(n.v), lh: th(n.v) })));
  const roomH = f.spare > 0.005 ? f.spare * k : 0;
  const rightAll = [
    { id: 'carried', v: f.carried, h: th(f.carried) + roomH, lh: th(f.carried), room: roomH },
    { id: 'back', v: back, h: th(back), lh: th(back), show: f.back > 0.005 },
    { id: 'build', v: build, h: th(build), lh: th(build), show: f.net > 0.005 || f.perDay <= -10 },
  ];
  const right = column(rightAll.filter((n) => n.id === 'carried' || n.show));
  // (each band: where the left node's share starts and the right node's share starts, by running totals)
  const bands = [];
  let a0 = 0;
  for (const L of left) {
    const a1 = a0 + L.v; let b0 = 0;
    for (const R of right) {
      const b1 = b0 + R.v, lo = Math.max(a0, b0), hi = Math.min(a1, b1);
      if (hi - lo > 1e-6) {
        const tk = (hi - lo) * k, ly = L.y + (lo - a0) * k * (L.lh / Math.max(L.v * k, 1e-9)), ry = R.y + (lo - b0) * k * (R.lh / Math.max(R.v * k, 1e-9));
        bands.push({ from: L.id, to: R.id, ly, ry, t: Math.max(1, Math.min(tk, L.lh, R.lh)) });
      }
      b0 = b1;
    }
    a0 = a1;
  }
  return { xL, xR, NW, left, right, bands, W, H };
}

const SVG = 'http://www.w3.org/2000/svg';
const sv = (tag, a = {}) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
const band = (x0, y0, x1, y1, t) => { const m = (x0 + x1) / 2; return `M${x0},${y0}C${m},${y0} ${m},${y1} ${x1},${y1}L${x1},${y1 + t}C${m},${y1 + t} ${m},${y0 + t} ${x0},${y0 + t}Z`; };
const NAMES = { liver: 'Liver', gut: 'Gut', carried: 'Lymphatics', back: 'Taken back', build: 'Ascites' };
const FILL = { liver: 'gf-liver', gut: 'gf-gut', carried: 'gf-carried', back: 'gf-back', build: 'gf-build' };

export function createFluid() {
  // The flow picture: one SVG drawn at the card's own width (a ResizeObserver redraws it), so its 13 px labels stay 13 px.
  const flow = sv('svg', { class: 'gf-flow', height: FLOW_H, 'aria-hidden': 'true' });
  const gBands = sv('g'), gNodes = sv('g'), gText = sv('g');
  flow.append(gBands, gNodes, gText);
  const bandEls = {}, nodeEls = {}, roomEl = sv('rect', { class: 'gf-room', rx: 2 }), textEls = {};
  gNodes.append(roomEl);
  for (const id of Object.keys(NAMES)) {
    nodeEls[id] = sv('rect', { class: `gf-node ${FILL[id]}`, rx: 2 }); gNodes.append(nodeEls[id]);
    const t = sv('text', { class: 'gf-t' }), n = sv('tspan', {}), v = sv('tspan', { class: 'gf-tv', dx: 5 });
    t.append(n, v); n.textContent = NAMES[id]; textEls[id] = { t, v }; gText.append(t);
  }
  for (const a of ['liver', 'gut']) for (const b of ['carried', 'back', 'build']) { bandEls[`${a}-${b}`] = sv('path', { class: `gf-band ${FILL[b]}` }); gBands.append(bandEls[`${a}-${b}`]); }
  const unit = h('span', { class: 'gf-unit' }, 'mL/min');
  const words = h('p', { class: 'gf-words' });
  const caveat = h('p', { class: 'gf-caveat' }, 'Model rates, not clinical figures.');
  // The day strip (window: true; Mohammad's pick "One strip", 21 Oct): the answer first (what the day's change is, in the ascites
  // colour), then the lymph made and its two sources, then one strip that splits the day on one scale: what the lymphatics carry
  // (named inside, "full" once they can carry no more), what the belly reabsorbs, what builds; a bracket over what leaked. A part
  // with nothing in it is a dashed swatch and a dashed outline of the room the lymphatics have left, so nothing pops in or out
  // and a number never floats without its mark. The numbers swap in place; the strip's parts ease (stripParts has the sizes).
  const num = () => h('b', {}, '');
  const sNet = num(), sWord = h('span', { class: 'gs-word' }), sMadeN = num(), sCarN = num(), sLiv = num(), sGut = num(), sLeak = num(), sBack = num(), sBuildN = num();
  const swCar = h('i', { class: 'gs-sw gs-sw-car' }), swBack = h('i', { class: 'gs-sw gs-sw-back' }), swBuild = h('i', { class: 'gs-sw gs-sw-build' }), nBuild = h('span', {}, 'Builds ');
  const inn = () => h('span', { class: 'gs-in' });
  const tCar = inn(), tSpare = inn();
  const segCar = h('i', { class: 'gs-seg gs-car' }, tCar), segBlue = h('i', { class: 'gs-seg gs-blue' }), segShrink = h('i', { class: 'gs-seg gs-shrink' }), segBuild = h('i', { class: 'gs-seg gs-build' });
  const segRoom = h('i', { class: 'gs-ghost' }, tSpare), brk = h('i', { class: 'gs-brk' });
  const trk = h('div', { class: 'gs-trk' }, segCar, segBlue, segShrink, segBuild, segRoom);
  const legCar = h('span', {}, swCar, 'Carried ', sCarN);
  const lab = h('div', { class: 'gs-lab' }, legCar, h('span', {}, swBack, 'Reabsorbed ', sBack, h('span', { class: 'gs-gap' }, swBuild, nBuild, sBuildN)));
  const meas = h('span', { class: 'gs-meas', 'aria-hidden': 'true' });
  const win = h('div', { class: 'gs' },
    h('div', { class: 'gs-hero' }, h('span', {}, 'Each day', sWord), sNet),
    h('div', { class: 'gs-cap' }, h('span', {}, 'Lymph made ', sMadeN), h('span', { class: 'gs-dim' }, 'Liver ', sLiv, ' + Gut ', sGut)),
    h('div', { class: 'gs-brkrow' }, brk, h('span', {}, 'Leaked ', sLeak)),
    trk, lab, meas);
  // The forces across the sinusoid wall (forces: true): a line naming the wall and the net, over one strip: the push from the
  // blood's side and the pull from the tissue's side as two arrows meeting at the wall, each as long as its pressure, named inside.
  const fNet = h('b'), tPush = inn(), tPull = inn();
  const segPush = h('i', { class: 'gs-seg gs-push' }, tPush), segPull = h('i', { class: 'gs-seg gs-pull' }, tPull), wall = h('i', { class: 'gs-wall' });
  const tug = h('div', { class: 'gs-trk gs-tug' }, segPush, segPull, wall);
  const forces = h('div', { class: 'gs-forces' }, h('div', { class: 'gs-fcap' }, h('span', {}, 'Across the sinusoid wall · mmHg'), h('span', {}, 'net ', fNet)), tug);
  const el = h('div', { class: 'gf', role: 'img' }, win, flow, unit, words, forces, caveat);
  const set = (n, t) => { if (n.textContent === t) return false; n.textContent = t; return true; };
  const px = (v) => `${v.toFixed(2)}px`;
  const place = (n, p) => { n.style.left = px(p.x); n.style.width = px(p.w); };
  let W = 0, goal = null, shown = null, fGoal = null, fShown = null, raf = 0, last = 0, day = null, labSig = '';
  // (everything eases: the drawn values follow the goal over about half a second; the numbers swap in place)
  const KEYS = ['hep', 'spl', 'made', 'cap', 'carried', 'spare', 'back', 'net', 'perDay'];
  const dayOf = (f) => ({ carried: f.dCar, over: f.dOver, back: f.dBack, room: f.dRoom });
  // A label sits inside its part when it fits (the text and 1.05 em beside it), else it is hidden; decided from where the parts
  // are going, never from where they are mid-ease, so a label fades once, not as the part grows past it.
  const fit = (n, cands, room, em) => {
    for (const c of cands) { meas.textContent = c; if (meas.offsetWidth + em * 1.05 <= room) { set(n, c); n.style.opacity = ''; return true; } }
    n.style.opacity = '0'; return false;
  };
  function labels() {
    const tw = trk.clientWidth, fw = tug.clientWidth;
    const sig = `${tw}|${fw}|${day ? JSON.stringify(day) : ''}|${fGoal ? `${fmt(fGoal.out, 1)}${fmt(fGoal.pull, 1)}` : ''}`;
    if (sig === labSig) return;
    labSig = sig;
    const em = parseFloat(getComputedStyle(win).fontSize) || 14;
    if (opts.window && day && tw) {
      const P = stripParts(dayOf(goal), tw), sw = stripWords(day);
      const seen = fit(tCar, sw.carried, P.car.w, em);
      // (the Carried swatch in the line under the strip only while its name does not fit inside the part)
      legCar.style.display = seen ? 'none' : ''; lab.style.justifyContent = seen ? 'flex-end' : 'space-between';
      if (day.room > 0) fit(tSpare, [sw.spare], P.room.w - 4, em); else tSpare.style.opacity = '0';
    }
    if (fGoal && fw) {
      const T = tugParts(fGoal.out, fGoal.pull, fw), pad = em * 0.7;
      fit(tPush, [`Pushing out ${fmt(fGoal.out, 1)}`, fmt(fGoal.out, 1)], T.push.w - pad, em);
      fit(tPull, [`Pulling in ${fmt(fGoal.pull, 1)}`, fmt(fGoal.pull, 1)], T.pull.w - pad, em);
    }
  }
  function draw() {
    if (opts.window) {
      const tw = trk.clientWidth;
      if (shown && tw > 0 && 'dCar' in shown) {
        const P = stripParts(dayOf(shown), tw);
        place(segCar, P.car); place(segBlue, P.blue); place(segShrink, P.shrink); place(segBuild, P.build); place(segRoom, P.room);
        segRoom.style.opacity = P.room.op.toFixed(3);
        brk.style.left = px(P.brk.x); brk.style.width = px(P.brk.w); brk.style.opacity = P.brk.op.toFixed(3);
      }
    } else if (shown && W > 0) {
      const L = fluidFlows(shown, W);
      for (const id in bandEls) bandEls[id].setAttribute('d', '');
      for (const b of L.bands) bandEls[`${b.from}-${b.to}`].setAttribute('d', band(L.xL + L.NW, b.ly, L.xR, b.ry, b.t));
      for (const id of Object.keys(NAMES)) { const on = [...L.left, ...L.right].find((n) => n.id === id); nodeEls[id].style.display = on ? '' : 'none'; textEls[id].t.style.display = on ? '' : 'none'; }
      for (const n of L.left) { Object.entries({ x: L.xL, y: n.y, width: L.NW, height: Math.max(n.lh, 0.01) }).forEach(([a, v]) => nodeEls[n.id].setAttribute(a, v)); Object.entries({ x: L.xL - 6, y: n.cy, 'text-anchor': 'end' }).forEach(([a, v]) => textEls[n.id].t.setAttribute(a, v)); }
      for (const n of L.right) {
        Object.entries({ x: L.xR, y: n.y, width: L.NW, height: Math.max(n.lh, 0.01) }).forEach(([a, v]) => nodeEls[n.id].setAttribute(a, v));
        Object.entries({ x: L.xR + L.NW + 6, y: n.cy }).forEach(([a, v]) => textEls[n.id].t.setAttribute(a, v));
        if (n.id === 'carried') { roomEl.style.display = n.room > 0.5 ? '' : 'none'; Object.entries({ x: L.xR + 0.75, y: n.y + n.lh, width: L.NW - 1.5, height: Math.max(0, n.room - 0.75) }).forEach(([a, v]) => roomEl.setAttribute(a, v)); }
      }
    }
    const fw = tug.clientWidth;
    if (fShown && fw > 0) {
      const T = tugParts(fShown.out, fShown.pull, fw);
      place(segPush, T.push); place(segPull, T.pull); wall.style.left = px(T.wall);
    }
  }
  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now;
    const a = 1 - Math.exp(-dt / 0.15);
    let moving = false;
    if (goal) {
      if (!shown) shown = { ...goal };
      for (const k of Object.keys(goal)) { if (!(k in shown)) shown[k] = goal[k]; const d = goal[k] - shown[k]; if (Math.abs(d) > (k[0] === 'd' ? 0.05 : 1e-4)) { shown[k] += a * d; moving = true; } else shown[k] = goal[k]; }
    }
    if (fGoal) {
      if (!fShown) fShown = { ...fGoal };
      for (const k of ['out', 'pull']) { const d = fGoal[k] - fShown[k]; if (Math.abs(d) > 1e-3) { fShown[k] += a * d; moving = true; } else fShown[k] = fGoal[k]; }
    }
    draw();
    if (moving) raf = frame(tick, 'tool-fluid'); else last = 0;
  }
  const kick = () => { if (!raf && typeof requestAnimationFrame === 'function') raf = frame(tick, 'tool-fluid'); };
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => { W = flow.getBoundingClientRect().width; labSig = ''; draw(); labels(); }).observe(el);
  }
  document.fonts?.ready.then(() => { labSig = ''; labels(); });
  let opts = {}, pinned = null;
  function paint(f) {
    if (!f) return;
    goal = Object.fromEntries(KEYS.map((k) => [k, f[k]]));
    const into = Math.max(0, f.made - f.carried);
    set(textEls.liver.v, mlMin(f.hep)); set(textEls.gut.v, mlMin(f.spl));
    set(textEls.carried.v, f.spare > 0.05 ? `${mlMin(f.carried)} of ${mlMin(f.cap)}` : mlMin(f.carried));
    set(textEls.back.v, mlMin(f.back));
    set(textEls.build.v, f.net < 0 ? `−${mlMin(-f.net)}` : mlMin(Math.max(0, into - Math.min(f.back, into))));
    set(words, fluidWords(f));
    if (opts.window) {
      const d = fluidDay(f), sw = stripWords(d);
      day = d;
      Object.assign(goal, { dCar: d.carried, dOver: d.over, dBack: d.back, dRoom: Math.max(0, d.room) });
      set(sNet, d.net === 0 ? '0' : `${d.net > 0 ? '▲' : '▼'} ${mlInt(Math.abs(d.net))}`);
      sNet.dataset.dir = d.net > 0 ? 'up' : d.net < 0 ? 'down' : '';
      set(sWord, ` · ${sw.day}`);
      set(sMadeN, mlInt(d.made)); set(sCarN, mlInt(d.carried)); set(sLiv, mlInt(d.liver)); set(sGut, mlInt(d.gut));
      set(sLeak, mlInt(d.over)); set(sBack, mlInt(d.back)); set(sBuildN, mlInt(Math.abs(d.net))); set(nBuild, `${sw.net} `);
      // (a swatch is dashed while its part is empty; the day's change is green while the ascites shrinks)
      swBack.classList.toggle('none', d.back <= 0); swBuild.classList.toggle('none', d.net === 0); swBuild.classList.toggle('down', d.net < 0);
      el.setAttribute('aria-label', `Fluid balance, mL a day: ${mlInt(d.made)} of lymph made (liver ${mlInt(d.liver)}, gut ${mlInt(d.gut)}); the lymphatics carry ${mlInt(d.carried)} of the ${mlInt(d.limit)} they can${d.room > 0 ? `, ${mlInt(d.room)} to spare` : ', full'}. Ascites: ${mlInt(d.over)} leaked, ${mlInt(d.back)} reabsorbed: ${d.net === 0 ? 'no change' : `${d.net > 0 ? 'builds' : 'shrinks'} by ${mlInt(Math.abs(d.net))}`} a day.`);
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
    set(fNet, `${fmt(Math.abs(net), 1)} ${net >= 0 ? 'out' : 'in'}`);
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
      forces.hidden = !opts.forces;
      const cav = !!(opts.caveat || ctx?.params?.diuretics || ctx?.slide?.compare?.some?.((c) => c?.params?.diuretics));
      // (window: true draws the day strip in place of the flow picture; its title carries the unit, and it has no caveat line:
      // Mohammad removed it, 20 Oct)
      const wo = !!opts.window;
      el.classList.toggle('gf-window', wo);
      win.hidden = !wo; flow.style.display = wo ? 'none' : '';
      unit.hidden = words.hidden = wo;
      caveat.hidden = wo || !cav;
      labSig = '';
      if (pinned) paint(pinned);
    },
  };
}
