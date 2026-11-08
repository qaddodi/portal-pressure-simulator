// Deck visuals, package G, V19: a vessel in cross-section on a slide's data card, tool { kind: 'lumen', vessel: 'PV_TRUNK' }.
// Drawn flat: the open lumen in the vessel's colour, a clot shaped by its grade (EASL 2025), a
// narrowing as a thicker wall, a stent as a fine ring (the TIPS and DIPS, and a vein a slide shows stented: store.stented), and the open area as a percentage. It reads the live model's params
// (params.thrombus and params.stenosis for the vessel, combined as engine.js occlusion), so it moves with a clot-size slider,
// a compare button or the days of anticoagulation, easing from one state to the next.

import { h, clamp } from './util.js';
import { EDGES } from '../engine/topology.js';
import { store } from './store.js';
import { frameFor, cancelFrame, frameAnimating, easeNow } from './frame.js';
import { createSvgGL, svgModel, snapOp, setWords, wordsOf, setGeo, setPts } from './svg-gl.js';
import { restPass } from './rest-pass.js';
import { reduceMotionMQ } from './motion.js';
import { easeArrive, D_SURFACE } from './ease.js';
const nextFrame = frameFor('lumen');

// ── How the picture follows the model (6 Nov 2026, Mohammad on iPhone: "This cross section animation is super laggy") ──
// The model's clot comes in steps: a time-lapse posts a day at a time, 33 or 66 ms apart (worker-core.js ticks every 33 ms), and a
// slide's morph posts its params about 4 times a second. The picture used to chase each step with a 0.16 s exponential ease, so it
// trailed the figure and the tiles by about a sixth of a second, its speed rippled at the model's rate, and its tail ran on for a
// second after the model stopped. Its frames were also carried over on a busy frame (frame.js priority 2, the "instruments" share)
// because it never said it was animating, so on a phone, behind the moving figure, it stepped at about 40 Hz.
// Now: a step that is part of a stream (a time-lapse, a slider, a morph) is followed in a straight line over the stream's own
// interval, so the picture moves at the model's speed with one step of delay and no ripple or tail; a jump (a compare button, a slide
// that sets a new clot, a lone change) glides there over D_SURFACE on the arrival curve. While it moves it is marked animating, so
// the scheduler draws it on every frame at the screen's rate.
/** A step this big (share of the lumen, either channel) is a jump, glided; one this small after a quiet spell is followed straight. */
export const FOLLOW_JUMP = 0.12, FOLLOW_LONE = 0.01;
/** Steps closer together than this (ms) are a stream; the stream's interval is followed, held between the two bounds. */
export const FOLLOW_STREAM_MS = 320, FOLLOW_MIN_MS = 16, FOLLOW_MAX_MS = 300, FOLLOW_GAP0 = 45;   // motion-scale: not a move (the follower's stream bounds, the interval of the steps it follows)
export const FOLLOW_GLIDE_MS = D_SURFACE;
/** The follower of two channels (stenosis, thrombus): goal(a, b, now) takes the model's value, at(now) writes the shown pair into
 *  f.a and f.b and returns true while it is still moving. One record, written in place: nothing is made per step or per frame. */
