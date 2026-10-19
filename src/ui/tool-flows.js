// Where the portal blood goes (deck visuals V14, package B): tool { kind: 'flows' } draws one headline, "Liver 25% · Bypassing
// the liver 75%", and under it one short bar per route the bypassing blood takes (the esophageal varices, a gastrorenal or
// splenorenal shunt, the paraumbilical vein, a stent…), largest first, each bar as long as its share of all the portal blood
// with its name and percent on it: no colour key (Mohammad's pick, 19 Oct: "Headline + bars"). Shares and places ease as they
// move. tool: { kind: 'flows', of: 'inflow' } splits the liver's own inflow into portal and arterial blood instead.
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

/** What the card shows for parts (flowParts): the headline's two halves [name, pct], and the bars, largest first (the routes,
 *  or for the inflow both its parts). */
export function flowView(parts, of = 'portal') {
  // (The inflow's headline names both its parts, one at 0 % too, as after a TIPS takes the portal blood away.)
  if (of === 'inflow') return { head: INFLOW.map(([id, name]) => [name, parts.find((p) => p.id === id)?.pct ?? 0]), bars: parts.slice().sort((a, b) => b.pct - a.pct) };
  const liver = parts.find((p) => p.id === 'liver')?.pct ?? 0;
  return { head: [['Liver', liver], ['Bypassing the liver', 100 - liver]], bars: parts.filter((p) => p.id !== 'liver').sort((a, b) => b.pct - a.pct) };
}
export const BAR_ROWS = MAX_ROUTES + 1;   // (the card keeps room for every bar it can show, four routes and Other, so it never resizes)

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
    const tone = (id) => ALL.concat(INFLOW).find(([k]) => k === id)[2];
    const name = (id) => ALL.concat(INFLOW).find(([k]) => k === id)[1];
    // The headline: on one line where it fits, else its two halves on two.
    const pct = (id) => Math.round(shown[id]?.pct || 0);
    const head = of === 'inflow' ? INFLOW.map(([id, n]) => [n, pct(id)]) : [['Liver', pct('liver')], ['Bypassing the liver', 100 - pct('liver')]];
    const half = ([n, v]) => textW(`${n} `, f, 500) + textW(`${v}%`, f, 700), sep = textW(' · ', f, 500);
    const one = half(head[0]) + sep + half(head[1]) <= w, lh = 1.45 * f, headH = (one ? 1 : 2) * lh + 0.5 * f;
    // The bars: a row each for as many as the card can show, each row the same height whatever is in it.
    const rows = of === 'inflow' ? 2 : BAR_ROWS, rowH = Math.min(2.1 * f, (hh - headH) / rows), barH = Math.max(1.3 * f, rowH - 0.4 * f);
    const bars = Object.keys(shown).filter((id) => (of === 'inflow' || id !== 'liver') && shown[id].op > 0.01);
    const svg = sv('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: 'img', style: `font-size: ${f.toFixed(2)}px`,
      'aria-label': `${of === 'inflow' ? 'The liver\'s inflow' : 'Where the portal blood goes'}: ${head.map(([n, v]) => `${n} ${v}%`).join(', ')}${of === 'inflow' ? '' : `; ${goal.filter((p) => p.id !== 'liver').map((p) => `${p.name} ${p.pct}%`).join(', ')}`}` },
      sv('text', { class: 'pfl-head', x: 0, y: 1.05 * f }, ...head.flatMap(([n, v], k) => [
        k ? (one ? sv('tspan', { class: 'sep' }, ' · ') : null) : null,
        sv('tspan', { class: 'n', ...(k && !one ? { x: 0, dy: lh } : {}), 'data-part': k ? (of === 'inflow' ? 'artery' : 'bypass') : (of === 'inflow' ? 'portal' : 'liver') }, `${n} `),
        sv('tspan', { class: 'v' }, `${v}%`)])),
      bars.map((id) => {
        const y = headH + shown[id].pos * rowH, len = Math.max(3, w * shown[id].pct / 100), op = shown[id].op;
        return sv('g', { class: 'pfl-bar', 'data-part': id, style: `--tone: var(${tone(id)}); opacity: ${op.toFixed(3)}` },
          sv('rect', { class: 'pfl-track', x: 0, y, width: w, height: barH, rx: Math.min(6, barH / 2) }),
          sv('rect', { class: 'pfl-fill', x: 0, y, width: len, height: barH, rx: Math.min(6, barH / 2) }),
          sv('text', { x: 0.6 * f, y: y + barH / 2 + 0.36 * f }, `${name(id)} `, sv('tspan', { class: 'v' }, `${Math.round(shown[id].pct)}%`)));
      }));
    el.replaceChildren(svg);
  }
  function tick() {
    raf = 0;
    if (!goal) return;
    // (Each part's share and its row ease together, so a bar that overtakes another glides past it.)
    const { bars } = flowView(goal, of), pos = Object.fromEntries(bars.map((p, i) => [p.id, i]));
    const want = Object.fromEntries(order().map((id) => { const g = goal.find((p) => p.id === id); return [id, { pct: g?.pct || 0, pos: pos[id] ?? shown?.[id]?.pos ?? BAR_ROWS, op: g ? 1 : 0 }]; }));
    const k = reduceMQ.matches || !shown ? 1 : 0.2, mix = (a, b) => a + (b - a) * k;
    // (A bar that goes fades out faster than the others move, so none passes over it; one that comes fades in where it will stay.)
    const fade = (a, b) => (k === 1 ? b : a + (b - a) * (b < a ? 0.4 : 0.2));
    shown = Object.fromEntries(Object.keys(want).map((id) => { const s0 = shown?.[id] || { pct: 0, pos: want[id].pos, op: 0 }; return [id, { pct: mix(s0.pct, want[id].pct), pos: mix(s0.pos, want[id].pos), op: fade(s0.op, want[id].op) }]; }));
    const done = Object.keys(want).every((id) => Math.abs(shown[id].pct - want[id].pct) < 0.05 && Math.abs(shown[id].pos - want[id].pos) < 0.01 && Math.abs(shown[id].op - want[id].op) < 0.01);
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
