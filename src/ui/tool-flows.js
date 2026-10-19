// Where the portal blood goes (deck visuals V14, package B): tool { kind: 'flows' } draws one flat bar across the card,
// split by where the portal blood leaves the gut: through the liver, the esophageal varices, a gastrorenal or splenorenal
// shunt, the paraumbilical vein, a stent… each part in its colour and easing as the shares move. tool: { kind: 'flows',
// of: 'inflow' } splits the liver's own inflow into portal and arterial blood instead.
// The parts are the slide's fingerprint's flows (at.Q), counted as the shunt fraction is (engine/metrics.js), so the liver's
// part is always 100 less the slide's Shunted tile (table-marks.js portalSplit). The cavernoma returns blood to the liver,
// so it counts as liver.

import { EDGES, PORTOSYSTEMIC_EDGES, SPLANCHNIC_ARTERIES } from '../engine/topology.js?v=4044766e96';
import { portalSplit } from './table-marks.js?v=810c0a1575';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const STENTS = new Set(['TIPS', 'DIPS']);
// Where the shunted blood goes: part id → [name, colour token, vessel ids]. In this order on the bar, after the liver.
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
  const order = ROUTES.filter((r) => named.includes(r));   // (the bar keeps one order of routes from slide to slide)
  const pct = wholeShares([...order.map(([k]) => by[k]), rest], shunt);
  const parts = [{ id: LIVER[0], name: LIVER[1], tone: LIVER[2], pct: liver }, ...order.map(([id, name, tone], i) => ({ id, name, tone, pct: pct[i] }))];
  if (pct.at(-1) > 0) parts.push({ id: OTHER[0], name: OTHER[1], tone: OTHER[2], pct: pct.at(-1) });
  // (A shunt fraction with no forward route left, a rounding the routes cannot carry, still sums: it goes to Other.)
  const sum = parts.reduce((s, p) => s + p.pct, 0);
  if (sum < 100) { const o = parts.find((p) => p.id === 'other'); if (o) o.pct += 100 - sum; else parts.push({ id: OTHER[0], name: OTHER[1], tone: OTHER[2], pct: 100 - sum }); }
  return parts.filter((p) => p.pct > 0);
}

/** The key's layout: columns as wide as the widest entry allows in w px (at most 3), rows enough for six parts.
 *  tw: an entry's width. → { cols, rows, colW } */
export function keyGrid(w, entries, tw) {
  const widest = Math.max(...entries.map(tw)) + 18;
  const cols = Math.max(1, Math.min(3, Math.floor(w / widest)));
  return { cols, rows: Math.ceil((MAX_ROUTES + 2) / cols), colW: w / cols };
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
// Every part a bar can show, in its one order, so a part keeps its place as the shares move.
const ALL = [LIVER, ...ROUTES, OTHER];

export function createFlowsTool() {
  const el = document.createElement('div');
  el.className = 'pz-flows';
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  let of = 'portal', params = null, goal = null, shown = null, raf = 0, size = '';
  const sizeNow = () => {
    const w = el.clientWidth, z = w ? el.getBoundingClientRect().width / w : 1;
    const f = Math.max(parseFloat(getComputedStyle(el).fontSize) || 12, z > 0.2 && z < 1 ? 12 / z : 0);
    return [Math.max(200, w || 420), Math.max(6 * f, el.clientHeight || 140), f];
  };
  const order = () => (of === 'inflow' ? INFLOW : ALL).map(([id]) => id);
  function draw() {
    if (!goal || !shown) { el.replaceChildren(); return; }
    const [w, hh, f] = sizeNow();
    size = `${Math.round(w)}x${Math.round(hh)}`;
    const ids = order(), parts = ids.map((id) => goal.find((p) => p.id === id)).filter(Boolean);
    const entry = (p) => `${p.name} ${p.pct}%`;
    const grid = keyGrid(w, parts.map(entry), (t) => textW(t, f));
    const rowH = 1.55 * f, keyH = grid.rows * rowH, barH = Math.max(1.4 * f, Math.min(3 * f, hh - keyH - 0.9 * f));
    const y0 = Math.max(0, (hh - barH - 0.9 * f - keyH) / 2);
    let x = 0;
    const segs = ids.map((id) => { const k = shown[id] || 0, wd = (w * k) / 100, r = [id, x, wd]; x += wd; return r; }).filter(([, , wd]) => wd > 0.25);
    const tone = (id) => ALL.concat(INFLOW).find(([k]) => k === id)[2];
    const clip = `pzfc-${Math.random().toString(36).slice(2, 8)}`;
    const svg = sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px`,
      'aria-label': `${of === 'inflow' ? 'The liver\'s inflow' : 'Where the portal blood goes'}: ${parts.map(entry).join(', ')}` },
      sv('defs', {}, sv('clipPath', { id: clip }, sv('rect', { x: 0, y: y0, width: w, height: barH, rx: Math.min(8, barH / 2) }))),
      sv('g', { 'clip-path': `url(#${clip})` }, sv('rect', { class: 'pfl-bg', x: 0, y: y0, width: w, height: barH }),
        segs.map(([id, sx, wd], j) => sv('rect', { class: 'pfl-seg', 'data-part': id, x: sx, y: y0, width: Math.max(0, wd - (j < segs.length - 1 ? 2 : 0)), height: barH, style: `fill: var(${tone(id)})` }))),
      parts.map((p, j) => {
        const cx = (j % grid.cols) * grid.colW, cy = y0 + barH + 0.9 * f + Math.floor(j / grid.cols) * rowH + 0.75 * f;
        return sv('g', { class: 'pfl-key', 'data-part': p.id }, sv('rect', { x: cx, y: cy - 0.42 * f, width: 0.85 * f, height: 0.85 * f, rx: 2, style: `fill: var(${p.tone})` }),
          sv('text', { x: cx + 0.85 * f + 6, y: cy + 0.36 * f }, `${p.name} `, sv('tspan', { class: 'v' }, `${p.pct}%`)));
      }));
    el.replaceChildren(svg);
  }
  function tick() {
    raf = 0;
    if (!goal) return;
    const want = Object.fromEntries(order().map((id) => [id, goal.find((p) => p.id === id)?.pct || 0]));
    const k = reduceMQ.matches || !shown ? 1 : 0.2;
    shown = Object.fromEntries(Object.keys(want).map((id) => [id, (shown?.[id] ?? 0) + (want[id] - (shown?.[id] ?? 0)) * k]));
    const done = Object.keys(want).every((id) => Math.abs(shown[id] - want[id]) < 0.05);
    if (done) shown = want;
    draw();
    if (!done) raf = requestAnimationFrame(tick);
  }
  function aim(fp) {
    const p = flowParts(fp, of, params);
    if (!p) return;
    goal = p;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (shown && el.isConnected && size !== `${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`) draw(); }).observe(el);
  return {
    el,
    configure(t, ctx) {
      const of2 = t?.of === 'inflow' ? 'inflow' : 'portal';
      if (of2 !== of) shown = null;   // (the other split: drawn afresh)
      of = of2; params = ctx?.params || null; el.dataset.of = of;
      if (ctx?.fp) aim(ctx.fp);
    },
    pin(fp) { if (el.isConnected && fp) aim(fp); },
    clear() {},
    dispose() { if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}
