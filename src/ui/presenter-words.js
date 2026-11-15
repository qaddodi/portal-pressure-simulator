// A slide's words: lens keys, targets and clauses (moved out of the presenter)
// (moved out of presenter.js, text unchanged; a name the rest still reads is exported.)
import { h } from './util.js';
import { camNames } from './cam-frame.js';
import { NODE_POS } from './anatomy.js';
import { DISEASE_SRC, diseasePieces } from './diseases.js';
import { nb } from './glue.js';
import { valueText } from './callout-math.js';
import { TOKEN_OF_RATE } from '../engine/pressure-cuts.js';
import { cleanEq } from './import-safety.js';
import { TILE, cutText, rateShown, tileShown, tipsGoal } from './table-marks.js';
import { dropCss, flowCss, gradientCss, heatCss, oxygenCss } from './colormap.js';
import { EXT, expandIds, safe } from './slide-ext.js';
import { citeText } from './teach-extras.js';
import { clausesOf, shownLine } from './reveal.js';

export const LOBULE_CAM = /^(lobule|sinusoid)/;

// ── Numbers ────────────────────────────────────────
// A slide's equation (decks.js eq: [MathML, legend]): typeset by the browser's own MathML, the legend under it.
export function equation(eq) {
  const box = h('div', { class: 'pz-eq' });
  const [ml, legend] = cleanEq(eq) || ['', ''];   // (imported decks reach here too: only allowlisted MathML is set as markup)
  box.innerHTML = ml ? `<math>${ml}</math>` : '';
  if (legend) box.append(h('p', { class: 'pz-eqk' }, legend));
  return box;
}
// A source line under the words (V23): cite: 'Baveno VIII 1.15, 1.16', in the caveat's small print.
export const citeEl = (s) => (citeText(s.cite) ? h('p', { class: 'pz-cite' }, citeText(s.cite)) : null);
// A slide's lens (decks.js lens): what the vessel colours show on that slide, with a key under its line, its name ("Velocity")
// and the two ends, as the legend does in Explore. (Learner-facing words say "colored by", never "lens".)
// Pressure is the default and needs no key.
const LENS_KEY = {
  velocity: ['velocity', [['--vel-slow', 'Slow'], ['--vel-fast', 'Fast']]],
  flow: ['flow volume', () => flowCss('to right'), 'Low', 'High'],
  direction: ['direction', [['--flow-normal', 'Hepatopetal'], ['--flow-reversed', 'Reversed']]],
  heat: ['congestion', () => heatCss('to right'), 'None', 'High'],
  drop: ['pressure drop', () => dropCss('to right'), 'Low', 'High'],
  delta: ['change', () => 'linear-gradient(to right, var(--delta-low), var(--delta-mid), var(--delta-high))', 'Lower', 'Higher'],
  oxygen: ['oxygen', () => oxygenCss('to right'), 'Low', 'High'],
  origin: ['origin', [['--origin-smv', 'SMV'], ['--origin-imv', 'IMV'], ['--origin-spleen', 'Spleen', 'SV'], ['--origin-artery', 'Artery', 'HA'], ['--origin-systemic', 'Systemic', 'Sys']]],   // (the short names blood.js ORIGINS uses: a phone's key beside the pill, fitKey)
  firstpass: ['first pass, not ammonia', [['--fp-raw', 'Not cleared', 'Raw'], ['--fp-clear', 'Cleared by the liver', 'Clear'], ['--origin-artery', 'Artery', 'HA'], ['--origin-systemic', 'Systemic', 'Sys']]],   // (gut blood by the path it took: blood.js FIRSTPASS; the name says it is no ammonia level)
};
// (A deck visuals package's lenses (slide-ext.js) after the app's own; a key whose words depend on the slide is a function of it.)
for (const [k, v] of Object.entries(EXT.lenses)) if (!LENS_KEY[k]) LENS_KEY[k] = v;
export const lensSpec = (k, s) => { const v = LENS_KEY[k]; return typeof v === 'function' ? safe(() => v(s), null, `lenses.${k}`) : v; };
export const slideLens = (s) => (!s?.visual && LENS_KEY[s?.lens] ? s.lens : 'pressure');
// Pressure's key shows only on a slide with lens buttons (the default needs none).
export const PRESSURE_KEY = ['pressure', () => gradientCss('to right', 30), 'Low', 'High'];
export const lensButtons = (s) => !!s.compare?.some((o) => o.lens);
export const gateButtons = (s) => !!s.compare?.some((o) => o.gate);
export const toolButtons = (s) => !!s.compare?.some((o) => o.tool);
/** What a compare slide's button k does. A lens button ({ label, lens }) crossfades the figure to that lens and a gate
 *  button ({ label, gate }) moves the stent Doppler's gate, the model untouched; so does a tool button ({ label, tool: { red: false } }),
 *  which changes the options of the slide's instrument (the slide's own button, { label, own: true }, puts them back). A patient button ({ label, preset, block? })
 *  eases the live model to that patient, computed with the slide's states, and a time-point button ({ label, slide }) to that
 *  slide's state in the same deck (one patient's earlier visit); the slide's own button eases back to the slide's
 *  exact state when the row has a patient button or when it names no params of its own ({ label, own: true }: the slide's
 *  state is its params, Mohammad, 19 Oct: "when i click no tips then tips again the tips doesn't come"). A normal heart is
 *  then a healthy circulation (none of the failing heart's retained fluid or ascites is left behind), and the failing heart
 *  is the slide's numbers exactly. Any other button patches the live model's params with its own.
 *  → { kind: 'lens', lens } | { kind: 'gate', gate } | { kind: 'tool', tool } (tool: null, the slide's own options) | { kind: 'state' } | { kind: 'params', patch } */
