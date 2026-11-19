// What a slide calls out on the figure once it has landed: marks, labels, stations, glows, callout and readings
// (moved out of presenter.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGE_TONE, SITE_NODE, TARGETS, VAL_TONE, rateTone, slideTargets } from './presenter-words.js';
import { expandIds, figureHooks, markLabel } from './slide-ext.js';
import { store } from './store.js';
import { hasStent, spansOf, spansStented } from './tool-profile.js';

export function createOverlays(st, live) {
  const { app, clotMarks, ctxOf, markFocus, stage, stentedOf } = st;
  // What a slide calls out on the figure once it has landed (or a scale's view of it, after a flip: flipMove): its marks, labels,
  // the stations its terms name (in their colours), its glows, the lobule's callout and its readings (see slideTargets).
  function paintOverlays(s, to, st, hooks = true) {
    if (!s.visual) {
      // The slide's marks, labels, the stations its terms name (in their colours) and its glows (see slideTargets).
      const tg = slideTargets(s), xc = ctxOf(s, to);
      // (A mark's edges may name a package's set, '@name', and its label goes through the packages' label hooks: slide-ext.js.)
      let marks = (s.marks || (s.mark ? [s.mark] : [])).map((m) => ({ edges: [...expandIds(m.edges)], label: markLabel(m.label, m, xc), kind: m.kind || 'block', free: !!m.free, ...(m.seg ? { seg: m.seg } : {}), ...(m.clot ? { clot: true } : {}) }));
      // A note mark is a pointer: its vessel glows in its station's colour. Where a station label on the slide already
      // names that vessel, the pointer would only repeat it, so it goes (the glow stays).
      if (tg) {
        const named = new Set([...(s.labels || []), ...tg.labels].flatMap((n) => TARGETS[n]?.edges || []));
        for (const m of marks) if (m.kind === 'note') for (const e of m.edges) if (!tg.glow.some((g) => g.id === e)) tg.glow.push({ id: e, tone: EDGE_TONE[e] || 'accent' });
        marks = marks.filter((m) => !(m.kind === 'note' && m.edges.some((e) => named.has(e))));
      }
      // (A site the label stands in for lends it its station colour, so the label is the slide's highlight.)
      if (tg) for (const k of s.sites || []) if (SITE_NODE[k] && [...(s.labels || []), ...tg.labels].includes(SITE_NODE[k])) tg.terms[SITE_NODE[k]] ||= TARGETS[k]?.tone || VAL_TONE[k];
      live.markBase = { i: to, marks };
      marks = clotMarks(marks, st?.params || store.get().params);
      store.set({ presentLabels: [...new Set([...(s.labels || []), ...tg.labels])], presentTerms: tg.terms || null,
        presentNames: s.tool?.kind === 'profile' || !!s.cath, presentGrads: s.tool?.kind === 'profile' ? (hasStent(st?.fp) ? spansStented(spansOf(s.tool.spans)) : spansOf(s.tool.spans)).map(([k]) => k).join() : null, presentFp: st?.fp || null,
        focus: markFocus(marks), stented: stentedOf(s), lobuleCallout: !s.callout ? null : { kind: 'block', ...s.callout } });
      // (The glows and outlines are the figure's decoration: one that cannot be drawn, as on a device without WebGL2 once, leaves the slide
      // without it rather than half-changed with its cards never in.)
      if (tg) {
        try { stage.setGlow(tg.glow); stage.pinOrgans(tg.organs.map((o) => (o.id === 'spleen' && st?.fp ? { id: o.id, tone: rateTone('spleen', st.fp) } : o))); stage.setResGlow(tg.res); }
        catch (e) { console.warn(`presenter: slide ${to + 1}'s glows and outlines could not be drawn`, e); }
      }
      app.dataset.lit = tg?.lit.join(' ') || '';
      if (hooks) figureHooks('show', xc);   // (a deck visuals package's own marks on the figure: slide-ext.js; a flip leaves them as they are)
    }
    // A site whose station label is already on the slide is not called out twice: the label carries the one reading,
    // in its station's colour, and the pill stays only where no label stands.
    { const named = new Set(store.get().presentLabels || []);
      const ss = !s.visual ? [...new Set([...(s.sites || []), ...slideTargets(s).sites])].filter((k) => !named.has(SITE_NODE[k])) : [];
      if (ss.length && st) stage.setSites(ss, st.fp); }
  }
  return { paintOverlays };
}
