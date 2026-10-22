// Deck visuals, package F (figure callouts): the sums behind the slide fields, kept apart from the stage and the presenter so
// unit tests can load them (review/deck-visuals-recs.md §9). Nothing here touches the page.
import { TILE, rateShown, tileShown, tipsGoal } from './table-marks.js?v=8d52d1e713';
import { plateletText } from './glue.js?v=5a0f63226b';
import { ORGANS, NODE_POS, SPLEEN_CENTER, CIRCUIT_ZONES } from './anatomy.js?v=1f28084c15';

// (util.js fmt, which needs the page to load: a value to d decimals, with a true minus and never "−0".)
const fmt = (v, d = 1) => { if (v == null || !Number.isFinite(v)) return '—'; const t = v.toFixed(d); return /^-0(\.0+)?$/.test(t) ? t.slice(1) : t.replace('-', '−'); };

// ── V8: live numbers in a mark's words ──
// "Varix {varix}": a brace names a tile's reading (table-marks.js TILE). A label with no known brace is not a live one, and is
// left exactly as written (no built-in mark has a brace).
const TOKEN = /\{(\w+)\}/g;
/** A label's words cut into runs at its live values: [{ t, sp }] and [{ key, sp }] (sp: a space before it), or null when the
 *  label names no tile's reading. */
export function parseLive(label) {
  if (typeof label !== 'string' || !/\{\w+\}/.test(label)) return null;
  const runs = [];
  let at = 0, live = false, gap = false;   // (gap: the words so far end in a space)
  const text = (t) => { const w = t.trim(); if (w) runs.push({ t: w, sp: runs.length > 0 && (gap || /^\s/.test(t)) }); gap = /\s$/.test(t) || (gap && !w); };
  for (const m of label.matchAll(TOKEN)) {
    text(label.slice(at, m.index));
    if (TILE[m[1]]) { runs.push({ key: m[1], sp: runs.length > 0 && gap }); gap = false; live = true; }
    else text(m[0]);
    at = m.index + m[0].length;
  }
  text(label.slice(at));
  return live ? runs : null;
}
/** A reading as its tile prints it, in running text (to its tile's decimals: pressures to one), or "…" while it is unknown. */
export function valueText(k, fp) {
  const T = TILE[k], v = fp?.[k];
  if (!T || v == null || !Number.isFinite(v)) return '…';
  if (k === 'plt') return plateletText(v);
  return `${fmt(v * (T.x || 1), T.d ?? 1)}${T.u === '%' ? '%' : T.u ? ` ${T.u}` : ''}`;
}
// A reading's rating colour, as its tile's bar shows it (and the line's pill: presenter valTone): green, amber or red; after TIPS
// the PPG is read against its target. A reading its tile does not rate has none.
const TONE = { ok: '--ok', mid: '--caution', hi: '--danger' };
export function valueTone(k, fp, tips = false) {
  if (fp?.[k] == null) return null;
  const r = tips && k === 'ppg' ? tipsGoal(tileShown(k, fp[k]))[0] : rateShown(k, fp)[0];
  return TONE[r] || null;
}
/** The runs with their values filled in for fp: [{ t, sp, tone? }] (tone only on a value: its rating colour, or null). */
export function liveRuns(runs, fp, tips = false) {
  return runs.map((r) => (r.key ? { t: valueText(r.key, fp), sp: r.sp, tone: valueTone(r.key, fp, tips) } : { t: r.t, sp: r.sp }));
}
/** The widest a value's words can come to as the model moves: each digit an 8, and a single digit before the point given a
 *  second, so a callout keeps room for its widest value and never changes size as its number ticks ("9.8 cm" to "10.2 cm").
 *  (The stage keeps the widest it has drawn, too: a reading past this still never makes the pill shrink back.) */
export const widest = (t) => (t === '…' ? '88.8' : t.replace(/\d+/, (n) => '8'.repeat(Math.max(2, n.length))).replace(/\d/g, '8'));
export const widestRuns = (runs) => runs.map((r) => (r.tone !== undefined ? { ...r, t: widest(r.t) } : r));
/** The label as plain words (what a screen reader hears, and the label the presenter stores). */
export const runsText = (runs) => runs.map((r, i) => (i && r.sp ? ' ' : '') + r.t).join('');