export function abChoice(compare, k) {
  const o = compare[k];
  if (o.lens) return { kind: 'lens', lens: o.lens };
  if (o.gate) return { kind: 'gate', gate: o.gate };
  if (o.tool) return { kind: 'tool', tool: o.tool };
  if (o.own && compare.some((p) => p.tool)) return { kind: 'tool', tool: null };
  if (o.preset || o.slide || (o.own && (!o.params || compare.some((p) => p.preset || p.slide)))) return { kind: 'state' };
  return { kind: 'params', patch: o.params || {} };
}
// The key for the small pill on the figure (figure-key.js): the lens named, then its colour scale under it (a gradient has no end words; named swatches keep their names).
// (The pressure-drop key also names its ends, "Low ▬▬ High", as the velocity key does: a bare green bar did not say which end was
// which (17 Oct design review). The other scales keep the bar alone.)
const KEY_ENDS = new Set(['drop']);
export function keyNodes(k, s) {
  const [name, bar, lo, hi] = lensSpec(k, s) || PRESSURE_KEY;
  const sw = (v) => h('i', { class: 'pz-lens-sw', style: { background: `var(${v})` } });
  // (Each swatch stays on one line with its words: "Low ▬▬ High" as one piece, a short stroke with its name.)
  const scale = () => h('i', { class: 'pz-lens-bar', style: { background: bar() } });
  return [h('b', {}, name[0].toUpperCase() + name.slice(1)),
    ...(typeof bar === 'function' ? [KEY_ENDS.has(k) ? h('span', { class: 'pz-lens-ends' }, h('span', {}, lo), scale(), h('span', {}, hi)) : scale()]
      // (The named swatches travel as one group: a key that wraps sets its name on one line and all its swatches on the next, never
      // one swatch left alone under the others: Mohammad, 17 Oct, "Reversed" had dropped under "Direction · Usual".)
      // (A swatch may carry a short name, [var, name, short]: a phone's key takes them only to fit beside the pill, fitKey.)
      : [h('span', { class: 'pz-lens-items' }, ...bar.map(([v, t, sh]) => h('span', { class: 'pz-lens-k', title: sh ? t : null }, sw(v), h('span', { class: sh ? 'pz-lk-l' : null }, t), sh ? h('span', { class: 'pz-lk-s', 'aria-hidden': 'true' }, sh) : null)))])];
}
// A string with its disease names set in a pill (see diseases.js).
export const diseaseNodes = (t) => diseasePieces(t).map(([x, dz]) => (dz ? h('span', { class: 'pz-dz' }, x) : x));
// A slide's line, typeset. One value goes in a quiet pill: the one the deck marks with {braces}, else the first
// value with a unit (a line of cut-offs leaves the rest to its scale). The slide's own key terms (its highlighted
// tiles, or `bold`) are bold wherever the line names them; the first mention of a term students meet for the first
// time is bold too, at most three bold terms a line, so it stays a sentence and not a list of highlights.
const VAL = String.raw`(?:[<>≥≤]\s?)?\d+(?:\.\d+)?(?:\s(?:to|or)\s\d+(?:\.\d+)?)?\s?(?:mmHg|g\/dL|mL\/min|kPa|cm\/s|mm|%)(?![A-Za-z])`;
const TERMS = ['CSPH', 'SAAG', 'WHVP', 'FHVP', 'central vein', 'portal tracts?', 'fenestrae', 'space of Disse',
  'basement membrane', 'capillarization', 'wedged pressure', 'free pressures?', 'sinusoidal pressure', 'caput medusae',
  'gastrorenal shunt', 'stellate cells?', 'encephalopathy', 'periportal fibrosis', 'intrahepatic resistance', 'hepatopetal', 'hepatofugal',
  'cavernoma', 'a wave', 'pulsatility', 'reflection coefficient', 'Laplace', 'congestion index', 'indeterminate zone', 'red wale marks'];
