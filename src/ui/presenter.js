// Presenter: projector-first presentations on the live model (decks.js) and the instructor's own scripts.
//
// A slide is one idea: a big headline, one line, a few causes, and a figure that explains it. Every
// slide's model state is computed off screen first (a second engine in its own worker, worker-core.js
// 'sequence'), each from the slide before, so the live figure only ever shows finished states and
// forward, back and jump always agree. Between slides the words fade over; a change of patient dims the
// figure (never to blank) and brings it back; then the camera travels: to a region of the plate, or down into the lobule and
// on to a portal tract, the sinusoids or a central vein. The pressure ladder and the tiles count to their
// new values.
//
// Keys (clickers send the same): → Page Down Space Enter next (during a time-lapse the first runs it to its end),
// ← Page Up back, a number then Enter jumps, G the slide list, Home End, B or . black screen, F full screen, ? the Guide,
// Esc. (The Guide lists them: PRESENT_KEYS in main.js.) On a touch screen a sideways swipe anywhere on the slide goes on or back.

import { store, replaceParams } from './store.js?v=31ee79b6ab';
import { download } from './download.js?v=3564e5bf8c';
import { h, toast, svgIcon, icon, fmt, clamp, openModal, closeModal, isModalOpen, restBox } from './util.js?v=0140acc352';
import { swipeDir, ownsSideways, caseFling, caseFlight } from './swipe.js?v=75b95b59cf';
import { sinusoidSupported } from './sinusoid-view.js?v=9b15f12b42';
import { NODES } from '../engine/topology.js?v=4044766e96';
import { DISEASE_SRC, diseasePieces } from './diseases.js?v=fb8a5451c3';
import { DECKS, REGIONS, LEVELS, TOPICS, withOverview, siteTag } from './decks.js?v=94c6eae04e';
import { wholeGap, tenthGap } from '../engine/gap.js?v=3a5947c552';
import { createHvpgMonitor } from './hvpg-proc.js?v=9b09b1c8ec';
import { createTools } from './presenter-tools.js?v=681ed316dc';
import { openHandout } from './handout.js?v=44a8313769';
import { noteResume, resumeFor } from './resume.js?v=f086f80ee8';
import { parseDeckSource, checkDeck } from './deck-source.js?v=8395c650cd';
import { NO_ASC, TILE, SCALE, bandsOf, rateOf, COLS, CUT, PRESS, fpv, dirAbs, dirRel, rateAbs, effOf, rateShown, tileShown } from './table-marks.js?v=1d77d9a6e6';
import { frameFor, cancelFrame } from './frame.js?v=5efaa2bcc9';
import { createFigureKey } from './figure-key.js?v=382bd7d4ad';
import { traceWhen } from './trace-labels.js?v=fc916a95c6';
import { flowCss, heatCss, dropCss, gradientCss, oxygenCss } from './colormap.js?v=5c9a375f49';
const nextFrame = frameFor('presenter');

const KEY = 'pps.scripts';
// Only well-formed scripts: a damaged saved value is ignored rather than stopping the library.
const readMine = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && x.id) : []; } catch { return []; } };
const writeMine = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
// Old links and bookmarks: the self-running tour became the Sites presentation, the bleeding lecture the treatment one.
const ALIAS = { 'where-block': 'sites', bleed: 'treatment' };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
/** Poll (not frames: a hidden tab runs none) until fn() holds or ms pass. */
async function until(fn, ms = 3000) { const t0 = performance.now(); while (!fn() && performance.now() - t0 < ms) await wait(40); }
const LOBULE_CAM = /^(lobule|sinusoid)/;

// ── Numbers ────────────────────────────────────────
const RUNGS = [['pv', 'PV'], ['whvp', 'WHVP'], ['fhvp', 'FHVP'], ['ivc', 'IVC'], ['ra', 'RA']];
// A name joined by an en dash (Budd–Chiari) never breaks at the dash.
// A slide's equation (decks.js eq: [MathML, legend]): typeset by the browser's own MathML, the legend under it.
function equation([ml, legend]) {
  const box = h('div', { class: 'pz-eq' });
  box.innerHTML = `<math>${ml}</math>`;   // (the decks' own constant markup, never user text)
  if (legend) box.append(h('p', { class: 'pz-eqk' }, legend));
  return box;
}
// A slide's lens (decks.js lens): what the vessel colours show on that slide, with a key under its line, its name ("Velocity")
// and the two ends, as the legend does in Explore. (Learner-facing words say "colored by", never "lens".)
// Pressure is the default and needs no key.
const LENS_KEY = {
  velocity: ['velocity', [['--vel-slow', 'Slow'], ['--vel-fast', 'Fast']]],
  flow: ['flow volume', () => flowCss('to right'), 'Little', 'Much'],
  direction: ['direction', [['--flow-normal', 'Usual'], ['--flow-reversed', 'Reversed']]],
  heat: ['congestion', () => heatCss('to right'), 'None', 'Backed up'],
  drop: ['pressure drop', () => dropCss('to right'), 'None', 'Large'],
  delta: ['change', () => 'linear-gradient(to right, var(--delta-low), var(--delta-mid), var(--delta-high))', 'Lower', 'Higher'],
  oxygen: ['oxygen', () => oxygenCss('to right'), 'Low', 'High'],
  origin: ['origin', [['--origin-smv', 'SMV'], ['--origin-imv', 'IMV'], ['--origin-spleen', 'Spleen'], ['--origin-artery', 'Artery'], ['--origin-systemic', 'Systemic']]],
};
export const slideLens = (s) => (!s?.visual && LENS_KEY[s?.lens] ? s.lens : 'pressure');
// Pressure's key shows only on a slide with lens buttons (the default needs none).
const PRESSURE_KEY = ['pressure', () => gradientCss('to right', 30), 'Low', 'High'];
const lensButtons = (s) => !!s.compare?.some((o) => o.lens);
const gateButtons = (s) => !!s.compare?.some((o) => o.gate);
// The key for the small pill on the figure (figure-key.js): the lens named, then its colour scale under it (a gradient has no end words; named swatches keep their names).
function keyNodes(k) {
  const [name, bar] = LENS_KEY[k] || PRESSURE_KEY;
  const sw = (v) => h('i', { class: 'pz-lens-sw', style: { background: `var(${v})` } });
  // (Each swatch stays on one line with its words: "Low ▬▬ High" as one piece, a short stroke with its name.)
  return [h('b', {}, name[0].toUpperCase() + name.slice(1)),
    ...(typeof bar === 'function' ? [h('i', { class: 'pz-lens-bar', style: { background: bar() } })]
      : bar.map(([v, t]) => h('span', { class: 'pz-lens-k' }, sw(v), h('span', {}, t))))];
}
// A string with its disease names set in a pill (see diseases.js).
const diseaseNodes = (t) => diseasePieces(t).map(([x, dz]) => (dz ? h('span', { class: 'pz-dz' }, x) : x));
const nb = (t) => (t || '').replace(/(\p{L})–(\p{L})/gu, '$1–\u2060$2');
// A slide's line, typeset. One value goes in a quiet pill: the one the deck marks with {braces}, else the first
// value with a unit (a line of cut-offs leaves the rest to its scale). The slide's own key terms (its highlighted
// tiles, or `bold`) are bold wherever the line names them; the first mention of a term students meet for the first
// time is bold too, at most three bold terms a line, so it stays a sentence and not a list of highlights.
const VAL = String.raw`\d+(?:\.\d+)?(?:\s(?:to|or)\s\d+(?:\.\d+)?)?\s?(?:mmHg|g\/dL|mL\/min|kPa|cm\/s|mm|%)(?![A-Za-z])`;
const TERMS = ['CSPH', 'SAAG', 'WHVP', 'FHVP', 'central vein', 'portal tracts?', 'fenestrae', 'space of Disse',
  'basement membrane', 'capillarization', 'wedged pressure', 'free pressures?', 'sinusoidal pressure', 'caput medusae',
  'gastrorenal shunt', 'stellate cells?', 'encephalopathy', 'periportal fibrosis', 'intrahepatic resistance', 'hepatopetal', 'hepatofugal',
  'cavernoma', 'a wave', 'pulsatility', 'reflection coefficient', 'Laplace', 'congestion index', 'gray zone', 'red wale marks'];
