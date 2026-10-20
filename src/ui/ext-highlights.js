// Deck visuals, package A. Figure highlights: V3, V2, V18, V6, V11, V7 (review/deck-visuals-recs.md §9).
// What this package adds to slides, registered for slide-ext.js (see its header for each part's shape). A deck that sets none
// of its fields is unchanged:
//   terms / glow: 'bowel', 'colon', 'duodenum', 'kidney'   outline and name more organs (V3)
//   '@portal', '@collaterals', …   named sets of vessels, in glow, spot and a mark's edges (V2; highlight-math.js SETS)
//   spot: ['@collaterals', 'spleen']   the rest of the network and the organs step back; the named vessels stay, the organs are outlined (V2)
//   normalOutline: ['spleen']          the normal-sized spleen's outline inside an enlarged one (V18)
//   ripple: true | '<slide id>'        the vessels whose pressure moved glow warm or cool for a moment as the slide lands (V6)
//   lens: 'since' (since: '<slide id>', sinceLabel: '…')   the Change colours against the slide before, or a named one (V11)
//   lens: 'system'                     portal veins, systemic veins and the collaterals between them in three colours (V7)
import { EDGES } from '../engine/topology.js?v=4044766e96';
import { withOverview } from './decks.js?v=a2616fd914';
import { SETS, ORGAN_TARGETS, NEW_ORGANS, spotOf, stateIndex, sinceWords } from './highlight-math.js?v=e2c1816e25';

const VESSEL = new Set(EDGES.map((e) => e.id));
const expand = (list) => (Array.isArray(list) ? list : [list]).flatMap((g) => (typeof g === 'string' && g[0] === '@' ? SETS[g.slice(1)] || [] : [g]));
const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// The figure's own fields only: a visual slide (a table, the ladders) has no figure (the presenter calls show only without one).
const DELTA_BAR = () => 'linear-gradient(to right, var(--delta-low), var(--delta-mid), var(--delta-high))';

// What has been shown in this deck: each model state's fingerprint by the slide whose state it is (as the presenter's stateOf),
// so "the slide before" is the state the presenter computed for it, whichever way the talk reached this slide.
const seen = { deck: null, slides: [], stateOf: [], fp: new Map(), last: -1 };
let pending = null;   // a time-lapse's ripple, played when the lapse lands
let stage = null;   // the figure (the context's stage, kept for update and clear, which are given none)
function deckOf(ctx) {
  if (seen.deck === ctx.deck) return;
  const sl = !ctx.deck ? [] : ctx.deck.mine ? ctx.deck.slides : withOverview(ctx.deck).slides;
  Object.assign(seen, { deck: ctx.deck, slides: sl || [], stateOf: stateIndex(sl), fp: new Map(), last: -1 });
}
/** The fingerprint a slide's change counts from: a named slide's, or the slide before's (null when it is not known). */
function fpBefore(ctx, ref) {
  if (typeof ref === 'string') return ctx.fpOf?.(ref) || null;
  const i = ctx.index;
  if (!(i > 0) || seen.slides[i]?.title !== ctx.slide?.title) return null;
  const k = seen.stateOf[i - 1];
  return seen.fp.get(k) || (seen.slides[k]?.id ? ctx.fpOf?.(seen.slides[k].id) : null) || null;
}
const P = (fp) => fp?.at?.P || null;

const figure = {
  show(ctx) {
    const s = ctx.slide;
    stage = ctx.stage || stage;
    if (!s || !stage) return;
    deckOf(ctx);
    const i = ctx.index, forward = i > seen.last;
    if (s.spot) stage.spotlight?.(spotOf(expand(s.spot), (id) => VESSEL.has(id)));
    if (s.normalOutline) stage.normalOutline?.(expand(s.normalOutline).filter((id) => id === 'spleen'));
    // (A time-lapse colours against its own start: the state it plays from. Until the slide is up, and where the state before is
    // not known, the figure counts from what it showed as the slide began: stage.js REF.)
    if (s.lens === 'since') { const ref = (s.lapse && !s.since ? ctx.state?.start?.fp : null) || fpBefore(ctx, s.since); if (P(ref)) stage.changeRef?.(P(ref)); }
    if (s.ripple && forward && !reduced()) {
      const from = (s.lapse && s.ripple === true ? ctx.state?.start?.fp : null) || fpBefore(ctx, s.ripple === true ? null : s.ripple);
      if (s.lapse) pending = { from, to: ctx.fp };
      else stage.ripple?.(P(from), P(ctx.fp));
    }
    if (ctx.fp && seen.stateOf[i] != null) seen.fp.set(seen.stateOf[i], ctx.fp);
    seen.last = i;
  },
  // A time-lapse lands on its computed end (presenter playLapse): its ripple plays then, once.
  update(fp) {
    if (pending && fp && fp === pending.to) { const p = pending; pending = null; stage?.ripple?.(P(p.from), P(p.to)); }
  },
  clear() {
    pending = null;
    stage?.spotlight?.(null); stage?.normalOutline?.(null); stage?.changeRef?.(null);
  },
};

export default {
  targets: ORGAN_TARGETS,
  organs: NEW_ORGANS,
  sets: SETS,
  lenses: {
    // (Named swatches, as Blood origin's key: the three systems in their station colours.)
    system: ['vein system', [['--tr-pv', 'Portal'], ['--tr-ivc', 'Systemic'], ['--tr-var', 'Shunts']]],
    since: (s) => [sinceWords(s), DELTA_BAR, 'Lower', 'Higher'],
  },
  figure: [figure],
};
