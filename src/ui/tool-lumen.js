// Deck visuals, package G, V19: a vessel in cross-section on a slide's data card, tool { kind: 'lumen', vessel: 'PV_TRUNK' }.
// Drawn flat: the open lumen in the vessel's colour, a clot shaped by its grade (EASL 2025), a
// narrowing as a thicker wall, a stent as a fine ring (the TIPS and DIPS, and a vein a slide shows stented: store.stented), and the open area as a percentage. It reads the live model's params
// (params.thrombus and params.stenosis for the vessel, combined as engine.js occlusion), so it moves with a clot-size slider,
// a compare button or the days of anticoagulation, easing from one state to the next.

import { h, clamp } from './util.js?v=543287bde4';
import { EDGES } from '../engine/topology.js?v=4044766e96';
import { store } from './store.js?v=a926bea9d4';
import { frameFor } from './frame.js?v=28a4369504';
const nextFrame = frameFor('lumen');

const STENTS = new Set(['TIPS', 'DIPS']);
/** Whether the vessel carries a stent: the TIPS and DIPS always, any other vein when the slide on screen stents it (store.stented). */
export const hasStent = (id, stented) => STENTS.has(id) || (Array.isArray(stented) && stented.includes(id));
// The systemic veins the tool may show (the rest of the venous side carries portal blood, as a stent does; an artery is red).
const SYSTEMIC = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'IVCS_RA', 'IVCI', 'IVCS']);
const NAME = { PV_TRUNK: 'main portal vein', PVH_R: 'right portal vein', PVH_L: 'left portal vein', SV_CONF: 'splenic vein', SV_MID: 'splenic vein', V_SPL: 'splenic vein',
  SMV_CONF: 'superior mesenteric vein', RHV_IVC: 'right hepatic vein', MHV_IVC: 'middle hepatic vein', LHV_IVC: 'left hepatic vein', IVCS_RA: 'inferior vena cava', TIPS: 'TIPS', DIPS: 'DIPS' };
export const lumenName = (id) => NAME[id] || EDGES.find((e) => e.id === id)?.label?.toLowerCase() || 'portal vein';
// The name written in the circle above the %, short enough to fit inside the lumen at the 12 px floor (a deck may set its own,
// tool.name, kept to about a dozen letters): "Right PV" and "Middle HV" abbreviate, as crowded vessel labels do. A stent is
// named by where along it the section is cut, as the Doppler names its segments: proximal is the portal end, distal the
// hepatic vein end ("Distal TIPS").
const LABEL = { PV_TRUNK: 'Portal vein', PVH_R: 'Right PV', PVH_L: 'Left PV', SV_CONF: 'Splenic vein', SV_MID: 'Splenic vein', V_SPL: 'Splenic vein',
  SMV_CONF: 'SMV', RHV_IVC: 'Right HV', MHV_IVC: 'Middle HV', LHV_IVC: 'Left HV', IVCS_RA: 'IVC', IVCI: 'IVC', IVCS: 'IVC' };
export const STENT_SITES = ['proximal', 'mid', 'distal'];
/** Where along a stent the section is cut: the slide's tool.site, else the segment its narrowing sits in
 *  (params.stenosisSite, distal if unset, as scenario.js and the Doppler take it). */
export const lumenSite = (params, id, site) => STENT_SITES.includes(site) ? site : STENT_SITES.includes(params?.stenosisSite?.[id]) ? params.stenosisSite[id] : 'distal';
export const lumenLabel = (id, name, site = 'distal') => (typeof name === 'string' && name.trim())
  || (STENTS.has(id) ? `${site[0].toUpperCase()}${site.slice(1)} ${id}` : LABEL[id]) || (([c, ...r]) => c.toUpperCase() + r.join(''))(lumenName(id));

/** A vessel's lumen from the model's params: clot and narrowing (0 to 1 each), combined as the engine combines them
 *  (engine.js occlusion: 1 − (1 − narrowing)(1 − clot)), and the open fraction of the lumen that is left. */
export function lumenOf(params, id) {
  const st = clamp(+params?.stenosis?.[id] || 0, 0, 1), th = clamp(+params?.thrombus?.[id] || 0, 0, 1);
  const occlusion = 1 - (1 - st) * (1 - th);
  return { stenosis: st, thrombus: th, occlusion, open: 1 - occlusion, stent: STENTS.has(id) };
}

/** The picture in a 100-unit box, drawn as EASL 2025 (Table 4) measures a portal vein clot: the wall's outer edge R, the
 *  lumen inside any narrowing (radius ri, its diameter 1 − narrowing of the open vessel's), and a clot rising from the
 *  lower wall to a height of clot × the lumen's diameter, so the diameter left above it, the remnant lumen, is the open
 *  share. top: the clot's top (y, a little uneven along it); bot: the lumen's bottom. A stent's ring sits at the
 *  vessel's own lumen, outside any narrowing inside it. */
