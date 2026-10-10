// Presenter: projector-first presentations on the live model (decks.js), the instructor's own scripts
// and "Present a case".
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
// ← Page Up back, a number then Enter jumps, G the slide list, Home End, B or . black screen, F full screen, Q quiz,
// P projector contrast, Esc. On a touch screen a sideways swipe over the figure goes on or back.

import { store, replaceParams } from './store.js?v=5edd069b32';
import { h, toast, svgIcon, icon, fmt, clamp } from './util.js?v=e0101a3fa2';
import { download } from './records.js?v=50fb9dd463';
import { SITES } from './ladder.js?v=cab65850a4';
import { sinusoidSupported } from './sinusoid-view.js?v=5fb063d790';
import { NODES } from '../engine/topology.js?v=706a39d50b';
import { DECKS, REGIONS, LEVELS, withOverview } from './decks.js?v=93d381e8df';
import { createHvpgMonitor } from './hvpg-proc.js?v=a4d00d90a5';
import { createTools } from './presenter-tools.js?v=3fc540d53c';
import { openHandout } from './handout.js?v=252beba081';

const KEY = 'pps.scripts';
const readMine = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
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
const NO_ASC = 150;   // mL: below it there is no ascites to tap (ultrasound grade 1 starts here)
const vSize = (v) => (v < 2.5 ? ['ok', 'None'] : v < 5 ? ['mid', 'Small'] : ['hi', 'Large']);
// A name joined by an en dash (Budd–Chiari) never breaks at the dash.
// A slide's equation (decks.js eq: [MathML, legend]): typeset by the browser's own MathML, the legend under it.
function equation([ml, legend]) {
  const box = h('div', { class: 'pz-eq' });
  box.innerHTML = `<math>${ml}</math>`;   // (the decks' own constant markup, never user text)
  if (legend) box.append(h('p', { class: 'pz-eqk' }, legend));
  return box;
}
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
  liver: 'liver blood flow', shunt: 'shunt', sin: 'sinusoidal pressure', saag: 'SAAG', tp: 'protein', hb: 'hemoglobin', pvFlow: 'portal flow' };
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// What a word in a line can point at on the figure (a term pill, M1): the station's label (node), the vessels that
// glow (edges) or the organ outlined, in the station's colour (tone: --tr-<tone>), and the words that name it.
const TARGETS = {
  pv: { node: 'CONF', edges: ['PV_TRUNK'], tone: 'pv', words: 'portal vein' },
  sv: { node: 'SV', edges: ['SV_CONF', 'V_SPL'], tone: 'sv', words: 'splenic vein|splenic' },
  smv: { node: 'SMV', edges: ['SMV_CONF', 'V_INT'], tone: 'smv', words: 'superior mesenteric veins?|superior mesenteric' },
  sin: { node: 'SIN_R', organ: 'liver', tone: 'wedge', words: 'sinusoids?|sinusoidal pressure' },
  whvp: { node: 'SIN_R', organ: 'liver', tone: 'wedge', words: 'WHVP|wedged pressure' },
  fhvp: { node: 'RHV', edges: ['RHV_IVC'], tone: 'hv', words: 'FHVP|free pressure' },
  hv: { node: 'RHV', edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], tone: 'hv', words: 'hepatic veins?' },
  ivc: { node: 'IVCS', edges: ['IVCS_RA', 'IVC_IS'], tone: 'ivc', words: 'IVC|inferior vena cava' },
  ra: { node: 'RA', organ: 'heart-ra', tone: 'ra', words: 'right atrium' },
  varix: { node: 'VAR', edges: ['C1a', 'C1b'], tone: 'var', words: 'esophageal varices|varices|varix' },
  gv: { node: 'GV', edges: ['C2'], tone: 'var', words: 'gastric varices|fundal varices' },
  lgv: { node: 'LGV', edges: ['LGV_CONF', 'V_STO'], tone: 'var', words: 'left gastric vein|coronary vein' },
  azy: { node: 'AZY', edges: ['AZY_SVC'], tone: 'var', words: 'azygos(?: vein)?' },
  // The circuit's resistors (its zigzags): lit in a station colour, not outlined.
  rLiver: { res: 'rLiver', tone: 'wedge', words: 'resistance' },
  rColl: { res: 'rColl', tone: 'var', words: 'collaterals' },
  rGut: { res: 'rGut', site: 'rGut', tone: 'smv', words: 'gut arterioles' },
  lpv: { node: 'LPV', edges: ['PVH_L'], tone: 'pv', words: 'left portal vein' },
  lrv: { node: 'LRV', edges: ['LRV_IVC', 'V_KID_L'], tone: 'ivc', words: 'left renal vein' },
  spleen: { organ: 'spleen', tone: 'sv', words: 'spleen' },
  liver: { organ: 'liver', tone: 'wedge', words: 'liver' },
  heart: { organ: 'heart', tone: 'ra', words: 'heart' },
  // Inside the liver (lit: the lobule's and the sinusoid's own labels take the colour and a soft glow, .app[data-lit]).
  'lobule:triad': { lit: true, tone: 'pv', words: 'portal tracts?|portal triads?|portal venules?' },
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
const ORGANS = new Set(['liver', 'spleen', 'heart', 'heart-ra']);
// A vessel's station colour, for a glow written by hand (glow: ['PV_TRUNK']).
const EDGE_TONE = {};
for (const t of Object.values(TARGETS)) for (const e of t.edges || []) EDGE_TONE[e] ||= t.tone;
// (Collaterals and spontaneous shunts take the varices' colour: one family on the figure.)
for (const e of ['C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'S_PC', 'S_DSR', 'S_MC']) EDGE_TONE[e] ||= 'var';
// A live value's colour ({pv}): the station it is read at; a value with no station (HVPG) is a plain pill.
const VAL_TONE = { pv: 'pv', whvp: 'wedge', sin: 'wedge', fhvp: 'hv', ivc: 'ivc', ra: 'ra' };
// A reading with no station of its own (a size: the spleen, the varices) takes its status colour, as its card
// shows it, on its pill and on its organ's outline; neutral while it is normal.
const BY_RATE = new Set(['spleen', 'varix', 'gv']), RATE_TONE = { hi: '--danger', mid: '--caution' };
const rateTone = (k, fp) => RATE_TONE[rateOf(k, fp)[0]] || null;
const valTone = (k, fp) => (BY_RATE.has(k) ? rateTone(k, fp) : VAL_TONE[k]);
// A slide's terms: { words: target } (terms: ['pv', 'ra'] takes each target's own words).
function termList(s) {
  const t = s.terms;
  if (!t) return [];
  return (Array.isArray(t) ? t.map((k) => [TARGETS[k]?.words, k]) : Object.entries(t).map(([w, k]) => [esc(w), k])).filter(([w, k]) => w && TARGETS[k]);
}
/** Everything a slide points at on the figure: its terms (as the line names them) and its glow field. */
export function slideTargets(s, line = s.line || '') {
  const keys = new Set();
  for (const m of line.matchAll(/\[([^\]]+)\]\(([\w:]+)\)/g)) if (TARGETS[m[2]]) keys.add(m[2]);
  for (const [w, k] of termList(s)) if (new RegExp(`\\b(?:${w})\\b`, 'i').test(line)) keys.add(k);
  const labels = [], terms = {}, glow = new Map(), organs = new Map(), res = new Map(), lit = new Set(), sites = new Set();
  for (const k of keys) {
    const t = TARGETS[k];
    if (t.node) { labels.push(t.node); terms[t.node] = t.tone; }
    if (t.lit) lit.add(k);
    if (t.site) sites.add(t.site);
    for (const e of t.edges || []) glow.set(e, t.tone);
    if (t.organ) organs.set(t.organ, t.tone);
    if (t.res) res.set(t.res, t.tone);
  }
  // glowSeq (ms): the glow field lights in its order, one step apart (pressure passing back from the heart, D6).
  const at = new Map();
  (s.glow || []).forEach((g, i) => {
    const id = typeof g === 'string' ? g : g.id, tone = typeof g === 'string' ? null : g.tone, ms = s.glowSeq ? i * s.glowSeq : 0;
    const add = (e, tn) => { glow.delete(e); glow.set(e, tn); if (ms) at.set(e, ms); };
    if (TARGETS[id]) { const t = TARGETS[id]; if (t.lit) lit.add(id); if (t.res) res.set(t.res, tone || t.tone); for (const e of t.edges || []) add(e, tone || t.tone); if (t.organ) organs.set(t.organ, tone || t.tone); }
    else if (ORGANS.has(id)) organs.set(id, tone || TARGETS[id]?.tone);
    else add(id, tone || EDGE_TONE[id] || 'accent');
  });
  return { labels, terms, glow: [...glow].map(([id, tone]) => ({ id, tone, at: at.get(id) || 0 })), organs: [...organs].map(([id, tone]) => ({ id, tone })), res: [...res].map(([id, tone]) => ({ id, tone })), lit: [...lit], sites: [...sites] };
}
// A live value pill ({pv}): the model's reading for this slide, rounded as its card shows it (the ladder's
// stations in whole mmHg on a ladder slide).
const LADDER_KEYS = new Set(RUNGS.map(([k]) => k));
function liveVal(k, s, fp) {
  const T = TILE[k], v = fp?.[k];
  if (v == null || !Number.isFinite(v)) return '…';
  const d = s.data === 'ladder' && LADDER_KEYS.has(k) ? 0 : T.d ?? 1;
  return `${fmt(v * (T.x || 1), d)}${T.u ? ` ${T.u}` : ''}`;
}
// A line, typeset (see above). Also: {pv} a live value, {>=10 mmHg} a cut-off (outlined), and a term that points
// at the figure, [portal vein](pv) or through the slide's terms field, as a pill in its station's colour.
function rich(t, s = {}, fp = null) {
  const keys = [...(s.key || []).map((k) => KEYWORDS[k]).filter(Boolean), ...(s.bold || []).map(esc)];
  const tl = termList(s), tw = tl.map(([w]) => w.replace(/(^|\|)([a-z])/g, (_, p, c) => `${p}[${c}${c.toUpperCase()}]`));   // (a term may open the sentence)
  const marked = /\{[^}]+\}/.test(t);
  // (A group that never matches holds the place of an empty list, so each kind keeps its group number.)
  const re = new RegExp(String.raw`\[([^\]]+)\]\(([\w:]+)\)|\{([^}]+)\}([,.;:]?)` + (tw.length ? `|\\b(${tw.join('|')})\\b` : '|((?!))') + `|(${VAL})([,.;:]?)` + (keys.length ? `|\\b(${keys.join('|')})\\b` : '|((?!))') + `|\\b(${TERMS.join('|')})\\b`, 'g');
  const out = [], seen = new Set(), seenT = new Set(); let at = 0, bold = 0, pills = 0, m;
  t = nb(t);
  // A pill keeps the word before it and the stop after it on its line (a no-break space, one unbreakable span).
  const glue = () => { const prev = out[out.length - 1]; if (typeof prev === 'string') out[out.length - 1] = prev.replace(/ $/, '\u00a0'); };
  const pill = (v, stop, cls = '', tone = null) => { glue();
    pills++; return h('span', { class: 'pz-nw' }, h('span', { class: `pz-val${cls}${tone ? ' tone' : ''}`, style: tone ? `--tone: ${toneVar(tone)}` : null }, v.replace(/\s(?=mmHg|g\/dL|mL|kPa|cm\/s|mm\b|%)/, '\u00a0')), stop || ''); };
  const termPill = (w, k) => { const tone = TARGETS[k].organ === 'spleen' ? (fp && rateTone('spleen', fp)) || '--text-2' : TARGETS[k].tone;   // (the spleen's word, as its outline)
    return h('span', { class: 'pz-term', 'data-target': k, style: `--tone: ${toneVar(tone)}` }, w); };
  while ((m = re.exec(t))) {
    const [all, lw, lk, mk, mkStop, tword, val, valStop, key, term] = m, w = (key || term)?.toLowerCase().replace(/(?:s|ces)$/, '');
    if (val && (marked || pills || s.pill === false)) continue;
    if (term && (seen.has(w) || bold >= 3)) continue;
    if (key && seen.has(w)) continue;
    const tk = tword ? tl.find(([x]) => new RegExp(`^(?:${x})$`, 'i').test(tword))?.[1] : null;
    if (tword && (!tk || seenT.has(tk))) continue;
    out.push(t.slice(at, m.index));
    if (lw) out.push(TARGETS[lk] ? termPill(lw, lk) : lw);
    else if (tword) { seenT.add(tk); out.push(termPill(tword, tk)); }
    else if (mk && TILE[mk]) out.push(pill(liveVal(mk, s, fp), mkStop, '', valTone(mk, fp)));
    else if (mk && /^[<>≥≤]=?/.test(mk)) out.push(pill(mk.replace(/^(?:>=|<=|[<>≥≤])\s*/, ''), mkStop, ' cut'));
    else if (mk) out.push(pill(mk, mkStop));
    else if (val) out.push(pill(val, valStop));
    else { seen.add(w); bold++; out.push(h('b', {}, key || term)); }
    at = m.index + all.length;
    // (A term pill keeps the stop or bracket after it on its line.)
    const last = out[out.length - 1];
    if (last?.classList?.contains('pz-term') && /^[),.;:]+/.test(t.slice(at))) { const st = t.slice(at).match(/^[),.;:]+/)[0]; out[out.length - 1] = h('span', { class: 'pz-nw' }, last, st); at += st.length; }
  }
  out.push(t.slice(at));
  return out;
}
// The five stations' colours with their names, once on a ladder or catheter slide (D1): the figure's labels and
// the ladder's points take the same colours.
const STATIONS = [['pv', 'Portal vein'], ['wedge', 'Sinusoids · WHVP'], ['hv', 'Hepatic vein · FHVP'], ['ivc', 'IVC'], ['ra', 'Right atrium']];
const stationKey = () => h('div', { class: 'pz-stk', role: 'list', 'aria-label': 'Station colours' },
  STATIONS.map(([t, w]) => h('span', { role: 'listitem', style: `--c:var(--tr-${t})` }, h('i'), w)));