// ── V8: callouts on organs ──
// Where a mark on an organ points: inside the organ (a closed outline: the middle of its box; the bowel, colon and duodenum are
// drawn as bands, so the middle of the band's own course), and how far the organ reaches round that point (world units), so
// its pill can stand off the organ rather than on it. The spleen's grows with it about its centre (stage.js updateOrgans).
const pathPts = (d) => { const n = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number), out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };
export const ORGAN_ANCHOR = (() => {
  const out = {};
  for (const o of ORGANS) {
    if (typeof o.d !== 'string') continue;
    const pts = pathPts(o.d).filter(([, y]) => y > -40);   // (the esophagus runs up out of the picture: its seen part)
    if (!pts.length) continue;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const at = o.band ? pts[Math.floor(pts.length / 4)] : o.id === 'spleen' ? SPLEEN_CENTER : [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
    out[o.id] = { at, half: o.band ? [16, 16] : [(box[2] - box[0]) / 2, (box[3] - box[1]) / 2] };
  }
  // (The ascites pools low in the belly, under the bowel.)
  out.ascites = { at: [700, 880], half: [60, 30] };
  out.kidney = out['kidney-l'];
  return out;
})();
// (The organs a mark may name: the outlined organs, the kidney under its target's name, and the ascites.)
export const ORGAN_MARKS = ['liver', 'spleen', 'heart', 'stomach', 'esophagus', 'bowel', 'colon', 'duodenum', 'kidney', 'kidney-l', 'ascites'];
/** An organ's anchor at the spleen's drawn scale (the spleen grows about its centre; nothing else changes size here). */
export function organAnchor(id, spleenScale = 1) {
  const a = ORGAN_ANCHOR[id];
  if (!a) return null;
  return id === 'spleen' ? { at: a.at, half: [a.half[0] * spleenScale, a.half[1] * spleenScale] } : a;
}

// ── A clot mark that follows the clot ──
// mark: { edges: ['PV_TRUNK'], clot: true } names the clot in its first vessel as the model has it, so a what-if slider that grows
// or clears it changes the words. The cut-off is the cross-section card's own rounding (tool-lumen.js): "100 % occluded" reads
// "Occlusive clot", anything above "0 %" "Nonocclusive clot", and "0 %" no mark at all.
/** The words for a clot that fills v (0..1) of its vessel, or null when there is none to point at. */
export function clotWords(v) {
  const n = Math.round(Math.min(1, Math.max(0, +v || 0)) * 100);
  return n <= 0 ? null : n >= 100 ? 'Occlusive clot' : 'Nonocclusive clot';
}

// ── V9: calipers ──
// The spleen's long axis at its normal size (anatomy.js ORGANS: its top and bottom), measured as the model's spleen length,
// and scaled about SPLEEN_CENTER as the figure draws the organ.
export const SPLEEN_AXIS = [[1030, 268], [1040, 460]];
export function spleenCaliper(scale = 1) {
  const [cx, cy] = SPLEEN_CENTER;
  return SPLEEN_AXIS.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]);
}
/** A caliper across a vessel at the point (x, y) where it runs along (tx, ty): from wall to wall, `half` either side. */
export function acrossVessel(x, y, tx, ty, half) {
  const n = Math.hypot(tx, ty) || 1, nx = -ty / n, ny = tx / n;
  return [[x - nx * half, y - ny * half], [x + nx * half, y + ny * half]];
}
// What a caliper measures: 'spleen' its length; 'varix' (or the esophageal varices' own vessels) the varix's diameter, drawn
// across the varices' vessel; any other vessel its diameter, a stent's as set (whole millimetres, as stents are sold).
export const VARIX_EDGE = 'C1a';
export function caliperOf(id) {
  if (id === 'spleen') return { id, organ: 'spleen', key: 'spleen' };
  if (id === 'varix' || id === 'C1a' || id === 'C1b') return { id, edge: id === 'varix' ? VARIX_EDGE : id, key: 'varix' };
  return { id, edge: id };
}
/** A caliper's reading for fp (the slide's numbers), its params and the vessel's index in fp.at (ei): "14.8 cm", "8 mm". */
export function caliperText(c, fp, params, ei) {
  if (c.key) return valueText(c.key, fp);
  const stent = c.edge === 'TIPS' ? params?.tips : c.edge === 'DIPS' ? params?.dips : null;
  if (stent) return stent.on && Number.isFinite(stent.d) ? `${fmt(stent.d, Number.isInteger(stent.d) ? 0 : 1)} mm` : '…';
  const d = ei >= 0 ? fp?.at?.D?.[ei] : null;
  return Number.isFinite(d) && d > 0 ? `${fmt(d, 1)} mm` : '…';
}

