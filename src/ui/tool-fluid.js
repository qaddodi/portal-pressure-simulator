// Deck visuals, package G, V27: the fluid balance on a slide's data card, tool { kind: 'fluid' } (forces: true adds the forces
// across the sinusoid wall; caveat: true always shows the line that its rates are the model's own).
// A flow picture: the lymph made (the liver's and the gut's) splitting into what the lymphatics carry, what the belly takes
// back and what stays as ascites, each band as thick as its flow. The lymphatics' node runs on, dashed, to their capacity:
// the room they still have. These are the model's own terms
// (engine.js starling), read from the slide's fingerprint at rest and from the live model while a time-lapse, a what-if or a
// compare button moves it.

import { h, fmt, clamp } from './util.js?v=8813192ea2';
import { NODES } from '../engine/topology.js?v=4044766e96';
import { store } from './store.js?v=31ee79b6ab';

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
  // The forces across the sinusoid wall (forces: true): the wall in the middle, the push from the blood's side and the pull
  // from the tissue's side, each an arrow as long as its pressure, the net under them.
  const fsvg = sv('svg', { class: 'gf-fsvg', height: 46, 'aria-hidden': 'true' });
  const wall = sv('line', { class: 'gf-wall' }), aOut = sv('path', { class: 'gf-push' }), aIn = sv('path', { class: 'gf-pull' });
  const tOut = sv('text', { class: 'gf-t', x: 0, y: 13 }), tIn = sv('text', { class: 'gf-t', y: 13, 'text-anchor': 'end' });
  const tOutV = sv('tspan', { class: 'gf-tv', dx: 5 }), tInV = sv('tspan', { class: 'gf-tv', dx: 5 });
  tOut.append(document.createTextNode('Pushing out'), tOutV); tIn.append(document.createTextNode('Pulling in'), tInV);
  fsvg.append(wall, aOut, aIn, tOut, tIn);
  const fNet = h('span', { class: 'gf-unit' });
  const forces = h('div', { class: 'gf-forces' }, fsvg, fNet);
  const caveat = h('p', { class: 'gf-caveat' }, 'Model rates, not clinical figures.');
  const el = h('div', { class: 'gf', role: 'img' }, flow, unit, words, forces, caveat);
  const set = (n, t) => { if (n.textContent !== t) n.textContent = t; };
  let W = 0, FW = 0, goal = null, shown = null, fGoal = null, fShown = null, raf = 0, last = 0;
  // (everything eases: the drawn values follow the goal over about half a second; the numbers swap in place)
  const KEYS = ['hep', 'spl', 'made', 'cap', 'carried', 'spare', 'back', 'net', 'perDay'];
  function draw() {
    if (shown && W > 0) {
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
    if (fShown && FW > 0) {
      const mid = FW / 2, top = Math.max(fShown.out, fShown.pull, 1), len = (v) => Math.max(8, (Math.max(0, v) / top) * (mid - 14)), y = 32;
      wall.setAttribute('x1', mid); wall.setAttribute('x2', mid); wall.setAttribute('y1', 21); wall.setAttribute('y2', 44);
      const lo = len(fShown.out), li = len(fShown.pull);
      aOut.setAttribute('d', `M${mid - 4 - lo},${y - 2.5}H${mid - 12}V${y - 7}L${mid - 4},${y}L${mid - 12},${y + 7}V${y + 2.5}H${mid - 4 - lo}Z`);
      aIn.setAttribute('d', `M${mid + 4 + li},${y - 2.5}H${mid + 12}V${y - 7}L${mid + 4},${y}L${mid + 12},${y + 7}V${y + 2.5}H${mid + 4 + li}Z`);
      tIn.setAttribute('x', FW);
    }
  }
  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now;
    const a = 1 - Math.exp(-dt / 0.15);
    let moving = false;
    if (goal) {
      if (!shown) shown = { ...goal };
      for (const k of KEYS) { const d = goal[k] - shown[k]; if (Math.abs(d) > 1e-4) { shown[k] += a * d; moving = true; } else shown[k] = goal[k]; }
    }
    if (fGoal) {
      if (!fShown) fShown = { ...fGoal };
      for (const k of ['out', 'pull']) { const d = fGoal[k] - fShown[k]; if (Math.abs(d) > 1e-3) { fShown[k] += a * d; moving = true; } else fShown[k] = fGoal[k]; }
    }
    draw();
    if (moving) raf = requestAnimationFrame(tick); else last = 0;
  }
  const kick = () => { if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick); };
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => { W = flow.getBoundingClientRect().width; FW = fsvg.getBoundingClientRect().width; draw(); }).observe(el);
  }
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
    set(tOutV, fmt(Math.max(0, fo.out), 1)); set(tInV, fmt(fo.pull, 1));
    const net = fo.out - fo.pull;
    set(fNet, `mmHg across the sinusoid wall: net ${fmt(Math.abs(net), 1)} ${net >= 0 ? 'out' : 'in'}`);
    fGoal = { out: fo.out, pull: fo.pull }; kick();
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
      caveat.hidden = !(opts.caveat || ctx?.params?.diuretics || ctx?.slide?.compare?.some?.((c) => c?.params?.diuretics));
    },
  };
}
