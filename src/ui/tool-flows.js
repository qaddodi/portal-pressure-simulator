// Where the portal blood goes (deck visuals V14, package B): tool { kind: 'flows' } draws one bar across the whole card that is all
// the portal blood: the liver's segment first, then one segment per route the bypassing blood takes (the esophageal varices, a
// gastrorenal or splenorenal shunt, the paraumbilical vein, a stent…) in that route's colour, largest first. No colour key
// (Mohammad, 19 Oct). The bar stands centred under the card's title, with nothing at its left and nothing hanging from it (Mohammad,
// 25 Oct, on an iPhone: the Healthy and Now rows' gutter and the names hanging on leaders left it off centre; "the data card should
// be fixed similar to the other one (all of those kinds) centered"). The healthy split, all of it to the liver, is a dashed bracket
// over the whole bar with "Healthy: liver 100%" centred above it, so the liver's segment compares with the whole it would fill (the
// 19 Oct "compare those bars with normal" kept; the second bar only repeated that one number). A segment wide enough carries its
// name and percent in text with a halo, so they read on every colour; one too narrow for its name carries its percent alone; one
// too narrow for that is named in a pill under the bar, in its colour, the pills in the bar's order in centred rows. Shares, places
// and names ease as they move; a name that changes wording fades out and in.
// tool: { kind: 'flows', of: 'inflow' } splits the liver's own inflow into portal and arterial blood instead, as one bar across
// the card's width in the same way, and the healthy split as a dashed line over it with "Healthy portal 73%" above, as the pressure
// ladder marks its Healthy line (Mohammad, 25 Oct: "the blood into the liver card ... so off center it's bad", his pick of the three
// drawn in review/liver-inflow-card-ideas).
// The parts are the slide's fingerprint's flows (at.Q), counted as the shunt fraction is (engine/metrics.js), so the liver's
// part is always 100 less the slide's Shunted tile (table-marks.js portalSplit). The cavernoma returns blood to the liver,
// so it counts as liver.

import { frame, cancelFrame } from './frame.js';
import { restPass, cancelRest } from './rest-pass.js';
import { EDGES, PORTOSYSTEMIC_EDGES, SPLANCHNIC_ARTERIES } from '../engine/topology.js';
import { portalSplit } from './table-marks.js';
import { measure } from './glyph-measure.js';
import { createSvgGL, svgModel, setGeo, setPts, setWords } from './svg-gl.js';
import { fittedType } from './chart-ctx.js';
import { pctWords } from './num-words.js';
import { reduceMotionMQ } from './motion.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const STENTS = new Set(['TIPS', 'DIPS']);
// Where the shunted blood goes: part id → [name, colour token, vessel ids]. On the bar largest first, ties in this order.
export const ROUTES = [
  ['var', 'Varices', '--tr-var', ['C1b']],
  ['grs', 'Gastrorenal', '--s7', ['C5']],
  ['srs', 'Splenorenal', '--s5', ['C6']],
  ['pum', 'Paraumbilical', '--s4', ['C3']],
  ['rec', 'Rectal', '--tr-wedge', ['C4']],
  ['ret', 'Retroperitoneal', '--tr-cav', ['C7']],
  ['tips', 'TIPS', '--s1', ['TIPS']],
  ['dips', 'DIPS', '--s1', ['DIPS']],
  ['surg', 'Surgical shunt', '--s6', ['S_PC', 'S_DSR', 'S_MC']],
];
export const LIVER = ['liver', 'Liver', '--flow-normal'];
export const OTHER = ['other', 'Other', '--text-3'];
export const INFLOW = [['portal', 'Portal vein', '--vein-portal'], ['artery', 'Hepatic artery', '--artery']];
export const MAX_ROUTES = 4;   // (at most four routes by name, the rest as Other: six parts at most with the liver)

/** Whole percents that keep their sum (largest remainder): shares (≥ 0) → integers adding up to total. */
export function wholeShares(shares, total) {
  const sum = shares.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || total <= 0) return shares.map(() => 0);
  const raw = shares.map((s) => (s / sum) * total), out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return out;
}

/** The shunted portal blood by route (L/min ×0.06 not applied: the model's own units), from a fingerprint's flows, counted
 *  as computeMetrics counts its shunt fraction: each collateral and surgical shunt's forward flow, and a stent's only as far
 *  as it takes portal-trunk blood that no longer reaches the sinusoids. params: for any custom shunts the learner made. */
export function routeFlows(Q, params = null) {
  const q = (id) => Q[EI[id]] || 0;
  const by = Object.fromEntries(ROUTES.map(([k]) => [k, 0]));
  const of = Object.fromEntries(ROUTES.flatMap(([k, , , ids]) => ids.map((id) => [id, k])));
  let stentQ = 0;
  const stent = {};
  for (const id of PORTOSYSTEMIC_EDGES) {
    const v = Math.max(0, q(id));
    if (STENTS.has(id)) { stentQ += v; stent[id] = v; } else by[of[id]] += v;
  }
  const portalIn = Math.max(0, q('PRE_R')) + Math.max(0, q('PRE_L'));
  const stented = Math.min(stentQ, Math.max(0, Math.max(0, q('PV_TRUNK')) - portalIn - Math.max(0, q('C3'))));
  for (const id of STENTS) if (stentQ > 0) by[of[id]] += stented * (stent[id] || 0) / stentQ;
  let custom = 0;
  for (const e of EDGES) if (e.shunt === 'custom' && params?.customShunts?.[e.id]) custom += Math.max(0, q(e.id));
  const inflow = SPLANCHNIC_ARTERIES.reduce((s, id) => s + q(id), 0) + Math.max(0, q('AP_R')) + Math.max(0, q('AP_L'));
  return { by, custom, inflow };
}

// A route the bar names already keeps its name against one that is only a little larger (KEEP_NAMED ×): two routes of about
// the same flow on either side of the fourth place never trade places with Other as the model wobbles.
export const KEEP_NAMED = 1.25;
/** The bar's parts for a fingerprint: [{ id, name, tone, pct }] in whole percents adding up to 100, the liver's part
 *  100 less the Shunted tile; at most MAX_ROUTES routes by name, the rest (and any custom shunt) as Other; a part that
 *  rounds to 0 is left out. of: 'inflow' → the liver's inflow, portal and arterial. null without the flows. keep: the
 *  route ids the bar names now (a Set), which hold their place in the four by KEEP_NAMED. */
