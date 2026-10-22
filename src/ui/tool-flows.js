// Where the portal blood goes (deck visuals V14, package B): tool { kind: 'flows' } draws one full-width bar that is all the
// portal blood: the liver's segment first, then one segment per route the bypassing blood takes (the esophageal varices, a
// gastrorenal or splenorenal shunt, the paraumbilical vein, a stent…) in that route's colour, largest first. No colour key
// (Mohammad, 19 Oct: the ranked bars replaced by one bar). Just above it, as tall, the Healthy bar: the healthy model's split
// in the same order and colours, so each segment compares straight down (Mohammad, 19 Oct: "we have to compare those bars
// with normal"). Each bar is named on its own row, "Healthy" and "Now" at its left, and each segment's name and percent sit
// on the segment in text with a halo, so they read on every colour (Mohammad, 19 Oct: "the bars should be close… healthy and
// now should be on the same row of the bars… label on the bars… with outlines"). A Now name too wide for its segment hangs
// under the bar on a short leader, never touching another name or leader; on the Healthy bar it shows its percent alone (its
// name is on the same colour just under it). Shares, places and names ease as they move. tool: { kind: 'flows', of: 'inflow' }
// splits the liver's own inflow into portal and arterial blood instead, the same bars with their two segments.
// The parts are the slide's fingerprint's flows (at.Q), counted as the shunt fraction is (engine/metrics.js), so the liver's
// part is always 100 less the slide's Shunted tile (table-marks.js portalSplit). The cavernoma returns blood to the liver,
// so it counts as liver.

import { EDGES, PORTOSYSTEMIC_EDGES, SPLANCHNIC_ARTERIES } from '../engine/topology.js?v=4044766e96';
import { portalSplit } from './table-marks.js?v=58a52c530c';

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

// The label rule: a name never comes nearer than this to another name, a leader, a segment's edge or the bar (px).
export const LABEL_GAP = 4;
/** The card's measures for font size f, top down: the Healthy bar, a small gap, the Now bar (both bars the same height, each
 *  named at its left, so the two compare at a glance), then the band a leader crosses under the Now bar and a row's two lines
 *  (name, then percent) for the names that cannot sit on their own segment. n1, n2: the baselines of a name and its percent
 *  on a bar, from the bar's top; mid: a percent alone, centred. */
export function flowGeo(f) {
  const g = Math.max(LABEL_GAP, 0.34 * f), barH = 2.7 * f, head = barH + Math.max(g, 0.45 * f);
  const band = 0.6 * f + g, lab = 2.4 * f;
  return { f, g, barH, head, band, lab, step: band + lab, n1: 1.15 * f, n2: 2.27 * f, mid: barH / 2 + 0.36 * f };
}
/** The Healthy bar's segments, in the Now bar's order so each colour lines up with its own above and below (the parts the
 *  Now bar lacks after them, largest first, Other last). */
export function healthyOrder(hParts, nowBar, of = 'portal') {
  const own = barOrder(hParts, of), ids = nowBar.map((p) => p.id);
  return [...ids.map((id) => own.find((p) => p.id === id)).filter(Boolean), ...own.filter((p) => !ids.includes(p.id))];
}
/** Whether two splits read the same: the same parts with the same whole percents, in any order (what the card shows, so a
 *  0.1% wobble in the model never counts). */
export const sameShares = (a, b) => {
  const key = (ps) => (ps || []).filter((p) => p.pct > 0).map((p) => `${p.id}:${p.pct}`).sort().join(',');
  return !!a && !!b && key(a) === key(b);
};
/** How many rows of names fit under the Now bar in a card hh tall (one at least). */
export const rowsFit = (hh, geo) => Math.max(1, Math.floor((hh - geo.head - geo.barH) / geo.step + 1e-6));
/** The height the two bars and rows of names under them take. */
export const flowHeight = (rows, geo) => geo.head + geo.barH + rows * geo.step;
/** What a segment of the Healthy bar shows on itself, room px wide inside its g margins: its name and percent, the percent
 *  alone (the name is on the same colour in the Now bar just under it), or nothing. */