// The still column inside the lobule (D5), for a wedge slide with column: true: the balloon stops the hepatic vein,
// and the column behind it (in the wedge colour) fills back through the central venule and the sinusoids to the
// first moving blood. Here it stops at a block in the portal tract (schistosomiasis), so the wedge never sees it.
function wedgeColumn() {
  const S = 'http://www.w3.org/2000/svg', el = (t, a = {}, txt) => { const e = document.createElementNS(S, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (txt) e.textContent = txt; return e; };
  const svg = el('svg', { class: 'pz-col', viewBox: '0 0 360 98', role: 'img', 'aria-label': 'The still column fills from the balloon back through the central venule and the sinusoids, and stops at the block in the portal tract.' });
  svg.append(
    el('rect', { class: 'c-pv', x: 4, y: 36, width: 76, height: 18, rx: 9 }),
    el('rect', { class: 'c-sin', x: 92, y: 38, width: 146, height: 14 }),
    el('rect', { class: 'c-hv', x: 238, y: 35, width: 104, height: 20, rx: 10 }),
    el('rect', { class: 'c-fill', x: 92, y: 35, width: 238, height: 20, rx: 6 }),
    el('ellipse', { class: 'c-bal', cx: 330, cy: 45, rx: 13, ry: 13 }),
    el('path', { class: 'c-blk', d: 'M78 33 L94 57 M94 33 L78 57' }),
    el('text', { class: 'c-top', x: 211, y: 24, 'text-anchor': 'middle' }, 'Still column: reads the sinusoids'),
    ...[[40, 'Portal vein'], [165, 'Sinusoids'], [262, 'Central venule'], [330, 'Balloon']].map(([x, t]) => el('text', { x, y: 76, 'text-anchor': 'middle' }, t)),
    el('text', { class: 'c-blkt', x: 86, y: 92, 'text-anchor': 'middle' }, 'Block in the portal tract'));
  requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add('in')));
  return svg;
}
const RATE = {
  hvpg: (v) => (v >= 10 ? ['hi', 'CSPH'] : v >= 5 ? ['mid', 'Raised'] : ['ok', 'Normal']),
  ppg: (v) => (v >= 12 ? ['hi', 'High'] : v >= 6 ? ['mid', 'Raised'] : ['ok', 'Normal']),
  pv: (v) => (v > 10 ? ['hi', 'High'] : ['ok', 'Normal']),
  sin: (v) => (v >= 12 ? ['hi', 'High'] : v >= 9 ? ['mid', 'Raised'] : ['ok', 'Normal']),
  saag: (v, f) => (f.asc < NO_ASC ? [null, 'No ascites'] : v >= 1.1 ? ['hi', 'Portal hypertension'] : ['ok', 'Not portal']),
  // (Protein is neither good nor bad, except that below 1.5 g/dL it no longer guards against infection.)
  tp: (v, f) => (f.asc < NO_ASC ? [null, 'No ascites'] : v >= 2.5 ? ['info', 'High'] : v < 1.5 ? ['mid', 'Low: SBP risk'] : ['info', 'Low']),
  asc: (v) => (v < NO_ASC ? ['ok', 'None'] : v < 1500 ? ['mid', 'Grade 1, ultrasound only'] : v < 5000 ? ['hi', 'Grade 2, moderate'] : ['hi', 'Grade 3, tense']),
  varix: vSize, gv: vSize,
  spleen: (v) => (v > 13 ? ['hi', 'Enlarged'] : ['ok', 'Normal']),
  plt: (v) => (v < 100 ? ['hi', 'Low'] : v < 150 ? ['mid', 'Low'] : ['ok', 'Normal']),
  pvFlow: (v) => (v < 0 ? ['hi', 'Reversed, away from the liver'] : [null, 'Toward the liver']),
  liver: (v) => (v < 50 ? ['hi', 'Low'] : v < 80 ? ['mid', 'Reduced'] : ['ok', 'Normal']),
  shunt: (v) => (v >= 0.5 ? ['hi', 'Large'] : v >= 0.2 ? ['mid', 'Moderate'] : ['ok', 'Small']),
  map: (v) => (v < 65 ? ['hi', 'Low'] : ['ok', 'Normal']),
  // Liver stiffness (Baveno VII): under 10 kPa normal, 15 to 25 the grey zone, 25 or more CSPH.
  lsm: (v) => (v >= 25 ? ['hi', 'CSPH likely'] : v >= 15 ? ['mid', 'Gray zone'] : v >= 10 ? ['mid', 'Raised'] : ['ok', 'Normal']),
  ra: (v) => (v > 8 ? ['hi', 'High'] : ['ok', 'Normal']),
  salb: (v) => (v < 3.5 ? ['mid', 'Low'] : ['ok', 'Normal']),
  hr: (v) => [null, v < 60 ? 'Slow' : v > 100 ? 'Fast' : 'Normal'],
  ivc: (v) => (v > 8 ? ['hi', 'High'] : ['ok', 'Normal']),
  hb: (v) => (v < 7 ? ['hi', 'Low'] : v < 12 ? ['mid', 'Below normal'] : ['ok', 'Normal']),
};
// Each tile: its name, what it is, the unit, the decimals (1 unless d), a scale (x) and which way is better
// (−1 lower, 1 higher) for the colour of a change.
const TILE = {
  hvpg: { t: 'HVPG', s: 'Wedged − free', u: 'mmHg', better: -1 },
  ppg: { t: 'PPG', s: 'Portal − IVC', u: 'mmHg', better: -1 },
  pv: { t: 'Portal vein', s: 'Pressure', u: 'mmHg', better: -1 },
  sin: { t: 'Sinusoids', s: 'Pressure', u: 'mmHg', better: -1 },
  whvp: { t: 'WHVP', s: 'Wedged hepatic vein', u: 'mmHg', better: -1 },
  fhvp: { t: 'FHVP', s: 'Free hepatic vein', u: 'mmHg', better: -1 },
  saag: { t: 'SAAG', s: 'Serum − ascites albumin', u: 'g/dL' },
  tp: { t: 'Ascites protein', s: 'Total protein', u: 'g/dL' },
  asc: { t: 'Ascites', s: 'Volume', u: 'L', x: 0.001, better: -1 },
  varix: { t: 'Esophageal varix', s: 'Diameter', u: 'mm', better: -1 },
  gv: { t: 'Gastric varix', s: 'Fundal, diameter', u: 'mm', better: -1 },
  spleen: { t: 'Spleen', s: 'Length', u: 'cm', better: -1 },
  plt: { t: 'Platelets', s: '× 10⁹ per litre', u: '', d: 0, better: 1 },
  pvFlow: { t: 'Portal vein flow', s: 'Mean', u: 'L/min' },
  liver: { t: 'Liver blood flow', s: 'Through the sinusoids, of normal', u: '%', d: 0, better: 1 },
  shunt: { t: 'Shunted', s: 'Portal blood bypassing the liver', u: '%', x: 100, d: 0, better: -1 },
  map: { t: 'Blood pressure', s: 'Mean arterial', u: 'mmHg', d: 0 },
  hr: { t: 'Heart rate', s: 'Beats a minute', u: '/min', d: 0 },
  lsm: { t: 'Liver stiffness', s: 'FibroScan', u: 'kPa', better: -1 },
  ra: { t: 'Right atrium', s: 'Pressure', u: 'mmHg', better: -1 },
  salb: { t: 'Serum albumin', s: 'Blood', u: 'g/dL', better: 1 },
  ivc: { t: 'IVC', s: 'Pressure', u: 'mmHg', better: -1 },
  hb: { t: 'Hemoglobin', s: 'Blood', u: 'g/dL', better: 1 },
};
const rateOf = (k, f) => (RATE[k] && f && f[k] != null ? RATE[k](f[k], f) : [null, '']);
const tileVal = (k, v) => (v == null ? '—' : fmt(v * (TILE[k]?.x ?? 1), TILE[k]?.d ?? 1));
// The live model's numbers in the fingerprint's terms (a time-lapse plays on the live figure).
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
function liveFp(fr) {
  const m = fr.metrics, a = m.ascites, P = fr.Pf || fr.P;
  return { pv: m.pv, whvp: m.whvp, fhvp: m.fhvp, hvpg: m.hvpg, ra: m.ra, ivc: m.ivc, ppg: m.ppg, asc: a.volume, saag: a.saag, tp: a.totalProtein,
    sin: P?.[NI.SIN_R], int: P?.[NI.INT], varix: m.varix.d, gv: m.gastricVarix.d, spleen: m.spleen.length, plt: m.spleen.platelets,
    pvFlow: m.pvFlowMean, shunt: m.shuntFraction, liver: m.liverPerfPct, map: m.map, hr: m.hr, lsm: m.lsm, pvVel: m.pvVelMean, hb: m.blood?.hb };
}