export function flowParts(fp, of = 'portal', params = null, keep = null) {
  const Q = fp?.at?.Q;
  if (!Q) return null;
  if (of === 'inflow') {
    const pv = Math.max(0, Q[EI.PRE_R]) + Math.max(0, Q[EI.PRE_L]), ha = Math.max(0, Q[EI.A_HR]) + Math.max(0, Q[EI.A_HL]);
    const pct = wholeShares([pv, ha], 100);
    return INFLOW.map(([id, name, tone], i) => ({ id, name, tone, pct: pct[i] })).filter((p) => p.pct > 0);
  }
  const { liver, shunt } = portalSplit(fp.shunt);
  const { by, custom } = routeFlows(Q, params);
  const rank = (k) => by[k] * (keep?.has(k) ? KEEP_NAMED : 1);
  const ranked = ROUTES.filter(([k]) => by[k] > 0).sort((a, b) => rank(b[0]) - rank(a[0]));
  const named = ranked.slice(0, MAX_ROUTES), rest = ranked.slice(MAX_ROUTES).reduce((s, [k]) => s + by[k], 0) + custom;
  const order = ROUTES.filter((r) => named.includes(r));   // (named in one order; barOrder lays them out largest first)
  const pct = wholeShares([...order.map(([k]) => by[k]), rest], shunt);
  const parts = [{ id: LIVER[0], name: LIVER[1], tone: LIVER[2], pct: liver }, ...order.map(([id, name, tone], i) => ({ id, name, tone, pct: pct[i] }))];
  if (pct.at(-1) > 0) parts.push({ id: OTHER[0], name: OTHER[1], tone: OTHER[2], pct: pct.at(-1) });
  // (A shunt fraction with no forward route left, a rounding the routes cannot carry, still sums: it goes to Other.)
  const sum = parts.reduce((s, p) => s + p.pct, 0);
  if (sum < 100) { const o = parts.find((p) => p.id === 'other'); if (o) o.pct += 100 - sum; else parts.push({ id: OTHER[0], name: OTHER[1], tone: OTHER[2], pct: 100 - sum }); }
  return parts.filter((p) => p.pct > 0);
}

/** The bar's order for parts (flowParts): the liver first, then the routes largest first and Other last; for the inflow the
 *  portal vein, then the hepatic artery. */
export function barOrder(parts, of = 'portal') {
  if (of === 'inflow') return INFLOW.map(([id]) => parts.find((p) => p.id === id)).filter(Boolean);
  const at = (id) => ROUTES.findIndex(([k]) => k === id);
  const routes = parts.filter((p) => p.id !== 'liver' && p.id !== 'other').sort((a, b) => b.pct - a.pct || at(a.id) - at(b.id));
  return [...parts.filter((p) => p.id === 'liver'), ...routes, ...parts.filter((p) => p.id === 'other')];
}

/** What the card shows for parts: the one bar's segments in order, and the share bypassing the liver ([name, pct], said in
 *  the card's spoken summary; none for the inflow). */
export function flowView(parts, of = 'portal') {
  const bar = barOrder(parts, of);
  if (of === 'inflow') return { bar, bracket: null };
  return { bar, bracket: ['Bypassing the liver', 100 - (parts.find((p) => p.id === 'liver')?.pct ?? 0)] };
}

// The card holds still while the model wobbles (Mohammad, 6 Nov 2026: "this card is glitching because lots of its content is changing"): a
// live model's readings come every 150 ms for up to a minute after a slide lands or a button is pressed, and each one that moved a share by
// a whole percent laid the bar out again (a 14↔15 flip, a name on its segment one reading and in a pill under the bar the next). A new split
// that moves no part by more than HOLD_PP percent is held back: the bar keeps what it shows, and takes the newest split once the readings
// have rested HOLD_MS, so it always lands on the slide's own numbers. A larger move is taken at once.
export const HOLD_PP = 1, HOLD_MS = 600;
/** Whether split b moves no part of split a (by id; a part missing counts 0) by more than pp whole percents. */
export function smallMove(a, b, pp = HOLD_PP) {
  if (!a || !b) return false;
  const m = new Map();
  for (const p of a) m.set(p.id, p.pct);
  for (const p of b) { if (Math.abs(p.pct - (m.get(p.id) || 0)) > pp) return false; m.delete(p.id); }
  for (const v of m.values()) if (v > pp) return false;
  return true;
}
// A part's words keep their place on the bar until it no longer holds them by the label rule; they move onto the bar (out of a pill, or
// from the percent alone to the name too) only with TIER_BAND × f to spare, so a segment at the edge of fitting never swaps them each reading.
export const TIER_BAND = 0.35;
// The label rule: a name never comes nearer than this to another name, a line, a segment's edge or the bar (px).
export const LABEL_GAP = 4;
/** Whether two splits read the same: the same parts with the same whole percents, in any order (what the card shows, so a
 *  0.1% wobble in the model never counts). */
export const sameShares = (a, b) => {
  const key = (ps) => (ps || []).filter((p) => p.pct > 0).map((p) => `${p.id}:${p.pct}`).sort().join(',');
  return !!a && !!b && key(a) === key(b);
};
// ── The liver's inflow: one bar across the card ─────────────────────────────────────────────────────────────────────────
// The portal vein's and the hepatic artery's shares as one bar the card's full width, so it stands centred with the card's title
// and nothing hangs under it. The healthy split is not a second bar: one dashed line over this one where the portal blood ends in
// a healthy liver, "Healthy portal 73%" above it (the pressure ladder's Healthy line, no key). Each segment's name and percent sit
// on it, clear of the line; a name too wide takes its short form, then the percent alone, then, for a segment too narrow even for
// that, one line above the bar over it on a short leader.
export const INFLOW_SHORT = { portal: 'Portal', artery: 'Artery' };
/** The inflow card's measures for font size f, from the top of its drawing: the words over the line (base is their baseline),
 *  the bar (top, bottom), the line's overshoot under it, the whole height (h), and the bar's name and percent baselines from
 *  its top (n1, n2) or a percent alone (mid). mc: how near a name comes to the line. */
