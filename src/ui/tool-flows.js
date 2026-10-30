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

import { frame, cancelFrame } from './frame.js?v=9f2b0fae80';
import { EDGES, PORTOSYSTEMIC_EDGES, SPLANCHNIC_ARTERIES } from '../engine/topology.js?v=4044766e96';
import { portalSplit } from './table-marks.js?v=bca5ebb624';

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

/** The bar's parts for a fingerprint: [{ id, name, tone, pct }] in whole percents adding up to 100, the liver's part
 *  100 less the Shunted tile; at most MAX_ROUTES routes by name, the rest (and any custom shunt) as Other; a part that
 *  rounds to 0 is left out. of: 'inflow' → the liver's inflow, portal and arterial. null without the flows. */
export function flowParts(fp, of = 'portal', params = null) {
  const Q = fp?.at?.Q;
  if (!Q) return null;
  if (of === 'inflow') {
    const pv = Math.max(0, Q[EI.PRE_R]) + Math.max(0, Q[EI.PRE_L]), ha = Math.max(0, Q[EI.A_HR]) + Math.max(0, Q[EI.A_HL]);
    const pct = wholeShares([pv, ha], 100);
    return INFLOW.map(([id, name, tone], i) => ({ id, name, tone, pct: pct[i] })).filter((p) => p.pct > 0);
  }
  const { liver, shunt } = portalSplit(fp.shunt);
  const { by, custom } = routeFlows(Q, params);
  const ranked = ROUTES.filter(([k]) => by[k] > 0).sort((a, b) => by[b[0]] - by[a[0]]);
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
export function inflowLabels(spans, w, geo, measure, mark = null) {
  const { f, g, mc } = geo, E = 1e-6;
  return spans.map((s) => {
    const full = INFLOW.find(([k]) => k === s.id)[1], short = INFLOW_SHORT[s.id], v = `${s.pct}%`, vw = measure(v, f, 700), mid = (s.a + s.b) / 2;
    const wid = [Math.max(measure(full, f, 500), vw), Math.max(measure(short, f, 500), vw), vw];
    const free = mark && mark.x > s.a + 0.5 && mark.x < s.b - 0.5 ? [[s.a, mark.x - mc], [mark.x + mc, s.b]] : [[s.a, s.b]];
    for (let tier = 0; tier < 3; tier++) {
      const fit = free.filter(([a, b]) => b - a - 2 * g >= wid[tier] - E)
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
export function routeLayout(parts, w, hh, f, measure, hParts = null) {
  let use = parts, lay = routeOnce(use, w, hh, f, measure, hParts);
  while (!lay.ok) {
    const routes = barOrder(use).filter((p) => p.id !== 'liver' && p.id !== 'other');
    if (routes.length < 2) break;
    const small = routes.at(-1), o = use.find((p) => p.id === 'other');
    use = [...use.filter((p) => p !== small && p !== o), { id: OTHER[0], name: OTHER[1], tone: OTHER[2], pct: (o?.pct || 0) + small.pct }];
    lay = routeOnce(use, w, hh, f, measure, hParts);
  }
  return { ...lay, parts: use };
}
function routeOnce(parts, w, hh, f, measure, hParts) {
  const geo = routeGeo(f), g = geo.g;
  let acc = 0;
  const spans = barOrder(parts).map((p) => { const a = (acc / 100) * w; acc += p.pct; return { id: p.id, name: p.name, pct: p.pct, a, b: (acc / 100) * w }; });
  const tiers = spans.map((s) => {
    const room = s.b - s.a - 2 * g, pw = measure(`${s.pct}%`, f, 700);
    return Math.max(measure(s.name, f, 500), pw) <= room ? 0 : pw <= room ? 2 : 3;
  });
  const { pills, rows } = routePills(spans.filter((s, i) => tiers[i] === 3).map((s) => ({ id: s.id, text: `${s.name} ${s.pct}%` })), w, geo, measure);
  return { geo, spans, tiers, pills, rows, ok: rows <= routeRows(hh, geo), mark: routeMarker(hParts, w, f, measure), top: Math.max(0, (hh - routeHeight(rows, geo)) / 2) };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
let mctx = null;
const textW = (t, f, wt = 600) => {
  if (mctx === null) mctx = (typeof document !== 'undefined' && document.createElement?.('canvas')?.getContext?.('2d')) || false;
  if (!mctx?.measureText) return t.length * f * 0.58;
  mctx.font = `${wt} ${f}px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`;
  return mctx.measureText(t).width;
};
// Every part the bar can show.
const ALL = [LIVER, ...ROUTES, OTHER];
let uid = 0;

export function createFlowsTool() {
  const el = document.createElement('div');
  el.className = 'pz-flows';
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const clip = `pfl-clip-${++uid}`;
  let of = 'portal', params = null, goal = null, hGoal = null, ctx0 = null, shown = null, raf = 0, size = '', memo = null, wait = 0;
  let tiers = {};   // (each part's words: the wording they are drawn in now, and their opacity while they swap for another)
  const sizeNow = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? 12 / z : 0);
    return [Math.max(160, w || 420), Math.max(6 * f, el.clientHeight || 160), f];
  };
  const order = () => (of === 'inflow' ? INFLOW : ALL).map(([id]) => id);
  const info = (id) => ALL.concat(INFLOW).find(([k]) => k === id);
  // The segments, each as wide as its share of the blood, a hairline of card between them (the bar's clip rounds its ends).
  const segments = (ids, yT, barH, w) => sv('g', { 'clip-path': `url(#${clip})` }, ids.filter((id) => shown[id].pct > 0.05).map((id) => {
    const x = (shown[id].x / 100) * w, wd = (shown[id].pct / 100) * w, inner = x > 0.5;
    return sv('rect', { class: 'pfl-seg', 'data-part': id, style: `--tone: var(${info(id)[2]}); opacity: ${shown[id].op.toFixed(3)}`,
      x: x + (inner ? 0.75 : 0), y: yT, width: Math.max(0.5, wd - (inner ? 0.75 : 0) - (x + wd < w - 0.5 ? 0.75 : 0)), height: barH });
  }));
  // The layout the shares are heading for (computed once per goal and size: the name search is not per frame).
  const target = () => (of === 'inflow' ? targetInflow() : targetRoutes());
  // The portal blood's layout: the one bar across the card, the Healthy bracket over it, the pills under it (routeLayout). Per
  // part: x, pct (the bar's segment), lx and row (its pill's centre and row), tier (their wording).
  function targetRoutes() {
    const pk = (ps) => (ps || []).map((p) => `${p.id}:${p.pct}`).join(',');
    const [w, hh, f] = sizeNow(), key = `portal|${Math.round(w)}|${Math.round(hh)}|${f}|${pk(goal)}|${pk(hGoal)}`;
    if (memo?.key === key) return memo;
    const lay = routeLayout(goal, w, hh, f, textW, hGoal);
    const at = Object.fromEntries(lay.spans.map((s, i) => [s.id, [s, lay.tiers[i], lay.pills.find((p) => p.id === s.id)]]));
    const zero = { ld: 0, dn: 0, hx: 0, hpct: 0, hop: 0, hn: 0, hv: 0 };
    const want = Object.fromEntries(order().map((id) => {
      const [s, t, pill] = at[id] || [], o = shown?.[id], first = id === order()[0];
      // (A part not on this slide shrinks where it stood; the liver, first on the bar, stays at 0.)
      if (!s) return [id, { ...zero, x: o ? o.x : (first ? 0 : 100), pct: 0, op: 0, lx: o?.lx ?? w / 2, ex: o?.lx ?? w / 2, row: o?.row ?? 0, tier: tiers[id]?.drawn ?? 4 }];
      const cx = pill ? pill.cx : (s.a + s.b) / 2;
      return [id, { ...zero, x: (s.a / w) * 100, pct: s.pct, op: 1, lx: cx, ex: cx, row: pill ? pill.row : 0, tier: t }];
    }));
    want._ = { ...zero, top: lay.top, nowOp: 1, x: 0, pct: 0, op: 0, lx: 0, ex: 0, row: 0, hop: lay.mark ? 1 : 0 };
    memo = { key, want, w, hh, f, geo: lay.geo, mark: lay.mark, rows: lay.rows, hide: sameShares(goal, hGoal) };
    return memo;
  }
  // The portal blood bar, drawn from the eased shares: the segments, the Healthy bracket, each part's words on its segment, the pills.
  function drawRoutes() {
    const { w, hh, f, geo, mark } = memo, top0 = shown._.top, yT = top0 + geo.barT;
    size = `${Math.round(w)}x${Math.round(hh)}`;
    const ids = order().filter((id) => shown[id] && shown[id].op > 0.01);
    const kids = [sv('defs', {}, sv('clipPath', { id: clip }, sv('rect', { x: 0, y: yT, width: w, height: geo.barH, rx: Math.min(6, geo.barH / 2) }))), segments(ids, yT, geo.barH, w)];
    // The healthy split: a dashed bracket over the whole bar, its words centred above.
    if (mark && shown._.hop > 0.01) {
      const yb = top0 + geo.brY, x0 = mark.x0 + 1, x1 = mark.x1 - 1;
      kids.push(sv('g', { class: 'pfl-mk', style: `opacity: ${shown._.hop.toFixed(3)}` },
        sv('path', { d: `M${x0} ${(yb + geo.brTick).toFixed(1)}V${yb.toFixed(1)}H${x1.toFixed(1)}V${(yb + geo.brTick).toFixed(1)}` }),
        sv('text', { x: (mark.L + mark.R) / 2, y: top0 + geo.base, 'text-anchor': 'middle' }, mark.text)));
    }
    for (const id of ids) {
      const s = shown[id], t = tiers[id] || { drawn: memo.want[id].tier, o: 1 }, op = s.op * t.o, v = `${Math.round(s.pct)}%`, name = info(id)[1];
      if (op <= 0.01 || t.drawn > 3) continue;
      if (t.drawn === 3) {
        // A pill in the part's colour, like the app's other value pills, in the bar's order under it.
        const pw = Math.min(w, textW(`${name} ${v}`, f, 700) + 2 * geo.px), px = Math.min(Math.max(s.lx - pw / 2, 0), w - pw), py = top0 + geo.pillsT + s.row * (geo.ph + geo.pg);
        kids.push(sv('g', { class: 'ppf-pill pfl-pill', 'data-part': id, style: `--tone: var(${info(id)[2]}); opacity: ${op.toFixed(3)}` }, sv('rect', { x: px, y: py, width: pw, height: geo.ph, rx: geo.ph / 2 }),
          sv('text', { x: px + pw / 2, y: py + geo.ph / 2 + 0.36 * f, 'text-anchor': 'middle' }, sv('tspan', { class: 'k' }, `${name} `), v)));
        continue;
      }
      const cx = ((s.x + s.pct / 2) / 100) * w, lab = (...k) => sv('g', { class: 'pfl-lab', 'data-part': id, style: `opacity: ${op.toFixed(3)}` }, ...k);
      const text = (cls, y, t2) => sv('text', { class: cls, x: cx, y, 'text-anchor': 'middle' }, t2);
      kids.push(t.drawn === 0 ? lab(text('n', yT + geo.n1, name), text('v', yT + geo.n2, v)) : lab(text('v', yT + geo.mid, v)));
    }
    finish(kids);
  }
  // The inflow's layout: the one bar across the card, the Healthy line over it, the words' places (inflowLabels). Per part:
  // x, pct (the bar's segment), lx (its words' centre), tier (their wording).
  function targetInflow() {
    const pk = (ps) => (ps || []).map((p) => `${p.id}:${p.pct}`).join(',');
    const [w, hh, f] = sizeNow(), key = `inflow|${Math.round(w)}|${Math.round(hh)}|${f}|${pk(goal)}|${pk(hGoal)}`;
    if (memo?.key === key) return memo;
    const geo = inflowGeo(f), mark = inflowMarker(hGoal, w, f, textW), spans = inflowSpans(barOrder(goal, 'inflow'), w);
    const labs = inflowLabels(spans, w, geo, textW, mark), at = Object.fromEntries(spans.map((s, i) => [s.id, [s, labs[i]]]));
    const zero = { row: 0, ld: 0, dn: 0, hx: 0, hpct: 0, hop: 0, hn: 0, hv: 0 };
    const want = Object.fromEntries(order().map((id, i) => {
      const [s, l] = at[id] || [], o = shown?.[id];
      // (A part not on this slide shrinks where it stood; the portal vein, first on the bar, stays at 0.)
      if (!s) return [id, { ...zero, x: o ? o.x : (i ? 100 : 0), pct: 0, op: 0, lx: o?.lx ?? w / 2, ex: o?.lx ?? w / 2, tier: tiers[id]?.drawn ?? 4 }];
      return [id, { ...zero, x: (s.a / w) * 100, pct: s.pct, op: 1, lx: l.cx, ex: l.cx, tier: l.tier }];
    }));
    want._ = { ...zero, top: Math.max(0, (hh - geo.h) / 2), nowOp: 1, x: 0, pct: 0, op: 0, lx: 0, ex: 0, hop: mark ? 1 : 0 };
    memo = { key, want, w, hh, f, geo, mark, hide: sameShares(goal, hGoal) };
    return memo;
  }
  // The inflow bar, drawn from the eased shares: the segments, the Healthy line with its words, then each part's words.
  function drawInflow() {
    const { w, hh, f, geo, mark } = memo, top0 = shown._.top, yT = top0 + geo.top, yB = top0 + geo.bottom;
    size = `${Math.round(w)}x${Math.round(hh)}`;
    const X = (pc) => (pc / 100) * w, ids = order().filter((id) => shown[id] && shown[id].op > 0.01);
    const kids = [sv('defs', {}, sv('clipPath', { id: clip }, sv('rect', { x: 0, y: yT, width: w, height: geo.barH, rx: Math.min(6, geo.barH / 2) })))];
    kids.push(segments(ids, yT, geo.barH, w));
    // The healthy split: a dashed line over the bar where its portal blood ends, its words above.
    if (mark && shown._.hop > 0.01) {
      kids.push(sv('g', { class: 'pfl-mk', style: `opacity: ${shown._.hop.toFixed(3)}` },
        sv('line', { x1: mark.x, y1: top0 + geo.base + 0.4 * f, x2: mark.x, y2: yB + 0.5 * f }),
        sv('text', { x: (mark.L + mark.R) / 2, y: top0 + geo.base, 'text-anchor': 'middle' }, mark.text)));
    }
    // Each part's words: on its segment where they fit (tiers 0 to 2), else above the bar on a short leader (tier 3).
    for (const id of ids) {
      const s = shown[id], t = tiers[id] || { drawn: memo.want[id].tier, o: 1 }, op = s.op * t.o, v = `${Math.round(s.pct)}%`;
      if (op <= 0.01 || t.drawn > 3) continue;
      const lab = (...k) => sv('g', { class: 'pfl-lab', 'data-part': id, style: `opacity: ${op.toFixed(3)}` }, ...k);
      const text = (cls, y, t2) => sv('text', { class: cls, x: s.lx, y, 'text-anchor': 'middle' }, t2);
      if (t.drawn <= 1) kids.push(lab(text('n', yT + geo.n1, t.drawn ? INFLOW_SHORT[id] : info(id)[1]), text('v', yT + geo.n2, v)));
      else if (t.drawn === 2) kids.push(lab(text('v', yT + geo.mid, v)));
      else {
        const line = `${INFLOW_SHORT[id]} ${v}`, half = textW(line, f, 600) / 2, cx = Math.min(Math.max(X(s.x + s.pct / 2), s.lx - half), s.lx + half);
        kids.push(lab(sv('path', { class: 'pfl-lead', d: `M${cx.toFixed(1)} ${yT.toFixed(1)}V${(top0 + geo.base + 0.3 * f).toFixed(1)}` }), text('n', top0 + geo.base, line)));
      }
    }
    finish(kids);
  }
  // The card's drawing: the svg round the kids, with what it shows said for a screen reader.
  function finish(kids) {
    const { w, hh, f } = memo, say = (ps) => barOrder(ps, of).map((p) => `${p.name} ${p.pct}%`).join(', ');
    const br = flowView(goal, of).bracket;
    el.replaceChildren(sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px`,
      'aria-label': `${of === 'inflow' ? 'The liver\'s inflow' : 'Where the portal blood goes'}, ${memo.hide ? `healthy, and now the same: ${say(goal)}` : `now: ${say(goal)}${br ? `; ${br[0]} ${br[1]}%` : ''}${hGoal ? `; healthy: ${say(hGoal)}` : ''}`}` }, kids));
  }
  function draw() {
    if (!goal || !shown || !memo) { el.replaceChildren(); return; }
    if (of === 'inflow') drawInflow(); else drawRoutes();
  }
  function tick() {
    raf = 0;
    if (!goal) return;
    // (Every share, place and name eases together, so a segment that overtakes another glides past it.)
    const { want } = target();
    const k = reduceMQ.matches || !shown ? 1 : 0.2, mix = (a, b) => a + (b - a) * k;
    // (A part that goes fades out faster than the others move; one that comes fades in where it will stay.)
    const fade = (a, b) => (k === 1 ? b : a + (b - a) * (b < a ? 0.4 : 0.2));
    const KEYS = ['x', 'pct', 'lx', 'ex', 'row', 'top', 'nowOp', 'dn', 'hx', 'hpct', 'hn', 'hv'];
    shown = Object.fromEntries(Object.keys(want).map((id) => {
      const w0 = want[id], s0 = shown?.[id] || { ...w0, op: 0, ld: 0, pct: 0 };
      const s = { op: fade(s0.op, w0.op), ld: fade(s0.ld, w0.ld), hop: fade(s0.hop ?? 0, w0.hop) };
      for (const key of KEYS) if (key in w0) s[key] = mix(s0[key] ?? w0[key], w0[key]);
      return [id, s];
    }));
    // (A part's words: one whose wording changes (the full name for the short one, the percent alone, a pill…) fades out, is
    // reworded and fades back in, so a word never changes under the eye.)
    let swapping = false;
    for (const id of order()) {
      const goalTier = want[id].tier, t = (tiers[id] ||= { drawn: goalTier, o: 1 });
      if (t.drawn === goalTier) t.o = k === 1 ? 1 : Math.min(1, t.o + 0.2);
      else if (t.drawn > 3) { t.drawn = goalTier; t.o = 0; }   // (nothing was drawn: its words fade in as they are)
      else { t.o = k === 1 ? 0 : Math.max(0, t.o - 0.25); if (t.o <= 0.02) { t.drawn = goalTier; t.o = 0; } }
      if (t.drawn !== goalTier || t.o < 0.999) swapping = true;
    }
    const done = !swapping && Object.keys(want).every((id) => ['x', 'pct', 'op', 'ld', 'row', 'top', 'nowOp', 'dn', 'hx', 'hpct', 'hop', 'hn', 'hv'].every((key) => !(key in want[id]) || Math.abs(shown[id][key] - want[id][key]) < 0.01)
      && Math.abs(shown[id].lx - want[id].lx) < 0.2 && Math.abs(shown[id].ex - want[id].ex) < 0.2);
    if (done) shown = Object.fromEntries(Object.keys(want).map((id) => [id, { ...want[id] }]));
    draw();
    if (!done) raf = frame(tick, 'tool-flows');
  }
  function aim(fp) {
    const p = flowParts(fp, of, params);
    if (!p) return;
    goal = p;
    healthyNow();
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
    const again = () => { wait = 0; const h = flowParts(ctx0?.healthy?.(), of); if (h) { hGoal = h; if (!raf && goal) raf = frame(tick, 'tool-flows'); } else if (++tries < 40 && el.isConnected !== false) wait = setTimeout(again, 250); };
    wait = setTimeout(again, 250);
  }
  // (A new size lays the names out afresh and shows them there at once: the places are in pixels.)
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (shown && el.isConnected && size !== `${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`) { if (raf) cancelFrame(raf); shown = null; tiers = {}; tick(); } }).observe(el);
  return {
    el,
    configure(t, ctx) {
      const of2 = t?.of === 'inflow' ? 'inflow' : 'portal';
      if (of2 !== of) { shown = null; memo = null; tiers = {}; }   // (the other split: drawn afresh)
      of = of2; params = ctx?.params || null; ctx0 = ctx || null; el.dataset.of = of;
      if (ctx?.fp) aim(ctx.fp);
    },
    pin(fp) { if (el.isConnected && fp) aim(fp); },
    clear() {},
    dispose() { if (raf) cancelFrame(raf); raf = 0; clearTimeout(wait); wait = 0; },
  };
}
