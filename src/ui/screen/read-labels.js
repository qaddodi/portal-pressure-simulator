// The labels part of the screen report (pps.screen(), screen-report-recs.md section 1): each label the figure shows, where, how visible, what it sits
// under or over. No pixels, no layout read here: it is a pure function of records the label painters already keep (sources.js collects them):
//   laid     stage.labelLaid()     the layout the labels were laid out in (stage px): key, words, box, anchor, leader, on a vessel, hidden
//   drawn    stage.labelSnapshot() what label-gl's last frame drew (its alpha and box), when the GPU draws the labels
//   classes  the label groups' state classes (unlit, spot-dim, ring ...), no layout read
//   cards    the open cards' boxes in stage px (gallery readBoxes, moved to the stage's corner)
// THE ONE RULE (recs section 1): every judgement here is the painter's own function, never a second copy. Overlap, containment and "needs a leader" are
// label-place.js's `hits`, `overlap`, `within`, `boxGap` and `needsLeader` (the functions the solver places by); the dim alpha is the one token
// --label-dim (tokens.css). tests/screen-readers.test.js checks that this file imports them and defines none of them.
import { boxGap, hits, needsLeader, overlap, within } from '../label-place.js';
import { DIM_ALPHA } from '../label-explain.js';
import { CARD_KINDS } from './util.js';

/** The alpha a label the slide or the explainer does not light steps back to: label-explain.js's DIM_ALPHA, which is the token --label-dim (styles/tokens.css; tests/screen-readers.test.js ties the three). Not a second copy. */
export const LABEL_DIM = DIM_ALPHA;
/** What each card root is called in words: util.js's one table. */
export const CARD_NAMES = CARD_KINDS;

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const rect = (b) => ({ x0: b[0], y0: b[1], x1: b[2], y1: b[3] });
const area = (q) => Math.max(0, q.x1 - q.x0) * Math.max(0, q.y1 - q.y0);

/** A label's state in words: hidden (about 0), dim (--label-dim: a slide or the explainer stepped it back), shown (1), or fading (any alpha between: a fade is running). */
export function stateOf(alpha, hidden) {
  if (hidden || alpha <= 0.02) return 'hidden';
  if (Math.abs(alpha - LABEL_DIM) <= 0.02) return 'dim';
  return alpha >= 0.98 ? 'shown' : 'fading';
}

/**
 * src: { stage: { w, h }, laid: [{ key, text, box: [x0, y0, x1, y1], ax, ay, leader, onVessel, hide }], drawn: [{ key, x, y, w, h, a, clipped, pin }] | null (stage px),
 *        classes: { key: [class, ...] } | null, cards: { selector: [l, t, r, b] } (stage px), carry: { riding, job, laid, stale } | null, marks: number }
 * Returns plain JSON, rounded so two runs of one state match: { stage, settled, count, shown, dim, hidden, items: [...], cards }.
 */