export function inflowGeo(f) {
  const g = Math.max(LABEL_GAP, 0.34 * f), barH = 2.7 * f, top = 1.75 * f;
  return { f, g, barH, mc: Math.max(6, 0.5 * f), base: 1.05 * f, top, bottom: top + barH, h: top + barH + 0.5 * f, n1: 1.15 * f, n2: 2.27 * f, mid: barH / 2 + 0.36 * f };
}
/** The segments' spans on a bar w wide: [{ id, pct, a, b }] in the bar's order (barOrder). */
export function inflowSpans(bar, w) {
  let acc = 0;
  return bar.map((p) => { const a = (acc / 100) * w; acc += p.pct; return { id: p.id, pct: p.pct, a, b: (acc / 100) * w }; });
}
/** The Healthy line for the healthy split (hParts): where its portal blood ends on a bar w wide, its words and the box they take
 *  (L…R, inside 0…w, centred on the line where they can be). null without a healthy split, or when its portal share is none or all. */
export function inflowMarker(hParts, w, f, measure) {
  const hp = hParts?.find((p) => p.id === 'portal')?.pct;
  if (!(hp > 0 && hp < 100)) return null;
  const text = `Healthy portal ${hp}%`, tw = measure(text, f, 500), x = (hp / 100) * w;
  const L = Math.min(Math.max(x - tw / 2, 0), Math.max(0, w - tw));
  return { x, text, L, R: L + tw, hp };
}
/** Where each segment's words go. tier 0: its name and percent on the segment; 1: the short name and percent; 2: the percent alone;
 *  3: one line above the bar (a leader at lead), its box centred on cx; 4: nothing (no clear place). On the segment (tiers 0 to 2)
 *  the words sit g inside its edges and mc from the Healthy line, as near the segment's middle as that allows. → [{ id, tier, cx,
 *  lead, text, tw }] in the spans' order. */
export function inflowLabels(spans, w, geo, measure, mark = null, prev = null) {
  const { f, g, mc } = geo, E = 1e-6;
  return spans.map((s) => {
    const full = INFLOW.find(([k]) => k === s.id)[1], short = INFLOW_SHORT[s.id], v = `${s.pct}%`, vw = measure(v, f, 700), mid = (s.a + s.b) / 2;
    const wid = [Math.max(measure(full, f, 500), vw), Math.max(measure(short, f, 500), vw), vw];
    const free = mark && mark.x > s.a + 0.5 && mark.x < s.b - 0.5 ? [[s.a, mark.x - mc], [mark.x + mc, s.b]] : [[s.a, s.b]];
    const was = prev?.[s.id];
    for (let tier = 0; tier < 3; tier++) {
      // (prev: the tiers shown now; a wording nearer the bar than the one shown needs TIER_BAND to spare)
      const band = was != null && tier < was ? TIER_BAND * f : 0;
      const fit = free.filter(([a, b]) => b - a - 2 * g - band >= wid[tier] - E)
        .map(([a, b]) => ({ cx: Math.min(Math.max(mid, a + g + wid[tier] / 2), b - g - wid[tier] / 2) }));
      if (fit.length) return { id: s.id, tier, cx: fit.sort((p, q) => Math.abs(p.cx - mid) - Math.abs(q.cx - mid))[0].cx };
    }
    // (Too narrow for its percent: one line over the segment above the bar, clear of the Healthy words and the line under them.)
    const text = `${short} ${v}`, tw = measure(text, f, 600), box = mark ? [mark.L - g, mark.R + g] : null;
    const spots = [Math.min(Math.max(mid - tw / 2, 0), Math.max(0, w - tw))];
    if (box) spots.push(box[0] - tw, box[1]);
    const L = spots.find((l) => l >= -E && l + tw <= w + E && l <= mid + E && mid <= l + tw + E && (!box || l + tw <= box[0] + E || l >= box[1] - E));
    return L == null ? { id: s.id, tier: 4, cx: mid } : { id: s.id, tier: 3, cx: L + tw / 2, lead: mid, text, tw };
  });
}


// ── Where the portal blood goes: one bar across the card ───────────────────────────────────────────────────────────────
// The liver's share and each bypass route's as one bar the card's full width, centred with the card's title; no second bar and no
// gutter. The healthy split (all of it to the liver) is a dashed bracket over the whole bar with "Healthy: liver 100%" centred above
// it. A segment wide enough carries its name and percent, else its percent alone; one too narrow for that is named in a pill under
// the bar, in the segment's colour, the pills in the bar's order in centred rows (never on a leader, never off to one side). If
// the rows the card holds are not enough (a narrow card, a large text size) the smallest routes join Other until they are.
/** The card's measures for font size f, from the top of its drawing: the words over the bracket (base is their baseline), the
 *  bracket (brY, its ticks brTick long), the bar (barT, barB), the pills' first row (pillsT) with their height ph, the gap pg
 *  between rows and gx between pills, a pill's padding px, and the bar's two lines (n1, n2) or a percent alone (mid). */
export function routeGeo(f) {
  const g = Math.max(LABEL_GAP, 0.34 * f), barH = 2.7 * f, barT = 2.1 * f, barB = barT + barH;
  return { f, g, barH, base: 1.05 * f, brY: 1.45 * f, brTick: 0.4 * f, barT, barB, pillsT: barB + 0.65 * f, ph: 1.6 * f, pg: 0.4 * f, gx: Math.max(g, 0.5 * f), px: 0.6 * f,
    n1: 1.15 * f, n2: 2.27 * f, mid: barH / 2 + 0.36 * f };
}
/** The drawing's height with rows of pills (none: the bar alone). */
export const routeHeight = (rows, geo) => (rows ? geo.pillsT + rows * geo.ph + (rows - 1) * geo.pg : geo.barB);
/** How many rows of pills fit in a card hh tall (one at least). */
export const routeRows = (hh, geo) => Math.max(1, Math.floor((hh - geo.pillsT + geo.pg) / (geo.ph + geo.pg) + 1e-6));
/** The pills for items [{ id, text }] in order, in rows as wide as the card w allows, each row centred: [{ id, cx, w, row }] and the rows. */
export function routePills(items, w, geo, measure) {
  const pills = [];
  let row = 0, cur = [];
  const flush = () => {
    let L = (w - (cur.reduce((s, p) => s + p.w, 0) + (cur.length - 1) * geo.gx)) / 2;
    for (const p of cur) { pills.push({ id: p.id, cx: L + p.w / 2, w: p.w, row }); L += p.w + geo.gx; }
    cur = [];
  };
  for (const it of items) {
    const pw = Math.min(w, measure(it.text, geo.f, 700) + 2 * geo.px);
    if (cur.length && cur.reduce((s, p) => s + p.w, 0) + cur.length * geo.gx + pw > w + 1e-6) { flush(); row++; }
    cur.push({ id: it.id, w: pw });
  }
  if (cur.length) flush();
  return { pills, rows: items.length ? row + 1 : 0 };
}
/** The Healthy bracket for the healthy split (hParts): over the share its liver takes of the bar w wide, its words (L…R, inside
 *  0…w) centred over it. null without a healthy split. */