export function createFollow() {
  const f = { a: 0, b: 0, fa: 0, fb: 0, ta: 0, tb: 0, t0: 0, ms: 0, glide: false, last: -Infinity, gap: FOLLOW_GAP0, moving: false };
  f.snap = (a, b) => { f.a = f.fa = f.ta = a; f.b = f.fb = f.tb = b; f.moving = false; f.ms = 0; };
  f.goal = (a, b, now) => {
    if (a === f.ta && b === f.tb) return f.moving;
    f.at(now);   // (from where the picture stands now, mid-step or not)
    const d = Math.max(Math.abs(a - f.a), Math.abs(b - f.b)), since = now - f.last;
    const stream = since < FOLLOW_STREAM_MS;
    if (stream) f.gap += (Math.min(FOLLOW_MAX_MS, Math.max(FOLLOW_MIN_MS, since)) - f.gap) * 0.35;
    else f.gap = FOLLOW_GAP0;
    f.last = now;
    f.glide = d >= FOLLOW_JUMP || (!stream && d >= FOLLOW_LONE);
    f.ms = f.glide ? FOLLOW_GLIDE_MS : f.gap;
    f.fa = f.a; f.fb = f.b; f.ta = a; f.tb = b; f.t0 = now;
    f.moving = true;
    return true;
  };
  f.at = (now) => {
    if (!f.moving) return false;
    const k = f.ms > 0 ? Math.min(1, Math.max(0, (now - f.t0) / f.ms)) : 1;
    if (k >= 1) { f.a = f.ta; f.b = f.tb; f.moving = false; return false; }
    const e = f.glide ? easeArrive(k) : k;
    f.a = f.fa + (f.ta - f.fa) * e; f.b = f.fb + (f.tb - f.fb) * e;
    return true;
  };
  return f;
}

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
// (The clot's top edge, N + 1 points from the left wall to the right, written into buf as x, y pairs: shared by the outline's string
// (clotPath) and the points the picture draws from (clotPts), so the two cannot differ.)
const CLOT_N = 48, CLOT_ARC = 48;
function clotEdge(buf, cx, cy, ri, top, bot, t) {
  const N = CLOT_N, level = smooth(0.32, 0.62, t), T = bot - top;
  // Unevenness: odd in x (none on the axis), largest mid-grade, fading as the clot fills the lumen.
  const amp = Math.min(2.6, ri * 0.13) * Math.sin(Math.PI * t);
  for (let i = 0; i <= N; i++) {
    const u = -Math.cos(Math.PI * i / N), x = u * ri, half = Math.sqrt(Math.max(0, 1 - u * u)) * ri;
    const lo = cy + half, hi = cy - half, bump = amp * (Math.sin(u * 5.3) * 0.7 + Math.sin(u * 9.1 + 0.4) * 0.3 - Math.sin(0.4) * 0.3);
    const layer = lo - T * Math.pow(Math.max(0, 1 - u * u), 1.6) + bump * (1 - u * u);
    const flat = top + bump * Math.sqrt(Math.max(0, 1 - u * u));
    buf[2 * i] = cx + x; buf[2 * i + 1] = clamp(layer + (flat - layer) * level, hi, lo);
  }
}
export function clotPath(g) {
  if (g.t < 0.0005) return '';
  const { cx, cy, ri, top, bot, t } = g, N = CLOT_N;
  if (t > 0.995) return `M${cx - ri} ${cy}A${ri} ${ri} 0 1 0 ${cx + ri} ${cy}A${ri} ${ri} 0 1 0 ${cx - ri} ${cy}Z`;
  const buf = new Float64Array(2 * (N + 1));
  clotEdge(buf, cx, cy, ri, top, bot, t);
  const pts = [];
  for (let i = 0; i <= N; i++) pts.push(`${buf[2 * i].toFixed(2)} ${buf[2 * i + 1].toFixed(2)}`);
  return `M${pts.join('L')}A${ri.toFixed(2)} ${ri.toFixed(2)} 0 0 1 ${(cx - ri).toFixed(2)} ${cy.toFixed(2)}Z`;
}
/** The clot's outline as points for the picture (setPts): the same edge as clotPath, then the lumen's lower half back to the left wall
 *  (a full clot, the whole circle), written into buf (2 × (CLOT_N + CLOT_ARC + 2) numbers at least). Returns the pairs used (0: no clot). */
