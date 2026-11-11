// The heart's rate and output on the heart's own label (11 Nov 2026, Mohammad: "They should just be a label on the heart label, discrete and
// ok to hide if not important but can show if can fit with the label"). In the Anatomy a quiet suffix after the right atrium's value
// ("Right atrium 3.0  72 /min · 5.0 L/min"); in the Circuit a quiet line under the Heart zone title. Both in the label layer's one look
// (outlined text, no box, no leader), in the units' ink, smaller and lighter than the label's own value, live from the model's rate and output
// (f.metrics, the tiles' own readings) through the tiles' words (valueText).
// It is optional and never moves anything: the labels are placed as they are without it, and only then, at a solve, it is shown where it fits
// beside its label (in the view, off every vessel, label, leader, dot and card), else left off. Its runs are not part of the label's box (its
// w and h, its slot, its leader's aim), so it can tick, come or go without a label moving. The decision is the solve's (kept in the slots,
// HEART_KEY, so a carry, a dry solve and a value tick read the same one), with room to spare to come on and none to stay on (hysteresis).
import { valueText, widest } from './callout-math.js';
import { hits, within } from './label-place.js';
import { segHitsBox } from './seg-hits.js';

/** The slots' entry that holds which labels carry the reading: { on: Set of label keys }. */
export const HEART_KEY = '~heart';
/** The looks: on a station's line (after its value) and as a zone title's second line. */
export const HEART_LOOK = { node: { size: 10, weight: 500, cls: 'lb-unit' }, zone: { size: 9.5, weight: 500, cls: 'lb-zone' } };
const NODE_GAP = 6, ON_ROOM = 2, STAY_ROOM = 0;   // (px clear of everything it needs to come on, and to stay on: the vessels' own 1 besides)

const fpOf = (f) => ({ hr: f?.metrics?.hr, co: f?.metrics?.co });
/** The reading's runs for the frame f (or, wide, at its widest words: the room it is fitted in). Each is marked sfx (not the label's box). */
export function heartRuns(f, look, gap, wide = false) {
  const fp = fpOf(f), t = (k) => (wide ? widest(valueText(k, fp)) : valueText(k, fp));
  return [{ t: t('hr'), ...look, ...(gap != null ? { gap } : {}), sfx: true }, { t: '·', ...look, gap: 3, sfx: true }, { t: t('co'), ...look, gap: 3, sfx: true }];
}
/** What a screen reader hears of it. */
export function heartWords(f) {
  const fp = fpOf(f), say = (t) => t.replace(' L/min', ' litres a minute').replace(' /min', ' a minute');
  return `heart rate ${say(valueText('hr', fp))}, cardiac output ${say(valueText('co', fp))}`;
}
const zoneOf = (it) => it.key.startsWith('z:');
/** The label with the reading on it (lines and words; its box, w and h, untouched). Again on the same label it replaces the one it had. */
export function addHeart(it, f) {
  const z = zoneOf(it);
  it.lab0 ??= it.label;
  if (z) Object.assign(it, { lines: [it.lines[0], heartRuns(f, HEART_LOOK.zone)], src: ['hz', it.key] });   // (its words tick through refreshValues: stage-labels.js)
  else { const n = it.lines.length - 1; it.lines = [...it.lines.slice(0, n), [...it.lines[n].filter((r) => !r.sfx), ...heartRuns(f, HEART_LOOK.node, NODE_GAP)]]; }
  const w = heartWords(f);
  it.label = z ? `${it.lab0}. ${w[0].toUpperCase()}${w.slice(1)}` : `${it.lab0}, ${w}`;
  return it;
}
/** Where the reading would stand at its widest, on the screen: after the last line's words (a station's, set from its start), or under the
 *  title (a zone's, centred on it; a turned title's to its right). null for a label it cannot go on. */
export function heartStrip(it, f, lineW, LINE_H) {
  if (zoneOf(it)) {
    const line = heartRuns(f, HEART_LOOK.zone, null, true), lw = lineW(line), lx0 = (it.w - lw) / 2, ly0 = it.h, ly1 = it.h + LINE_H(line);
    return it.rot ? { x0: it.x + ly0, y0: it.y + it.w - lx0 - lw, x1: it.x + ly1, y1: it.y + it.w - lx0 } : { x0: it.x + lx0, y0: it.y + ly0, x1: it.x + lx0 + lw, y1: it.y + ly1 };
  }
  if (it.align !== 'start' || it.short || it.abbr || it.rot) return null;
  const n = it.lines.length - 1, line = it.lines[n];
  if (!line.some((r) => r.cls === 'lb-val')) return null;   // (a station showing no value: no reading after it)
  let y = it.y;
  for (let i = 0; i < n; i++) y += LINE_H(it.lines[i]);
  const x0 = it.x + lineW(line), x1 = it.x + lineW([...line, ...heartRuns(f, HEART_LOOK.node, NODE_GAP, true)]);
  return { x0, y0: y, x1, y1: y + LINE_H(line) };
}
/**
 * The pass, after every label is placed (stage-label-solve.js). At a solve it decides and writes the decision into the new slots (sol); in a
 * carried layout it puts the reading back on the label the last solve gave it to. c: { f, solve, circuit, on (the slide carries the reading:
 * heart-reading.js heartReadingOn), sol, was (the slots before this solve), lineW, LINE_H, lineHits (the vessels as drawn, or null),
 * obstacles (cards), view(it), boxOf, rectOf, leaderEnd }.
 */
export function heartPass(out, c) {
  const want = c.on ? out.find((o) => !o.hide && !o.live && o.key === (c.circuit ? 'z:Heart' : 'n:RA')) : null;
  if (!c.solve) { if (want && c.sol.get(HEART_KEY)?.on.has(want.key)) addHeart(want, c.f); return; }
  const on = new Set();
  c.sol.set(HEART_KEY, { on });
  const s = want && heartStrip(want, c.f, c.lineW, c.LINE_H);
  if (!s) return;
  const m = c.was?.get(HEART_KEY)?.on.has(want.key) ? STAY_ROOM : ON_ROOM, g = { x0: s.x0 - m, y0: s.y0 - m, x1: s.x1 + m, y1: s.y1 + m };
  if (!within(g, c.view(want)) || (c.lineHits && c.lineHits(g, 1) > 0) || c.obstacles.some((o) => !o.zone && hits(g, o))) return;
  const lead = (o) => { const e = c.leaderEnd(c.rectOf(o), o.ax, o.ay); return { x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }; };
  for (const o of out) {
    if (o.hide || o.live) continue;
    if (o.leader && Number.isFinite(o.ax) && segHitsBox(lead(o), g, 1)) return;   // (its own leader too)
    if (o.key.startsWith('n:') && Number.isFinite(o.ax) && hits(g, { x0: o.ax - 4, y0: o.ay - 4, x1: o.ax + 4, y1: o.ay + 4 })) return;   // (a station's dot, its own too)
    if (o !== want && hits(g, c.boxOf(o))) return;
  }
  on.add(want.key);
  addHeart(want, c.f);
}