export function routeMarker(hParts, w, f, measure) {
  const hl = hParts?.find((p) => p.id === 'liver')?.pct;
  if (!(hl > 0)) return null;
  const text = `Healthy: liver ${hl}%`, tw = measure(text, f, 500), x1 = (hl / 100) * w, L = Math.min(Math.max(x1 / 2 - tw / 2, 0), Math.max(0, w - tw));
  return { x0: 0, x1, text, L, R: L + tw, hl };
}
/** The whole card's layout for parts at width w, height hh, font size f: the bar's segments [{ id, name, pct, a, b }] in order,
 *  each one's tier (0: name and percent on it, 2: its percent alone, 3: a pill under the bar), the pills' places, the rows they take
 *  and whether the card holds them (ok), the Healthy bracket, and the top offset that centres the drawing in the card. measure(text,
 *  f, weight) → px. parts is what the bar then shows (smaller routes joined to Other where the rows were not enough). */
export function routeLayout(parts, w, hh, f, measure, hParts = null, prev = null) {
  let use = parts, lay = routeOnce(use, w, hh, f, measure, hParts, prev);
  while (!lay.ok) {
    const routes = barOrder(use).filter((p) => p.id !== 'liver' && p.id !== 'other');
    if (routes.length < 2) break;
    const small = routes.at(-1), o = use.find((p) => p.id === 'other');
    use = [...use.filter((p) => p !== small && p !== o), { id: OTHER[0], name: OTHER[1], tone: OTHER[2], pct: (o?.pct || 0) + small.pct }];
    lay = routeOnce(use, w, hh, f, measure, hParts, prev);
  }
  return { ...lay, parts: use };
}
// (prev: { id: tier } the bar shows now, or null for a fresh layout. A wording nearer the bar than the one shown needs TIER_BAND × f to spare.)
function routeOnce(parts, w, hh, f, measure, hParts, prev = null) {
  const geo = routeGeo(f), g = geo.g;
  let acc = 0;
  const spans = barOrder(parts).map((p) => { const a = (acc / 100) * w; acc += p.pct; return { id: p.id, name: p.name, pct: p.pct, a, b: (acc / 100) * w }; });
  const tiers = spans.map((s) => {
    const room = s.b - s.a - 2 * g, pw = measure(`${s.pct}%`, f, 700), was = prev?.[s.id], band = (t) => (was != null && t < was ? TIER_BAND * f : 0);
    return Math.max(measure(s.name, f, 500), pw) <= room - band(0) ? 0 : pw <= room - band(2) ? 2 : 3;
  });
  // (A segment that carries its percent alone is named in a pill under the bar too, its name only: a bare "14%" on a green segment
  // left the reader to guess the route, Circuit slide 7.)
  const { pills, rows } = routePills(spans.flatMap((s, i) => (tiers[i] === 3 ? [{ id: s.id, text: `${s.name} ${s.pct}%` }] : tiers[i] === 2 ? [{ id: s.id, text: s.name }] : [])), w, geo, measure);
  return { geo, spans, tiers, pills, rows, ok: rows <= routeRows(hh, geo), mark: routeMarker(hParts, w, f, measure), top: Math.max(0, (hh - routeHeight(rows, geo)) / 2) };
}

// (2 Nov 2026: the bar is a model drawn on the GPU, svg-gl.js: the same tree, of plain elements, never painted by the browser.)
// The model is built once for a card's kind and size (build, between frames) with a piece for everything the bar can show: a segment, a pill
// of each wording and the words on the bar for each part, and the Healthy mark. A frame only writes numbers into those pieces (setGeo, setWords,
// setPts) and asks the picture to draw: no tree, string or object is made in it. A piece is shown by its strength: 0 is not drawn.
const sv = svgModel;
// (a word's width as Inter sets it, from the GPU atlas's own metrics: no canvas)
const textW = (t, f, wt = 600) => measure(t, `${wt} ${f}px Inter`);
// Every part the bar can show.
const ALL = [LIVER, ...ROUTES, OTHER];
const PORTAL_IDS = ALL.map(([id]) => id), INFLOW_IDS = INFLOW.map(([id]) => id);
const NAME_OF = Object.fromEntries(ALL.concat(INFLOW).map(([id, name]) => [id, name]));
const TONE_OF = Object.fromEntries(ALL.concat(INFLOW).map(([id, , tone]) => [id, tone]));
const MIXK = ['x', 'pct', 'lx', 'row'];
// (The inflow's leader line's words for each whole percent ('Portal 20%'), made once at load.)
const LEAD_WORDS = {};
for (const [id] of INFLOW) { LEAD_WORDS[id] = []; for (let p = 0; p <= 100; p++) LEAD_WORDS[id].push(`${INFLOW_SHORT[id]} ${p}%`); }
let uid = 0;

