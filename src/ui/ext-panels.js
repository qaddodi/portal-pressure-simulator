// Deck visuals, package E. Panels and table columns: V28, V16 (review/deck-visuals-recs.md §9; V31 and V17 taken out).
// What this package adds to slides, registered for slide-ext.js (see its header for each part's shape). A deck that sets none
// of its fields is unchanged.
//   visual: 'plane'      two readings on one plane with a guideline's zones (visual-plane.js), plane: 'csph' | 'hvpg-ppg' | {…}
//   tool kind 'plane'    the same in the data card, read from the slide's case
//   table column 'wave' (col-wave.js)

import { planeVisual, createPlaneTool, toolPlane } from './visual-plane.js?v=fab4c1dfd5';
import { waveColumn } from './col-wave.js?v=f6c37cd00a';

// A plane's rows: the slide's `of`, as a table's (a slide id, { id, name }, or { preset, params?, days?, name } for a patient no
// slide shows). A slide's row reads its state's numbers (redrawn as they come); a patient row is worked out once in the
// presenter's calculation worker and kept for the talk.
const presetFp = new Map();
const keyOf = (o) => JSON.stringify([o.preset, o.params ?? null, o.days ?? null, o.presetDays ?? null]);
export function rowsFp(s, ctx, done) {
  const of = Array.isArray(s.of) ? s.of : [];
  const slideOf = (id) => ctx?.deck?.slides?.find((x) => x.id === id) || null;
  const rows = of.map((o) => {
    const x = typeof o === 'string' ? { id: o } : o && typeof o === 'object' ? o : null;
    if (!x) return null;
    const sl = x.id ? slideOf(x.id) : null;
    return { x, name: x.name || x.title || sl?.title || '', short: x.short || '', site: x.site ?? sl?.site, f: null };
  }).filter(Boolean);
  const fill = () => {
    let missing = 0;
    for (const r of rows) {
      if (r.f) continue;
      if (r.x.id) { r.f = ctx?.fpOf?.(r.x.id) ?? null; if (!r.f) missing++; continue; }
      if (!r.x.preset || !ctx?.run) continue;
      const k = keyOf(r.x);
      if (!presetFp.has(k)) presetFp.set(k, ctx.run([{ preset: r.x.preset, params: r.x.params, days: r.x.days, presetDays: r.x.presetDays }], null).then((out) => out?.[0]?.fp ?? null));
      missing++;
      if (r.wait) continue;
      r.wait = true;
      presetFp.get(k).then((f) => { r.wait = false; if (!f) { presetFp.delete(k); return; } if (!r.f) { r.f = f; const have = rows.filter((q) => q.f); shown = have.length; done(have); } });
    }
    return missing;
  };
  const tries = { n: 0 };
  let shown = -1;
  const again = () => {
    const missing = fill(), have = rows.filter((r) => r.f);
    if (have.length !== shown) { shown = have.length; done(have); }   // (redrawn only when a row arrives)
    // (A slide's state not yet computed, or a patient's run that failed: looked for again for half a minute, from before the
    // slide is up (it is built while the one before still shows); a patient's run under way is waited for, not started twice.)
    if (missing && tries.n++ < 100) setTimeout(again, 300);
  };
  again();
}

// (The card's heading: the two readings by name, 'Stiffness and platelets'; an acronym keeps its capitals.)
const word = (a) => (a.short || a.name || a.key).split(',')[0];
const lc = (t) => (/^[A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
export const planeTitle = (p) => (p ? `${word(p.x)} and ${lc(word(p.y))}` : 'Two readings');

export default {
  visuals: {
    plane: (s, ctx) => planeVisual(s, ctx, rowsFp),
  },
  tools: {
    plane: { make: () => createPlaneTool(), title: (t) => planeTitle(toolPlane(t)), short: () => 'Two readings' },
  },
  columns: { wave: waveColumn },
};