export const healthyMode = (nameW, pctW, room) => (Math.max(nameW, pctW) <= room ? 'both' : pctW <= room ? 'pct' : 'none');

/** Where each segment's name goes. segs: [{ a, b }] the segments' spans in px, in bar order; lw: the names' widths. A name
 *  that fits on its own segment, g clear of both its edges, sits on it, centred (row −1: on the bar). Every other name hangs
 *  under the bar on a leader: a slant from its segment's middle, just under the bar, to a point ex over the name, then
 *  straight down to it. The leaders keep the bar's order (ex rises with it), so no two slants cross; a leader's drop never
 *  comes within g of a name in a row it passes; names never come within g of each other, all inside 0…w. Every way of
 *  sharing the hanging names among the rows the card holds is tried; in each, the names go from the bar's right end
 *  leftwards, each drop as near its segment's middle as the names already placed allow. The fewest rows and shortest
 *  leaders win. → { rows, ok, labels: [{ L, lw, row, lead, cx, ex }] }: rows under the bar (0 when every name sits on its
 *  segment); ok is false when no sharing keeps the rule in rowsMax rows. */
export function placeLabels(segs, lw, w, geo, rowsMax = 3) {
  const n = segs.length, g = geo.g, E = 1e-6;
  if (!n) return { rows: 1, ok: true, labels: [] };
  const key = `${w}|${g}|${rowsMax}|${segs.map((s, i) => `${s.a.toFixed(2)},${s.b.toFixed(2)},${lw[i].toFixed(2)}`).join(';')}`;
  if (PLACED.has(key)) return PLACED.get(key);
  const cx = segs.map((s) => (s.a + s.b) / 2);
  const on = segs.map((s, i) => lw[i] <= s.b - s.a - 2 * g);
  const hang = segs.map((s, i) => i).filter((i) => !on[i]);
  const base = segs.map((s, i) => ({ L: cx[i] - lw[i] / 2, lw: lw[i], row: on[i] ? -1 : 0, lead: !on[i], cx: cx[i], ex: cx[i] }));
  // One sharing of the hanging names among rows (rowOf[k] for hang[k]): the names' places and its cost, or null.
  function tryRows(rowOf) {
    const out = base.map((l) => ({ ...l }));
    const boxes = [];
    const drops = [];
    let U = Infinity, cost = 0;
    for (let k = hang.length - 1; k >= 0; k--) {
      const i = hang[k], row = rowOf[k], m = Math.min(g, lw[i] / 2), hi = Math.min(w - m, U - 1);
      const boxOk = (L) => L >= -E && L + lw[i] <= w + E
        && boxes.every((o) => o.row !== row || L >= o.R + g - E || L + lw[i] <= o.L - g + E)
        && drops.every((d) => d.row <= row || d.ex <= L - g + E || d.ex >= L + lw[i] + g - E);
      const exOk = (ex) => ex >= m - E && ex <= hi + E && boxes.every((o) => o.row >= row || ex <= o.L - g + E || ex >= o.R + g - E);
      const exs = [cx[i], hi, m];
      for (const o of boxes) exs.push(o.row < row ? o.L - g : o.L - g - m, o.row < row ? o.R + g : o.R + g + m);
      for (const d of drops) if (d.row > row) exs.push(d.ex - g - m, d.ex + g + m);
      exs.sort((p, q) => Math.abs(p - cx[i]) - Math.abs(q - cx[i]) || q - p);
      let got = null;
      for (const ex of exs) {
        if (!exOk(ex)) continue;
        const lo = Math.max(0, ex - lw[i] + m), up = Math.min(w - lw[i], ex - m);
        if (lo > up + E) continue;
        const Ls = [Math.min(Math.max(ex - lw[i] / 2, lo), up), lo, up];
        for (const o of boxes) if (o.row === row) Ls.push(o.R + g, o.L - g - lw[i]);
        for (const d of drops) if (d.row > row) Ls.push(d.ex + g, d.ex - g - lw[i]);
        const L = Ls.filter((t) => t >= lo - E && t <= up + E).sort((p, q) => Math.abs(p + lw[i] / 2 - ex) - Math.abs(q + lw[i] / 2 - ex)).find(boxOk);
        if (L != null) { got = { L, ex, row }; break; }
      }
      if (!got) return null;
      Object.assign(out[i], got);
      boxes.push({ L: got.L, R: got.L + lw[i], row });
      drops.push({ ex: got.ex, row });
      U = got.ex;
      cost += Math.abs(got.ex - cx[i]) + 0.5 * Math.abs(got.L + lw[i] / 2 - got.ex);
    }
    return { out, cost };
  }
  let best = null;
  for (let R = 1; R <= rowsMax; R++) {
    const rowOf = new Array(hang.length).fill(0);
    for (let code = 0; code < R ** hang.length; code++) {
      for (let k = 0, c = code; k < hang.length; k++, c = Math.floor(c / R)) rowOf[k] = c % R;
      if (R > 1 && new Set(rowOf).size !== R) continue;
      const got = tryRows(rowOf);
      if (!got) continue;
      const cost = got.cost + 3 * geo.f * R;
      if (!best || cost < best.cost - E) best = { cost, rows: R, labels: got.out };
    }
  }
  let res;
  if (best) res = { rows: hang.length ? best.rows : 0, ok: true, labels: best.labels };
  else {
    // (Too narrow for any rule-keeping place: a row each for the hanging names, as near their segments as the card allows.)
    const labels = base.map((l) => ({ ...l }));
    hang.forEach((i, k) => { const L = Math.min(Math.max(0, cx[i] - lw[i] / 2), w - lw[i]); Object.assign(labels[i], { L, row: k, ex: Math.min(Math.max(cx[i], L), L + lw[i]) }); });
    res = { rows: hang.length, ok: false, labels };
  }
  if (PLACED.size > 200) PLACED.clear();
  PLACED.set(key, res);
  return res;
}
const PLACED = new Map();

