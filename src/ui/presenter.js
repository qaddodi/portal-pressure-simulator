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
// ← Page Up back, a number then Enter jumps, G the slide list, Home End, B or . black screen, F full screen,
// P high contrast, Esc. On a touch screen a sideways swipe anywhere on the slide goes on or back.

import { store, replaceParams } from './store.js?v=7fb7280c05';
import { h, toast, svgIcon, icon, fmt, clamp, openModal, closeModal, restBox } from './util.js?v=b1761ad19c';
import { swipeDir, ownsSideways } from './swipe.js?v=22a6f38036';
import { download } from './records.js?v=50fb9dd463';
import { SITES } from './ladder.js?v=762bcbdd62';
import { sinusoidSupported } from './sinusoid-view.js?v=5033bbc95f';
import { NODES } from '../engine/topology.js?v=34e377149b';
import { DECKS, REGIONS, LEVELS, TOPICS, withOverview } from './decks.js?v=c4c5646ee7';
import { wholeGap, tenthGap } from '../engine/gap.js?v=3a5947c552';
import { createHvpgMonitor } from './hvpg-proc.js?v=b87658d79c';
import { createTools } from './presenter-tools.js?v=25a90bc286';
import { openHandout } from './handout.js?v=9e5da7e200';
import { parseDeckSource, checkDeck } from './deck-source.js?v=8395c650cd';
import { NO_ASC, TILE, rateOf, COLS, CUT, PRESS, fpv, dirAbs, dirRel, rateAbs, effOf } from './table-marks.js?v=bf239e7484';
import { frameFor, cancelFrame } from './frame.js?v=0db47e99bf';
const nextFrame = frameFor('presenter');

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
  imv: { node: 'IMV', edges: ['V_IMV'], tone: 'imv', words: 'inferior mesenteric veins?|inferior mesenteric' },
  smv: { node: 'SMV', edges: ['SMV_CONF', 'V_INT'], tone: 'smv', words: 'superior mesenteric veins?|superior mesenteric' },
  sin: { node: 'SIN_R', edges: ['SIN_RR', 'SIN_LL'], tone: 'wedge', words: 'sinusoids?|sinusoidal pressure' },
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
  return { labels, terms, glow: [...glow].map(([id, tone]) => ({ id, tone, at: at.get(id) || 0, soft: soft.has(id) || undefined })), organs: [...organs].map(([id, tone]) => ({ id, tone })), res: [...res].map(([id, tone]) => ({ id, tone })), lit: [...lit], sites: [...sites] };
}
// A live value pill ({pv}): the model's reading for this slide, to its usual decimal.
function liveVal(k, s, fp) {
  const T = TILE[k], v = fp?.[k];
  if (v == null || !Number.isFinite(v)) return '…';
  const d = T.d ?? 1;
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
// The still column inside the lobule (D5), for a wedge slide with column: true: the balloon stops the hepatic vein,
// and the column behind it (in the wedge colour) fills back through the central vein and the sinusoids to the
// first moving blood. Here it stops at a block in the portal tract (schistosomiasis), so the wedge never sees it.
function wedgeColumn() {
  const S = 'http://www.w3.org/2000/svg', el = (t, a = {}, txt) => { const e = document.createElementNS(S, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (txt) e.textContent = txt; return e; };
  const svg = el('svg', { class: 'pz-col', viewBox: '0 0 360 98', role: 'img', 'aria-label': 'The still column fills from the balloon back through the central vein and the sinusoids, and stops at the block in the portal tract.' });
  const shapes = [
    el('rect', { class: 'c-pv', x: 4, width: 76, height: 18, rx: 9 }), el('rect', { class: 'c-sin', x: 92, width: 146, height: 14 }),
    el('rect', { class: 'c-hv', x: 238, width: 104, height: 20, rx: 10 }), el('rect', { class: 'c-fill', x: 92, width: 238, height: 20, rx: 6 }),
    el('ellipse', { class: 'c-bal', cx: 330, rx: 13, ry: 13 }), el('path', { class: 'c-blk' })];
  const topT = el('text', { class: 'c-top', 'text-anchor': 'middle' });
  const names = [[40, 'Portal vein'], [165, 'Sinusoids'], [262, 'Central vein'], [330, 'Balloon']].map(([x, t]) => ({ x, t, e: el('text', { 'text-anchor': 'middle' }, t) }));
  const blk = el('text', { class: 'c-blkt', 'text-anchor': 'middle' }, 'Block in the portal tract');
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
  fitChart(svg, ({ cap: c }) => {
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
    const nBlk = lines(blk, 'Block in the portal tract', 86, c); blk.setAttribute('y', by.toFixed(1));
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
  return { pv: m.pv, whvp: m.whvp, fhvp: m.fhvp, hvpg: tenthGap(m.whvp, m.fhvp, m.hvpg), ra: m.ra, ivc: m.ivc, ppg: tenthGap(m.pv, m.ivc, m.ppg), asc: a.volume, saag: a.saag, tp: a.totalProtein,
    sin: P?.[NI.SIN_R], int: P?.[NI.INT], varix: m.varix.d, gv: m.gastricVarix.d, spleen: m.spleen.length, plt: m.spleen.platelets,
    pvFlow: m.pvFlowMean, shunt: m.shuntFraction, liver: m.liverPerfPct, map: m.map, hr: m.hr, lsm: m.lsm, pvVel: m.pvVelMean, hb: m.blood?.hb };
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
    const pr = document.createElement('span'), host = svg.closest('.pz') || document.body;
    pr.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    host.append(pr);
    const fs = {};
    for (const r of ROLE_NAMES) { pr.style.fontSize = `var(--s-${r})`; fs[r] = parseFloat(getComputedStyle(pr).fontSize) * k; }
    pr.remove();
    if (c.fs && ROLE_NAMES.every((r) => Math.abs(c.fs[r] - fs[r]) < 0.01 * fs[r]) && Math.abs(c.w - box.width) + Math.abs(c.h - box.height) < 1) return;
    c.fs = fs; c.w = box.width; c.h = box.height; lay(fs, box);
  }
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

/** The pressure ladder at projector size: five stations, the healthy line dashed behind, every fall of
 *  more than 4 mmHg shaded as a block. Under the axis, as on the app's own pressure chart, two spans run
 *  along the stations, named: HVPG (wedged to free hepatic vein) and PPG (portal
 *  vein to the IVC), coloured by their cut-offs, with faint leaders up to the
 *  stations they join. set(f, { key }) glides the line and counts the numbers. */
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
    const r = sv('rect', { rx: 12 });   // (placed in lay; y and height follow the axis, in draw; the band carries no label)
    return { g: sv('g', { class: 'pzl-drop', opacity: 0 }, r), r };
  });
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
  const conns = [0, 1, 2, 3].map(() => ({ band: sv('rect', { class: 'pzs-drop', rx: 6, opacity: 0 }) }));
  // (The line stops a clear gap short of each reading, so no outline is needed: the gap is measured from the digits' own edge, so it is the same beside one digit or two, and it eases when a reading gains or loses a digit.)
  const sline = sv('path', { class: 'pzs-c', stroke: `url(#${gid}s)` });
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
    sv('defs', {}, sgrad), conns.map((c) => c.band), sline, spts.map((p) => [p.g, p.k]), unit, hvS.g, ppS.g);
  // A bracket's label: inline with a gap each side when the bracket has room for it, otherwise just above an unbroken line
  // (its width an estimate, so a hidden strip needs no measuring and nothing jumps).
  const lay = (b) => {
    if (!b.len) return;
    const half = b.len / 2 + 0.6 * S.c, mid = (b.x0 + b.x1) / 2, r = b.row, above = b.x1 - b.x0 - 2 * half < 14;
    b.lbl.setAttribute('y', (above ? r - 0.4 * S.c : r + 0.33 * S.c).toFixed(1));
    b.bar.setAttribute('d', `M${b.x0} ${r - 3}V${r + 3}M${b.x1} ${r - 3}V${r + 3}` + (above ? `M${b.x0} ${r}H${b.x1}` : `M${b.x0} ${r}H${mid - half}M${mid + half} ${r}H${b.x1}`));
  };
  const layS = (fs) => {
    // (A reading takes the largest role whose two digits still leave the line its gap on each side between stations 70 apart:
    // in a narrow card at a large text size the value role would run the readings into each other.)
    const fit = [fs.val, fs.body, fs.lab, fs.cap].filter((x) => x > 0), v0 = fit.find((x) => est('20', x, 0.62) + 2 * 5 + 10 <= 70) ?? Math.min(...fit);
    const c = S.c = fs.cap, v = S.v = v0;
    // The names take two rows when neighbours would touch. (No falls are written: a big one is shaded instead.)
    const nameW = Math.max(...RUNGS.map(([, a]) => est(a, c, 0.7))), two = nameW > 70 - 6;
    S.ky = 0.8 * c + 1; S.ky2 = two ? S.ky + 1.15 * c : S.ky;
    S.ny = S.ky2 + 0.3 * c + 0.55 * v + 3; S.vy = S.ny + 0.36 * v;
    numW.clear(); lineKey = '';
    // The unit sits after the last reading when it fits there, else at the end of the HVPG row (under the last stations).
    const inline = XS(4) + est('20', v, 0.62) / 2 + 8 + est('mmHg', c, 0.68) <= S.W - 1;
    S.hvpg = S.ny + 0.5 * v + 6 + 1.05 * c; S.ppg = S.hvpg + 1.45 * c; S.H = S.ppg + 0.6 * c + 3;
    // (A phone's site-ladder cell hides the brackets, its kicker carries the HVPG: the strip ends under its readings.)
    const bare = !!strip.closest('.pz.stack .pz-cell');
    if (bare) S.H = S.ny + 0.5 * v + 4;
    unit.style.display = bare && !inline ? 'none' : '';
    strip.setAttribute('viewBox', `0 0 ${S.W} ${S.H.toFixed(1)}`);
    conns.forEach((cn) => { const y0 = S.ky2 + 0.35 * c; cn.band.setAttribute('y', y0.toFixed(1)); cn.band.setAttribute('height', (S.ny + 0.5 * v - y0).toFixed(1)); });
    spts.forEach((p, i) => { p.v.setAttribute('y', S.vy.toFixed(1)); fsOf(p.v, v); p.k.setAttribute('y', (i % 2 ? S.ky2 : S.ky).toFixed(1)); fsOf(p.k, c); });
    unit.setAttribute('x', S.W - 2); unit.setAttribute('y', (inline ? S.vy : S.hvpg + 0.33 * c).toFixed(1)); fsOf(unit, c);
    hvS.row = S.hvpg; ppS.row = S.ppg;
    for (const b of [hvS, ppS]) fsOf(b.lbl, c);
    draw.again(); placeLine();
  };
  // The connecting line between readings: each end stops LINE_PAD short of the digits' own edge. A reading's width is
  // measured once per digit count (tabular figures, so any number of that length is as wide), or estimated while the strip is hidden.
  const LINE_PAD = 5, numW = new Map(), halves = [0, 0, 0, 0, 0];
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
  const placeLine = () => {
    const goal = spts.map(halfOf), key = goal.join() + '|' + S.ny;
    if (key === lineKey) return;
    lineKey = key;
    const step = () => {
      let moving = false;
      goal.forEach((g, i) => { const d = g - halves[i]; if (!halves[i] || Math.abs(d) < 0.05) halves[i] = g; else { halves[i] += d * 0.3; moving = true; } });
      // (The big fall's band spans its stretch of line, between the two readings, from the falls' row down past the line.)
      conns.forEach((cn, i) => { const x = XS(i) + halves[i] + 2; cn.band.setAttribute('x', x.toFixed(1)); cn.band.setAttribute('width', Math.max(4, XS(i + 1) - halves[i + 1] - 2 - x).toFixed(1)); });
      sline.setAttribute('d', [0, 1, 2, 3].map((i) => `M${(XS(i) + halves[i] + LINE_PAD).toFixed(2)} ${S.ny}H${(XS(i + 1) - halves[i + 1] - LINE_PAD).toFixed(2)}`).join(''));
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
    sv('defs', {}, sv('linearGradient', { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 }, sv('stop', { offset: 0, 'stop-color': 'var(--tour-portal)' }), sv('stop', { offset: 1, 'stop-color': 'var(--tour-sys)' }))),
    grid.map((r) => r.g),
    bands.map((b) => b.g), hv.g, pp.g, base, line, pts.map((p) => p.g));
  const layL = (fs, box) => {
    c = fs.cap; l = fs.lab; ph = 1.75 * c;
    tx = est('50', c) + 4; gx = tx + 0.5 * c; x0 = gx + 12;
    const xr = W - Math.max(56, Math.max(est('WHVP', c, 0.66) / 2, est('20', l) / 2) + 8);
    step = (xr - x0) / 4;
    const nameRows = Math.max(...RUNGS.map(([, a]) => est(a, c, 0.66))) > step - 0.4 * c ? 2 : 1;
    // (The readings sit above their points, at the top of the plot.)
    yTop = 6 + 0.8 * l + 12.5 + 0.22 * l;
    // (A ladder in a cell of fixed height, the site ladders, gives its plot whatever height the lettering leaves.)
    const rows = (ph / 2 + 13) + (ph + 12) + (ph / 2 + 10 + 0.75 * c) + 0.25 * c + 6;
    const cell = box && el.closest('.pz-panel.fill .pz-cell');
    if (cell) {
      PH = W * box.height / box.width - yTop - rows - (nameRows > 1 ? 1.15 * c : 0);
      // (Too short for a plot at this text size: the cell shows the strip instead, for the rest of the slide.)
      if (PH < 60) { cell.classList.add('strip'); PH = 60; }
    }
    const yBot = yTop + PH;
    hv.row = yBot + ph / 2 + 13; pp.row = hv.row + ph + 12;
    nameY = [pp.row + ph / 2 + 10 + 0.75 * c]; nameY[1] = nameY[0] + (nameRows > 1 ? 1.15 * c : 0);
    H = nameY[1] + 0.25 * c + 6;
    el.setAttribute('viewBox', `0 0 ${W} ${H.toFixed(1)}`);
    for (const g of grid) { g.line.setAttribute('x1', gx.toFixed(1)); g.line.setAttribute('x2', W - 10); g.txt.setAttribute('x', tx.toFixed(1)); fsOf(g.txt, c); }
    bands.forEach((b, i) => { b.r.setAttribute('x', (X(i) + 16).toFixed(1)); b.r.setAttribute('width', Math.max(4, step - 32).toFixed(1)); });
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
      g.g.setAttribute('opacity', (clamp(f['g' + g.v] ?? 0, 0, 1) * (g.v % (stepOf(tTo) * sparse) === 0 ? 1 : 0)).toFixed(3));
    }
    bands.forEach((b) => { b.r.setAttribute('y', (Y(top) - 6).toFixed(1)); b.r.setAttribute('height', (Y(0) - Y(top) + 6).toFixed(1)); });
    drawBase();
    const y = RUNGS.map(([k]) => Y(f[k]));
    line.setAttribute('d', y.map((yy, i) => `${i ? 'L' : 'M'}${X(i)} ${yy.toFixed(1)}`).join(' '));
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
      b.lead.setAttribute('d', `M${b.x0} ${(b.by ?? b.row) - 6}V${(Y(hi) + 12).toFixed(1)}M${b.x1} ${(b.by ?? b.row) - 6}V${(Y(lo) + 12).toFixed(1)}`);
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
      b.lead.setAttribute('d', `M${b.x0} ${b.row - 5}V${S.ny + 0.5 * S.v + 2}M${b.x1} ${b.row - 5}V${S.ny + 0.5 * S.v + 2}`);
      b.g.dataset.rate = rate || 'ok';
      const num = ' ' + fmt(v, 0);
      b.t[0].textContent = b.name; b.t[1].textContent = num;
      b.len = est(b.name, S.c, 0.64) + est(num, S.c, 0.52); lay(b);
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
    set(f, { key = [], ms, brackets = null } = {}) {
      verdict = brackets || {};
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
  // After TIPS the PPG is read against its target (below 12 mmHg), so a tile never says "Raised" under a line that
  // says the target is reached.
  const rated = (k, f) => (goal && k === 'ppg' && f.ppg != null ? (f.ppg < 12 ? ['ok', 'Target met'] : ['hi', 'Above target']) : rateOf(k, f));
  function build(ks, withRef) {
    parts = ks.map((k) => {
      const T = TILE[k] || { t: k, s: '', u: '' };
      const v = h('span', { class: 'pzt-v' }), u = h('small', {}, T.u), r = h('span', { class: 'pzt-r' });
      // The change in parts, so a phone can say it short ("▲ 7.5 from 5.0": the word and unit fold away there).
      const dp = [h('span'), h('span', { class: 'pzt-dw' }), h('span'), h('span', { class: 'pzt-du' }), h('span')], d = h('span', { class: 'pzt-d' }, dp);
      const tile = h('div', { class: 'pz-tile' }, h('span', { class: 'pzt-k' }, T.t), h('span', { class: 'pzt-vu' }, v, u), r, withRef ? d : null);
      return { k, T, tile, v, u, r, d, dp };
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
      // (The change is taken between the two numbers as shown, so it always equals the value minus the "from".)
      const x = p.T.x ?? 1, dg = p.T.d ?? 1, rd = (v) => +(v * x).toFixed(dg), dd = rd(f[p.k]) - rd(r0), same = Math.abs(dd) < 0.5 * 10 ** -dg;
      // "Up 9 points from 82%", "Down 2.1 mmHg from 17.7": the change, then where it started (never read as "up to").
      const pct = p.T.u === '%', by = pct ? (Math.abs(dd) === 1 ? ' point' : ' points') : p.T.u ? ' ' + p.T.u : '';
      const t = same ? ['No change', '', '', '', ''] : [dd < 0 ? '▼ ' : '▲ ', dd < 0 ? 'Down ' : 'Up ', fmt(Math.abs(dd), dg), by, ` from ${fmt(r0 * x, dg)}${pct ? '%' : ''}`];
      p.dp.forEach((e, i) => { if (e.textContent !== t[i]) e.textContent = t[i]; });
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
      el.dataset.keys = ks.join();
      // (On a phone the strip's brackets carry HVPG and PPG with their ratings, so plain tiles of just those two fold away.)
      el.dataset.compact = ks.join() === 'hvpg,ppg' && !ref && !tips ? '1' : '';
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
  const SUBNAME = { hvpg: 'HVPG', plt: 'Platelets', ppg: 'PPG' };
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
  let seq = 1, post = null, kill = () => {};
  const onMsg = (m) => {
    const p = pending.get(m.reqId);
    if (!p) return;
    if (m.type === 'seqStep') { p.step?.(m); return; }
    pending.delete(m.reqId); p.done(m);
  };
  const ready = (async () => {
    try {
      const w = new Worker(new URL('../worker.js?v=d885abc219', import.meta.url), { type: 'module' });
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
      const { createCore } = await import('../worker-core.js?v=19fa98e79f');
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

export function createPresenter({ openSettings, loadPreset, host, stage, projectorOn, projectorOff, closeHome, stashCards, rerenderHome }) {
  const app = document.getElementById('app'), view = document.getElementById('stageView'), wrap = document.getElementById('stageWrap');
  let calc = null;
  const getCalc = () => (calc ||= makeCalc());
  const cache = new Map();   // deck id → computed states, reused the next time it is presented
  let deck = null, slides = [], states = [], waiters = [], stateOf = [], base = null, extraOf = new Map();
  // `gen` counts redraws asked of the slide in place (quiz on or off): a transition under way for an older one starts over.
  let want = 0, wantRev = false, shown = null, shownState = -1, busy = false, quiz = false, gen = 0;
  let ui = null, black = false, digits = '', digitT = 0;
  let saved = null, layersBefore = null;   // (the viewer's own lobule layers, put back when the show ends)
  // High contrast (P, or Settings): a deeper shade, stronger text, ratings as filled chips. It changes colour only, never a size. Remembered.
  const PROJ = 'pps.projector';
  let hiCon = (() => { try { return localStorage.getItem(PROJ) === '1'; } catch { return false; } })();
  // Panel width (Settings): the words' panel at its usual width (medium), narrower or wider. Remembered. A phone's panel spans the screen.
  const PW = 'pps.pzWidth', PW_K = { narrow: 0.8, medium: 1, wide: 1.3 };
  let pzWidth = (() => { try { const v = localStorage.getItem(PW); return PW_K[v] ? v : 'medium'; } catch { return 'medium'; } })();

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
    const c = getCalc(), steps = [...slides.map((s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse, trail: s.tool?.kind === 'flowtime' && (s.tool.lines || true) } : {})), ...extra.map((o) => ({ preset: o.preset, params: o.params, days: o.days }))];
    const presetAt = []; let pid = store.get().presetId;
    slides.forEach((s, i) => { if (s.preset) pid = s.preset; presetAt[i] = pid; });
    extra.forEach((o, k) => { presetAt[slides.length + k] = o.preset; });
    const deckNow = deck;
    (async () => {
      const first = slides[0]?.preset ? null : (await host.request('snapshot')).snap;
      if (!base) c.request('presetMetrics', { ids: ['healthy'] }).then((m) => { base = m.result?.healthy || null; if (deck === deckNow) ui?.ladder.setBase(base); });
      await c.sequence(steps, first, (m) => {
        const st = { snap: m.snap, params: m.params, fp: m.fp, trail: m.trail, presetId: presetAt[m.i] };
        if (m.start) st.start = { ...m.start, presetId: presetAt[m.i] };
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
    if (next && !reduce.matches && !booting) stage.riseTo(next.box, next.kMax, next.clear);   // (box: a function, asked for when the rise begins)
    // Out of the sinusoid and the lobule as one zoom (the sinusoid closes and the rise follows it at once), or out of the lobule alone.
    if (st.sinusoid) stage.exitSinusoid(); else store.set({ lobule: false });
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
        // Straight from wherever the camera is into the lobule: one continuous zoom, no stop at the liver on the way. For the
        // sinusoid it is the same zoom, carried on through the lobule without resting in it.
        const toSin = cam === 'sinusoid' && sinusoidSupported();
        stage.lobuleAim(part, { zoom });
        if (toSin) stage.diveToSinusoid(); else store.set({ lobule: true });
        // (A first dive also loads the lobule, which a slow tablet can take several seconds over.)
        await until(() => cut() || (stage.lobuleSettled() && stage.lobuleOpen() && (!toSin || !store.get().sinusoid || stage.sinusoidOpen())), 12000);
        if (cut()) return;
        if (!toSin) await wait(120);
      } else {
        if (!stage.lobuleOpen()) stage.lobuleAim(part, { zoom });
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
  let lapseOn = false, lapseLeft = 0, lastAt = -1;   // (lapseLeft: days still to run; 0 once Next has sped it up; lastAt: the slide last shown)
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
    applyState(end); shownState = stateOf[to];
    paintLapse(s, days, days, true);
    ui?.tools.progress(1);
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
  async function transition(to, rev) {
    stage.holdHome(true);
    try { await transitionRun(to, rev); } finally { stage.holdHome(false); }
  }
  async function transitionRun(to, rev) {
    const g = gen, s = slides[to], cut = () => !deck || want !== to || wantRev !== rev || gen !== g;
    // The slide on screen is leaving, so a move cut short never counts as showing it: going back and forward again to that
    // slide (summary table included) draws it afresh instead of leaving the half-changed screen.
    shown = null;
    const q = asking(s, rev), cam = s.visual ? s.cam || null : q ? 'fit' : s.cam || 'fit';
    // A time-lapse starts from the slide before's state; a catheter slide drives its own camera.
    // Coming back to it from a later slide shows its end at once: it plays only going forward.
    const back = to < lastAt, lap = !!s.lapse && to > 0 && !q && !back, ct = !q && !s.visual ? s.cath || null : null;
    // In the liver, with a new framing or new lit labels: all labels out first (see hush).
    const inLiver = store.get().lobule || store.get().sinusoid;
    const litNext = !s.visual && !q ? slideTargets(s).lit.join(' ') : '';
    if (inLiver && !booting && (hushed || cam !== lastCam || litNext !== (app.dataset.lit || '') || s.visual || q || ct)) hush();
    // Words out, and the marks: they belong to the slide that is leaving.
    store.set({ focus: null, presentLabels: [], presentTerms: null, lobuleCallout: null, presentFp: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null);
    if (!hushed) delete app.dataset.lit;   // (hushed, the lit set goes straight to the next slide's: a label on both keeps its pill)
    stopLapse(); abSlow();
    const si = lap ? stateOf[to - 1] : stateOf[to];
    await wordsOut(s, shownState >= 0 && (si !== shownState || liveOff));
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
    // A new patient, or the same one changed: the figure fades out, the state changes unseen, it fades back in.
    const swap = si !== shownState || liveOff || !!own;
    if (swap) {
      if (shownState >= 0 && !view.classList.contains('pz-out')) await figureOut();
      applyState(st); shownState = own ? -1 : si; liveOff = false;
      await drawn(st);
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
    ui?.root.classList.add('pz-prep');
    wordsIn(s, q, said, to, swap, lap, st);
    await settle();
    if (cut()) return;
    // The liver's own labels light with the words, so their glow fades in during the dive rather than after it.
    if (!s.visual && !q) app.dataset.lit = slideTargets(s).lit.join(' ');
    if (s.visual === 'table') fillTable(s, cut);
    const lead = swap && !ct && cam && !LOBULE_CAM.test(cam) && !store.get().lobule && !reduce.matches && !booting ? camera(cam, s, cut) : null;
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
      // (A site the label stands in for lends it its station colour, so the label is the slide's highlight.)
      if (tg) for (const k of s.sites || []) if (SITE_NODE[k] && [...(s.labels || []), ...tg.labels].includes(SITE_NODE[k])) tg.terms[SITE_NODE[k]] ||= TARGETS[k]?.tone || VAL_TONE[k];
      store.set({ presentLabels: q ? [] : [...new Set([...(s.labels || []), ...tg.labels])], presentTerms: tg?.terms || null,
        presentNames: !q && (s.data === 'ladder' || !!s.cath), presentFp: st?.fp || null,
        focus: marks.length ? { ...marks[0], marks } : null, lobuleCallout: q || !s.callout ? null : { kind: 'block', ...s.callout } });
      if (tg) { stage.setGlow(tg.glow); stage.pinOrgans(tg.organs.map((o) => (o.id === 'spleen' && st?.fp ? { id: o.id, tone: rateTone('spleen', st.fp) } : o))); stage.setResGlow(tg.res); }
      app.dataset.lit = tg?.lit.join(' ') || '';
    }
    // A site whose station label is already on the slide is not called out twice: the label carries the one reading,
    // in its station's colour, and the pill stays only where no label stands.
    { const named = new Set(store.get().presentLabels || []);
      const ss = !s.visual && !q ? [...new Set([...(s.sites || []), ...slideTargets(s).sites])].filter((k) => !named.has(SITE_NODE[k])) : [];
      if (ss.length) stage.setSites(ss, st.fp); }
    lastCam = cam; framedSig = cardSig();
    await unhush(cut);
    if (cut()) return;
    shown = { i: to, rev, gen: g }; lastAt = to;
    paintChrome();
    if (s.lapse && to > 0 && !q && back) paintLapse(s, s.days, s.days, true);
    if (booting) await coverDown();
    if (lap) await playLapse(s, to, cut);
  }

  // The fonts in and two frames for the cards' charts and refits to run, then one last fit; then the cards show (eased in).
  async function settle() {
    if (!ui) return;
    try { await settleRun(); } finally { if (ui) { ui.root.classList.remove('pz-prep'); ui.panel.classList.remove('pz-leave'); if (ui.data.dataset.prep) { delete ui.data.dataset.prep; ui.data.classList.remove('pz-hide'); } } }
  }
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
  async function wordsOut(next, newPatient = false) {
    if (!ui) return;
    const out = [ui.text, ui.panel], data = ui.data;
    // A card that moves (under the words, or back beside them) goes out with the words and comes back in its new place.
    // (Also when its kind or title changes, so the ladder never appears or goes under the numbers in one frame.)
    const lad = next?.data === 'ladder', ttl = cardTitle(next);
    const move = !data.hidden && !data.classList.contains('pz-hide') && next && hasCard(next)
      && (under(next) !== data.classList.contains('under') || !lad !== data.classList.contains('tiles-only') || ttl !== ui.dhT.textContent
        || ui.tools.sig(next.tool) !== (data.dataset.tool || '')
        // (Other tiles change the card's size: it fades out and back in at its new size.)
        || (!lad && next.data && tileKeys(next).join() !== (ui.tiles.el.dataset.keys || '')));
    // A different patient: the card leaves with the words and stays gone until the new patient has settled, so its numbers never travel from one patient to the other.
    const gone = newPatient && !data.hidden && !data.classList.contains('pz-hide');
    if (move || gone) { data.classList.add('pz-hide'); delete data.dataset.colswap; }
    // Leaving a visual for the figure: the veil lifts with the panel, not after it.
    if (!next?.visual) ui.veil.classList.remove('on');
    if (!move && !gone && out.every((el) => el.hidden || !el.childElementCount)) return;
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
    const t = s.tool.delta != null ? { ...s, delta: s.tool.delta } : s, d = deltaOf(t, i), r = refOf(t, i);
    if (r?.[g[0]] == null) return null;
    // (The earlier reading only: the instrument's live reading jitters, so a computed change could disagree with it.)
    const from = d === true ? slides[stateOf[i - 1]] : slides.find((x) => x.id === d);
    return { label: s.tool.deltaLabel || (d === true && s.lapse?.from) || from?.kicker || 'Before', value: `${fmt(r[g[0]], g[2])} ${g[1]}` };
  }
  const cardTitle = (s) => (s?.data === 'ladder' ? 'Pressure, portal vein to heart' : s?.dataTitle || (s?.tool ? ui.tools.title(s.tool) : 'This patient'));
  // The talk so far, for a pressure trace: every state up to slide i, once each.
  // Each carries its time point (the deck's days so far) and what happened there (the first tick among its slides, else its title).
  const whenOf = (k) => {
    const d = slides.slice(0, k + 1).reduce((a, s) => a + (s.days || 0), 0);
    return d && d % 365 === 0 ? `Year ${d / 365}` : d <= 200 ? `Day ${d}` : `Month ${Math.round(d / 30.4)}`;
  };
  const chainTo = (i) => [...new Set(stateOf.slice(0, i + 1))].map((k) => ({ n: k + 1, title: slides[k].title, tick: slides.find((x, j) => stateOf[j] === k && x.tick)?.tick || slides[k].title, when: whenOf(k), fp: states[k]?.fp }));
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
      mon.set(s.monitor, states[stateOf[i]]?.fp);
    });
    return mon.el;
  }
  function wordsIn(s, q, st, i, fresh = false, lap = false, now = st) {
    if (!ui) return;
    const { text, panel, data } = ui;
    text.classList.remove('pz-leave');   // (the panel's own is let go once its new content is in, so it never fades back in with the old)
    if (s.visual) {
      text.hidden = true; text.replaceChildren();
      // A panel that was not there fades in (never pops): unhidden while still faded, then let go.
      if (panel.hidden) { panel.classList.add('pz-leave'); panel.hidden = false; void panel.offsetWidth; }
      panel.classList.toggle('fill', s.visual === 'ladders');
      panel.dataset.visual = s.visual;
      panel.replaceChildren(h('div', { class: 'pz-ph' }, s.visual === 'outline' ? h('h1', { class: 'pz-dtitle' }, nb(deck.title)) : null, h('h1', { class: 'pz-h' }, nb(s.title)), s.eq ? equation(s.eq) : null, s.line ? h('p', { class: 'pz-line' }, rich(s.line, s, st?.fp)) : null, s.caveat ? h('p', { class: 'pz-caveat' }, s.caveat) : null),
        VISUALS[s.visual](s));
      if (!ui.root.classList.contains('pz-prep')) panel.classList.remove('pz-leave');   // (else once fitted: settle)
      ui.veil.classList.add('on');
    } else {
      panel.hidden = true; panel.replaceChildren(); panel.classList.remove('pz-leave'); ui.veil.classList.remove('on');
      text.hidden = false;
      text.replaceChildren(...(q
        ? [h('h1', { class: 'pz-h' }, s.quiz), s.rail ? rail(null) : null, h('p', { class: 'pz-line pz-hint' }, 'Take answers from the audience, then press → to show the answer.')]
        : [h('h1', { class: 'pz-h' }, nb(s.title)), s.eq ? equation(s.eq) : null, s.line ? h('p', { class: 'pz-line' }, rich(s.line, s, st?.fp)) : null, s.caveat ? h('p', { class: 'pz-caveat' }, s.caveat) : null,
          s.compare ? h('div', { class: 'pz-ab', role: 'group', 'aria-label': 'Switch treatment on the live model' },
            s.compare.map((o, k) => h('button', { type: 'button', class: 'pz-abb', 'aria-pressed': String(!!o.own), onclick: () => abPick(s, i, k) }, o.label))) : null,
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
      data.toggleAttribute('data-sin-tiles', sinTiles(s));
      data.classList.toggle('has-tool', !!s.tool);
      data.classList.toggle('tool-only', !!s.tool && !s.data);
      data.classList.toggle('tool-lead', !!s.tool?.open && !!s.data);   // (a phone keeps this instrument open and folds the tiles instead)
      data.dataset.tool = ui.tools.sig(s.tool);
      ui.dhT.textContent = cardTitle(s);
      ui.dhL.hidden = !lad;
      // (A flow-time chart over a time-lapse starts empty and draws as it plays.)
      if (s.tool) ui.tools.show(s.tool, { quiz: q, stateKey: stateOf[i], chain: chainTo(i), trail: states[stateOf[i]]?.trail ?? null, reveal: lap ? 0 : 1 }); else ui.tools.hide();
      if (s.tool) ui.tools.ghost(q ? null : toolGhost(s, i));
      // (With a new patient the numbers are set at once, while the card is still out: it fades back in already showing them.)
      const ms = fresh ? 0 : undefined;
      if (lad) ui.ladder.set(now.fp, { key: q ? [] : s.key || [], ms, brackets: q ? null : s.brackets });
      if (s.data) ui.tiles.set(now.fp, tileKeys(s), q ? [] : s.key || [], q ? null : refOf(s, i), ms, now.params?.tips?.on);
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
  // A visual's rows: the deck's slides by id ('pvt', or { id, name } to name it), or { preset, name } patients that
  // no slide shows, computed after the slides.
  const rowAt = (o) => { const id = typeof o === 'string' ? o : o.id, i = id ? slides.findIndex((x) => x.id === id) : -1; return [i, i >= 0 ? stateOf[i] : extraOf.get(xKey(o))]; };
  const rowIdx = (s) => (s.of || []).map((o) => rowAt(o)[1]).filter((k) => k != null && k >= 0);
  function rowsOf(s) {
    return (s.of || []).map((o) => {
      const [i, k] = rowAt(o), sl = i >= 0 ? slides[i] : null, x = typeof o === 'object' ? o : {};
      if (k == null || k < 0) return null;
      const title = x.title ?? sl?.title ?? '';
      return { i, k, f: states[k]?.fp, kicker: x.kicker ?? sl?.kicker ?? '', title, name: x.name || title, site: x.site ?? sl?.site, note: x.note, blank: x.blank || [], ref: !!x.ref, vs: x.vs, key: x.key, calm: x.calm || [] };
    }).filter(Boolean);
  }
  const reveal = (c) => { c.classList.add('shown'); c.removeAttribute('role'); c.removeAttribute('tabindex'); c.removeAttribute('aria-label'); };
  function laddersGrid(s) {
    // (At a large text size a phone's strips take a row each: five readings no longer fit half its width.)
    const big = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts')) >= 1.3;
    const grid = h('div', { class: 'pz-grid' + (big ? ' big' : '') });
    for (const r of rowsOf(s)) {
      if (!r.f) continue;
      const L = bigLadder(); L.setBase(base); L.set(r.f, {});
      // In quiz mode each ladder's site is hidden until a tap (D7): the room names the site from the ladder's shape.
      const cell = h('div', quiz ? { class: 'pz-cell q', role: 'button', tabindex: '0', 'aria-label': 'Show the site of this ladder', onclick: () => reveal(cell), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(cell); } } } : { class: 'pz-cell' },
        h('div', { class: 'pz-cell-k' }, h('div', { class: 'pz-kick', 'data-site': r.site || 'none' }, h('i'), r.kicker.replace('Intrahepatic · ', '')),
          h('span', {}, 'HVPG ', h('b', { 'data-rate': rateOf('hvpg', r.f)[0] }, fmt(r.f.hvpg, 1)))),
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
  const UNIT_WORDS = { press: 'pressures in mmHg', varix: 'varix in mm', asc: 'ascites in liters', liver: 'liver blood flow in % of normal', shunt: 'shunted blood in %', plt: 'platelets × 10⁹/L',
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
    return h('div', { class: 'pz-table' }, h('table', { style: { '--nc': String(cols.length + (ascCols ? 2 : 0)), '--asc-w': '0px' } },
      h('thead', {}, h('tr', {}, h('th', {}, s.rowHead || 'Level'), cols.map((k) => cutTh(k, COLS[k] || k, CUT[k])),
        ascCols ? [cutTh('saag', h('abbr', { title: 'Serum−ascites albumin gradient' }, 'SAAG'), CUT.saag), cutTh('tp', h('abbr', { title: 'Ascites protein' }, 'Prot.'), CUT.tp)] : null,
        notes.map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r, n) => h('tr', { ...(r.i >= 0 ? { tabindex: '0', onclick: go1(r), onkeydown: go1(r), 'aria-label': `${r.title}: go to this slide` } : { class: 'static' }),
          'data-arrived': r.k === arrived || (rel && n > 0 && (r.vs ? vsRow(r)?.k : rows[0].k) === arrived) ? '' : null },
        h('th', { scope: 'row' }, h('span', { class: 'pz-kick', 'data-site': r.site || 'none' }, h('i'), r.kicker.replace('Intrahepatic · ', '')), h('span', { class: 'tw' }, h('span', { class: 'tn' }, nb(r.title)),
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
    outline: (s) => h('div', { class: 'pz-outline' },
      h('section', {}, h('h2', { class: 'pz-sub' }, 'Outline'), h('ol', {}, s.outline.map((k) => h('li', {}, k)))),
      s.objectives.length ? h('section', { class: 'pzo-obj' }, h('h2', { class: 'pz-sub' }, 'By the end you can'), h('ul', {}, s.objectives.map((o) => h('li', {}, o)))) : null),
  };

  // ── Layout: what the slide's words and data cover, so the figure frames itself in the rest ──
  // Only an upright phone stacks the words over the figure; a tablet (either way up) and any phone on its side keep the words
  // at the left and the data card at the right (a small phone on its side had no height for the two stacked).
  const phone = () => innerWidth < 700 && innerHeight >= 500;
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
  function overflowOf(el) {
    const cs = getComputedStyle(el), z = el.offsetHeight ? el.getBoundingClientRect().height / el.offsetHeight : 1;
    let used = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0), n = 0;
    for (const c of el.children) {
      const s = getComputedStyle(c);
      if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue;
      if (s.maxHeight === '0px') continue;   // (a folded part, a phone's closed tool: its hidden contents are not overflow)
      const cz = parseFloat(s.zoom) || 1;
      // (A part with a height cap clips by design, and mid-fold its clipped contents are not overflow either: counting them
      // shrank the card while a phone's tool folded, and the shrunk fit then stuck.)
      const clip = s.maxHeight !== 'none' ? 0 : Math.max(0, c.scrollHeight - c.clientHeight);
      used += c.getBoundingClientRect().height / z + ((parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0) + clip) * cz;
      n++;
    }
    used += (parseFloat(cs.rowGap) || 0) * Math.max(0, n - 1);
    return { v: used - el.clientHeight, h: el.scrollWidth - el.clientWidth };
  }
  // What a card's fit depends on: its box, its words (digits alike, so a number that eases fits as before) and which parts show.
  // A card whose signature is unchanged keeps its fit without being measured again (measuring forces layouts mid-animation).
  const fitSig = (el) => `${el.clientWidth}x${el.clientHeight}|${el.className}|${document.documentElement.style.cssText}|${[...el.children].map((c) => (c.hidden ? 0 : c.className + (getComputedStyle(c).maxHeight !== 'none' ? ':' + c.offsetHeight : ''))).join()}|${el.textContent.replace(/\d/g, '0')}`;
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
  function fitCards(...els) {
    for (const el of els) {
      if (!el || el.hidden) continue;
      const sig = fitSig(el);
      if (fitDone.get(el) === sig) continue;
      el.style.removeProperty('--pz-fit');
      fitHeads(el);
      let k = 1;
      for (let n = 0; n < 8 && k > 0.5; n++) {
        const o = overflowOf(el);
        if (o.v <= 1 && o.h <= 1) break;
        k = Math.max(0.5, k * Math.min(0.97, (el.clientHeight / (el.clientHeight + Math.max(o.v, 0))) ** 0.9, (el.clientWidth / (el.clientWidth + Math.max(o.h, 0))) ** 0.9));
        el.style.setProperty('--pz-fit', k.toFixed(3));
      }
      fitDone.set(el, fitSig(el));   // (as it rests once fitted: a folding part's height is part of it)
    }
  }
  // A card whose contents grow after the layout (a time-lapse, the numbers settling) is fitted again.
  let fitRO = null, fitRaf = 0, clearRO = null, clearT = 0, paneRaf = 0;
  const fitWatch = () => {
    fitRO ||= new ResizeObserver(() => {
      cancelFrame(fitRaf);
      fitRaf = nextFrame(() => { if (ui && [ui.text, ui.data, ui.panel].some((el) => !el.hidden && fitDone.get(el) !== fitSig(el) && (el.style.getPropertyValue('--pz-fit') || (({ v, h }) => v > 1 || h > 1)(overflowOf(el))))) layout(); });   // (a shrunk card is fitted again when it changes, so it can grow back)
    });
    fitRO.disconnect();
    for (const el of [ui.text, ui.data, ui.panel]) for (const c of el.children) fitRO.observe(c);
    // A slide that keeps its figure clear of the cards frames it again as the cards settle to their size (a chart arriving, a line wrapping).
    const again = () => { if (!ui) return; if (!shown) { clearT = setTimeout(again, 150); return; }   // (a slide still coming in: once it is in)
      if (cardSig() !== framedSig) reframe(400); };   // (only when the cards really changed: the camera framed them once; any slide, so a card that grew never covers its box)
    const soon = () => { clearTimeout(clearT); clearT = setTimeout(again, 120); };
    // (The words' glass pane and the figure's insets follow a card that grows after the layout, a chart arriving under the words.)
    clearRO ||= new ResizeObserver(() => { cancelFrame(paneRaf); paneRaf = nextFrame(() => ui && layout()); soon(); });
    clearRO.disconnect(); clearRO.observe(ui.data); clearRO.observe(ui.text);
    ui.data.ontransitionend = ui.text.ontransitionend = soon;   // (a card slides into place: its edge is where it ends, not where it was measured)
  };
  function layout() {
    if (!ui) return;
    // Under interface zoom the page is scaled by k: rects are screen px, inline sizes are the page's own (screen / k).
    // The --pz-* insets stay in screen px, the figure's own units (the stage view undoes the zoom).
    const p = phone(), wr = wrap.getBoundingClientRect(), W = wr.width, H = wr.height, k = wr.width / (wrap.clientWidth || wr.width) || 1;
    ui.root.classList.toggle('stack', p); ui.shade.classList.toggle('stack', p);
    const cardOn = TEXT_CARD && !p && !(W > H && H <= 500);   // (a phone held sideways keeps its panel too)
    ui.root.classList.toggle('pz-card', cardOn); ui.shade.classList.toggle('pz-card', cardOn);
    const off = (el) => el.hidden || (el === ui.data ? 'gone' in el.dataset : el.classList.contains('pz-hide'));   // (a card only easing out and back in for the next slide still counts, where it rests: the camera frames once)
    const r = (el) => (off(el) ? null : restBox(el));
    ui.text.style.removeProperty('--pz-tk'); ui.text.style.removeProperty('--pz-bk');
    fitCards(ui.text);
    let t = r(ui.text);
    const sl = ui.shade.offsetLeft * k, pad = cardOn && t ? t.left - wr.left - sl : 0, dd = ui.data, ts = ui.text.style, was = ts.top;
    // On a laptop or tablet the data card stacks under the words' card, at its width, a gap below it, when both fit above the
    // controls; otherwise (long words, a tall chart) it sits at the top right. A card in view that changes place fades out,
    // moves while unseen and fades back in.
    let below = false, top0 = 0, gap = 0, cw = 0, foot = H;
    if (cardOn && t && !off(dd)) {
      ts.top = ''; top0 = parseFloat(getComputedStyle(ui.text).top) * k;   // (the cards' top: the data card's at the right)
      gap = Math.max(sl, 28); cw = t.right - wr.left + pad - sl;
      const q = ui.bar.hidden || !ui.bar.offsetWidth ? null : ui.bar.getBoundingClientRect();
      foot = q && q.left - wr.left < sl + cw ? q.top - wr.top - gap : H - sl;
      const ch = colHeight(cw / k) * k, slack = dd.classList.contains('col') ? 8 : 0;
      below = top0 + t.height + 2 * pad + gap + ch <= foot + slack;
      // Too tall to stack: the words' card gives way first (its title, then its text, a step at a time) so the two still stack.
      for (const [tk, bk] of below ? [] : [[0.92, 1], [0.84, 1], [0.76, 1], [0.76, 0.94], [0.76, 0.88], [0.76, 0.82]]) {
        ui.text.style.setProperty('--pz-tk', tk); ui.text.style.setProperty('--pz-bk', bk);
        t = r(ui.text);
        if ((below = top0 + t.height + 2 * pad + gap + ch <= foot + slack)) break;
      }
      if (!below) { ui.text.style.removeProperty('--pz-tk'); ui.text.style.removeProperty('--pz-bk'); t = r(ui.text); }   // (a little slack once there: a number ticking never flips it)
    }
    const isCol = dd.classList.contains('col');
    if (below !== isCol) {
      if (colT) below = isCol;   // (a move under way: the card moves once it has faded out)
      else if (!dd.hidden && !reduce.matches && +getComputedStyle(dd).opacity > 0.05) {
        below = isCol;
        if (!dd.classList.contains('pz-hide')) {
          dd.classList.add('pz-hide'); dd.dataset.colswap = '';
          colT = setTimeout(() => { colT = 0; if (!ui) return; const mine = 'colswap' in ui.data.dataset; delete ui.data.dataset.colswap; layout(); if (mine) ui.data.classList.remove('pz-hide'); }, 340);
        }
      }
    }
    if (below !== isCol) { dd.style.transition = 'none'; dd.classList.toggle('col', below); }
    if (off(dd) || below) delete dd.dataset.safe; else dd.dataset.safe = p ? 'top' : 'right';
    const y = top0 + t?.height + 2 * pad + gap;
    dd.style.left = below ? `${(sl / k).toFixed(1)}px` : '';
    dd.style.width = below ? `${(cw / k).toFixed(1)}px` : '';
    dd.style.top = below ? `${(y / k).toFixed(1)}px` : '';
    dd.style.maxHeight = below ? `${((foot - y) / k).toFixed(1)}px` : '';
    // (A phone: the card above the words ends 8 px short of them, however much it holds: an opened instrument had grown over the words.)
    if (p && t) { const cs = getComputedStyle(dd), room = Math.floor((t.top - wr.top) / k - (parseFloat(cs.top) || 0) - 8); if (room > 0) dd.style.maxHeight = cs.maxHeight === 'none' ? `${room}px` : `min(${cs.maxHeight}, ${room}px)`; }
    if (below !== isCol) { void dd.offsetWidth; dd.style.transition = ''; }
    fitCards(ui.data, ui.panel);
    fitWatch();
    const dv = ui.data.hidden ? [0, 0] : dockVec();
    const d = below ? null : r(ui.data);
    // The words' card is only as tall as the words. With a data card beside or under it, its top is level with the data
    // card's place at the top right and the words start one padding below it; without one, the words stay centred and the card wraps them.
    const lvl = cardOn && t && (d || below) ? (below ? top0 : d.top - wr.top) + pad : null;
    ts.top = lvl != null ? `${(lvl / k).toFixed(1)}px` : ''; ts.bottom = ts.marginBlock = lvl != null ? 'auto' : '';
    if (lvl != null) ts.marginBlock = '0';
    ts.maxHeight = lvl != null ? `${((H - lvl - pad - 16) / k).toFixed(1)}px` : '';
    if (ts.top !== was && t) t = r(ui.text);
    // The words sit on a frosted glass pane: the figure shows through it blurred, behind a crisp edge with a soft
    // shadow. The figure frames itself just past that shadow, so nothing it frames is hidden.
    // (On a phone the words sit at the bottom, over the Back/Next bar, and the data card at the top: B is the height
    // from the words' top edge down to the bottom of the figure.)
    const L = t ? t.right - wr.left : 0, T = t ? t.bottom - wr.top : 0, B = t ? H - ui.text.offsetTop * k : 0;
    // (The words' card: as far past the words on the right as its left edge is before them.)
    const card = cardOn && t ? L + pad - sl : 0;
    ui.shade.style.width = !p && t ? `${(card || L + 36) / k}px` : '';
    ui.shade.style.height = p && t ? `${(B + 26) / k}px` : cardOn && t ? `${(t.height + 2 * pad) / k}px` : '';
    ui.shade.style.top = !p && cardOn && t ? `${(t.top - wr.top - pad) / k}px` : '';
    ui.shade.style.opacity = t ? '1' : '0';
    ui.safe.hidden = !t;
    ui.safe.dataset.safe = p ? 'bottom' : 'left';
    frameL = !p && t ? (card ? sl + card + 24 : L + 48) : 0;
    ui.safe.style.width = p ? '' : `${frameL / k}px`;
    ui.safe.style.height = p ? `${(B + 34) / k}px` : '';
    const set = (k, v) => app.style.setProperty(k, `${Math.max(0, Math.round(v))}px`);
    set('--pz-l', frameL);
    set('--pz-r', !p && d ? W - (ui.data.offsetLeft + dock.to * dv[0]) * k + 8 : 0);   // (where the card comes to rest: past its entry shift, at its dock)
    set('--pz-t', p && d ? (ui.data.offsetTop + ui.data.offsetHeight + dv[1] * dock.to) * k + 4 : 0);   // (offsets: a card coming in is still shifted by its entry transform)
    set('--pz-b', p && t ? B + 34 : 0);
    if (!dock.drag) dockPaint();
    placeBar();
    dispatchEvent(new Event('pps:occ'));
  }
  // The free area: the open rectangles of the figure the words, the data card (where it comes to rest) and the controls leave,
  // in wrap px. The camera centres a slide's box in whichever of them shows it largest (stage boxVT).
  let frameL = 0, colT = 0;
  // The data card's height at width w (page px) under the words: as it would stand there, at full size (unfitted).
  function colHeight(w) {
    const d = ui.data, ds = d.style, sv = [d.className, ds.width, ds.maxHeight, ds.getPropertyValue('--pz-fit')];
    d.classList.add('col'); ds.width = `${w}px`; ds.maxHeight = 'none'; ds.removeProperty('--pz-fit');
    const hh = d.offsetHeight;
    d.className = sv[0]; ds.width = sv[1]; ds.maxHeight = sv[2]; if (sv[3]) ds.setProperty('--pz-fit', sv[3]);
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
    framedSig = cardSig();
    const s = slides[shown.i], cam = s.visual ? s.cam : asking(s, shown.rev) ? 'fit' : s.cam || 'fit';
    if (cath.on && cath.cam) stage.cathFocus(cath.cam, ms, { both: true });
    else if (cam && !LOBULE_CAM.test(cam) && !store.get().lobule) { if (cam === 'fit') stage.fitSlow(ms); else stage.frameBox(camBox(cam, s), ms, s.kMax || 3.2, !!s.clear); }
  }
  const onResize = () => {
    if (!ui) return;
    if (ui.data.hasAttribute('data-sin-tiles')) ui.data.classList.toggle('under', !shortSide.matches && phone());   // (turned on or off its side)
    layout(); setLabels();
    if (shown) reframe(400);
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
  addEventListener('pps:labelscale', () => { if (deck && ui && !labelling) setLabels(); });

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
      const tail = last?.matches('.pz-causes') ? [...last.querySelectorAll('li')].filter(shown).at(-1) : last;
      if (tail?.matches('p, h1, li, .pz-stk')) end = tail; else box = last || null;
      const wr = restRect(ui.root), k = wr.width / (ui.root.clientWidth || wr.width) || 1, reach = restRect(text).top + text.offsetHeight * k - ui.bar.getBoundingClientRect().top;
      text.style.setProperty('--pz-reach', `${Math.max(0, Math.ceil(reach / k) + 3)}px`);
    }
    if (gap && gap.parentElement !== end) gap.remove();
    if (end && !end.querySelector(':scope > .pz-pillgap')) end.append(h('span', { class: 'pz-pillgap', 'aria-hidden': 'true' }));
    if (was && was !== box) was.classList.remove('pz-pillclr');
    box?.classList.add('pz-pillclr');
  }
  function paintChrome() {
    if (!ui) return;
    const n = slides.length, i = want;
    ui.prog.style.setProperty('--p', String((i + 1) / n));
    const ph = phone(), skip = lapseOn && lapseLeft > 0, last = i === n - 1 && !asking(slides[i], wantRev) && !skip;
    // The count opens the slide list (G).
    const countBtn = h('button', { class: 'pzb-n', 'aria-label': `Slide ${i + 1} of ${n}: list the slides`, title: 'Slide list (G)', 'aria-expanded': String(!ui.jump.hidden), onclick: () => toggleJump() }, `${i + 1} / ${n}`);
    ui.bar.classList.toggle('phone', ph); ui.bar.classList.toggle('pzb-pill', !ph);
    if (ph) {
      // A phone's pill: the count (it opens the slide list), settings, exit. Slides change by swiping.
      ui.bar.classList.remove('idle');
      ui.bar.replaceChildren(countBtn, gear(),
        h('button', { class: 'ib', 'aria-label': 'Exit the presentation', title: 'Exit', onclick: stop }, icon('close')));
      placeBar();
      return;
    }
    // A wide screen's pill, as on a phone at the lower right (Mohammad): back, the count (it opens the slide list), next,
    // settings, exit. (No quiz or ask-the-room buttons: he asks the room by voice; full screen is in Settings and on F.)
    ui.bar.replaceChildren(
      h('button', { class: 'ib', 'aria-label': 'Previous slide', title: 'Previous (←)', disabled: i === 0, onclick: prev }, icon('chev-left')),
      countBtn,
      h('button', { class: `ib pzb-next${skip ? ' skipping' : ''}`, 'aria-label': skip ? 'Run the time-lapse to its end' : 'Next slide', title: skip ? 'Skip to the end of the time-lapse (→)' : 'Next (→)', disabled: last, onclick: next }, icon('chev-right')),
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
  const toggleProj = () => { setContrast(); toast(hiCon ? 'High contrast on.' : 'High contrast off.'); };
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
    sw = deck && e.touches.length === 1 && !ownsSideways(e.target, { stop: wrap, cardSideways: ui && !ui.data.hidden && !phone() })
      ? { x: t.clientX, y: t.clientY, t: performance.now() } : null;
  }, { passive: true, capture: true });
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
    else if (lk === 'g') toggleJump(true);
    else if (lk === 'p') toggleProj();
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
  function foldTouch(el, btn, setFold, part) {
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
        g.on = true; g.p.style.transition = 'none';
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
      const show = Math.abs(v) > 0.4 ? v > 0 : gg.u > 0.5;
      // (From where the finger left it to the class's own state: the part's transition eases the rest.)
      gg.p.getBoundingClientRect(); gg.p.style.transition = '';
      gg.p.style.maxHeight = ''; gg.p.style.opacity = '';
      const lead = el.classList.contains('tool-lead');
      if ((show !== lead) !== gg.open) setFold(show !== lead);
    };
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
  }

  // ── Start and stop ──
  function build() {
    const ladder = bigLadder(), tiles = bigTiles();
    const text = h('section', { class: 'pz-text stage-blocker', 'aria-live': 'polite' });
    const dhT = h('span', {}, 'Pressure, portal vein to heart'), dhL = h('span', { class: 'pz-lg' }, h('i', { class: 'now' }), 'This patient', h('i', { class: 'base' }), 'Healthy');
    const tools = createTools({ host, stage });
    // On a phone an instrument above tiles folds away (the tiles keep the reading), so the figure is not a strip between
    // two cards; the button opens it, and it stays open for the rest of the talk.
    const setFold = (open) => {
      data.classList.toggle('tool-open', open); fold.setAttribute('aria-expanded', String(open)); fold.textContent = open ? 'Hide' : 'Show';
      setTimeout(() => { fitDone.delete(data); onResize(); }, reduce.matches ? 0 : 400);
    };
    const fold = h('button', { class: 'pz-fold', type: 'button', 'aria-expanded': 'false', onclick: () => setFold(!data.classList.contains('tool-open')) }, 'Show');
    const data = h('section', { class: 'pz-data stage-blocker pz-hide', 'data-safe': 'right', 'data-safe-rest': '', 'data-gone': '', hidden: true, 'aria-label': 'The numbers' },
      h('div', { class: 'pz-dh' }, dhT, dhL, fold), tools.el, ladder.el, ladder.strip, tiles.el, h('span', { class: 'pz-grip', 'aria-hidden': 'true' }));
    foldTouch(data, fold, setFold, () => (data.classList.contains('tool-lead') ? tiles.el : tools.el));
    dockTouch(data);
    // A part that has finished folding or unfolding: fit the card again from full size (a fit taken mid-fold kept the tiles small).
    data.addEventListener('transitionend', (e) => { if (e.propertyName === 'max-height' && e.target.parentElement === data) { fitDone.delete(data); onResize(); } });
    const veil = h('div', { class: 'pz-veil' }), panel = h('section', { class: 'pz-panel stage-blocker', hidden: true, 'aria-live': 'polite' });
    const prog = h('div', { class: 'pz-prog', 'aria-hidden': 'true' }, h('i'));
    const bar = h('div', { class: 'pz-bar stage-blocker', role: 'toolbar', 'aria-label': 'Presenter' });
    bar.addEventListener('focusin', wake);
    const blackEl = h('div', { class: 'pz-black', 'aria-hidden': 'true', onclick: () => toggleBlack(false) });
    // The shade sits under the corner credit (both at figure level, the credit later), the slide over both.
    const shade = h('div', { class: 'pz-shade' });
    // What the figure frames itself clear of: the words, the glass and its shadow.
    const safe = h('div', { class: 'pz-safe', 'aria-hidden': 'true', hidden: true });
    const load = h('div', { class: 'pz-load', 'aria-hidden': 'true' }, h('i'));
    const jump = h('nav', { class: 'pz-jump stage-blocker', hidden: true, 'aria-label': 'Slides' });
    const root = h('div', { class: 'pz' }, safe, veil, load, text, data, panel, prog, bar, jump, blackEl);
    wrap.insertBefore(shade, wrap.querySelector('.stage-credit'));
    // The teaching card's glass is the card itself: it leaves and arrives with the words, never resizing in view.
    new MutationObserver(() => shade.classList.toggle('pz-leave', text.classList.contains('pz-leave'))).observe(text, { attributes: true, attributeFilter: ['class'] });
    wrap.append(root);
    return { root, shade, safe, load, text, data, dhT, dhL, ladder, tiles, tools, veil, panel, prog, bar, black: blackEl, jump };
  }
  // The start's cover (see start). While it is up (booting) the camera cuts instead of gliding.
  let cover = null, booting = false, coverT = 0;
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
    const want0 = Math.max(0, (parseInt(at, 10) || 0));
    const d = typeof id === 'object' ? id : all().find((x) => x.id === (ALIAS[id] || id));
    if (!d?.slides?.length) { toast('That presentation could not be found.'); return; }
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
    deck = d; slides = d.mine ? d.slides : withOverview(d).slides; shown = null; shownState = -1; quiz = false; black = false;
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
    fitRO?.disconnect(); clearRO?.disconnect(); clearTimeout(clearT); cancelFrame(fitRaf);
    store.set({ presenting: false, presentLabels: null, presentTerms: null, presentNames: false, focus: null, lobuleCallout: null, presentFp: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null); delete app.dataset.lit;
    hushed = false; lastCam = null; clearTimeout(hushInT); app.classList.remove('pz-hush', 'pz-hush-in');
    clearTimeout(idleT); clearTimeout(dock.fit); cancelFrame(dock.raf); dock.lvl = 0; dock.to = 0; dock.drag = false;
    pillW = 0; ui?.tools.dispose(); ui?.root.remove(); ui?.shade.remove(); ui = null;
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
  const copy = (url, msg) => navigator.clipboard?.writeText(url).then(() => toast(msg), () => prompt('Copy this link', url)) ?? prompt('Copy this link', url);
  const shareScript = (s) => copy(`${location.origin}${location.pathname}#script=${enc(s)}`, 'Link copied: opening it adds the script to the recipient’s library.');
  const shareDeck = (d) => copy(`${location.origin}${location.pathname}?script=${d.id}`, 'Link copied: it opens this presentation at its first slide.');
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
  const library = () => ({ decks: DECKS, topics: TOPICS, levels: LEVELS, mine: readMine(), start, shareDeck, notes: openHandout,
    scriptNotes: (s) => openHandout(fromScript(s)), newScript, importFile, addStep, shareScript, exportScript, remove, current: () => deck?.id ?? null });

  return { start, stop, library, readLink, active: () => !!deck,
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