export const CLOT_PTS = 2 * (CLOT_N + CLOT_ARC + 2);
export function clotPts(buf, cx, cy, ri, top, bot, t) {
  if (t < 0.0005) return 0;
  let n = 0;
  if (t > 0.995) {
    for (let j = 0; j <= 2 * CLOT_ARC; j++, n++) { const a = Math.PI * j / CLOT_ARC; buf[2 * n] = cx - ri * Math.cos(a); buf[2 * n + 1] = cy - ri * Math.sin(a); }
    return n;
  }
  clotEdge(buf, cx, cy, ri, top, bot, t);
  n = CLOT_N + 1;
  for (let j = 1; j <= CLOT_ARC; j++, n++) { const a = Math.PI * j / CLOT_ARC; buf[2 * n] = cx + ri * Math.cos(a); buf[2 * n + 1] = cy + ri * Math.sin(a); }
  return n;
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
  if (thrombus >= 0.005 && stenosis >= 0.005) out.push(`Clot ${pct(thrombus)}%`, `narrowing ${pct(stenosis)}%`);
  return out.join(' · ');
}
const pct = (x) => `${Math.round(clamp(x, 0, 1) * 100)}`;
// (The open share's words for each whole percent, made once at load: a frame picks one, makes none.)
const PCT_WORDS = Array.from({ length: 101 }, (_, i) => `${i}%`);
const pctI = (x) => Math.round(clamp(x, 0, 1) * 100);

/** Where the words in the circle sit for a filled share (0 to 1), in the 100-unit picture. Nothing filled: the name alone at
 *  the centre, no number. As a clot appears (over the first 6 %, the clot's own fade) the name first eases up to its place
 *  above the %, and only once it is there do the % and "occluded" fade in under it (in reverse as the clot leaves), so the
 *  name and the number never overlap at any frame of the move. */
export const LUMEN_NAME_Y = 35, LUMEN_NUM_Y = 52, LUMEN_WORD_Y = 68;
export function lumenBlock(occlusion) {
  return { nameY: lumenNameY(occlusion), numOpacity: lumenNumOpacity(occlusion) };
}
// (The two numbers alone, for a frame: no object made.)
export const lumenNameY = (occlusion) => 50 + (LUMEN_NAME_Y - 50) * smooth(0, 0.5, Math.max(0, occlusion) / 0.06);
export const lumenNumOpacity = (occlusion) => smooth(0.5, 1, Math.max(0, occlusion) / 0.06);

// (2 Nov 2026: the picture is a model drawn on the GPU, svg-gl.js: the same tree, of plain elements, never painted by the browser.)
const sv = (tag, attrs = {}) => svgModel(tag, attrs);

/** The name's and "occluded"'s size in units of the 100-unit picture, for u px per unit: 12 px on screen, held between 9 and 12 units. */
export const WORD_FIRST = 9;   // (the size before the picture is measured: 1.4 px a unit, the style's own first guess)
export const wordSize = (u) => Math.max(9, Math.min(12, 12 / (u || 1.4)));