// ── V10: numbered steps ──
/** A glowSeq slide's steps, one for each entry of its glow, in order: { n, at, ids, organ }. The presenter lights entry i at
 *  i × glowSeq ms; a vessel id or '@set' (already expanded) gives its own vessels, an organ its organ, and a target key (which only
 *  the presenter can read) null: the stage then takes the vessels lit at that moment. A list of vessels is one step, a group: its number
 *  takes a leader to each of them. */
export function stepPlan(glow, seq, isVessel, isOrgan) {
  return (glow || []).map((g, i) => {
    const ids = (Array.isArray(g) ? g : [g]).map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
    const vessels = ids.every(isVessel) && ids.length ? ids : null;
    return { n: i + 1, at: i * seq, ids: vessels, organ: ids.length === 1 && isOrgan(ids[0]) ? ids[0] : null, ...(Array.isArray(g) && vessels?.length > 1 ? { group: true } : {}) };
  });
}
/** Each step's vessels as the figure lit them (glow: [{ id, at }]): its own where it names them, else the ones lit at its moment
 *  (at 0 ms the slide's terms light too, and the glow's first entry is added after them: the last of those). */
export function stepGroups(glow, plan) {
  const at = new Map();
  for (const g of glow || []) if (g?.id) (at.get(+g.at || 0) || at.set(+g.at || 0, []).get(+g.at || 0)).push(g.id);
  return (plan || []).map((p) => {
    if (p.organ) return { ...p, ids: [] };
    const lit = at.get(p.at) || [];
    const ids = p.ids ? p.ids.filter((id) => lit.includes(id)) : p.at ? lit : lit.slice(-1);
    return { ...p, ids };
  }).filter((p) => p.organ || p.ids.length);
}

// ── V25: the circuit's span brackets and lit zone ──
// The zones by name (anatomy.js CIRCUIT_ZONES, left to right).
export const ZONES = { splanchnic: 0, portal: 1, liver: 2, hepatic: 3, heart: 4 };
export const zoneIndex = (z) => (typeof z === 'number' ? (z >= 0 && z < CIRCUIT_ZONES.length ? z | 0 : -1) : ZONES[z] ?? -1);
/** A zone's band in circuit units [x0, x1]. */
export const zoneBand = (i) => (CIRCUIT_ZONES[i] ? [CIRCUIT_ZONES[i][1], CIRCUIT_ZONES[i][2]] : null);
// The bracket runs under the circuit: below its stations (the lowest at 690) and its collateral routes (down to about 725),
// under the zone bands (to 730), inside the circuit's view (to 760).
// The lanes' captions sit under the lowest lane, in screen pixels: the bracket keeps 24 px below that lane, so a caption fits
// between them at any zoom (a phone's turned circuit is drawn small, so the gap is wider in circuit units there).
export const SPAN_Y = 742, SPAN_TICK = 10, LANE_LOW = 725, SPAN_ROOM = 24;
/** The bracket's height on the circuit at k screen pixels per circuit unit. */
export const spanY = (k = 1) => Math.max(SPAN_Y, LANE_LOW + SPAN_ROOM / (k > 0 ? k : 1));
/** A span between two stations, in circuit units { x0, x1, y }, or null when either is not a station of the circuit. */
export function spanOf(from, to, k = 1) {
  const a = NODE_POS[from]?.[1], b = NODE_POS[to]?.[1];
  if (!a || !b || a[0] === b[0]) return null;
  return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y: spanY(k) };
}
export const spanPath = (sp) => `M${sp.x0} ${sp.y - SPAN_TICK}V${sp.y}H${sp.x1}V${sp.y - SPAN_TICK}`;

// ── Where a reading's pill may stand (stage.js placeMulti: edge, avoid) ──
/** Is the box r at least `edge` px inside the view V? */
export const insideBy = (r, V, edge = 0) => r.x0 >= V.x0 + edge && r.y0 >= V.y0 + edge && r.x1 <= V.x1 - edge && r.y1 <= V.y1 - edge;
/** Does the box r keep `pad` px clear of every box in `boxes` (a drawn organ, a line's boxes)? */
export const clearOf = (r, boxes, pad = 0) => !(boxes || []).some((o) => r.x0 < o.x1 + pad && r.x1 > o.x0 - pad && r.y0 < o.y1 + pad && r.y1 > o.y0 - pad);
const RING = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
/** A caliper reading's directions from the line's middle (screen px, a → b): square to the line on either side first, then round. */
export function besideLine(a, b) {
  const o = (Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) / (Math.PI / 4)) + 2 + 8) % 8;
  return [0, 4, 1, 5, -1, 3, 2, 6].map((d) => RING[(o + d + 8) % 8]);
}