/** The whole card's layout for parts at width w, height hh, font size f: the gutter at the left that holds the rows' names
 *  ("Healthy", "Now"; the bars run from it to the card's right edge), segments [{ id, name, pct, a, b }] in bar order, the
 *  names' places, the Healthy bar's segments (hParts: the healthy model's parts, or null before they arrive) and what each
 *  shows (healthyMode), and the top offset that centres it all in the card. measure(text, f, weight) → px. When the names
 *  cannot keep the label rule in the rows the card holds (a narrow card, a large text size), the smallest route joins
 *  Other, then the next, until they can (one named route at least): parts is what the bar then shows. */
export function flowLayout(parts, of, w, hh, f, measure, hParts = null) {
  let use = parts, lay = layOnce(use, of, w, hh, f, measure, hParts);
  while (!lay.ok && of !== 'inflow') {
    const routes = barOrder(use, of).filter((p) => p.id !== 'liver' && p.id !== 'other');
    if (routes.length < 2) break;
    const small = routes.at(-1), o = use.find((p) => p.id === 'other');
    use = [...use.filter((p) => p !== small && p !== o), { id: OTHER[0], name: OTHER[1], tone: OTHER[2], pct: (o?.pct || 0) + small.pct }];
    lay = layOnce(use, of, w, hh, f, measure, hParts);
  }
  return { ...lay, parts: use };
}
function layOnce(parts, of, w, hh, f, measure, hParts) {
  const geo = flowGeo(f), { bar } = flowView(parts, of), g = geo.g;
  const gut = gutterW(f, g, measure), bw = Math.max(1, w - gut);
  const spans = (list) => { let acc = 0; return list.map((p) => { const a = gut + (acc / 100) * bw; acc += p.pct; return { id: p.id, name: p.name, pct: p.pct, a, b: gut + (acc / 100) * bw }; }); };
  const segs = spans(bar), hsegs = hParts ? spans(healthyOrder(hParts, bar, of)) : [];
  const lw = segs.map((s) => Math.max(measure(s.name, f, 500), measure(`${s.pct}%`, f, 700)));
  const lab = placeLabels(segs, lw, w, geo, rowsFit(hh, geo));
  const hmode = hsegs.map((s) => healthyMode(measure(s.name, f, 500), measure(`${s.pct}%`, f, 700), s.b - s.a - 2 * g));
  return { geo, gut, segs, hsegs, hmode, ...lab, top: Math.max(0, (hh - flowHeight(lab.rows, geo)) / 2) };
}
/** The gutter the rows' names take at the bars' left: the wider name and a gap. */
export const gutterW = (f, g, measure) => Math.max(measure('Healthy', f, 600), measure('Now', f, 600)) + Math.max(g, 0.6 * f);

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
  const sizeNow = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? 12 / z : 0);
    return [Math.max(160, w || 420), Math.max(6 * f, el.clientHeight || 160), f];
  };
  const order = () => (of === 'inflow' ? INFLOW : ALL).map(([id]) => id);
  const info = (id) => ALL.concat(INFLOW).find(([k]) => k === id);
  // The layout the shares are heading for (computed once per goal and size: the name search is not per frame).
  function target() {
    const pk = (ps) => (ps || []).map((p) => `${p.id}:${p.pct}`).join(',');
    const [w, hh, f] = sizeNow(), key = `${of}|${Math.round(w)}|${Math.round(hh)}|${f}|${pk(goal)}|${pk(hGoal)}`;
    if (memo?.key === key) return memo;
    const lay = flowLayout(goal, of, w, hh, f, textW, hGoal), bw = Math.max(1, w - lay.gut);
    const hide = sameShares(goal, hGoal);
    const at = Object.fromEntries(lay.segs.map((s, i) => [s.id, [s, lay.labels[i]]]));
    // (With the Now bar gone, a Healthy segment too narrow for its name keeps the Now bar's name hanging under it, which
    // already says the percent: the bar itself then carries no text there.)
    const hat = Object.fromEntries(lay.hsegs.map((s, i) => [s.id, [s, hide && lay.hmode[i] === 'pct' ? 'none' : lay.hmode[i]]]));
    const want = Object.fromEntries(order().map((id) => {
      const [s, l] = at[id] || [], [h, hm] = hat[id] || [], o = shown?.[id], first = id === order()[0];
      // (The Healthy bar's segment: in the Now bar's order, eased like it; a part healthy lacks shrinks where it stood. hn,
      // hv: its name's and its percent's opacity on it.)
      const hw = h ? { hx: ((h.a - lay.gut) / bw) * 100, hpct: h.pct, hop: 1, hn: hm === 'both' ? 1 : 0, hv: hm === 'none' ? 0 : 1 }
        : { hx: o ? o.hx : (first ? 0 : 100), hpct: 0, hop: 0, hn: o?.hn ?? 0, hv: 0 };
      // (A part not on this slide shrinks where it stood; the bar's first part, the liver or the portal vein, stays at 0. dn:
      // 0 while its name sits on the segment, 1 once it hangs under the bar, so a name that moves glides between the two.)
      if (!s) return [id, { x: o ? o.x : (first ? 0 : 100), pct: 0, op: 0, lx: o?.lx ?? w / 2, ex: o?.ex ?? w / 2, row: o?.row ?? 0, ld: o?.ld ?? 0, dn: o?.dn ?? 0, ...hw }];
      return [id, { x: ((s.a - lay.gut) / bw) * 100, pct: s.pct, op: 1, lx: l.L + l.lw / 2, ex: l.ex, row: Math.max(0, l.row), ld: l.lead ? 1 : 0, dn: l.lead ? 1 : 0, ...hw }];
    }));
    want._ = { top: lay.top, nowOp: hide ? 0 : 1, x: 0, pct: 0, op: 0, lx: 0, ex: 0, row: 0, ld: 0, dn: 0, hx: 0, hpct: 0, hop: hGoal ? 1 : 0, hn: 0, hv: 0 };
    memo = { key, want, w, hh, f, geo: lay.geo, gut: lay.gut, hide };
    return memo;
  }
  function draw() {
    if (!goal || !shown || !memo) { el.replaceChildren(); return; }
    const { w, hh, f, geo, gut } = memo, g = geo.g, bw = Math.max(1, w - gut);
    size = `${Math.round(w)}x${Math.round(hh)}`;
    const top = shown._.top, hT = top, barT = top + geo.head, barB = barT + geo.barH;
    const X = (pc) => gut + (pc / 100) * bw, rx = Math.min(6, geo.barH / 2);
    const ids = order().filter((id) => shown[id] && shown[id].op > 0.01);
    const kids = [sv('defs', {},
      sv('clipPath', { id: clip }, sv('rect', { x: gut, y: barT, width: bw, height: geo.barH, rx })),
      sv('clipPath', { id: `${clip}-h` }, sv('rect', { x: gut, y: hT, width: bw, height: geo.barH, rx })))];
    // A bar's segments, each as wide as its share of the blood, a hairline of card between them.
    const segRects = (XK, P, O, y) => order().filter((id) => shown[id] && shown[id][O] > 0.01 && shown[id][P] > 0.05).map((id) => {
      const x = X(shown[id][XK]), wd = (shown[id][P] / 100) * bw, inner = x > gut + 0.5;
      return sv('rect', { class: 'pfl-seg', 'data-part': id, style: `--tone: var(${info(id)[2]}); opacity: ${shown[id][O].toFixed(3)}`,
        x: x + (inner ? 0.75 : 0), y, width: Math.max(0.5, wd - (inner ? 0.75 : 0) - (x + wd < w - 0.5 ? 0.75 : 0)), height: geo.barH });
    });
    const rowName = (y, t, cls) => sv('text', { class: `pfl-row ${cls}`, x: 0, y: y + geo.mid }, t);
    // The healthy model's bar on top, as tall as the Now bar, in the same order and colours, each segment's name and percent
    // on it where they fit (the percent alone where only it does), "Healthy" at its left.
    if (shown._.hop > 0.01) {
      const on = order().filter((id) => shown[id] && shown[id].hop > 0.01 && shown[id].hpct > 0.05);
      kids.push(sv('g', { class: 'pfl-healthy', style: `opacity: ${shown._.hop.toFixed(3)}` },
        rowName(hT, 'Healthy', 'h'),
        sv('g', { 'clip-path': `url(#${clip}-h)` }, segRects('hx', 'hpct', 'hop', hT)),
        on.map((id) => {
          const s = shown[id], cx = X(s.hx + s.hpct / 2), vy = hT + geo.mid + (geo.n2 - geo.mid) * s.hn;
          return sv('g', { class: 'pfl-lab', 'data-part': id, style: `opacity: ${s.hop.toFixed(3)}` },
            s.hn > 0.01 ? sv('text', { class: 'n', x: cx, y: hT + geo.n1, 'text-anchor': 'middle', style: `opacity: ${s.hn.toFixed(3)}` }, info(id)[1]) : null,
            s.hv > 0.01 ? sv('text', { class: 'v', x: cx, y: vy, 'text-anchor': 'middle', style: `opacity: ${s.hv.toFixed(3)}` }, `${Math.round(s.hpct)}%`) : null);
        })));
    }
    // The Now bar and its row name fade out when it reads the same as Healthy (the Healthy bar then stands alone, the Now
    // row's space kept so nothing moves) and fade back in place when a slider or button makes it differ.
    const nowOp = shown._.nowOp ?? 1, hB = hT + geo.barH, leadY = barB - (barB - hB) * (1 - nowOp);
    const nowKids = [];
    if (nowOp > 0.01) kids.push(sv('g', { class: 'pfl-now', style: `opacity: ${nowOp.toFixed(3)}` }, rowName(barT, 'Now', 'now'), sv('g', { 'clip-path': `url(#${clip})` }, segRects('x', 'pct', 'op', barT))));
    // Each segment's name, its percent under it: on the segment where they fit, else under the bar on a leader, a slant from
    // the segment's middle just under the bar, then straight down to the name.
    for (const id of ids) {
      const s = shown[id], name = info(id)[1], v = `${Math.round(s.pct)}%`;
      const lw = Math.max(textW(name, f, 500), textW(v, f, 700)), lx = Math.min(Math.max(s.lx, lw / 2), w - lw / 2), L = lx - lw / 2;
      const ty = barB + geo.band + s.row * geo.step, cx = X(s.x + s.pct / 2), m = Math.min(g, lw / 2);
      const ex = Math.min(Math.max(s.ex, L + m), L + lw - m), dn = s.dn, y = (a, b) => a + (b - a) * dn;
      // (A name on the Now bar fades with it; one hanging under it stays, its leader now rising from the Healthy bar.)
      const keep = 1 - (1 - nowOp) * (1 - s.dn);
      if (s.op * keep <= 0.01) continue;
      nowKids.push(sv('g', { class: 'pfl-lab', 'data-part': id, style: `opacity: ${(s.op * keep).toFixed(3)}` },
        s.ld > 0.01 ? sv('path', { class: 'pfl-lead', style: `opacity: ${s.ld.toFixed(3)}`, d: `M${cx.toFixed(1)} ${leadY.toFixed(1)}L${ex.toFixed(1)} ${(barB + geo.band - g).toFixed(1)}V${(ty - g).toFixed(1)}` }) : null,
        sv('text', { class: 'n', x: y(cx, lx), y: y(barT + geo.n1, ty + 0.95 * f), 'text-anchor': 'middle' }, name),
        sv('text', { class: 'v', x: y(cx, lx), y: y(barT + geo.n2, ty + 2.15 * f), 'text-anchor': 'middle' }, v)));
    }
    kids.push(...nowKids);
    const say = (ps) => barOrder(ps, of).map((p) => `${p.name} ${p.pct}%`).join(', ');
    const br = flowView(goal, of).bracket;
    el.replaceChildren(sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px`,
      'aria-label': `${of === 'inflow' ? 'The liver\'s inflow' : 'Where the portal blood goes'}, ${memo.hide ? `healthy, and now the same: ${say(goal)}` : `now: ${say(goal)}${br ? `; ${br[0]} ${br[1]}%` : ''}${hGoal ? `; healthy: ${say(hGoal)}` : ''}`}` }, kids));
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
    const done = Object.keys(want).every((id) => ['x', 'pct', 'op', 'ld', 'row', 'top', 'nowOp', 'dn', 'hx', 'hpct', 'hop', 'hn', 'hv'].every((key) => !(key in want[id]) || Math.abs(shown[id][key] - want[id][key]) < 0.01)
      && Math.abs(shown[id].lx - want[id].lx) < 0.2 && Math.abs(shown[id].ex - want[id].ex) < 0.2);
    if (done) shown = Object.fromEntries(Object.keys(want).map((id) => [id, { ...want[id] }]));
    draw();
    if (!done) raf = requestAnimationFrame(tick);
  }
  function aim(fp) {
    const p = flowParts(fp, of, params);
    if (!p) return;
    goal = p;
    healthyNow();
    if (!raf) raf = requestAnimationFrame(tick);
  }
  // The healthy model's parts (the presenter's healthy fingerprint, the one the profile's dashed line uses): it can arrive
  // after the first slide, so the card asks again for a few seconds; the Healthy bar fades in when it comes.
  function healthyNow() {
    const hp = flowParts(ctx0?.healthy?.(), of);
    clearTimeout(wait); wait = 0;
    if (hp) { hGoal = hp; return; }
    hGoal = null;
    let tries = 0;
    const again = () => { wait = 0; const h = flowParts(ctx0?.healthy?.(), of); if (h) { hGoal = h; if (!raf && goal) raf = requestAnimationFrame(tick); } else if (++tries < 40 && el.isConnected !== false) wait = setTimeout(again, 250); };
    wait = setTimeout(again, 250);
  }
  // (A new size lays the names out afresh and shows them there at once: the places are in pixels.)
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (shown && el.isConnected && size !== `${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`) { if (raf) cancelAnimationFrame(raf); shown = null; tick(); } }).observe(el);
  return {
    el,
    configure(t, ctx) {
      const of2 = t?.of === 'inflow' ? 'inflow' : 'portal';
      if (of2 !== of) { shown = null; memo = null; }   // (the other split: drawn afresh)
      of = of2; params = ctx?.params || null; ctx0 = ctx || null; el.dataset.of = of;
      if (ctx?.fp) aim(ctx.fp);
    },
    pin(fp) { if (el.isConnected && fp) aim(fp); },
    clear() {},
    dispose() { if (raf) cancelAnimationFrame(raf); raf = 0; clearTimeout(wait); wait = 0; },
  };
}
