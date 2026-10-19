// Deck visuals, package G, V19: a vessel in cross-section on a slide's data card, tool { kind: 'lumen', vessel: 'PV_TRUNK' }.
// Drawn flat: the open lumen in the vessel's colour, a clot as a crescent against the wall (a full disc when occlusive), a
// narrowing as a thicker wall, a stent as a fine ring, and the open area as a percentage. It reads the live model's params
// (params.thrombus and params.stenosis for the vessel, combined as engine.js occlusion), so it moves with a clot-size slider,
// a compare button or the days of anticoagulation, easing from one state to the next.

import { h, clamp } from './util.js?v=8813192ea2';
import { EDGES } from '../engine/topology.js?v=4044766e96';
import { store } from './store.js?v=31ee79b6ab';
import { frameFor } from './frame.js?v=67ca200c87';
const nextFrame = frameFor('lumen');

const STENTS = new Set(['TIPS', 'DIPS']);
// The systemic veins the tool may show (the rest of the venous side carries portal blood, as a stent does; an artery is red).
const SYSTEMIC = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA', 'IVCI', 'IVCS']);
const NAME = { PV_TRUNK: 'main portal vein', PVH_R: 'right portal vein', PVH_L: 'left portal vein', SV_CONF: 'splenic vein', SV_MID: 'splenic vein', V_SPL: 'splenic vein',
  SMV_CONF: 'superior mesenteric vein', RHV_IVC: 'right hepatic vein', MHV_IVC: 'middle hepatic vein', LHV_IVC: 'left hepatic vein', IVCS_RA: 'inferior vena cava', TIPS: 'TIPS', DIPS: 'DIPS' };
export const lumenName = (id) => NAME[id] || EDGES.find((e) => e.id === id)?.label?.toLowerCase() || 'portal vein';

/** A vessel's lumen from the model's params: clot and narrowing (0 to 1 each), combined as the engine combines them
 *  (engine.js occlusion: 1 − (1 − narrowing)(1 − clot)), and the open fraction of the lumen that is left. */
export function lumenOf(params, id) {
  const st = clamp(+params?.stenosis?.[id] || 0, 0, 1), th = clamp(+params?.thrombus?.[id] || 0, 0, 1);
  const occlusion = 1 - (1 - st) * (1 - th);
  return { stenosis: st, thrombus: th, occlusion, open: 1 - occlusion, stent: STENTS.has(id) };
}

/** The picture in a 100-unit box: the wall's outer edge R, the lumen inside a narrowing (radius ri, its area 1 − narrowing
 *  of the open vessel's), and the channel a clot leaves, a circle against the top of the lumen whose area is 1 − clot of
 *  the lumen's (so the crescent between them is the clot, and the channel's area is the open fraction of the vessel's).
 *  A stent's ring sits at the vessel's own lumen, outside any narrowing inside it. */
export const LUMEN_R = 46, LUMEN_WALL = 5;
export function lumenShape({ stenosis = 0, thrombus = 0 }) {
  const R0 = LUMEN_R - LUMEN_WALL, ri = R0 * Math.sqrt(clamp(1 - stenosis, 0, 1)), ro = ri * Math.sqrt(clamp(1 - thrombus, 0, 1));
  return { cx: 50, cy: 50, R: LUMEN_R, R0, ri, ro, oy: 50 - (ri - ro) };
}

/** The words for the state: an occlusive clot, a partial clot, a narrowing, or open. */
export function lumenWords({ thrombus, stenosis, occlusion, stent }) {
  if (occlusion >= 0.97) return thrombus >= stenosis ? 'Occlusive clot' : stent ? 'Stent closed' : 'Closed';
  if (thrombus >= 0.05 && thrombus >= stenosis) return 'Partial clot';
  if (stenosis >= 0.05) return stent ? 'Stent narrowed' : 'Narrowed';
  return 'Open';
}
const pct = (x) => `${Math.round(clamp(x, 0, 1) * 100)}`;

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };

export function createLumen() {
  let id = 'PV_TRUNK';
  const wall = sv('circle', { class: 'gl-wall', cx: 50, cy: 50, r: LUMEN_R });
  const lumen = sv('circle', { class: 'gl-clot', cx: 50, cy: 50 });
  const chan = sv('circle', { class: 'gl-open', cx: 50 });
  const ring = sv('circle', { class: 'gl-stent', cx: 50, cy: 50, r: LUMEN_R - LUMEN_WALL });
  const pic = sv('svg', { class: 'gl-pic', viewBox: '0 0 100 100', role: 'img' });
  pic.append(wall, lumen, chan, ring);
  const big = h('b'), state = h('span', { class: 'gl-state' });
  // (the readings in the instruments' own tiles, as the varix wall's: endo-read, styles/app.css)
  const tile = (name, unit) => { const v = h('span'); const d = h('div', { class: 'endo-tile gl-tile' }, h('dt', {}, name), h('dd', { class: 'endo-num' }, v, h('small', {}, unit))); d.v = v; return d; };
  const clotT = tile('Clot', '%'), narT = tile('Narrowing', '%'), stentT = tile('Stent', 'mm'), stentV = stentT.v;
  const read = h('dl', { class: 'endo-read gl-read' },
    h('div', { class: 'gl-big' }, h('dt', {}, 'Open lumen'), h('dd', {}, big, h('small', {}, '%')), state), clotT, narT, stentT);
  const el = h('div', { class: 'gl' }, h('div', { class: 'gl-stage' }, pic), read);
  const set = (n, t) => { if (n.textContent !== t) n.textContent = t; };
  const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  // What the picture shows now, easing to the model's state (a compare button or a new slide jumps the params; the picture eases).
  let shown = null, goal = null, raf = 0, at = 0;
  function paint(x) {
    const g = lumenShape(x), L = { ...x, occlusion: 1 - (1 - x.stenosis) * (1 - x.thrombus), stent: STENTS.has(id) };
    lumen.setAttribute('r', g.ri.toFixed(2));
    chan.setAttribute('r', g.ro.toFixed(2)); chan.setAttribute('cy', g.oy.toFixed(2));
    chan.style.opacity = g.ro < 0.4 ? '0' : '';
    set(big, pct(1 - L.occlusion)); set(state, lumenWords(L));
    set(clotT.v, pct(x.thrombus)); set(narT.v, pct(x.stenosis));
    pic.setAttribute('aria-label', `${lumenName(id)} in cross-section: ${pct(1 - L.occlusion)}% of the lumen open, clot ${pct(x.thrombus)}%, narrowing ${pct(x.stenosis)}%`);
  }
  function tick(now) {
    raf = 0;
    const dt = at ? Math.min(0.1, (now - at) / 1000) : 0; at = now;
    const k = 1 - Math.exp(-dt / 0.16);
    shown = { stenosis: shown.stenosis + (goal.stenosis - shown.stenosis) * k, thrombus: shown.thrombus + (goal.thrombus - shown.thrombus) * k };
    const done = Math.abs(goal.stenosis - shown.stenosis) < 0.002 && Math.abs(goal.thrombus - shown.thrombus) < 0.002;
    if (done) shown = { ...goal };
    paint(shown);
    if (!done) raf = nextFrame(tick); else at = 0;
  }
  function update() {
    const prm = store.get().params, L = lumenOf(prm, id);
    goal = { stenosis: L.stenosis, thrombus: L.thrombus };
    if (L.stent) set(stentV, String(Math.round((prm?.tips?.d ?? 10) * 10) / 10));
    if (!shown || reduce?.matches || !el.isConnected) { shown = { ...goal }; paint(shown); return; }
    if ((goal.stenosis !== shown.stenosis || goal.thrombus !== shown.thrombus) && !raf) raf = nextFrame(tick);
  }
  /** The slide's vessel (tool.vessel). A new vessel is drawn at once, in its own colour. */
  function configure(t) {
    const v = t?.vessel || 'PV_TRUNK';
    if (v !== id || !shown) { id = v; shown = null; }
    el.dataset.vessel = SYSTEMIC.has(id) ? 'systemic' : id.startsWith('A_') ? 'artery' : 'portal';
    ring.style.display = STENTS.has(id) ? '' : 'none';
    stentT.hidden = !STENTS.has(id);
    update();
  }
  return { el, update, configure };
}