export const LUMEN_R = 46, LUMEN_WALL = 5;
export function lumenShape({ stenosis = 0, thrombus = 0 }) {
  const R0 = LUMEN_R - LUMEN_WALL, ri = R0 * clamp(1 - stenosis, 0, 1), t = clamp(thrombus, 0, 1);
  return { cx: 50, cy: 50, R: LUMEN_R, R0, ri, bot: 50 + ri, top: 50 + ri - 2 * ri * t, t };
}

/** The clot's outline, its character set by its grade as EASL 2025 draws them (Fig. 9): a little clot is a thin, uneven
 *  layer hugging the lower wall, thickest at the bottom and tapering to nothing up the sides; past about half the lumen it
 *  becomes a lumpy level filling the lumen wall to wall below an open segment at the top; complete fills the circle. The
 *  two shapes blend across the middle grades, so the slider eases from one to the other. On the vertical axis the clot's
 *  edge always sits at top, so the remnant lumen drawn is the one read out. */
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
export function clotPath(g) {
  if (g.t < 0.0005) return '';
  const { cx, cy, ri, top, bot, t } = g, N = 48;
  if (t > 0.995) return `M${cx - ri} ${cy}A${ri} ${ri} 0 1 0 ${cx + ri} ${cy}A${ri} ${ri} 0 1 0 ${cx - ri} ${cy}Z`;
  const level = smooth(0.32, 0.62, t), T = bot - top;
  // Unevenness: odd in x (none on the axis), largest mid-grade, fading as the clot fills the lumen.
  const amp = Math.min(2.6, ri * 0.13) * Math.sin(Math.PI * t);
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const u = -Math.cos(Math.PI * i / N), x = u * ri, half = Math.sqrt(Math.max(0, 1 - u * u)) * ri;
    const lo = cy + half, hi = cy - half, bump = amp * (Math.sin(u * 5.3) * 0.7 + Math.sin(u * 9.1 + 0.4) * 0.3 - Math.sin(0.4) * 0.3);
    const layer = lo - T * Math.pow(Math.max(0, 1 - u * u), 1.6) + bump * (1 - u * u);
    const flat = top + bump * Math.sqrt(Math.max(0, 1 - u * u));
    const y = clamp(layer + (flat - layer) * level, hi, lo);
    pts.push(`${(cx + x).toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join('L')}A${ri.toFixed(2)} ${ri.toFixed(2)} 0 0 1 ${(cx - ri).toFixed(2)} ${cy.toFixed(2)}Z`;
}

/** The words for the state. A clot takes EASL 2025's grades (Table 4): minimally occlusive up to half the lumen,
 *  partially occlusive past it, completely occlusive when no lumen is left. */
export function lumenWords({ thrombus, stenosis, occlusion, stent }) {
  if (occlusion >= 0.995) return thrombus >= stenosis ? 'Completely occlusive' : stent ? 'Stent closed' : 'Closed';
  if (thrombus >= 0.05 && thrombus >= stenosis) return thrombus > 0.5 ? 'Partially occlusive' : 'Minimally occlusive';
  if (stenosis >= 0.05) return stent ? 'Stent narrowed' : 'Narrowed';
  return 'Open';
}
/** The one line under the open share: what the words above leave out. Clot and narrowing are named only when both are
 *  there (one alone is just 100 minus the open share), and a stent gives its diameter. */
export function lumenFacts({ thrombus = 0, stenosis = 0 }, stentD = null) {
  const out = [];
  if (stentD != null) out.push(`${stentD} mm stent`);
  if (thrombus >= 0.005 && stenosis >= 0.005) out.push(`Clot ${pct(thrombus)} %`, `narrowing ${pct(stenosis)} %`);
  return out.join(' · ');
}
const pct = (x) => `${Math.round(clamp(x, 0, 1) * 100)}`;

/** Where the words in the circle sit for a filled share (0 to 1), in the 100-unit picture. Nothing filled: the name alone at
 *  the centre, no number. As a clot appears (over the first 6 %, the clot's own fade) the name first eases up to its place
 *  above the %, and only once it is there do the % and "occluded" fade in under it (in reverse as the clot leaves), so the
 *  name and the number never overlap at any frame of the move. */
export const LUMEN_NAME_Y = 35, LUMEN_NUM_Y = 52, LUMEN_WORD_Y = 68;
export function lumenBlock(occlusion) {
  const m = Math.max(0, occlusion) / 0.06;
  return { nameY: 50 + (LUMEN_NAME_Y - 50) * smooth(0, 0.5, m), numOpacity: smooth(0.5, 1, m) };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };

export function createLumen() {
  let id = 'PV_TRUNK', tool = null;
  const wall = sv('circle', { class: 'gl-wall', cx: 50, cy: 50, r: LUMEN_R });
  const lumen = sv('circle', { class: 'gl-open', cx: 50, cy: 50 });
  const clot = sv('path', { class: 'gl-clot' });
  const ring = sv('circle', { class: 'gl-stent', cx: 50, cy: 50, r: LUMEN_R - LUMEN_WALL });
  ring.style.opacity = '0';
  const pic = sv('svg', { class: 'gl-pic', viewBox: '0 0 100 100', role: 'img' });
  // The share of the lumen filled (clot, or tissue in a stent), one size at the vessel's centre, white with a dark outline so
  // it reads over the open lumen and the clot alike; the clot fills in behind it. Nothing else under the picture: a deck that
  // wants the grade shows the "clot" tile on the data card.
  // The vessel's name, the number and the word under it are one block, centred on the vessel's centre; the word fades with
  // the number, and the name stays at 0 %, so the circle always says which vessel it is (centred then; lumenBlock). The block
  // sits a little low, where the circle is wider, so "Proximal TIPS" fits inside the lumen at 12 px on a phone's 120 px picture.
  const inName = sv('text', { class: 'gl-in gl-word gl-name', x: 50, y: 50, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  const inNum = sv('text', { class: 'gl-in', x: 50, y: LUMEN_NUM_Y, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  const inWord = sv('text', { class: 'gl-in gl-word', x: 50, y: LUMEN_WORD_Y, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  inWord.textContent = 'occluded';
  // Tissue narrowing a stent, in the clot's colour and edge so it reads at a glance against the open lumen.
  const tissue = sv('circle', { class: 'gl-clot gl-tissue', cx: 50, cy: 50, r: LUMEN_R - LUMEN_WALL });
  pic.append(wall, tissue, lumen, clot, ring, inName, inNum, inWord);
  const el = h('div', { class: 'gl' }, h('div', { class: 'gl-stage' }, pic));
  const set = (n, t) => { if (n.textContent !== t) n.textContent = t; };
  const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  // What the picture shows now, easing to the model's state (a compare button or a new slide jumps the params; the picture eases).
  let shown = null, goal = null, raf = 0, at = 0;
  function paint(x) {
    const g = lumenShape(x), stent = hasStent(id, store.get().stented), L = { ...x, occlusion: 1 - (1 - x.stenosis) * (1 - x.thrombus), stent };
    lumen.setAttribute('r', g.ri.toFixed(2));
    clot.setAttribute('d', clotPath(g));
    // A clot appears and leaves by growing from the wall and fading, never popping in.
    clot.style.opacity = Math.min(1, g.t / 0.06).toFixed(3);
    tissue.style.display = stent ? '' : 'none';
    // The ring eases in and out as the slide stents the vein or lets it go (a vessel drawn afresh shows it at once: configure).
    ring.style.opacity = stent ? '1' : '0';
    tissue.style.opacity = Math.min(1, x.stenosis / 0.06).toFixed(3);
    set(inNum, `${pct(L.occlusion)} %`);
    // With nothing filled there is no number and the name sits at the centre; as the clot comes the name eases up and the
    // number fades in under it once clear (and back as it leaves), following the easing picture, never popping.
    const b = lumenBlock(L.occlusion);
    inWord.style.opacity = inNum.style.opacity = b.numOpacity.toFixed(3);
    inName.setAttribute('y', b.nameY.toFixed(2));
    pic.setAttribute('aria-label', `${lumenName(id)} in cross-section${stent ? ' with a stent' : ''}: ${pct(L.occlusion)}% of the lumen filled, clot ${pct(x.thrombus)}%, narrowing ${pct(x.stenosis)}%`);
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
    const prm = store.get().params, L = lumenOf(prm, id), site = lumenSite(prm, id, tool?.site);
    set(inName, lumenLabel(id, tool?.name, site));
    // A stent cut away from its narrowed segment shows an open stent there (a clot fills the whole stent).
    if (L.stent && site !== lumenSite(prm, id)) L.stenosis = 0;
    goal = { stenosis: L.stenosis, thrombus: L.thrombus };
    if (shown && !raf && goal.stenosis === shown.stenosis && goal.thrombus === shown.thrombus) paint(shown);
    if (!shown || reduce?.matches || !el.isConnected) { shown = { ...goal }; paint(shown); return; }
    if ((goal.stenosis !== shown.stenosis || goal.thrombus !== shown.thrombus) && !raf) raf = nextFrame(tick);
  }
  /** The slide's vessel (tool.vessel), where along a stent it is cut (tool.site: 'proximal', 'mid' or 'distal'; else the
   *  narrowing's segment) and the name written in it (tool.name, else the vessel's own). A new vessel is drawn at once. */
  function configure(t) {
    const v = t?.vessel || 'PV_TRUNK';
    const fresh = v !== id || !shown;
    if (fresh) { id = v; shown = null; }
    el.dataset.vessel = SYSTEMIC.has(id) ? 'systemic' : id.startsWith('A_') ? 'artery' : 'portal';
    tool = t || null;
    if (fresh) {   // (a new vessel is drawn at once, its ring with it: no fade from the vessel before)
      ring.style.transition = 'none'; ring.style.opacity = hasStent(id, store.get().stented) ? '1' : '0';
      void ring.getBoundingClientRect(); ring.style.transition = '';
    }
    update();
  }
  // The word is never under 12 px on screen: the picture scales with its card, so tell the style how many px one unit is.
  const stage = el.firstChild;
  const fit = () => { const w = stage.offsetWidth; if (w > 0) el.style.setProperty('--gl-u', (w / 100).toFixed(3)); };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(stage);
  return { el, update, configure };
}
