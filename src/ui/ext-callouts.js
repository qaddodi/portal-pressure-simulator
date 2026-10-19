// Deck visuals, package F. Figure callouts: V8, V9, V10, V25 (review/deck-visuals-recs.md §9).
// What this package adds to slides, registered for slide-ext.js (see its header for each part's shape). A deck that sets none
// of its fields is unchanged:
//   mark: { edges: ['C1a'], label: 'Varix {varix}' }   a mark's words carry live readings, in their rating colour, as the model moves (V8)
//   mark: { organ: 'spleen', label: 'Spleen {spleen}' } a mark on an organ (liver, spleen, heart, stomach, esophagus, bowel, colon,
//                                                       duodenum, kidney, or the ascites) (V8)
//   calipers: ['spleen'], ['varix'], ['TIPS']          a dimension line across the spleen, a varix or a vessel, with its reading (V9)
//   steps: true (beside glowSeq)                       each step of the glow's order keeps its number (V10)
//   span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }]   on the circuit view, a bracket from one station to another (V25)
//   zone: 'liver'                                      on the circuit view, one of its five zone bands lit softly (V25)
import { EDGES } from '../engine/topology.js?v=4044766e96';
import { SETS } from './highlight-math.js?v=86a89dcb9e';
import { parseLive, liveRuns, widestRuns, runsText, ORGAN_MARKS, ORGAN_ANCHOR, caliperOf, caliperText, stepPlan, zoneIndex, spanOf } from './callout-math.js?v=e245215104';

const EI = new Map(EDGES.map((e, i) => [e.id, i]));
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const expand = (ids) => list(ids).flatMap((g) => (typeof g === 'string' && g[0] === '@' ? SETS[g.slice(1)] || [] : [g]));
const marksOf = (s) => list(s.marks || s.mark).filter((m) => m && typeof m === 'object');

// The slide on screen: its live words, organ marks, calipers, spans and zone, read once as it lands; each new reading
// (a what-if slider, a compare button, a time-lapse's days) fills the same words again.
let cur = null, stage = null;
function plan(s) {
  const live = [], organs = [], spans = [];
  for (const m of marksOf(s)) {
    const runs = parseLive(m.label);
    if (m.organ && ORGAN_MARKS.includes(m.organ)) organs.push({ organ: m.organ === 'kidney' ? 'kidney-l' : m.organ, kind: m.kind || 'note', runs: runs || [{ t: String(m.label || ''), sp: false }] });
    else if (runs) { const e = expand(m.edges)[0]; if (e) live.push({ edge: e, kind: m.kind || 'block', runs }); }
  }
  for (const sp of list(s.span)) { const at = sp && spanOf(sp.from, sp.to); if (at) spans.push({ from: sp.from, to: sp.to, runs: parseLive(sp.label) || [{ t: String(sp.label || ''), sp: false }] }); }
  const calipers = [...new Set(list(s.calipers).filter((x) => typeof x === 'string'))].map(caliperOf).filter((c) => c.organ || EI.has(c.edge));
  // (The glow as the presenter lights it: each '@set' stands for its vessels, each lit one step after the one before.)
  const steps = s.steps && s.glowSeq > 0 ? stepPlan(list(s.glow).flatMap((g) => expand([typeof g === 'string' ? g : g?.id])), s.glowSeq, (id) => EI.has(id), (id) => !!ORGAN_ANCHOR[id]) : null;
  const zone = s.zone != null ? zoneIndex(s.zone) : -1;
  return live.length || organs.length || spans.length || calipers.length || steps?.length || zone >= 0 ? { live, organs, spans, calipers, steps: steps?.length ? steps : null, zone } : null;
}
// The figure's callouts for fp: each piece's words as runs, and the same words at their widest (the room the pill keeps).
const words = (runs, fp, tips) => { const r = liveRuns(runs, fp, tips); return { runs: r, wide: widestRuns(r), label: runsText(r) }; };
function spec(p, fp, params) {
  const tips = !!params?.tips?.on;
  return {
    live: Object.fromEntries(p.live.map((m) => [`${m.edge}|${m.kind}`, words(m.runs, fp, tips)])),
    organs: p.organs.map((m) => ({ organ: m.organ, kind: m.kind, ...words(m.runs, fp, tips) })),
    calipers: p.calipers.map((c) => { const t = caliperText(c, fp, params, EI.get(c.edge) ?? -1); return { id: c.id, organ: c.organ || null, edge: c.edge || null, runs: [{ t, sp: false, tone: null }], wide: widestRuns([{ t, sp: false, tone: null }]), label: t }; }),
    steps: p.steps,
    spans: p.spans.map((sp) => ({ from: sp.from, to: sp.to, ...words(sp.runs, fp, tips) })),
    zone: p.zone,
  };
}

const figure = {
  show(ctx) {
    stage = ctx.stage || stage;
    const p = ctx.slide ? plan(ctx.slide) : null;
    // (A time-lapse lands on its start first, as its tiles do: its days then fill the words through update.)
    const fp = (ctx.slide?.lapse ? ctx.state?.start?.fp : null) || ctx.fp;
    cur = p ? { p, ctx } : null;
    stage?.callouts?.(p ? spec(p, fp, ctx.liveParams?.() || ctx.params) : null);
  },
  update(fp) {
    if (!cur || !fp || !cur.ctx.shown?.()) return;
    stage?.callouts?.(spec(cur.p, fp, cur.ctx.liveParams?.() || cur.ctx.params));
  },
  clear() { cur = null; stage?.callouts?.(null); },
};

export default {
  figure: [figure],
  // A live mark's stored label: its words with the slide's own numbers (what a screen reader hears; the figure fills them as the
  // model moves). Only a label with a brace naming a reading changes, and no built-in mark has one.
  labels: [(label, mark, ctx) => { const r = parseLive(label); return r ? runsText(liveRuns(r, ctx?.fp, !!ctx?.params?.tips?.on)) : label; }],
};