export function createLumen() {
  let id = 'PV_TRUNK', tool = null;
  const wall = sv('circle', { class: 'gl-wall', 'data-look': 'lumen.wall', cx: 50, cy: 50, r: LUMEN_R });
  const lumen = sv('circle', { class: 'gl-open', 'data-look': 'lumen.open', cx: 50, cy: 50 });
  const clot = sv('path', { class: 'gl-clot', 'data-look': 'lumen.clot' });
  const ring = sv('circle', { class: 'gl-stent', 'data-look': 'lumen.stent', cx: 50, cy: 50, r: LUMEN_R - LUMEN_WALL });
  ring.style.opacity = '0';
  const pic = sv('svg', { class: 'gl-pic', 'data-vessel': 'portal', viewBox: '0 0 100 100', role: 'img' });
  // The share of the lumen filled (clot, or tissue in a stent), one size at the vessel's centre, white with a dark outline so
  // it reads over the open lumen and the clot alike; the clot fills in behind it. Nothing else under the picture: a deck that
  // wants the grade shows the "clot" tile on the data card.
  // The vessel's name, the number and the word under it are one block, centred on the vessel's centre; the word fades with
  // the number, and the name stays at 0 %, so the circle always says which vessel it is (centred then; lumenBlock). The block
  // sits a little low, where the circle is wider, so "Proximal TIPS" fits inside the lumen at 12 px on a phone's 120 px picture.
  const inName = sv('text', { class: 'gl-in gl-word gl-name', 'data-look': 'lumen.word', 'font-size': WORD_FIRST, x: 50, y: 50, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  const inNum = sv('text', { class: 'gl-in', 'data-look': 'lumen.in', x: 50, y: LUMEN_NUM_Y, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  const inWord = sv('text', { class: 'gl-in gl-word', 'data-look': 'lumen.word', 'font-size': WORD_FIRST, x: 50, y: LUMEN_WORD_Y, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  inWord.textContent = 'occluded';
  // Tissue narrowing a stent, in the clot's colour and edge so it reads at a glance against the open lumen.
  const tissue = sv('circle', { class: 'gl-clot gl-tissue', 'data-look': 'lumen.clot', cx: 50, cy: 50, r: LUMEN_R - LUMEN_WALL });
  pic.append(wall, tissue, lumen, clot, ring, inName, inNum, inWord);
  const el = h('div', { class: 'gl' }, h('div', { class: 'gl-stage' }, pic));
  const gl = createSvgGL(el.firstChild);   // (its looks are read once it is on the page and sized: fit)
  const set = setWords;   // (words kept on the piece, drawn by the picture: no text node made in a frame)
  const reduce = typeof matchMedia === 'function' ? reduceMotionMQ : null;
  // What the picture shows now, following the model's state (createFollow: a stream followed straight, a jump glided).
  const fol = createFollow();
  let hasShown = false, raf = 0, anim = false;
  const animating = (on) => { if (anim !== on) { anim = on; frameAnimating('lumen', on); } };
  const clotBuf = new Float64Array(CLOT_PTS);
  // (The words a screen reader gets are written between frames, when the whole percents they name have changed: not built in a frame.)
  let ariaOcc = -1, ariaThr = -1, ariaSte = -1, ariaStent = false, ariaAsk = 0;
  const writeAria = () => {
    ariaAsk = 0;
    pic.setAttribute('aria-label', `${lumenName(id)} in cross-section${ariaStent ? ' with a stent' : ''}: ${ariaOcc}% of the lumen filled, clot ${ariaThr}%, narrowing ${ariaSte}%`);
  };
  // (Opacity is held on the piece as a number, the picture reads it from there: set once so its look is read as a strength the chart moves.)
  for (const e of [clot, tissue, inNum, inWord]) setGeo(e, 'opacity', e === tissue || e === clot ? 0 : 1);
  let shownStent = null;
  function paint(sten, thr) {
    const R0 = LUMEN_R - LUMEN_WALL;
    const ri = R0 * clamp(1 - sten, 0, 1), t = clamp(thr, 0, 1), bot = 50 + ri, top = 50 + ri - 2 * ri * t;
    const stent = hasStent(id, store.get().stented), occlusion = 1 - (1 - sten) * (1 - thr);
    setGeo(lumen, 'r', ri);
    setPts(clot, clotBuf, clotPts(clotBuf, 50, 50, ri, top, bot, t), true);
    // A clot appears and leaves by growing from the wall and fading, never popping in.
    setGeo(clot, 'opacity', Math.min(1, t / 0.06));
    // (Written only when the stent comes or goes: the picture reads them as they stand, so a frame writes no style.)
    if (stent !== shownStent) {
      shownStent = stent;
      tissue.style.display = stent ? '' : 'none';
      // The ring eases in and out as the slide stents the vein or lets it go (a vessel drawn afresh shows it at once: configure).
      ring.style.opacity = stent ? '1' : '0';
    }
    setGeo(tissue, 'opacity', Math.min(1, sten / 0.06));
    const occ = pctI(occlusion);
    set(inNum, PCT_WORDS[occ]);
    // With nothing filled there is no number and the name sits at the centre; as the clot comes the name eases up and the
    // number fades in under it once clear (and back as it leaves), following the easing picture, never popping.
    const numOp = lumenNumOpacity(occlusion);
    setGeo(inWord, 'opacity', numOp); setGeo(inNum, 'opacity', numOp);
    setGeo(inName, 'y', lumenNameY(occlusion));
    const thrI = pctI(thr), steI = pctI(sten);
    if (occ !== ariaOcc || thrI !== ariaThr || steI !== ariaSte || stent !== ariaStent) {
      ariaOcc = occ; ariaThr = thrI; ariaSte = steI; ariaStent = stent;
      if (!ariaAsk) ariaAsk = restPass(writeAria);
    }
    gl.paint();   // (the picture draws it in this same frame)
  }
  function tick() {
    raf = 0;
    const moving = fol.at(easeNow());
    paint(fol.a, fol.b);
    if (moving && el.isConnected) raf = nextFrame(tick);
    else { if (moving) { fol.snap(fol.ta, fol.tb); paint(fol.a, fol.b); } animating(false); }
  }
  function update() {
    const prm = store.get().params, L = lumenOf(prm, id), site = lumenSite(prm, id, tool?.site);
    const was = wordsOf(inName);
    set(inName, lumenLabel(id, tool?.name, site));
    // A stent cut away from its narrowed segment shows an open stent there (a clot fills the whole stent).
    if (L.stent && site !== lumenSite(prm, id)) L.stenosis = 0;
    if (!hasShown || reduce?.matches || !el.isConnected) {
      fol.snap(L.stenosis, L.thrombus); hasShown = true;
      if (raf) { cancelFrame(raf); raf = 0; }
      animating(false); paint(fol.a, fol.b); return;
    }
    if (fol.goal(L.stenosis, L.thrombus, easeNow())) {
      animating(true);   // (never carried over while it moves: frame.js)
      if (!raf) raf = nextFrame(tick);
      return;
    }
    // (Still, and nothing it shows changed: no redraw. Each model frame used to redraw and hand over the same picture, 10 to 30 times a
    // second at rest. Only a new name or a stent coming or going is drawn.)
    if (!raf && (wordsOf(inName) !== was || hasStent(id, store.get().stented) !== shownStent)) paint(fol.a, fol.b);
  }
  /** The slide's vessel (tool.vessel), where along a stent it is cut (tool.site: 'proximal', 'mid' or 'distal'; else the
   *  narrowing's segment) and the name written in it (tool.name, else the vessel's own). A new vessel is drawn at once. */
  function configure(t) {
    const v = t?.vessel || 'PV_TRUNK';
    const fresh = v !== id || !hasShown;
    if (fresh) { id = v; hasShown = false; }
    const kind = SYSTEMIC.has(id) ? 'systemic' : id.startsWith('A_') ? 'artery' : 'portal';
    if (pic.getAttribute('data-vessel') !== kind) { pic.setAttribute('data-vessel', kind); gl.relook(); }   // (the look table reads the vessel off the picture's root: lumen.js)
    tool = t || null;
    if (fresh) {   // (a new vessel is drawn at once, its ring with it: no fade from the vessel before)
      ring.style.opacity = hasStent(id, store.get().stented) ? '1' : '0'; snapOp(ring);
    }
    update();
  }
  // The word is never under 12 px on screen: the picture scales with its card, so its size in units is 12 over the px one unit is, held
  // between 9 and 12 (was app.css .gl-word: max(9px, min(12px, 12px / --gl-u))). It is the words' font-size attribute, which the look leaves alone.
  const stage = el.firstChild;
  const fit = () => {
    const w = stage.offsetWidth;
    if (w > 0) { const fs = wordSize(w / 100); inName.setAttribute('font-size', fs); inWord.setAttribute('font-size', fs); gl.relook(); }   // (the words' size read again)
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(stage);
  // (2 Nov 2026, bug sweep: the instrument had no dispose, so each presentation's cross-section kept its GPU drawer and observer.)
  const dispose = () => { ro?.disconnect(); if (raf) cancelFrame(raf); raf = 0; animating(false); gl.dispose?.(); };
  return { el, update, configure, dispose };
}