// A tile's words in a line (the slide's key tiles are its key terms).
const KEYWORDS = { hvpg: 'HVPG', ppg: 'PPG', pv: 'portal pressure', whvp: 'WHVP|wedged pressure', fhvp: 'FHVP|free pressure', ra: 'right atrial pressure|right atrium',
  ivc: 'IVC', varix: 'varix|varices', hr: 'heart rate', map: 'blood pressure', asc: 'ascites', plt: 'platelets?', lsm: 'stiffness', spleen: 'spleen',
  liver: 'liver blood flow', shunt: 'shunt', sin: 'sinusoidal pressure', saag: 'SAAG', tp: 'protein', hb: 'hemoglobin', pvFlow: 'portal flow', pvVel: 'portal vein velocity',
  co: 'cardiac output', bv: 'blood volume' };
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// What a word in a line can point at on the figure (a term pill, M1): the station's label (node), the vessels that
// glow (edges) or the organ outlined, in the station's colour (tone: --tr-<tone>), and the words that name it.
const TARGETS = {
  pv: { node: 'CONF', edges: ['PV_TRUNK'], tone: 'pv', words: 'portal vein' },
  sv: { node: 'SV', edges: ['SV_CONF', 'SV_MID', 'V_SPL'], tone: 'sv', words: 'splenic vein|splenic' },
  imv: { node: 'IMV', edges: ['V_IMV'], tone: 'imv', words: 'inferior mesenteric veins?|inferior mesenteric' },
  smv: { node: 'SMV', edges: ['SMV_CONF', 'V_INT'], tone: 'smv', words: 'superior mesenteric veins?|superior mesenteric' },
  sin: { node: 'SIN_R', edges: ['SIN_RR', 'SIN_LL'], tone: 'wedge', words: 'sinusoids?|sinusoidal pressure' },
  whvp: { node: 'SIN_R', organ: 'liver', tone: 'wedge', words: 'WHVP|wedged pressure' },
  fhvp: { node: 'RHV', edges: ['RHV_IVC'], tone: 'hv', words: 'FHVP|free pressure' },
  hv: { node: 'RHV', edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], tone: 'hv', words: 'hepatic veins?' },
  ivc: { node: 'IVCS', edges: ['IVCS_RA', 'IVC_IS'], tone: 'ivc', words: 'IVC|inferior vena cava' },
  ra: { node: 'RA', organ: 'heart', tone: 'ra', words: 'right atrium' },
  varix: { node: 'VAR', edges: ['C1a', 'C1b'], tone: 'var', words: 'esophageal varices|varices|varix' },
  gv: { node: 'GV', edges: ['C2'], tone: 'var', words: 'gastric varices|fundal varices' },
  lgv: { node: 'LGV', edges: ['LGV_CONF', 'V_STO'], tone: 'var', words: 'left gastric vein|coronary vein' },
  // The cavernoma: the periportal collaterals around a clotted portal vein (its own colour, apart from the varices').
  cavernoma: { edges: ['C8'], tone: 'cav', words: 'cavernomas?' },
  azy: { node: 'AZY', edges: ['AZY_SVC'], tone: 'var', words: 'azygos(?: vein)?' },
  // The circuit's resistors (its zigzags): lit in a station colour, not outlined.
  rLiver: { res: 'rLiver', tone: 'wedge', words: 'resistance' },
  rColl: { res: 'rColl', tone: 'var', words: 'collaterals' },
  rGut: { res: 'rGut', site: 'rGut', tone: 'smv', words: 'gut arterioles' },
  lpv: { node: 'LPV', edges: ['PVH_L'], tone: 'pv', words: 'left portal vein' },
  lrv: { node: 'LRV', edges: ['LRV_IVC', 'V_KID_L'], tone: 'ivc', words: 'left renal vein' },
  spleen: { organ: 'spleen', tone: 'sv', words: 'spleen' },
  liver: { organ: 'liver', tone: 'wedge', words: 'liver' },
  // The caudate lobe with its veins draining into the IVC; caudateLobe: the lobe alone (a DIPS runs through it).
  caudate: { organ: 'caudate', tone: 'hv', words: 'caudate lobe' },
  caudateLobe: { organ: 'caudate-lobe', tone: 'hv', words: 'caudate lobe' },
  heart: { organ: 'heart', tone: 'ra', words: 'heart' },
  // Inside the liver (lit: the lobule's and the sinusoid's own labels take the colour and a soft glow, .app[data-lit]).
  'lobule:triad': { lit: true, tone: 'pv', words: 'portal tracts?|portal triads?|portal venules?' },
  'lobule:arteriole': { lit: true, tone: '--artery', words: 'hepatic arterioles?|arterioles?' },
  'lobule:ductule': { lit: true, tone: '--bile-duct', words: 'bile ductules?|bile ducts?' },
  'lobule:sinusoid': { lit: true, tone: 'wedge', words: 'sinusoids?' },
  'lobule:central': { lit: true, tone: 'hv', words: 'central veins?|central venules?' },
  'lobule:lymph': { lit: true, tone: 'ivc', words: 'lymphatics?|lymph' },
  'lobule:zone1': { lit: true, tone: 'pv', words: 'zone 1|periportal' },
  'lobule:zone3': { lit: true, tone: 'hv', words: 'zone 3|centrilobular' },
  'sinusoid:fenestrae': { lit: true, tone: 'accent', words: 'fenestrae' },
  'sinusoid:disse': { lit: true, tone: 'accent', words: 'space of Disse' },
  'sinusoid:stellate': { lit: true, tone: 'accent', words: 'stellate cells?' },
  'sinusoid:kupffer': { lit: true, tone: 'accent', words: 'Kupffer cells?' },
  'sinusoid:hepatocyte': { lit: true, tone: 'accent', words: 'hepatocytes?|liver cells' },
  'sinusoid:lymph': { lit: true, tone: 'ivc', words: 'lymph' },
  'sinusoid:lumen': { lit: true, tone: 'wedge', words: 'sinusoids?' },
};
const toneVar = (t) => (t === 'accent' ? 'var(--accent)' : t.startsWith('--') ? `var(${t})` : `var(--tr-${t})`);
// Node ids name their target too ([portal vein](CONF) is [portal vein](pv)).
for (const [k, t] of Object.entries(TARGETS)) if (t.node && !TARGETS[t.node]) TARGETS[t.node] = TARGETS[k];
const ORGANS = new Set(['liver', 'caudate', 'caudate-lobe', 'spleen', 'heart', 'heart-ra']);
// A vessel's station colour, for a glow written by hand (glow: ['PV_TRUNK']).
const EDGE_TONE = {};
for (const t of Object.values(TARGETS)) for (const e of t.edges || []) EDGE_TONE[e] ||= t.tone;
// (Collaterals and spontaneous shunts take the varices' colour: one family on the figure.)
for (const e of ['C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'S_PC', 'S_DSR', 'S_MC']) EDGE_TONE[e] ||= 'var';
// A live value's colour ({pv}): the station it is read at; a value with no station (HVPG) is a plain pill.
// The station label each site reading would repeat (an IVC web's lower reading is its own place, so it has none).
export const SITE_NODE = { pv: 'CONF', ivc: 'IVCS', ra: 'RA' };
const VAL_TONE = { pv: 'pv', whvp: 'wedge', sin: 'wedge', fhvp: 'hv', ivc: 'ivc', ra: 'ra' };
// A reading with no station of its own (a size: the spleen, the varices) takes its status colour, as its card
// shows it, on its pill and on its organ's outline; neutral while it is normal.
const BY_RATE = new Set(['spleen', 'varix', 'gv']), RATE_TONE = { hi: '--danger', mid: '--caution' };
const rateTone = (k, fp) => RATE_TONE[rateShown(k, fp)[0]] || null;   // (judged as its pill prints it)
const valTone = (k, fp) => (BY_RATE.has(k) ? rateTone(k, fp) : VAL_TONE[k]);
// A slide's terms: { words: target } (terms: ['pv', 'ra'] takes each target's own words). A word every slide uses the
// same way needs no listing: the cavernoma is always a pill that lights its collaterals.
const AUTO_TERMS = ['cavernoma'];
function termList(s) {
  const t = s.terms || [];
  const own = Array.isArray(t) ? t.map((k) => [TARGETS[k]?.words, k]) : Object.entries(t).map(([w, k]) => [esc(w), k]);
  const have = new Set(own.map(([, k]) => k));
  return [...own, ...AUTO_TERMS.filter((k) => !have.has(k)).map((k) => [TARGETS[k].words, k])].filter(([w, k]) => w && TARGETS[k]);
}
/** Everything a slide points at on the figure: its terms (as the line names them) and its glow field. */
// On a Doppler slide the vessel being read glows the Doppler's green (as in Explore), over the colour its word would give it.
const isDop = (s) => s?.tool?.kind === 'doppler';
export function slideTargets(s, line = s.line || '') {
  const keys = new Set();
  for (const m of line.matchAll(/\[([^\]]+)\]\(([\w:]+)\)/g)) if (TARGETS[m[2]]) keys.add(m[2]);
  for (const [w, k] of termList(s)) if (new RegExp(`\\b(?:${w})\\b`, 'i').test(line)) keys.add(k);
  const labels = [], terms = {}, soft = new Set(), glow = new Map(), organs = new Map(), res = new Map(), lit = new Set(), sites = new Set();
  for (const k of keys) {
    const t = TARGETS[k];
    if (t.node) { labels.push(t.node); terms[t.node] = t.tone; }
    if (t.lit) lit.add(k);
    if (t.site) sites.add(t.site);
    for (const e of t.edges || []) glow.set(e, t.tone);
    if (t.organ) organs.set(t.organ, t.tone);
    if (t.res) res.set(t.res, t.tone);
  }
  for (const k of s.tint || []) { const t = TARGETS[k]; if (t?.node) terms[t.node] = t.tone; }   // (a label the line does not name, in its colour all the same)
  // glowSeq (ms): the glow field lights in its order, one step apart (pressure passing back from the heart, D6).
  const at = new Map();
  (s.glow || []).forEach((g, i) => {
    const id = typeof g === 'string' ? g : g.id, tone = typeof g === 'string' ? null : g.tone, ms = s.glowSeq ? i * s.glowSeq : 0;
    // { id, soft: true }: a supporting vessel, lit more gently than the one the slide is about.
    const add = (e, tn) => { glow.delete(e); glow.set(e, tn); if (ms) at.set(e, ms); if (g.soft) soft.add(e); else soft.delete(e); };
    if (TARGETS[id]) { const t = TARGETS[id]; if (t.lit) lit.add(id); if (t.res) res.set(t.res, tone || t.tone); for (const e of t.edges || []) add(e, tone || t.tone); if (t.organ) organs.set(t.organ, tone || t.tone); }
    else if (ORGANS.has(id)) organs.set(id, tone || TARGETS[id]?.tone);
    else add(id, tone || EDGE_TONE[id] || 'accent');
  });
  // A lobule slide that lights the portal venule's or the central vein's reading lights the sinusoids' as well: the
  // sinusoidal pressure sits between the two, and the other labels are faded out (Mohammad, 16 Oct).
  if (lit.has('lobule:central') || lit.has('lobule:triad')) lit.add('lobule:sinusoid');
  if (isDop(s)) { const v = s.tool.vessel || 'PV_TRUNK'; if (glow.has(v)) glow.set(v, '--doppler'); }
  return { labels, terms, glow: [...glow].map(([id, tone]) => ({ id, tone, at: at.get(id) || 0, soft: soft.has(id) || undefined })), organs: [...organs].map(([id, tone]) => ({ id, tone })), res: [...res].map(([id, tone]) => ({ id, tone })), lit: [...lit], sites: [...sites] };
}
// A live value pill ({pv}): the model's reading for this slide, to its usual decimal.
// {ppg@before}: the value at another slide of the deck (its id), set by the presenter while a deck plays.
let fpAt = () => null;
const atRe = /^(\w+)@([\w-]+)$/;
function liveVal(k, s, fp) {
  const T = TILE[k], v = fp?.[k];
  if (v == null || !Number.isFinite(v)) return '…';
  const d = T.d ?? 1;
  return `${fmt(v * (T.x || 1), d)}${T.u ? ` ${T.u}` : ''}`;
}
// A line, typeset (see above). Also: {pv} a live value, {>=10 mmHg} a cut-off (outlined), and a term that points
// at the figure, [portal vein](pv) or through the slide's terms field, as a pill in its station's colour.
// The line's tokens, in the order they win where two start at one place: a [link](target), a {marked value}, a disease
// name (so a term or bold word inside one, "portal vein" in "portal vein thrombosis", never takes its violet pill), a
// slide term, a value with a unit, a key word, a first-mention term. Group 5 is the disease name.
// (A group that never matches holds the place of an empty list, so each kind keeps its group number.)
function lineRe(s = {}) {
  const keys = [...(s.key || []).map((k) => KEYWORDS[k]).filter(Boolean), ...(s.bold || []).map(esc)];
  const tl = termList(s), tw = tl.map(([w]) => w.replace(/(^|\|)([a-z])/g, (_, p, c) => `${p}[${c}${c.toUpperCase()}]`));   // (a term may open the sentence)
  const re = new RegExp(String.raw`\[([^\]]+)\]\(([\w:]+)\)|\{([^}]+)\}([,.;:]?)|\b(${DISEASE_SRC})\b` + (tw.length ? `|\\b(${tw.join('|')})\\b` : '|((?!))') + `|(${VAL})([,.;:]?)` + (keys.length ? `|\\b(${keys.join('|')})\\b` : '|((?!))') + `|\\b(${TERMS.join('|')})\\b|${LENS_RE}`, 'g');
  return { re, tl };
}
// A view the words name ("With the vessels colored by congestion"): the view's name is a pill in that view's own colour,
// as its key on the figure draws it (Mohammad, 16 Oct). It points at nothing on the figure, so it lights nothing.
export const LENS_WORDS = { 'pressure drop': 'drop', 'blood origin': 'origin', origin: 'origin', velocity: 'velocity', 'flow volume': 'flow',
  flow: 'flow', direction: 'direction', congestion: 'heat', change: 'delta', oxygen: 'oxygen' };
export const LENS_TONE = { velocity: '--vel-normal', flow: '--lens-flow', direction: '--flow-reversed', heat: '--lens-heat', drop: '--lens-drop', delta: '--delta-high', origin: '--origin-spleen', oxygen: '--lens-oxygen' };
const LENS_RE = String.raw`\b([Cc]olou?red by )(${Object.keys(LENS_WORDS).sort((a, b) => b.length - a.length).join('|')})\b`;
function rich(t, s = {}, fp = null) {
  const { re, tl } = lineRe(s);
  const marked = /\{[^}]+\}/.test(t);
  const out = [], seen = new Set(), seenT = new Set(); let at = 0, bold = 0, pills = 0, m;
  t = nb(t);
  // A pill keeps the word before it and the stop after it on its line (a no-break space, one unbreakable span).
  const glue = () => { const prev = out[out.length - 1]; if (typeof prev === 'string') out[out.length - 1] = prev.replace(/ $/, '\u00a0'); };
  const pill = (v, stop, cls = '', tone = null) => { glue();
    pills++; return h('span', { class: 'pz-nw' }, h('span', { class: `pz-val${cls}${tone ? ' tone' : ''}`, style: tone ? `--tone: ${toneVar(tone)}` : null }, v.replace(/\s(?=mmHg|g\/dL|mL|kPa|cm\/s|mm\b|%)/, '\u00a0')), stop || ''); };
  const termPill = (w, k) => { const tone = TARGETS[k].organ === 'spleen' ? (fp && rateTone('spleen', fp)) || '--text-2' : TARGETS[k].tone;   // (the spleen's word, as its outline)
    return h('span', { class: 'pz-term', 'data-target': k, style: `--tone: ${toneVar(tone)}` }, w); };
  while ((m = re.exec(t))) {
    const [all, lw, lk, mk, mkStop, dz, tword, val, valStop, key, term, lensBy, lensW] = m, w = (key || term)?.toLowerCase().replace(/(?:s|ces)$/, '');
    if (val && (marked || pills || s.pill === false)) continue;
    if (term && (seen.has(w) || bold >= 3)) continue;
    if (key && seen.has(w)) continue;
    const tk = tword ? tl.find(([x]) => new RegExp(`^(?:${x})$`, 'i').test(tword))?.[1] : null;
    if (tword && (!tk || seenT.has(tk))) continue;
    out.push(t.slice(at, m.index));
    if (lensW) out.push(lensBy.replace(/ $/, '\u00a0'), h('span', { class: 'pz-term pz-lens-t', style: `--tone: ${toneVar(LENS_TONE[LENS_WORDS[lensW]])}` }, lensW));
    else if (lw) out.push(TARGETS[lk] ? termPill(lw, lk) : lw);
    else if (tword) { seenT.add(tk); out.push(termPill(tword, tk)); }
    else if (mk && TILE[mk]) out.push(pill(liveVal(mk, s, fp), mkStop, '', valTone(mk, fp)));
    else if (mk && atRe.test(mk) && TILE[mk.match(atRe)[1]]) { const [, k, id] = mk.match(atRe), f = fpAt(id); out.push(pill(liveVal(k, s, f), mkStop, '', valTone(k, f))); }
    else if (mk && /^[<>≥≤]=?/.test(mk)) out.push(pill(mk.replace(/^(?:>=|<=|[<>≥≤])\s*/, ''), mkStop, ' cut'));
    else if (mk) out.push(pill(mk, mkStop, ' cut'));   // (a number typed in braces, {6 to 8 g}: a rule, outlined; only a live value is the patient)
    else if (val) out.push(pill(val, valStop, ' cut'));   // (a typed number is a rule or a figure from the literature, not the patient: outlined)
    else if (dz) out.push(h('span', { class: 'pz-dz' }, dz));
    else { seen.add(w); bold++; out.push(h('b', {}, key || term)); }
    at = m.index + all.length;
    // (A term pill keeps the stop or bracket after it on its line.)
    const last = out[out.length - 1];
    if (last?.classList?.contains('pz-term') && /^[),.;:]+/.test(t.slice(at))) { const st = t.slice(at).match(/^[),.;:]+/)[0]; out[out.length - 1] = h('span', { class: 'pz-nw' }, last, st); at += st.length; }
  }
  out.push(t.slice(at));
  return out;
}
// The still column inside the lobule (D5), for a wedge slide with column: true: the balloon stops the hepatic vein,
// and the column behind it (in the wedge colour) fills back through the central vein and the sinusoids to the
// first moving blood. Here it stops at the resistance in the portal tract (schistosomiasis), so the wedge never sees it.
function wedgeColumn() {
  const S = 'http://www.w3.org/2000/svg', el = (t, a = {}, txt) => { const e = document.createElementNS(S, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (txt) e.textContent = txt; return e; };
  const svg = el('svg', { class: 'pz-col', viewBox: '0 0 360 98', role: 'img', 'aria-label': 'The still column fills from the balloon back through the central vein and the sinusoids, and stops at the resistance in the portal tract.' });
  const shapes = [
    el('rect', { class: 'c-pv', x: 4, width: 76, height: 18, rx: 9 }), el('rect', { class: 'c-sin', x: 92, width: 146, height: 14 }),
    el('rect', { class: 'c-hv', x: 238, width: 104, height: 20, rx: 10 }), el('rect', { class: 'c-fill', x: 92, width: 238, height: 20, rx: 6 }),
    el('ellipse', { class: 'c-bal', cx: 330, rx: 13, ry: 13 }), el('path', { class: 'c-blk' })];
  const topT = el('text', { class: 'c-top', 'text-anchor': 'middle' });
  const names = [[40, 'Portal vein'], [165, 'Sinusoids'], [262, 'Central vein'], [330, 'Balloon']].map(([x, t]) => ({ x, t, e: el('text', { 'text-anchor': 'middle' }, t) }));
  const blk = el('text', { class: 'c-blkt', 'text-anchor': 'middle' }, 'Resistance in the portal tract');
  svg.append(...shapes, topT, ...names.map((n) => n.e), blk);
  // The rows follow the lettering (the slide's caption size as drawn): a heading too wide for one line takes two, the
  // names take two rows when neighbours would touch, and each stays inside the box.
  const W = 360, inside = (x, w) => clamp(x, w / 2 + 1, W - w / 2 - 1);
  // (Widths are measured: the column only lays out while it shows.)
  const lines = (e, t, x, c) => {
    fsOf(e, c); e.textContent = t;
    if (e.getComputedTextLength() <= W - 6) { e.setAttribute('x', inside(x, e.getComputedTextLength()).toFixed(1)); return 1; }
    const sp = [...t.matchAll(/ /g)].map((m) => m.index).sort((p, q) => Math.abs(p - t.length / 2) - Math.abs(q - t.length / 2))[0];
    e.replaceChildren(...[t.slice(0, sp), t.slice(sp + 1)].map((l, i) => el('tspan', { x: W / 2, dy: i ? (1.2 * c).toFixed(1) : 0 }, l)));
    return 2;
  };
  // (At a large text size the four names would stand in four rows, a staircase taller than the card: the lettering then steps down,
  // never under half its role nor 12 px on the screen, until they fit two rows. Lobule slide 8 at 200 % on a 375 px phone ran its
  // last names under the controls.)
  fitChart(svg, ({ cap: c0 }, box) => {
    const ppu = box.width / W || 1, cMin = Math.max(c0 / 2, 12 / ppu);
    let c = c0;
    for (; c > cMin; c = Math.max(cMin, c * 0.9)) {
      names.forEach((n) => fsOf(n.e, c));
      const ws = names.map((n) => n.e.getComputedTextLength()), xs = names.map((n, i) => inside(n.x, ws[i]));
      const hit = (i, j) => Math.abs(xs[j] - xs[i]) < (ws[i] + ws[j]) / 2 + 6;
      if (!(hit(0, 2) || hit(1, 3))) break;
    }
    const lh = 1.2 * c, nTop = lines(topT, 'Still column: reads the sinusoids', 211, c);
    topT.setAttribute('y', (0.8 * c + 2).toFixed(1));
    const cy = 0.8 * c + 2 + (nTop - 1) * lh + 0.3 * c + 16, base = cy + 16 + 0.8 * c;
    names.forEach((n) => fsOf(n.e, c));
    const ws = names.map((n) => n.e.getComputedTextLength()), xs = names.map((n, i) => inside(n.x, ws[i]));
    const hit = (i, j) => Math.abs(xs[j] - xs[i]) < (ws[i] + ws[j]) / 2 + 6;
    const rows2 = names.some((_, i) => i && hit(i - 1, i));
    const rows3 = rows2 && (hit(0, 2) || hit(1, 3));
    const row = (i) => (rows3 ? i : rows2 ? i % 2 : 0);
    names.forEach((n, i) => { n.e.setAttribute('x', xs[i].toFixed(1)); n.e.setAttribute('y', (base + row(i) * lh).toFixed(1)); });
    const by = base + Math.max(...names.map((_, i) => row(i))) * lh + lh;
    const nBlk = lines(blk, 'Resistance in the portal tract', 86, c); blk.setAttribute('y', by.toFixed(1));
    [[0, cy - 9], [1, cy - 7], [2, cy - 10], [3, cy - 10]].forEach(([i, y]) => shapes[i].setAttribute('y', y.toFixed(1)));
    shapes[4].setAttribute('cy', cy.toFixed(1)); shapes[5].setAttribute('d', `M78 ${cy - 12} L94 ${cy + 12} M94 ${cy - 12} L78 ${cy + 12}`);
    svg.setAttribute('viewBox', `0 0 ${W} ${(by + (nBlk - 1) * lh + 0.3 * c + 2).toFixed(1)}`);
  });
  nextFrame(() => nextFrame(() => svg.classList.add('in')));
  return svg;
}
const tileVal = (k, v) => (v == null ? '—' : fmt(v * (TILE[k]?.x ?? 1), TILE[k]?.d ?? 1));
// The live model's numbers in the fingerprint's terms (a time-lapse plays on the live figure).
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
function liveFp(fr) {
  const m = fr.metrics, a = m.ascites, P = fr.Pf || fr.P;
  return { pv: m.pv, whvp: m.whvp, fhvp: m.fhvp, hvpg: tenthGap(m.whvp, m.fhvp, m.hvpg), ra: m.vitals?.ra ?? m.ra, ivc: m.ivc, ppg: tenthGap(m.pv, m.ivc, m.ppg), asc: a.volume, saag: a.saag, tp: a.totalProtein,
    sin: P?.[NI.SIN_R], int: P?.[NI.INT], varix: m.varix.d, wall: m.varix.ratio, gv: m.gastricVarix.d, spleen: m.spleen.length, plt: m.spleen.platelets,
    pvFlow: m.pvFlowMean, shunt: m.shuntFraction, liver: m.liverPerfPct, map: m.map, hr: m.hr, lsm: m.lsm, pvVel: m.pvVelMean, hb: m.blood?.hb, co: m.co, bv: m.blood?.volume,
    at: P && fr.D ? { P, Q: fr.Qf || fr.Q, D: fr.D } : null };
}

// A value counts from where it was to where it goes (eased, about a second); reduced motion jumps.
function tweener(draw) {
  let cur = null, raf = 0;
  const run = (to, ms = 950) => {
    cancelFrame(raf);
    if (!cur || reduce.matches || ms === 0) { cur = { ...to }; draw(cur); return; }
    const from = { ...cur }, t0 = performance.now();
    const step = (now) => {
      const u = ease(clamp((now - t0) / ms, 0, 1));
      for (const k of Object.keys(to)) cur[k] = from[k] == null || to[k] == null ? to[k] : from[k] + (to[k] - from[k]) * u;
      draw(cur);
      if (u < 1) raf = nextFrame(step);
    };
    raf = nextFrame(step);
  };
  run.again = () => { if (cur) draw(cur); };   // (the same frame again, after the geometry moved)
  return run;
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
let uid = 0;

// A drawn chart lays out in its own units, scaled to its card, so its lettering is set from the slide's type scale as
// drawn: lay(fs) gets each role (--s-cap … --s-big, the text size setting included) in the chart's units and places the
// text and the rows around it. It runs again when the chart is resized or the text size changes, until the scale settles.
const ROLE_NAMES = ['cap', 'lab', 'body', 'val', 'big'];
const fitted = new Set();
const fitNow = (c) => {
  const { svg, lay } = c;
  if (!svg.isConnected) { fitted.delete(c); c.ro?.disconnect(); return; }
  for (let n = 0; n < 8; n++) {
    // (Units per css px, before a full card's zoom: the chart's lettering zooms with the rest of its card.)
    const m = svg.getScreenCTM?.(), k = m && m.a ? 1 / m.a : 0, box = svg.getBoundingClientRect();
    if (!k || !box.width) return;
    // (A chart in a data card reads the card's own chart sizes, --ch-<role>, where it sets them: a ladder's words at the tiles' small size.)
    const pr = document.createElement('span'), host = svg.closest('.pz-data, .pz-cell') || svg.closest('.pz') || document.body;
    pr.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    host.append(pr);
    const fs = {};
    // (The screen's matrix carries the card's zoom: a data card whose words zoom down past its fit's last step, --pz-z, has its
    // chart's words drawn that much smaller too.)
    let wz = parseFloat(host.style?.getPropertyValue('--pz-z')) || 1;
    // (A phone's site ladders zoom with their card, --pz-fit, as its words do: read through the matrix alone, the fit's own zoom made
    // their lettering larger in the chart's units, the strips taller, and the card stayed zoomed to half for good.)
    const cellGrid = svg.closest(':is(.pz.stack, .pz.low) .pz-cell')?.parentElement;
    if (cellGrid) wz *= parseFloat(getComputedStyle(cellGrid).zoom) || 1;
    // (A wide card's opened strip, folded behind Show, keeps its own size whatever the card's zoom (app.css): following the zoom, its
    // height changed the card's fit, the fit its zoom, and the card never came to rest.)
    if (svg.matches('.pz:not(.stack):not(.low) .pz-data.pz-folds.tool-open:not(.has-tool) > .pz-strip')) wz = 1;
    for (const r of ROLE_NAMES) { pr.style.fontSize = `var(--ch-${r}, var(--s-${r}))`; fs[r] = parseFloat(getComputedStyle(pr).fontSize) * k * wz; }
    pr.remove();
    if (c.fs && ROLE_NAMES.every((r) => Math.abs(c.fs[r] - fs[r]) < 0.01 * fs[r]) && Math.abs(c.w - box.width) + Math.abs(c.h - box.height) < 1) return;
    c.fs = fs; c.w = box.width; c.h = box.height; lay(fs, box);
  }
};
// A vertical hairline's x, in a chart's units, moved to whole device pixels so its 1 px stroke draws crisp, not smeared over two.
const snapX = (svg, x) => {
  const m = svg.getScreenCTM?.(), d = Math.round(globalThis.devicePixelRatio || 1) || 1;
  if (!m || !m.a) return x;
  const L = Math.round((m.a * x + m.e) * d - d / 2);
  return ((L + d / 2) / d - m.e) / m.a;
};
const est = (t, px, w = 0.6) => String(t).length * px * w;   // (a run's width: Inter averages about 0.6 em a character, 0.66 bold capitals)
function fitChart(svg, lay) {
  const c = { svg, lay, fs: null };
  fitted.add(c);
  // (On the next frame, not inside the observer: the new layout changes the chart's own height.)
  if (typeof ResizeObserver !== 'undefined') { c.ro = new ResizeObserver(() => { cancelAnimationFrame(c.raf); c.raf = requestAnimationFrame(() => fitNow(c)); }); c.ro.observe(svg); }
  return c;
}
if (typeof addEventListener !== 'undefined') addEventListener('pps:labelscale', () => requestAnimationFrame(() => fitted.forEach(fitNow)));
const fsOf = (el, px) => { el.style.fontSize = px.toFixed(2) + 'px'; };

// The block is a hatched fill: bold diagonal red stripes over a faint red tint (visible in light and dark, no label).
// Shared by the ladders and the level rail, so the block looks the same everywhere.
const hatch = (id, s) => sv('pattern', { id, width: s, height: s, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
  sv('rect', { class: 'pz-hb', width: s, height: s }), sv('rect', { class: 'pz-hs', width: s / 2, height: s }));
/** The block on the level rail: the phone ladder's block (rounded, red outline, red hatching) wrapped round the blocked level's whole bar. */
function railBlock() {
  const id = 'pzRailB' + ++uid;
  return sv('svg', { class: 'pz-rail-blk', 'aria-hidden': 'true' },
    sv('defs', {}, hatch(id, 7)), sv('rect', { class: 'pzs-drop', width: '100%', height: '100%', rx: 6, fill: `url(#${id})` }));
}
/** The pressure ladder at projector size: five stations, the healthy line dashed behind, every fall of
 *  more than 4 mmHg shaded as a block. Under the axis, as on the app's own pressure chart, two spans run
 *  along the stations, named: HVPG (wedged to free hepatic vein) and PPG (portal
 *  vein to the IVC), coloured by their cut-offs, with faint leaders up to the
 *  stations they join. set(f, { key }) glides the line and counts the numbers. */
const LADDER_FILL = '.pz:not(.stack):not(.low) .pz-data:not(.tiles-only) > .pz-ladder';   // (styles/app.css: a ladder card's ladder, words at one size)
function bigLadder() {
  // The geometry follows the lettering (lay, from the slide's type scale): the margins, rows and station spacing grow with
  // the text, the station names and the falls take two rows when one is too tight, and the box grows taller, never wider.
  const W = 500;
  let H = 362, x0 = 56, step = 97, yTop = 54, c = 17, l = 25, ph = 26, nameY = [354, 354], gx = 44, tx = 34;
  let PH = 198;
  const X = (i) => x0 + i * step;
  // The axis fits the data: the smallest of 12, 20, 30, 40 or 50 mmHg that clears the highest station (the healthy line
  // included), with round ticks (every 4, 5 or 10, every other one when the lettering would crowd them). Scale and ticks ease.
  let top = 12, tTo = 12, baseVals = null;
  const Y = (v) => yTop + PH - clamp(v, 0, top) * (PH / top);
  const TOPS = [12, 20, 30, 40, 50], TICKS = [0, 4, 5, 8, 10, 12, 15, 20, 30, 40, 50];
  const stepOf = (t) => (t <= 12 ? 4 : t <= 20 ? 5 : 10);
  const every = (t) => (PH / t * stepOf(t) < 1.3 * c ? 2 : 1);
  const wOf = (v, t) => (v % stepOf(t) === 0 && v <= t ? 1 : 0);
  const gid = 'pzGrad' + ++uid;
  const base = sv('path', { class: 'pzl-base' });
  const line = sv('path', { class: 'pzl-line', stroke: `url(#${gid})` });
  const bands = [0, 1, 2, 3].map(() => {
    const r = sv('rect', { rx: 12, fill: `url(#${gid}hb)` });   // (placed in lay; y and height follow the axis, in draw; the band carries no label)
    return { g: sv('g', { class: 'pzl-drop', opacity: 0 }, r), r };
  });
  // A block that sits on a station itself (the right atrium in heart failure), not on a stretch of line: the same hatched
  // rectangle as the others, from just left of that node to a little right of it, under the reading. A slide asks for it with
  // block: 'ra'; the rectangle follows its node, and fades in and out.
  const nodeBlk = sv('rect', { class: 'pzl-nb', rx: 12, fill: `url(#${gid}hb)`, opacity: 0 });
  let blockAt = -1;
  const pts = RUNGS.map(([, a]) => {
    const c = sv('circle', { r: 8.5 }), v = sv('text', { class: 'pzl-v', 'text-anchor': 'middle' }), k = sv('text', { class: 'pzl-k', 'text-anchor': 'middle' }, a);
    return { g: sv('g', { class: 'pzl-pt' }, c, v, k), c, v, k };
  });
  // A gradient span: a bar with end caps from one station's column to another's, dotted leaders up to the two
  // station points, and its name and reading written in the line's gap, as on the phone's strip.
  const span = (name, i0, i1) => {
    const lead = sv('path', { class: 'pzl-lead' }), bar = sv('path', { class: 'pzl-br' });
    const txt = sv('text', { class: 'pzl-bk', 'text-anchor': 'middle' }, name);
    return { name, i0, i1, row: 0, lead, bar, txt, label: name, g: sv('g', { class: 'pzl-bg', opacity: 0 }, lead, bar, txt) };
  };
  const placeSpan = (b) => {
    b.x0 = X(b.i0); b.x1 = X(b.i1); b.mid = (b.x0 + b.x1) / 2;
    // The label sits in the line's gap when the line keeps at least 10 a side; otherwise the line runs unbroken
    // across the span (raised a little) and the label is centred just under it, so it never sits on a drop line.
    const w = est(b.label, c, 0.64) + 0.9 * c, r = b.row, inl = b.x1 - b.x0 - w >= 20;
    b.by = inl ? r : r - 0.5 * c;
    const by = b.by.toFixed(1);
    b.bar.setAttribute('d', `M${b.x0} ${(b.by - 5).toFixed(1)}V${(b.by + 5).toFixed(1)}M${b.x1} ${(b.by - 5).toFixed(1)}V${(b.by + 5).toFixed(1)}M${b.x0} ${by}`
      + (inl ? `H${(b.mid - w / 2).toFixed(1)}M${(b.mid + w / 2).toFixed(1)} ${by}H${b.x1}` : `H${b.x1}`));
    b.txt.setAttribute('x', b.mid); b.txt.setAttribute('y', (inl ? r + 0.35 * c : r + 0.72 * c).toFixed(1)); fsOf(b.txt, c);
    b.g.classList.toggle('below', !inl);
  };
  const hv = span('HVPG', 1, 2), pp = span('PPG', 0, 3);
  // The phone's strip, two short rows: the station names over the five readings as plain numbers, on the ladder's own
  // line, straight and thick, with the fall written above each stretch (the largest named by colour, a fall over 4 in red). Under them the HVPG and PPG as thin brackets with their reading
  // in the rating's colour (numbers only, no arrows), so a phone needs no tiles. Its rows follow its lettering too (layS).
  const S = { W: 360, ky: 9, dy: 16, ny: 27, vy: 32.5, hvpg: 52, ppg: 68, H: 76, c: 11, d: 12, v: 15, gap: 13 }, XS = (i) => 28 + 70 * i;
  const conns = [0, 1, 2, 3].map(() => ({ band: sv('rect', { class: 'pzs-drop', rx: 6, opacity: 0, fill: `url(#${gid}hs)` }) }));
  // (The line stops a clear gap short of each reading, so no outline is needed: the gap is measured from the digits' own edge, so it is the same beside one digit or two, and it eases when a reading gains or loses a digit.)
  const sline = sv('path', { class: 'pzs-c', stroke: `url(#${gid}s)` });
  // (A block on a station itself: the hatching in a rounded patch behind that reading, as the ladder's disc.)
  const snodeBlk = sv('rect', { class: 'pzs-nb', rx: 6, fill: `url(#${gid}hs)`, opacity: 0 });
  const sgrad = sv('linearGradient', { id: gid + 's', gradientUnits: 'userSpaceOnUse', x1: XS(0), x2: XS(4), y1: 0, y2: 0 }, sv('stop', { offset: 0, 'stop-color': 'var(--tour-portal)' }), sv('stop', { offset: 1, 'stop-color': 'var(--tour-sys)' }));
  const spts = RUNGS.map(([, a], i) => {
    const v = sv('text', { class: 'pzs-v', x: XS(i), 'text-anchor': 'middle' });
    return { g: sv('g', { class: 'pzs-pt' }, v), v, k: sv('text', { class: 'pzs-k', x: XS(i), 'text-anchor': 'middle' }, a) };
  });
  const sbr = (name, i0, i1) => {
    const x0 = XS(i0), x1 = XS(i1), t = ['bn', 'bv'].map((c) => sv('tspan', { class: 'pzs-' + c }));
    const lead = sv('path', { class: 'pzl-lead' }), bar = sv('path', { class: 'pzl-br' });
    const lbl = sv('text', { class: 'pzs-bl', x: (x0 + x1) / 2, 'text-anchor': 'middle' }, t);
    return { name, x0, x1, row: 0, lead, t, bar, lbl, g: sv('g', { class: 'pzl-bg', opacity: 0 }, lead, bar, lbl) };
  };
  const hvS = sbr('HVPG', 1, 2), ppS = sbr('PPG', 0, 3);
  const unit = sv('text', { class: 'pzs-u', 'text-anchor': 'end' }, 'mmHg');
  const strip = sv('svg', { class: 'pz-strip', viewBox: `0 0 ${S.W} ${S.H}`, role: 'img' },
    sv('defs', {}, sgrad, hatch(gid + 'hs', 7)), conns.map((c) => c.band), snodeBlk, sline, spts.map((p) => [p.g, p.k]), unit, hvS.g, ppS.g);
  // A bracket's label: inline with a gap each side when the bracket has room for it, otherwise just above an unbroken line
  // (its width an estimate, so a hidden strip needs no measuring and nothing jumps).
  const lay = (b) => {
    if (!b.len) return;
    const half = b.len / 2 + 0.6 * S.c, mid = (b.x0 + b.x1) / 2, r = b.row, above = b.x1 - b.x0 - 2 * half < 14;
    b.above = above;
    b.lbl.setAttribute('y', (above ? r - 0.4 * S.c : r + 0.33 * S.c).toFixed(1));
    b.bar.setAttribute('d', `M${b.x0} ${r - 3}V${r + 3}M${b.x1} ${r - 3}V${r + 3}` + (above ? `M${b.x0} ${r}H${b.x1}` : `M${b.x0} ${r}H${mid - half}M${mid + half} ${r}H${b.x1}`));
  };
  const layS = (fs, box) => {
    // (A reading takes the largest role whose two digits still leave the line its gap on each side between stations 70 apart:
    // in a narrow card at a large text size the value role would run the readings into each other.)
    const fit = [fs.val, fs.body, fs.lab, fs.cap].filter((x) => x > 0), v0 = fit.find((x) => est('20', x, 0.62) + 2 * 5 + 10 <= 70) ?? Math.min(...fit);
    const c = S.c = fs.cap, v = S.v = v0;
    // The names take two rows when neighbours would touch. (No falls are written: a big one is shaded instead.)
    // The names tilt 45° when neighbours would touch, rising from just above their readings (two staggered rows crowded a narrow cell).
    // (Tilted names are parallel strips 70 × sin 45° = 49.5 apart: at a large text size, where letters that tall would touch, the
    // names stand upright instead, 70 apart, at the same size.)
    // (At a large text size the names step down first, never under half their role nor 12 px on the screen, so they stand
    // upright between stations: tilted, they made the strip twice as tall as its card and cut off its PPG row (recompensation
    // slide 5 at 200 % on a 375 px phone).)
    const ppu = box?.width ? box.width / S.W : 0, kMin = ppu ? Math.max(c / 2, 12 / ppu) : c;
    const wOf = (x) => Math.max(...RUNGS.map(([, a]) => est(a, x, 0.7)));
    let kc = c;
    while (wOf(kc) > 70 - 6 && kc > kMin) kc = Math.max(kMin, kc * 0.9);
    const nameW = wOf(kc), tilt = nameW > 70 - 6;
    const ang = !tilt ? 0 : 1.1 * kc <= 49.5 ? 45 : 90;
    S.ky = ang === 45 ? 0.71 * nameW + 0.9 * kc : ang ? nameW + 0.6 * kc : 0.8 * kc + 1; S.ky2 = S.ky;
    S.ny = S.ky2 + 0.3 * c + 0.55 * v + 3;
    // (A phone's site-ladder cell, upright or sideways, writes no names: the rows share one row of names over them, laddersGrid's .pz-grid-head.)
    const bare = !!strip.closest(':is(.pz.stack, .pz.low) .pz-cell');
    if (bare) { S.ky2 = -0.35 * c + 1; S.ny = 0.55 * v + 4; }
    S.vy = S.ny + 0.36 * v;
    numW.clear(); lineKey = '';
    // (In a wide card's shown strip the falls' shading keeps a clear 8 px or more from the readings either side: 2 was tight beside big digits.)
    bandPad = strip.closest('.pz:not(.stack):not(.low) .pz-data.pz-folds, .pz.stack .pz-data') ? 11 : 2;   // (a phone's card strip too, not a site cell's)
    // The unit sits after the last reading when it fits there, else at the end of the HVPG row (under the last stations).
    const inline = XS(4) + est('20', v, 0.62) / 2 + 8 + est('mmHg', c, 0.68) <= S.W - 1;
    // (The HVPG row sits clear of the falls' hatching under the readings: its label, raised over a short bracket, came within 3 px of it, text-200 review P4.)
    S.hvpg = S.ny + 0.5 * v + 7 + 1.2 * c; S.ppg = S.hvpg + 1.45 * c; S.H = S.ppg + 0.6 * c + 3;
    // (A phone's site-ladder cell hides the brackets, its kicker carries the HVPG: the strip ends under its readings.)
    if (bare) S.H = S.ny + 0.5 * v + 4;
    unit.style.display = bare ? 'none' : '';   // (a site row has no room for it beside its last reading, where a block's hatching may sit)
    // (With its unit in the header, a wide card's shown strip centres its readings: the room kept for the unit sat empty on the right.)
    const dx = strip.closest('.pz.stack .pz-data') ? -(S.W - XS(4) - XS(0)) / 2 : strip.closest('.pz:not(.stack):not(.low) .pz-data.pz-folds') ? -(S.W - XS(4) - XS(0)) / 2 - 4 : 0;   // (and 4 more: the first reading has two digits, the last one)
    strip.setAttribute('viewBox', `${dx.toFixed(1)} 0 ${S.W} ${S.H.toFixed(1)}`);
    conns.forEach((cn) => { const y0 = S.ky2 + 0.35 * c; cn.band.setAttribute('y', y0.toFixed(1)); cn.band.setAttribute('height', (S.ny + 0.5 * v - y0).toFixed(1)); });
    spts.forEach((p, i) => {
      p.v.setAttribute('y', S.vy.toFixed(1)); fsOf(p.v, v); fsOf(p.k, kc); p.k.style.display = bare ? 'none' : '';
      const x = ang === 45 ? XS(i) - 0.3 * kc : ang ? XS(i) + 0.36 * kc : XS(i);
      p.k.setAttribute('x', x.toFixed(1)); p.k.setAttribute('y', S.ky.toFixed(1)); p.k.setAttribute('text-anchor', ang ? 'start' : 'middle');
      if (ang) p.k.setAttribute('transform', `rotate(-${ang} ${x.toFixed(1)} ${S.ky.toFixed(1)})`); else p.k.removeAttribute('transform');
    });
    unit.setAttribute('x', S.W - 2); unit.setAttribute('y', (inline ? S.vy : S.hvpg + 0.33 * c).toFixed(1)); fsOf(unit, c);
    hvS.row = S.hvpg; ppS.row = S.ppg;
    for (const b of [hvS, ppS]) fsOf(b.lbl, c);
    draw.again(); placeLine();
  };
  // The connecting line between readings: each end stops LINE_PAD short of the digits' own edge. A reading's width is
  // measured once per digit count (tabular figures, so any number of that length is as wide), or estimated while the strip is hidden.
  const LINE_PAD = 5, numW = new Map(), halves = [0, 0, 0, 0, 0];
  let bandPad = 2;
  let lineKey = '', lineRaf = 0;
  const halfOf = (p) => {
    const t = p.v.textContent, n = t.length;
    if (!n) return 0;
    if (!numW.has(n)) {
      let w = 0;
      try { w = p.v.getComputedTextLength(); } catch { /* not rendered */ }
      if (!(w > 0)) return est(t, S.v, 0.62) / 2;
      numW.set(n, w);
    }
    return numW.get(n) / 2;
  };
  const placeNodeBlk = () => {
    if (blockAt < 0) return;
    const hw = Math.max(halves[blockAt], 6) + 5;   // (the reading's own width, then a little more to its right)
    snodeBlk.setAttribute('x', (XS(blockAt) - hw).toFixed(1)); snodeBlk.setAttribute('width', (2 * hw + 14).toFixed(1));
    snodeBlk.setAttribute('y', (S.vy - 0.78 * S.v - 2).toFixed(1)); snodeBlk.setAttribute('height', (1.05 * S.v + 4).toFixed(1));
  };
  const placeLine = () => {
    const goal = spts.map(halfOf), key = goal.join() + '|' + S.ny;
    if (key === lineKey) return;
    lineKey = key;
    const step = () => {
      let moving = false;
      goal.forEach((g, i) => { const d = g - halves[i]; if (!halves[i] || Math.abs(d) < 0.05) halves[i] = g; else { halves[i] += d * 0.3; moving = true; } });
      // (The big fall's band spans its stretch of line, between the two readings, from the falls' row down past the line.)
      conns.forEach((cn, i) => { const x = XS(i) + halves[i] + bandPad; cn.band.setAttribute('x', x.toFixed(1)); cn.band.setAttribute('width', Math.max(4, XS(i + 1) - halves[i + 1] - bandPad - x).toFixed(1)); });
      sline.setAttribute('d', [0, 1, 2, 3].map((i) => `M${(XS(i) + halves[i] + LINE_PAD).toFixed(2)} ${S.ny}H${(XS(i + 1) - halves[i + 1] - LINE_PAD).toFixed(2)}`).join(''));
      placeNodeBlk();
      lineRaf = moving ? requestAnimationFrame(step) : 0;
    };
    cancelAnimationFrame(lineRaf); step();
  };
  document.fonts?.ready.then(() => { numW.clear(); lineKey = ''; placeLine(); });
  fitChart(strip, layS);
  const grid = TICKS.map((v) => {
    const line = sv('line', {}), txt = sv('text', { 'text-anchor': 'end' }, String(v));
    return { v, line, txt, g: sv('g', { class: 'pzl-grid' }, line, txt) };
  });
  const drawBase = () => {
    base.setAttribute('d', baseVals ? RUNGS.map(([k], i) => `${i ? 'L' : 'M'}${X(i)} ${Y(baseVals[k]).toFixed(1)}`).join(' ') : '');
  };
  let verdict = {};
  const el = sv('svg', { class: 'pz-ladder', viewBox: `0 0 ${W} ${H}`, role: 'img' },
    sv('defs', {}, hatch(gid + 'hb', 14), sv('linearGradient', { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 }, sv('stop', { offset: 0, 'stop-color': 'var(--tour-portal)' }), sv('stop', { offset: 1, 'stop-color': 'var(--tour-sys)' }))),
    grid.map((r) => r.g),
    bands.map((b) => b.g), nodeBlk, hv.g, pp.g, base, line, pts.map((p) => p.g));
  const layL = (fs, box) => {
    c = fs.cap; l = fs.lab; ph = 1.75 * c;
    // (The first reading, centred on its station, stays clear of the axis numbers to its left.)
    tx = est('50', c) + 4; gx = tx + 0.5 * c; x0 = Math.max(gx + 12, tx + 6 + 0.62 * l);
    const xr = W - Math.max(56, Math.max(est('WHVP', c, 0.66) / 2, est('20', l) / 2) + 8);
    step = (xr - x0) / 4;
    // (Two rows only when two neighbouring names, as drawn, would come closer than a quarter letter.)
    const kw = pts.map((p, i) => { fsOf(p.k, c); let w = 0; try { w = p.k.getComputedTextLength(); } catch { /* not rendered */ } return w > 0 ? w : est(RUNGS[i][1], c, 0.78); });
    const nameRows = kw.some((w, i) => i && (w + kw[i - 1]) / 2 + 0.25 * c > step) ? 2 : 1;
    // (The readings sit above their points, at the top of the plot.)
    yTop = 6 + 0.8 * l + 12.5 + 0.22 * l;
    // (A ladder in a cell of fixed height, the site ladders, gives its plot whatever height the lettering leaves.)
    const cell = box && el.closest('.pz-panel.fill .pz-cell');
    // (A laptop's or tablet's ladder card gives the ladder a height (styles/app.css, shorter as the card fits): the plot takes
    // what the lettering leaves, so the words keep their size and only the plot gets shorter.)
    const own = box && !cell && el.matches(LADDER_FILL);
    // (A ladder card in a narrow column, a tablet's, packs its rows under the plot closer, so the plot keeps its height.)
    const tight = (own && box.width < 420) || !!cell;   // (and the six site ladders, so a big screen's cells keep a plot)
    if (tight) ph = 1.35 * c;
    const g1 = tight ? 9 : 13, g2 = tight ? 4 : 12, g3 = tight ? 6 : 10;
    const rows = (ph / 2 + g1) + (ph + g2) + (ph / 2 + g3 + 0.75 * c) + 0.25 * c + 6;
    // (Its lettering's own height goes to the stylesheet, --lad-fixed, so the box is that plus the plot's share of the card.)
    if (own) el.style.setProperty('--lad-fixed', `${((yTop + rows + (nameRows > 1 ? 1.15 * c : 0)) * box.width / W / (parseFloat(getComputedStyle(el).zoom) || 1)).toFixed(1)}px`);   // (in the ladder's own px, before a zoom of the card's words)
    if (cell || own) {
      PH = W * box.height / box.width - yTop - rows - (nameRows > 1 ? 1.15 * c : 0);
      // (Too short for a plot at this text size: the cell shows the strip instead, until a resize or the next slide.)
      // (All six or none, so the grid keeps its two rows; a box not laid out yet decides nothing.)
      // (The lettering above came through the screen's matrix, which shrinks with a last viewBox taller than the box: the fit
      // test reads it at the box's width, so the choice of plot or strip does not depend on the previous pass.)
      const fw = box.width ? Math.min(1, (el.getScreenCTM?.()?.a || 0) * W / box.width) || 1 : 1;
      const PHw = W * box.height / box.width - (yTop + rows + (nameRows > 1 ? 1.15 * c : 0)) * fw;
      // (A cell its grid leaves no height at all, a phone held sideways, has no room for a plot either: it had drawn nothing.)
      if (cell && box.width > 0 && (box.height <= 0 || PHw < 48)) { for (const x of cell.parentElement.children) x.classList.toggle('strip', x.classList.contains('pz-cell')); PH = 48; }
      // (Too short for a readable plot: the card shows the compact strip instead, until a resize or the next slide.)
      // (The card is laid out again at once for its strip: left to the next resize, a strip too tall for its room stood cut off at
      // the card's foot until then.)
      const dd = own && box.height > 0 && PHw < 48 ? el.closest('.pz-data') : null;
      if (dd && !dd.classList.contains('strip')) { dd.classList.add('strip'); dd.dispatchEvent(new Event('pz-strip')); }
      if (own) PH = Math.max(12, PH);
    } else PH = 198;
    const yBot = yTop + PH;
    hv.row = yBot + ph / 2 + g1; pp.row = hv.row + ph + g2;
    nameY = [pp.row + ph / 2 + g3 + 0.75 * c]; nameY[1] = nameY[0] + (nameRows > 1 ? 1.15 * c : 0);
    H = nameY[1] + 0.25 * c + 6;
    el.setAttribute('viewBox', `0 0 ${W} ${H.toFixed(1)}`);
    for (const g of grid) { g.line.setAttribute('x1', gx.toFixed(1)); g.line.setAttribute('x2', W - 10); g.txt.setAttribute('x', tx.toFixed(1)); fsOf(g.txt, c); }
    // (A fall's band keeps 8 px as drawn clear of the two-digit readings at its ends: at 16 units a WHVP of 23 ran 2 px into it.)
    const bp = Math.max(16, est('20', l, 0.62) / 2 + 8 * (box?.width ? W / box.width : 1));
    bands.forEach((b, i) => { b.r.setAttribute('x', (X(i) + bp).toFixed(1)); b.r.setAttribute('width', Math.max(4, step - 2 * bp).toFixed(1)); });
    pts.forEach((p, i) => {
      p.c.setAttribute('cx', X(i).toFixed(1)); p.v.setAttribute('x', X(i).toFixed(1)); fsOf(p.v, l);
      p.k.setAttribute('x', X(i).toFixed(1)); p.k.setAttribute('y', nameY[i % 2].toFixed(1)); fsOf(p.k, c);
    });
    placeSpan(hv); placeSpan(pp);
    draw.again();
  };
  fitChart(el, layL);
  const draw = tweener((f) => {
    top = clamp(f.top || 12, 12, 50);
    const sparse = every(tTo);
    for (const g of grid) {
      g.line.setAttribute('y1', Y(g.v).toFixed(1)); g.line.setAttribute('y2', Y(g.v).toFixed(1)); g.txt.setAttribute('y', (Y(g.v) + 0.36 * c).toFixed(1));
      // (A plot too short for two rows of numbers names only its zero line.)
      g.g.setAttribute('opacity', (clamp(f['g' + g.v] ?? 0, 0, 1) * (g.v % (stepOf(tTo) * sparse) === 0 && (g.v === 0 || PH >= 2.4 * c) ? 1 : 0)).toFixed(3));
    }
    bands.forEach((b) => { b.r.setAttribute('y', (Y(top) - 6).toFixed(1)); b.r.setAttribute('height', (Y(0) - Y(top) + 6).toFixed(1)); });
    drawBase();
    const y = RUNGS.map(([k]) => Y(f[k]));
    line.setAttribute('d', y.map((yy, i) => `${i ? 'L' : 'M'}${X(i)} ${yy.toFixed(1)}`).join(' '));
    if (blockAt >= 0) {
      const yt = y[blockAt] - 12, yb = Math.max(Y(0), y[blockAt] + 12);   // (starts just above the node, so its reading stays clear)
      nodeBlk.setAttribute('x', (X(blockAt) - 0.12 * step).toFixed(1)); nodeBlk.setAttribute('width', (0.46 * step).toFixed(1));
      nodeBlk.setAttribute('y', yt.toFixed(1)); nodeBlk.setAttribute('height', (yb - yt).toFixed(1));
    }
    pts.forEach((p, i) => { p.c.setAttribute('cy', y[i].toFixed(1)); p.v.setAttribute('y', (y[i] - 12.5 - 0.22 * l).toFixed(1)); p.v.textContent = fmt(f[RUNGS[i][0]], 0); });
    // The strip: readings in the nodes, the fall on each connector (from the rounded readings, so it adds up).
    const raw = conns.map((_, i) => Math.max(0, f[RUNGS[i][0]] - f[RUNGS[i + 1][0]]));
    spts.forEach((p, i) => { p.v.textContent = fmt(f[RUNGS[i][0]], 0); });
    placeLine();
    conns.forEach((c, i) => {
      // A big fall is shaded, as on the ladder; no fall is written as a number.
      c.band.setAttribute('opacity', clamp((raw[i] - 4) / 3, 0, 1).toFixed(3));
    });
    bands.forEach((b, i) => {
      const d = f[RUNGS[i][0]] - f[RUNGS[i + 1][0]];
      b.g.setAttribute('opacity', clamp((d - 4) / 3, 0, 1).toFixed(3));
    });
    // Each span fades out when a level is not measurable (Budd-Chiari has no wedge). Its leaders end on the points.
    // Each pill is coloured by its own number against its own cut-offs; a slide's verdict (brackets: { hvpg: 'misleads' })
    // only marks it.
    const put = (b, hi, lo, v, rate) => {
      const ok = Number.isFinite(hi) && Number.isFinite(lo) && Number.isFinite(v);
      b.g.setAttribute('opacity', ok ? 1 : 0);
      if (!ok) return;
      b.lead.setAttribute('d', `M${snapX(el, b.x0).toFixed(2)} ${(b.by ?? b.row) - 6}V${(Y(hi) + 12).toFixed(1)}M${snapX(el, b.x1).toFixed(2)} ${(b.by ?? b.row) - 6}V${(Y(lo) + 12).toFixed(1)}`);
      const say = verdict[b.name.toLowerCase()];
      b.g.dataset.rate = rate;
      b.g.classList.toggle('says', !!say);
      const label = `${b.name} ${fmt(v, 0)}`;
      if (b.txt.textContent !== label) { b.txt.textContent = b.label = label; placeSpan(b); }
    };
    // The card reads in whole mmHg, so each gradient is the difference of the whole readings, coloured by its own value.
    const gH = wholeGap(f.whvp, f.fhvp, f.hvpg), gP = wholeGap(f.pv, f.ivc, f.ppg);
    put(hv, f.whvp, f.fhvp, gH, rateOf('hvpg', { hvpg: gH })[0] || 'ok');
    put(pp, f.pv, f.ivc, gP, rateOf('ppg', { ppg: gP })[0] || 'ok');
    // The strip's brackets: name, reading and its rating (coloured by its own number; a slide's verdict only marks it).
    const putS = (b, hi, lo, v, k) => {
      const ok = Number.isFinite(hi) && Number.isFinite(lo) && Number.isFinite(v), [rate] = rateOf(k, { [k]: v });
      b.g.setAttribute('opacity', ok ? 1 : 0);
      if (!ok) return;
      b.g.dataset.rate = rate || 'ok';
      const num = ' ' + fmt(v, 0);
      b.t[0].textContent = b.name; b.t[1].textContent = num;
      b.len = est(b.name, S.c, 0.64) + est(num, S.c, 0.52); lay(b);
      // The leaders run from the bracket's ends up to the readings, broken 4 px round the label where it sits above the bar
      // and wider than it (its tick lines ran through "HVPG", text-200 review P3). The label's own box where it is drawn, else
      // its estimate.
      let bb = null;
      try { const q = b.lbl.getBBox(); if (q.width > 0) bb = { x0: q.x, x1: q.x + q.width, y0: q.y, y1: q.y + q.height }; } catch { /* not rendered */ }
      const mid = (b.x0 + b.x1) / 2, ly = b.above ? b.row - 0.4 * S.c : b.row + 0.33 * S.c;
      bb ||= { x0: mid - b.len / 2, x1: mid + b.len / 2, y0: ly - 0.8 * S.c, y1: ly + 0.25 * S.c };
      const top = S.ny + 0.5 * S.v + 2;
      const leg = (x) => {
        const sx = snapX(strip, x).toFixed(2);
        if (!b.above || x < bb.x0 - 4 || x > bb.x1 + 4) return `M${sx} ${b.row - 5}V${top}`;
        // (from the bar up to 4 px under the label, and from 4 px over it up to the reading, each where it has length)
        return (b.row - 5 - (bb.y1 + 4) > 1 ? `M${sx} ${b.row - 5}V${(bb.y1 + 4).toFixed(1)}` : '') + (bb.y0 - 4 - top > 1 ? `M${sx} ${(bb.y0 - 4).toFixed(1)}V${top}` : '');
      };
      b.lead.setAttribute('d', leg(b.x0) + leg(b.x1));
    };
    putS(hvS, f.whvp, f.fhvp, gH, 'hvpg'); putS(ppS, f.pv, f.ivc, gP, 'ppg');
    const say = 'Pressure ladder: ' + RUNGS.map(([k, a]) => `${a} ${fmt(f[k], 0)}`).join(', ') + ' mmHg. '
      + `HVPG ${fmt(gH, 0)}, PPG ${fmt(gP, 0)} mmHg.`;
    el.setAttribute('aria-label', say); strip.setAttribute('aria-label', say);
  });
  layL({ cap: 17, lab: 25 }); layS({ cap: 11, lab: 12, val: 15 });
  return {
    el, strip,
    setBase(b) { baseVals = b; drawBase(); },
    set(f, { key = [], ms, brackets = null, block = null } = {}) {
      verdict = brackets || {};
      const at = RUNGS.findIndex(([k]) => k === block);
      if (at >= 0) blockAt = at;
      nodeBlk.setAttribute('opacity', at >= 0 ? 1 : 0); snodeBlk.setAttribute('opacity', at >= 0 ? 1 : 0);
      spts.forEach((p, i) => p.g.classList.toggle('blk', i === at));
      placeNodeBlk();
      pts.forEach((p, i) => p.g.classList.toggle('key', key.includes(RUNGS[i][0])));
      spts.forEach((p, i) => p.g.classList.toggle('key', key.includes(RUNGS[i][0])));
      const hi = Math.max(f.pv, f.whvp, f.fhvp, f.ra, f.ivc ?? f.ra, ...(baseVals ? RUNGS.map(([k]) => baseVals[k]) : []));
      const t = tTo = TOPS.find((v) => v >= hi + 1.5) || 50;
      draw({ top: t, ...Object.fromEntries(TICKS.map((v) => ['g' + v, wOf(v, t)])), pv: f.pv, whvp: f.whvp, fhvp: f.fhvp, ra: f.ra, ivc: f.ivc ?? f.ra, hvpg: f.hvpg, ppg: f.ppg }, ms);
    },
  };
}

/** Big number tiles, each rated; set() counts to the new values. Given ref (an earlier state's numbers), each
 *  tile also says how far it moved from there, green when it went the better way (and plain within normal). */
function bigTiles() {
  const el = h('div', { class: 'pz-tiles' });
  let sig = '', parts = [], draw = null, goal = false;
  // After TIPS the PPG is read against its target (below 12 mmHg), so a tile never says "High" under a line that
  // says the target is reached.
  const rated = (k, f) => (goal && k === 'ppg' && f.ppg != null ? (f.ppg < 12 ? ['ok', 'Target met'] : ['hi', 'Above target']) : rateOf(k, f));
  // (A tile's word judges the number it prints: 4.98 L shows "5.0 L", so it reads Grade 3.)
  const ratedShown = (k, f) => (f[k] != null ? rated(k, { ...f, [k]: tileShown(k, f[k]) }) : rated(k, f));
  // Where a value sits on its tile's bar, 0 to 100 (shown units, held inside the bar).
  const at = (k, v) => { const [a, b] = SCALE[k], x = TILE[k]?.x ?? 1; return Math.min(100, Math.max(0, ((v * x - a) / (b - a)) * 100)); };
  function build(ks, withRef) {
    const bars = ks.some((k) => SCALE[k]);
    parts = ks.map((k) => {
      const T = TILE[k] || { t: k, s: '', u: '' };
      const v = h('span', { class: 'pzt-v' }), u = h('small', {}, T.u), r = h('span', { class: 'pzt-r' });
      const d = h('span', { class: 'pzt-d' });
      // The scale bar: the tile's bands (coloured by its rating), its cut-offs, a ring where it started (given ref) and a dot
      // where it is. A tile with no scale beside one that has one keeps an empty bar, so every tile in a row is the same height.
      const bands = bandsOf(k) || [], S = SCALE[k];
      const zs = bands.map((z) => h('i', { class: 'pzb-z', style: `left:${at(k, z.a / (T.x ?? 1))}%;width:${at(k, z.b / (T.x ?? 1)) - at(k, z.a / (T.x ?? 1))}%` }));
      const ts = S ? S[2].map((c) => h('i', { class: 'pzb-t', style: `left:${at(k, c / (T.x ?? 1))}%` })) : [];
      const ls = S ? S[2].map((c) => h('span', { class: 'pzb-l', style: `left:${at(k, c / (T.x ?? 1))}%` }, fmt(c, Math.abs(c % 1) > 1e-9 ? 1 : 0))) : [];
      const link = withRef ? h('i', { class: 'pzb-link' }) : null, was = withRef ? h('i', { class: 'pzb-was' }) : null, now = h('i', { class: 'pzb-now' });
      const bar = bars ? h('span', { class: 'pzt-bar' + (S ? '' : ' empty'), 'aria-hidden': 'true' }, h('span', { class: 'pzb-track' }, h('span', { class: 'pzb-zs' }, zs), ts, link, was, S ? now : null), ls) : null;
      const tile = h('div', { class: 'pz-tile' + (S ? ' scaled' : '') }, h('span', { class: 'pzt-k', 'data-s': T.n || null }, T.t), h('span', { class: 'pzt-vu' }, v, u), r, withRef ? d : null, bar);
      return { k, T, tile, v, u, r, d, S, bands, zs, link, was, now, zr: '' };
    });
    el.replaceChildren(...parts.map((p) => p.tile));
    el.dataset.n = String(parts.length);
    draw = tweener((f) => parts.forEach((p) => {
      const [cls, word] = ratedShown(p.k, f), none = cls == null && (p.k === 'saag' || p.k === 'tp');
      p.v.textContent = none ? '—' : tileVal(p.k, f[p.k]);
      p.u.hidden = none || !p.T.u;
      p.r.textContent = word;
      p.tile.dataset.rate = cls || (none ? 'none' : 'plain');
      const r0 = f['ref_' + p.k];
      if (p.S) {
        const on = !none && f[p.k] != null, w = on ? at(p.k, f[p.k]) : 0;
        p.now.hidden = !on;
        // (The marks stay whole inside the track: a value past either end of the scale, as platelets of 380 on a bar
        // that stops at 300, rests against that end instead of running half off it. Sweep, 16 Oct.)
        p.now.style.left = `clamp(6px, ${w}%, calc(100% - 6px))`;
        if (p.was) {
          const ok = on && r0 != null, w0 = ok ? at(p.k, r0) : 0;
          p.was.hidden = p.link.hidden = !ok;
          p.was.style.left = `clamp(4.5px, ${w0}%, calc(100% - 4.5px))`;
          p.link.style.left = Math.min(w, w0) + '%'; p.link.style.width = Math.abs(w - w0) + '%';
        }
      }
      if (r0 == null || f[p.k] == null) return;
      // (The start as shown: the ring on the bar marks it, the words give its number.)
      const x = p.T.x ?? 1, dg = p.T.d ?? 1, rd = (v) => +(v * x).toFixed(dg), same = Math.abs(rd(f[p.k]) - rd(r0)) < 0.5 * 10 ** -dg;
      const t = same ? 'No change' : `from ${fmt(r0 * x, dg)}${p.T.u === '%' ? '%' : ''}`;
      if (p.d.textContent !== t) p.d.textContent = t;
    }));
  }
  // A band's colour is the rating of its middle (after TIPS the PPG's bands follow its target, as its word does).
  function paintBands(f) {
    for (const p of parts) {
      if (!p.S) continue;
      const rs = p.bands.map((z) => rated(p.k, { ...f, asc: Math.max(f.asc ?? 0, NO_ASC), [p.k]: z.m })[0] || 'info'), sig = rs.join();
      if (sig === p.zr) continue;
      p.zr = sig;
      p.zs.forEach((e, i) => { e.dataset.rate = rs[i]; });
    }
  }
  return {
    el,
    set(f, ks, key = [], ref = null, ms, tips = false) {
      goal = !!tips;
      const sg = ks.join() + (ref ? '|ref' : '');
      if (sg !== sig || !draw) { sig = sg; build(ks, !!ref); }   // (no tiles at all is a build too)
      el.dataset.keys = ks.join();
      // (On a phone the strip's brackets carry HVPG and PPG with their ratings, so plain tiles of just those two fold away.)
      el.dataset.compact = ks.join() === 'hvpg,ppg' && !ref && !tips ? '1' : '';
      parts.forEach((p) => p.tile.classList.toggle('key', key.includes(p.k)));
      paintBands(f);
      const to = Object.fromEntries([...ks, 'asc'].map((k) => [k, f[k]]));
      if (ref) for (const k of ks) to['ref_' + k] = ref[k];
      draw(to, ms);
    },
  };
}

// The six levels along the route, portal vein to heart: [id, name]. The three middle levels are inside the liver.
const SITES = [
  ['pre', 'Pre-hepatic'],
  ['presin', 'Presinusoidal'],
  ['sin', 'Sinusoidal'],
  ['postsin', 'Postsinusoidal'],
  ['post', 'Post-hepatic'],
  ['cardiac', 'Cardiac'],
];
/** The six levels, portal vein to heart, the liver's three bracketed; mode: 'all' shows each level named,
 *  a level id marks that one as the block, anything else shows the levels unmarked. Each name stays on one
 *  line under its bar (it shrinks to fit the card, and tilts 45° when the card is too narrow). */
function rail(mode) {
  const at = SITES.findIndex(([id]) => id === mode);
  return h('div', { class: 'pz-rail' + (mode === 'all' ? ' all' : at >= 0 ? ' one' : ''), role: 'img', 'aria-label': at >= 0 ? `Resistance: ${SITES[at][1]}` : 'Six levels: pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic, cardiac' },
    h('div', { class: 'pz-rail-liver' }, h('i'), h('span', {}, 'Liver'), h('i')),
    h('ol', {}, SITES.map(([id, name], i) => h('li', { 'data-site': id, class: i === at ? 'on' : null },
      h('i', {}, i === at ? railBlock() : null), h('span', { class: 'n' }, name)))));
}

// ── Visuals over the dimmed figure ─────────────────
/** One number on a scale with its thresholds: the reflowing key (scaleKey), on every screen.
 *  sc: { key, max, low, marks: [[value, words, short]] }; rows: [{ name, f, site }]. */
// A visual's own patient ({ preset } with its params and days, if any), as one key.
const xKey = (o) => o.preset + (o.params || o.days ? JSON.stringify([o.params, o.days]) : '');
const dig = (k) => TILE[k]?.d ?? 1;
function scaleVisual(sc, rows) {
  return scaleKey(sc, rows);
}

/** The scale as a figure that reflows: short zone names over the band, the cut-offs under it, each patient a
 *  numbered dot gliding to its value, named in a key below (value, name and, with sub, a second reading). */
function scaleKey(sc, rows) {
  const max = sc.max || 20, u = TILE[sc.key]?.u || '', P = (v) => `${(100 * clamp(v, 0, max) / max).toFixed(2)}%`;
  const cuts = [0, ...sc.marks.map(([v]) => v), max];
  const zones = cuts.slice(0, -1).map((a, i) => ({ a, b: cuts[i + 1], c: ['ok', 'mid', 'hi', 'top'][Math.min(i, 3)], t: i ? sc.marks[i - 1][2] || sc.marks[i - 1][1] : sc.low }));   // (a mark's third item: its short name, for the band)
  const span = (z) => `left:${P(z.a)};width:calc(${P(z.b)} - ${P(z.a)})`;
  const cols = `grid-template-columns:${zones.map((z) => `minmax(0, ${z.b - z.a}fr)`).join(' ')}`;
  const pins = rows.filter((r) => r.f).sort((a, b) => a.f[sc.key] - b.f[sc.key]);
  // (each patient takes the colour of the zone it sits in)
  const rate = (r) => (zones.find((z) => r.f[sc.key] < z.b) || zones[zones.length - 1]).c;
  // A second reading or several under each patient (sub: a tile key or a list), pressures in whole mmHg.
  const SUBNAME = { hvpg: 'HVPG', plt: 'Platelets', ppg: 'PPG', pv: 'Portal vein', sin: 'Sinusoids', ra: 'Right atrium', ivc: 'IVC' };
  const sub = (f) => [sc.sub || []].flat().filter((k) => f[k] != null).map((k) => `${SUBNAME[k] || TILE[k]?.t || k} ${fmt(f[k], dig(k))}${TILE[k]?.u ? ` ${TILE[k].u}` : ''}`);
  const box = h('div', { class: 'pz-visual pz-sk', role: 'img', 'aria-label': pins.map((r) => `${r.name} ${fmt(r.f[sc.key], 1)} ${u}`).join(', ') },
    // (the names and the rules sit in columns as wide as their zones, so a long one wraps inside its zone, never into the next)
    h('div', { class: 'pzk-names', 'aria-hidden': 'true', style: cols }, zones.map((z) => h('span', { 'data-rate': z.c }, z.t))),
    h('div', { class: 'pzk-bar', 'aria-hidden': 'true' },
      zones.map((z) => h('i', { 'data-rate': z.c, style: span(z) })),
      sc.marks.map(([v]) => h('b', { style: `left:${P(v)}` })),
      pins.map((r, i) => h('span', { class: 'pzk-dot', 'data-rate': rate(r), style: `--x:${P(r.f[sc.key])};--i:${i}` }, String(i + 1)))),
    h('div', { class: 'pzk-axis', 'aria-hidden': 'true' }, [0, ...sc.marks.map(([v]) => v)].map((v) => h('span', { style: `left:${P(v)}` }, String(v))), h('span', { class: 'end' }, `${max}+ ${u}`)),
    // (rules: each zone's rule in words, under its stretch of the axis)
    sc.rules ? h('div', { class: 'pzk-rules', style: cols }, zones.map((z, i) => h('span', { 'data-rate': z.c }, sc.rules[i] || ''))) : null,
    h('ol', { class: 'pzk-key' }, pins.map((r, i) => h('li', { 'data-rate': rate(r), style: `--i:${i}` },
      h('span', { class: 'pzk-n' }, String(i + 1)),
      h('span', { class: 'pzk-v' }, fmt(r.f[sc.key], dig(sc.key)), h('small', {}, ` ${u}`)),
      h('span', { class: 'pzk-name' }, r.name),
      sub(r.f).map((t) => h('span', { class: 'pzk-sub' }, t))))));
  const go = () => box.classList.add('in');
  nextFrame(() => nextFrame(go)); setTimeout(go, 120);
  return box;
}

/** SAAG against ascites protein: the four quadrants numbered on the plot in reading order (1 top left to 4 bottom
 *  right) and named beside it, the model's patients as points (two close together share a point, names stacked). */
const QUADS = [
  { n: 1, x: 0, y: 1, t: 'Not portal: the peritoneum leaks', c: 'Peritoneal cancer · tuberculosis · pancreatic ascites' },
  { n: 2, x: 1, y: 1, t: 'Portal hypertension, open sinusoids', c: 'Heart failure · constrictive pericarditis · early Budd–Chiari' },
  { n: 3, x: 0, y: 0, t: 'Not portal, protein-poor', c: 'Nephrotic syndrome · protein-losing enteropathy' },
  { n: 4, x: 1, y: 0, t: 'Portal hypertension, sealed sinusoids', c: 'Cirrhosis · late Budd–Chiari · massive liver metastases' },
];
function quadrantVisual(rows) {
  // The plot's margins and height follow its lettering (lay): the axis names and ticks take the room they need, and a
  // point's names go to whichever side has room for them.
  const W = 760, R = W - 24;
  let L = 96, B = 548, T = 24;
  const X = (v) => L + (R - L) * clamp(v, 0, 3) / 3, Y = (v) => B - (B - T) * clamp(v, 0, 5) / 5;
  const pts = [];
  for (const r of rows) {
    if (!r.f || r.f.asc < NO_ASC) continue;
    const near = pts.find((p) => Math.abs(p.saag - r.f.saag) < 0.3 && Math.abs(p.tp - r.f.tp) < 0.5);   // (labels that would overlap)
    if (near) near.names.push(r.name); else pts.push({ saag: r.f.saag, tp: r.f.tp, names: [r.name], site: r.site });
  }
  const quads = QUADS.map((q) => { const rect = sv('rect'), n = sv('text', { class: 'pzq-n', 'text-anchor': 'start' }, String(q.n)); return { q, rect, n, g: sv('g', { class: 'pzq-q', 'data-portal': q.x ? 'y' : 'n' }, rect, n) }; });
  const cuts = [sv('line', { class: 'pzq-cut' }), sv('line', { class: 'pzq-cut' })], axes = [sv('line', { class: 'pzq-axis' }), sv('line', { class: 'pzq-axis' })];
  const xt = [[0, '0'], [1.1, '1.1'], [2, '2'], [3, '3']].map(([v, t]) => ({ v, el: sv('text', { class: 'pzq-t' + (v === 1.1 ? ' on' : ''), 'text-anchor': 'middle' }, t) }));
  const yt = [[0, '0'], [2.5, '2.5'], [5, '5']].map(([v, t]) => ({ v, el: sv('text', { class: 'pzq-t' + (v === 2.5 ? ' on' : ''), 'text-anchor': 'end' }, t) }));
  const axX = sv('text', { class: 'pzq-ax', 'text-anchor': 'middle' }, 'SAAG, g/dL'), axY = sv('text', { class: 'pzq-ax', x: 0, y: 0, 'text-anchor': 'middle' }, 'Ascites protein, g/dL');
  const dots = pts.map((p, i) => {
    const circle = sv('circle', { r: 15 }), names = p.names.map((nm) => sv('text', {}, nm));
    return { p, circle, names, g: sv('g', { class: 'pzq-pt', 'data-site': p.site || 'none', style: `--i:${i}` }, circle, names) };
  });
  const svg = sv('svg', { class: 'pz-quad', viewBox: `0 0 ${W} 640`, role: 'img', 'aria-label': 'SAAG against ascites protein: ' + pts.map((p) => `${p.names.join(' and ')}, SAAG ${fmt(p.saag, 1)}, protein ${fmt(p.tp, 1)}`).join('; ') },
    quads.map((q) => q.g), cuts, axes, xt.map((t) => t.el), yt.map((t) => t.el), axX, axY, dots.map((d) => d.g));
  const at = (e, o) => { for (const [k, v] of Object.entries(o)) e.setAttribute(k, typeof v === 'number' ? v.toFixed(1) : v); };
  const lay = (fs) => {
    const t = fs.cap, a = fs.cap, nm = fs.lab, n = fs.val;
    T = Math.max(24, 0.75 * t + 6);   // (room above for the top tick)
    const ax = 2 + a;   // (the rotated name's baseline: its letters rise to the left of it)
    L = ax + 0.3 * a + 8 + est('2.5', t) + 14;
    // (The rotated axis name never stretches the plot to fit long words: in a height-capped box that shrinks the whole chart,
    // which grows the lettering again and never settles. A name too long for the plot drops to its short form.)
    const yName = est('Ascites protein, g/dL', a) + 24 <= 524 ? 'Ascites protein, g/dL' : 'Protein, g/dL';
    if (axY.textContent !== yName) axY.textContent = yName;
    B = T + Math.max(524, est(yName, a) + 24);
    const H = B + 20 + t + 12 + 0.75 * a + 0.3 * a + 6;
    svg.setAttribute('viewBox', `0 0 ${W} ${H.toFixed(1)}`);
    const xs = X(1.1), ys = Y(2.5), box = [[L, T, xs, ys], [xs, T, R, ys], [L, ys, xs, B], [xs, ys, R, B]];
    for (const { q, rect, n: el } of quads) {
      const [x0, y0, x1, y1] = box[(q.y ? 0 : 2) + q.x];
      at(rect, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      at(el, { x: x0 + 16, y: q.y ? y0 + 0.8 * n + 12 : y1 - 18 }); fsOf(el, n);
    }
    at(cuts[0], { x1: xs, x2: xs, y1: T, y2: B }); at(cuts[1], { x1: L, x2: R, y1: ys, y2: ys });
    at(axes[0], { x1: L, x2: R, y1: B, y2: B }); at(axes[1], { x1: L, x2: L, y1: T, y2: B });
    for (const { v, el } of xt) { at(el, { x: X(v), y: B + 10 + 0.8 * t }); fsOf(el, t); }
    for (const { v, el } of yt) { at(el, { x: L - 14, y: Y(v) + 0.36 * t }); fsOf(el, t); }
    at(axX, { x: (L + R) / 2, y: B + 20 + t + 12 + 0.75 * a }); fsOf(axX, a);
    axY.setAttribute('transform', `translate(${ax.toFixed(1)} ${((T + B) / 2).toFixed(1)}) rotate(-90)`); fsOf(axY, a);
    for (const { p, circle, names } of dots) {
      const x = X(p.saag), y = Y(p.tp), w = Math.max(...p.names.map((s) => est(s, nm, 0.62)));
      // (Right of the point, else left of it, else centred above it when neither side has the room.)
      const side = x + 26 + w <= R - 4 ? 'start' : x - 26 - w >= L + 4 ? 'end' : 'middle';
      const nx = side === 'start' ? x + 26 : side === 'end' ? x - 26 : clamp(x, L + w / 2 + 4, R - w / 2 - 4);
      const up = y - 22 - (names.length - 1) * 1.2 * nm, ny = side !== 'middle' ? y + 0.35 * nm - (names.length - 1) / 2 * 1.2 * nm : up - nm > T ? up : y + 22 + 0.8 * nm;
      at(circle, { cx: x, cy: y });
      names.forEach((el, j) => { at(el, { x: nx, y: ny + j * 1.2 * nm, 'text-anchor': side }); fsOf(el, nm); });
      const x0 = side === 'start' ? nx : side === 'end' ? nx - w : nx - w / 2;
      p.box = [x0, ny - 0.8 * nm, x0 + w, ny + (names.length - 1) * 1.2 * nm + 0.3 * nm];
    }
    // (A quadrant's number gives way to a patient's name that reaches its corner; the list beside the plot still numbers them.)
    for (const { n: el } of quads) {
      const x0 = +el.getAttribute('x'), y1 = +el.getAttribute('y'), b = [x0, y1 - 0.8 * n, x0 + 0.7 * n, y1 + 0.2 * n];
      el.style.opacity = dots.some(({ p }) => p.box[0] < b[2] && p.box[2] > b[0] && p.box[1] < b[3] && p.box[3] > b[1]) ? '0' : '';
    }
  };
  lay({ cap: 25, lab: 29, val: 42 });
  fitChart(svg, lay);
  return h('div', { class: 'pz-visual pz-quadwrap' }, svg,
    h('ol', { class: 'pz-quads' }, QUADS.map((q) => h('li', { 'data-portal': q.x ? 'y' : 'n' },
      h('span', { class: 'qn' }, String(q.n)), h('span', { class: 'qt' }, q.t), h('span', { class: 'qc' }, q.c)))));
}

/** Why a clot before the liver leaves the abdomen dry: the gut's capillary wall holds protein back, so its
 *  oncotic pull holds the fluid in; the sinusoid's wall lets protein through, so pressure becomes lymph. */
function wallsVisual() {
  // Each wall is a panel: its name, a line under it and two lines of what follows are slide text (they wrap and follow
  // the type scale); the drawing between them keeps only the names of its bands, sized from the scale as drawn (lay).
  // Side by side on a wide screen, one above the other on a phone.
  const panel = (sin) => {
    const yW = 236, lumen = [yW + 16, yW + 132], dots = [], mk = 'pzwArrow' + ++uid;
    for (let i = 0; i < 8; i++) dots.push(sv('circle', { class: 'pzw-alb', cx: 70 + i * 66, cy: lumen[0] + 30 + (i % 3) * 30, r: 8 }));   // (their drift stays in the lumen)
    const cross = [];
    // The sinusoid's wall: six plates with a pore between each; albumin rises through three of them.
    const pores = [104, 202, 300, 398, 496];
    if (sin) for (const x of [pores[0], pores[2], pores[4]]) cross.push(sv('circle', { class: 'pzw-alb pzw-cross', cx: x, cy: yW + 6, r: 8, style: `--d:${(x / 400).toFixed(2)}s` }));
    const arrows = (sin ? pores : [170, 430]).map((x) => sv('path', { class: 'pzw-flow' + (sin ? ' big' : ''), d: `M${x} ${yW + 40} V${yW - (sin ? 22 : 26)}`, 'marker-end': `url(#${mk})` }));
    const wall = sin
      ? [0, 1, 2, 3, 4, 5].map((k) => sv('rect', { class: 'pzw-wall', x: 20 + k * 98, y: yW, width: 70, height: 14, rx: 7 }))
      : [sv('rect', { class: 'pzw-wall', x: 20, y: yW, width: 560, height: 14, rx: 7 }), sv('rect', { class: 'pzw-bm', x: 20, y: yW - 9, width: 560, height: 6, rx: 3 })];
    // A band's name, placed in lay: [text, band top, band height, centred in the band].
    const names = sin ? [[sv('text', { class: 'pzw-l', x: 34 }, 'Liver cells'), 108, 42, true], [sv('text', { class: 'pzw-l', x: 34 }, 'Space of Disse: lymph'), 154, 74, false]]
      : [[sv('text', { class: 'pzw-l', x: 34 }, 'Tissue fluid: little'), 108, 120, false]];
    const draw = sv('svg', { class: 'pzw-art', viewBox: '0 100 600 276', 'aria-hidden': 'true' },
      sv('defs', {}, sv('marker', { id: mk, viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, sv('path', { d: 'M0 0 L10 5 L0 10 z', class: 'pzw-head' }))),
      sin ? [sv('rect', { class: 'pzw-hep', x: 20, y: 108, width: 560, height: 42, rx: 12 }), sv('rect', { class: 'pzw-disse', x: 20, y: 154, width: 560, height: 74, rx: 8 })]
        : sv('rect', { class: 'pzw-tissue', x: 20, y: 108, width: 560, height: 120, rx: 12 }),
      names.map(([t]) => t),
      sv('rect', { class: 'pzw-lumen', x: 20, y: lumen[0], width: 560, height: lumen[1] - lumen[0], rx: 10 }),
      sv('g', { class: 'pzw-dots' }, dots), cross, wall, arrows);
    fitChart(draw, (fs) => { for (const [t, y, hgt, mid] of names) { t.setAttribute('y', (mid ? y + hgt / 2 + 0.36 * fs.cap : y + 8 + 0.75 * fs.cap).toFixed(1)); fsOf(t, fs.cap); } });
    return h('div', { class: 'pzw-panel' + (sin ? ' sin' : '') },
      h('div', { class: 'pzw-t' }, sin ? 'Liver sinusoid' : 'Gut capillary'),
      h('div', { class: 'pzw-s' }, sin ? 'Open pores, no basement membrane' : 'Continuous wall, basement membrane'),
      draw,
      h('p', { class: 'pzw-c' }, sin ? 'Protein crosses: nothing holds the fluid back' : 'Protein stays in: its pull holds the fluid back'),
      h('p', { class: 'pzw-c2' }, sin ? 'A rise in pressure becomes lymph at once' : 'A rise in pressure makes little fluid'));
  };
  return h('div', { class: 'pz-visual pz-walls', role: 'img', 'aria-label': 'The gut capillary wall holds protein back; the liver sinusoid lets it through' }, panel(false), panel(true));
}

// ── The off-screen engine ──────────────────────────
// A second engine in its own worker (the main thread when workers are unavailable) computes the slides'
// states, so the live figure keeps running while a presentation is prepared.
function makeCalc() {
  const pending = new Map();
  let seq = 1, post = null, kill = () => {}, broken = false;
  // Every waiting request settles with an error: a page left open across an update can no longer load the engine (its
  // stamped files are gone from the cache and the server), and the presenter says so instead of waiting for ever.
  const fail = (message) => { broken = true; for (const [reqId, p] of pending) p.done({ type: 'error', reqId, message }); pending.clear(); };
  const onMsg = (m) => {
    const p = pending.get(m.reqId);
    if (!p) return;
    if (m.type === 'seqStep') { p.step?.(m); return; }
    pending.delete(m.reqId); p.done(m);
  };
  const ready = (async () => {
    try {
      const w = new Worker(new URL('../worker.js?v=80c60be020', import.meta.url), { type: 'module' });
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('worker timeout')), 15000);   // (long: a slow load still gets the worker; host.js)
        w.onmessage = (e) => { if (e.data?.type === 'presets') { clearTimeout(t); res(); } };
        w.onerror = (e) => { clearTimeout(t); rej(e); };
        w.postMessage({ type: 'visibility', visible: false });
        w.postMessage({ type: 'run', running: false });
        w.postMessage({ type: 'presets', reqId: 0 });
      });
      w.onmessage = (e) => onMsg(e.data); w.onerror = (e) => { e.preventDefault?.(); fail('the engine stopped'); };
      post = (m) => w.postMessage(m); kill = () => w.terminate();
    } catch {
      try {
        const { createCore } = await import('../worker-core.js?v=2945437dac');
        const core = createCore((m) => setTimeout(() => onMsg(m), 0));
        core.handle({ type: 'visibility', visible: false }); core.handle({ type: 'run', running: false });
        post = (m) => core.handle(structuredClone(m)); kill = () => core.dispose();
      } catch { fail('the engine could not load'); }
    }
  })();
  const send = async (msg, entry) => {
    await ready;
    if (broken) { entry.done({ type: 'error', reqId: msg.reqId, message: 'the engine is unavailable' }); return; }
    pending.set(msg.reqId, entry); post(msg);
  };
  return {
    request: (type, payload = {}) => new Promise((done) => send({ type, reqId: seq++, ...payload }, { done })),
    sequence: (steps, base, step) => new Promise((done) => send({ type: 'sequence', reqId: seq++, steps, base }, { done, step })),
    kill: () => kill(),
    get broken() { return broken; },
  };
}

export function createPresenter({ openSettings, loadPreset, host, stage, projectorOn, projectorOff, closeHome, stashCards, rerenderHome }) {
  const app = document.getElementById('app'), view = document.getElementById('stageView'), wrap = document.getElementById('stageWrap');
  let calc = null;
  const getCalc = () => (calc ||= makeCalc());
  const cache = new Map();   // deck id → computed states, reused the next time it is presented
  let deck = null, slides = [], states = [], waiters = [], stateOf = [], base = null, extraOf = new Map();
  // `gen` counts redraws asked of the slide in place: a transition under way for an older one starts over.
  let want = 0, shown = null, shownState = -1, busy = false, gen = 0, redrawn = -1;   // (redrawn: the cards drawn again for a new text size, see pps:labelscale)
  let ui = null, black = false, digits = '', digitT = 0;
  let saved = null, layersBefore = null;   // (the viewer's own lobule layers, put back when the show ends)
  // High contrast: a deeper shade, stronger text, ratings as filled chips (pz-hi). Off for now; no control offers it.
  const PROJ = 'pps.projector';
  let hiCon = false;   // (off for now: no control offers it; a saved choice is ignored)
  // Panel width: fixed at medium for now. A phone's panel spans the screen.
  const PW = 'pps.pzWidth', PW_K = { narrow: 0.8, medium: 1, wide: 1.3 };
  let pzWidth = 'medium';   // (fixed for now: no control offers it; a saved choice is ignored)

  const all = () => [...DECKS, ...readMine().map(fromScript)];
  // An instructor's script (captured model states) as slides: its own titles and notes, the ladder beside.
  // An imported deck file (s.deck: the full deck format, read without running it by deck-source.js) keeps every feature.
  function fromScript(s) {
    if (s.deck) return { ...s.deck, id: s.id, title: s.title, level: 'yours', mine: true, full: true, slides: withOverview(s.deck).slides };
    return { ...s, level: 'yours', mine: true, slides: (s.steps || []).map((st) => ({
      preset: st.preset, presetDays: st.presetDays, params: st.params, action: st.action, days: st.days, view: st.view, cam: st.view === 'circuit' ? 'fit' : st.cam || 'fit',
      kicker: st.kicker || s.title, title: st.title || 'Step', line: st.line || '', causes: st.causes, site: st.site, notes: st.notes || st.tell || '', ask: st.ask, data: 'ladder', key: st.key || [],
    })) };
  }

  // ── Slide states ──
  // stateOf[i]: the slide whose model state slide i shows (itself, or the last one before it that changed the model).
  const changes = (s) => !!(s.preset || s.params || s.action || s.days);
  const stepOf = (s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse, trail: s.tool?.kind === 'flowtime' && (s.tool.lines || true) } : {});
  function prepare() {
    const key = deck.mine ? null : deck.id;
    stateOf = []; let last = 0;
    slides.forEach((s, i) => { if (changes(s) || i === 0) last = i; stateOf[i] = last; });
    // Patients a visual compares that no slide shows ({ preset, params?, days? } rows): computed after the slides, each fresh.
    const extraRows = slides.flatMap((s) => (s.of || []).filter((o) => typeof o === 'object' && o.preset && !o.id));
    const extra = [...new Map(extraRows.map((o) => [xKey(o), o])).values()];
    extraOf = new Map(extra.map((o, k) => [xKey(o), slides.length + k]));
    const hit = key && cache.get(key);
    if (hit) { states = hit.states; waiters = []; return; }
    const mine = []; states = mine; waiters = [];
    const c = getCalc(), steps = [...slides.map(stepOf), ...extra.map((o) => ({ preset: o.preset, params: o.params, days: o.days }))];
    const presetAt = []; let pid = store.get().presetId;
    slides.forEach((s, i) => { if (s.preset) pid = s.preset; presetAt[i] = pid; });
    extra.forEach((o, k) => { presetAt[slides.length + k] = o.preset; });
    const deckNow = deck;
    (async () => {
      const first = slides[0]?.preset ? null : (await host.request('snapshot')).snap;
      if (!base) c.request('presetMetrics', { ids: ['healthy'] }).then((m) => { base = m.result?.healthy || null; if (deck === deckNow) ui?.ladder.setBase(base); });
      const end = await c.sequence(steps, first, (m) => {
        const st = { snap: m.snap, params: m.params, fp: m.fp, trail: m.trail, presetId: presetAt[m.i] };
        if (m.start) st.start = { ...m.start, presetId: presetAt[m.i] };
        mine[m.i] = st;
        if (states !== mine) return;   // a newer presentation has started
        for (const w of waiters.filter((x) => x.i === m.i)) w.res(st);
        waiters = waiters.filter((x) => x.i !== m.i);
      });
      if (end?.type !== 'error') { if (key) cache.set(key, { states: mine }); return; }
      // The slides could not be computed (most often a page left open across an update): the next try starts a fresh
      // engine, and the show ends with a word rather than holding its cover up for ever.
      if (c.broken) { c.kill(); if (calc === c) calc = null; }
      if (states !== mine || deck !== deckNow) return;
      stop();
      toast('This presentation could not be prepared. Reload the page to present it.', 'bad');
    })();
  }
  // Each slide's numbers for the printed notes (handout.js): the deck computed as presenting it computes it, or the states
  // it was last presented with, so the values in the handout's words are the ones its slides show.
  async function deckNumbers(d) {
    const sl = d.mine ? d.slides : withOverview(d).slides, own = []; let last = 0;
    sl.forEach((s, i) => { if (changes(s) || i === 0) last = i; own[i] = last; });
    let st = !d.mine && cache.get(d.id)?.states;
    if (!st) {
      st = [];
      const first = sl[0]?.preset ? null : (await host.request('snapshot')).snap;
      await getCalc().sequence(sl.map(stepOf), first, (m) => { st[m.i] = { fp: m.fp }; });
    }
    return sl.map((_, i) => st[own[i]]?.fp ?? null);
  }
  const stateReady = (i) => (states[i] ? Promise.resolve(states[i]) : new Promise((res) => waiters.push({ i, res })));

  function applyState(st) {
    host.send({ type: 'restore', snap: st.snap });
    replaceParams(structuredClone(st.params));
    store.set({ presetId: st.presetId, presetLoading: false, historyTick: (store.get().historyTick || 0) + 1 });
    host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
  }
  // A change of patient on screen eases (the model blends from where it is to the slide's state: lesions grow, sliders,
  // pressures and flows travel, the days run on); a newer slide mid-way eases on from wherever the model has got to.
  // Resolves once the slide's exact state is in, or early (the model left part way) when cut() says a newer slide was asked for.
  const MORPH_MS = 2000;
  const CATH_SETTLE_MS = 4000;   // (at most: a model still drifting never holds the catheter longer)
  // (.app.pz-morph while a change of patient eases: the checks hold the data card to it.)
  async function morphTo(st, cut, ms = MORPH_MS, mark = true) {
    host.send({ type: 'morph', snap: st.snap, ms });
    store.set({ presetId: st.presetId, presetLoading: false });
    if (mark) app.classList.add('pz-morph');
    try {
      await until(cut, ms + 80);
      if (cut()) return false;
      applyState(st);
      await drawn(st);
      return !cut();
    } finally { if (mark) app.classList.remove('pz-morph'); }
  }
  // The live engine has sent a frame of the new state (its portal pressure is the slide's), and two more frames have painted it.
  let frames = 0;
  store.on('frame', () => { frames++; });
  async function drawn(st) {
    const n0 = frames;
    await until(() => frames > n0 && Math.abs((store.get().frame?.metrics?.pv ?? -99) - st.fp.pv) < 0.6, 900);
    await new Promise((r) => nextFrame(() => nextFrame(r)));
  }

  // ── The figure's moves ──
  const fadeMs = () => (reduce.matches ? 0 : 420);
  // A quiet arc over the figure's free space while a new patient settles (it fades in and out with the dim, never pops).
  const loading = (on) => ui?.load.classList.toggle('on', on);
  async function figureOut() { loading(true); view.classList.add('pz-out'); await wait(fadeMs()); }
  function figureIn() { view.classList.remove('pz-out'); loading(false); }
  // (next: the slide being moved to, if it frames the plate, so the way out of the lobule lands on that framing
  // in one zoom rather than stopping at the fit first.)
  async function toAnatomy(next) {
    const st = store.get();
    if (!st.lobule && !st.sinusoid) return;
    // Out of the sinusoid, then back to the lobule's normal framing, and only then out of the lobule: three steps, never one zoom through them.
    if (st.sinusoid) { store.set({ sinusoid: false }); await wait(60); await until(() => !stage.sinBusy() && !stage.sinusoidOpen(), 4000); }
    if (stage.lobuleOpen()) { const ms = reduce.matches || booting ? 0 : 900; if (stage.lobuleFocus('fit', { ms })) await wait(ms); }
    if (next && !reduce.matches && !booting) stage.riseTo(next.box, next.kMax, next.clear);   // (box: a function, asked for when the rise begins)
    store.set({ lobule: false });
    await until(() => stage.lobuleSettled(), 6000); await wait(80);
  }
  // Glide the camera to a slide's framing; resolves when it has landed (cut(): a newer slide was asked for).
  async function camera(cam, s, cut) {
    const ms = reduce.matches || booting ? 0 : 1500;
    if (LOBULE_CAM.test(cam)) {
      // (A slide's layers: ['zones'] shows the lobule's zone bands; any other lobule slide has them off.)
      const zonesWant = !!s.layers?.includes('zones');
      if (!!store.get().lobuleLayers?.zones !== zonesWant) store.set({ lobuleLayers: { ...store.get().lobuleLayers, zones: zonesWant } });
      if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); await wait(700); }
      // The station this slide frames: the dive lands on it in one move, and (mid-dive) no other station's labels show.
      const part = cam === 'sinusoid' ? 'sinusoid' : cam.split(':')[1] || 'fit', zoom = s.zoom ?? 2.3;
      if (!store.get().lobule) {
        // Anatomy into the lobule's normal framing first (the same dive every time); the station, or the sinusoid, is gone to from there.
        store.set({ lobule: true });
        // (A first dive also loads the lobule, which a slow tablet can take several seconds over.)
        await until(() => cut() || (stage.lobuleSettled() && stage.lobuleOpen()), 12000);
        if (cut()) return;
        await wait(120);
      } else {
        await until(() => cut() || stage.lobuleOpen(), 9000);
      }
      if (cut()) return;
      const sin = cam === 'sinusoid' && sinusoidSupported() && stage.lobuleOpen();
      if (sin) { if (!store.get().sinusoid) { store.set({ sinusoid: true }); await wait(ms ? 1250 : 0); } return; }
      if (store.get().sinusoid) { store.set({ sinusoid: false }); await wait(ms ? 1000 : 0); }
      if (stage.lobuleFocus(part, { zoom, ms })) await wait(ms);
      return;
    }
    const v = s.view || 'anatomic';
    // (The rise lands where the box fits the space the cards leave, measured as it begins: the new slide's cards are let come in
    // first, or they would settle a little larger after it and the camera would glide again to the fit they leave.)
    if ((store.get().lobule || store.get().sinusoid) && ms > 0) {
      const t0 = performance.now();
      await until(() => cut() || !cardsEntering(), 1200);
      // (And their size has stopped moving: a chart or a wrapped line that lands during the rise would change the fit it was aimed at.
      // The two waits together stay under 1.8 s, so the rise still begins promptly.)
      let sig = cardSig(), since = performance.now();
      await until(() => { const n = cardSig(); if (n !== sig) { sig = n; since = performance.now(); } return cut() || performance.now() - since > 250; }, Math.max(0, 1800 - (performance.now() - t0)));
    }
    if (cut()) return;
    await toAnatomy(v === 'anatomic' ? riseFor(cam, s) : null);
    if (cut()) return;
    if (store.get().view !== v) { store.set({ view: v }); await wait(700); }
    // (Reduced motion keeps the glide, short: a jump of the whole figure is harder to follow than a quick move.)
    const gl = ms || 300;
    if (cam === 'fit' || v === 'circuit') stage.fitSlow(gl);
    else stage.frameBox(camBox(cam, s), gl, s.kMax || 3.2, !!s.clear);
    await wait(gl);
  }
  const cardsEntering = () => [ui?.text, ui?.panel, ui?.data].some((el) => el && !el.hidden && el.getAnimations({ subtree: true }).some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)));
  // Where the way out of the lobule should land for a slide: its framing, asked for when the rise begins (null: the fit).
  const riseFor = (cam, s) => (cam === 'fit' ? null : { box: () => camBox(cam, s), kMax: s.kMax || 3.2, clear: !!s.clear });
  // A slide's framing: its region of the plate, grown to take in all of what the slide points at (its outlined
  // organs as drawn now, an enlarged spleen whole), with a little room for the outline's glow.
  function camBox(cam, s) {
    const r = Array.isArray(cam) ? cam : REGIONS[cam] || REGIONS.route;
    // (A slide with softly lit supporting veins frames every vessel it lights, so none runs off the edge.)
    const tg = slideTargets(s), f = stage.focusBox({ organs: tg.organs.map((o) => o.id), edges: tg.glow.some((g) => g.soft) ? tg.glow.map((g) => g.id) : [] });
    if (!f) return r;
    const m = 0.08 * Math.max(f[2] - f[0], f[3] - f[1]);
    return [Math.min(r[0], f[0] - m), Math.min(r[1], f[1] - m), Math.max(r[2], f[2] + m), Math.max(r[3], f[3] + m)];
  }

  // ── The HVPG catheter (stage.setCatheter, as Measure › HVPG draws it), choreographed slide by slide: in along
  // the jugular route with the camera following, the tip close up, the balloon up and the still column, the
  // readings; each step eases on from wherever the last one left it, and it slides out with its slides.
  const CC = { free: 'var(--mon-free)', wedge: 'var(--mon-wedge)', bad: 'var(--mon-alarm)' };   // the procedure's own colours
  const cath = { on: false, raf: 0, t0: 0, v: { u: 0, balloon: 0, column: 0, opacity: 1 }, tr: {}, show: [], ring: null, ostium: false, probeT0: 0, follow: false, cam: null, fp: null };
  // The still column is shaded in the catheter's wedge colour (the WHVP callout's), so it reads as the catheter's
  // column of still blood, not as one more pressure on the map.
  const wedgeInk = () => getComputedStyle(document.documentElement).getPropertyValue('--tr-wedge').trim();
  function cathTrack(k, to, ms, delay = 0) { cath.tr[k] = { from: cath.v[k], to, t0: performance.now() + delay, ms: reduce.matches ? 0 : ms }; }
  function cathLabels() {
    const f = cath.fp, v = cath.v;
    if (!f) return [];
    const sev = f.hvpg >= 10 ? 'danger' : f.hvpg >= 5 ? 'caution' : 'ok';
    const free = { key: 'f', at: 'tip', kicker: 'FHVP', text: fmt(f.fhvp, 1), unit: 'mmHg', cls: 'free' };
    const wedge = { key: 'w', at: 'ahead', kicker: 'WHVP', text: fmt(f.fhvp + (f.whvp - f.fhvp) * v.column, 1), unit: 'mmHg', cls: 'wedge' };
    const L = { f: free, w: wedge,
      sum: { key: 's', at: 'sum', rows: [{ ...wedge, text: fmt(f.whvp, 1) }, free], calc: { kicker: 'HVPG', text: fmt(f.hvpg, 1), unit: 'mmHg', cls: 'result ' + sev } },
      occ: { key: 'p', at: 'tip', kicker: 'Hepatic vein', text: 'Occluded', unit: '', cls: 'wedge' },
      abort: { key: 'a', at: 'tip', kicker: 'Unable to cannulate', text: 'No reading', unit: '', cls: 'result danger' } };
    return cath.show.map((k) => L[k]);
  }
  function cathFrame() {
    const now = performance.now(), v = cath.v;
    for (const [k, t] of Object.entries(cath.tr)) {
      const u = t.ms ? clamp((now - t.t0) / t.ms, 0, 1) : now >= t.t0 ? 1 : 0;
      v[k] = t.from + (t.to - t.from) * ease(u);
      if (u >= 1) delete cath.tr[k];
    }
    // Three short pushes against the clot (Budd–Chiari), each easing in and back out.
    const pk = cath.probeT0 ? clamp((now - cath.probeT0) / 3600, 0, 1) : 1, probe = pk < 1 ? Math.sin(pk * 3 * Math.PI) ** 2 * 0.9 : 0;
    stage.setCatheter({ u: v.u, balloon: v.balloon, column: v.column, columnColor: wedgeInk(), ring: cath.ring,
      pulse: 0.5 + 0.5 * Math.sin((now - cath.t0) / 170), clock: now - cath.t0, opacity: v.opacity, labels: cathLabels(), ostium: cath.ostium, probe });
    mon?.balloon(v.balloon);   // the monitor's trace rides the same balloon value
    if (cath.follow) stage.cathFollow();
    cath.raf = nextFrame(cathFrame);
  }
  function cathStop() {
    cancelFrame(cath.raf);
    if (cath.on) { stage.setCatheter(null); stage.cathForget(); }
    Object.assign(cath, { on: false, v: { u: 0, balloon: 0, column: 0, opacity: 1 }, tr: {}, show: [], ring: null, ostium: false, probeT0: 0, follow: false, cam: null, fp: null });
  }
  // Out: the readings go, the balloon goes down and the catheter fades (at once when the figure is fading anyway).
  async function cathOut(fading) {
    if (!cath.on) return;
    if (!fading) {
      cath.show = []; cath.ring = null; cath.follow = false; cath.probeT0 = 0;
      cathTrack('balloon', 0, 400); cathTrack('column', 0, 400); cathTrack('opacity', 0, 650);
      await wait(reduce.matches ? 0 : 700);
    } else await figureOut();
    cathStop();
  }
  async function cathTo(mode, fp, cut) {
    await toAnatomy();
    if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); await wait(700); }
    if (cut()) return;
    if (!cath.on) { cath.on = true; cath.t0 = performance.now(); cath.ostium = mode === 'blocked'; cathFrame(); }
    cath.fp = fp;
    const v = cath.v, ms = (m) => (reduce.matches ? 0 : m);
    // In along the route from wherever the tip is, the view following it down.
    if (v.u < 0.999) {
      cath.show = []; cath.ring = null;
      if (!stage.cathFocus('route', ms(1200))) return;
      cath.cam = 'route';
      await wait(ms(1000)); if (cut()) return;
      const t = 3800 * (1 - v.u);
      cath.follow = true; cathTrack('u', 1, t);
      await wait(ms(t + 100)); cath.follow = false; if (cut()) return;
    }
    if (mode === 'route') {
      cath.show = []; cath.ring = null; cathTrack('balloon', 0, 500); cathTrack('column', 0, 500);
      if (cath.cam !== 'route') { stage.cathFocus('route', ms(1300)); cath.cam = 'route'; await wait(ms(1300)); }
      return;
    }
    // The tip close up (again each slide: the data card may have come or gone).
    stage.cathFocus('tip', ms(cath.cam === 'tip' ? 700 : 1500), { both: true }); 
    await wait(ms(cath.cam === 'tip' ? 700 : 1500)); cath.cam = 'tip';
    if (cut()) return;
    if (mode === 'blocked') {
      cath.show = ['occ']; cath.ring = null; cath.probeT0 = performance.now();
      await wait(ms(3800)); if (cut()) return;
      cath.show = ['abort']; cath.ring = CC.bad;
      return;
    }
    if (mode === 'free') { cath.show = ['f']; cath.ring = CC.free; cathTrack('balloon', 0, 500); cathTrack('column', 0, 500); return; }
    // Wedge: the balloon goes up just behind the tip, flow stops, the still column fills toward the sinusoids.
    if (v.balloon < 0.999) { cath.show = ['f']; cath.ring = CC.free; cathTrack('balloon', 1, 1800); await wait(ms(1900)); if (cut()) return; }
    cath.ring = CC.wedge;
    // The still column fills first and the pressure holds on its plateau; only then does the WHVP callout ease in,
    // and for the result slide the HVPG bracket follows it.
    if (v.column < 0.999) { cath.show = ['f']; cathTrack('column', 1, 1800); await wait(ms(1900)); if (cut()) return; await wait(ms(600)); if (cut()) return; }
    if (!cath.show.includes('w')) { cath.show = ['f', 'w']; if (mode === 'result') { await wait(ms(1500)); if (cut()) return; } }
    if (mode === 'result') { cath.show = ['sum']; cath.ring = null; }
  }

  // ── A time-lapse on the live model: its days run on the disease clock (ramped as the off-screen chain ran them),
  // the counter and the numbers follow, then the slide's computed state takes over (the same, to the decimal).
  let lapseOn = false, lapseLeft = 0, lastAt = -1;   // (lapseLeft: days still to run; 0 once Next has sped it up; lastAt: the slide last shown)
  // A compare slide's buttons switch the live model's params (liveOff: it no longer shows the slide's computed state).
  let liveOff = false, abGen = 0;
  const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge({ ...(a[k] || {}) }, v) : v; return a; };
  function abSlow() { abGen++; }
  // The new treatment takes effect on the live figure at real time (a faster clock would make the Doppler and tracings
  // sweep faster while it settles); the ladder and tiles follow it.
  function abPick(s, i, k) {
    if (!deck || shown?.i !== i || slides[i] !== s) return;
    ui?.text.querySelectorAll('.pz-abb').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
    if (s.compare[k].lens) { lensPick(s.compare[k].lens); return; }
    // A gate button ({ label, gate }): the Doppler samples that third of the stent; the model is untouched.
    if (s.compare[k].gate) { store.set({ dopGate: s.compare[k].gate }); return; }
    liveSet(s, i, s.compare[k].params);
  }
  // The slide's colour key on the figure (null: none); another lens fades the old key out, the new one in.
  function paintKey(k) {
    if (!ui) return;
    ui.text.classList.toggle('pz-keyed', !!k);
    ui.figKey.set(!!k, () => {
      ui.fk.replaceChildren(...(k ? keyNodes(k) : []));
      ui.fk.classList.toggle('grad', !!k && typeof (LENS_KEY[k] || PRESSURE_KEY)[1] === 'function');
      { const [nm, bar, lo, hi] = LENS_KEY[k] || PRESSURE_KEY; ui.fk.setAttribute('aria-label', `Vessels colored by ${nm}${typeof bar === 'function' ? `, ${lo} to ${hi}` : ''}`); }
    });
    clearPill();   // (the words make room for the docked key's row, or give it back)
  }
  // A lens button ({ label, lens }): the figure crossfades to that lens and the key under the line follows; the model is untouched.
  function lensPick(l) {
    const lens = slideLens({ lens: l });
    if (store.get().colorMode !== lens) store.set({ colorMode: lens });
    paintKey(lens);
  }
  async function liveSet(s, i, patch) {
    if (!deck || shown?.i !== i || slides[i] !== s) return;
    const g = ++abGen, ref = refOf(s, i), mine = () => g === abGen && shown?.i === i && !!deck;
    liveOff = true;
    replaceParams(merge(structuredClone(store.get().params), patch));
    host.send({ type: 'setParams', params: store.get().params, settle: false, ease: 1200 });
    host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
    for (const t0 = performance.now(); performance.now() - t0 < 7000 && mine();) {
      await wait(150);
      const fr = store.get().frame;
      if (fr?.metrics && mine()) dataTo(s, liveFp(fr), ref, 280);
    }
    if (mine()) abSlow();
  }
  // A what-if slider (whatIf: { label, param, min, max, step, ends?, unit? }) drags one parameter of the live model
  // (or several together: param an array of paths, e.g. both lobes' fibrosis); the figure, the ladder and the tiles follow
  // it as with the buttons. It starts at the slide's own value (the first path's), and the slide's computed state comes
  // back whenever the slide is shown again.
  function whatIfEl(s, i, st) {
    const w = s.whatIf, paths = [].concat(w.param).map((p) => p.split('.'));
    const v0 = +(paths[0].reduce((o, k) => o?.[k], st?.params) ?? w.min);
    const patchOf = (x) => paths.reduce((a, path) => merge(a, path.reduceRight((o, k) => ({ [k]: o }), x)), {});
    const out = h('output', { class: 'pzi-v' });
    const input = h('input', { type: 'range', min: w.min, max: w.max, step: w.step ?? (w.max - w.min) / 20, value: v0, 'aria-label': `What if: ${w.label}` });
    const fmtV = (x) => (w.unit ? `${fmt(x, w.step >= 1 ? 0 : 1)} ${w.unit}` : '');
    const paint = (x) => { input.style.setProperty('--pct', `${((x - w.min) / (w.max - w.min)) * 100}%`); out.textContent = fmtV(x); };
    let raf = 0;
    input.addEventListener('input', () => {
      paint(+input.value);
      if (!raf) raf = nextFrame(() => { raf = 0; liveSet(s, i, patchOf(+input.value)); });
    });
    // (A finished drag hands the arrow keys back to the slides.)
    input.addEventListener('pointerup', () => input.blur());
    paint(v0);
    return h('div', { class: 'pz-wi', role: 'group', 'aria-label': `What if: ${w.label}` },
      h('span', { class: 'pzi-l' }, h('span', { class: 'pzi-k' }, 'What if'), w.label),
      h('div', { class: 'pzi-t' }, w.ends ? h('span', { class: 'pzi-e' }, w.ends[0]) : null, h('div', { class: 'range-wrap' }, input), w.ends ? h('span', { class: 'pzi-e' }, w.ends[1]) : null),
      w.unit ? out : null);
  }
  function stopLapse() { if (!lapseOn) return; lapseOn = false; host.send({ type: 'lapse', days: 0 }); shownState = -1; paintChrome(); }
  // Next during a time-lapse runs the days that are left in about 600 ms (the clock speeds up, the ramp is unchanged) and stops on its end.
  function skipLapse() { if (!lapseOn || lapseLeft < 1) return; host.send({ type: 'run', speed: Math.max(1, lapseLeft / 0.6) }); lapseLeft = 0; paintChrome(); }
  const lapseWords = (n) => (n >= 60 && n % 30 === 0 ? `${n / 30} months` : `${n} days`);
  const lapseText = (s, d, n, done) => (s.lapse.to ? (done ? s.lapse.to : `${s.lapse.from} → ${s.lapse.to}`) : done ? `${lapseWords(n)} later` : `Day ${Math.round(d)} of ${n}`);
  function paintLapse(s, d, n, done = false) {
    const el = ui?.text.querySelector('.pz-lapse');
    if (!el) return;
    el.style.setProperty('--k', (n ? d / n : 0).toFixed(3));
    el.querySelector('.pzl-t').textContent = lapseText(s, d, n, done);
    el.classList.toggle('done', done);
  }
  // (A chart over the days already draws its two lines from where they started to where they are, numbers and all: on a laptop
  // or tablet, where the chart is always in view beside the tiles, tiles for those two would repeat it.)
  const tileKeys = (s) => (s.tiles || []).filter((k) => !(s.tool?.kind === 'flowtime' && s.tool.lines?.includes(k) && !phone()));   // (a ladder already brackets the HVPG and PPG: tiles there would repeat them, rounded differently)
  function dataTo(s, f, ref, ms) {
    if (!ui) return;
    if (s.data === 'ladder') ui.ladder.set(f, { key: s.key || [], ms, brackets: s.brackets, block: s.block });
    if (s.data) ui.tiles.set(f, tileKeys(s), s.key || [], ref, ms, store.get().params?.tips?.on);
    ui.tools.pin(f);   // (an instrument's reading is the tiles' number)
    stage.siteFp?.(f);   // (and a callout's)
  }
  async function playLapse(s, to, cut) {
    const end = await stateReady(stateOf[to]);
    if (!end || cut()) return;
    const days = s.days, d0 = store.get().frame?.day ?? 0, ref = refOf(s, to);
    lapseOn = true; lapseLeft = days;
    ui?.tools.progress(0, end.trail);
    host.send({ type: 'lapse', days, speed: days / (s.lapse.seconds || 8), ramp: s.ramp || null });
    paintChrome();
    while (lapseOn && !cut()) {
      const fast = lapseLeft === 0;
      await wait(fast ? 60 : 150);
      const fr = store.get().frame, d = clamp((fr?.day ?? d0) - d0, 0, days);
      if (lapseLeft) lapseLeft = days - d;
      paintLapse(s, d, days);
      ui?.tools.progress(d / days);
      // (Only once a day has run: before that the live figure is at the bedside, its numbers swinging with each beat, while
      // the card already shows the settled start.)
      if (fr?.metrics && d >= 1) dataTo(s, liveFp(fr), ref, fast ? 120 : 280);
      if (d >= days && fr?.clock === 'hemo') break;
    }
    if (!lapseOn || cut()) { stopLapse(); return; }
    lapseOn = false; paintChrome();
    paintLapse(s, days, days, true);
    ui?.tools.progress(1);
    // (The live days land a hair off the computed end: the last step eases there too.)
    shownState = -1;
    if (!await morphTo(end, cut, reduce.matches ? 0 : 600, false)) return;
    shownState = stateOf[to];
    // A data card held through the days comes in now, already showing where they ended.
    const held = !!ui && 'hold' in ui.data.dataset;
    dataTo(s, end.fp, ref, held ? 0 : 700);
    if (held) releaseData();
  }

  // ── The case card ──
  // (caseLift: set while a case card is up; Next, a swipe on or a tap on the card lifts it rather than changing the slide.)
  // The card goes up first and the new patient loads behind it. The slide then goes on as usual behind the card: its words are
  // fitted unseen and the camera glides once to the slide's own framing, so after the tap there is no second move (see caseEnd).
  let caseLift = null, caseCard = null;
  async function caseRun(s, si, st, cut) {
    const c = ui.vcase, ms = reduce.matches ? 0 : 450;
    c.replaceChildren(h('span', { class: 'pz-site pz-case-tag' }, 'Case'), h('p', { class: 'pz-case-p' }, s.vignette));
    for (const k of ['transform', 'transition', 'opacity']) c.style.removeProperty(k);   // (a card flung off last time comes back whole)
    c.hidden = false; void c.offsetWidth;
    // The words run 2.5x the teaching card's; on a short or narrow screen they ease down just enough to fit the card's room (set before it enters, so nothing resizes on screen).
    c.style.removeProperty('--case-k');
    for (let k = parseFloat(getComputedStyle(c).getPropertyValue('--case-max')) || 2.5; k > 1.2 && c.scrollHeight > c.clientHeight + 1; k -= 0.1) c.style.setProperty('--case-k', k.toFixed(1));
    c.classList.add('on');
    // Lifting works from the moment the card is up: a tap/Next/swipe while the patient still loads behind it is remembered, and the card lifts once loading ends (into this same slide, never the next).
    const card = caseCard = { c, ms, lifted: false };
    caseLift = () => { card.lifted = true; };
    await wait(ms);
    if (cut()) return false;
    // Behind the card: out of the liver, the new patient eased in.
    await toAnatomy(null); if (cut()) return false;
    liveOff = false; shownState = -1;
    if (!await morphTo(st, cut, reduce.matches ? 0 : 1200)) return false;
    shownState = si;
    if (view.classList.contains('pz-out')) figureIn(); else loading(false);
    return !cut();
  }
  // The card leaves: no longer a case card for Next to lift; it fades out and is hidden once it has.
  // A card already flung off waits only for the rest of its flight.
  function caseShut() {
    const card = caseCard;
    if (!card) return 0;
    caseCard = null; caseLift = null;
    card.c.classList.remove('on');
    const ms = card.flown ? Math.max(0, Math.ceil(card.flown - performance.now())) : card.ms;
    setTimeout(() => { if (!card.c.classList.contains('on')) card.c.hidden = true; }, ms);
    return ms;
  }
  // Swiped: the card flies off sideways from where the finger let go and lifts as a tap does (during the glide behind it
  // too: the glide runs on and the slide's cards still wait for it to land). Too short a drag springs it back with an ease.
  // (It carries on from where the finger let go at the finger's own speed, then eases out as it fades to nothing; a slow
  // let-go still takes long enough to be seen leaving, never a pop. The card is hidden only once the flight is over.)
  function caseFly(card, dir, v) {
    const c = card.c, dist = innerWidth / 2 + c.offsetWidth, left = Math.max(1, dist - Math.abs(card.dx || 0));
    // (With reduced motion it only fades where it was let go.)
    const ms = reduce.matches ? 300 : caseFlight(left, v);
    const slope = (Math.abs(v) * ms) / left;   // the finger's speed as the curve's starting slope
    c.style.transition = reduce.matches ? `opacity ${ms}ms linear`
      : `transform ${ms}ms cubic-bezier(.33,${clamp(0.33 * slope, 0.12, 0.9).toFixed(2)},.45,1), opacity ${ms}ms cubic-bezier(.4,0,.6,1)`;
    if (!reduce.matches) c.style.transform = `translateX(${dir * dist}px) rotate(${dir * 10}deg)`;
    c.style.opacity = '0';
    card.flown = performance.now() + ms; card.lifted = true;
  }
  function caseBack(card) {
    const c = card.c;
    c.style.transition = 'transform .35s var(--ease), opacity .35s var(--ease)';
    c.style.removeProperty('transform'); c.style.removeProperty('opacity');
    card.dx = 0;
    setTimeout(() => { if (!card.flown && !card.drag) c.style.removeProperty('transition'); }, 380);
  }
  // Once the slide is ready behind the card (patient in, camera landed): waits for the tap, then lifts the card whole before the slide's cards come in.
  async function caseEnd(cut) {
    const card = caseCard;
    if (!card) return;
    if (!card.lifted) await until(() => cut() || card.lifted, 864e5);
    if (cut()) return;
    await wait(caseShut());
  }

  // ── Slides ──
  function go(i) {
    if (!deck) return;
    want = clamp(i, 0, slides.length - 1);
    noteResume(deck.id, want, slides.length);   // (the Present menu offers to resume here; the first or last slide forgets it)
    paintChrome();
    if (!busy) run();
  }
  const next = () => {
    if (caseLift) { caseLift(); return; }
    if (lapseOn && lapseLeft > 0 && shown?.i === want) skipLapse();
    else if (want < slides.length - 1) go(want + 1); else stop();
  };
  const prev = () => { if (want > 0) go(want - 1); };
  async function run() {
    busy = true;
    try {
      while (deck && (!shown || shown.i !== want || shown.gen !== gen)) await transition(want);
    } finally { busy = false; }
  }
  // Inside the liver a slide change is one sequence: every label (text, pill, ring, leader) eases out together, the
  // camera moves and the lit set changes with nothing showing, then only the new slide's labels ease in together
  // (.app.pz-hush; while it holds, no other state can bring a label back for a frame).
  const HUSH_OUT = 250, HUSH_IN = 350;
  let hushed = false, hushAt = 0, hushInT = 0, lastCam = null;
  // The liver labels' own eases still running (by property or animation name); getAnimations also starts any pending one.
  async function eased(props, cap) {
    const run = document.getAnimations().filter((a) => a.effect?.target?.closest?.('.lz, .sv') && (props.includes(a.transitionProperty) || props.includes(a.animationName)));
    if (run.length) await Promise.race([Promise.all(run.map((a) => a.finished.catch(() => {}))), wait(cap)]);
  }
  function hush() {
    if (hushed) return;
    hushed = true; hushAt = performance.now(); clearTimeout(hushInT);
    app.classList.remove('pz-hush-in'); app.classList.add('pz-hush');
  }
  async function unhush(cut) {
    if (!hushed) return;
    // Back only once the camera or the sinusoid has landed (its labels laid out there) and the lit set's own eases
    // (a pill in or out, a label lit or not) have run, unseen.
    await until(() => cut() || (!document.querySelector('.lz.lz-cam') && (store.get().sinusoid ? !!document.querySelector('.sv.on .sv-region') : !document.querySelector('.lz.lz-sin'))), 2500);
    await wait(80);
    await eased(['--pill-o', '--lit-o', 'pill-in', 'sv-fade-in'], 1500);
    if (cut()) return;
    hushed = false;
    app.classList.add('pz-hush-in'); app.classList.remove('pz-hush');
    clearTimeout(hushInT); hushInT = setTimeout(() => app.classList.remove('pz-hush-in'), HUSH_IN + 50);
  }
  // The corner credit sits out a slide change (class pz-moving on #app, read by src/ui/credit.js): it fades as the cards leave and
  // comes back once, at its final spot, after the cards are in and the camera has eased to fit around them.
  let creditHolds = 0, creditT = 0;   // (moves running; the timer that lifts the hold)
  async function transition(to) {
    stage.holdHome(true);
    creditHolds++; clearTimeout(creditT); app.classList.add('pz-moving');
    try { await transitionRun(to); } finally {
      stage.holdHome(false); caseShut(); if (bare) { bare = false; layout(); cardsIn(); }
      creditHolds--; clearTimeout(creditT);
      creditT = setTimeout(() => { if (!creditHolds) app.classList.remove('pz-moving'); }, 120);   // (the cards come in after the one camera move; src/ui/credit.js then waits for any card still sliding)
    }
  }
  async function transitionRun(to) {
    const g = gen, s = slides[to], cut = () => !deck || want !== to || gen !== g;
    // The slide on screen is leaving, so a move cut short never counts as showing it: going back and forward again to that
    // slide (summary table included) draws it afresh instead of leaving the half-changed screen.
    shown = null;
    const cam = s.visual ? s.cam || null : s.cam || 'fit';
    // A time-lapse starts from the slide before's state; a catheter slide drives its own camera.
    // Coming back to it from a later slide shows its end at once: it plays only going forward.
    const back = to < lastAt, lap = !!s.lapse && to > 0 && !back, ct = !s.visual ? s.cath || null : null;
    // A slide without breathing stops it on the live figure at once, before its probe is placed: otherwise its Doppler
    // trace records the leaving patient's breathing until the slide's own state eases in (the Doppler talk's meal slide).
    if (s.params?.respiration === false && store.get().params?.respiration !== false) {
      host.send({ type: 'breath', on: false }); replaceParams({ ...store.get().params, respiration: false });
    }
    // In the liver, with a new framing or new lit labels: all labels out first (see hush).
    const inLiver = store.get().lobule || store.get().sinusoid;
    const litNext = !s.visual ? slideTargets(s).lit.join(' ') : '';
    if (inLiver && !booting && (hushed || cam !== lastCam || litNext !== (app.dataset.lit || '') || s.visual || ct)) hush();
    // Words out, and the marks: they belong to the slide that is leaving.
    store.set({ focus: null, presentLabels: [], presentTerms: null, lobuleCallout: null, presentFp: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null);
    // The slide's lens: the figure crossfades to its colours (stage.js) while the old words leave. A question, or a
    // visual over the figure, keeps the colours already showing: they change only when a slide's lens does.
    if (!s.visual) { const lens = slideLens(s); if (store.get().colorMode !== lens) store.set({ colorMode: lens }); }
    if (!hushed) delete app.dataset.lit;   // (hushed, the lit set goes straight to the next slide's: a label on both keeps its pill)
    stopLapse(); abSlow();
    const si = lap ? stateOf[to - 1] : stateOf[to];
    await wordsOut(s);
    // (Nothing in the liver changes until its labels are gone.)
    if (hushed) { await wait(Math.max(0, HUSH_OUT - (performance.now() - hushAt))); await eased(['--lab-o'], 600); if (cut()) return; }
    if (cut()) return;
    slideLayers(s);
    // The catheter leaves with its slides (with a new patient, the figure's fade takes it).
    if (cath.on && (!ct || si !== shownState)) { await cathOut(si !== shownState && shownState >= 0); if (cut()) return; }
    // Out of the lobule while the old patient is still there, so the rise reads as leaving the liver. (With the same patient it waits
    // for the new slide's words, which set the space the camera frames into, so the rise is one zoom straight to the slide's framing:
    // see camera.)
    const inAnatomy = !ct && cam && !LOBULE_CAM.test(cam) && (s.view || 'anatomic') === 'anatomic';
    if ((ct || (cam && !LOBULE_CAM.test(cam))) && (store.get().lobule || store.get().sinusoid)) {
      if (!inAnatomy || si !== shownState || liveOff) { await toAnatomy(inAnatomy ? riseFor(cam, s) : null); if (cut()) return; }
    }
    // (A patient still being computed off screen: after a short wait the arc shows.)
    const lateT = states[si] && (!lap || states[stateOf[to]]) ? 0 : setTimeout(() => loading(true), 260);
    // (A time-lapse with its own params plays from them set and settled: the chain's start state, not the slide before's.)
    const own = lap ? (await stateReady(stateOf[to]))?.start || null : null;
    const st = own || await stateReady(si);
    clearTimeout(lateT);
    if (!st || cut()) return;
    // A visual waits for every patient it compares (some are computed after the slides).
    // (A table shows at once, its rows' cells "…" until each patient is in.)
    if (s.visual && s.visual !== 'table') { await Promise.all(rowIdx(s).map(stateReady)); if (cut()) return; }
    // A new patient's case (s.vignette), going forward: a centred glass card covers the figure while the patient loads behind it
    // (it stays up while the camera glides, once, to the slide's own framing; Next lifts it, and the slide's cards then come in with no further move).
    const skipCase = noCase; noCase = false;
    if (!skipCase && s.vignette && ui && !booting && !lap && to > lastAt && (si !== shownState || liveOff)) { if (!await caseRun(s, si, st, cut)) return; }
    // A new patient, or the same one changed: the figure fades out, the state changes unseen, it fades back in.
    const swap = si !== shownState || liveOff || !!own;
    // On screen the change eases (morphTo): after the camera has landed and before the cards come in, or for a catheter slide
    // (its cards come in at once) right here. Only the first slide, or with reduced motion, does the figure dim while it changes.
    const glide = swap && !booting && !reduce.matches, later = glide && !ct && !!ui;
    if (swap) {
      liveOff = false;
      if (glide) { shownState = -1; if (!later) { if (!await morphTo(st, cut)) return; shownState = own ? -1 : si; } }
      else {
        if (shownState >= 0 && !view.classList.contains('pz-out')) await figureOut();
        applyState(st); shownState = own ? -1 : si;
        await drawn(st);
      }
      if (!deck) return;
    }
    // With a new patient and a move over the plate, the glide starts while the figure is still dim and runs on
    // through its fade back in, so the eye sees one motion, not a fade and then a move.
    // (The words come first: they set the space the camera frames into.)
    // A time-lapse's words tell where it ends ("six months on, the HVPG is {hvpg}"), so their values are the end state's.
    const said = lap ? await stateReady(stateOf[to]) : st;
    if (!said || cut()) return;
    // (Its card starts from the state the time-lapse plays from, and climbs with it.)
    // The new cards are built unseen (pz-prep) and fitted at their final size before they fade in, so they never grow on screen
    // and the camera frames once, into the space they really leave (see settle).
    // The new cards are laid out and measured where they will rest while still unseen (bare), so the camera makes one eased move
    // straight to the framing that fits around them; only then do they come in, whole, and the camera stays put.
    ui?.root.classList.add('pz-prep');
    // (A catheter slide comes in at once: its teaching card carries the live tracing, which stays on screen through the
    // measurement while the catheter drives the camera.)
    bare = !booting && !!ui && !ct;
    wordsIn(s, said, to, swap, lap, st);
    // (Bare, the teaching card and its glass stay out whole until the camera has landed, never an empty card first. Behind a case
    // card they also stay out until it is lifted, a catheter slide's included: its words would otherwise come in under the case.)
    if (bare || caseCard) { ui.text.classList.add('pz-leave'); ui.root.dataset.bare = ''; }
    await settleRun();
    if (!bare) { await caseEnd(cut); if (cut()) return; cardsIn(); }
    if (cut()) return;
    // The liver's own labels light with the words, so their glow fades in during the dive rather than after it.
    if (!s.visual) app.dataset.lit = slideTargets(s).lit.join(' ');
    if (s.visual === 'table') fillTable(s, cut);
    const lead = swap && !glide && !ct && cam && !LOBULE_CAM.test(cam) && !store.get().lobule && !reduce.matches && !booting ? camera(cam, s, cut) : null;
    if (lead) await wait(150);
    if (swap || view.classList.contains('pz-out')) figureIn(); else loading(false);
    if (cut()) return;
    // A catheter slide with a new patient changes it before its camera moves (its cards come in at once), and the catheter then drives
    // the camera at once. While the liver and the fluid ease, the organs are the live SVG drawing (stage.js hidePlate), which every camera
    // frame paints again whole, its diaphragm mask stretched over the abdomen by the flank: the route's glide ran at about 1 fps (HVPG
    // slide 9, Budd–Chiari). So the catheter sets off once the organs are back on the GPU copy, as every other slide's camera moves over it.
    if (ct && swap && glide) { await until(() => cut() || stage.organsSettled(), CATH_SETTLE_MS); if (cut()) return; }
    if (ct) await cathTo(ct, st.fp, cut);
    else if (lead) await lead;
    else if (cam) await camera(cam, s, cut);
    if (cut()) return;
    if (bare) {
      // (A glide's last frame can land just after the wait that timed it: the cards wait for the camera to be still.)
      await until(() => cut() || !stage.gliding(), 1500);
      if (cut()) return;
      // The camera is still: the patient changes now, unhurried, and the cards come in only once it has.
      if (later) { if (!await morphTo(st, cut)) return; shownState = own ? -1 : si; }
      await caseEnd(cut); if (cut()) return;
      bare = false; layout(); cardsIn();
      // (Once they are in, so the size they settle at is the one the camera already framed: no second move.)
      await wait(60); await until(() => cut() || !cardsEntering(), 1200);
      if (cut()) return;
    }
    if (!s.visual) {
      // The slide's marks, labels, the stations its terms name (in their colours) and its glows (see slideTargets).
      const tg = slideTargets(s);
      let marks = (s.marks || (s.mark ? [s.mark] : [])).map((m) => ({ edges: [...m.edges], label: m.label, kind: m.kind || 'block', free: !!m.free, ...(m.seg ? { seg: m.seg } : {}) }));
      // A note mark is a pointer: its vessel glows in its station's colour. Where a station label on the slide already
      // names that vessel, the pointer would only repeat it, so it goes (the glow stays).
      if (tg) {
        const named = new Set([...(s.labels || []), ...tg.labels].flatMap((n) => TARGETS[n]?.edges || []));
        for (const m of marks) if (m.kind === 'note') for (const e of m.edges) if (!tg.glow.some((g) => g.id === e)) tg.glow.push({ id: e, tone: EDGE_TONE[e] || 'accent' });
        marks = marks.filter((m) => !(m.kind === 'note' && m.edges.some((e) => named.has(e))));
      }
      // (A site the label stands in for lends it its station colour, so the label is the slide's highlight.)
      if (tg) for (const k of s.sites || []) if (SITE_NODE[k] && [...(s.labels || []), ...tg.labels].includes(SITE_NODE[k])) tg.terms[SITE_NODE[k]] ||= TARGETS[k]?.tone || VAL_TONE[k];
      store.set({ presentLabels: [...new Set([...(s.labels || []), ...tg.labels])], presentTerms: tg.terms || null,
        presentNames: s.data === 'ladder' || !!s.cath, presentFp: st?.fp || null,
        focus: marks.length ? { ...marks[0], marks } : null, lobuleCallout: !s.callout ? null : { kind: 'block', ...s.callout } });
      if (tg) { stage.setGlow(tg.glow); stage.pinOrgans(tg.organs.map((o) => (o.id === 'spleen' && st?.fp ? { id: o.id, tone: rateTone('spleen', st.fp) } : o))); stage.setResGlow(tg.res); }
      app.dataset.lit = tg?.lit.join(' ') || '';
    }
    // A site whose station label is already on the slide is not called out twice: the label carries the one reading,
    // in its station's colour, and the pill stays only where no label stands.
    { const named = new Set(store.get().presentLabels || []);
      const ss = !s.visual ? [...new Set([...(s.sites || []), ...slideTargets(s).sites])].filter((k) => !named.has(SITE_NODE[k])) : [];
      if (ss.length) stage.setSites(ss, st.fp); }
    lastCam = cam; framedSig = cardSig();
    await unhush(cut);
    if (cut()) return;
    shown = { i: to, gen: g }; lastAt = to;
    // (One pass keyed to the slide now shown, so its fold and words' room are kept from here on: a tap on Show or Hide then
    // eases the card it planned, not one measured afresh with the instrument open. The pass changes nothing on screen.)
    if (ui && phone()) layout();
    paintChrome();
    if (s.lapse && to > 0 && back) paintLapse(s, s.days, s.days, true);
    if (booting) await coverDown();
    if (lap) await playLapse(s, to, cut);
  }

  // The fonts in and two frames for the cards' charts and refits to run, then one last fit; then the cards show (eased in).
  // (The cards were fitted unseen; once in place, every ladder asks again whether its plot fits, before the next paint.)
  const reFit = () => { for (const x of document.querySelectorAll('.pz-data.strip, .pz-cell.strip')) x.classList.remove('strip'); fitted.forEach(fitNow); };
  function cardsIn() { if (ui) { reFit(); if (!bare) { ui.text.classList.remove('pz-leave'); delete ui.root.dataset.bare; } ui.root.classList.remove('pz-prep'); ui.panel.classList.remove('pz-leave'); if (ui.data.dataset.prep && !('hold' in ui.data.dataset)) { delete ui.data.dataset.prep; ui.data.classList.remove('pz-hide'); } } }
  // A time-lapse whose data card is only numbers holds that card back (unseen, at its resting place) until the days have run.
  function releaseData() { if (!ui || !('hold' in ui.data.dataset)) return; delete ui.data.dataset.hold; if (ui.data.dataset.prep) { delete ui.data.dataset.prep; ui.data.classList.remove('pz-hide'); } }
  // While bare, the new slide's cards are fitted at their resting place but unseen, and the camera frames around them (see transitionRun).
  let bare = false;
  async function settleRun() {
    await Promise.race([document.fonts?.ready, wait(400)]);
    await new Promise((r) => nextFrame(() => nextFrame(r)));
    if (!ui) return;
    layout();
  }
  // A slide's lobule layers (layers: ['zones', 'lymph'] turns those on); otherwise zones off and lymph as the viewer had it.
  function slideLayers(s) {
    if (!layersBefore) return;
    const want = { ...layersBefore, zones: false, ...Object.fromEntries((s.layers || []).map((k) => [k, true])) }, now = store.get().lobuleLayers || {};
    if (Object.keys(want).some((k) => !!want[k] !== !!now[k])) store.set({ lobuleLayers: want });
  }

  // ── The slide's words, data and visual ──
  // On a phone, tiles beside a sinusoid sit under the words, so the vessel has the width of the screen.
  // (Not on a phone on its side, nor on a tablet or computer: there they sit at the top right as on other slides,
  // and the camera centres the vessel between the two cards.)
  const shortSide = matchMedia('(orientation: landscape) and (max-height: 500px)');
  const sinTiles = (s) => s.data === 'tiles' && !s.visual && /^sinusoid/.test(s.cam || '');
  const under = (s) => sinTiles(s) && !shortSide.matches && phone();
  async function wordsOut(next) {
    if (!ui) return;
    const out = [ui.text, ui.panel], data = ui.data;
    // The data card leaves with the words on every slide change, whole (the same ease and pace), and comes back in with the new cards:
    // never left standing while the words go, nor changed in place.
    const dataOut = !data.hidden && !data.classList.contains('pz-hide');
    if (dataOut) { data.classList.add('pz-hide'); delete data.dataset.colswap; }
    // Leaving a visual for the figure: the veil lifts with the panel, not after it.
    if (!next?.visual) ui.veil.classList.remove('on');
    if (!dataOut && out.every((el) => el.hidden || !el.childElementCount)) return;
    // The catheter's monitor stays up from one measuring slide to the next: only the words around it go.
    const keep = mon && next?.monitor && !next.visual && mon.el.parentNode === ui.text;
    for (const el of out) {
      if (keep && el === ui.text) { for (const c of el.children) if (c !== mon.el) c.classList.add('pz-leave'); }
      else el.classList.add('pz-leave');
    }
    await wait(reduce.matches ? 0 : 340);   // (the words leave at the data card's pace)
  }
  // A slide's tiles can say how far each number moved: from the slide before (delta: true) or a named one. A slide that
  // changes the same patient (a drug, an action, days) counts from the slide before unless it says delta: false.
  const deltaOf = (s, i) => s.delta ?? (i > 0 && !s.preset && changes(s) ? true : null);
  const refOf = (s, i) => { const d = deltaOf(s, i); return (d === true ? states[stateOf[i - 1]]?.fp : typeof d === 'string' ? fpOf(d) : null) || null; };
  // The data card: the ladder and tiles, a slide's instrument (tool), or both (the tool above the tiles).
  const hasCard = (s) => !s.visual && (s.data === 'ladder' || s.data === 'tiles' || !!s.tool);
  // A reading tool can show the earlier reading as a ghost (D3): tool.delta, else the slide's own delta.
  const GHOST = { fibroscan: ['lsm', 'kPa', 1], doppler: ['pvVel', 'cm/s', 0] };
  function toolGhost(s, i) {
    const g = GHOST[s.tool.kind];
    if (!g || (s.tool.kind === 'doppler' && (s.tool.vessel || 'PV_TRUNK') !== 'PV_TRUNK')) return null;
    if (s.tiles?.includes(g[0])) return null;   // (a tile already gives the change and where it came from)
    const t = s.tool.delta != null ? { ...s, delta: s.tool.delta } : s, d = deltaOf(t, i), r = refOf(t, i);
    if (r?.[g[0]] == null) return null;
    // (The earlier reading only: the instrument's live reading jitters, so a computed change could disagree with it.)
    const from = d === true ? slides[stateOf[i - 1]] : slides.find((x) => x.id === d);
    return { label: s.tool.deltaLabel || (d === true && s.lapse?.from) || from?.kicker || 'Before', value: `${fmt(r[g[0]], g[2])} ${g[1]}` };
  }
  const fullTitle = (s) => (s?.data === 'ladder' ? 'Pressure, portal vein to heart' : s?.dataTitle || (s?.tool ? ui.tools.title(s.tool) : 'The patient'));
  // A phone's card title is one short line beside Show: the long name's head, never broken into two lines or a hyphen.
  const SHORT_TITLE = { 'Pressure, portal vein to heart': 'Portal vein to heart', 'Endoscopy, the lower esophagus': 'Endoscopy', 'The varix wall, in cross-section': 'The varix wall',
    'Liver stiffness, FibroScan': 'FibroScan', 'Pressure, beat by beat': 'Beat by beat', 'Portal pressure and flow over time': 'Pressure and flow', 'Doppler, main portal vein': 'Doppler, portal vein',
    'Doppler, superior mesenteric vein': 'Doppler, SMV', 'Doppler, splenic vein, at the hilum': 'Doppler, splenic hilum', 'Doppler, right portal vein': 'Doppler, right PV', 'Doppler, left portal vein': 'Doppler, left PV',
    'Doppler, right hepatic vein': 'Doppler, right HV', 'Doppler, middle hepatic vein': 'Doppler, middle HV', 'Doppler, left hepatic vein': 'Doppler, left HV', 'Doppler, inferior vena cava': 'Doppler, IVC',
    'Doppler, paraumbilical vein': 'Doppler, umbilical v.', 'Two years on one chart': 'Two years', 'The course on one chart': 'The course', 'Pressure over the talk': 'Pressure so far',
    'Pressures over the year': 'The year' };
  const cardTitle = (s) => { const t = fullTitle(s); return phone() && t.length > 20 ? SHORT_TITLE[t] || t.replace(/ over the (days|year|talk)$/, '').replace(/,.*$/, '') : t; };
  // The talk so far, for a pressure trace: every state up to slide i, once each.
  // Each carries its time point (the deck's days so far) and what happened there (the first tick among its slides, else its title).
  const whenOf = (k) => {
    const d = slides.slice(0, k + 1).reduce((a, s) => a + (s.days || 0), 0);
    return d && d % 365 === 0 ? `Year ${d / 365}` : d <= 200 ? `Day ${d}` : `Month ${Math.round(d / 30.4)}`;
  };
  // (A state on the same day as the one before it, as a drug started at that visit, says so instead of repeating the day; a slide's `when` words it.)
  const chainTo = (i) => { let before = null; return [...new Set(stateOf.slice(0, i + 1))].filter((k) => slides[k]?.visual !== 'outline').map((k) => { const w = whenOf(k), p = { n: k + 1, title: slides[k].title, tick: slides.find((x, j) => stateOf[j] === k && x.tick)?.tick || slides[k].title, when: traceWhen(slides[k].when, w, before), fp: states[k]?.fp }; before = w; return p; }); };
  // The deck's short name in a tab at the card's top right corner (decks.js TOPICS; your own deck, its title when short):
  // a darker patch of the card's own glass, flush with its top and right edges, only its bottom left corner rounded. It sits in
  // the card's top padding, so it never meets the title. (Not read out on every slide: the outline and the slide list name the talk.)
  const deckTab = () => { const name = deck?.head || (deck?.title?.length <= 24 ? deck.title : ''); return name ? h('span', { class: 'pz-tabname', 'aria-hidden': 'true' }, name) : null; };
  // The catheter's pressure monitor, made once and kept, so its trace carries on from slide to slide.
  let mon = null;
  function monitorFor(s, i) {
    mon ||= createHvpgMonitor();
    // Already up (the slide before measured too): it stays, and glides to its new place under the new words.
    const stay = mon.el.parentNode === ui.text && !ui.text.hidden, y0 = stay ? mon.el.getBoundingClientRect().top : 0;
    mon.el.classList.toggle('pz-stay', stay);
    nextFrame(() => {
      if (stay && !reduce.matches) {
        const dy = y0 - mon.el.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) mon.el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.7,.2,1)' });
      }
      mon.set(s.monitor, states[stateOf[i]]?.fp, cath.v.balloon);
    });
    return mon.el;
  }
  function wordsIn(s, st, i, fresh = false, lap = false, now = st) {
    if (!ui) return;
    const { text, panel, data } = ui;
    // (the panel's own is let go once its new content is in, so it never fades back in with the old; behind a case card the words
    // stay out, never shown for a moment while they are fitted, until the card is lifted: cardsIn)
    if (!caseCard) text.classList.remove('pz-leave');
    if (s.visual) {
      text.hidden = true; text.replaceChildren(); paintKey(null);
      // A panel that was not there fades in (never pops): unhidden while still faded, then let go.
      if (panel.hidden) { panel.classList.add('pz-leave'); panel.hidden = false; void panel.offsetWidth; }
      panel.classList.toggle('fill', s.visual === 'ladders');
      panel.dataset.visual = s.visual;
      const tab = s.visual !== 'outline' && deckTab();   // (the outline names the talk in full instead)
      panel.classList.toggle('tabbed', !!tab);
      panel.replaceChildren(...(tab ? [tab] : []), h('div', { class: 'pz-ph' }, s.visual === 'outline' ? h('h1', { class: 'pz-dtitle' }, nb(deck.title)) : null, h('h1', { class: 'pz-h' }, ...diseaseNodes(nb(s.title))), s.eq ? equation(s.eq) : null, s.line ? h('p', { class: 'pz-line' }, rich(s.line, s, st?.fp)) : null, s.caveat ? h('p', { class: 'pz-caveat' }, s.caveat) : null),
        VISUALS[s.visual](s));
      if (!ui.root.classList.contains('pz-prep')) panel.classList.remove('pz-leave');   // (else once fitted: settle)
      ui.veil.classList.add('on');
    } else {
      panel.hidden = true; panel.replaceChildren(); panel.classList.remove('pz-leave'); ui.veil.classList.remove('on');
      text.hidden = false;
      text.replaceChildren(...[(({ site, name } = siteTag(deck, s) || {}) => site ? h('span', { class: 'pz-site', 'data-site': site }, name) : null)(), h('h1', { class: 'pz-h' }, ...diseaseNodes(nb(s.title))), s.eq ? equation(s.eq) : null, s.monitor ? monitorFor(s, i) : null,
          s.line ? h('p', { class: 'pz-line' }, rich(s.line, s, st?.fp)) : null, s.caveat ? h('p', { class: 'pz-caveat' }, s.caveat) : null,
          s.compare ? h('div', { class: 'pz-ab', role: 'group', 'aria-label': lensButtons(s) ? 'Color the vessels by' : gateButtons(s) ? 'Sample the stent at' : 'Switch treatment on the live model' },
            s.compare.map((o, k) => h('button', { type: 'button', class: 'pz-abb', 'aria-pressed': String(!!o.own), ...(o.short ? { 'data-full': o.label, 'data-short': o.short, 'aria-label': o.label, title: o.label } : {}), onclick: () => abPick(s, i, k) }, o.label))) : null,
          s.whatIf ? whatIfEl(s, i, st) : null,
          s.column ? wedgeColumn() : null,
          s.lapse && i > 0 ? h('div', { class: 'pz-lapse', role: 'status' }, h('span', { class: 'pzl-bar' }, h('i')), h('span', { class: 'pzl-t' }, lapseText(s, 0, s.days, false))) : null,
          s.rail ? rail(s.rail === 'all' ? 'all' : s.site) : null,
          s.causes?.length ? h('p', { class: 'pz-causes' }, h('span', { class: 'pz-sub' }, s.causesHead || 'Causes'), s.causes.join(', ')) : null]);
      paintKey((slideLens(s) !== 'pressure' || lensButtons(s)) ? slideLens(s) : null);
      markLong(text, gen !== redrawn);   // (drawn again for a new text size: judged at its full size, as a fresh load does)
      [...text.children].forEach((c, k) => c.style.setProperty('--i', k));
      text.classList.remove('pz-enter'); void text.offsetWidth; text.classList.add('pz-enter');
    }
    delete data.dataset.hold;
    if (hasCard(s)) {
      const lad = s.data === 'ladder';
      // (A time-lapse's numbers wait for its end; an instrument on the card plays the days, so that card comes in with the words.)
      if (lap && !s.tool && ui.root.classList.contains('pz-prep')) data.dataset.hold = '';
      data.classList.toggle('tiles-only', !lad);
      data.classList.toggle('under', under(s));
      data.toggleAttribute('data-sin-tiles', sinTiles(s));
      data.classList.toggle('has-tool', !!s.tool);
      data.classList.toggle('tool-only', !!s.tool && !s.data);
      data.classList.remove('strip');   // (a squashed ladder's strip lasts one slide)
      data.classList.toggle('pz-beside', (!!s.tool || lad) && !!s.data && tileKeys(s).length > 0);
      data.toggleAttribute('data-beside', data.classList.contains('pz-beside'));
      data.classList.remove('pz-folds');   // (Mac and iPad landscape: folded behind Show only when the pair would not fit, set in layout)
      data.dataset.tn = tileKeys(s).length;   // (Mac and iPad landscape: every instrument with tiles has them stacked beside it; its own readings fold to a short list under its picture)
      data.classList.toggle('tool-lead', !!s.tool?.open && !!s.data);   // (a phone keeps this instrument open and folds the tiles instead)
      data.dataset.tool = ui.tools.sig(s.tool);
      ui.dhT.textContent = cardTitle(s);
      ui.dhL.hidden = !lad;
      // (A flow-time chart over a time-lapse starts empty and draws as it plays.)
      if (s.tool) ui.tools.show(s.tool, { slide: i, stateKey: stateOf[i], chain: chainTo(i), trail: states[stateOf[i]]?.trail ?? null, reveal: lap ? 0 : 1 }); else ui.tools.hide();
      if (s.tool) ui.tools.ghost(toolGhost(s, i));
      // (With a new patient the numbers are set at once, while the card is still out: it fades back in already showing them.)
      const ms = fresh ? 0 : undefined;
      if (lad) ui.ladder.set(now.fp, { key: s.key || [], ms, brackets: s.brackets, block: s.block });
      if (s.data) ui.tiles.set(now.fp, tileKeys(s), s.key || [], refOf(s, i), ms, now.params?.tips?.on);
      ui.tools.pin(now.fp);
      if (data.hidden) { data.hidden = false; data.classList.add('pz-hide'); void data.offsetWidth; }
      if (!ui.root.classList.contains('pz-prep')) data.classList.remove('pz-hide');   // (else once fitted: settle)
      else data.dataset.prep = '1';
      delete data.dataset.gone;
    } else if (!data.hidden) {
      data.dataset.gone = '';
      data.classList.add('pz-hide'); delete data.dataset.colswap;
      setTimeout(() => { if (data.classList.contains('pz-hide')) { data.hidden = true; ui?.tools.hide(); } }, reduce.matches ? 0 : 320);
    }
    layout();
  }
  // Each row of a table still computing fills in (its cells fade in) as its patient arrives.
  function fillTable(s, cut) {
    for (const k of new Set(rowIdx(s).filter((x) => !states[x]))) {
      stateReady(k).then((st) => {
        const old = ui?.panel.querySelector('.pz-table');
        if (!st || cut() || !old) return;
        const t = summaryTable(s, k), sc = old.scrollTop;
        old.replaceWith(t); t.scrollTop = sc;
      });
    }
  }
  const fpOf = (id) => { const i = slides.findIndex((x) => x.id === id); return i >= 0 ? states[stateOf[i]]?.fp : null; };
  fpAt = fpOf;   // (for {key@slide} in the words: see liveVal)
  // A visual's rows: the deck's slides by id ('pvt', or { id, name } to name it), or { preset, name } patients that
  // no slide shows, computed after the slides.
  const rowAt = (o) => { const id = typeof o === 'string' ? o : o.id, i = id ? slides.findIndex((x) => x.id === id) : -1; return [i, i >= 0 ? stateOf[i] : extraOf.get(xKey(o))]; };
  const rowIdx = (s) => (s.of || []).map((o) => rowAt(o)[1]).filter((k) => k != null && k >= 0);
  function rowsOf(s) {
    return (s.of || []).map((o) => {
      const [i, k] = rowAt(o), sl = i >= 0 ? slides[i] : null, x = typeof o === 'object' ? o : {};
      if (k == null || k < 0) return null;
      const title = x.title ?? sl?.title ?? '';
      return { i, k, f: states[k]?.fp, kicker: x.kicker ?? sl?.kicker ?? '', title, name: x.name || title, site: x.site ?? sl?.site, note: x.note, blank: x.blank || [], ref: !!x.ref, vs: x.vs, key: x.key, calm: x.calm || [], block: x.block ?? sl?.block };
    }).filter(Boolean);
  }
  function laddersGrid(s) {
    // (At a large text size a phone's strips take a row each: five readings no longer fit half its width.)
    const big = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts')) >= 1.3;
    const grid = h('div', { class: 'pz-grid' + (big ? ' big' : '') });
    // (A phone: the five station names once, over the six rows of readings, each over its column of the strips below: the
    // strip's stations stand at 28 + 70 i of its 360 units, and the head is as wide as a cell's strip. Hidden on wider screens.)
    // (Three copies: a phone held sideways shows the rows in three columns, each under its own names.)
    const names = () => h('div', {}, RUNGS.map(([, a], i) => h('span', { style: `left: ${((28 + 70 * i) / 3.6).toFixed(3)}%` }, a)));
    grid.append(h('div', { class: 'pz-grid-head', 'aria-hidden': 'true' }, names(), names(), names()));
    for (const r of rowsOf(s)) {
      if (!r.f) continue;
      const L = bigLadder(); L.setBase(base); L.set(r.f, { block: r.block });   // (a block on a station, the heart's RA, is hatched on its node)
      const cell = h('div', { class: 'pz-cell' },
        h('div', { class: 'pz-cell-k' }, h('div', { class: 'pz-kick', 'data-site': r.site || 'none' }, r.kicker.replace('Intrahepatic · ', '')),
          h('span', { class: 'pz-cell-pill', 'data-rate': rateOf('hvpg', { hvpg: wholeGap(r.f.whvp, r.f.fhvp, r.f.hvpg) })[0] }, 'HVPG ', h('b', {}, fmt(wholeGap(r.f.whvp, r.f.fhvp, r.f.hvpg), 0)))),   // (as its ladder's bracket reads it: whole readings, their difference)
        h('div', { class: 'pz-cell-t' }, r.title), L.el, L.strip);
      grid.append(cell);
    }
    // The dashed line's numbers, once for all six: the healthy reference each ladder is read against.
    if (base) grid.append(h('p', { class: 'pz-grid-key' }, h('i', { 'aria-hidden': 'true' }), 'Healthy, dashed: ',
      [['PV', 'pv'], ['WHVP', 'whvp'], ['FHVP', 'fhvp'], ['IVC', 'ivc'], ['RA', 'ra']].filter(([, k]) => base[k] != null).map(([a, k]) => `${a} ${fmt(base[k], 0)}`).join(' · ') + ' mmHg'));
    return grid;
  }
  // Purpose-drawn arrows: a solid head on a shaft of real weight, one per symbol; a large change is two arrows side by side.
  // A thin dash means unchanged / normal. Drawn on one grid so they sit on the table's cap height. n: 2 / 1 up, -1 / -2 down, 0 the dash.
  const ARROW = (x, w) => `<path d="M${x} 15.2V7.4" stroke-width="2.5"/><path d="M${x} 1L${x + w} 8.2H${x - w}Z" fill="currentColor" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/>`;
  const SHAPE = {
    1: ['0 0 12 16', ARROW(6, 4.4)],
    2: ['0 0 19 16', ARROW(4.6, 3.9) + ARROW(14.4, 3.9)],
    0: ['0 0 12 16', '<path d="M2.8 8.6H9.2" stroke-width="1.6" stroke-linecap="round"/>'],
  };
  function arrowEl(n) {
    const el = document.createElement('span');
    const [box, d] = SHAPE[Math.abs(n)];
    el.className = `pz-arr${n < 0 ? ' dn' : ''}${n === 0 ? ' zero' : ''}${Math.abs(n) === 2 ? ' two' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<svg viewBox="${box}" focusable="false">${d}</svg>`;   // (constant markup, never user text)
    return el;
  }
  // A cell that cannot be measured: a hollow ring, never the dash that means normal.
  const noneEl = () => h('span', { class: 'pz-nm', 'aria-hidden': 'true' });
  // A legend line with its symbols drawn as the table's own: arrows, the dash (•) and the ring (○).
  const withArrows = (t) => t.split(/(↑↑|↓↓|↑|↓|•|○)/).map((x) => (x === '↑↑' ? arrowEl(2) : x === '↓↓' ? arrowEl(-2) : x === '↑' ? arrowEl(1) : x === '↓' ? arrowEl(-1) : x === '•' ? arrowEl(0) : x === '○' ? noneEl() : x));
  const WORD = { 2: 'well above normal', 1: 'above normal', 0: 'normal', '-1': 'below normal', '-2': 'well below normal' };
  const WORDREL = { 2: 'much higher', 1: 'higher', 0: 'unchanged', '-1': 'lower', '-2': 'much lower' };
  const unitOf = (k) => (k === 'varix' ? ' mm' : k === 'asc' ? ' L' : k === 'liver' || k === 'shunt' ? '%' : k === 'hr' ? '/min' : k === 'res' ? ' mmHg per L/min' : PRESS.has(k) ? ' mmHg' : TILE[k]?.u ? ` ${TILE[k].u}` : '');
  const UNIT_WORDS = { press: 'pressures in mmHg', varix: 'varix in mm', asc: 'ascites in liters', liver: 'liver blood flow in % of normal', shunt: 'shunted blood in %', plt: 'platelets × 10³/µL',
    lsm: 'stiffness in kPa', hr: 'heart rate in beats/min', pvFlow: 'portal flow in L/min', res: 'liver resistance in mmHg per L/min', spleen: 'spleen in cm' };
  function summaryTable(s, arrived = -1) {
    const cols = s.cols || ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], ascCols = s.asc ?? !s.cols, rows = rowsOf(s);
    const perRow = rows.some((r) => r.vs), rel = s.vs === 'first' || perRow;
    const notes = s.note ? [s.note].flat() : [];
    // Pressures always in whole mmHg (the model is not that precise); litres, kPa and flow keep their decimal.
    const val = (k, f) => { const v = fpv(k, f); return v == null ? '—' : PRESS.has(k) ? fmt(v, 0) : k === 'res' ? fmt(v, 1) : tileVal(k, v); };
    const first = rows[0]?.f;
    // A row's 'vs' names a slide, or the key of a patient row no slide shows (the same liver without collaterals).
    const vsRow = (r) => rows.find((x) => x.key === r.vs || (x.i >= 0 && slides[x.i]?.id === r.vs));
    const refOfRow = (r) => (r.vs ? vsRow(r)?.f ?? fpOf(r.vs) : first);
    // (Lower-cased mid-sentence, but an acronym such as CSPH or TIPS stays as it is.)
    const lc = (t) => (/^[A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
    const vsName = (r) => { const t = vsRow(r); return lc(t?.title || slides.find((x) => x.id === r.vs)?.title || ''); };
    // The reference row (the healthy patient, or the baseline) keeps its numbers, the anchor for the arrows.
    const isRef = (r, n) => !!r.ref || (rel && !r.vs && n === 0);
    const cell = (k, r, n) => {
      if (r.blank.includes(k)) return h('td', { class: 'num blank', title: 'Not measurable' }, noneEl(), h('span', { class: 'sr-only' }, 'not measurable'));
      if (!r.f || (rel && !isRef(r, n) && !refOfRow(r))) return h('td', { class: 'num pend' }, '…');
      if (k === 'spleen' && !(fpv(k, r.f) > 0)) return h('td', { class: 'num none' }, 'Removed');
      if (isRef(r, n)) return h('td', { class: 'num ref', 'data-rate': rel ? null : rateAbs(k, dirAbs(k, r.f)) }, val(k, r.f));
      const ref = refOfRow(r), d = rel ? (ref ? dirRel(k, r.f, ref) : 0) : dirAbs(k, r.f), v = val(k, r.f) + unitOf(k);
      // Against normal, the colour follows the arrows (amber above, red well above); against a baseline, better or worse,
      // except where a change is neither ('calm': a meal's small PPG rise, the HVPG's dip as a clot diverts portal flow).
      const calm = (s.calm || []).includes(k) || r.calm.includes(k);
      return h('td', { class: 'num dir' + (d ? '' : ' zero') + (rel ? ' rel' : ''), 'data-rate': rel ? null : rateAbs(k, d), 'data-eff': rel && !calm ? effOf(k, d) : null, title: v },
        arrowEl(d), h('span', { class: 'sr-only' }, `${rel ? WORDREL[d] : WORD[d]}, ${v}`));
    };
    // Ascites as two columns, SAAG and protein, one arrow each; "None" spans both when there is no fluid.
    const ascCells = (r, n) => {
      if (!r.f) return [h('td', { class: 'num pend' }, '…'), h('td', { class: 'num pend' }, '…')];
      if (r.f.asc < NO_ASC) return [h('td', { class: 'num none', colspan: '2' }, 'None')];
      const hiS = r.f.saag >= 1.1, hiP = r.f.tp >= 2.5;
      if (isRef(r, n)) return [h('td', { class: 'num ref', 'data-rate': hiS ? 'hi' : null }, fmt(r.f.saag, 1)), h('td', { class: 'num ref' }, fmt(r.f.tp, 1))];
      return [h('td', { class: 'num dir', 'data-rate': hiS ? 'hi' : null, title: `SAAG ${fmt(r.f.saag, 1)} g/dL` }, arrowEl(hiS ? 1 : -1), h('span', { class: 'sr-only' }, `SAAG ${hiS ? '1.1 or more' : 'under 1.1'}, ${fmt(r.f.saag, 1)}`)),
        h('td', { class: 'num dir', title: `Protein ${fmt(r.f.tp, 1)} g/dL` }, arrowEl(hiP ? 1 : -1), h('span', { class: 'sr-only' }, `protein ${hiP ? '2.5 or more' : 'under 2.5'}, ${fmt(r.f.tp, 1)} g/dL`))];
    };
    // One legend, built from the table itself: what the arrows compare with, the reference row's units, the ring.
    const units = [...new Set(cols.map((k) => (PRESS.has(k) ? 'press' : k)).filter((k) => UNIT_WORDS[k]))].map((k) => UNIT_WORDS[k]);
    if (ascCols) units.push('SAAG and protein in g/dL');
    const refTitle = first ? lc(rows[0].title) : 'the baseline';
    const key = rel
      ? `↑ higher, ↓ lower than ${perRow ? 'the row named under each' : refTitle}; ↑↑ ↓↓ by 40% or more; • unchanged${cols.some((k) => k !== 'pvFlow') ? '. Green better, red worse' : ''}`
      : `↑ above normal, ↓ below; ↑↑ ↓↓ past the red cut-off of that column (tap a heading for it); • within normal`;
    const legend = [key, rows.some((r) => r.blank.length) ? '○ not measurable' : '', units.length && rows.some((r, n) => isRef(r, n)) ? `Top row: ${units.join(', ')}` : '', s.foot || '']
      .filter(Boolean).map((x) => x.replace(/\.$/, '')).join('. ') + '.';
    // A heading's cut-offs: its tooltip on hover, and a line under the legend on a tap (a touch screen shows no tooltip).
    const cutLine = h('span', { class: 'pz-cutl', 'aria-live': 'polite' });
    const showCut = (k) => (e) => { if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); e.stopPropagation?.(); cutLine.replaceChildren(h('b', {}, `${COLS[k] || k}: `), ...withArrows(CUT[k] + '.')); } };
    const cutTh = (k, label, cut) => h('th', { class: 'num', title: cut || null, ...(cut ? { tabindex: '0', onclick: showCut(k), onkeydown: showCut(k) } : {}) }, label);
    const go1 = (r) => (e) => { if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); go(r.i); } };
    // (long: seven rows or more; a class, not :has(), which made every table cell part of each restyle the page did)
    return h('div', { class: rows.length >= 7 ? 'pz-table long' : 'pz-table' }, h('table', { style: { '--nc': String(cols.length + (ascCols ? 2 : 0)), '--asc-w': '0px' } },
      h('thead', {}, h('tr', {}, h('th', {}, s.rowHead || 'Level'), cols.map((k) => cutTh(k, COLS[k] || k, CUT[k])),
        ascCols ? [cutTh('saag', h('abbr', { title: 'Serum−ascites albumin gradient' }, 'SAAG'), CUT.saag), cutTh('tp', h('abbr', { title: 'Ascites protein' }, 'Prot.'), CUT.tp)] : null,
        notes.map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r, n) => h('tr', { ...(r.i >= 0 ? { tabindex: '0', onclick: go1(r), onkeydown: go1(r), 'aria-label': `${r.title}: go to this slide` } : { class: 'static' }),
          'data-arrived': r.k === arrived || (rel && n > 0 && (r.vs ? vsRow(r)?.k : rows[0].k) === arrived) ? '' : null },
        h('th', { scope: 'row' }, h('span', { class: 'pz-kick', 'data-site': r.site || 'none' }, r.kicker.replace('Intrahepatic · ', '')), h('span', { class: 'tw' }, h('span', { class: 'tn' }, nb(r.title)),
          r.vs ? h('span', { class: 'vs' }, `vs ${vsName(r)}`) : null)),
        cols.map((k) => cell(k, r, n)),
        ascCols ? ascCells(r, n) : null,
        notes.map((_, j) => h('td', { class: 'note' }, [r.note].flat()[j] || '')))))),
    h('p', { class: 'pz-foot' }, withArrows(legend), cutLine));
  }
  const VISUALS = {
    table: summaryTable,
    ladders: laddersGrid,
    scale: (s) => scaleVisual(s.scale, rowsOf(s)),
    quadrant: (s) => quadrantVisual(rowsOf(s)),
    walls: () => wallsVisual(),
    // The closing quick check: a few questions to answer from memory; a tap on one shows its answer.
    check: (s) => h('ol', { class: 'pz-check' }, s.checks.map(([q, a], k) => {
      const li = h('li', {}, h('button', { type: 'button', class: 'pzc-q', 'aria-expanded': 'false', 'aria-controls': `pzc-a${k}`,
        onclick: (e) => { const on = !li.classList.contains('open'); li.classList.toggle('open', on); e.currentTarget.setAttribute('aria-expanded', String(on)); } },
      h('span', { class: 'pzc-t' }, q), h('span', { class: 'pzc-hint', 'aria-hidden': 'true' }, 'Show answer')),
      h('div', { class: 'pzc-a', id: `pzc-a${k}` }, h('p', {}, a)));
      return li;
    })),
    outline: (s) => h('div', { class: 'pz-outline' },
      h('section', {}, h('h2', { class: 'pz-sub' }, 'Outline'), h('ol', {}, s.outline.map((k) => h('li', {}, k)))),
      s.objectives.length ? h('section', { class: 'pzo-obj' }, h('h2', { class: 'pz-sub' }, 'By the end you can'), h('ul', {}, s.objectives.map((o) => h('li', {}, o)))) : null),
  };

  // ── Layout: what the slide's words and data cover, so the figure frames itself in the rest ──
  // An upright phone, or a tablet held upright, stacks the words under the figure and the data card over it; a tablet on its
  // side and any phone on its side keep the words at the left and the data card at the right (a small phone on its side had
  // no height for the two stacked). An upright tablet's cards take 70% of the width (class `tab`), centred.
  const tabUp = () => innerWidth >= 700 && innerWidth <= 1100 && innerHeight > innerWidth * 1.15;
  const phone = () => (innerWidth < 700 && innerHeight >= 500) || tabUp();
  // Which pill the screen takes (paintChrome): a phone's, an upright tablet's (with back and next) or a wide screen's.
  const pillKind = () => (phone() ? (tabUp() ? 'tab' : 'phone') : 'wide');
  // ── The data card slides out of view and back ──
  // Drag or swipe it away (up on a phone, to the right on a tablet; to the left when it sits under the words) and a sliver
  // stays at the edge: a tap or a drag on the sliver brings it back. It follows the finger, eases to rest, and stays put from
  // slide to slide until brought back. (Driven from script, frame by frame: the card is frosted glass.)
  const GRIP = 34;
  // On a laptop or tablet the words sit on a floating card like the data card (false: the full-height glass panel at the left edge).
  // (A phone, upright or sideways, keeps its words' panel either way.)
  const TEXT_CARD = true;
  const dock = { lvl: 0, to: 0, raf: 0 };
  const dockVec = () => {
    const d = ui.data;
    if (phone()) return [0, GRIP - (d.offsetTop + d.offsetHeight)];
    if (d.classList.contains('under') || d.classList.contains('col')) return [GRIP - (d.offsetLeft + d.offsetWidth), 0];
    return [wrap.clientWidth - GRIP - d.offsetLeft, 0];
  };
  const dockPaint = () => {
    if (!ui) return;
    const [x, y] = dockVec();
    ui.data.style.translate = dock.lvl ? `${(x * dock.lvl).toFixed(1)}px ${(y * dock.lvl).toFixed(1)}px` : '';
    ui.data.classList.toggle('docked', dock.to === 1);
  };
  function dockTo(to, ms = 380) {
    cancelFrame(dock.raf);
    dock.to = to;
    if (reduce.matches) ms = 0;
    const from = dock.lvl, t0 = performance.now();
    const step = (now) => {
      const u = ms ? clamp((now - t0) / ms, 0, 1) : 1;
      dock.lvl = from + (to - from) * ease(u);
      dockPaint();
      if (u < 1) dock.raf = nextFrame(step);
    };
    dock.raf = nextFrame(step);
    layout();   // (the figure frames itself for where the card is going)
    clearTimeout(dock.fit); dock.fit = setTimeout(() => ui && onResize(), 60);
  }
  // The cards never scroll: when a card's contents are taller or wider than the card, their zoom (--pz-fit) drops until they fit.
  // The height is summed from the children's own boxes (a slide-up does not change a box's height), never read from
  // scrollHeight: WebKit keeps an entry shift's overflow there after the shift has eased away, so the words fitted
  // once at their size and then, on the next layout, shrank. (So a card is judged by where its contents come to rest.)
  const RAIL = '.pz:not(.stack):not(.low) .pz-data.pz-beside';   // (styles/app.css: the tiles stacked beside the instrument)
  function overflowOf(el) {
    const cs = getComputedStyle(el), z = el.offsetHeight ? el.getBoundingClientRect().height / el.offsetHeight : 1;
    let used = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0), n = 0;
    // (An instrument with its tiles beside it shares one row with them: the row is counted once, at its taller side.)
    // (Only while a tool or the plot shows beside the tiles: a card too short for its plot shows the strip in a row of its own,
    // and the tiles then stand in their row alone, counted like any part; skipped, the card read as fitting with its strip below its end.)
    const rail = el.matches(RAIL), pair = rail && [...el.querySelectorAll(':scope > :is(.pz-tool, .pz-ladder)')].some((c) => getComputedStyle(c).display !== 'none'), side = pair && el.querySelector(':scope > .pz-tiles');
    for (const c of el.children) {
      if (c === side) continue;
      const s = getComputedStyle(c);
      if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue;
      if (s.maxHeight === '0px') continue;   // (a folded part, a phone's closed tool: its hidden contents are not overflow)
      const cz = parseFloat(s.zoom) || 1;
      // (A part with a height cap clips by design, and mid-fold its clipped contents are not overflow either: counting them
      // shrank the card while a phone's tool folded, and the shrunk fit then stuck.)
      // (A line's glyphs or a pinned button reaching a pixel or two past its part is not overflow: counted, it shrank every
      // phone instrument card by the fit loop's full eight steps, its words to 0.86.)
      // (A card's header grows with its words; only its Show chip's tap area reaches past it, and that is no overflow: counted,
      // it shrank a phone's folded data card to half, its chip to 19 px.)
      const clip = s.maxHeight !== 'none' || c.classList.contains('pz-dh') ? 0 : Math.max(0, c.scrollHeight - c.clientHeight - 3);
      used += Math.max(c.getBoundingClientRect().height, side && (c.classList.contains('pz-tool') || c.classList.contains('pz-ladder')) ? side.getBoundingClientRect().height : 0) / z + ((parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0) + clip) * cz;
      n++;
    }
    used += (parseFloat(cs.rowGap) || 0) * Math.max(0, n - 1);
    return { v: used - el.clientHeight, h: el.scrollWidth - el.clientWidth };
  }
  // What a card's fit depends on: its box, its words (digits alike, so a number that eases fits as before) and which parts show.
  // A card whose signature is unchanged keeps its fit without being measured again (measuring forces layouts mid-animation).
  // (A card holding the quick check grows as its answers ease open and shut; it was fitted with every answer open, so its own
  // height is left out (the window's stands in): refitting mid-ease cut the easing short and jolted the words' size.)
  const fitSig = (el) => `${el.clientWidth}x${el.querySelector('.pz-check') ? `q${innerWidth}x${innerHeight}` : el.clientHeight}|${el.className}|${document.documentElement.style.cssText}|${el.style.getPropertyValue('--pz-reach')},${el.style.getPropertyValue('--pz-fkrow')}|${[...el.children].map((c) => (c.hidden ? 0 : c.className + (getComputedStyle(c).maxHeight !== 'none' ? ':' + c.offsetHeight : ''))).join()}|${el.textContent.replace(/\d/g, '0')}`;
  const fitDone = new WeakMap();
  // A narrow summary table's column heads: 11 px, or as large as each column fits (down to 8), one size for the row.
  // (Only the phone and upright tablet layout reads --th-fs.)
  const headFits = (th) => { const b = th.getBoundingClientRect(), g = document.createRange(); g.selectNodeContents(th); return [...g.getClientRects()].every((q) => !q.width || (q.left >= b.left - 0.5 && q.right <= b.right + 0.5)); };
  function fitHeadRow(tr) {
    const ths = [...tr.querySelectorAll('th.num')];
    if (!ths.length || !tr.getBoundingClientRect().width) return;
    for (let fs = 11; fs >= 8; fs -= 0.5) { tr.style.setProperty('--th-fs', `${fs}px`); if (ths.every(headFits)) break; }
  }
  // (Fitted again when the row's width settles or the web fonts arrive: a fit made mid-layout or in a fallback font would stay too small.)
  let headRO = null;
  function fitHeads(el) {
    if (!headRO) {
      headRO = new ResizeObserver((es) => { for (const e of es) fitHeadRow(e.target); });
      document.fonts?.ready.then(() => document.querySelectorAll('.pz-table thead tr').forEach(fitHeadRow));
    }
    for (const tr of el.querySelectorAll('.pz-table thead tr')) { headRO.observe(tr); fitHeadRow(tr); }
  }
  // An equation never runs past its card: one wider than its box is set smaller (--eq-k, the share of its size that fits).
  // (Measured at the card's final zoom; the math is a block of its own, so its box is the room the card gives it.)
  function fitEquations(el) {
    for (const box of el.querySelectorAll('.pz-eq')) {
      box.style.removeProperty('--eq-k');
      let k = 1;
      for (let n = 0; n < 4; n++) {
        const w = box.clientWidth, over = box.scrollWidth - w;
        if (!w || over <= 0.5) break;
        k = Math.max(0.4, k * (w / (w + over)) * 0.99);
        box.style.setProperty('--eq-k', k.toFixed(3));
      }
    }
  }
  // (An equation typeset before the math font arrives is wider or narrower than it ends up: fitted again once the fonts are in.)
  document.fonts?.ready.then(() => { for (const c of [ui?.text, ui?.data, ui?.panel]) if (c && !c.hidden) { fitEquations(c); } });
  function fitCards(...els) {
    for (const el of els) {
      if (!el || el.hidden || 'folding' in el.dataset) continue;   // (a part mid-fold: the card keeps the fit it will rest with)
      const sig = fitSig(el);
      if (fitDone.get(el) === sig) continue;
      const was = parseFloat(el.style.getPropertyValue('--pz-fit')) || 1;
      el.style.removeProperty('--pz-fit'); el.style.removeProperty('--pz-z');
      // (A tablet's narrow data card: its own grid changes, which a container query on the card cannot do.)
      if (el.classList.contains('pz-data')) el.classList.toggle('pz-narrow', el.offsetWidth > 0 && el.offsetWidth < 420);
      // (A tile's name in full when it fits on one line in its tile, else its short form: Liver flow, Protein ...)
      for (const k of el.querySelectorAll('.pz-tiles .pzt-k[data-s]')) {
        k.classList.remove('short');
        const t = k.parentElement, cs = getComputedStyle(t), room = t.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (room > 0 && k.scrollWidth > room + 0.5) k.classList.add('short');
      }
      // (A scale bar's cut-off numbers stay inside the bar, and one within 8 px of the number before it is left out: sweep batch 03,
      // 0.1 and 1.5 sat 6 px apart and read as one.)
      for (const bar of el.querySelectorAll('.pz-tiles .pzt-bar')) {
        const B = bar.getBoundingClientRect();
        let end = -Infinity;
        for (const l of bar.querySelectorAll('.pzb-l')) {
          l.classList.remove('lo', 'hi', 'off');
          let r = l.getBoundingClientRect();
          if (!r.width) continue;
          if (r.left < B.left) { l.classList.add('lo'); r = l.getBoundingClientRect(); } else if (r.right > B.right) { l.classList.add('hi'); r = l.getBoundingClientRect(); }
          if (r.left < end + 8) l.classList.add('off'); else end = r.right;
        }
      }
      fitHeads(el);
      // (A quick check is fitted with every answer open: its words keep one size however many are revealed.)
      const all = el.querySelector('.pz-check'); all?.classList.add('pzc-all', 'pzc-still');
      // (A phone's words never fit below 12 px: the card's height cap leaves them that room, phoneTextCap.)
      const ln = el === ui.text && phone() ? el.querySelector('.pz-line, p') : null, lb = ln ? parseFloat(getComputedStyle(ln).fontSize) : 0;
      const kMin = lb > 12 ? Math.ceil(12 / lb * 1000) / 1000 : 0.5;
      let k = 1, over = 1;   // (over: the largest fit tried that still overflowed)
      const fits = () => { const o = overflowOf(el); return o.v <= 1 && o.h <= 1 ? null : o; };
      for (let n = 0; n < 8 && k > kMin; n++) {
        const o = fits();
        if (!o) break;
        over = k;
        k = Math.max(kMin, k * Math.min(0.97, (el.clientHeight / (el.clientHeight + Math.max(o.v, 0))) ** 0.9, (el.clientWidth / (el.clientWidth + Math.max(o.h, 0))) ** 0.9));
        el.style.setProperty('--pz-fit', k.toFixed(3));
      }
      // (The steps above scale by how far the card overflows, but smaller words wrap into fewer lines, so a step overshoots:
      // a phone's words that fit at 0.62 came in at 0.5, under 12 px. Once a fit fits, the largest that still fits is found
      // between it and the last that did not.)
      if (k < over && !fits()) for (let n = 0; n < 6 && over - k > 0.005; n++) {
        const m = (k + over) / 2;
        el.style.setProperty('--pz-fit', m.toFixed(3));
        if (fits()) over = m; else k = m;
      }
      if (k < 1) el.style.setProperty('--pz-fit', k.toFixed(3));
      // (A fit within a hair of the last one keeps the last one, when the card still fits with it: a phone's words had flipped
      // between 0.850 and 0.851 with every pass, moving the card a pixel and restyling the whole page about twice a second.)
      if (was !== k && Math.abs(was - k) < 0.01) {
        if (was < 1) el.style.setProperty('--pz-fit', was.toFixed(3)); else el.style.removeProperty('--pz-fit');
        const o = overflowOf(el);
        if (o.v > 1 || o.h > 1) { if (k < 1) el.style.setProperty('--pz-fit', k.toFixed(3)); else el.style.removeProperty('--pz-fit'); }
      }
      // (Parts whose words keep their size (styles/app.css: zoom var(--pz-z)) let the fit shorten only their pictures; when even
      // the shortest pictures leave the card too full, a large text setting, the words then zoom down too, to half at most.)
      // (Never past the 12 px floor: the card's small size, --pz-sm, zoomed, stays at least 11.5 px.)
      const sm = (() => { const pr = h('span', { style: 'position:absolute;visibility:hidden;font-size:var(--pz-sm, 12px)' }); el.append(pr); const v = parseFloat(getComputedStyle(pr).fontSize) || 12; pr.remove(); return v; })();
      const zMin = Math.max(0.5, Math.min(1, 11.5 / sm));
      for (let n = 0, z = 1; n < 8 && z > zMin; n++) {
        const o = overflowOf(el);
        if (o.v <= 1 && o.h <= 1) break;
        z = Math.max(zMin, z * Math.min(0.97, (el.clientHeight / (el.clientHeight + Math.max(o.v, 0))) ** 0.9, (el.clientWidth / (el.clientWidth + Math.max(o.h, 0))) ** 0.9));
        el.style.setProperty('--pz-z', z.toFixed(3));
      }
      fitEquations(el);
      // (Closed again with no transition, so the answers start hidden and the card rests at its closed height.)
      if (all) { all.classList.remove('pzc-all'); void all.offsetHeight; all.classList.remove('pzc-still'); }
      fitDone.set(el, fitSig(el));   // (as it rests once fitted: a folding part's height is part of it)
    }
  }
  // A card whose contents grow after the layout (a time-lapse, the numbers settling) is fitted again.
  let textLock = null, ladderFold = null;
  let fitRO = null, fitRaf = 0, clearRO = null, clearT = 0, paneRaf = 0, fitKids = [], clearFor = null;
  const fitWatch = () => {
    fitRO ||= new ResizeObserver(() => {
      cancelFrame(fitRaf);
      fitRaf = nextFrame(() => { if (ui && [ui.text, ui.data, ui.panel].some((el) => !el.hidden && fitDone.get(el) !== fitSig(el) && (el.style.getPropertyValue('--pz-fit') || (({ v, h }) => v > 1 || h > 1)(overflowOf(el))))) layout(); });   // (a shrunk card is fitted again when it changes, so it can grow back)
    });
    // (Watched again only when the cards' children changed: observing a box reports it at once, so re-observing on every pass
    // ran the layout again every frame on a slide sitting still, Circuit 7 on an iPhone some four times a second.)
    const kids = [ui.text, ui.data, ui.panel].flatMap((el) => [...el.children]);
    if (kids.length !== fitKids.length || kids.some((c, i) => c !== fitKids[i])) { fitRO.disconnect(); for (const c of kids) fitRO.observe(c); fitKids = kids; }
    // A slide that keeps its figure clear of the cards frames it again as the cards settle to their size (a chart arriving, a line wrapping).
    const again = () => { if (!ui) return; if (!shown || 'folding' in ui.data.dataset) { clearT = setTimeout(again, 150); return; }   // (a slide still coming in: once it is in; a card still folding or pulled: once it rests, so the figure and its labels hold still under the finger)
      if (cardSig() !== framedSig) reframe(400); };   // (only when the cards really changed: the camera framed them once; any slide, so a card that grew never covers its box)
    const soon = () => { clearTimeout(clearT); clearT = setTimeout(again, 120); };
    // (The words' glass pane and the figure's insets follow a card that grows after the layout, a chart arriving under the words.)
    clearRO ||= new ResizeObserver(() => { cancelFrame(paneRaf); paneRaf = nextFrame(() => ui && layout()); soon(); });
    if (clearFor !== ui) { clearRO.disconnect(); clearRO.observe(ui.data); clearRO.observe(ui.text); clearFor = ui; }
    ui.data.ontransitionend = ui.text.ontransitionend = soon;   // (a card slides into place: its edge is where it ends, not where it was measured)
  };
  function layout() {
    if (!ui) return;
    // Under interface zoom the page is scaled by k: rects are screen px, inline sizes are the page's own (screen / k).
    // The --pz-* insets stay in screen px, the figure's own units (the stage view undoes the zoom).
    const p = phone(), wr = wrap.getBoundingClientRect(), W = wr.width, H = wr.height, k = wr.width / (wrap.clientWidth || wr.width) || 1;
    ui.root.classList.toggle('stack', p); ui.shade.classList.toggle('stack', p);
    ui.root.classList.toggle('tab', p && tabUp()); ui.shade.classList.toggle('tab', p && tabUp());
    const cardOn = TEXT_CARD && !p && !(W > H && H <= 500);   // (a phone held sideways keeps its panel too)
    ui.root.classList.toggle('pz-card', cardOn); ui.shade.classList.toggle('pz-card', cardOn);
    ui.root.classList.toggle('low', !p && W > H && H <= 500);   // (a phone held sideways: its instruments fold behind Show)
    const off = (el) => el.hidden || (el === ui.data ? 'gone' in el.dataset : el.classList.contains('pz-hide'));   // (a card only easing out and back in for the next slide still counts, where it rests: the camera frames once)
    const r = (el) => (off(el) ? null : restBox(el));
    // The words' sizes settle once per slide, before its cards enter: a later pass (a reading ticking, the data card growing)
    // keeps them, so the teaching card's text never changes size while it is in view. (A new text size in Settings is a new layout:
    // kept, a card folded at 200% stayed folded back at 100%.)
    const lockKey = shown ? `${shown.gen}:${shown.i}:${W.toFixed(0)}x${H.toFixed(0)}:${stage.labelScale()}` : null, lock = lockKey && textLock?.key === lockKey ? textLock : null;
    // (A ladder's fold holds for the slide being drawn, from its first measure: keyed by the slide wanted, not the one shown, so
    // the fold found while its cards come in is kept once it shows. Keyed by the slide shown, the card unfolded for a moment
    // as it came in at 200%, then folded again.)
    const foldKey = `${gen}:${want}:${W.toFixed(0)}x${H.toFixed(0)}:${stage.labelScale()}`;
    ui.text.style.removeProperty('--pz-tk'); ui.text.style.removeProperty('--pz-bk');
    ui.text.style.maxHeight = '';   // (the last pass's cap would shrink the words to a room they no longer have)
    // (A phone's words keep clear of the pill and the colour key first: the room they leave (--pz-reach, --pz-fkrow) is part
    // of the fit. Placed only after it, the words were fitted to the last slide's key and kept that fit: Circulation slide 2
    // on an iPhone came in at 0.814 and took 0.847 on the next refit, or the other way round.)
    if (phone()) placeBar();
    // A phone keeps a fixed share of its height for the figure between the data card and the words (FIG_MIN), so the readings a
    // slide teaches always have room to show: the words' card is capped to what is left (their fit then sets them a little
    // smaller), decided once per slide and size, so it never changes while the slide is in view. (Capped only at 62 % before:
    // with a tall data card, a 667 px iPhone kept 24 to 70 px of figure on a dozen slides and Circuit 2 hid its R liver.)
    // (Before the words are measured for the phone's cap: measured with the full names on two rows, the card kept 12 px it no longer needed.)
    abShort(ui.text, p || ui.root.classList.contains('low'));   // (a phone, upright or on its side; a wider card may take two rows of full names)
    const phoneCap = p ? phoneTextCap(lockKey, H, k) : null;
    if (phoneCap != null) ui.text.style.maxHeight = `${phoneCap.toFixed(1)}px`;
    fitCards(ui.text);
    let t = r(ui.text);
    const sl = ui.shade.offsetLeft * k, pad = cardOn && t ? t.left - wr.left - sl : 0, dd = ui.data, ts = ui.text.style;
    // On a laptop or tablet the data card always stacks under the words' card, at its width, a gap below it (0.6 of the margin),
    // above the controls; what does not fit is made smaller in fixed steps, never moved to the top right. A card in view that
    // changes place fades out, moves while unseen and fades back in.
    let below = false, gap = 0, cw = 0, foot = H, keepH = 0;   // (keepH: the room a ladder folded behind Show keeps, screen px)
    const top0 = cardOn && t ? sl : 0;   // (the cards' top: one margin from the top, as from the side)
    if (cardOn && t && !off(dd)) {
      gap = Math.round(0.6 * sl); cw = t.right - wr.left + pad - sl;
      // (Folding the instrument behind Show is the last step, below: each new measure starts unfolded. It snaps while the card is
      // measured, so the measure sees where it rests; a tap on Show or Hide then eases it.)
      // (A ladder card with no instrument folds its plot the same way, its tiles keeping the readings, but only once its own fit has
      // failed (ladderFold, below): its plot shrinks with the card where an instrument cannot. Treatment slide 2 at 200 % on a
      // 1440x900 screen left the card 232 px, too short for the plot even at the card's smallest zoom.)
      const canFold = (dd.classList.contains('has-tool') || (!dd.classList.contains('tiles-only') && ladderFold === foldKey)) && !dd.classList.contains('tool-only') && !dd.classList.contains('tool-lead');
      const setFolds = (on) => {
        if (dd.classList.contains('pz-folds') === on) return;   // (unchanged: a pass mid-ease must not cut a Show or Hide short)
        const tl = dd.querySelector(':scope > .pz-tool');
        if (tl) tl.style.transition = 'none';
        dd.classList.toggle('pz-folds', on); dd.classList.toggle('pz-beside', !on && dd.hasAttribute('data-beside'));
        if (tl) { void tl.offsetHeight; tl.style.transition = ''; }
      };
      if (!lock && dd.classList.contains('pz-folds')) setFolds(false);
      const q = ui.bar.hidden || !ui.bar.offsetWidth ? null : ui.bar.getBoundingClientRect();
      foot = q && q.left - wr.left < sl + cw ? q.top - wr.top - gap : H - sl;
      let ch = colHeight(cw / k) * k, dk = 1;
      const slack = dd.classList.contains('col') ? 8 : 0;
      below = top0 + t.height + 2 * pad + gap + ch <= foot + slack;
      // Too tall to stack: the words' card gives way first, only a little: its title steps down (TK, fixed steps, so titles
      // match across a deck; its column never widens: every slide keeps one card width), then the data card's blocks step
      // smaller (DK) with the words a little smaller to match. At the last step the pair stays stacked and the data card's own fit does the rest.
      const put = (tk, bk) => { ui.text.style.setProperty('--pz-tk', tk); ui.text.style.setProperty('--pz-bk', bk); t = r(ui.text); return top0 + t.height + 2 * pad + gap + ch <= foot; };   // (no slack once shrunk: the data card is never squeezed)
      const title = (bk = 1) => { for (const tk of TK) if (put(tk, bk)) return true; return false; };
      // (A ladder folded behind Show keeps room under the words for its opened strip: the words step down for that, never the
      // strip squeezed into a header's room. pvt-cirrhosis slide 4 at 200 % on a 1440x900 screen opened into 144 px, its strip zoomed
      // to half and PPG still cut off at the card's foot.)
      // (Folded, its tiles stand where the strip shows once opened: the room is the taller of the two.)
      const foldH = (s) => Math.max(colHeight(cw / k, s), dd.classList.contains('pz-folds') && !dd.classList.contains('has-tool') ? colHeight(cw / k, s, true) : 0);
      const step = (s) => { dk = s; ch = foldH(s) * k; };
      // (The words' text steps down with the blocks, a little less, so the two cards' type never ends far apart.)
      const ladder = () => {
        for (const [s, bk] of DK) { if (below) break; step(s); below = title(bk); }   // (the data card's blocks a step or two smaller, the words a little: no further, or the words would squeeze)
      };
      // The last step when even the smallest blocks leave the pair too tall: the instrument folds behind Show (as on a phone),
      // its tiles in a row under the header at the card's full width, and the steps run again from full size.
      // (Not for a slide whose instrument is its point (tool-lead), nor a card that holds only the instrument.)
      if (lock) {
        for (const [n, v] of lock.vars) if (v) ts.setProperty(n, v);
        if (lock.folds) setFolds(true);
        t = r(ui.text); below = lock.below; dk = lock.dk; cw = t.right - wr.left + pad - sl; ch = foldH(dk) * k;
      } else {
        // (A title a step or two smaller at the one card width, then the steps below; the column never widens.)
        below = title(1);
        if (!below) ladder();
        if (!below && canFold) { setFolds(true); ts.removeProperty('--pz-tk'); ts.removeProperty('--pz-bk'); step(1); below = title(1); if (!below) ladder(); }
        // (Still too tall at the smallest step: the pair stays stacked at the one card width, the title and blocks at their
        // smallest steps; the data card is never moved to the top right, its own fit (fitCards) makes the rest fit its room.)
        if (!below) { put(TK[TK.length - 1], DK[DK.length - 1][1]); below = true; }
      }
      if (dk < 1) dd.style.setProperty('--pz-dk', dk); else dd.style.removeProperty('--pz-dk');
      keepH = ch;
      if (lockKey && !lock) textLock = { key: lockKey, below, dk, folds: dd.classList.contains('pz-folds'), vars: ['--pz-tk', '--pz-bk'].map((n) => [n, ts.getPropertyValue(n)]) };
    } else dd.style.removeProperty('--pz-dk');
    const isCol = dd.classList.contains('col');
    if (below !== isCol) {
      if (colT) below = isCol;   // (a move under way: the card moves once it has faded out)
      // (Not after its fade (swapNow: it moves now, though a slow frame left it not quite faded; it had stayed stacked under the
      // words for good when an iPad was turned upright), nor on a resize or a turn, where everything moves at once: faded there,
      // it showed over the words' card for a moment while the words had already moved.)
      else if (!swapNow && !ui.root.classList.contains('pz-turning') && !dd.hidden && !reduce.matches && +getComputedStyle(dd).opacity > 0.05) {
        below = isCol;
        if (!dd.classList.contains('pz-hide')) {
          dd.classList.add('pz-hide'); dd.dataset.colswap = '';
          colT = setTimeout(() => { colT = 0; if (!ui) return; const mine = 'colswap' in ui.data.dataset; delete ui.data.dataset.colswap; swapNow = true; try { layout(); } finally { swapNow = false; } if (mine) ui.data.classList.remove('pz-hide'); }, 340);
        }
      }
    }
    if (below !== isCol) { dd.style.transition = 'none'; dd.classList.toggle('col', below); }
    if (off(dd) || below) delete dd.dataset.safe; else dd.dataset.safe = p ? 'top' : 'right';
    const y = top0 + t?.height + 2 * pad + gap;
    dd.style.left = below ? `${(sl / k).toFixed(1)}px` : '';
    // (One width on every slide: stacked or at the top right, the data card is always the teaching card's width, whatever it holds.)
    dd.style.width = cw ? `${(cw / k).toFixed(1)}px` : '';
    dd.style.maxWidth = cw ? 'none' : '';   // (no per-content cap: tiles, an instrument or a chart never make it narrower)
    dd.style.top = below ? `${(y / k).toFixed(1)}px` : '';
    dd.style.maxHeight = below ? `${((foot - y) / k).toFixed(1)}px` : '';
    // (A phone: the data card ends 8 px short of the teaching card (16 px above the words), however much it holds: an opened instrument had grown over the words.)
    // (And leaves the figure its share: FIG_MIN between the two cards.)
    if (p && t) { const cs = getComputedStyle(dd); let room = Math.floor((t.top - wr.top) / k - (parseFloat(cs.top) || 0) - 16 - 8 - (phoneCap != null && !dd.classList.contains('tool-open') && !('folding' in dd.dataset) ? FIG_MIN(H) / k : 0));
      // (A folded card is its header and Show, at full size: never fitted into less. Squeezed under a tall teaching card,
      // a 320 px iPhone's folded Doppler card was zoomed to half, its title 6 px.)
      if (phoneCap != null && phoneFoldH && dd.classList.contains('pz-folds') && !dd.classList.contains('tool-open')) room = Math.max(room, Math.ceil(phoneFoldH));
      if (room > 0) dd.style.maxHeight = cs.maxHeight === 'none' ? `${room}px` : `min(${cs.maxHeight}, ${room}px)`; }
    // (A wider screen: a data card at the top right ends 8 px above the colour key standing on the nav pill (a phone held sideways had covered it).)
    if (!p && !below && ui.fk.dataset.empty == null && !ui.bar.hidden) {
      const f = ui.fk, was = f.hidden; f.hidden = false; const q = f.getBoundingClientRect(); f.hidden = was;
      const cs = getComputedStyle(dd), room = Math.floor((q.top - wr.top) / k - (parseFloat(cs.top) || 0) - 8);
      if (q.width && room > 0) dd.style.maxHeight = cs.maxHeight === 'none' ? `${room}px` : `min(${cs.maxHeight}, ${room}px)`;
    }
    if (below !== isCol) { void dd.offsetWidth; dd.style.transition = ''; }
    chipRoom(dd);
    fitCards(ui.data, ui.panel);
    // (A ladder card still too full at its smallest zoom: laid out again, folded, for as long as the slide shows at this size.
    // At 100 % text the card always fits by its own zoom, so it never folds there.)
    // (Not while the leaving slide's card is still out, its charts lettered for the old size: only the new card, being fitted unseen
    // (pz-prep) or in view.)
    if (below && ladderFold !== foldKey && slides[want]?.fold !== false && (ui.root.classList.contains('pz-prep') || !dd.classList.contains('pz-hide')) && !dd.classList.contains('has-tool') && !dd.classList.contains('tiles-only') && !dd.classList.contains('tool-only')
      && !dd.classList.contains('tool-lead') && !dd.classList.contains('pz-folds') && (({ v, h }) => v > 1 || h > 1)(overflowOf(dd))) { ladderFold = foldKey; textLock = null; layout(); return; }
    // The stacked pair shorter than the screen is centred top to bottom as one (equal room above and below, never closer than one margin
    // to the top or the controls); a pair that fills the screen stays where it is. Set here, before the cards come in, so nothing moves after.
    let shift = 0;
    if (below && t && !off(dd)) {
      // (A ladder folded behind Show is centred by the room it keeps, the same folded or opened, never by its fitted height: that
      // moved the card, which fitted it again to another height, and an opened strip card at 200 % never came to rest.)
      const stackH = t.height + 2 * pad + gap + (dd.classList.contains('pz-folds') && !dd.classList.contains('has-tool') ? Math.min(keepH, foot - y) : dd.offsetHeight * k);
      shift = Math.max(0, Math.min((H - stackH) / 2 - top0, foot - top0 - stackH));
      if (shift > 0.5) { dd.style.top = `${((y + shift) / k).toFixed(1)}px`; dd.style.maxHeight = `${((foot - y - shift) / k).toFixed(1)}px`; } else shift = 0;
    }
    fitWatch();
    const dv = ui.data.hidden ? [0, 0] : dockVec();
    const d = below ? null : r(ui.data);
    // The words' card is only as tall as the words. With a data card beside or under it, its top is level with the data
    // card's place at the top right and the words start one padding below it; without one, the words stay centred and the card wraps them.
    // (With no data card the card is centred top to bottom, never closer than one margin to either edge.)
    const lvl = cardOn && t ? (d && !below ? d.top - wr.top : off(dd) ? Math.max(sl, (H - t.height - 2 * pad) / 2) : top0 + shift) + pad : null;
    ts.top = lvl != null ? `${(lvl / k).toFixed(1)}px` : ''; ts.bottom = ts.marginBlock = lvl != null ? 'auto' : '';
    if (lvl != null) ts.marginBlock = '0';
    ts.maxHeight = lvl != null ? `${((H - lvl - pad - sl) / k).toFixed(1)}px` : phoneCap != null ? `${phoneCap.toFixed(1)}px` : '';   // (one margin at the bottom too)
    if (t) t = r(ui.text);   // (always: the words may already stand there, and the glass is sized to where they are)
    // The words sit on a frosted glass pane: the figure shows through it blurred, behind a crisp edge with a soft
    // shadow. The figure frames itself just past that shadow, so nothing it frames is hidden.
    // (On a phone the words sit at the bottom, over the Back/Next bar, and the data card at the top: B is the height
    // from the words' top edge down to the bottom of the figure.)
    const L = t ? t.right - wr.left : 0, B = t ? H - ui.text.offsetTop * k : 0;
    // (The words' card: as far past the words on the right as its left edge is before them.)
    const card = cardOn && t ? L + pad - sl : 0;
    ui.shade.style.width = !p && t ? `${(card || L + 36) / k}px` : '';
    ui.shade.style.height = !p && cardOn && t ? `${(t.height + 2 * pad) / k}px` : '';
    // (A phone's glass reaches 16 px above the words, or the deck's tab and 8 px more: the tab never meets the title.)
    const lift = p && t ? Math.max(16, (ui.shade.querySelector('.pz-tabname')?.offsetHeight || 0) + 8) : 16;
    ui.shade.style.top = p && t ? `${ui.text.offsetTop - lift}px` : cardOn && t ? `${(t.top - wr.top - pad) / k}px` : '';
    ui.shade.style.opacity = t ? '1' : '0';
    ui.safe.hidden = !t;
    ui.safe.dataset.safe = p ? 'bottom' : 'left';
    frameL = !p && t ? (card ? sl + card + 24 : L + 48) : 0;
    ui.safe.style.width = p ? '' : `${frameL / k}px`;
    ui.safe.style.height = p ? `${(B + Math.max(34, lift * k + 4)) / k}px` : '';
    const set = (k, v) => app.style.setProperty(k, `${Math.max(0, Math.round(v))}px`);
    set('--pz-l', frameL);
    set('--pz-r', !p && d ? W - (ui.data.offsetLeft + dock.to * dv[0]) * k + 8 : 0);   // (where the card comes to rest: past its entry shift, at its dock)
    set('--pz-t', p && d ? (ui.data.offsetTop + ui.data.offsetHeight + dv[1] * dock.to) * k + 4 : 0);   // (offsets: a card coming in is still shifted by its entry transform)
    set('--pz-b', p && t ? B + 34 : 0);
    if (!dock.drag) dockPaint();
    placeBar();
    dispatchEvent(new Event('pps:occ'));
  }
  // A row of choices is one row: where its full names would wrap (five treatments on a 375 to 430 px iPhone), each button that has
  // one takes its compact label (the full name stays its accessible name and tooltip), never a second row or a smaller size.
  function abShort(root, may) {
    for (const row of root.querySelectorAll('.pz-ab')) {
      const bs = [...row.querySelectorAll('.pz-abb[data-short]')];
      if (!bs.length) continue;
      for (const b of bs) b.textContent = b.dataset.full;
      const tops = () => new Set([...row.querySelectorAll('.pz-abb')].map((b) => Math.round(b.offsetTop))).size;
      if (may && (tops() > 1 || row.scrollWidth > row.clientWidth + 1)) for (const b of bs) b.textContent = b.dataset.short;
    }
    // (A phone on its side: the row of choices at the largest size that holds it on one line, never under 12 px on the screen nor
    // over its own size; the card's fit, which took the four lens buttons to 11 px at 150 %, never sets it.)
    if (!ui.root.classList.contains('low')) return;
    for (const row of root.querySelectorAll(':scope > .pz-ab')) {
      const b = row.querySelector('.pz-abb'), host = row.parentElement;
      if (!b || !host.clientWidth) continue;
      row.style.zoom = '1'; row.style.flexWrap = 'nowrap'; row.style.width = 'max-content'; row.style.maxWidth = 'none';
      const nat = row.getBoundingClientRect().width + 2, cs = getComputedStyle(host), avail = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      row.style.flexWrap = row.style.width = row.style.maxWidth = '';
      const fs = parseFloat(getComputedStyle(b).fontSize) || 12;
      row.style.zoom = String(Math.max(12 / fs, Math.min(1, avail / nat)).toFixed(3));
    }
  }
  // The figure's share of a phone's height (between the data card and the words' glass), and the words' cap that keeps it.
  // Where the figure's share, the data card and the words at 12 px or more cannot all fit, the data card folds to its header
  // behind Show (the button that already folds a phone's instrument): the card takes its folded size at once, never easing in view.
  const FIG_MIN = (H) => Math.round(Math.max(170, 0.3 * H));
  let phoneLock = null, phoneFoldH = 0;   // (phoneFoldH: the folded card's height at full size, css px; 0 when it is not folded)
  function phoneTextCap(key, H, k) {
    const dd = ui.data, ds = dd.style, gone = dd.hidden || 'gone' in dd.dataset;
    const held = key && phoneLock?.key === key ? phoneLock : null;
    // (Also while a what-if slider or a compare button drives the live model (liveOff): its data card changes only its numbers,
    // and re-planned on every live reading that measured a pixel taller, the words' cap stepped and the teaching card shook
    // under the finger on a phone, Sites 4's clot slider. The plan made as the slide came in holds until the next slide.)
    if (held && (held.fold || gone || liveOff)) { dd.classList.toggle('pz-folds', held.fold); dd.classList.toggle('pz-ftight', held.tight); phoneFoldH = held.foldH; return held.cap; }
    phoneFoldH = 0;
    dd.classList.remove('pz-folds', 'pz-ftight');
    const natural = (el, st) => {   // (as it stands unfitted and uncapped)
      const sv = [st.maxHeight, st.getPropertyValue('--pz-fit'), st.getPropertyValue('--pz-z')];
      st.maxHeight = 'none'; st.removeProperty('--pz-fit'); st.removeProperty('--pz-z');
      const v = el.offsetHeight * k;
      st.maxHeight = sv[0]; if (sv[1]) st.setProperty('--pz-fit', sv[1]); if (sv[2]) st.setProperty('--pz-z', sv[2]);
      return v;
    };
    // (Kept while the slide shows, unless its data card grew past what was planned for it, an instrument or chart built after
    // the slide arrived: Doppler 5 on a 320 px iPhone was planned at 148 px and grew to 284, over the figure's share.)
    // (Not for an instrument the reader opened: that grows by choice, over the figure, and closes again.)
    if (held) { if (dd.classList.contains('tool-open') || natural(dd, ds) <= held.data + 1) { dd.classList.remove('pz-folds'); phoneFoldH = 0; return held.cap; } }
    const ts = ui.text.style, was = ts.maxHeight;
    ts.maxHeight = '';
    const css = getComputedStyle(ui.text), own = parseFloat(css.maxHeight) * (css.maxHeight.endsWith('%') ? H / 100 : 1), foot = (parseFloat(css.bottom) || 0) * k;
    ts.maxHeight = was;
    // (The words zoom down to fit (--pz-fit) but never below 12 px: their body size sets how far.)
    const line = ui.text.querySelector('.pz-line, p'), body = line ? parseFloat(getComputedStyle(line).fontSize) : 0;
    // (Measured at that floor, not scaled from the full size: zoomed down, the lines take more words each and the card comes
    // out shorter than its full height times the zoom. Scaled, HVPG 5 on a 667 px iPhone asked 263 px for words that take 230.)
    const floor = body > 12 ? Math.ceil(12 / body * 1000) / 1000 : 1, words = (floor < 1 ? (() => {
      const sv = [ts.maxHeight, ts.getPropertyValue('--pz-fit'), ts.getPropertyValue('--pz-z')];
      ts.maxHeight = 'none'; ts.removeProperty('--pz-z'); ts.setProperty('--pz-fit', String(floor));
      const v = ui.text.offsetHeight * k;
      ts.maxHeight = sv[0]; if (sv[1]) ts.setProperty('--pz-fit', sv[1]); else ts.removeProperty('--pz-fit'); if (sv[2]) ts.setProperty('--pz-z', sv[2]);
      return v;
    })() : natural(ui.text, ts)) + 4;
    // (The words' glass starts 16 px above them, the data card ends 8 px above that and stands its own top (8 px) from the
    // screen's top: the same room the layout gives it below.) The data card shows at full size or folds: never shrunk to fit.
    // It folds where it and the words at 12 px cannot both fit beside the figure's share, or where it is taller than its own
    // cap (styles/app.css max-height). (Capped at 45 % of the shared room before, its own fit doing the rest: Treatment 2 on a
    // 667 px iPhone came in at half size, and the 8 px of its top left out shrank hvpg 5's card to 78 % on a 844 px one.)
    const dcs = getComputedStyle(dd), dtop = (parseFloat(dcs.top) || 0) * k;
    const dmax = (() => { const sv = ds.maxHeight; ds.maxHeight = ''; const m = getComputedStyle(dd).maxHeight; ds.maxHeight = sv; return m === 'none' ? Infinity : m.endsWith('%') ? parseFloat(m) * H / 100 : parseFloat(m) * k; })();
    const both = H - foot - 16 - 8 - dtop - FIG_MIN(H);
    let data = gone ? 0 : natural(dd, ds), fold = false, tightOn = false;
    if (!gone && (both - data < words || data > dmax + 0.5) && dd.querySelector(':scope > :not(.pz-dh):not(.pz-grip)')) {
      // (Measured shut, whatever Show left: opened as the slide was still arriving, the card measured its full height here, did not
      // fold, and capped the words to the room left; lobule slide 8 at 200 % on a 390 px iPhone then ran its still column out of its card.)
      const open = dd.classList.contains('tool-open');
      dd.classList.add('pz-folds'); dd.classList.remove('tool-open');
      const shut = natural(dd, ds);
      if (open) dd.classList.add('tool-open');
      if (shut < data - 1) {
        data = shut; fold = true; phoneFoldH = shut / k;
        // (Still short of the figure's share: the folded card takes its compact form, 6 px above and below its header in place
        // of 10, the header and its Show chip at full size.)
        if (both - data < words) { dd.classList.add('pz-ftight'); const tight = natural(dd, ds); data = tight; phoneFoldH = tight / k; tightOn = true; }
        // (Each such slide comes in folded, whatever an earlier slide's Show left open.)
        const b = dd.querySelector('.pz-dh > .pz-fold');
        if (dd.dataset.openFor !== String(want)) { dd.classList.remove('tool-open'); if (b) { b.textContent = 'Show'; b.setAttribute('aria-expanded', 'false'); } }
      } else dd.classList.remove('pz-folds');
    }
    // (Words at 12 px win over the figure's share and the 62 % cap when nothing else gives; they never reach the data card.)
    const cap = Math.max(120, Math.min(H - foot - 16 - 8 - dtop - data, Math.max(Math.min(Number.isFinite(own) ? own : 0.62 * H, both - data), words))) / k;
    if (key) phoneLock = { key, cap, fold, tight: tightOn, foldH: phoneFoldH, data };
    return cap;
  }
  // The free area: the open rectangles of the figure the words, the data card (where it comes to rest) and the controls leave,
  // in wrap px. The camera centres a slide's box in whichever of them shows it largest (stage boxVT).
  let frameL = 0, colT = 0, swapNow = false;
  // The stacked data card's fixed block sizes, largest first, and the smallest the words' title goes.
  const DK = [[0.9, 0.95], [0.8, 0.9], [0.7, 0.88], [0.6, 0.88]], TK = [1, 0.95, 0.9, 0.85, 0.8];   // (the data card's block size with the words' text size; the title's steps)
  // The data card's height at width w (page px) under the words: as it would stand there, at full size (unfitted).
  // A header's Show or Hide keeps its title clear by the chip's own width, not a fixed 64 or 66 px: a larger text size grows the chip,
  // and a title once ran under it (DOPPLER, TH at 200 % on a 390 px phone). Its words' width goes to the stylesheet in ems of the
  // header's own type (--pz-chip-em, the wider of Show and Hide), so the room never changes with the card's zoom or a tap.
  const chipCanvas = document.createElement('canvas').getContext('2d');
  function chipRoom(dd) {
    const f = dd.querySelector('.pz-dh > .pz-fold');
    if (!f || !chipCanvas) return;
    const cs = getComputedStyle(f), fs = parseFloat(cs.fontSize) || 0, ls = parseFloat(cs.letterSpacing) || 0;
    if (!fs) return;
    chipCanvas.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
    const w = Math.max(...['Show', 'Hide'].map((t) => { const x = cs.textTransform === 'uppercase' ? t.toUpperCase() : t; return chipCanvas.measureText(x).width + ls * x.length; }));
    dd.style.setProperty('--pz-chip-em', (w / fs).toFixed(3));
  }
  // (open: a ladder folded behind Show, measured as it stands opened, so the room kept under the words holds it when Show is tapped.)
  function colHeight(w, dk = 1, open = false) {
    // (Unfitted, its zoom (--pz-z) cleared with the fit: kept, the card measured at the last fit's zoom, so the words' step depended on
    // what was fitted before (a live text-size change took a larger title than a fresh load at that size).)
    const d = ui.data, ds = d.style, sv = [d.className, ds.width, ds.maxHeight, ds.getPropertyValue('--pz-fit'), ds.getPropertyValue('--pz-dk'), ds.getPropertyValue('--pz-z')];
    d.classList.add('col'); if (open) d.classList.add('tool-open'); if (dk < 1) ds.setProperty('--pz-dk', dk); else ds.removeProperty('--pz-dk'); ds.width = `${w}px`; ds.maxHeight = 'none'; ds.removeProperty('--pz-fit'); ds.removeProperty('--pz-z');
    const hh = d.offsetHeight;
    d.className = sv[0]; ds.width = sv[1]; ds.maxHeight = sv[2]; if (sv[3]) ds.setProperty('--pz-fit', sv[3]); if (sv[4]) ds.setProperty('--pz-dk', sv[4]); else ds.removeProperty('--pz-dk'); if (sv[5]) ds.setProperty('--pz-z', sv[5]);
    return hh;
  }
  function freeRects() {
    if (!ui || phone()) return null;
    const wr = wrap.getBoundingClientRect(), W = wr.width, H = wr.height, k = W / (wrap.clientWidth || W) || 1, G = 12;
    const obs = [], d = ui.data;
    let dk = null, pill = null;
    if (!d.hidden && !('gone' in d.dataset) && !d.classList.contains('under') && !d.classList.contains('col')) {
      const x = d.offsetLeft + dock.to * dockVec()[0];
      obs.push(dk = { l: x * k, t: d.offsetTop * k, r: (x + d.offsetWidth) * k, b: (d.offsetTop + d.offsetHeight) * k });
    }
    if (!ui.bar.hidden && ui.bar.offsetWidth) { const q = ui.bar.getBoundingClientRect(); obs.push(pill = { l: q.left - wr.left, t: q.top - wr.top, r: q.right - wr.left, b: q.bottom - wr.top }); }
    // (The colour key stands on the pill: the two are one obstacle. Measured where it will show, even before it fades in.)
    if (pill && ui.fk.dataset.empty == null) {
      const f = ui.fk, was = f.hidden; f.hidden = false; const q = f.getBoundingClientRect(); f.hidden = was;
      if (q.width) { pill.t = Math.min(pill.t, q.top - wr.top); pill.l = Math.min(pill.l, q.left - wr.left); }
    }
    // Each obstacle splits a rectangle it overlaps into the open parts left, right, above and below it.
    const split = (q, o) => (o.r <= q.l || o.l >= q.r || o.b <= q.t || o.t >= q.b ? [q]
      : [{ ...q, r: o.l - G }, { ...q, l: o.r + G }, { ...q, b: o.t - G }, { ...q, t: o.b + G }].filter((x) => x.r - x.l > 0 && x.b - x.t > 0));
    // First choice: the space between the words' card and the data card, full height (clear of the controls), so a subject
    // sits centred between the cards rather than in the strip under a short corner card.
    const ok = (q) => q.r - q.l >= 200 && q.b - q.t >= 150;
    let mid = [{ l: frameL, t: 0, r: dk ? dk.l - G : W, b: H }];
    if (pill) mid = mid.flatMap((q) => split(q, pill));
    // (Marked pref: the camera uses the rest only for a box too big for these at its widest zoom.)
    mid = mid.filter(ok).map((q) => ({ ...q, pref: true }));
    let out = [{ l: frameL, t: 0, r: W, b: H }];
    for (const o of obs) out = out.flatMap((q) => split(q, o));
    return [...mid, ...out.filter(ok)];
  }
  stage.setFreeArea(freeRects);
  const onFonts = () => { if (ui) layout(); };
  // Where the cards stand, rounded: the camera framed this space last; the same space needs no second glide.
  let framedSig = '';
  const cardSig = () => (ui ? [ui.text, ui.data].map((el) => (el.hidden ? '-' : ((r) => [r.left, r.top, r.width, r.height].map((v) => Math.round(v / 4)).join())(el.getBoundingClientRect()))).join('|') : '');
  function reframe(ms) {
    const s = slides[shown.i];
    fitAround(s, s.visual ? s.cam : s.cam || 'fit', ms);
  }
  // The camera eases to fit a slide's framing into the space its cards leave (the lobule refits itself on pps:occ).
  function fitAround(s, cam, ms) {
    framedSig = cardSig();
    if (cath.on && cath.cam) stage.cathFocus(cath.cam, ms, { both: true });
    else if (cam && !LOBULE_CAM.test(cam) && !store.get().lobule) { if (cam === 'fit') stage.fitSlow(ms); else stage.frameBox(camBox(cam, s), ms, s.kMax || 3.2, !!s.clear); }
  }
  // (A resize or a turn asks every ladder again whether its plot fits: strips drop, the plots re-measure and take the strip
  // back only where they still don't fit, with a short fade rather than a jump.)
  let restrip = 0;
  const reStrip = () => {
    const was = [...document.querySelectorAll('.pz-data.strip, .pz-cell.strip')];
    document.documentElement.classList.add('lad-swap');
    for (const x of was) x.classList.remove('strip');
    fitted.forEach(fitNow);
    setTimeout(() => document.documentElement.classList.remove('lad-swap'), 600);
  };
  // A title of three or more lines on a wider screen is set a size smaller (long). Judged at the title's full size; again after a
  // resize or a turn, so a turned iPad sets its titles as a fresh load at that size does (turned sideways it had kept them big,
  // and the data card under them shorter).
  function markLong(text, asSet = false) {
    const ttl = text.querySelector('.pz-h');
    if (!ttl) return;
    ttl.classList.remove('long');
    if (phone()) return;
    // (asSet: a slide just shown is judged with the words' step as it stands, as it always was)
    const tk = asSet ? '' : text.style.getPropertyValue('--pz-tk'); if (tk) text.style.removeProperty('--pz-tk');
    const lh = parseFloat(getComputedStyle(ttl).lineHeight) || ttl.offsetHeight;
    if (ttl.offsetHeight > lh * 2.4) ttl.classList.add('long');
    if (tk) text.style.setProperty('--pz-tk', tk);
  }
  // (The cards follow at once; the camera frames once, when the size has held for 250 ms: a turn fires several resizes, and a
  // glide after each moved the camera two or three times.)
  let reframeT = 0, turnT = 0;
  const onResize = (e) => {
    if (!ui) return;
    clearTimeout(restrip); restrip = setTimeout(reStrip, 250);
    if (ui.data.hasAttribute('data-sin-tiles')) ui.data.classList.toggle('under', !shortSide.matches && phone());   // (turned on or off its side)
    // (For 0.8 s after a resize or a turn the data card takes each new place at once, with no fade or glide: the words' card
    // re-fits in steps as the size settles, and a data card easing after it passed over the words.)
    const turn = e?.type === 'resize';
    if (turn) { ui.root.classList.add('pz-turning'); clearTimeout(turnT); turnT = setTimeout(() => ui?.root.classList.remove('pz-turning'), 800); }
    if (ui.bar.dataset.kind !== pillKind()) paintChrome();   // (turned between a phone's, a tablet's and a wide screen's pill: its buttons change before the words are fitted around it)
    layout();
    // (Judged once the cards have their new layout's classes, then laid out again if that changed the title.)
    if (turn && !ui.text.hidden) { const was = !!ui.text.querySelector('.pz-h.long'); markLong(ui.text); if (was !== !!ui.text.querySelector('.pz-h.long')) { textLock = null; layout(); } }
    setLabels();
    if (!shown) return;
    // (Another caller (a card's dock moving, its fit done) frames at once, unless a resize is still settling: then that one look covers both.)
    if (!turn && !reframeT) { reframe(400); return; }
    clearTimeout(reframeT);
    reframeT = setTimeout(() => { reframeT = 0; if (ui && shown) reframe(400); }, 250);
  };
  // Projector-size labels on the figure, for the screen it is on (2 at 1080 lines).
  function setLabels() {
    const k = (phone() ? 1.15 : clamp(Math.min(innerHeight / 540, innerWidth / 960), 1.25, 2.4));
    stage.setProjection(k);
    { const lv = String(Math.min(k, 2.2) * stage.labelScale()); document.documentElement.style.setProperty('--label-k', lv); document.documentElement.style.setProperty('--label-scale', String(Math.max(1, Math.min(k, 2.2) / 1.5) * stage.labelScale())); }   // (font roles: the projector's size over Explore's, never below it)
    labelling = true; dispatchEvent(new Event('pps:labelscale')); labelling = false;
  }
  // The viewer's own text size (Settings) scales them too: a change there while presenting is re-applied on top.
  let labelling = false;
  // A new text size draws the slide again, as a fresh load at that size does (the words out and back in, laid out from the
  // start, the camera framing around them). Adjusted in place, a card kept what the old size had chosen: a 200% card stayed
  // folded or kept the compact strip at 100%, and a 100% card switched to 200% folded where a fresh load did not.
  // (As when coming back to the slide: a time-lapse shows its end, not playing again.)
  addEventListener('pps:labelscale', () => {
    if (!deck || !ui || labelling) return;
    setLabels();
    if (!shown) return;   // (a slide on its way in lays out at the new size anyway)
    // (Nothing fitted at the old size carries over: each card's fit, the words' steps (a title judged long or not at the old
    // step had kept that size), and each ladder's choice of plot or strip.)
    for (const el of [ui.text, ui.data, ui.panel]) { fitDone.delete(el); for (const n of ['--pz-fit', '--pz-z', '--pz-tk', '--pz-bk', '--pz-dk']) el.style.removeProperty(n); }
    // (The ladder and strip are kept from slide to slide: their lettering and its height, set for the old size, go too, so they
    // are measured from nothing, as on a fresh load. Kept, the 200% card's words took a larger title step than a fresh load's.)
    for (const e of ui.data.querySelectorAll('svg')) { e.style.removeProperty('--lad-fixed'); for (const t of e.querySelectorAll('text[style]')) t.style.removeProperty('font-size'); }
    reFit();
    lastAt = Math.max(lastAt, shown.i + 1); redrawn = ++gen;
    if (!busy) run();
  });

  // ── Chrome: counter, progress, controls ──
  // The controls are a small frosted pill (a phone: count, settings, exit; a wide screen adds back and next) at the screen's lower right, on the words'
  // glass; it never moves. Only the words' last line keeps clear of it (see clearPill); slides change by swiping.
  let pillW = 0;
  // Where an element will rest once the entry or exit animations on it and its ancestors (a slide in or out) have ended: its box
  // now, less the shift those animations give it at this moment. Also how long until the last of them ends.
  function restRect(el) {
    let dx = 0, dy = 0, left = 0;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const run = n.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime));
      if (!run.length) continue;
      for (const a of run) left = Math.max(left, a.effect.getComputedTiming().endTime - (a.currentTime || 0));
      const t = getComputedStyle(n).transform;
      if (!t || t === 'none') continue;
      const m = new DOMMatrixReadOnly(t), z = n.offsetHeight ? n.getBoundingClientRect().height / n.offsetHeight : 1;   // (in screen px: through any zoom)
      dx += m.e * z; dy += m.f * z;
    }
    const r = el.getBoundingClientRect();
    return { top: r.top - dy, right: r.right - dx, height: r.height, width: r.width, left };
  }
  // The pill's width, for the words' last line to keep clear of (--pz-pill-w); then the words keep clear of it (clearPill).
  function placeBar() {
    if (!ui) return;
    if (phone() && ui.bar.offsetWidth && ui.bar.offsetWidth !== pillW) { pillW = ui.bar.offsetWidth; app.style.setProperty('--pz-pill-w', `${pillW}px`); }
    clearPill();
  }
  // The words' last shown block keeps clear of a phone's pill: a line of words (or the station key) ends with a gap the pill's
  // width and as tall as the pill reaches into the words (--pz-reach, measured), on its own line if the last line is too long
  // for it; so the pill only ever meets that last line. A box (buttons, a monitor, a diagram) ends just above the pill instead.
  // Run on every layout (fonts fitted, the screen turned): only a phone shows either.
  function clearPill() {
    const text = ui.text, gap = text.querySelector('.pz-pillgap'), was = text.querySelector('.pz-pillclr');
    let end = null, box = null;
    if (phone() && !text.hidden) {
      const shown = (c) => c.getBoundingClientRect().height > 0, last = [...text.children].filter(shown).at(-1);   // (an svg has no offsetHeight)
      const tail = last;
      // (A colour key docked at the words' bottom-left (figure-key.js) takes a row of its own beside the pill: the words end above it.)
      if (tail?.matches('p, h1, li, .pz-stk') && ui.fk.dataset.empty != null) end = tail; else box = last || null;
      // (Read from the layout boxes where both rest, never from the screen: a card still easing in or out (pz-leave's 18 px
      // slide) read 18 px more reach, and the words were fitted smaller for it, then grew once the card settled.)
      const wr = restRect(ui.root), k = wr.width / (ui.root.clientWidth || wr.width) || 1, bar = ui.bar;
      const reach = bar.offsetParent && bar.offsetParent === text.offsetParent ? text.offsetTop + text.offsetHeight - bar.offsetTop
        : (restRect(text).top + text.offsetHeight * k - bar.getBoundingClientRect().top) / k;
      text.style.setProperty('--pz-reach', `${Math.max(0, Math.ceil(reach) + 3)}px`);
      // A box ends 8 px above the pill on a tablet, measured to the fraction (offsetTop rounds; the rounded reach had left it at 5,
      // sweep 03 #23). A phone's
      // keeps the reach's 3 px: its words are fitted to the last pixel, and 5 more cost them a size step (Right heart 7 at 390
      // went from 0.70 to 0.58 and its What-if slider from 236 to 56 px; sweep 01 review).
      text.style.setProperty('--pz-reach-box', ui.root.classList.contains('tab') ? `${Math.max(0, (restRect(text).top + restRect(text).height - restRect(bar).top) / k + 8).toFixed(2)}px` : `${Math.max(0, Math.ceil(reach) + 3)}px`);
    }
    fitKey();
    if (gap && gap.parentElement !== end) gap.remove();
    if (end && !end.querySelector(':scope > .pz-pillgap')) end.append(h('span', { class: 'pz-pillgap', 'aria-hidden': 'true' }));
    if (was && was !== box) was.classList.remove('pz-pillclr');
    box?.classList.add('pz-pillclr');
  }
  // A phone's docked colour key and the nav pill never overlap. It sits on one line beside the pill when it fits; else on two lines
  // beside it (fk-two, as tall as the pill's row); else on its own row just above the pill's row (fk-up; a 320 px phone), one line,
  // shrunk to the card's width if even that is too narrow. The words end above whatever the key takes (--pz-fkrow).
  function fitKey() {
    const fk = ui.fk, root = ui.root, set = (two, up, wrap = false) => { root.classList.toggle('fk-two', two); root.classList.toggle('fk-up', up); root.classList.toggle('fk-wrap', wrap); };
    const on = phone() && !ui.text.hidden && fk.dataset.empty == null;
    if (!on) { set(false, false); return; }
    const was = fk.hidden; fk.hidden = false; set(false, false);
    const wr = restRect(root), k = wr.width / (root.clientWidth || wr.width) || 1;
    const w = fk.offsetWidth, h1 = fk.offsetHeight, l = parseFloat(getComputedStyle(fk).left) || 21;
    const bar = ui.bar.getBoundingClientRect(), barH = bar.height / k;
    const room = (bar.left - wr.left) / k - l - 8, full = root.clientWidth - 2 * l;
    let row;
    // (Beside the pill on one line, a key taller than the pill's row (a larger text size: its name over its scale) reaches above
    // it: the words end 8 px above the key, not 3 px above the pill (Circulation 3 at 150 %: the buttons sat on the key).)
    if (w <= room) row = Math.max(0, Math.ceil((bar.top - fk.getBoundingClientRect().top) / k + 5));
    else {
      fk.style.setProperty('--pz-fk-room', `${Math.floor(room)}px`); set(true, false);
      const w2 = fk.scrollWidth, h2 = fk.offsetHeight;
      if (w2 <= room + .5 && h2 <= Math.max(barH + 6, h1 * 2.3)) row = Math.max(0, h2 - barH) + 2;
      else {
        // (Wider than the card too: wrapped to its width, at its own size; it had been scaled down, its words under 12 px.)
        if (w > full) fk.style.setProperty('--pz-fk-room', `${Math.floor(full)}px`);
        set(false, true, w > full);
        row = Math.ceil(fk.offsetHeight) + 12;
      }
    }
    fk.hidden = was;
    ui.text.style.setProperty('--pz-fkrow', `${row}px`);
  }
  function paintChrome() {
    if (!ui) return;
    const n = slides.length, i = want;
    ui.prog.style.setProperty('--p', String((i + 1) / n));
    const ph = phone(), skip = lapseOn && lapseLeft > 0, last = i === n - 1 && !skip;
    // The count opens the slide list (G).
    const countBtn = h('button', { class: 'pzb-n', 'aria-label': `Slide ${i + 1} of ${n}: list the slides`, title: 'Slide list (G)', 'aria-expanded': String(!ui.jump.hidden), onclick: () => toggleJump() }, `${i + 1} / ${n}`);
    ui.bar.classList.toggle('phone', ph); ui.bar.classList.toggle('pzb-pill', !ph);
    ui.bar.dataset.kind = pillKind();
    const prevBtn = () => h('button', { class: 'ib', 'aria-label': 'Previous slide', title: 'Previous (←)', disabled: i === 0, onclick: prev }, icon('chev-left'));
    const nextBtn = () => h('button', { class: `ib pzb-next${skip ? ' skipping' : ''}`, 'aria-label': skip ? 'Run the time-lapse to its end' : 'Next slide', title: skip ? 'Skip to the end of the time-lapse (→)' : 'Next (→)', disabled: last, onclick: next }, icon('chev-right'));
    if (ph) {
      // A phone's pill: the count (it opens the slide list), settings, exit. Slides change by swiping. An upright tablet's
      // pill has back and next around the count too, as a wide screen's: an iPad mirrored to a projector is often driven
      // by tapping, and a swipe there competes with the card fold and the figure pan (review U5).
      ui.bar.classList.remove('idle');
      const tab = tabUp();
      ui.bar.replaceChildren(...(tab ? [prevBtn(), countBtn, nextBtn()] : [countBtn]), gear(),
        h('button', { class: 'ib', 'aria-label': 'Exit the presentation', title: 'Exit', onclick: stop }, icon('close')));
      placeBar();
      return;
    }
    // A wide screen's pill, as on a phone at the lower right (Mohammad): back, the count (it opens the slide list), next,
    // settings, exit. (No ask-the-room buttons: he asks the room by voice; full screen is in Settings and on F.)
    ui.bar.replaceChildren(
      prevBtn(),
      countBtn,
      nextBtn(),
      gear(),
      h('button', { class: 'ib', 'aria-label': 'Stop presenting', title: 'Stop (Esc)', onclick: stop }, icon('close')));
    placeBar();
  }
  // Settings while presenting (appearance, text size, interface zoom, full screen): the app's own sheet, opened from the bar.
  const gear = () => (openSettings ? h('button', { class: 'ib', 'aria-label': 'Settings', 'aria-haspopup': 'dialog', title: 'Settings', onclick: (e) => openSettings(e.currentTarget) }, svgIcon('gear')) : null);
  let idleT = 0;
  function wake() {
    if (!ui) return;
    ui.bar.classList.remove('idle');
    clearTimeout(idleT);
    // (The pill never hides, on a phone or a wide screen, as it is small and out of the way.)
  }
  function setContrast(on = !hiCon) {
    hiCon = !!on;
    try { localStorage.setItem(PROJ, hiCon ? '1' : '0'); } catch { /* storage unavailable */ }
    app.classList.toggle('pz-hi', hiCon);
    paintChrome();
  }
  // The panel's width changes under cover: the words fade out, the panel takes its new width (the glass behind eases to it),
  // and the words fade back in. Nothing jumps and nothing is measured mid-way.
  let widthT = 0;
  function setPanelWidth(w) {
    if (!PW_K[w] || w === pzWidth) return;
    pzWidth = w;
    try { localStorage.setItem(PW, w); } catch { /* storage unavailable */ }
    if (!ui) { app.style.setProperty('--pz-wk', String(PW_K[w])); return; }
    const apply = () => { app.style.setProperty('--pz-wk', String(PW_K[pzWidth])); layout(); setLabels(); };
    if (phone() || ui.text.hidden || reduce.matches) { apply(); return; }
    clearTimeout(widthT);
    const had = ui.text.classList.contains('pz-leave');
    ui.text.classList.add('pz-leave');
    widthT = setTimeout(() => { apply(); nextFrame(() => { if (!had) ui?.text.classList.remove('pz-leave'); }); }, 240);
  }
  function toggleBlack(on = !black) { black = on; ui?.black.classList.toggle('on', black); }
  function fullscreen() { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
  addEventListener('pointermove', () => { if (deck) wake(); });
  addEventListener('pointerdown', () => { if (deck) wake(); });

  // ── The slide list (G, or the count): every title, grouped under its kicker; a tap or Enter goes there ──
  function toggleJump(on = ui?.jump.hidden) {
    if (!ui) return;
    const j = ui.jump;
    if (!on) {
      if (j.hidden) return;
      j.classList.add('pz-leave');
      setTimeout(() => { if (j.classList.contains('pz-leave')) j.hidden = true; }, reduce.matches ? 0 : 220);
      paintChrome();
      return;
    }
    const groups = [];
    slides.forEach((s, i) => { const k = s.kicker || ''; if (groups.at(-1)?.k !== k) groups.push({ k, items: [] }); groups.at(-1).items.push(i); });
    j.replaceChildren(h('div', { class: 'pzj-h' }, h('span', {}, deck.title), h('button', { class: 'ib', 'aria-label': 'Close the slide list', onclick: () => toggleJump(false) }, icon('close'))),
      h('div', { class: 'pzj-list' }, groups.map((g) => h('section', {}, g.k ? h('h3', {}, g.k) : null,
        h('ol', {}, g.items.map((i) => h('li', {}, h('button', { type: 'button', 'aria-current': i === want ? 'true' : null, onclick: () => { toggleJump(false); go(i); } },
          h('span', { class: 'n' }, String(i + 1)), h('span', { class: 't' }, nb(slides[i].title))))))))));
    j.classList.add('pz-leave'); j.hidden = false; void j.offsetWidth; j.classList.remove('pz-leave');
    const curBtn = j.querySelector('[aria-current]');
    curBtn?.focus({ preventScroll: true }); curBtn?.scrollIntoView({ block: 'center' });
    paintChrome();
  }
  function jumpKey(e) {
    const k = e.key, btns = [...ui.jump.querySelectorAll('.pzj-list button')], at = btns.indexOf(document.activeElement);
    if (k === 'Escape' || k.toLowerCase?.() === 'g') toggleJump(false);
    else if (k === 'ArrowDown' || k === 'ArrowUp') btns[clamp(at + (k === 'ArrowDown' ? 1 : -1), 0, btns.length - 1)]?.focus();
    else return;   // (Enter and Space press the focused title, Tab moves as usual)
    e.preventDefault(); e.stopImmediatePropagation();
  }

  // ── Swipe: a quick, mostly sideways one-finger move anywhere on the slide (figure, words, bar) goes on (left) or back
  // (right). Left alone: sliders, the slide list, sideways-scrolling boxes, and the card where it docks sideways (its
  // drag, handle included, is its own); pans and pinches that are not mostly sideways stay with the figure. ──
  // (Touch events, not pointer events: the browser keeps its pans on the stage while presenting, which cancels pointers.)
  let sw = null;
  wrap.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    sw = deck && e.touches.length === 1 && !caseOn(e) && !ownsSideways(e.target, { stop: wrap, cardSideways: ui && !ui.data.hidden && !phone() })
      ? { x: t.clientX, y: t.clientY, t: performance.now() } : null;
  }, { passive: true, capture: true });

  // ── The case card on a touch screen: it follows a finger sideways (tilting a little) and flies off when let go far enough
  // out or flicked, either way (caseFling in src/ui/swipe.js); a shorter drag, or one carried back, springs back. A vertical
  // move, a second finger or a cancelled touch leaves it where it was. The slide swipe above leaves the card's touches alone,
  // and the click after a drag is swallowed. Touch events only, so a mouse on the Mac still just clicks. ──
  let cd = null, caseDragAt = -1e9;
  const caseOn = (e) => !!caseCard && !caseCard.flown && e.target.closest?.('.pz-case') === caseCard.c;
  const caseLet = (fly) => {
    const g = cd; cd = null;
    if (!g?.on) return;
    g.card.drag = false; caseDragAt = performance.now();
    const p = g.pts, a = p[0], b = p[p.length - 1], v = b[1] - a[1] >= 16 ? (b[0] - a[0]) / (b[1] - a[1]) : 0;
    const dir = fly ? caseFling(g.card.dx, v, g.card.c.offsetWidth) : 0;
    if (dir) caseFly(g.card, dir, v); else caseBack(g.card);
  };
  wrap.addEventListener('touchstart', (e) => {
    if (cd) { caseLet(false); return; }   // (a second finger: back it goes)
    if (!deck || e.touches.length !== 1 || !caseOn(e)) return;
    const t = e.touches[0];
    cd = { card: caseCard, x: t.clientX, y: t.clientY, on: false, pts: [[t.clientX, performance.now()]] };
  }, { passive: true, capture: true });
  wrap.addEventListener('touchmove', (e) => {
    if (!cd) return;
    if (e.touches.length !== 1 || cd.card.flown) { caseLet(false); return; }
    const t = e.touches[0], dx = t.clientX - cd.x, dy = t.clientY - cd.y, now = performance.now();
    if (!cd.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { cd = null; return; }   // up or down first: not a card drag
      if (Math.abs(dx) < 8) return;
      cd.on = true; cd.card.drag = true;
      cd.card.c.style.transition = 'none';
    }
    if (e.cancelable) e.preventDefault();
    cd.pts.push([t.clientX, now]);
    while (cd.pts.length > 2 && now - cd.pts[0][1] > 100) cd.pts.shift();
    const c = cd.card.c, w = c.offsetWidth || 1;
    cd.card.dx = dx;
    c.style.transform = `translateX(${dx}px) rotate(${(dx / w) * 6}deg)`;
    c.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / w * 0.6));
  }, { passive: false, capture: true });
  wrap.addEventListener('touchend', (e) => { if (cd && !e.touches.length) caseLet(true); }, { passive: true, capture: true });
  wrap.addEventListener('touchcancel', () => { if (cd) caseLet(false); }, { passive: true, capture: true });
  wrap.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) sw = null;
  }, { passive: true, capture: true });
  wrap.addEventListener('touchcancel', () => { sw = null; }, { passive: true, capture: true });
  wrap.addEventListener('touchend', (e) => {
    const g = sw, t = e.changedTouches[0]; sw = null;
    if (!g || !deck || !t || e.touches.length) return;
    const d = swipeDir(t.clientX - g.x, t.clientY - g.y, performance.now() - g.t);
    if (d > 0) next(); else if (d < 0) prev();
  }, { passive: true, capture: true });

  // ── Hands off: while presenting, the figure only points (hover glow); taps, drags, pans and zooms that would
  // move it off the slide's script are swallowed. The swipe above uses touch events, so it still works. ──
  const offFig = (e) => deck && e.target.closest?.('#stageView') && !e.target.closest('#overlay');
  // The figure is read-only here: no hover highlight or glow, no vessel popup, no pick, no actions menu, no text selection.
  // (Gated at the input layer, so the figure's own handlers never run. Pointer leaves are left alone, so a hover that was
  // lit as the deck started still clears. The bar's wake-on-move listens on the window, so a move over the figure wakes it here.)
  for (const t of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click', 'dblclick', 'wheel', 'gesturestart',
    'pointermove', 'pointerover', 'pointerout', 'mousemove', 'mouseover', 'mouseout', 'contextmenu', 'selectstart', 'dragstart'])
    wrap.addEventListener(t, (e) => {
      if (!offFig(e)) return;
      if (t === 'pointermove') wake();
      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
    }, { capture: true, passive: false });
  // Keyboard focus never lands on a vessel (its focus ring is a highlight too).
  wrap.addEventListener('focusin', (e) => { if (deck && offFig(e) && e.target.closest('#stage')) e.target.blur?.(); }, true);

  // ── Keys ──
  function onKey(e) {
    if (!deck || e.ctrlKey || e.metaKey || e.altKey) return;
    // (A dialog over the talk, such as the Guide that ? opens, keeps its keys: Esc closes it rather than ending the talk.)
    if (isModalOpen()) return;
    if (ui && !ui.jump.hidden) { jumpKey(e); return; }
    const tag = e.target?.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
    let used = true;
    if (/^[0-9]$/.test(k)) { digits = (digits + k).slice(-3); clearTimeout(digitT); digitT = setTimeout(() => { digits = ''; }, 2500); toast(`Slide ${digits}: press Enter`, '', { present: true }); }
    else if (k === 'Enter' && digits) { const n = +digits; digits = ''; if (n >= 1) go(n - 1); }
    else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter' || k === 'ArrowDown') { if (!e.repeat) next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp' || k === 'Backspace') { if (!e.repeat) prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1);
    else if (lk === 'b' || k === '.' || lk === 'w') toggleBlack();
    else if (lk === 'f') fullscreen();
    else if (lk === 'g') toggleJump(true);
    else if (lk === 'n' || lk === 's' || lk === 'l') { /* the app's own N, S and L (such as the lens) stay off while presenting */ }
    else if (k === 'F5') { /* a clicker's "start show": never reload the page */ }
    else if (k === 'Escape') { if (black) toggleBlack(false); else stop(); }
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  addEventListener('keydown', onKey, true);

  // The card's own touch: along its axis it follows the finger (docking past half way or on a quick flick); a tap on the sliver opens it.
  function dockTouch(el) {
    let g = null;
    const reset = () => { g = null; dock.drag = false; };
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || !deck) { reset(); return; }
      const t = e.touches[0], vec = dockVec(), k = wrap.getBoundingClientRect().width / (wrap.clientWidth || 1) || 1;
      g = { x: t.clientX, y: t.clientY, t: performance.now(), lvl0: dock.lvl, vec, k, on: false, last: 0 };
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!g) return;
      if (e.touches.length > 1) { reset(); return; }
      const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y, vert = !!g.vec[1];
      const along = vert ? dy : dx, across = vert ? dx : dy, comp = vert ? g.vec[1] : g.vec[0];
      if (!g.on) {
        if (Math.abs(along) < 8 || Math.abs(across) > Math.abs(along) * 1.2) return;   // (not yet, or a cross-wise move: leave it)
        g.on = true; dock.drag = true; cancelFrame(dock.raf);
      }
      if (e.cancelable) e.preventDefault();
      g.dl = along / g.k / comp;
      dock.lvl = clamp(g.lvl0 + g.dl, 0, 1);
      (g.pts ||= []).push([performance.now(), along]);
      dockPaint();
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      const gg = g; reset();
      if (!gg || e.touches.length) return;
      const dt = performance.now() - gg.t;
      if (gg.on) {
        // A quick flick (over 0.5 px/ms across the last 100 ms, just before letting go) decides by its direction; otherwise how far it got.
        const now = performance.now(), end = gg.pts.at(-1), from = gg.pts.find((q) => end[0] - q[0] <= 100) || end;
        const v = end[0] > from[0] ? (end[1] - from[1]) / (end[0] - from[0]) : 0;
        const flick = now - end[0] < 100 && Math.abs(v) > 0.5 ? Math.sign(v / gg.vec[gg.vec[1] ? 1 : 0]) : 0;   // (toward docking is +1)
        dockTo(flick > 0 ? 1 : flick < 0 ? 0 : dock.lvl > 0.5 ? 1 : 0, 300);
      } else if (dock.to === 1 && dt < 500) dockTo(0);
    }, { passive: true });
    el.addEventListener('touchcancel', () => { if (g?.on) dockTo(dock.to, 300); reset(); }, { passive: true });
  }

  // A phone's foldable card also opens and closes by a swipe anywhere on it: down pulls the folded part open, up pushes it
  // shut, following the finger, and it eases the rest of the way on release. A swipe the fold can't take (up on a shut card)
  // is left to the card's dock drag; sideways moves are left alone, so slide swipes and the figure pan work as before.
  function foldTouch(el, btn, setFold, part, hold) {
    let g = null;
    el.addEventListener('touchstart', (e) => {
      g = null;
      if (e.touches.length !== 1 || !btn.offsetWidth || dock.lvl > 0 || btn.contains(e.target)) return;
      const t = e.touches[0], p = part(), open = el.classList.contains('tool-open');
      const shown = open !== el.classList.contains('tool-lead');   // (tool-lead: there the tiles fold, shut while the tool is open)
      g = { x: t.clientX, y: t.clientY, p, open, shown, full: Math.min(p.scrollHeight, innerHeight * 0.4), on: false, pts: [] };
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!g) return;
      const t = e.touches[0], dy = t.clientY - g.y, dx = t.clientX - g.x;
      if (!g.on) {
        if (Math.abs(dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) || (dy > 0) === g.shown) { g = null; return; }   // (sideways, or nothing to fold that way)
        g.on = true; g.p.style.transition = 'none'; hold(true);
      }
      e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
      const u = clamp((g.shown ? g.full : 0) + dy, 0, g.full) / (g.full || 1);
      g.u = u; g.pts.push([performance.now(), dy]);
      g.p.style.maxHeight = `${(u * g.full).toFixed(1)}px`; g.p.style.opacity = u.toFixed(3);
    }, { passive: false });
    const end = (e) => {
      const gg = g; g = null;
      if (!gg?.on) return;
      e.stopImmediatePropagation();
      const last = gg.pts.at(-1), from = gg.pts.find((q) => last[0] - q[0] <= 100) || last;
      const v = last[0] > from[0] ? (last[1] - from[1]) / (last[0] - from[0]) : 0;
      // (A card folded behind Show has nothing to follow the finger: a pull of 24 px or more opens it, a push shuts it.)
      const show = Math.abs(v) > 0.4 ? v > 0 : gg.full ? gg.u > 0.5 : gg.shown ? last[1] > -24 : last[1] >= 24;
      // (From where the finger left it to the class's own state: the part's transition eases the rest. setFold reads where
      // the finger left it before letting go of it.)
      const lead = el.classList.contains('tool-lead');
      if ((show !== lead) !== gg.open) { setFold(show !== lead); return; }
      gg.p.getBoundingClientRect(); gg.p.style.transition = '';
      gg.p.style.maxHeight = ''; gg.p.style.opacity = '';
      hold(false);
    };
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
  }

  // ── Start and stop ──
  function build() {
    const ladder = bigLadder(), tiles = bigTiles();
    const text = h('section', { class: 'pz-text stage-blocker', 'aria-live': 'polite' });
    const dhT = h('span', {}, 'Pressure, portal vein to heart'), dhL = h('span', { class: 'pz-lg' }, h('i', { class: 'now' }), 'Patient', h('i', { class: 'base' }), 'Healthy');
    const tools = createTools({ host, stage });
    // On a phone an instrument above tiles folds away (the tiles keep the reading), so the figure is not a strip between
    // two cards; the button opens it, and it stays open for the rest of the talk.
    // The card is fitted once, as it will rest, before the part moves, and keeps that fit until the part is still: its words,
    // tiles and pictures hold their size through the whole open and close. (Fitted as the part eased or followed the finger,
    // the card measured itself against a cap meant for the other state; an iPhone's Doppler card shrank to half mid-pull, then
    // grew back once open.)
    const partOf = () => (data.classList.contains('tool-lead') ? tiles.el : tools.el);
    const setFold = (open) => {
      const p = partOf(), cs = getComputedStyle(p), from = ['maxHeight', 'opacity', 'marginTop', 'marginBottom'].map((n) => [n, cs[n]]);
      p.style.transition = 'none'; for (const [n] of from) p.style[n] = '';
      data.classList.toggle('tool-open', open); fold.setAttribute('aria-expanded', String(open)); fold.textContent = open ? 'Hide' : 'Show';
      data.dataset.openFor = String(want);   // (the slide it was tapped on: phoneTextCap keeps it open there)
      delete data.dataset.folding; fitDone.delete(data); layout();
      // (Then back to where the part stood, from which it eases to its rest.)
      data.dataset.folding = '';
      for (const [n, v] of from) p.style[n] = v;
      p.getBoundingClientRect(); p.style.transition = ''; for (const [n] of from) p.style[n] = '';
      clearTimeout(foldT); foldT = setTimeout(foldStill, reduce.matches ? 0 : 450);
    };
    let foldT = 0;
    const foldStill = () => {
      clearTimeout(foldT);
      if (!('folding' in data.dataset)) return;
      if (partOf().getAnimations?.().some((a) => a.playState === 'running')) { foldT = setTimeout(foldStill, 100); return; }   // (still easing: a slow frame)
      delete data.dataset.folding; fitDone.delete(data); onResize();
    };
    const fold = h('button', { class: 'pz-fold', type: 'button', 'aria-expanded': 'false', onclick: () => setFold(!data.classList.contains('tool-open')) }, 'Show');
    const data = h('section', { class: 'pz-data stage-blocker pz-hide', 'data-safe': 'right', 'data-safe-rest': '', 'data-gone': '', hidden: true, 'aria-label': 'The numbers' },
      h('div', { class: 'pz-dh' }, dhT, dhL, fold), tools.el, ladder.el, ladder.strip, tiles.el, h('span', { class: 'pz-grip', 'aria-hidden': 'true' }));
    foldTouch(data, fold, setFold, partOf, (on) => { if (on) { clearTimeout(foldT); data.dataset.folding = ''; } else foldT = setTimeout(foldStill, reduce.matches ? 0 : 450); });
    dockTouch(data);
    data.addEventListener('pz-strip', () => requestAnimationFrame(() => { if (ui) { fitDone.delete(data); layout(); } }));   // (laid out, not a resize: a resize sets every strip back to its plot and measures again)
    // A part that has finished folding or unfolding: fit the card again from full size (a fit taken mid-fold kept the tiles small).
    data.addEventListener('transitionend', (e) => { if (e.propertyName === 'max-height' && e.target.parentElement === data) { if ('folding' in data.dataset) foldStill(); else { fitDone.delete(data); onResize(); } } });
    const veil = h('div', { class: 'pz-veil' }), panel = h('section', { class: 'pz-panel stage-blocker', hidden: true, 'aria-live': 'polite' });
    const prog = h('div', { class: 'pz-prog', 'aria-hidden': 'true' }, h('i'));
    const bar = h('div', { class: 'pz-bar stage-blocker', role: 'toolbar', 'aria-label': 'Presenter' });
    bar.addEventListener('focusin', wake);
    const blackEl = h('div', { class: 'pz-black', 'aria-hidden': 'true', onclick: () => toggleBlack(false) });
    // The shade sits under the corner credit (both at figure level, the credit later), the slide over both.
    // (An iPhone's credit: one 12 px line at the teaching card's foot, the same on every slide; styles/app.css .pz-cred.)
    const shade = h('div', { class: 'pz-shade' }, deckTab(), h('span', { class: 'pz-cred', 'aria-hidden': 'true' }, wrap.querySelector('.stage-credit')?.textContent.trim() || ''));
    // What the figure frames itself clear of: the words, the glass and its shadow.
    const safe = h('div', { class: 'pz-safe', 'aria-hidden': 'true', hidden: true });
    const load = h('div', { class: 'pz-load', 'aria-hidden': 'true' }, h('i'));
    const jump = h('nav', { class: 'pz-jump stage-blocker', hidden: true, 'aria-label': 'Slides' });
    const vcase = h('section', { class: 'pz-case stage-blocker', hidden: true, 'aria-live': 'polite', onclick: () => { if (performance.now() - caseDragAt > 400) caseLift?.(); } });
    // The slide's colour key, small on the figure (src/ui/figure-key.js fades it in; its words are set by figKey). The figure's labels keep clear of it (stage-blocker).
    const fk = h('div', { class: 'pz-fk stage-blocker', role: 'img', hidden: true, 'data-empty': '' });
    const root = h('div', { class: 'pz' }, safe, veil, load, fk, text, data, panel, vcase, prog, bar, jump, blackEl);
    wrap.insertBefore(shade, wrap.querySelector('.stage-credit'));
    // The teaching card's glass is the card itself: it leaves and arrives with the words, never resizing in view.
    new MutationObserver(() => shade.classList.toggle('pz-leave', text.classList.contains('pz-leave'))).observe(text, { attributes: true, attributeFilter: ['class'] });
    wrap.append(root);
    const figKey = createFigureKey({ el: fk, app });
    return { root, shade, safe, load, text, data, vcase, fk, figKey, dhT, dhL, ladder, tiles, tools, veil, panel, prog, bar, black: blackEl, jump };
  }
  // The start's cover (see start). While it is up (booting) the camera cuts instead of gliding.
  let cover = null, booting = false, coverT = 0, noCase = false;   // (noCase: the slide a start lands on, a reload's included, does not play its case card)
  function coverUp() {
    booting = true;
    clearTimeout(coverT); coverT = setTimeout(() => coverDown(true), 12000);   // (never left up)
    if (!cover) { cover = h('div', { class: 'pz-cover', 'aria-hidden': 'true' }, h('i')); document.body.append(cover); void cover.offsetWidth; }
    cover.classList.add('on');
    return wait(reduce.matches ? 0 : 300);
  }
  // The slides' fonts, every subset they draw from (Latin, Latin Extended, Greek for μ or Δ), are loaded under the start's cover:
  // a subset is otherwise fetched on its first use, and its words show in a stand-in font first, then swap and change size.
  const fontsIn = () => (document.fonts?.load
    ? Promise.race([Promise.all(['400 16px Inter', '600 16px Inter', '600 32px "Source Serif 4"'].map((f) => document.fonts.load(f, 'Aāαἀ').catch(() => {}))), wait(1500)])
    : null);
  async function coverDown(now = false) {
    if (!now) {
      // Under the cover: the figure has refitted to the projector layout (its framing holds still) and the slide's
      // own entrances (the words, the card, the glass) have finished, so the reveal shows a finished slide.
      const T = () => document.getElementById('world')?.getAttribute('transform') || '';
      let a = T(), same = 0;
      for (let i = 0; i < 40 && same < 5; i++) { await wait(60); const c = T(); same = c === a ? same + 1 : 0; a = c; }
      const runs = ui ? [...ui.root.getAnimations({ subtree: true }), ...ui.shade.getAnimations()].filter((x) => x.effect?.getComputedTiming().iterations !== Infinity) : [];
      await Promise.race([Promise.all(runs.map((x) => x.finished.catch(() => {}))), wait(1200)]);
      await new Promise((r) => nextFrame(() => nextFrame(r)));
    }
    clearTimeout(coverT); booting = false;
    const c = cover; cover = null;
    if (!c) return;
    c.classList.remove('on');
    setTimeout(() => c.remove(), reduce.matches ? 0 : 700);
  }
  // Everything the audience's slides will change, kept so Esc, ✕ or Finish can put the viewer's own settings back (the patient itself returns to healthy, see putHealthy).
  async function capture() {
    const st = store.get(), { snap } = await host.request('snapshot');
    return { snap, params: structuredClone(st.params), presetId: st.presetId, view: st.view, lobule: st.lobule, sinusoid: st.sinusoid, mode: st.mode,
      selection: st.selection, details: st.details, compareSnap: st.compareSnap, compareView: st.compareView, colorMode: st.colorMode,
      lobuleLayers: st.lobuleLayers, running: st.running, speed: st.speed, lapse: st.lapse, clock: st.clock, hvpgMeasured: st.hvpgMeasured, lastHVPG: st.lastHVPG,
      labelK: stage.labelScale(), cam: stage.cameraState() };
  }
  async function start(id, at = 0) {
    // (The slide a start lands on never plays its case card: it was skipped only while the start's cover was up, and the cover
    // gives up after 12 s, so on a slow machine a deep link sat on a case card waiting for a tap no one knew to give.)
    noCase = true;
    const want0 = Math.max(0, (parseInt(at, 10) || 0));
    const d = typeof id === 'object' ? id : all().find((x) => x.id === (ALIAS[id] || id));
    if (!d?.slides?.length) { toast('That presentation could not be found.', 'bad'); return; }
    // The start is one composed reveal: a calm cover fades over the screen, the projector layout, the first patient and
    // the first slide are all set up under it, and the cover fades away once nothing behind it is still moving.
    const up = Promise.all([coverUp(), fontsIn()]);
    // Starting another deck while one runs keeps the state from before the first.
    const before = deck ? saved : await capture();
    await up;
    if (deck) stop(false);
    lastAt = -1;
    saved = before;
    if (saved && !saved.cards) saved.cards = stashCards?.();
    deck = d; slides = d.mine ? d.slides : withOverview(d).slides; shown = null; shownState = -1; black = false;
    closeHome?.();
    const st0 = store.get();
    if (!layersBefore) layersBefore = { ...st0.lobuleLayers };
    store.set({ presenting: true, selection: null, details: null, compareSnap: null, colorMode: 'pressure', presentLabels: [], focus: null, ...(st0.mode !== 'explore' ? { mode: 'explore' } : {}) });
    if (st0.view !== 'anatomic' && !st0.lobule) store.set({ view: 'anatomic' });
    projectorOn();
    app.classList.add('presenting');
    document.getElementById('stage')?.dispatchEvent(new PointerEvent('pointerleave'));   // a hover lit as the deck starts clears
    getSelection()?.removeAllRanges?.();
    app.classList.toggle('pz-hi', hiCon);
    app.style.setProperty('--pz-wk', String(PW_K[pzWidth]));
    ui = build();
    if (base) ui.ladder.setBase(base);
    setLabels();
    prepare();
    addEventListener('resize', onResize);
    document.fonts?.addEventListener('loadingdone', onFonts);   // (a font arriving late changes the words' size: the cards are fitted again)
    go(Math.min(want0, slides.length - 1));
    wake();
  }
  function stop(restore = true) {
    if (!deck) return;
    if (cover) coverDown(true);
    stopLapse(); cathStop(); abSlow(); liveOff = false;   // (before deck is cleared: stopping a time-lapse repaints the bar)
    deck = null; shown = null; want = 0;
    for (const w of waiters) w.res(null);
    waiters = [];
    removeEventListener('resize', onResize);
    document.fonts?.removeEventListener('loadingdone', onFonts);
    fitRO?.disconnect(); clearRO?.disconnect(); fitKids = []; clearFor = null; clearTimeout(clearT); cancelFrame(fitRaf);
    store.set({ presenting: false, presentLabels: null, presentTerms: null, presentNames: false, focus: null, lobuleCallout: null, presentFp: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null); delete app.dataset.lit;
    hushed = false; lastCam = null; clearTimeout(hushInT); app.classList.remove('pz-hush', 'pz-hush-in');
    clearTimeout(idleT); clearTimeout(dock.fit); cancelFrame(dock.raf); dock.lvl = 0; dock.to = 0; dock.drag = false;
    pillW = 0; ui?.tools.dispose(); ui?.figKey.dispose(); ui?.root.remove(); ui?.shade.remove(); ui = null;
    view.classList.remove('pz-out');
    for (const k of ['--pz-l', '--pz-r', '--pz-t', '--pz-b']) app.style.removeProperty(k);
    stage.setProjection(false);
    document.documentElement.style.setProperty('--label-k', String(stage.labelEff())); document.documentElement.style.setProperty('--label-scale', String(stage.labelScale()));
    dispatchEvent(new Event('pps:labelscale'));
    if (document.fullscreenElement) document.exitFullscreen?.();
    app.classList.remove('presenting', 'pz-hi');
    app.style.removeProperty('--pz-wk');
    projectorOff();
    dispatchEvent(new Event('pps:occ'));
    if (restore && saved) putHealthy(saved);
    if (restore) { saved = null; if (layersBefore) store.set({ lobuleLayers: layersBefore }); layersBefore = null; }
  }
  // When the show ends, the app returns to the healthy patient from the start (not to where the viewer was): healthy preset, anatomy view
  // framed to fit, tools and cards closed, nothing from the last slide left on. The viewer's own settings (theme, label size, the
  // lobule layers they chose) stay as they were. The figure dims softly while the patient changes, as between slides, so nothing pops.
  async function putHealthy(b) {
    const ms = reduce.matches ? 0 : 380;
    if (ms) { view.style.transition = `opacity ${ms}ms var(--ease)`; view.style.opacity = '.22'; await wait(ms); }
    const st = store.get();
    store.set({ mode: 'explore', colorMode: 'pressure', selection: null, details: null, compareSnap: null, compareView: 'B', hvpgMeasured: false, lastHVPG: null, lapse: 0, speed: 1 });
    if (st.sinusoid) { store.set({ sinusoid: false }); await wait(reduce.matches ? 0 : 1000); }
    if (st.lobule) { store.set({ lobule: false }); await until(() => stage.lobuleSettled(), 2600); await wait(80); }
    if (b.lobuleLayers) store.set({ lobuleLayers: b.lobuleLayers });
    if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); await wait(reduce.matches ? 0 : 700); }
    host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
    await loadPreset?.('healthy');
    stage.fitSlow(reduce.matches ? 0 : 700);
    if (ms) { await wait(260); view.style.opacity = ''; await wait(ms + 60); view.style.transition = ''; }
  }

  // ── Library (the menu's Present column) ──
  function captureStep() {
    const st = store.get();
    return { title: st.presetList?.find((p) => p.id === st.presetId)?.label || 'Step', preset: st.presetId, params: structuredClone(st.params), view: st.view, notes: '' };
  }
  function newScript() {
    const title = prompt('Name the new script', 'My script');
    if (!title) return;
    const list = readMine();
    list.push({ id: 'my-' + Date.now().toString(36), title, summary: 'Built from the live model.', steps: [captureStep()] });
    writeMine(list); rerenderHome?.();
    toast('Script created with the current model as its first slide. Change the model and use “Add current state” to add more.');
  }
  function addStep(id) {
    const list = readMine(), s = list.find((x) => x.id === id);
    if (!s || s.deck) return;
    const step = captureStep();
    step.title = prompt('Title for this slide', step.title) || step.title;
    s.steps.push(step); writeMine(list); rerenderHome?.();
  }
  function remove(id) { if (!confirm('Delete this script?')) return; writeMine(readMine().filter((x) => x.id !== id)); rerenderHome?.(); }
  function exportScript(s) { download(`${s.title.replace(/[^\w-]+/g, '-').toLowerCase()}.pps-script.json`, JSON.stringify(s, null, 2), 'application/json'); }
  const copy = (url, msg) => navigator.clipboard?.writeText(url).then(() => toast(msg, '', { present: true }), () => prompt('Copy this link', url)) ?? prompt('Copy this link', url);
  const shareScript = (s) => copy(`${location.origin}${location.pathname}#script=${enc(s)}`, 'Link copied: opening it adds the script to the recipient’s library.');
  // Built-in decks share through their page (c/deck-<id>.html, scripts/share-pages.mjs) on the hosted site, so a link preview shows the deck title.
  const shareDeck = (d) => copy(location.hostname.endsWith('github.io') && /^[\w-]+$/.test(d.id) && !String(d.id).startsWith('my-') ? new URL(`c/deck-${d.id}.html`, location.href).href : `${location.origin}${location.pathname}?script=${d.id}`, 'Link copied: it opens this presentation at its first slide.');
  // Import: a deck .js file (the format of src/ui/decks), a deck or script as .json, or the same text pasted.
  function importFile() {
    const area = h('textarea', { class: 'imp-src', rows: 10, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Deck file contents',
      placeholder: "export const MY_DECK = {\n  title: 'My talk',\n  slides: [ { title: '…', line: '…' } ],\n};" });
    const err = h('p', { class: 'imp-err', role: 'alert', hidden: true });
    const add = (text) => {
      try { addText(text); closeModal(); } catch (e) { err.textContent = e.message || 'That is not a deck or a script.'; err.hidden = false; }
    };
    const inp = h('input', { type: 'file', accept: '.js,.mjs,.json,text/javascript,application/javascript,application/json', hidden: true });
    inp.addEventListener('change', async () => { const f = inp.files[0]; if (f) add(await f.text()); inp.value = ''; });
    openModal('Import a presentation', h('div', { class: 'imp' },
      h('p', {}, 'Choose a deck file (.js, written like the built-in decks) or a script (.json), or paste its contents. The file is read as data and never run.'),
      inp,
      h('button', { class: 'btn', onclick: () => inp.click() }, icon('download'), 'Choose a file…'),
      area, err,
      h('div', { class: 'btn-row', style: { justifyContent: 'flex-end', marginTop: '8px' } },
        h('button', { class: 'btn', onclick: () => closeModal() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => add(area.value) }, 'Add to your scripts'))), { sub: null });
  }
  // A script (title, steps) as JSON is kept as before; anything else must be a deck.
  function addText(text) {
    let o = null;
    try { o = JSON.parse(text); } catch { /* not JSON */ }
    if (o?.title && Array.isArray(o.steps)) return addToLibrary(o);
    if (o?.deck) return addToLibrary(o);
    return addToLibrary({ deck: parseDeckSource(text) });
  }
  function addToLibrary(s) {
    if (s?.deck) {
      const d = checkDeck(s.deck);
      s = { title: d.title, summary: d.summary || '', deck: d };
    } else if (!s?.title || !Array.isArray(s.steps)) throw new Error('That is not a deck or a script.');
    const list = readMine();
    const id = 'my-' + Date.now().toString(36);
    list.push({ ...s, id, builtin: undefined });
    writeMine(list); rerenderHome?.();
    toast(`Added “${s.title}” to your scripts.`);
    return id;
  }
  /** A shared link (#script=…) adds its script to this device's library; returns its id (true if it could not be read). */
  function readLink() {
    const m = location.hash.match(/#script=([\w-]+)/);
    if (!m) return false;
    let id = true;
    try { id = addToLibrary(dec(m[1])); } catch { toast('The shared script could not be read.'); }
    history.replaceState(null, '', location.pathname + location.search);
    return id;
  }

  // What the unified menu (menu.js) lists and does: the presentations, this device's scripts and their actions.
  const library = () => ({ decks: DECKS, topics: TOPICS, levels: LEVELS, mine: readMine(), start, shareDeck, notes: (d) => openHandout(d, deckNumbers(d)),
    scriptNotes: (s) => { const d = fromScript(s); openHandout(d, deckNumbers(d)); }, newScript, importFile, addStep, shareScript, exportScript, remove, current: () => deck?.id ?? null,
    resumeAt: (d) => resumeFor(d.id, (d.mine ? d.slides : withOverview(d).slides).length) });

  return { start, stop, library, readLink, active: () => !!deck,
    // Where the show is (for the preview pill's reload): the deck and the slide on screen, or the one it is moving to.
    position: () => (deck ? { id: deck.id, at: shown?.i ?? want } : null),
    // For the browser checks: straight to slide i (0-based) of the deck shown, as the arrow keys move.
    go: (i) => go(i), busy: () => busy, skipLapse: () => skipLapse(),   // (a time-lapse sped to its end, as Next does)
    // What Settings shows while presenting.
    settings: () => ({ width: pzWidth, setWidth: setPanelWidth, contrast: hiCon, setContrast, stacked: phone() }),
    // For the browser checks: the time-lapse slides, and the card's tiles as the slide shown should read them at its start and end.
    probe: () => {
      const txt = (k, f) => (rateOf(k, f)[0] == null && (k === 'saag' || k === 'tp') ? '—' : tileVal(k, f[k]));   // (as bigTiles shows it)
      const i = shown?.i ?? -1, s = slides[i], ks = s ? tileKeys(s) : [], end = s && states[stateOf[i]], start = s?.lapse && i > 0 ? end?.start || states[stateOf[i - 1]] : end;
      return { i, lapses: slides.flatMap((x, j) => (x.lapse && j > 0 && x.data ? [j] : [])), charts: slides.flatMap((x, j) => (x.lapse && j > 0 && x.tool?.kind === 'flowtime' ? [j] : [])), playing: lapseOn, keys: ks,
        start: start ? ks.map((k) => txt(k, start.fp)) : null, end: end ? ks.map((k) => txt(k, end.fp)) : null };
    } };
}