// A tile's words in a line (the slide's key tiles are its key terms).
const KEYWORDS = { hvpg: 'HVPG', eus: 'EUS-PPG', ppg: 'PPG', pv: 'portal pressure', whvp: 'WHVP|wedged pressure', fhvp: 'FHVP|free pressure', ra: 'right atrial pressure|right atrium',
  ivc: 'IVC', varix: 'varix|varices', hr: 'heart rate', map: 'mean arterial pressure|MAP|blood pressure', rpp: 'abdominal perfusion pressure|APP', asc: 'ascites', plt: 'platelets?', lsm: 'stiffness', ssm: 'spleen stiffness|SSM', spleen: 'spleen',
  liver: 'liver blood flow', shunt: 'shunt', sin: 'sinusoidal pressure', saag: 'SAAG', tp: 'protein', hb: 'hemoglobin', hbTo: 'hemoglobin to come', pvFlow: 'portal flow', pvVel: 'portal vein velocity', clot: 'clot',
  co: 'cardiac output', bv: 'blood volume', he: 'encephalopathy risk|HE risk' };
// alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// What a word in a line can point at on the figure (a term pill, M1): the station's label (node), the vessels that
// glow (edges) or the organ outlined, in the station's colour (tone: --tr-<tone>), and the words that name it.
export const TARGETS = {
  pv: { node: 'CONF', edges: ['PV_TRUNK'], tone: 'pv', words: 'portal vein' },
  sv: { node: 'SV', edges: ['SV_CONF', 'SV_MID', 'V_SPL'], tone: 'sv', words: 'splenic vein|splenic' },
  imv: { node: 'IMV', edges: ['V_IMV'], tone: 'imv', words: 'inferior mesenteric veins?|inferior mesenteric' },
  smv: { node: 'SMV', edges: ['SMV_CONF', 'V_INT'], tone: 'smv', words: 'superior mesenteric veins?|superior mesenteric' },
  sin: { node: 'SIN_R', edges: ['SIN_RR', 'SIN_LL'], tone: 'wedge', words: 'sinusoids?|sinusoidal pressure' },
  whvp: { node: 'SIN_R', organ: 'liver', tone: 'wedge', words: 'WHVP|wedged pressure' },
  fhvp: { node: 'RHV', edges: ['RHV_IVC'], tone: 'hv', words: 'FHVP|free pressure' },
  hv: { node: 'RHV', edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], tone: 'hv', words: 'hepatic veins?' },
  ivc: { node: 'IVCS', edges: ['IVCS_RA', 'IVC_IS'], tone: 'ivc', words: 'IVC|inferior vena cava' },
  ra: { node: 'RA', organ: 'heart', tone: '--tour-sys', words: 'right atrium' },
  varix: { node: 'VAR', edges: ['C1a', 'C1b'], tone: 'var', words: 'esophageal varices|varices|varix' },
  gv: { node: 'GV', edges: ['C2'], tone: 'var', words: 'gastric varices|fundal varices' },
  lgv: { node: 'LGV', edges: ['LGV_CONF', 'V_STO'], tone: 'var', words: 'left gastric vein|coronary vein' },
  // The cavernoma: the periportal collaterals around a clotted portal vein (its own colour, apart from the varices').
  cavernoma: { edges: ['C8'], tone: 'cav', words: 'cavernomas?' },
  azy: { node: 'AZY', edges: ['AZY_SVC'], tone: 'var', words: 'azygos(?: vein)?' },
  // The circuit's resistors (its zigzags): lit in a station colour, not outlined.
  rLiver: { res: 'rLiver', tone: 'wedge', words: 'resistance' },
  rColl: { res: 'rColl', tone: 'var', words: 'collaterals' },
  rGut: { res: 'rGut', site: 'rGut', tone: 'smv', words: 'splanchnic arterioles|gut arterioles' },
  // The hepatic artery (both views): one word lights it, in the artery's colour, as the lobule's arterioles are.
  ha: { node: 'HA', edges: ['A_HEP', 'A_HR', 'A_HL'], tone: '--artery', words: 'hepatic arter(?:y|ies)' },
  lpv: { node: 'LPV', edges: ['PVH_L'], tone: 'pv', words: 'left portal vein' },
  lrv: { node: 'LRV', edges: ['LRV_IVC', 'V_KID_L'], tone: 'ivc', words: 'left renal vein' },
  spleen: { organ: 'spleen', tone: 'sv', words: 'spleen' },
  liver: { organ: 'liver', tone: 'wedge', words: 'liver' },
  // The caudate lobe with its veins draining into the IVC; caudateLobe: the lobe alone (a DIPS runs through it).
  caudate: { organ: 'caudate', tone: 'hv', words: 'caudate lobe' },
  caudateLobe: { organ: 'caudate-lobe', tone: 'hv', words: 'caudate lobe' },
  heart: { organ: 'heart', tone: '--tour-sys', words: 'heart' },
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
// (A deck visuals package's targets (slide-ext.js) after the app's own, before the node names and the station tones.)
for (const [k, t] of Object.entries(EXT.targets)) if (!TARGETS[k]) TARGETS[k] = t;
// Node ids name their target too ([portal vein](CONF) is [portal vein](pv)).
for (const [k, t] of Object.entries(TARGETS)) if (t.node && !TARGETS[t.node]) TARGETS[t.node] = TARGETS[k];
const ORGANS = new Set(['liver', 'caudate', 'caudate-lobe', 'spleen', 'heart', 'heart-ra', ...EXT.organs]);
// A vessel's station colour, for a glow written by hand (glow: ['PV_TRUNK']).
export const EDGE_TONE = {};
for (const t of Object.values(TARGETS)) for (const e of t.edges || []) EDGE_TONE[e] ||= t.tone;
// (Collaterals and spontaneous shunts take the varices' colour: one family on the figure.)
for (const e of ['C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'S_PC', 'S_DSR', 'S_MC']) EDGE_TONE[e] ||= 'var';
EDGE_TONE.REX ||= 'pv';   // (the Meso-Rex graft carries portal blood to the liver: the portal colour)
// A live value's colour ({pv}): the station it is read at; a value with no station (HVPG) is a plain pill.
// The station label each site reading would repeat (an IVC web's lower reading is its own place, so it has none).
export const SITE_NODE = { pv: 'CONF', ivc: 'IVCS', ra: 'RA' };
export const VAL_TONE = { pv: 'pv', whvp: 'wedge', sin: 'wedge', fhvp: 'hv', ivc: 'ivc', ra: '--tour-sys' };
// A reading with no station of its own (a size: the spleen, the varices) takes its status colour, as its card
// shows it, on its pill and on its organ's outline; neutral while it is normal.
const BY_RATE = new Set(['spleen', 'varix', 'gv']);
export const rateTone = (k, fp) => { const r = rateShown(k, fp)[0]; return (r !== 'ok' && TOKEN_OF_RATE[r]) || null; };   // (judged as its pill prints it)
// A filled pill (the patient) takes its tile's rating colour, as the tile's bar shows it: green, amber or red (Mohammad,
// 19 Oct). A value its tile does not rate or rates only as information keeps its station's colour, or none.
const PILL_TONE = TOKEN_OF_RATE;
const pillRate = (k, fp, tips = false) => (fp?.[k] == null ? null : tips && k === 'ppg' ? tipsGoal(tileShown(k, fp[k]))[0] : rateShown(k, fp)[0]);   // (after TIPS the PPG is read against its target, as its tile reads it)
const valTone = (k, fp, tips) => PILL_TONE[pillRate(k, fp, tips)] || (BY_RATE.has(k) ? null : VAL_TONE[k]);
// A slide's terms: { words: target } (terms: ['pv', 'ra'] takes each target's own words). A word every slide uses the
// same way needs no listing: the cavernoma is always a pill that lights its collaterals.
const AUTO_TERMS = ['cavernoma'];
function termList(s) {
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const t = s.terms || [];
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const own = Array.isArray(t) ? t.map((k) => [TARGETS[k]?.words, k]) : Object.entries(t).map(([w, k]) => [esc(w), k]);
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const have = new Set(own.map(([, k]) => k));
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  return [...own, ...AUTO_TERMS.filter((k) => !have.has(k)).map((k) => [TARGETS[k].words, k])].filter(([w, k]) => w && TARGETS[k]);
}
/** Everything a slide points at on the figure: its terms (as the line names them) and its glow field. */
// On a Doppler slide the vessel being read glows the Doppler's green (as in Explore), over the colour its word would give it.
const isDop = (s) => s?.tool?.kind === 'doppler';
export function slideTargets(s, line = shownLine(s, s.revealed)) {   // (a revealing slide names only the clauses shown so far: reveal.js)
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const keys = new Set();
  for (const m of line.matchAll(/\[([^\]]+)\]\(([\w:]+)\)/g)) if (TARGETS[m[2]]) keys.add(m[2]);
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  for (const [w, k] of termList(s)) if (new RegExp(`\\b(?:${w})\\b`, 'i').test(line)) keys.add(k);
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const labels = [], terms = {}, soft = new Set(), glow = new Map(), organs = new Map(), res = new Map(), lit = new Set(), sites = new Set(), groups = [];
  for (const k of keys) {
    const t = TARGETS[k];
    if (t.node) { labels.push(t.node); terms[t.node] = t.tone; }
    if (t.lit) lit.add(k);
    if (t.site) sites.add(t.site);
    if (t.edges?.length) groups.push(t.edges);   // (groups: each thing the slide lights as the vessels that make it up, for the camera's room: cam-room.js)
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    for (const e of t.edges || []) glow.set(e, t.tone);
    if (t.organ) organs.set(t.organ, t.tone);
    if (t.res) res.set(t.res, t.tone);
  }
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  for (const k of s.tint || []) { const t = TARGETS[k]; if (t?.node) terms[t.node] = t.tone; }   // (a label the line does not name, in its colour all the same)
  // glowSeq (ms): the glow field lights in its order, one step apart (pressure passing back from the heart, D6).
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const at = new Map();
  // (An entry may be a list of vessels, a step's group (V10): they light together, at the entry's moment.)
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  expandIds(s.glow || []).forEach((g0, i) => { for (const g of Array.isArray(g0) ? expandIds(g0) : [g0]) {   // ('@name': a deck visuals package's named set, slide-ext.js)
    const id = typeof g === 'string' ? g : g.id, tone = typeof g === 'string' ? null : g.tone, ms = s.glowSeq ? i * s.glowSeq : 0;
    // { id, soft: true }: a supporting vessel, lit more gently than the one the slide is about.
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    const add = (e, tn) => { glow.delete(e); glow.set(e, tn); if (ms) at.set(e, ms); if (g.soft) soft.add(e); else soft.delete(e); };
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    if (TARGETS[id]) { const t = TARGETS[id]; if (t.lit) lit.add(id); if (t.res) res.set(t.res, tone || t.tone); if (t.edges?.length) groups.push(t.edges); for (const e of t.edges || []) add(e, tone || t.tone); if (t.organ) organs.set(t.organ, tone || t.tone); }
    else if (ORGANS.has(id)) organs.set(id, tone || TARGETS[id]?.tone);
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    else { groups.push([id]); add(id, tone || EDGE_TONE[id] || 'accent'); }
  } });
  // A lobule slide that lights the portal venule's or the central vein's reading lights the sinusoids' as well: the
  // sinusoidal pressure sits between the two, and the other labels are faded out (Mohammad, 16 Oct).
  if (lit.has('lobule:central') || lit.has('lobule:triad')) lit.add('lobule:sinusoid');
  if (isDop(s)) { const v = s.tool.vessel || 'PV_TRUNK'; if (glow.has(v)) glow.set(v, '--dop-glow'); }
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  return { labels, terms, glow: [...glow].map(([id, tone]) => ({ id, tone, at: at.get(id) || 0, soft: soft.has(id) || undefined })), organs: [...organs].map(([id, tone]) => ({ id, tone })), res: [...res].map(([id, tone]) => ({ id, tone })), lit: [...lit], sites: [...sites], groups };
}
/** What the names of a slide's `cam: { on: [names] }` point at, as { organs, edges, points, unknown }: the vessels, organs and station
 *  places the camera frames ('@name': a named set, slide-ext.js). The same names a glow takes, plus a station's id (CONF, AO). */
// alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
export const camOn = (on) => camNames(expandIds(on), { targets: TARGETS, organs: ORGANS, nodes: NODE_POS });
// A live value pill ({pv}): the model's reading for this slide, to its usual decimal.
// {ppg@before}: the value at another slide of the deck (its id), set by the presenter while a deck plays.
let fpAt = () => null;
const atRe = /^(\w+)@([\w-]+)$/, wholeRe = /^(\w+):0$/;
function liveVal(k, s, fp, whole = false) {
  return valueText(k, fp, whole);   // ({hvpg:0}: a whole mmHg, as the ladder's brackets and pills read it; callout-math.js, the one formatter of a tile's value in words)
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
export const LENS_WORDS = { 'pressure drop': 'drop', 'blood origin': 'origin', origin: 'origin', 'first pass': 'firstpass', velocity: 'velocity', 'flow volume': 'flow',
  flow: 'flow', direction: 'direction', congestion: 'heat', change: 'delta', 'vein system': 'system', oxygen: 'oxygen' };
export const LENS_TONE = { velocity: '--vel-normal', flow: '--lens-flow', direction: '--flow-reversed', heat: '--lens-heat', drop: '--lens-drop', delta: '--delta-high', origin: '--origin-spleen', firstpass: '--fp-clear', system: '--tr-var', oxygen: '--lens-oxygen' };
const LENS_RE = String.raw`\b([Cc]olou?red by )(${Object.keys(LENS_WORDS).sort((a, b) => b.length - a.length).join('|')})\b`;
export function rich(t, s = {}, fp = null, tips = false, cuts = null) {
  const { re, tl } = lineRe(s);
  const marked = /\{(?!#\d+\})[^}]+\}/.test(t);   // ({#1}, a figure's step marker, is no value: it never keeps a typed number from its pill)
  const out = [], seen = new Set(), seenT = new Set(); let at = 0, bold = 0, pills = 0, m;
  t = nb(t);
  // (cuts: where the clauses of a revealing line end, as offsets in the line as typeset; a CUT in the list marks each: grouped at the end.)
  let ci = 0;
  const plain = (a, b) => { for (; cuts && ci < cuts.length && cuts[ci] <= b; ci++) { if (cuts[ci] > a) { out.push(t.slice(a, cuts[ci]), CL_CUT); a = cuts[ci]; } } out.push(t.slice(a, b)); };
  const flush = (to) => { for (; cuts && ci < cuts.length && cuts[ci] <= to; ci++) out.push(CL_CUT); };
  // A pill keeps the word before it and the stop after it on its line (a no-break space, one unbreakable span).
  const glue = () => { const prev = out[out.length - 1]; if (typeof prev === 'string') out[out.length - 1] = prev.replace(/ $/, '\u00a0'); };
  const pill = (v, stop, cls = '', tone = null, rate = null) => { glue();
    pills++; return h('span', { class: stop ? 'pz-nw pz-stop' : 'pz-nw' }, h('span', { class: `pz-val${cls}${tone ? ' tone' : ''}`, 'data-rate': PILL_TONE[rate] ? rate : null, style: tone ? `--tone: ${toneVar(tone)}` : null }, v.replace(/\s(?=mmHg|g\/dL|mL|kPa|cm\/s|mm\b|%)/, '\u00a0')), stop || ''); };
  // A figure's numbered marker ({#2}, the glow step of that number, V10) in the words: the figure's own black circle and light
  // numeral, sized to the line (styles/app.css .pz-step). It keeps the word before it and the stop after it on its line.
  const stepMark = (n, stop) => { glue(); return h('span', { class: stop ? 'pz-nw pz-stop' : 'pz-nw' }, h('span', { class: 'pz-step', role: 'img', 'aria-label': `Step ${n}` }, String(n)), stop || ''); };
  const termPill = (w, k) => { const tone = TARGETS[k].organ === 'spleen' ? (fp && rateTone('spleen', fp)) || '--text-2' : TARGETS[k].tone;   // (the spleen's word, as its outline)
    return h('span', { class: 'pz-term', 'data-target': k, style: `--tone: ${toneVar(tone)}` }, w); };
  while ((m = re.exec(t))) {
    const [all, lw, lk, mk, mkStop, dz, tword, val, valStop, key, term, lensBy, lensW] = m, w = (key || term)?.toLowerCase().replace(/(?:s|ces)$/, '');
    if (val && (marked || pills || s.pill === false)) continue;
    if (term && (seen.has(w) || bold >= 3)) continue;
    if (key && seen.has(w)) continue;
    const tk = tword ? tl.find(([x]) => new RegExp(`^(?:${x})$`, 'i').test(tword))?.[1] : null;
    if (tword && (!tk || seenT.has(tk))) continue;
    plain(at, m.index);
    if (lensW) out.push(lensBy.replace(/ $/, '\u00a0'), h('span', { class: 'pz-term pz-lens-t', style: `--tone: ${toneVar(LENS_TONE[LENS_WORDS[lensW]])}` }, lensW));
    else if (lw) out.push(TARGETS[lk] ? termPill(lw, lk) : lw);
    else if (tword) { seenT.add(tk); out.push(termPill(tword, tk)); }
    else if (mk && /^#\d+$/.test(mk)) out.push(stepMark(+mk.slice(1), mkStop));
    else if (mk && TILE[mk]) out.push(pill(liveVal(mk, s, fp), mkStop, '', valTone(mk, fp, tips), pillRate(mk, fp, tips)));
    else if (mk && wholeRe.test(mk) && TILE[mk.match(wholeRe)[1]]) { const k = mk.match(wholeRe)[1]; out.push(pill(liveVal(k, s, fp, true), mkStop, '', valTone(k, fp, tips), pillRate(k, fp, tips))); }
    else if (mk && atRe.test(mk) && TILE[mk.match(atRe)[1]]) { const [, k, id] = mk.match(atRe), f = fpAt(id); out.push(pill(liveVal(k, s, f), mkStop, '', valTone(k, f), pillRate(k, f))); }
    else if (mk && /^[<>≥≤]=?/.test(mk)) out.push(pill(cutText(mk), mkStop, ' cut'));   // (a cut-off keeps its sign, "≥10 mmHg": a comparison is a symbol, never "at or above", Mohammad 26 Oct)
    else if (mk) out.push(pill(mk, mkStop, ' cut'));   // (a number typed in braces, {6 to 8 g}: a rule, outlined; only a live value is the patient)
    else if (val) out.push(pill(val, valStop, ' cut'));   // (a typed number is a rule or a figure from the literature, not the patient: outlined)
    else if (dz) out.push(h('span', { class: dz.length <= 25 ? 'pz-dz pz-nw' : 'pz-dz' }, dz));   // (a name never splits across two lines, "heart | failure"; a long one may, rather than run past a narrow card)
    else { seen.add(w); bold++; out.push(h('b', {}, key || term)); }
    at = m.index + all.length;
    // (A term pill keeps the stop or bracket after it on its line.)
    const last = out[out.length - 1];
    if (last?.classList?.contains('pz-term') && /^[),.;:]+/.test(t.slice(at))) { const st = t.slice(at).match(/^[),.;:]+/)[0]; out[out.length - 1] = h('span', { class: 'pz-nw pz-stop' }, last, st); at += st.length; }
    flush(at);
  }
  plain(at, t.length);
  // (The last line never holds a word or a pill alone: the line's last plain space is a no-break space when what follows it is short.)
  for (let i = out.length - 1, tail = 0; i >= 0 && tail <= 12; i--) {
    const x = out[i], j = typeof x === 'string' ? x.lastIndexOf(' ') : -1;
    if (x === CL_CUT) continue;
    if (j < 0) { tail += typeof x === 'string' ? x.length : x.textContent.length; continue; }
    if (tail + x.length - j - 1 <= 12 && /\S/.test(x.slice(0, j))) out[i] = `${x.slice(0, j)}\u00a0${x.slice(j + 1)}`;
    break;
  }
  if (!cuts) return out;
  // Each clause in a span of its own (pz-cl): the reveal fades and lifts them one at a time (revealPaint).
  const parts = [[]];
  for (const x of out) { if (x === CL_CUT) parts.push([]); else parts.at(-1).push(x); }
  return parts.map((p, k) => h('span', { class: 'pz-cl', 'data-cl': String(k) }, ...p));
}
const CL_CUT = Symbol('clause cut');
// A revealing slide's line (reveal.js): the whole line is typeset, so the card is fitted once and never reflows, each clause in a span;
// the first `n` are on, the rest transparent (app.css .pz-cl).
export function revealLine(s, fp, tips, n) {
  const cl = clausesOf(s.line), cuts = []; let acc = '';
  for (const c of cl.slice(0, -1)) { acc += c; cuts.push(nb(acc).length); }
  const nodes = rich(cl.join(''), s, fp, tips, cuts);
  paintClauses(nodes, n);
  return nodes;
}
/** Shows the first `n` clauses of a line (its spans, or the paragraph holding them): the rest are transparent and hidden from a reader. */
export function paintClauses(line, n) {
  for (const c of Array.isArray(line) ? line : line?.querySelectorAll('.pz-cl') || []) {
    const on = +c.dataset.cl < n;
    c.classList.toggle('on', on);
    if (on) c.removeAttribute('aria-hidden'); else c.setAttribute('aria-hidden', 'true');
  }
}
export const setFpAt = (v) => { fpAt = v; };