export function createFlowsTool() {
  const el = document.createElement('div');
  el.className = 'pz-flows';
  const gl = createSvgGL(el, { host: 'flows' });
  const reduceMQ = reduceMotionMQ;
  const clip = `pfl-clip-${++uid}`;
  let of = 'portal', params = null, goal = null, hGoal = null, ctx0 = null, raf = 0, size = '', memo = null, wait = 0;
  // (held: a split that moved too little to show yet, taken once the readings rest, HOLD_MS; tiersNow: each part's wording on the bar now)
  let held = null, holdT = 0, tiersNow = null;
  // What a frame eases and draws, kept (made when the model is built): each part's numbers (x, pct, op, lx, row, hop) in shownP, the bar's
  // (top, hop) in shownM, each part's wording and its strength while it swaps for another in tierP; hasShown: they hold a state.
  let ids = PORTAL_IDS, shownP = {}, shownM = { top: 0, hop: 0 }, tierP = {}, hasShown = false;
  let model = null, modelKey = '';
  // The card's size, zoom and lettering, read between frames (a new slide, a new size: rest-pass.js), never in a glide's frame.
  let box = null, measuring = 0;
  const measureBox = () => {
    const w = el.clientWidth;
    // (The box's own type size from the chart's looks table: the card's sizes handed over, never read off the page.)
    const f = fittedType(el, gl, 12);
    box = [Math.max(160, w || 420), Math.max(6 * f, el.clientHeight || 160), f];
  };
  const sizeNow = () => box || [420, 160, 12];
  const order = () => (of === 'inflow' ? INFLOW_IDS : PORTAL_IDS);
  const resetShown = () => {
    hasShown = false; ids = order(); shownP = {}; tierP = {};
    for (const id of ids) { shownP[id] = { x: 0, pct: 0, lx: 0, row: 0, op: 0, hop: 0 }; tierP[id] = { init: false, drawn: 4, o: 1 }; }
    shownM.top = 0; shownM.hop = 0; tiersNow = null;
  };
  resetShown();
  // The layout the shares are heading for (computed once per goal and size, between frames: the name search is not per frame).
  const target = () => (of === 'inflow' ? targetInflow() : targetRoutes());
  // The portal blood's layout: the one bar across the card, the Healthy bracket over it, the pills under it (routeLayout). Per
  // part: x, pct (the bar's segment), lx and row (its pill's centre and row), tier (their wording).
  function targetRoutes() {
    const pk = (ps) => (ps || []).map((p) => `${p.id}:${p.pct}`).join(',');
    const [w, hh, f] = sizeNow(), key = `portal|${Math.round(w)}|${Math.round(hh)}|${f}|${pk(goal)}|${pk(hGoal)}`;
    if (memo?.key === key) return memo;
    const lay = routeLayout(goal, w, hh, f, textW, hGoal, tiersNow);
    const at = Object.fromEntries(lay.spans.map((s, i) => [s.id, [s, lay.tiers[i], lay.pills.find((p) => p.id === s.id)]]));
    tiersNow = Object.fromEntries(lay.spans.map((s, i) => [s.id, lay.tiers[i]]));
    const want = {};
    for (const id of ids) {
      const [s, t, pill] = at[id] || [], o = hasShown ? shownP[id] : null, first = id === ids[0];
      // (A part not on this slide shrinks where it stood; the liver, first on the bar, stays at 0.)
      if (!s) { want[id] = { x: o ? o.x : (first ? 0 : 100), pct: 0, op: 0, hop: 0, lx: o ? o.lx : w / 2, row: o ? o.row : 0, tier: tierP[id].init ? tierP[id].drawn : 4 }; continue; }
      const cx = pill ? pill.cx : (s.a + s.b) / 2;
      want[id] = { x: (s.a / w) * 100, pct: s.pct, op: 1, hop: 0, lx: cx, row: pill ? pill.row : 0, tier: t };
    }
    want._ = { top: lay.top, hop: lay.mark ? 1 : 0 };
    memo = { key, want, w, hh, f, geo: lay.geo, mark: lay.mark, rows: lay.rows, hide: sameShares(goal, hGoal) };
    return memo;
  }
  // The inflow's layout: the one bar across the card, the Healthy line over it, the words' places (inflowLabels). Per part:
  // x, pct (the bar's segment), lx (its words' centre), tier (their wording).
  function targetInflow() {
    const pk = (ps) => (ps || []).map((p) => `${p.id}:${p.pct}`).join(',');
    const [w, hh, f] = sizeNow(), key = `inflow|${Math.round(w)}|${Math.round(hh)}|${f}|${pk(goal)}|${pk(hGoal)}`;
    if (memo?.key === key) return memo;
    const geo = inflowGeo(f), mark = inflowMarker(hGoal, w, f, textW), spans = inflowSpans(barOrder(goal, 'inflow'), w);
    const labs = inflowLabels(spans, w, geo, textW, mark, tiersNow), at = Object.fromEntries(spans.map((s, i) => [s.id, [s, labs[i]]]));
    tiersNow = Object.fromEntries(spans.map((s, i) => [s.id, labs[i].tier]));
    const want = {};
    ids.forEach((id, i) => {
      const [s, l] = at[id] || [], o = hasShown ? shownP[id] : null;
      // (A part not on this slide shrinks where it stood; the portal vein, first on the bar, stays at 0.)
      if (!s) { want[id] = { x: o ? o.x : (i ? 100 : 0), pct: 0, op: 0, hop: 0, lx: o ? o.lx : w / 2, row: 0, tier: tierP[id].init ? tierP[id].drawn : 4 }; return; }
      want[id] = { x: (s.a / w) * 100, pct: s.pct, op: 1, hop: 0, lx: l.cx, row: 0, tier: l.tier };
    });
    want._ = { top: Math.max(0, (hh - geo.h) / 2), hop: mark ? 1 : 0 };
    memo = { key, want, w, hh, f, geo, mark, hide: sameShares(goal, hGoal) };
    return memo;
  }

  // ── The model (built between frames) ──
  // A piece's strength is held on it as a number (setGeo), set before its look is read, so the picture reads it live.
  const strength = (n, v = 0) => { setGeo(n, 'opacity', v); return n; };
  const tspan = (cls) => sv('tspan', cls ? { class: cls, 'data-look': 'flows.pill.k' } : { 'data-look': 'flows.tspan' });
  // Widths of the words a pill carries for each whole percent (the name and its percent as one, then the name alone), measured once per size
  // here, so a frame sets a pill's width from a table, never measures a string.
  let pillF = 0, pillW = {};
  function pillWidths(f) {
    if (pillF !== f) { pillF = f; pillW = {}; }
    for (const id of ids) {
      if (pillW[id]) continue;
      const a = new Float64Array(102), name = NAME_OF[id];
      for (let p = 0; p <= 100; p++) a[p] = textW(`${name} ${p}%`, f, 700);
      a[101] = textW(name, f, 700);
      pillW[id] = a;
    }
  }
  // (The inflow's leader line over a segment too narrow for its words: that line's width at each whole percent.)
  let leadF = 0, leadW = {};
  function leadWidths(f) {
    if (leadF !== f) { leadF = f; leadW = {}; }
    for (const id of ids) {
      if (leadW[id]) continue;
      const a = new Float64Array(101);
      for (let p = 0; p <= 100; p++) a[p] = textW(`${INFLOW_SHORT[id]} ${p}%`, f, 600);
      leadW[id] = a;
    }
  }
  function build() {
    const { w, hh, f } = memo, inflow = of === 'inflow';
    size = `${Math.round(w)}x${Math.round(hh)}`;
    const clipRect = sv('rect', { x: 0, width: w });
    const segG = sv('g', { 'clip-path': `url(#${clip})` });
    const mkText = sv('text', { 'data-look': 'flows.mk.text', 'text-anchor': 'middle' }), mkLine = sv(inflow ? 'line' : 'path', { 'data-look': 'flows.mk.line' });
    const mk = strength(sv('g', { class: 'pfl-mk' }, mkLine, mkText));
    const pieces = {};
    const kids = [sv('defs', {}, sv('clipPath', { id: clip }, clipRect)), segG, mk];
    for (const id of ids) {
      const p = pieces[id] = {};
      const tone = TONE_OF[id].replace(/^--/, '');   // (the colour's token name, for the looks)
      p.seg = strength(sv('rect', { class: 'pfl-seg', 'data-look': 'flows.seg', 'data-p-tone': tone, 'data-part': id }));
      segG.append(p.seg);
      if (!inflow) {
        // The wordings of a part in a pill under the bar: the name and its percent (tier 3), the name alone (tier 2).
        p.pillRectV = sv('rect', { 'data-look': 'flows.pill.rect', 'data-p-tone': tone }); p.pillKV = tspan('k'); p.pillV = tspan('');
        p.pillTextV = sv('text', { 'data-look': 'flows.pill.text', 'text-anchor': 'middle' }, p.pillKV, p.pillV);
        p.pillGV = strength(sv('g', { class: 'ppf-pill pfl-pill', 'data-part': id }, p.pillRectV, p.pillTextV));
        p.pillRectN = sv('rect', { 'data-look': 'flows.pill.rect', 'data-p-tone': tone }); p.pillTextN = sv('text', { 'data-look': 'flows.pill.text', 'text-anchor': 'middle' });
        p.pillGN = strength(sv('g', { class: 'ppf-pill pfl-pill', 'data-part': id }, p.pillRectN, p.pillTextN));
        setWords(p.pillKV, `${NAME_OF[id]} `); setWords(p.pillTextN, NAME_OF[id]);
        kids.push(p.pillGV, p.pillGN);
      }
      p.n = sv('text', { class: 'n', 'data-look': 'flows.lab.n', 'text-anchor': 'middle' }); p.v = sv('text', { class: 'v', 'data-look': 'flows.lab.v', 'text-anchor': 'middle' });
      p.lead = inflow ? sv('line', { class: 'pfl-lead', 'data-look': 'flows.lead' }) : null;
      p.lab = strength(sv('g', { class: 'pfl-lab', 'data-part': id }, ...(p.lead ? [p.lead, p.n, p.v] : [p.n, p.v])));
      kids.push(p.lab);
    }
    const root = sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px` }, kids);
    if (inflow) leadWidths(f); else pillWidths(f);
    model = { root, clipRect, mk, mkText, mkLine, pieces, bracket: inflow ? null : new Float64Array(8), key: of };
    modelKey = `${of}|${size}|${f}`;
    gl.show(root, false);
  }
  // What a new layout changes in the model: the words, the places that stay, and what a screen reader is told.
  function apply() {
    const { geo, mark } = memo, inflow = of === 'inflow', say = (ps) => barOrder(ps, of).map((p) => `${p.name} ${p.pct}%`).join(', ');
    const br = flowView(goal, of).bracket;
    model.root.setAttribute('aria-label', `${inflow ? 'The liver\'s inflow' : 'Where the portal blood goes'}, ${memo.hide ? `healthy, and now the same: ${say(goal)}` : `now: ${say(goal)}${br ? `; ${br[0]} ${br[1]}%` : ''}${hGoal ? `; healthy: ${say(hGoal)}` : ''}`}`);
    setGeo(model.clipRect, 'height', geo.barH); setGeo(model.clipRect, 'rx', Math.min(6, geo.barH / 2));
    setWords(model.mkText, mark ? mark.text : '');
    if (mark) setGeo(model.mkText, 'x', (mark.L + mark.R) / 2);
    for (const id of ids) {
      const p = model.pieces[id];
      if (!inflow) { setGeo(p.pillRectV, 'height', geo.ph); setGeo(p.pillRectV, 'rx', geo.ph / 2); setGeo(p.pillRectN, 'height', geo.ph); setGeo(p.pillRectN, 'rx', geo.ph / 2); }
    }
  }
  // The bar and its words laid out for what the card holds now (between frames): the layout, the model rebuilt where the card's size changed,
  // and the first state shown at once.
  function retarget() {
    if (!goal) return;
    target();
    if (!model || modelKey !== `${of}|${Math.round(memo.w)}x${Math.round(memo.hh)}|${memo.f}`) { if (model) { resetShown(); memo = null; target(); } build(); }
    apply();
    if (!hasShown) tick();   // (the first state is drawn at once: the card never comes in empty)
  }
  // The bar, drawn from the eased numbers.
  function draw() {
    if (!goal || !hasShown || !memo || !model) return;
    if (of === 'inflow') drawInflow(); else drawRoutes();
    gl.paint();
  }
  function drawRoutes() {
    const { w, geo, mark, f } = memo, top0 = shownM.top, yT = top0 + geo.barT;
    setGeo(model.clipRect, 'y', yT);
    // The healthy split: a dashed bracket over the whole bar, its words centred above.
    const on = mark && shownM.hop > 0.01;
    setGeo(model.mk, 'opacity', on ? shownM.hop : 0);
    if (on) {
      const yb = top0 + geo.brY, x0 = mark.x0 + 1, x1 = mark.x1 - 1, B = model.bracket;
      B[0] = x0; B[1] = yb + geo.brTick; B[2] = x0; B[3] = yb; B[4] = x1; B[5] = yb; B[6] = x1; B[7] = yb + geo.brTick;
      setPts(model.mkLine, B, 4, false);
      setGeo(model.mkText, 'y', top0 + geo.base);
    }
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], s = shownP[id], t = tierP[id], p = model.pieces[id], op = s.op * t.o, pi = Math.round(s.pct), pc = pi > 100 ? 100 : pi < 0 ? 0 : pi;
      // The segment: as wide as its share, a hairline of card between them (the bar's clip rounds its ends).
      if (s.op > 0.01 && s.pct > 0.05) {
        const x = (s.x / 100) * w, wd = (s.pct / 100) * w, inner = x > 0.5;
        setGeo(p.seg, 'x', x + (inner ? 0.75 : 0)); setGeo(p.seg, 'y', yT);
        setGeo(p.seg, 'width', Math.max(0.5, wd - (inner ? 0.75 : 0) - (x + wd < w - 0.5 ? 0.75 : 0))); setGeo(p.seg, 'height', geo.barH);
        setGeo(p.seg, 'opacity', s.op);
      } else setGeo(p.seg, 'opacity', 0);
      const shown = s.op > 0.01 && op > 0.01 && t.drawn <= 3, d = t.drawn;
      // A pill in the part's colour, like the app's other value pills, in the bar's order under it (the name and its percent where its percent is
      // not on the bar, its name alone where the percent is).
      const pillV = shown && d === 3, pillN = shown && d === 2;
      setGeo(p.pillGV, 'opacity', pillV ? op : 0); setGeo(p.pillGN, 'opacity', pillN ? op : 0);
      if (pillV || pillN) {
        const pw = Math.min(w, pillW[id][pillV ? pc : 101] + 2 * geo.px), px = Math.min(Math.max(s.lx - pw / 2, 0), w - pw), py = top0 + geo.pillsT + s.row * (geo.ph + geo.pg);
        const rect = pillV ? p.pillRectV : p.pillRectN, text = pillV ? p.pillTextV : p.pillTextN;
        setGeo(rect, 'x', px); setGeo(rect, 'y', py); setGeo(rect, 'width', pw);
        setGeo(text, 'x', px + pw / 2); setGeo(text, 'y', py + geo.ph / 2 + 0.36 * f);
        if (pillV) setWords(p.pillV, pctWords(pc));
      }
      // The words on the bar: the name and percent (tier 0), the percent alone (tier 2).
      const lab = shown && (d === 0 || d === 2);
      setGeo(p.lab, 'opacity', lab ? op : 0);
      if (lab) {
        const cx = ((s.x + s.pct / 2) / 100) * w;
        setWords(p.v, pctWords(pc)); setGeo(p.v, 'x', cx); setGeo(p.v, 'y', d === 0 ? yT + geo.n2 : yT + geo.mid);
        setWords(p.n, d === 0 ? NAME_OF[id] : ''); setGeo(p.n, 'x', cx); setGeo(p.n, 'y', yT + geo.n1);
      }
    }
  }
  function drawInflow() {
    const { w, geo, mark, f } = memo, top0 = shownM.top, yT = top0 + geo.top, yB = top0 + geo.bottom;
    setGeo(model.clipRect, 'y', yT);
    // The healthy split: a dashed line over the bar where its portal blood ends, its words above.
    const on = mark && shownM.hop > 0.01;
    setGeo(model.mk, 'opacity', on ? shownM.hop : 0);
    if (on) {
      setGeo(model.mkLine, 'x1', mark.x); setGeo(model.mkLine, 'x2', mark.x); setGeo(model.mkLine, 'y1', top0 + geo.base + 0.4 * f); setGeo(model.mkLine, 'y2', yB + 0.5 * f);
      setGeo(model.mkText, 'y', top0 + geo.base);
    }
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], s = shownP[id], t = tierP[id], p = model.pieces[id], op = s.op * t.o, pi = Math.round(s.pct), pc = pi > 100 ? 100 : pi < 0 ? 0 : pi;
      if (s.op > 0.01 && s.pct > 0.05) {
        const x = (s.x / 100) * w, wd = (s.pct / 100) * w, inner = x > 0.5;
        setGeo(p.seg, 'x', x + (inner ? 0.75 : 0)); setGeo(p.seg, 'y', yT);
        setGeo(p.seg, 'width', Math.max(0.5, wd - (inner ? 0.75 : 0) - (x + wd < w - 0.5 ? 0.75 : 0))); setGeo(p.seg, 'height', geo.barH);
        setGeo(p.seg, 'opacity', s.op);
      } else setGeo(p.seg, 'opacity', 0);
      // Each part's words: on its segment where they fit (tiers 0 to 2), else above the bar on a short leader (tier 3).
      const shown = s.op > 0.01 && op > 0.01 && t.drawn <= 3, d = t.drawn;
      setGeo(p.lab, 'opacity', shown ? op : 0);
      if (!shown) continue;
      if (d <= 1) {
        setWords(p.n, d ? INFLOW_SHORT[id] : NAME_OF[id]); setGeo(p.n, 'x', s.lx); setGeo(p.n, 'y', yT + geo.n1);
        setWords(p.v, pctWords(pc)); setGeo(p.v, 'x', s.lx); setGeo(p.v, 'y', yT + geo.n2);
        setGeo(p.lead, 'x1', 0); setGeo(p.lead, 'x2', 0); setGeo(p.lead, 'y1', 0); setGeo(p.lead, 'y2', 0);
      } else if (d === 2) {
        setWords(p.n, ''); setWords(p.v, pctWords(pc)); setGeo(p.v, 'x', s.lx); setGeo(p.v, 'y', yT + geo.mid);
        setGeo(p.lead, 'x1', 0); setGeo(p.lead, 'x2', 0); setGeo(p.lead, 'y1', 0); setGeo(p.lead, 'y2', 0);
      } else {
        const half = leadW[id][pc] / 2, cx = Math.min(Math.max((((s.x + s.pct / 2) / 100) * w), s.lx - half), s.lx + half);
        setWords(p.v, ''); setWords(p.n, LEAD_WORDS[id][pc]); setGeo(p.n, 'x', s.lx); setGeo(p.n, 'y', top0 + geo.base);
        setGeo(p.lead, 'x1', cx); setGeo(p.lead, 'x2', cx); setGeo(p.lead, 'y1', yT); setGeo(p.lead, 'y2', top0 + geo.base + 0.3 * f);
      }
    }
  }
  const fade = (a, b, k) => (k === 1 ? b : a + (b - a) * (b < a ? 0.4 : 0.2));
  const mixTo = (a, b, k) => a + (b - a) * k;
  function tick() {
    raf = 0;
    if (!goal || !memo || !model) return;
    // (Every share, place and name eases together, so a segment that overtakes another glides past it.)
    const want = memo.want, k = reduceMQ.matches || !hasShown ? 1 : 0.2;
    // (A part that goes fades out faster than the others move; one that comes fades in where it will stay.)
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], w0 = want[id], s = shownP[id];
      s.op = fade(s.op, w0.op, k); s.hop = fade(s.hop, w0.hop, k);
      for (let j = 0; j < MIXK.length; j++) s[MIXK[j]] = mixTo(s[MIXK[j]], w0[MIXK[j]], k);
    }
    shownM.top = mixTo(shownM.top, want._.top, k); shownM.hop = fade(shownM.hop, want._.hop, k);
    // (A part's words: one whose wording changes (the full name for the short one, the percent alone, a pill…) fades out, is
    // reworded and fades back in, so a word never changes under the eye.)
    let swapping = false;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], goalTier = want[id].tier, t = tierP[id];
      if (!t.init) { t.init = true; t.drawn = goalTier; t.o = 1; }
      if (t.drawn === goalTier) t.o = k === 1 ? 1 : Math.min(1, t.o + 0.2);
      else if (t.drawn > 3) { t.drawn = goalTier; t.o = 0; }   // (nothing was drawn: its words fade in as they are)
      else { t.o = k === 1 ? 0 : Math.max(0, t.o - 0.25); if (t.o <= 0.02) { t.drawn = goalTier; t.o = 0; } }
      if (t.drawn !== goalTier || t.o < 0.999) swapping = true;
    }
    let done = !swapping && Math.abs(shownM.top - want._.top) < 0.01 && Math.abs(shownM.hop - want._.hop) < 0.01;
    for (let i = 0; done && i < ids.length; i++) {
      const id = ids[i], w0 = want[id], s = shownP[id];
      done = Math.abs(s.x - w0.x) < 0.01 && Math.abs(s.pct - w0.pct) < 0.01 && Math.abs(s.op - w0.op) < 0.01 && Math.abs(s.row - w0.row) < 0.01 && Math.abs(s.hop - w0.hop) < 0.01 && Math.abs(s.lx - w0.lx) < 0.2;
    }
    if (done) {
      for (let i = 0; i < ids.length; i++) { const id = ids[i], w0 = want[id], s = shownP[id]; s.x = w0.x; s.pct = w0.pct; s.op = w0.op; s.row = w0.row; s.hop = w0.hop; s.lx = w0.lx; }
      shownM.top = want._.top; shownM.hop = want._.hop;
    }
    hasShown = true;
    draw();
    if (!done) raf = frame(tick, 'tool-flows');
  }
  function aim(fp) {
    const named = goal && of !== 'inflow' ? new Set(goal.filter((x) => x.id !== 'liver' && x.id !== 'other').map((x) => x.id)) : null;
    const p = flowParts(fp, of, params, named);
    if (!p) return;
    // (A split that moves no part by more than HOLD_PP waits, the newest kept, until the readings rest: the bar never flips on a wobble.)
    clearTimeout(holdT); holdT = 0; held = null;
    if (goal && hasShown && memo && smallMove(goal, p)) {
      if (sameShares(goal, p)) return;
      held = p;
      holdT = setTimeout(() => { holdT = 0; const h = held; held = null; if (h && el.isConnected !== false) { goal = h; retarget(); if (!raf) raf = frame(tick, 'tool-flows'); } }, HOLD_MS);
      return;
    }
    goal = p;
    healthyNow();
    if (!box) { if (!measuring) measuring = restPass(() => { measuring = 0; measureBox(); retarget(); if (goal && !raf) raf = frame(tick, 'tool-flows'); }); return; }
    retarget();
    if (!raf) raf = frame(tick, 'tool-flows');
  }
  // The healthy model's parts (the presenter's healthy fingerprint, the one the profile's dashed line uses): it can arrive
  // after the first slide, so the card asks again for a few seconds; the Healthy marker fades in when it comes.
  function healthyNow() {
    const hp = flowParts(ctx0?.healthy?.(), of);
    clearTimeout(wait); wait = 0;
    if (hp) { hGoal = hp; return; }
    hGoal = null;
    let tries = 0;
    const again = () => { wait = 0; const h = flowParts(ctx0?.healthy?.(), of); if (h) { hGoal = h; retarget(); if (!raf && goal) raf = frame(tick, 'tool-flows'); } else if (++tries < 40 && el.isConnected !== false) wait = setTimeout(again, 250); };
    wait = setTimeout(again, 250);
  }
  // (A new size lays the names out afresh and shows them there at once: the places are in pixels.)
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
    if (el.isConnected) measureBox();
    if (hasShown && el.isConnected && size !== `${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`) { if (raf) cancelFrame(raf); resetShown(); memo = null; retarget(); tick(); }
  }).observe(el);
  return {
    el,
    configure(t, ctx) {
      const of2 = t?.of === 'inflow' ? 'inflow' : 'portal';
      if (of2 !== of) { of = of2; resetShown(); memo = null; model = null; modelKey = ''; gl.clear(); }   // (the other split: drawn afresh)
      of = of2; params = ctx?.params || null; ctx0 = ctx || null; el.dataset.of = of;
      // (A new slide's card, as the slide is set up: read now the first time, else again between frames, the last read kept until then.)
      if (!box) measureBox(); else if (!measuring) measuring = restPass(() => { measuring = 0; measureBox(); retarget(); });
      if (ctx?.fp) aim(ctx.fp);
    },
    pin(fp) { if (el.isConnected && fp) aim(fp); },
    clear() {},
    dispose() { if (raf) cancelFrame(raf); raf = 0; cancelRest(measuring); measuring = 0; clearTimeout(wait); wait = 0; clearTimeout(holdT); holdT = 0; held = null; gl.dispose(); },
  };
}