export function readLabels(src) {
  const W = src.stage?.w ?? 0, H = src.stage?.h ?? 0, S = { x0: 0, y0: 0, x1: W, y1: H };
  const drawn = new Map((src.drawn || []).map((d) => [d.key, d]));
  const cards = Object.entries(src.cards || {}).map(([sel, b]) => ({ sel, name: CARD_NAMES[sel] || sel, r: rect(b) }));
  const items = [];
  for (const it of src.laid || []) {
    if (!it.box) continue;
    const box = it.box.map(r1), q = rect(box), d = drawn.get(it.key), cls = src.classes?.[it.key] || [];
    const dimmed = cls.includes('unlit') || cls.includes('spot-dim');
    // (The alpha: what the GPU drew when it draws the label, else the page's classes say it: hidden 0, dimmed --label-dim, else 1.)
    const alpha = d ? r2(d.a) : it.hide ? 0 : dimmed ? LABEL_DIM : 1;
    const row = {
      key: it.key, text: it.text || '', box: box.map(Math.round), anchor: [r1(it.ax ?? 0), r1(it.ay ?? 0)], leader: !!it.leader, onVessel: !!it.onVessel,
      alpha, alphaFrom: d ? 'gpu' : 'page', state: stateOf(alpha, !!it.hide), dimmed, pinned: !!d?.pin, clipped: !!d?.clipped,
      under: [], off: 0, overlaps: [], gap: 0, detached: false,
    };
    // (Under a card: the share of the label's own box a card covers, by label-place's overlap, the function the solver keeps labels off cards by.)
    for (const c of cards) { const o = overlap(q, c.r), a = area(q); if (o > 0 && a > 0) row.under.push({ card: c.name, share: r2(o / a) }); }
    // (Off the stage: how far the box leaves it, 0 when label-place's `within` says it is inside.)
    if (W > 0 && H > 0 && !within(q, S)) row.off = r1(Math.max(S.x0 - q.x0, S.y0 - q.y0, q.x1 - S.x1, q.y1 - S.y1));
    // (A label with no leader that stands further from its point than the solver lets one: needsLeader's own threshold on boxGap.)
    row.gap = r1(boxGap(q, it.ax ?? 0, it.ay ?? 0));
    row.detached = !it.leader && !it.onVessel && it.ax != null && needsLeader(false, row.gap, false);
    items.push(row);
  }
  // (Two labels over each other: label-place's hits, then the area of overlap.)
  const live = items.filter((r) => r.state !== 'hidden');
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = rect(live[i].box), b = rect(live[j].box);
    if (hits(a, b) && overlap(a, b) >= 1) { live[i].overlaps.push(live[j].key); live[j].overlaps.push(live[i].key); }
  }
  items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const c = src.carry;
  return {
    stage: { w: Math.round(W), h: Math.round(H) },
    // (settled: the labels are laid for the camera that stands, none riding it and no solve running; null when the stage cannot say.)
    settled: c ? !!c.laid && !c.riding && !c.job && !c.stale : null,
    count: items.length, shown: items.filter((r) => r.state === 'shown').length, dim: items.filter((r) => r.state === 'dim').length,
    fading: items.filter((r) => r.state === 'fading').length, hidden: items.filter((r) => r.state === 'hidden').length,
    drawnByGpu: drawn.size > 0, marks: src.marks | 0,
    items,
    cards: cards.map((k) => ({ card: k.name, box: [k.r.x0, k.r.y0, k.r.x1, k.r.y1].map(Math.round) })),
  };
}

const pct = (v) => `${Math.round(v * 100)}%`;
/** The part as sentences, one line per label that is worth a line; detail 'full' lists every label. */
export function labelsLines(p, { detail = 'summary' } = {}) {
  const out = [`Labels: ${p.count} on the figure (${p.shown} shown, ${p.dim} dim, ${p.fading} fading, ${p.hidden} hidden)${p.settled === false ? ', still moving' : ''}.`];
  for (const r of p.items) {
    const odd = r.under.length || r.off || r.overlaps.length || r.detached || r.clipped || r.state === 'fading';
    if (detail !== 'full' && !odd) continue;
    if (r.state === 'hidden' && detail !== 'full') continue;
    let s = `Label "${r.text}" at ${r.box[0]},${r.box[1]} (${r.box[2] - r.box[0]}×${r.box[3] - r.box[1]}), ${pct(r.alpha)}${r.state === 'dim' ? ' (dim)' : r.state === 'fading' ? ' (fading)' : ''}`;
    if (r.leader) s += ', with a leader'; else if (r.onVessel) s += ', on its vessel';
    for (const u of r.under) s += `, ${pct(u.share)} under the ${u.card}`;
    if (r.off) s += `, ${r.off} px off the stage`;
    if (r.overlaps.length) s += `, over ${r.overlaps.length === 1 ? 'label' : 'labels'} ${r.overlaps.join(', ')}`;
    if (r.detached) s += `, ${r.gap} px from its point with no leader`;
    if (r.clipped) s += ', clipped by its canvas';
    out.push(`${s}.`);
  }
  return out;
}
/** The same as one block of text. */
export const labelsText = (p, o) => labelsLines(p, o).join('\n');