// A value counts from where it was to where it goes (eased, about a second); reduced motion jumps.
function tweener(draw) {
  let cur = null, raf = 0;
  return (to, ms = 950) => {
    cancelAnimationFrame(raf);
    if (!cur || reduce.matches || ms === 0) { cur = { ...to }; draw(cur); return; }
    const from = { ...cur }, t0 = performance.now();
    const step = (now) => {
      const u = ease(clamp((now - t0) / ms, 0, 1));
      for (const k of Object.keys(to)) cur[k] = from[k] == null || to[k] == null ? to[k] : from[k] + (to[k] - from[k]) * u;
      draw(cur);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
let uid = 0;

/** The pressure ladder at projector size: five stations, the healthy line dashed behind, every fall of
 *  more than 4 mmHg shaded as a block. Under the axis, as on the app's own pressure chart, two spans run
 *  along the stations, named: HVPG (wedged to free hepatic vein) and PPG (portal
 *  vein to the IVC), coloured by their cut-offs, with faint leaders up to the
 *  stations they join. set(f, { key }) glides the line and counts the numbers. */
function bigLadder() {
  const W = 500, H = 362, X = (i) => 56 + i * 97;
  // The axis runs to 30 mmHg, or to the next 10 above the highest station (an acute portal vein clot reads in the 40s); it eases when that changes.
  let top = 30, baseVals = null;
  const Y = (v) => 252 - clamp(v, 0, top) * (198 / top);
  const SPAN_Y = { hvpg: 278, ppg: 316 };
  const gid = 'pzGrad' + ++uid;
  const base = sv('path', { class: 'pzl-base' });
  const line = sv('path', { class: 'pzl-line', stroke: `url(#${gid})` });
  const bands = [0, 1, 2, 3].map((i) => {
    const r = sv('rect', { x: X(i) + 16, y: Y(30) - 6, width: 97 - 32, height: Y(0) - Y(30) + 6, rx: 12 });   // (y and height follow the axis, in draw)
    const t = sv('text', { x: (X(i) + X(i + 1)) / 2, y: 26, 'text-anchor': 'middle' });
    return { g: sv('g', { class: 'pzl-drop', opacity: 0 }, r, t), t, r };
  });
  const pts = RUNGS.map(([, a], i) => {
    const c = sv('circle', { cx: X(i), r: 8.5 }), v = sv('text', { class: 'pzl-v', x: X(i), 'text-anchor': 'middle' });
    return { g: sv('g', { class: 'pzl-pt' }, c, v, sv('text', { class: 'pzl-k', x: X(i), y: H - 8, 'text-anchor': 'middle' }, a)), c, v };
  });
  // A gradient span: a bar with end caps from one station's column to another's, dotted leaders up to the two
  // station points, and a pill in the middle with its name (the numbers are in the tiles below).
  const span = (name, row, i0, i1) => {
    const x0 = X(i0), x1 = X(i1), w = name === 'HVPG' ? 78 : 66, mid = (x0 + x1) / 2;
    const lead = sv('path', { class: 'pzl-lead' }), bar = sv('path', { class: 'pzl-br', d: `M${x0} ${row - 5}V${row + 5}M${x1} ${row - 5}V${row + 5}M${x0} ${row}H${x1}` });
    const pill = sv('rect', { class: 'pzl-pill', x: mid - w / 2, y: row - 13, width: w, height: 26, rx: 13 }), txt = sv('text', { class: 'pzl-bk', x: mid, y: row + 5, 'text-anchor': 'middle' }, name);
    return { name, x0, x1, row, lead, pill, txt, w, mid, g: sv('g', { class: 'pzl-bg', opacity: 0 }, lead, bar, pill, txt) };
  };
  const hv = span('HVPG', SPAN_Y.hvpg, 1, 2), pp = span('PPG', SPAN_Y.ppg, 0, 3);
  const grid = [0, 10, 20, 30, 40, 50].map((v) => {
    const line = sv('line', { x1: 44, x2: W - 10 }), txt = sv('text', { x: 34, 'text-anchor': 'end' }, String(v));
    return { v, line, txt, g: sv('g', { class: 'pzl-grid' }, line, txt) };
  });
  const drawBase = () => base.setAttribute('d', baseVals ? RUNGS.map(([k], i) => `${i ? 'L' : 'M'}${X(i)} ${Y(baseVals[k]).toFixed(1)}`).join(' ') : '');
  let verdict = {};
  const el = sv('svg', { class: 'pz-ladder', viewBox: `0 0 ${W} ${H}`, role: 'img' },
    sv('defs', {}, sv('linearGradient', { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 }, sv('stop', { offset: 0, 'stop-color': 'var(--tour-portal)' }), sv('stop', { offset: 1, 'stop-color': 'var(--tour-sys)' }))),
    grid.map((r) => r.g),
    bands.map((b) => b.g), hv.g, pp.g, base, line, pts.map((p) => p.g));
  const draw = tweener((f) => {
    top = clamp(f.top || 30, 30, 50);
    for (const g of grid) {
      g.line.setAttribute('y1', Y(g.v).toFixed(1)); g.line.setAttribute('y2', Y(g.v).toFixed(1)); g.txt.setAttribute('y', (Y(g.v) + 5).toFixed(1));
      g.g.setAttribute('opacity', g.v <= 30 ? 1 : clamp((top - g.v) / 10 + 1, 0, 1).toFixed(3));
    }
    bands.forEach((b) => { b.r.setAttribute('y', (Y(top) - 6).toFixed(1)); b.r.setAttribute('height', (Y(0) - Y(top) + 6).toFixed(1)); });
    drawBase();
    const y = RUNGS.map(([k]) => Y(f[k]));
    line.setAttribute('d', y.map((yy, i) => `${i ? 'L' : 'M'}${X(i)} ${yy.toFixed(1)}`).join(' '));
    pts.forEach((p, i) => { p.c.setAttribute('cy', y[i].toFixed(1)); p.v.setAttribute('y', (y[i] - 18).toFixed(1)); p.v.textContent = fmt(f[RUNGS[i][0]], 0); });
    bands.forEach((b, i) => {
      const d = f[RUNGS[i][0]] - f[RUNGS[i + 1][0]];
      b.g.setAttribute('opacity', clamp((d - 4) / 3, 0, 1).toFixed(3));
      // (From the rounded readings shown at the two stations, so the fall always adds up: 20 to 7 reads Δ 13.)
      b.t.textContent = `Δ ${fmt(Math.max(0, Math.round(f[RUNGS[i][0]]) - Math.round(f[RUNGS[i + 1][0]])), 0)} mmHg`;
    });
    // Each span fades out when a level is not measurable (Budd-Chiari has no wedge). Its leaders end on the points.
    // A slide's verdict on a gradient (brackets: { hvpg: 'misleads', ppg: 'works' }) colours its bracket red or green
    // and writes its number in the pill.
    const put = (b, hi, lo, v, rate) => {
      const ok = Number.isFinite(hi) && Number.isFinite(lo) && Number.isFinite(v);
      b.g.setAttribute('opacity', ok ? 1 : 0);
      if (!ok) return;
      b.lead.setAttribute('d', `M${b.x0} ${b.row - 9}V${(Y(hi) + 12).toFixed(1)}M${b.x1} ${b.row - 9}V${(Y(lo) + 12).toFixed(1)}`);
      const say = verdict[b.name.toLowerCase()];
      b.g.dataset.rate = say ? (say === 'misleads' ? 'hi' : 'ok') : rate;
      b.g.classList.toggle('says', !!say);
      const w = say ? b.w + 52 : b.w, label = say ? `${b.name} ${fmt(v, 1)}` : b.name;
      if (b.txt.textContent !== label) { b.txt.textContent = label; b.pill.setAttribute('x', b.mid - w / 2); b.pill.setAttribute('width', w); }
    };
    put(hv, f.whvp, f.fhvp, f.hvpg, rateOf('hvpg', f)[0] || 'ok');
    put(pp, f.pv, f.ivc, f.ppg, rateOf('ppg', f)[0] || 'ok');
    el.setAttribute('aria-label', 'Pressure ladder: ' + RUNGS.map(([k, a]) => `${a} ${fmt(f[k], 0)}`).join(', ') + ' mmHg. '
      + `HVPG ${fmt(f.hvpg, 1)}, PPG ${fmt(f.ppg, 1)} mmHg.`);
  });
  return {
    el,
    setBase(b) { baseVals = b; drawBase(); },
    set(f, { key = [], ms, brackets = null } = {}) {
      verdict = brackets || {};
      pts.forEach((p, i) => p.g.classList.toggle('key', key.includes(RUNGS[i][0])));
      draw({ top: Math.max(30, Math.ceil(Math.max(f.pv, f.whvp, f.fhvp, f.ra, f.ivc ?? f.ra) / 10) * 10 || 30), pv: f.pv, whvp: f.whvp, fhvp: f.fhvp, ra: f.ra, ivc: f.ivc ?? f.ra, hvpg: f.hvpg, ppg: f.ppg }, ms);
    },
  };
}

/** Big number tiles, each rated; set() counts to the new values. Given ref (an earlier state's numbers), each
 *  tile also says how far it moved from there, green when it went the better way (and plain within normal). */
function bigTiles() {
  const el = h('div', { class: 'pz-tiles' });
  let sig = '', parts = [], draw = null, goal = false;
  // After TIPS the PPG is read against its target (below 12 mmHg), so a tile never says "Raised" under a line that
  // says the target is reached.
  const rated = (k, f) => (goal && k === 'ppg' && f.ppg != null ? (f.ppg < 12 ? ['ok', 'Below 12: target met'] : ['hi', '12 or more: target not met']) : rateOf(k, f));
  function build(ks, withRef) {
    parts = ks.map((k) => {
      const T = TILE[k] || { t: k, s: '', u: '' };
      const v = h('span', { class: 'pzt-v' }), u = h('small', {}, T.u), r = h('span', { class: 'pzt-r' }), d = h('span', { class: 'pzt-d' });
      const tile = h('div', { class: 'pz-tile' }, h('span', { class: 'pzt-k' }, T.t), h('span', { class: 'pzt-vu' }, v, u), r, withRef ? d : null);
      return { k, T, tile, v, u, r, d };
    });
    el.replaceChildren(...parts.map((p) => p.tile));
    el.dataset.n = String(parts.length);
    draw = tweener((f) => parts.forEach((p) => {
      const [cls, word] = rated(p.k, f), none = cls == null && (p.k === 'saag' || p.k === 'tp');
      p.v.textContent = none ? '—' : tileVal(p.k, f[p.k]);
      p.u.hidden = none || !p.T.u;
      p.r.textContent = word;
      p.tile.dataset.rate = cls || 'none';
      const r0 = f['ref_' + p.k];
      if (r0 == null || f[p.k] == null) return;
      const x = p.T.x ?? 1, dg = p.T.d ?? 1, dd = (f[p.k] - r0) * x, same = Math.abs(dd) < 0.5 * 10 ** -dg;
      // "Up 9 points from 82%", "Down 2.1 mmHg from 17.7": the change, then where it started (never read as "up to").
      const pct = p.T.u === '%', by = pct ? (Math.abs(dd) === 1 ? ' point' : ' points') : p.T.u ? ' ' + p.T.u : '';
      p.d.textContent = same ? 'No change' : `${dd < 0 ? '▼ Down' : '▲ Up'} ${fmt(Math.abs(dd), dg)}${by} from ${fmt(r0 * x, dg)}${pct ? '%' : ''}`;
      const calm = cls === 'ok' && rated(p.k, { ...f, [p.k]: r0 })[0] === 'ok';   // (a change within normal is neither)
      p.d.dataset.way = same || calm || !p.T.better ? '' : Math.sign(dd) === p.T.better ? 'good' : 'bad';
    }));
  }
  return {
    el,
    set(f, ks, key = [], ref = null, ms, tips = false) {
      goal = !!tips;
      const sg = ks.join() + (ref ? '|ref' : '');
      if (sg !== sig) { sig = sg; build(ks, !!ref); }
      parts.forEach((p) => p.tile.classList.toggle('key', key.includes(p.k)));
      const to = Object.fromEntries([...ks, 'asc'].map((k) => [k, f[k]]));
      if (ref) for (const k of ks) to['ref_' + k] = ref[k];
      draw(to, ms);
    },
  };
}

/** The six levels, portal vein to heart, the liver's three bracketed; mode: 'all' names each level and
 *  its place, a level id marks that one as the block, null shows the levels unmarked (a quiz). */
function rail(mode) {
  const at = SITES.findIndex(([id]) => id === mode);
  return h('div', { class: 'pz-rail' + (mode === 'all' ? ' all' : at >= 0 ? ' one' : ''), role: 'img', 'aria-label': at >= 0 ? `Block: ${SITES[at][1].replace('­', '')}` : 'Six levels: pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic, cardiac' },
    h('div', { class: 'pz-rail-liver' }, h('span', {}, 'Liver')),
    h('ol', {}, SITES.map(([id, name, place], i) => h('li', { 'data-site': id, class: i === at ? 'on' : null },
      h('i', {}, i === at ? h('b') : null), h('span', { class: 'n' }, name), mode === 'all' ? h('span', { class: 'p' }, place) : null))));
}

// ── Visuals over the dimmed figure ─────────────────
/** One number on a scale with its thresholds, each patient a pin that glides from zero to its value.
 *  sc: { key, max, low, marks: [[value, words]] }: each zone is named under its middle (low names the
 *  first), a name too wide for its zone on two lines; rows: [{ name, f, site }]. */
// A visual's own patient ({ preset } with its params and days, if any), as one key.
const xKey = (o) => o.preset + (o.params || o.days ? JSON.stringify([o.params, o.days]) : '');
// Pressures read in whole mmHg on every visual; the rest keep their decimal.
const WHOLE = new Set(['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg', 'sin', 'map']);
const dig = (k) => (WHOLE.has(k) ? 0 : TILE[k]?.d ?? 1);
function scaleVisual(sc, rows) {
  if (sc.key === 'lsm' || sc.legend) return scaleKey(sc, rows);
  const W = 1400, H = 480, x0 = 70, x1 = W - 60, max = sc.max || 20, X = (v) => x0 + (x1 - x0) * clamp(v, 0, max) / max, Y = 268;
  const cuts = [0, ...sc.marks.map(([v]) => v), max];
  const zones = cuts.slice(0, -1).map((a, i) => [a, cuts[i + 1], ['ok', 'mid', 'hi', 'top'][Math.min(i, 3)], i ? sc.marks[i - 1][1] : sc.low]);
  const words = (t, x, room) => {
    // A name may carry its own line breaks; otherwise one too wide for its zone splits at the middle space.
    const sp = [...t.matchAll(/ /g)].map((m) => m.index), at = sp.sort((a, b) => Math.abs(a - t.length / 2) - Math.abs(b - t.length / 2))[0];
    const lines = t.includes('\n') ? t.split('\n') : t.length * 13.5 > room - 20 && at != null ? [t.slice(0, at), t.slice(at + 1)] : [t];
    return sv('text', { class: 'pzs-mw', x, y: Y + 116, 'text-anchor': 'middle' }, lines.map((l, i) => sv('tspan', { x, dy: i ? 34 : 0 }, l)));
  };
  const pins = [...rows].filter((r) => r.f).sort((a, b) => a.f[sc.key] - b.f[sc.key]);
  const svg = sv('svg', { class: 'pz-scale', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': pins.map((r) => `${r.name} ${fmt(r.f[sc.key], dig(sc.key))}`).join(', ') },
    zones.map(([a, b, c]) => sv('rect', { class: 'pzs-zone', 'data-rate': c, x: X(a), y: Y - 22, width: X(b) - X(a), height: 44 })),
    sc.marks.map(([v]) => sv('g', { class: 'pzs-mark' },
      sv('line', { x1: X(v), x2: X(v), y1: Y - 34, y2: Y + 34 }),
      sv('text', { class: 'pzs-mv', x: X(v), y: Y + 78, 'text-anchor': 'middle' }, String(v)))),
    zones.map(([a, b, , t]) => t ? words(t, (X(a) + X(b)) / 2, X(b) - X(a)) : null),
    sv('text', { class: 'pzs-mv', x: x0, y: Y + 78, 'text-anchor': 'middle' }, '0'),
    sv('text', { class: 'pzs-unit', x: x1, y: Y + 78, 'text-anchor': 'end' }, `${max}+ ${TILE[sc.key]?.u || ''}`),
    pins.map((r, i) => {
      const v = r.f[sc.key], up = i % 2 ? 150 : 72, [rate] = rateOf(sc.key, r.f);
      const g = sv('g', { class: 'pzs-pin', 'data-rate': rate || 'none', style: `--x:${(X(v) - x0).toFixed(1)}px; --i:${i}` },
        sv('line', { x1: x0, x2: x0, y1: Y - up + 12, y2: Y - 14 }),
        sv('circle', { cx: x0, cy: Y, r: 15 }),
        sv('text', { class: 'pzs-pv', x: x0, y: Y - up - 14, 'text-anchor': 'middle' }, fmt(v, dig(sc.key))),
        sv('text', { class: 'pzs-pn', x: x0, y: Y - up + 4 - 54, 'text-anchor': 'middle' }, r.name));
      return g;
    }));
  // (A timer too: a tablet can hold back its first frames while the card lays out, and the pins must never wait at zero.)
  const go = () => svg.classList.add('in');
  requestAnimationFrame(() => requestAnimationFrame(go)); setTimeout(go, 120);
  return h('div', { class: 'pz-visual' }, svg);
}

/** The scale as a figure that reflows: short zone names over the band, the cut-offs under it, each patient a
 *  numbered dot gliding to its value, named in a key below (value, name and, with sub, a second reading). */
function scaleKey(sc, rows) {
  const max = sc.max || 20, u = TILE[sc.key]?.u || '', P = (v) => `${(100 * clamp(v, 0, max) / max).toFixed(2)}%`;
  const cuts = [0, ...sc.marks.map(([v]) => v), max];
  const zones = cuts.slice(0, -1).map((a, i) => ({ a, b: cuts[i + 1], c: ['ok', 'mid', 'hi', 'top'][Math.min(i, 3)], t: i ? sc.marks[i - 1][2] || sc.marks[i - 1][1] : sc.low }));   // (a mark's third item: its short name, for the band)
  const span = (z) => `left:${P(z.a)};width:calc(${P(z.b)} - ${P(z.a)})`;
  const pins = rows.filter((r) => r.f).sort((a, b) => a.f[sc.key] - b.f[sc.key]);
  // (each patient takes the colour of the zone it sits in)
  const rate = (r) => (zones.find((z) => r.f[sc.key] < z.b) || zones[zones.length - 1]).c;
  // A second reading or several under each patient (sub: a tile key or a list), pressures in whole mmHg.
  const SUBNAME = { hvpg: 'HVPG', plt: 'Platelets', ppg: 'PPG' };
  const sub = (f) => [sc.sub || []].flat().filter((k) => f[k] != null).map((k) => `${SUBNAME[k] || TILE[k]?.t || k} ${fmt(f[k], dig(k))}${TILE[k]?.u ? ` ${TILE[k].u}` : ''}`);
  const box = h('div', { class: 'pz-visual pz-sk', role: 'img', 'aria-label': pins.map((r) => `${r.name} ${fmt(r.f[sc.key], 1)} ${u}`).join(', ') },
    h('div', { class: 'pzk-names', 'aria-hidden': 'true' }, zones.map((z) => h('span', { 'data-rate': z.c, style: span(z) }, z.t))),
    h('div', { class: 'pzk-bar', 'aria-hidden': 'true' },
      zones.map((z) => h('i', { 'data-rate': z.c, style: span(z) })),
      sc.marks.map(([v]) => h('b', { style: `left:${P(v)}` })),
      pins.map((r, i) => h('span', { class: 'pzk-dot', 'data-rate': rate(r), style: `--x:${P(r.f[sc.key])};--i:${i}` }, String(i + 1)))),
    h('div', { class: 'pzk-axis', 'aria-hidden': 'true' }, [0, ...sc.marks.map(([v]) => v)].map((v) => h('span', { style: `left:${P(v)}` }, String(v))), h('span', { class: 'end' }, `${max}+ ${u}`)),
    // (rules: each zone's rule in words, under its stretch of the axis)
    sc.rules ? h('div', { class: 'pzk-rules' }, zones.map((z, i) => h('span', { 'data-rate': z.c, style: span(z) }, sc.rules[i] || ''))) : null,
    h('ol', { class: 'pzk-key' }, pins.map((r, i) => h('li', { 'data-rate': rate(r), style: `--i:${i}` },
      h('span', { class: 'pzk-n' }, String(i + 1)),
      h('span', { class: 'pzk-v' }, fmt(r.f[sc.key], dig(sc.key)), h('small', {}, ` ${u}`)),
      h('span', { class: 'pzk-name' }, r.name),
      sub(r.f).map((t) => h('span', { class: 'pzk-sub' }, t))))));
  const go = () => box.classList.add('in');
  requestAnimationFrame(() => requestAnimationFrame(go)); setTimeout(go, 120);
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
  const W = 760, H = 640, L = 96, R = W - 24, T = 24, B = H - 92, X = (v) => L + (R - L) * clamp(v, 0, 3) / 3, Y = (v) => B - (B - T) * clamp(v, 0, 5) / 5;
  const xs = X(1.1), ys = Y(2.5);
  const pts = [];
  for (const r of rows) {
    if (!r.f || r.f.asc < NO_ASC) continue;
    const near = pts.find((p) => Math.abs(p.saag - r.f.saag) < 0.3 && Math.abs(p.tp - r.f.tp) < 0.5);   // (labels that would overlap)
    if (near) near.names.push(r.name); else pts.push({ saag: r.f.saag, tp: r.f.tp, names: [r.name], site: r.site });
  }
  const box = [[L, T, xs, ys], [xs, T, R, ys], [L, ys, xs, B], [xs, ys, R, B]];
  const quadOf = (q) => box[(q.y ? 0 : 2) + q.x];
  const svg = sv('svg', { class: 'pz-quad', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'SAAG against ascites protein: ' + pts.map((p) => `${p.names.join(' and ')}, SAAG ${fmt(p.saag, 1)}, protein ${fmt(p.tp, 1)}`).join('; ') },
    QUADS.map((q) => { const [a, b, c, d] = quadOf(q); return sv('g', { class: 'pzq-q', 'data-portal': q.x ? 'y' : 'n' }, sv('rect', { x: a, y: b, width: c - a, height: d - b }), sv('text', { class: 'pzq-n', x: q.x ? c - 16 : a + 16, y: q.y ? b + 46 : d - 18, 'text-anchor': q.x ? 'end' : 'start' }, String(q.n))); }),
    sv('line', { class: 'pzq-cut', x1: xs, x2: xs, y1: T, y2: B }), sv('line', { class: 'pzq-cut', x1: L, x2: R, y1: ys, y2: ys }),
    sv('line', { class: 'pzq-axis', x1: L, x2: R, y1: B, y2: B }), sv('line', { class: 'pzq-axis', x1: L, x2: L, y1: T, y2: B }),
    [[0, '0'], [1.1, '1.1'], [2, '2'], [3, '3']].map(([v, t]) => sv('text', { class: 'pzq-t' + (v === 1.1 ? ' on' : ''), x: X(v), y: B + 34, 'text-anchor': 'middle' }, t)),
    [[0, '0'], [2.5, '2.5'], [5, '5']].map(([v, t]) => sv('text', { class: 'pzq-t' + (v === 2.5 ? ' on' : ''), x: L - 14, y: Y(v) + 9, 'text-anchor': 'end' }, t)),
    sv('text', { class: 'pzq-ax', x: (L + R) / 2, y: B + 76, 'text-anchor': 'middle' }, 'SAAG, g/dL'),
    sv('text', { class: 'pzq-ax', x: 0, y: 0, 'text-anchor': 'middle', transform: `translate(26 ${(T + B) / 2}) rotate(-90)` }, 'Ascites protein, g/dL'),
    pts.map((p, i) => {
      const x = X(p.saag), y = Y(p.tp), left = x > (L + R) / 2 + 120;
      return sv('g', { class: 'pzq-pt', 'data-site': p.site || 'none', style: `--i:${i}` },
        sv('circle', { cx: x, cy: y, r: 15 }),
        p.names.map((nm, j) => sv('text', { x: x + (left ? -26 : 26), y: y + 10 + (j - (p.names.length - 1) / 2) * 34, 'text-anchor': left ? 'end' : 'start' }, nm)));
    }));
  return h('div', { class: 'pz-visual pz-quadwrap' }, svg,
    h('ol', { class: 'pz-quads' }, QUADS.map((q) => h('li', { 'data-portal': q.x ? 'y' : 'n' },
      h('span', { class: 'qn' }, String(q.n)), h('span', { class: 'qt' }, q.t), h('span', { class: 'qc' }, q.c)))));
}

/** Why a clot before the liver leaves the abdomen dry: the gut's capillary wall holds protein back, so its
 *  oncotic pull holds the fluid in; the sinusoid's wall lets protein through, so pressure becomes lymph. */
function wallsVisual() {
  const W = 1400, H = 470;
  const panel = (ox, sin) => {
    const yW = 236, lumen = [yW + 16, yW + 132], dots = [];
    for (let i = 0; i < 8; i++) dots.push(sv('circle', { class: 'pzw-alb', cx: ox + 70 + i * 66, cy: lumen[0] + 30 + (i % 3) * 30, r: 8 }));   // (their drift stays in the lumen)
    const cross = [];
    // The sinusoid's wall: six plates with a pore between each; albumin rises through three of them.
    const pores = [104, 202, 300, 398, 496].map((x) => ox + x);
    if (sin) for (const x of [pores[0], pores[2], pores[4]]) cross.push(sv('circle', { class: 'pzw-alb pzw-cross', cx: x, cy: yW + 6, r: 8, style: `--d:${((x - ox) / 400).toFixed(2)}s` }));
    // (The flow ends below each band's name.)
    const arrows = (sin ? pores : [ox + 170, ox + 430]).map((x) => sv('path', { class: 'pzw-flow' + (sin ? ' big' : ''), d: `M${x} ${yW + 40} V${yW - (sin ? 22 : 26)}`, 'marker-end': 'url(#pzwArrow)' }));
    const wall = sin
      ? [0, 1, 2, 3, 4, 5].map((k) => sv('rect', { class: 'pzw-wall', x: ox + 20 + k * 98, y: yW, width: 70, height: 14, rx: 7 }))
      : [sv('rect', { class: 'pzw-wall', x: ox + 20, y: yW, width: 560, height: 14, rx: 7 }), sv('rect', { class: 'pzw-bm', x: ox + 20, y: yW - 9, width: 560, height: 6, rx: 3 })];
    return sv('g', { class: 'pzw-panel' + (sin ? ' sin' : '') },
      sv('text', { class: 'pzw-t', x: ox + 20, y: 44 }, sin ? 'Liver sinusoid' : 'Gut capillary'),
      sv('text', { class: 'pzw-s', x: ox + 20, y: 84 }, sin ? 'Open pores, no basement membrane' : 'Continuous wall, basement membrane'),
      sin ? [sv('rect', { class: 'pzw-hep', x: ox + 20, y: 108, width: 560, height: 42, rx: 12 }), sv('text', { class: 'pzw-l', x: ox + 34, y: 137 }, 'Liver cells'),
        sv('rect', { class: 'pzw-disse', x: ox + 20, y: 154, width: 560, height: 74, rx: 8 }), sv('text', { class: 'pzw-l', x: ox + 34, y: 180 }, 'Space of Disse: lymph')]
        : [sv('rect', { class: 'pzw-tissue', x: ox + 20, y: 108, width: 560, height: 120, rx: 12 }), sv('text', { class: 'pzw-l', x: ox + 34, y: 148 }, 'Tissue fluid: little')],
      sv('rect', { class: 'pzw-lumen', x: ox + 20, y: lumen[0], width: 560, height: lumen[1] - lumen[0], rx: 10 }),
      sv('g', { class: 'pzw-dots' }, dots), cross, wall, arrows,
      sv('text', { class: 'pzw-c', x: ox + 20, y: lumen[1] + 58 }, sin ? 'Protein crosses: nothing holds the fluid back' : 'Protein stays in: its pull holds the fluid back'),
      sv('text', { class: 'pzw-c2', x: ox + 20, y: lumen[1] + 96 }, sin ? 'A rise in pressure becomes lymph at once' : 'A rise in pressure makes little fluid'));
  };
  const svg = sv('svg', { class: 'pz-walls', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'The gut capillary wall holds protein back; the liver sinusoid lets it through' },
    sv('defs', {}, sv('marker', { id: 'pzwArrow', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, sv('path', { d: 'M0 0 L10 5 L0 10 z', class: 'pzw-head' }))),
    panel(0, false), panel(760, true));
  return h('div', { class: 'pz-visual' }, svg);
}

// ── The off-screen engine ──────────────────────────
// A second engine in its own worker (the main thread when workers are unavailable) computes the slides'
// states, so the live figure keeps running while a presentation is prepared.
function makeCalc() {
  const pending = new Map();
  let seq = 1, post = null, kill = () => {};
  const onMsg = (m) => {
    const p = pending.get(m.reqId);
    if (!p) return;
    if (m.type === 'seqStep') { p.step?.(m); return; }
    pending.delete(m.reqId); p.done(m);
  };
  const ready = (async () => {
    try {
      const w = new Worker(new URL('../worker.js?v=bafb12d22a', import.meta.url), { type: 'module' });
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('worker timeout')), 6000);
        w.onmessage = (e) => { if (e.data?.type === 'presets') { clearTimeout(t); res(); } };
        w.onerror = (e) => { clearTimeout(t); rej(e); };
        w.postMessage({ type: 'visibility', visible: false });
        w.postMessage({ type: 'run', running: false });
        w.postMessage({ type: 'presets', reqId: 0 });
      });
      w.onmessage = (e) => onMsg(e.data); w.onerror = null;
      post = (m) => w.postMessage(m); kill = () => w.terminate();
    } catch {
      const { createCore } = await import('../worker-core.js?v=c394f5eab9');
      const core = createCore((m) => setTimeout(() => onMsg(m), 0));
      core.handle({ type: 'visibility', visible: false }); core.handle({ type: 'run', running: false });
      post = (m) => core.handle(structuredClone(m)); kill = () => core.dispose();
    }
  })();
  const send = async (msg, entry) => { await ready; pending.set(msg.reqId, entry); post(msg); };
  return {
    request: (type, payload = {}) => new Promise((done) => send({ type, reqId: seq++, ...payload }, { done })),
    sequence: (steps, base, step) => new Promise((done) => send({ type: 'sequence', reqId: seq++, steps, base }, { done, step })),
    kill: () => kill(),
  };
}

export function createPresenter({ openSettings, startCase, loadPreset, cases = [], host, stage, projectorOn, projectorOff, closeHome, stashCards, rerenderHome }) {
  const app = document.getElementById('app'), view = document.getElementById('stageView'), wrap = document.getElementById('stageWrap');
  let calc = null;
  const getCalc = () => (calc ||= makeCalc());
  const cache = new Map();   // deck id → computed states, reused the next time it is presented
  let deck = null, slides = [], states = [], waiters = [], stateOf = [], base = null, extraOf = new Map();
  // `gen` counts redraws asked of the slide in place (quiz on or off): a transition under way for an older one starts over.
  let want = 0, wantRev = false, shown = null, shownState = -1, busy = false, quiz = false, gen = 0;
  let ui = null, black = false, digits = '', digitT = 0;
  let saved = null, layersBefore = null;   // (the viewer's own lobule layers, put back when the show ends)
  // Projector contrast (P): larger words and labels, thicker leaders, ratings as filled chips, a deeper shade. Remembered.
  const PROJ = 'pps.projector';
  let hiCon = (() => { try { return localStorage.getItem(PROJ) === '1'; } catch { return false; } })();

  const all = () => [...DECKS, ...readMine().map(fromScript)];
  // An instructor's script (captured model states) as slides: its own titles and notes, the ladder beside.
  function fromScript(s) {
    return { ...s, level: 'yours', mine: true, slides: (s.steps || []).map((st) => ({
      preset: st.preset, presetDays: st.presetDays, params: st.params, action: st.action, days: st.days, view: st.view, cam: st.view === 'circuit' ? 'fit' : st.cam || 'fit',
      kicker: st.kicker || s.title, title: st.title || 'Step', line: st.line || '', causes: st.causes, site: st.site, notes: st.notes || st.tell || '', ask: st.ask, data: 'ladder', key: st.key || [],
    })) };
  }

  // ── Slide states ──
  // stateOf[i]: the slide whose model state slide i shows (itself, or the last one before it that changed the model).
  const changes = (s) => !!(s.preset || s.params || s.action || s.days);
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
    const c = getCalc(), steps = [...slides.map((s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse } : {})), ...extra.map((o) => ({ preset: o.preset, params: o.params, days: o.days }))];
    const presetAt = []; let pid = store.get().presetId;
    slides.forEach((s, i) => { if (s.preset) pid = s.preset; presetAt[i] = pid; });
    extra.forEach((o, k) => { presetAt[slides.length + k] = o.preset; });
    const deckNow = deck;
    (async () => {
      const first = slides[0]?.preset ? null : (await host.request('snapshot')).snap;
      if (!base) c.request('presetMetrics', { ids: ['healthy'] }).then((m) => { base = m.result?.healthy || null; if (deck === deckNow) ui?.ladder.setBase(base); });
      await c.sequence(steps, first, (m) => {
        const st = { snap: m.snap, params: m.params, fp: m.fp, presetId: presetAt[m.i] };
        mine[m.i] = st;
        if (states !== mine) return;   // a newer presentation has started
        for (const w of waiters.filter((x) => x.i === m.i)) w.res(st);
        waiters = waiters.filter((x) => x.i !== m.i);
      });
      if (key) cache.set(key, { states: mine });
    })();
  }
  const stateReady = (i) => (states[i] ? Promise.resolve(states[i]) : new Promise((res) => waiters.push({ i, res })));

  function applyState(st) {
    host.send({ type: 'restore', snap: st.snap });
    replaceParams(structuredClone(st.params));
    store.set({ presetId: st.presetId, presetLoading: false, historyTick: (store.get().historyTick || 0) + 1 });
    host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
  }
  // The live engine has sent a frame of the new state (its portal pressure is the slide's), and two more frames have painted it.
  let frames = 0;
  store.on('frame', () => { frames++; });
  async function drawn(st) {
    const n0 = frames;
    await until(() => frames > n0 && Math.abs((store.get().frame?.metrics?.pv ?? -99) - st.fp.pv) < 0.6, 900);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  // ── The figure's moves ──
  const fadeMs = () => (reduce.matches ? 0 : 420);
  // A quiet arc over the figure's free space while a new patient settles (it fades in and out with the dim, never pops).
  const loading = (on) => ui?.load.classList.toggle('on', on);
  async function figureOut() { loading(true); view.classList.add('pz-out'); await wait(fadeMs()); }
  function figureIn() { view.classList.remove('pz-out'); loading(false); }
  async function toAnatomy() {
    if (store.get().sinusoid) { store.set({ sinusoid: false }); await wait(reduce.matches ? 300 : 1000); }
    if (store.get().lobule) { store.set({ lobule: false }); await until(() => stage.lobuleSettled(), 2600); await wait(80); }
  }
  // Glide the camera to a slide's framing; resolves when it has landed (cut(): a newer slide was asked for).
  async function camera(cam, s, cut) {
    const ms = reduce.matches ? 0 : 1500;
    if (LOBULE_CAM.test(cam)) {
      // (A slide's layers: ['zones'] shows the lobule's zone bands; any other lobule slide has them off.)
      const zonesWant = !!s.layers?.includes('zones');
      if (!!store.get().lobuleLayers?.zones !== zonesWant) store.set({ lobuleLayers: { ...store.get().lobuleLayers, zones: zonesWant } });
      if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); await wait(700); }
      if (!store.get().lobule) {
        // Whole figure → the liver → into it: the dive starts from the liver, filling the screen.
        stage.frameBox(REGIONS.liver, ms ? 1100 : 0, 2.4);
        await wait(ms ? 1150 : 0);
        if (cut()) return;
        store.set({ lobule: true });
        // (A first dive also loads the lobule, which a slow tablet can take several seconds over.)
        await until(() => cut() || (stage.lobuleSettled() && stage.lobuleOpen()), 9000);
        if (cut()) return;
        await wait(120);
      } else await until(() => cut() || stage.lobuleOpen(), 9000);
      if (cut()) return;
      const sin = cam === 'sinusoid' && sinusoidSupported() && stage.lobuleOpen();
      if (sin) { if (!store.get().sinusoid) { store.set({ sinusoid: true }); await wait(ms ? 1250 : 0); } return; }
      if (store.get().sinusoid) { store.set({ sinusoid: false }); await wait(ms ? 1000 : 0); }
      stage.lobuleFocus(cam === 'sinusoid' ? 'sinusoid' : cam.split(':')[1] || 'fit', { zoom: s.zoom ?? 2.3, ms });
      await wait(ms);
      return;
    }
    await toAnatomy();
    if (cut()) return;
    const v = s.view || 'anatomic';
    if (store.get().view !== v) { store.set({ view: v }); await wait(700); }
    // (Reduced motion keeps the glide, short: a jump of the whole figure is harder to follow than a quick move.)
    const gl = ms || 300;
    if (cam === 'fit' || v === 'circuit') stage.fitSlow(gl);
    else stage.frameBox(camBox(cam, s), gl, s.kMax || 3.2);
    await wait(gl);
  }
  // A slide's framing: its region of the plate, grown to take in all of what the slide points at (its outlined
  // organs as drawn now, an enlarged spleen whole), with a little room for the outline's glow.
  function camBox(cam, s) {
    const r = Array.isArray(cam) ? cam : REGIONS[cam] || REGIONS.route;
    const tg = slideTargets(s), f = stage.focusBox({ organs: tg.organs.map((o) => o.id) });
    if (!f) return r;
    const m = 0.08 * Math.max(f[2] - f[0], f[3] - f[1]);
    return [Math.min(r[0], f[0] - m), Math.min(r[1], f[1] - m), Math.max(r[2], f[2] + m), Math.max(r[3], f[3] + m)];
  }

  // ── The HVPG catheter (stage.setCatheter, as Measure › HVPG draws it), choreographed slide by slide: in along
  // the jugular route with the camera following, the tip close up, the balloon up and the still column, the
  // readings; each step eases on from wherever the last one left it, and it slides out with its slides.
  const CC = { free: '#5CA4F2', wedge: '#A68CF2', bad: '#FF7A85' };   // the procedure's own colours
  const cath = { on: false, raf: 0, t0: 0, v: { u: 0, balloon: 0, column: 0, opacity: 1 }, tr: {}, show: [], ring: null, ostium: false, probeT0: 0, follow: false, cam: null, fp: null };
  // The still column is shaded in the catheter's wedge colour (the WHVP callout's), so it reads as the catheter's
  // column of still blood, not as one more pressure on the map.
  const wedgeInk = () => getComputedStyle(document.documentElement).getPropertyValue('--tr-wedge').trim() || '#7650C8';
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
    if (cath.follow) stage.cathFollow();
    cath.raf = requestAnimationFrame(cathFrame);
  }
  function cathStop() {
    cancelAnimationFrame(cath.raf);
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
    if (v.balloon < 0.999) { cath.show = ['f']; cath.ring = CC.free; cathTrack('balloon', 1, 800); await wait(ms(900)); if (cut()) return; }
    cath.ring = CC.wedge;
    // The still column fills first and the pressure holds on its plateau; only then does the WHVP callout ease in,
    // and for the result slide the HVPG bracket follows it.
    if (v.column < 0.999) { cath.show = ['f']; cathTrack('column', 1, 1800); await wait(ms(1900)); if (cut()) return; await wait(ms(600)); if (cut()) return; }
    if (!cath.show.includes('w')) { cath.show = ['f', 'w']; if (mode === 'result') { await wait(ms(1500)); if (cut()) return; } }
    if (mode === 'result') { cath.show = ['sum']; cath.ring = null; }
  }

  // ── A time-lapse on the live model: its days run on the disease clock (ramped as the off-screen chain ran them),
  // the counter and the numbers follow, then the slide's computed state takes over (the same, to the decimal).
  let lapseOn = false, lapseLeft = 0;   // (lapseLeft: days still to run; 0 once Next has sped it up)
  // A compare slide's buttons switch the live model's params (liveOff: it no longer shows the slide's computed state).
  let liveOff = false, abGen = 0, abFast = false;
  const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge({ ...(a[k] || {}) }, v) : v; return a; };
  function abSlow() { abGen++; if (abFast) { abFast = false; host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 }); } }
  // The new treatment takes effect on the live figure, run three times faster while it settles; the ladder and tiles follow it.
  async function abPick(s, i, k) {
    if (!deck || shown?.i !== i || slides[i] !== s) return;
    ui?.text.querySelectorAll('.pz-abb').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
    const g = ++abGen, ref = refOf(s, i), mine = () => g === abGen && shown?.i === i && !!deck;
    liveOff = true;
    replaceParams(merge(structuredClone(store.get().params), s.compare[k].params));
    host.send({ type: 'setParams', params: store.get().params, settle: false });
    abFast = true; host.send({ type: 'run', running: true, clock: 'hemo', speed: 3 });
    for (const t0 = performance.now(); performance.now() - t0 < 7000 && mine();) {
      await wait(150);
      const fr = store.get().frame;
      if (fr?.metrics && mine()) dataTo(s, liveFp(fr), ref, 280);
    }
    if (mine()) abSlow();
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
  const tileKeys = (s) => s.tiles || (s.data === 'ladder' ? ['hvpg', 'ppg'] : []);
  function dataTo(s, f, ref, ms) {
    if (!ui) return;
    if (s.data === 'ladder') ui.ladder.set(f, { key: s.key || [], ms, brackets: s.brackets });
    if (s.data) ui.tiles.set(f, tileKeys(s), s.key || [], ref, ms, store.get().params?.tips?.on);
  }
  async function playLapse(s, to, cut) {
    const end = await stateReady(stateOf[to]);
    if (!end || cut()) return;
    const days = s.days, d0 = store.get().frame?.day ?? 0, ref = refOf(s, to);
    lapseOn = true; lapseLeft = days;
    host.send({ type: 'lapse', days, speed: days / (s.lapse.seconds || 8), ramp: s.ramp || null });
    paintChrome();
    while (lapseOn && !cut()) {
      const fast = lapseLeft === 0;
      await wait(fast ? 60 : 150);
      const fr = store.get().frame, d = clamp((fr?.day ?? d0) - d0, 0, days);
      if (lapseLeft) lapseLeft = days - d;
      paintLapse(s, d, days);
      if (fr?.metrics) dataTo(s, liveFp(fr), ref, fast ? 120 : 280);
      if (d >= days && fr?.clock === 'hemo') break;
    }
    if (!lapseOn || cut()) { stopLapse(); return; }
    lapseOn = false; paintChrome();
    applyState(end); shownState = stateOf[to];
    paintLapse(s, days, days, true);
    dataTo(s, end.fp, ref, 700);
  }

  // ── Slides ──
  const asking = (s, rev) => quiz && !!s.quiz && !rev;
  function go(i, rev = false) {
    if (!deck) return;
    want = clamp(i, 0, slides.length - 1); wantRev = rev;
    paintChrome();
    if (!busy) run();
  }
  const next = () => {
    const s = slides[want];
    if (lapseOn && lapseLeft > 0 && shown?.i === want) skipLapse();
    else if (asking(s, wantRev)) go(want, true); else if (want < slides.length - 1) go(want + 1); else stop();
  };
  const prev = () => { if (want > 0) go(want - 1); };
  async function run() {
    busy = true;
    try {
      while (deck && (!shown || shown.i !== want || shown.rev !== wantRev || shown.gen !== gen)) await transition(want, wantRev);
    } finally { busy = false; }
  }
  async function transition(to, rev) {
    const g = gen, s = slides[to], cut = () => !deck || want !== to || wantRev !== rev || gen !== g;
    const q = asking(s, rev), cam = s.visual ? s.cam || null : q ? 'fit' : s.cam || 'fit';
    // A time-lapse starts from the slide before's state; a catheter slide drives its own camera.
    const lap = !!s.lapse && to > 0 && !q, ct = !q && !s.visual ? s.cath || null : null;
    // Words out, and the marks: they belong to the slide that is leaving.
    store.set({ focus: null, presentLabels: [], presentTerms: null, lobuleCallout: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null); delete app.dataset.lit;
    stopLapse(); abSlow();
    const si = lap ? stateOf[to - 1] : stateOf[to];
    await wordsOut(s, shownState >= 0 && (si !== shownState || liveOff));
    if (cut()) return;
    slideLayers(s);
    // The catheter leaves with its slides (with a new patient, the figure's fade takes it).
    if (cath.on && (!ct || si !== shownState)) { await cathOut(si !== shownState && shownState >= 0); if (cut()) return; }
    // Out of the lobule while the old patient is still there, so the rise reads as leaving the liver.
    if ((ct || (cam && !LOBULE_CAM.test(cam))) && (store.get().lobule || store.get().sinusoid)) { await toAnatomy(); if (cut()) return; }
    // (A patient still being computed off screen: after a short wait the arc shows.)
    const lateT = states[si] ? 0 : setTimeout(() => loading(true), 260);
    const st = await stateReady(si);
    clearTimeout(lateT);
    if (!st || cut()) return;
    // A visual waits for every patient it compares (some are computed after the slides).
    // (A table shows at once, its rows' cells "…" until each patient is in.)
    if (s.visual && s.visual !== 'table') { await Promise.all(rowIdx(s).map(stateReady)); if (cut()) return; }
    // A new patient, or the same one changed: the figure fades out, the state changes unseen, it fades back in.
    const swap = si !== shownState || liveOff;
    if (swap) {
      if (shownState >= 0 && !view.classList.contains('pz-out')) await figureOut();
      applyState(st); shownState = si; liveOff = false;
      await drawn(st);
      if (!deck) return;
    }
    // With a new patient and a move over the plate, the glide starts while the figure is still dim and runs on
    // through its fade back in, so the eye sees one motion, not a fade and then a move.
    // (The words come first: they set the space the camera frames into.)
    wordsIn(s, q, st, to, swap);
    if (s.visual === 'table') fillTable(s, cut);
    const lead = swap && !ct && cam && !LOBULE_CAM.test(cam) && !store.get().lobule && !reduce.matches ? camera(cam, s, cut) : null;
    if (lead) await wait(150);
    if (swap || view.classList.contains('pz-out')) figureIn(); else loading(false);
    if (cut()) return;
    if (ct) await cathTo(ct, st.fp, cut);
    else if (lead) await lead;
    else if (cam) await camera(cam, s, cut);
    if (cut()) return;
    if (!s.visual) {
      // The slide's marks, labels, the stations its terms name (in their colours) and its glows (see slideTargets).
      const tg = q ? null : slideTargets(s);
      let marks = q ? [] : (s.marks || (s.mark ? [s.mark] : [])).map((m) => ({ edges: [...m.edges], label: m.label, kind: m.kind || 'block' }));
      // A note mark is a pointer: its vessel glows in its station's colour. Where a station label on the slide already
      // names that vessel, the pointer would only repeat it, so it goes (the glow stays).
      if (tg) {
        const named = new Set([...(s.labels || []), ...tg.labels].flatMap((n) => TARGETS[n]?.edges || []));
        for (const m of marks) if (m.kind === 'note') for (const e of m.edges) if (!tg.glow.some((g) => g.id === e)) tg.glow.push({ id: e, tone: EDGE_TONE[e] || 'accent' });
        marks = marks.filter((m) => !(m.kind === 'note' && m.edges.some((e) => named.has(e))));
      }
      store.set({ presentLabels: q ? [] : [...new Set([...(s.labels || []), ...tg.labels])], presentTerms: tg?.terms || null,
        presentNames: !q && (s.data === 'ladder' || !!s.cath),
        focus: marks.length ? { ...marks[0], marks } : null, lobuleCallout: q || !s.callout ? null : { kind: 'block', ...s.callout } });
      if (tg) { stage.setGlow(tg.glow); stage.pinOrgans(tg.organs.map((o) => (o.id === 'spleen' && st?.fp ? { id: o.id, tone: rateTone('spleen', st.fp) } : o))); stage.setResGlow(tg.res); }
      app.dataset.lit = tg?.lit.join(' ') || '';
    }
    { const ss = !s.visual && !q ? [...new Set([...(s.sites || []), ...slideTargets(s).sites])] : []; if (ss.length) stage.setSites(ss, st.fp); }
    shown = { i: to, rev, gen: g };
    paintChrome();
    if (lap) await playLapse(s, to, cut);
  }

  // A slide's lobule layers (layers: ['zones', 'lymph'] turns those on); otherwise zones off and lymph as the viewer had it.
  function slideLayers(s) {
    if (!layersBefore) return;
    const want = { ...layersBefore, zones: false, ...Object.fromEntries((s.layers || []).map((k) => [k, true])) }, now = store.get().lobuleLayers || {};
    if (Object.keys(want).some((k) => !!want[k] !== !!now[k])) store.set({ lobuleLayers: want });
  }

  // ── The slide's words, data and visual ──
  // Tiles beside a sinusoid sit under the words, so the vessel has the width of the screen.
  const under = (s) => s.data === 'tiles' && !s.visual && /^sinusoid/.test(s.cam || '');
  async function wordsOut(next, newPatient = false) {
    if (!ui) return;
    const out = [ui.text, ui.panel], data = ui.data;
    // A card that moves (under the words, or back beside them) goes out with the words and comes back in its new place.
    // (Also when its kind or title changes, so the ladder never appears or goes under the numbers in one frame.)
    const lad = next?.data === 'ladder', ttl = cardTitle(next);
    const move = !data.hidden && !data.classList.contains('pz-hide') && next && hasCard(next)
      && (under(next) !== data.classList.contains('under') || !lad !== data.classList.contains('tiles-only') || ttl !== ui.dhT.textContent
        || ui.tools.sig(next.tool) !== (data.dataset.tool || ''));
    // A different patient: the card leaves with the words and stays gone until the new patient has settled, so its numbers never travel from one patient to the other.
    const gone = newPatient && !data.hidden && !data.classList.contains('pz-hide');
    if (move || gone) data.classList.add('pz-hide');
    if (!move && !gone && out.every((el) => el.hidden || !el.childElementCount)) return;
    // The catheter's monitor stays up from one measuring slide to the next: only the words around it go.
    const keep = mon && next?.monitor && !next.visual && mon.el.parentNode === ui.text;
    for (const el of out) {
      if (keep && el === ui.text) { for (const c of el.children) if (c !== mon.el) c.classList.add('pz-leave'); }
      else el.classList.add('pz-leave');
    }
    await wait(reduce.matches ? 0 : move || gone ? 340 : 220);
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
    const t = s.tool.delta != null ? { ...s, delta: s.tool.delta } : s, d = deltaOf(t, i), r = refOf(t, i);
    if (r?.[g[0]] == null) return null;
    // (The earlier reading only: the instrument's live reading jitters, so a computed change could disagree with it.)
    const from = d === true ? slides[stateOf[i - 1]] : slides.find((x) => x.id === d);
    return { label: s.tool.deltaLabel || (d === true && s.lapse?.from) || from?.kicker || 'Before', value: `${fmt(r[g[0]], g[2])} ${g[1]}` };
  }
  const cardTitle = (s) => (s?.data === 'ladder' ? 'Pressure, portal vein to heart' : s?.dataTitle || (s?.tool ? ui.tools.title(s.tool) : 'This patient, from the model'));
  // The talk so far, for a pressure trace: every state up to slide i, once each.
  const chainTo = (i) => [...new Set(stateOf.slice(0, i + 1))].map((k) => ({ n: k + 1, title: slides[k].title, fp: states[k]?.fp }));
  // The catheter's pressure monitor, made once and kept, so its trace carries on from slide to slide.
  let mon = null;
  function monitorFor(s, i) {
    mon ||= createHvpgMonitor();
    // Already up (the slide before measured too): it stays, and glides to its new place under the new words.
    const stay = mon.el.parentNode === ui.text && !ui.text.hidden, y0 = stay ? mon.el.getBoundingClientRect().top : 0;
    mon.el.classList.toggle('pz-stay', stay);
    requestAnimationFrame(() => {
      if (stay && !reduce.matches) {
        const dy = y0 - mon.el.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) mon.el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.7,.2,1)' });
      }
      mon.set(s.monitor, states[stateOf[i]]?.fp);
    });
    return mon.el;
  }
  function wordsIn(s, q, st, i, fresh = false) {
    if (!ui) return;
    const { text, panel, data } = ui;
    text.classList.remove('pz-leave');   // (the panel's own is let go once its new content is in, so it never fades back in with the old)
    const kick = (site, words, sec) => h('div', { class: 'pz-kick', 'data-site': site || 'none' }, h('i'), sec ? h('span', { class: 'pz-sec' }, `${sec[0]} of ${sec[1]} ·`) : null, words);
    if (s.visual) {
      text.hidden = true; text.replaceChildren();
      // A panel that was not there fades in (never pops): unhidden while still faded, then let go.
      if (panel.hidden) { panel.classList.add('pz-leave'); panel.hidden = false; void panel.offsetWidth; }
      panel.classList.toggle('fill', s.visual === 'ladders');
      panel.dataset.visual = s.visual;
      panel.replaceChildren(h('div', { class: 'pz-ph' }, kick(null, s.kicker), h('h1', { class: 'pz-h' }, nb(s.title)), s.eq ? equation(s.eq) : null, s.line ? h('p', { class: 'pz-line' }, rich(s.line, s, st?.fp)) : null),
        VISUALS[s.visual](s));
      panel.classList.remove('pz-leave');
      ui.veil.classList.add('on');
    } else {
      panel.hidden = true; panel.replaceChildren(); panel.classList.remove('pz-leave'); ui.veil.classList.remove('on');
      text.hidden = false;
      text.replaceChildren(...(q
        ? [kick(null, 'Quiz'), h('h1', { class: 'pz-h' }, s.quiz), s.rail ? rail(null) : null, h('p', { class: 'pz-line pz-hint' }, 'Take answers from the audience, then press → to show the answer.')]
        : [kick(s.site, s.kicker, s.sec), h('h1', { class: 'pz-h' }, nb(s.title)), s.eq ? equation(s.eq) : null, s.line ? h('p', { class: 'pz-line' }, rich(s.line, s, st?.fp)) : null,
          s.compare ? h('div', { class: 'pz-ab', role: 'group', 'aria-label': 'Switch treatment on the live model' },
            s.compare.map((o, k) => h('button', { type: 'button', class: 'pz-abb', 'aria-pressed': String(!!o.own), onclick: () => abPick(s, i, k) }, o.label))) : null,
          s.data === 'ladder' || s.cath ? stationKey() : null,
          s.monitor ? monitorFor(s, i) : null,
          s.column ? wedgeColumn() : null,
          s.lapse && i > 0 ? h('div', { class: 'pz-lapse', role: 'status' }, h('span', { class: 'pzl-bar' }, h('i')), h('span', { class: 'pzl-t' }, lapseText(s, 0, s.days, false))) : null,
          s.rail ? rail(s.rail === 'all' ? 'all' : s.site) : null,
          s.causes?.length ? h('div', { class: 'pz-causes' }, h('span', { class: 'pz-sub' }, s.causesHead || 'Causes'), h('ul', {}, s.causes.map((c) => h('li', {}, c)))) : null]));
      const ttl = text.querySelector('.pz-h');
      if (ttl && !phone()) { const lh = parseFloat(getComputedStyle(ttl).lineHeight) || ttl.offsetHeight; if (ttl.offsetHeight > lh * 2.4) ttl.classList.add('long'); }
      [...text.children].forEach((c, k) => c.style.setProperty('--i', k));
      text.classList.remove('pz-enter'); void text.offsetWidth; text.classList.add('pz-enter');
    }
    if (hasCard(s)) {
      const lad = s.data === 'ladder';
      data.classList.toggle('tiles-only', !lad);
      data.classList.toggle('under', under(s));
      data.classList.toggle('has-tool', !!s.tool);
      data.classList.toggle('tool-only', !!s.tool && !s.data);
      data.dataset.tool = ui.tools.sig(s.tool);
      ui.dhT.textContent = cardTitle(s);
      ui.dhL.hidden = !lad;
      if (s.tool) ui.tools.show(s.tool, { quiz: q, stateKey: stateOf[i], chain: chainTo(i) }); else ui.tools.hide();
      if (s.tool) ui.tools.ghost(q ? null : toolGhost(s, i));
      // (With a new patient the numbers are set at once, while the card is still out: it fades back in already showing them.)
      const ms = fresh ? 0 : undefined;
      if (lad) ui.ladder.set(st.fp, { key: q ? [] : s.key || [], ms, brackets: q ? null : s.brackets });
      if (s.data) ui.tiles.set(st.fp, tileKeys(s), q ? [] : s.key || [], q ? null : refOf(s, i), ms, st.params?.tips?.on);
      if (data.hidden) { data.hidden = false; data.classList.add('pz-hide'); void data.offsetWidth; }
      data.classList.remove('pz-hide');
    } else if (!data.hidden) {
      data.classList.add('pz-hide');
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
  // A visual's rows: the deck's slides by id ('pvt', or { id, name } to name it), or { preset, name } patients that
  // no slide shows, computed after the slides.
  const rowAt = (o) => { const id = typeof o === 'string' ? o : o.id, i = id ? slides.findIndex((x) => x.id === id) : -1; return [i, i >= 0 ? stateOf[i] : extraOf.get(xKey(o))]; };
  const rowIdx = (s) => (s.of || []).map((o) => rowAt(o)[1]).filter((k) => k != null && k >= 0);
  function rowsOf(s) {
    return (s.of || []).map((o) => {
      const [i, k] = rowAt(o), sl = i >= 0 ? slides[i] : null, x = typeof o === 'object' ? o : {};
      if (k == null || k < 0) return null;
      const title = x.title ?? sl?.title ?? '';
      return { i, k, f: states[k]?.fp, kicker: x.kicker ?? sl?.kicker ?? '', title, name: x.name || title, site: x.site ?? sl?.site, note: x.note, blank: x.blank || [], ref: !!x.ref, vs: x.vs };
    }).filter(Boolean);
  }
  const reveal = (c) => { c.classList.add('shown'); c.removeAttribute('role'); c.removeAttribute('tabindex'); c.removeAttribute('aria-label'); };
  function laddersGrid(s) {
    const grid = h('div', { class: 'pz-grid' });
    for (const r of rowsOf(s)) {
      if (!r.f) continue;
      const L = bigLadder(); L.setBase(base); L.set(r.f, {});
      // In quiz mode each ladder's site is hidden until a tap (D7): the room names the site from the ladder's shape.
      const cell = h('div', quiz ? { class: 'pz-cell q', role: 'button', tabindex: '0', 'aria-label': 'Show the site of this ladder', onclick: () => reveal(cell), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(cell); } } } : { class: 'pz-cell' },
        h('div', { class: 'pz-cell-k' }, h('div', { class: 'pz-kick', 'data-site': r.site || 'none' }, h('i'), r.kicker.replace('Intrahepatic · ', '')),
          h('span', {}, 'HVPG ', h('b', { 'data-rate': rateOf('hvpg', r.f)[0] }, fmt(r.f.hvpg, 1)))),
        h('div', { class: 'pz-cell-t' }, r.title), L.el);
      grid.append(cell);
    }
    // The dashed line's numbers, once for all six: the healthy reference each ladder is read against.
    if (base) grid.append(h('p', { class: 'pz-grid-key' }, h('i', { 'aria-hidden': 'true' }), 'Healthy, dashed: ',
      [['PV', 'pv'], ['WHVP', 'whvp'], ['FHVP', 'fhvp'], ['IVC', 'ivc'], ['RA', 'ra']].filter(([, k]) => base[k] != null).map(([a, k]) => `${a} ${fmt(base[k], 0)}`).join(' · ') + ' mmHg'));
    return grid;
  }
  // The table's columns: the raw pressures shade above normal, the rest by their tile's rating.
  // Headers match the pressure chart's axis (PV, WHVP, FHVP, IVC, RA). res: the resistance inside the liver, as the model has it (rih). (PPG ÷ portal flow would also count the collaterals,
  // whose resistance rises as propranolol lowers the pressure, and read as if the drug raised the liver's.)
  const COLS = { pv: 'PV', whvp: 'WHVP', fhvp: 'FHVP', ivc: 'IVC', ra: 'RA', hvpg: 'HVPG', ppg: 'PPG', sin: 'Sinusoids', varix: 'Varix', asc: 'Ascites', liver: 'Liver flow', shunt: 'Shunted', saag: 'SAAG', tp: 'Protein', plt: 'Platelets', lsm: 'LSM', spleen: 'Spleen', map: 'BP', hr: 'HR', pvFlow: 'Flow (Q)', res: 'Liver R' };
  // Each column's cut-offs, shown on its heading (hover or tap) so the legend can stay one line.
  const CUT = { pv: '↑ over 10, ↑↑ over 20 mmHg', whvp: '↑ over 10, ↑↑ over 20 mmHg', fhvp: '↑ over 8, ↑↑ over 16 mmHg', ivc: '↑ over 8, ↑↑ over 16 mmHg', ra: '↑ over 8, ↑↑ over 16 mmHg',
    hvpg: '↑ 5 or more, ↑↑ 10 or more mmHg', ppg: '↑ 6 or more, ↑↑ 12 or more mmHg', sin: '↑ 9 or more, ↑↑ 12 or more mmHg', varix: '↑ 2.5 to 5 mm, ↑↑ 5 mm or more',
    plt: '↓ under 150, ↓↓ under 100 × 10⁹/L', lsm: '↑ 10 to 25, ↑↑ 25 kPa or more', spleen: '↑↑ over 13 cm', liver: '↓ under 80%, ↓↓ under 50%', shunt: '↑ 20% or more, ↑↑ 50% or more', map: '↓↓ under 65 mmHg',
    asc: '↑ grade 1, ↑↑ grade 2 or 3' };
  const RAW = { pv: (v) => v > 10, whvp: (v) => v > 10, fhvp: (v) => v > 8, ivc: (v) => v > 8, ra: (v) => v > 8 };
  const RAWLIM = { pv: 10, whvp: 10, fhvp: 8, ivc: 8, ra: 8 };
  const UP_GOOD = new Set(['liver', 'plt', 'map', 'salb']);   // (higher is better: a low one rates amber or red, an arrow down)
  const PRESS = new Set(['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg', 'sin', 'map']);
  const fpv = (k, f) => (k === 'ivc' ? f.ivc ?? f.ra : k === 'res' ? f.rih ?? null : f[k]);
  const cellRate = (k, f) => (RAW[k] ? (RAW[k](fpv(k, f)) ? 'hi' : null) : ['hi', 'mid'].includes(rateOf(k, f)[0]) ? rateOf(k, f)[0] : null);
  // A cell's direction: against the normal range ('abs': ↑ above, ↑↑ well above or past the red cut-off, ↓ below, a dash within),
  // or against a reference patient's value ('rel': the treatments table's baseline, or the row a row names).
  function dirAbs(k, f) {
    const v = fpv(k, f);
    if (RAW[k]) return v > RAWLIM[k] * 2 ? 2 : v > RAWLIM[k] ? 1 : 0;
    if (k === 'asc') return v < NO_ASC ? 0 : rateOf(k, f)[0] === 'hi' ? 2 : 1;
    const r = rateOf(k, f)[0], sign = UP_GOOD.has(k) ? -1 : 1;
    return r === 'hi' ? 2 * sign : r === 'mid' ? sign : 0;
  }
  // Against the baseline every real change shows (octreotide's half-millimetre, banding's slight rise), so the steps are small.
  const STEP_REL = { pv: .5, whvp: .5, fhvp: .5, ivc: .5, ra: .5, hvpg: .5, ppg: .5, sin: .5, varix: .3, asc: 100, liver: 2, shunt: .05, pvFlow: .15, res: 1.5, map: 2, hr: 2 };
  function dirRel(k, f, ref) {
    const a = fpv(k, f), b = fpv(k, ref);
    if (a == null || b == null) return 0;
    const d = a - b, r = Math.abs(d) / Math.max(Math.abs(b), 1e-6);
    return Math.abs(d) < (STEP_REL[k] ?? 1) ? 0 : (d > 0 ? 1 : -1) * (r >= 0.4 ? 2 : 1);
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
  // In the comparison table a change is coloured by what it means for the patient: green better, red worse.
  // Lower is better everywhere except blood flow to the liver, platelets, blood pressure and albumin; portal flow is neither.
  const effOf = (k, d) => (d === 0 || k === 'pvFlow' ? null : (UP_GOOD.has(k) ? d > 0 : d < 0) ? 'good' : 'bad');
  const unitOf = (k) => (k === 'varix' ? ' mm' : k === 'asc' ? ' L' : k === 'liver' ? '%' : k === 'res' ? ' mmHg per L/min' : PRESS.has(k) ? ' mmHg' : TILE[k]?.u ? ` ${TILE[k].u}` : '');
  const UNIT_WORDS = { press: 'pressures in mmHg', varix: 'varix in mm', asc: 'ascites in liters', liver: 'liver blood flow in % of normal', shunt: 'shunted blood in %', plt: 'platelets × 10⁹/L',
    lsm: 'stiffness in kPa', hr: 'heart rate a minute', pvFlow: 'portal flow in L/min', res: 'liver resistance in mmHg per L/min', spleen: 'spleen in cm' };
  function summaryTable(s, arrived = -1) {
    const cols = s.cols || ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], ascCols = s.asc ?? !s.cols, rows = rowsOf(s);
    const perRow = rows.some((r) => r.vs), rel = s.vs === 'first' || perRow;
    const notes = s.note ? [s.note].flat() : [];
    // Pressures always in whole mmHg (the model is not that precise); litres, kPa and flow keep their decimal.
    const val = (k, f) => { const v = fpv(k, f); return v == null ? '—' : PRESS.has(k) ? fmt(v, 0) : k === 'res' ? fmt(v, 1) : tileVal(k, v); };
    const first = rows[0]?.f;
    const refOfRow = (r) => (r.vs ? fpOf(r.vs) : first);
    const vsName = (r) => { const t = rows.find((x) => slides[x.i]?.id === r.vs); return (t?.title || slides.find((x) => x.id === r.vs)?.title || '').toLowerCase(); };
    // The reference row (the healthy patient, or the baseline) keeps its numbers, the anchor for the arrows.
    const isRef = (r, n) => !!r.ref || (rel && !r.vs && n === 0);
    const cell = (k, r, n) => {
      if (r.blank.includes(k)) return h('td', { class: 'num blank', title: 'Not measurable' }, noneEl(), h('span', { class: 'sr-only' }, 'not measurable'));
      if (!r.f || (rel && !isRef(r, n) && !refOfRow(r))) return h('td', { class: 'num pend' }, '…');
      if (isRef(r, n)) return h('td', { class: 'num ref', 'data-rate': rel ? null : cellRate(k, r.f) }, val(k, r.f));
      const ref = refOfRow(r), d = rel ? (ref ? dirRel(k, r.f, ref) : 0) : dirAbs(k, r.f), v = val(k, r.f) + unitOf(k);
      // Against normal, the colour follows the arrows (amber above, red well above); against a baseline, better or worse.
      return h('td', { class: 'num dir' + (d ? '' : ' zero') + (rel ? ' rel' : ''), 'data-rate': rel ? null : ({ 1: 'mid', 2: 'hi' })[Math.abs(d)] ?? null, 'data-eff': rel ? effOf(k, d) : null, title: v },
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
    const refTitle = first ? rows[0].title.toLowerCase() : 'the baseline';
    const key = rel
      ? `↑ higher, ↓ lower than ${perRow ? 'the row named under each' : refTitle}; ↑↑ ↓↓ by 40% or more; • unchanged${cols.some((k) => k !== 'pvFlow') ? '. Green better, red worse' : ''}`
      : `↑ above normal, ↓ below; ↑↑ ↓↓ past the red cut-off of that column (tap a heading for it); • within normal`;
    const legend = [key, rows.some((r) => r.blank.length) ? '○ not measurable' : '', units.length && rows.some((r, n) => isRef(r, n)) ? `Top row: ${units.join(', ')}` : '', s.foot || '']
      .filter(Boolean).join('. ').replace(/\.\./g, '.') + '.';
    const go1 = (r) => (e) => { if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); go(r.i); } };
    return h('div', { class: 'pz-table' }, h('table', { style: { '--nc': String(cols.length + (ascCols ? 2 : 0)), '--asc-w': '0px' } },
      h('thead', {}, h('tr', {}, h('th', {}, s.rowHead || 'Level'), cols.map((k) => h('th', { class: 'num', title: CUT[k] || null }, COLS[k] || k)),
        ascCols ? [h('th', { class: 'num', title: 'Serum-ascites albumin gradient: ↑ 1.1 g/dL or more (portal hypertension)' }, 'SAAG'), h('th', { class: 'num', title: 'Ascites protein: ↑ 2.5 g/dL or more' }, h('abbr', { title: 'Protein' }, 'Prot.'))] : null,
        notes.map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r, n) => h('tr', { ...(r.i >= 0 ? { tabindex: '0', onclick: go1(r), onkeydown: go1(r), 'aria-label': `${r.title}: go to this slide` } : { class: 'static' }),
          'data-arrived': r.k === arrived || (rel && n > 0 && (r.vs ? rows.find((x) => slides[x.i]?.id === r.vs)?.k : rows[0].k) === arrived) ? '' : null },
        h('th', { scope: 'row' }, h('span', { class: 'pz-kick', 'data-site': r.site || 'none' }, h('i'), r.kicker.replace('Intrahepatic · ', '')), h('span', { class: 'tw' }, h('span', { class: 'tn' }, nb(r.title)),
          r.vs ? h('span', { class: 'vs' }, `vs ${vsName(r)}`) : null)),
        cols.map((k) => cell(k, r, n)),
        ascCols ? ascCells(r, n) : null,
        notes.map((_, j) => h('td', { class: 'note' }, [r.note].flat()[j] || '')))))),
    h('p', { class: 'pz-foot' }, withArrows(legend)));
  }
  const VISUALS = {
    table: summaryTable,
    ladders: laddersGrid,
    scale: (s) => scaleVisual(s.scale, rowsOf(s)),
    quadrant: (s) => quadrantVisual(rowsOf(s)),
    walls: () => wallsVisual(),
    outline: (s) => h('div', { class: 'pz-outline' },
      h('section', {}, h('h2', { class: 'pz-sub' }, 'Outline'), h('ol', {}, s.outline.map((k) => h('li', {}, k)))),
      s.objectives.length ? h('section', {}, h('h2', { class: 'pz-sub' }, 'By the end you can'), h('ul', {}, s.objectives.map((o) => h('li', {}, o)))) : null),
  };

  // ── Layout: what the slide's words and data cover, so the figure frames itself in the rest ──
  // Only a phone stacks the words over the figure; a tablet in portrait keeps them at the left, with the data card under them.
  const phone = () => innerWidth < 700;
  const tall = () => !phone() && innerWidth < innerHeight;
  function layout() {
    if (!ui) return;
    // Under interface zoom the page is scaled by k: rects are screen px, inline sizes are the page's own (screen / k).
    // The --pz-* insets stay in screen px, the figure's own units (the stage view undoes the zoom).
    const p = phone(), wr = wrap.getBoundingClientRect(), W = wr.width, H = wr.height, k = wr.width / (wrap.clientWidth || wr.width) || 1;
    ui.root.classList.toggle('stack', p); ui.shade.classList.toggle('stack', p); ui.root.classList.toggle('port', tall());
    const off = (el) => el.hidden || el.classList.contains('pz-hide');
    const below = !p && (ui.data.classList.contains('under') || tall());
    if (off(ui.data) || below) delete ui.data.dataset.safe; else ui.data.dataset.safe = p ? 'bottom' : 'right';
    const r = (el) => (off(el) ? null : el.getBoundingClientRect());
    const t = r(ui.text);
    // (Under the words: in the left column, clear of the bottom.)
    if (below && t) { const y = t.bottom - wr.top + 28; ui.data.style.top = `${Math.round(y / k)}px`; ui.data.style.maxHeight = `${Math.round((H - y - 24) / k)}px`; }
    else { ui.data.style.top = ''; ui.data.style.maxHeight = ''; }
    const d = below ? null : r(ui.data);
    // The words sit on a frosted glass pane: the figure shows through it blurred, behind a crisp edge with a soft
    // shadow. The figure frames itself just past that shadow, so nothing it frames is hidden.
    const L = t ? t.right - wr.left : 0, T = t ? t.bottom - wr.top : 0;
    ui.shade.style.width = !p && t ? `${(L + 36) / k}px` : '';
    ui.shade.style.height = p && t ? `${(T + 26) / k}px` : '';
    ui.shade.style.opacity = t ? '1' : '0';
    ui.safe.hidden = !t;
    ui.safe.dataset.safe = p ? 'top' : 'left';
    ui.safe.style.width = p ? '' : `${(L + 48) / k}px`;
    ui.safe.style.height = p ? `${(T + 34) / k}px` : '';
    const set = (k, v) => app.style.setProperty(k, `${Math.max(0, Math.round(v))}px`);
    set('--pz-l', !p && t ? L + 48 : 0);
    set('--pz-r', !p && d ? W - (d.left - wr.left) + 8 : 0);
    set('--pz-t', p && t ? T + 34 : 0);
    set('--pz-b', p && d ? H - (d.top - wr.top) + 4 : 0);
    // The corner credit rises above a data card or the numbers panel that reaches it (always on a phone, where they stack
    // over the figure's lower part; on a tablet in portrait when the data card sits under the words).
    // (Measured by layout offsets, not rects: a card fading in is still shifted by its entry transform.)
    const cr = wrap.querySelector('.stage-credit'), rest = (p ? 78 : 14) + 22, reach = (cr?.offsetWidth || 220) + 40;
    const lift = Math.max(0, ...[ui.data, ui.panel].filter((e) => !off(e) && e.offsetLeft < reach && H - (e.offsetTop + e.offsetHeight) < rest).map((e) => H - e.offsetTop));
    cr?.style.setProperty('--sheet-h', lift ? `${Math.round(lift) + 12}px` : '');
    // With the words above and a card below leaving no figure between them, the credit fades out.
    cr?.classList.toggle('pz-covered', p && lift > 0 && H - lift - (t ? T + 34 : 0) < 56);
    dispatchEvent(new Event('pps:occ'));
  }
  const onResize = () => {
    if (!ui) return;
    layout(); setLabels();
    if (!shown) return;
    const s = slides[shown.i], cam = s.visual ? s.cam : asking(s, shown.rev) ? 'fit' : s.cam || 'fit';
    if (cath.on && cath.cam) stage.cathFocus(cath.cam, 400, { both: true });
    else if (cam && !LOBULE_CAM.test(cam) && !store.get().lobule) { if (cam === 'fit') stage.fitSlow(400); else stage.frameBox(camBox(cam, s), 400, s.kMax || 3.2); }
  };
  // Projector-size labels on the figure, for the screen it is on (2 at 1080 lines).
  function setLabels() {
    const k = (phone() ? 1.15 : clamp(Math.min(innerHeight / 540, innerWidth / 960), 1.25, 2.4)) * (hiCon && !phone() ? 1.15 : 1);
    stage.setProjection(k);
    { const lv = String(Math.min(k, 2.2) * stage.labelScale()); document.documentElement.style.setProperty('--label-k', lv); document.documentElement.style.setProperty('--label-scale', lv); }
    labelling = true; dispatchEvent(new Event('pps:labelscale')); labelling = false;
  }
  // The viewer's own text size (Settings) scales them too: a change there while presenting is re-applied on top.
  let labelling = false;
  addEventListener('pps:labelscale', () => { if (deck && ui && !labelling) setLabels(); });

  // ── Chrome: counter, progress, controls ──
  let askAt = [-1, 0];   // (the slide whose question is open, and how far: 0 shut, 1 the question, 2 with its answer)
  function paintChrome() {
    if (!ui) return;
    const n = slides.length, i = want;
    ui.count.textContent = `${i + 1} / ${n}`;
    ui.prog.style.setProperty('--p', String((i + 1) / n));
    // A phone keeps it to Back, the count, Next (Finish on the last slide) and Exit, always in view.
    const ph = phone(), skip = lapseOn && lapseLeft > 0, last = i === n - 1 && !asking(slides[i], wantRev) && !skip;
    // The count opens the slide list (G).
    const countBtn = h('button', { class: 'pzb-n', 'aria-label': `Slide ${i + 1} of ${n}: list the slides`, title: 'Slide list (G)', 'aria-expanded': String(!ui.jump.hidden), onclick: () => toggleJump() }, `${i + 1} / ${n}`);
    ui.bar.classList.toggle('phone', ph);
    if (ph) {
      ui.bar.classList.remove('idle');
      ui.bar.replaceChildren(
        h('button', { class: 'btn sm', 'aria-label': 'Previous slide', disabled: i === 0, onclick: prev }, icon('chev-left'), 'Back'),
        countBtn,
        h('button', { class: 'btn sm primary', 'aria-label': last ? 'Finish presenting' : skip ? 'Run the time-lapse to its end' : 'Next slide', onclick: last ? stop : next }, last ? 'Finish' : skip ? 'Skip' : 'Next', last ? null : icon('chev-right')),
        gear(),
        h('button', { class: 'ib', 'aria-label': 'Exit the presentation', title: 'Exit', onclick: stop }, icon('close')));
        return;
    }
    // The slide's question for the room, for the presenter: a faint "?" beside the count shows it, a second tap the answer.
    const ask = slides[i]?.ask;
    if (askAt[0] !== i) askAt = [i, 0];
    const askBtn = ask?.[0] ? h('button', { class: 'ib pzb-ask', 'aria-label': 'Ask the room', title: 'Ask the room: the question, then the answer', 'aria-expanded': String(askAt[1] > 0),
      onclick: () => { askAt = [i, (askAt[1] + 1) % 3]; paintChrome(); } }, '?') : null;
    const askPop = askBtn && askAt[1] ? h('div', { class: 'pzb-q', role: 'status' }, h('b', {}, ask[0]), askAt[1] > 1 && ask[1] ? h('span', {}, ask[1]) : null) : null;
    ui.bar.replaceChildren(
      h('button', { class: 'ib', 'aria-label': 'Previous slide', title: 'Previous (←)', disabled: i === 0, onclick: prev }, icon('chev-left')),
      countBtn, askBtn, askPop,
      h('button', { class: 'ib', 'aria-label': skip ? 'Run the time-lapse to its end' : 'Next slide', title: skip ? 'Skip to the end of the time-lapse (→)' : 'Next (→)', disabled: last, onclick: next }, icon('chev-right')),
      skip ? h('span', { class: 'pzb-skip', 'aria-hidden': 'true' }, '⏵ skip') : null,
      h('span', { class: 'pzb-sep' }),
      deck.slides.some((s) => s.quiz) ? h('button', { class: 'btn sm', 'aria-pressed': String(quiz), title: 'Quiz the room: ask first, reveal on the next click (Q)', onclick: toggleQuiz }, 'Quiz') : null,
      h('button', { class: 'btn sm', 'aria-pressed': String(hiCon), title: 'Projector contrast: larger words, thicker lines, rating chips (P)', onclick: toggleProj }, 'Projector'),
      h('button', { class: 'ib', 'aria-label': 'Black screen', title: 'Black screen (B)', onclick: () => toggleBlack() }, icon('pause')),
      document.fullscreenEnabled ? h('button', { class: 'ib', 'aria-label': 'Full screen', title: 'Full screen (F)', onclick: fullscreen }, icon('fullscreen')) : null,
      gear(),
      h('button', { class: 'ib', 'aria-label': 'Stop presenting', title: 'Stop (Esc)', onclick: stop }, icon('close')));
  }
  // Settings while presenting (appearance, text size, interface zoom, full screen): the app's own sheet, opened from the bar.
  const gear = () => (openSettings ? h('button', { class: 'ib', 'aria-label': 'Settings', 'aria-haspopup': 'dialog', title: 'Settings', onclick: (e) => openSettings(e.currentTarget) }, svgIcon('gear')) : null);
  let idleT = 0;
  function wake() {
    if (!ui) return;
    ui.bar.classList.remove('idle');
    clearTimeout(idleT);
    if (phone()) return;   // (a phone's controls never hide)
    idleT = setTimeout(() => { if (ui && !ui.bar.matches(':hover, :focus-within')) ui.bar.classList.add('idle'); else wake(); }, 2600);
  }
  function toggleQuiz() {
    quiz = !quiz;
    toast(quiz ? 'Quiz: each level opens as a question; the next click reveals it.' : 'Quiz off.');
    gen++; shown = null; go(want, false);
  }
  function toggleProj() {
    hiCon = !hiCon;
    try { localStorage.setItem(PROJ, hiCon ? '1' : '0'); } catch { /* storage unavailable */ }
    app.classList.toggle('pz-hi', hiCon);
    paintChrome(); onResize();
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

  // ── Swipe: a sideways swipe over the figure (one finger, mostly horizontal, over 60 px) goes on or back; pans
  // and pinches that are not mostly sideways stay with the figure, and nothing on a card counts. ──
  // (Touch events, not pointer events: the browser keeps its pans on the stage while presenting, which cancels pointers.)
  let sw = null;
  wrap.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    sw = deck && e.touches.length === 1 && !e.target.closest?.('.stage-blocker') ? { x: t.clientX, y: t.clientY, t: performance.now() } : null;
  }, { passive: true, capture: true });
  wrap.addEventListener('touchmove', (e) => { if (e.touches.length > 1) sw = null; }, { passive: true, capture: true });
  wrap.addEventListener('touchcancel', () => { sw = null; }, { passive: true, capture: true });
  wrap.addEventListener('touchend', (e) => {
    const g = sw, t = e.changedTouches[0]; sw = null;
    if (!g || !deck || !t || e.touches.length) return;
    const dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.6 * Math.abs(dy) && performance.now() - g.t < 700) { if (dx < 0) next(); else prev(); }
  }, { passive: true, capture: true });

  // ── Hands off: while presenting, the figure only points (hover glow); taps, drags, pans and zooms that would
  // move it off the slide's script are swallowed. The swipe above uses touch events, so it still works. ──
  const offFig = (e) => deck && e.target.closest?.('#stageView') && !e.target.closest('#overlay');
  for (const t of ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'gesturestart'])
    wrap.addEventListener(t, (e) => { if (offFig(e)) { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true, passive: false });

  // ── Keys ──
  function onKey(e) {
    if (!deck || e.ctrlKey || e.metaKey || e.altKey) return;
    if (ui && !ui.jump.hidden) { jumpKey(e); return; }
    const tag = e.target?.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
    let used = true;
    if (/^[0-9]$/.test(k)) { digits = (digits + k).slice(-3); clearTimeout(digitT); digitT = setTimeout(() => { digits = ''; }, 2500); toast(`Slide ${digits}: press Enter`); }
    else if (k === 'Enter' && digits) { const n = +digits; digits = ''; if (n >= 1) go(n - 1); }
    else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter' || k === 'ArrowDown') { if (!e.repeat) next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp' || k === 'Backspace') { if (!e.repeat) prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1);
    else if (lk === 'b' || k === '.' || lk === 'w') toggleBlack();
    else if (lk === 'f') fullscreen();
    else if (lk === 'q') toggleQuiz();
    else if (lk === 'g') toggleJump(true);
    else if (lk === 'p') toggleProj();
    else if (lk === 'n' || lk === 's' || lk === 'l') { /* the app's own N, S and L (such as the lens) stay off while presenting */ }
    else if (k === 'F5') { /* a clicker's "start show": never reload the page */ }
    else if (k === 'Escape') { if (black) toggleBlack(false); else stop(); }
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  addEventListener('keydown', onKey, true);

  // ── Start and stop ──
  function build() {
    const ladder = bigLadder(), tiles = bigTiles();
    const text = h('section', { class: 'pz-text stage-blocker', 'aria-live': 'polite' });
    const dhT = h('span', {}, 'Pressure, portal vein to heart'), dhL = h('span', { class: 'pz-lg' }, h('i', { class: 'now' }), 'This patient', h('i', { class: 'base' }), 'Healthy');
    const tools = createTools({ host, stage });
    // On a phone an instrument above tiles folds away (the tiles keep the reading), so the figure is not a strip between
    // two cards; the button opens it, and it stays open for the rest of the talk.
    const fold = h('button', { class: 'pz-fold', type: 'button', 'aria-expanded': 'false', onclick: () => {
      const open = !data.classList.contains('tool-open');
      data.classList.toggle('tool-open', open); fold.setAttribute('aria-expanded', String(open)); fold.textContent = open ? 'Hide' : 'Show';
      setTimeout(onResize, reduce.matches ? 0 : 380);
    } }, 'Show');
    const data = h('section', { class: 'pz-data stage-blocker pz-hide', 'data-safe': 'right', hidden: true, 'aria-label': 'The numbers' },
      h('div', { class: 'pz-dh' }, dhT, dhL, fold), tools.el, ladder.el, tiles.el);
    const veil = h('div', { class: 'pz-veil' }), panel = h('section', { class: 'pz-panel stage-blocker', hidden: true, 'aria-live': 'polite' });
    const count = h('div', { class: 'pz-count stage-blocker', 'aria-hidden': 'true' }), prog = h('div', { class: 'pz-prog', 'aria-hidden': 'true' }, h('i'));
    const bar = h('div', { class: 'pz-bar stage-blocker', role: 'toolbar', 'aria-label': 'Presenter' });
    bar.addEventListener('focusin', wake);
    const blackEl = h('div', { class: 'pz-black', 'aria-hidden': 'true', onclick: () => toggleBlack(false) });
    // The shade sits under the corner credit (both at figure level, the credit later), the slide over both.
    const shade = h('div', { class: 'pz-shade' });
    // What the figure frames itself clear of: the words, the glass and its shadow.
    const safe = h('div', { class: 'pz-safe', 'aria-hidden': 'true', hidden: true });
    const load = h('div', { class: 'pz-load', 'aria-hidden': 'true' }, h('i'));
    const jump = h('nav', { class: 'pz-jump stage-blocker', hidden: true, 'aria-label': 'Slides' });
    const root = h('div', { class: 'pz' }, safe, veil, load, text, data, panel, count, prog, bar, jump, blackEl);
    wrap.insertBefore(shade, wrap.querySelector('.stage-credit'));
    wrap.append(root);
    return { root, shade, safe, load, text, data, dhT, dhL, ladder, tiles, tools, veil, panel, count, prog, bar, black: blackEl, jump };
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
    const want0 = Math.max(0, (parseInt(at, 10) || 0));
    const d = typeof id === 'object' ? id : all().find((x) => x.id === (ALIAS[id] || id));
    if (!d?.slides?.length) { toast('That presentation could not be found.'); return; }
    // Starting another deck while one runs keeps the state from before the first.
    const before = deck ? saved : await capture();
    if (deck) stop(false);
    saved = before;
    if (saved && !saved.cards) saved.cards = stashCards?.();
    deck = d; slides = d.mine ? d.slides : withOverview(d).slides; shown = null; shownState = -1; quiz = false; black = false;
    closeHome?.();
    const st0 = store.get();
    if (!layersBefore) layersBefore = { ...st0.lobuleLayers };
    store.set({ presenting: true, selection: null, details: null, compareSnap: null, colorMode: 'pressure', presentLabels: [], focus: null, ...(st0.mode !== 'explore' ? { mode: 'explore' } : {}) });
    if (st0.view !== 'anatomic' && !st0.lobule) store.set({ view: 'anatomic' });
    projectorOn();
    app.classList.add('presenting');
    app.classList.toggle('pz-hi', hiCon);
    ui = build();
    if (base) ui.ladder.setBase(base);
    setLabels();
    prepare();
    addEventListener('resize', onResize);
    go(Math.min(want0, slides.length - 1));
    wake();
  }
  function stop(restore = true) {
    if (!deck) return;
    stopLapse(); cathStop(); abSlow(); liveOff = false;   // (before deck is cleared: stopping a time-lapse repaints the bar)
    deck = null; shown = null; want = 0;
    for (const w of waiters) w.res(null);
    waiters = [];
    removeEventListener('resize', onResize);
    store.set({ presenting: false, presentLabels: null, presentTerms: null, presentNames: false, focus: null, lobuleCallout: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null); delete app.dataset.lit;
    clearTimeout(idleT);
    ui?.tools.dispose(); ui?.root.remove(); ui?.shade.remove(); ui = null;
    view.classList.remove('pz-out');
    for (const k of ['--pz-l', '--pz-r', '--pz-t', '--pz-b']) app.style.removeProperty(k);
    wrap.querySelector('.stage-credit')?.style.removeProperty('--sheet-h'); wrap.querySelector('.stage-credit')?.classList.remove('pz-covered');
    stage.setProjection(false);
    document.documentElement.style.setProperty('--label-k', String(stage.labelEff())); document.documentElement.style.setProperty('--label-scale', String(stage.labelScale()));
    dispatchEvent(new Event('pps:labelscale'));
    if (document.fullscreenElement) document.exitFullscreen?.();
    app.classList.remove('presenting', 'pz-hi');
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

  // ── Library (Home › Present) ──
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
    if (!s) return;
    const step = captureStep();
    step.title = prompt('Title for this slide', step.title) || step.title;
    s.steps.push(step); writeMine(list); rerenderHome?.();
  }
  function remove(id) { if (!confirm('Delete this script?')) return; writeMine(readMine().filter((x) => x.id !== id)); rerenderHome?.(); }
  function exportScript(s) { download(`${s.title.replace(/[^\w-]+/g, '-').toLowerCase()}.pps-script.json`, JSON.stringify(s, null, 2), 'application/json'); }
  const copy = (url, msg) => navigator.clipboard?.writeText(url).then(() => toast(msg), () => prompt('Copy this link', url)) ?? prompt('Copy this link', url);
  const shareScript = (s) => copy(`${location.origin}${location.pathname}#script=${enc(s)}`, 'Link copied: opening it adds the script to the recipient’s library.');
  const shareDeck = (d) => copy(`${location.origin}${location.pathname}?script=${d.id}`, 'Link copied: it opens this presentation at its first slide.');
  function importFile() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', async () => {
      try { addToLibrary(JSON.parse(await inp.files[0].text())); } catch { toast('That file is not a presenter script.'); }
    });
    inp.click();
  }
  function addToLibrary(s) {
    if (!s?.title || !Array.isArray(s.steps)) throw new Error('bad script');
    const list = readMine();
    list.push({ ...s, id: 'my-' + Date.now().toString(36), builtin: undefined });
    writeMine(list); rerenderHome?.();
    toast(`Added “${s.title}” to your scripts.`);
  }
  /** A shared link (#script=…) adds its script to this device's library. */
  function readLink() {
    const m = location.hash.match(/#script=([\w-]+)/);
    if (!m) return false;
    try { addToLibrary(dec(m[1])); } catch { toast('The shared script could not be read.'); }
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  // A small still of the deck's first slide (brand/decks, made by scripts/deck-stills.mjs) in the page's theme;
  // it fades in once loaded, and a deck without one simply shows none.
  function deckStill(d) {
    const dark = (document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    const img = h('img', { class: 'pzd-still', alt: '', 'aria-hidden': 'true', decoding: 'async', loading: 'lazy', src: `brand/decks/${d.id}-${dark ? 'dark' : 'light'}.webp` });
    img.onload = () => img.classList.add('on');
    img.onerror = () => img.remove();
    return img;
  }
  function home() {
    const mine = readMine();
    const deckCard = (d) => h('article', { class: 'pz-deck', 'data-level': d.level },
      h('div', { class: 'pzd-head' },
        h('div', { class: 'pzd-hd' },
          h('div', { class: 'pzd-top' }, h('span', { class: 'pzd-lvl' }, LEVELS[d.level] || ''), h('span', { class: 'pzd-meta' }, `${d.slides.length + 1} slides · ${d.minutes} min`)),
          h('h3', {}, d.title)),
        deckStill(d)),
      h('div', { class: 'script-acts' },
        h('button', { class: 'btn sm primary', onclick: () => start(d.id) }, svgIcon('projector', 'mi-ic'), 'Present'),
        h('button', { class: 'btn ghost sm', onclick: () => shareDeck(d) }, 'Copy link'),
        h('button', { class: 'btn ghost sm', title: 'Speaker notes and questions for the room, one row per slide, to print or keep on a phone', onclick: () => openHandout(d) }, 'Print notes')));
    const scriptCard = (s) => h('div', { class: 'home-item script' },
      h('span', { class: 'meta' }, `${s.steps.length} slides · Yours`), h('span', { class: 't' }, s.title), h('span', { class: 'd' }, s.summary || ''),
      h('span', { class: 'script-acts' },
        h('button', { class: 'btn sm primary', onclick: () => start(s.id) }, svgIcon('projector', 'mi-ic'), 'Present'),
        h('button', { class: 'btn sm', onclick: () => addStep(s.id) }, 'Add current state'),
        h('button', { class: 'btn sm ghost', onclick: () => shareScript(s) }, 'Share link'),
        h('button', { class: 'btn sm ghost', onclick: () => exportScript(s) }, 'Export'),
        h('button', { class: 'btn sm ghost', onclick: () => openHandout(fromScript(s)) }, 'Print notes'),
        h('button', { class: 'btn sm ghost', onclick: () => remove(s.id) }, 'Delete')));
    return h('div', { class: 'pz-lib' },
      h('p', { class: 'ctl-sub lib-note' }, 'Slide presentations that run on the live model, with a question for the audience on each slide.'),
      // Simple to advanced, a thin divider naming each level (decks keep their order within it).
      ...Object.keys(LEVELS).flatMap((lv) => { const ds = DECKS.filter((d) => d.level === lv); return ds.length ? [h('h3', { class: 'pz-lvl-div' }, LEVELS[lv]), h('div', { class: 'pz-decks' }, ds.map(deckCard))] : []; }),
      h('h3', { class: 'home-sub' }, 'Your scripts'),
      mine.length ? h('div', { class: 'home-grid' }, mine.map(scriptCard)) : h('p', { class: 'ctl-sub' }, 'A script is a series of model states you capture yourself. It plays like the presentations above.'),
      h('div', { class: 'btn-row', style: { marginTop: '12px' } },
        h('button', { class: 'btn', onclick: newScript }, 'New script from the current model'),
        h('button', { class: 'btn', onclick: importFile }, 'Import a script')),
      h('p', { class: 'ctl-sub' }, 'While presenting: → or Page Down next, ← back, a number then Enter jumps, B black screen, F full screen, Q quiz, P projector contrast, Esc stops. Clickers work.'));
  }

  // Present a case: any case full screen for a class. Projector-size labels on the figure; the slim bar reminds the presenter to take a show of hands before committing.
  let classBar = null;
  function presentCase(id) {
    closeHome?.();
    startCase(id);
    stage.setProjection(innerWidth >= 768);   // projector-size labels; the case panel stays open
    app.classList.add('class-case');
    classBar?.remove();
    classBar = h('div', { class: 'class-bar stage-blocker', role: 'status' },
      h('span', { class: 'cb-k' }, 'Presenting'),
      h('span', {}, 'Read each choice aloud, take a show of hands, then commit for the room.'),
      h('button', { class: 'ib', 'aria-label': 'Stop presenting the case', title: 'Stop (Esc)', onclick: endCase }, icon('close')));
    view.append(classBar);
  }
  function endCase() {
    if (!classBar) return;
    classBar.remove(); classBar = null;
    app.classList.remove('class-case');
    stage.setProjection(false);
  }
  addEventListener('keydown', (e) => { if (classBar && e.key === 'Escape' && !deck) endCase(); });

  return { start, stop, home, readLink, presentCase, active: () => !!deck };
}
