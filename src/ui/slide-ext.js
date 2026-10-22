// Plug-in points for the deck visuals packages (review/deck-visuals-recs.md §9): each package registers what it adds in
// its own entry file, and the presenter, its instruments and the worker read the merged registry here. A deck that sets
// none of the new fields looks and behaves as before, and Explore and Patients never read it.
//
// An entry file's default export, every part optional:
//   targets   { key: { node?, edges?, organ?, res?, lit?, tone, words } }   what a word or a glow can point at (presenter TARGETS)
//   organs    ['stomach', …]                        organ ids a glow may outline (presenter ORGANS)
//   lenses    { key: [name, bar, lo, hi] | (slide) => [name, bar, lo, hi] }   a lens's key under the line (presenter LENS_KEY)
//   sets      { name: [vessel, target or organ ids] }   '@name' in a slide's glow or a mark's edges stands for these
//   tools     { kind: { make(env), title(t), short?(t) } }   a data-card instrument (presenter-tools.js); make returns
//             { el, update?(frame), pin?(fp), configure?(t, ctx), clear?(), dispose?() }
//   visuals   { name: (slide, ctx) => Element }        a whole-panel visual (slide.visual)
//   columns   { key: { heading, cut?, unit?, cell(row, ctx) => Element | string } }   a summary-table column (slide.cols)
//   steps     [(slide) => ({ explain?, wave? }) | null]   extra work on a slide's step in the presenter's own worker
//   figure    [{ show?(ctx), update?(fp, slide), clear?() }]   the figure while a slide is up
//   labels    [(label, mark, ctx) => label]         a mark's label before it is drawn
// Built-in names win, and a name two packages register is kept from the first only: tests/slide-ext.test.js fails on both.
// Every call into a package is guarded, so a package that throws loses its own feature and never stops a talk.

import highlights from './ext-highlights.js?v=ae81683dba';
import charts from './ext-charts.js?v=3aca6193e4';
import model from './ext-model.js?v=a2f4fc9c9a';
import panels from './ext-panels.js?v=3fe6e94811';
import callouts from './ext-callouts.js?v=0dd62ec5a1';
import instruments from './ext-instruments.js?v=e7fd2568c4';

export const PACKAGES = { A: highlights, B: charts, C: model, E: panels, F: callouts, G: instruments };
const NAMED = ['targets', 'lenses', 'sets', 'tools', 'visuals', 'columns'];
const LISTS = ['organs', 'steps', 'figure', 'labels'];
// The extra work a step may ask of the worker (worker-core.js 'sequence'); anything else a step function returns is dropped,
// so a package can never change a slide's model state.
export const STEP_EXTRAS = ['explain', 'wave'];

/** The registries merged: { targets, lenses, sets, tools, visuals, columns, organs, steps, figure, labels, owner, clashes }. */
export function mergeExt(pkgs) {
  const out = { owner: {}, clashes: [] };
  for (const k of NAMED) { out[k] = {}; out.owner[k] = {}; }
  for (const k of LISTS) out[k] = [];
  out.owner.organs = {};
  for (const [pk, reg] of Object.entries(pkgs)) {
    for (const k of Object.keys(reg || {})) if (!NAMED.includes(k) && !LISTS.includes(k)) out.clashes.push(`${pk}: unknown part "${k}"`);
    for (const k of NAMED) for (const [name, v] of Object.entries(reg?.[k] || {})) {
      if (Object.hasOwn(out[k], name)) out.clashes.push(`${k} "${name}": ${out.owner[k][name]} and ${pk}`);
      else { out[k][name] = v; out.owner[k][name] = pk; }
    }
    for (const id of reg?.organs || []) {
      if (out.owner.organs[id]) out.clashes.push(`organs "${id}": ${out.owner.organs[id]} and ${pk}`);
      else { out.organs.push(id); out.owner.organs[id] = pk; }
    }
    for (const k of ['steps', 'figure', 'labels']) for (const v of reg?.[k] || []) out[k].push(v);
  }
  return out;
}
export const EXT = mergeExt(PACKAGES);

// ── Guards ──
const said = new Set();
/** fn(), or fallback if it throws (logged once per tag). */
export function safe(fn, fallback = null, tag = 'slide-ext') {
  try { return fn(); } catch (err) {
    if (!said.has(tag)) { said.add(tag); console.error(`[slide-ext] ${tag}:`, err); }
    return fallback;
  }
}
/** An instrument with each of its methods guarded (its el kept as it is). */
export function guard(inst, tag) {
  if (!inst || typeof inst !== 'object') return null;
  const g = {};
  for (const [k, v] of Object.entries(inst)) g[k] = typeof v === 'function' ? (...a) => safe(() => v.apply(inst, a), undefined, `${tag}.${k}`) : v;
  return g;
}

// ── Helpers the presenter calls ──
const setRef = (id) => typeof id === 'string' && id[0] === '@';
/** A list of ids (a glow, a mark's edges) with each '@name' replaced by the named set's ids; an entry { id: '@name', … }
 *  becomes one entry per id with the same options. A list with no '@' name comes back as the very same array. */
export function expandIds(list, sets = EXT.sets) {
  if (list == null) return [];
  if (!Array.isArray(list) || !list.some((g) => setRef(typeof g === 'string' ? g : g?.id))) return list;
  return list.flatMap((g) => {
    const id = typeof g === 'string' ? g : g?.id;
    if (!setRef(id)) return [g];
    const ids = sets[id.slice(1)] || [];
    return typeof g === 'string' ? ids : ids.map((x) => ({ ...g, id: x }));
  });
}
/** The extra work the packages ask for on a slide's step ({ explain, wave }), or null. */
export function stepExtra(s, steps = EXT.steps) {
  let o = null;
  for (const f of steps) {
    const x = safe(() => f(s), null, 'steps');
    if (x && typeof x === 'object') for (const k of STEP_EXTRAS) if (x[k] != null) (o ||= {})[k] = x[k];
  }
  return o;
}
/** A mark's label after every package's label hook. */
export function markLabel(label, mark, ctx, fns = EXT.labels) {
  let l = label;
  for (const f of fns) l = safe(() => f(l, mark, ctx), l, 'labels');
  return l;
}
/** Every figure hook's show, update or clear. */
export function figureHooks(name, ...args) {
  for (const f of EXT.figure) if (typeof f?.[name] === 'function') safe(() => f[name](...args), null, `figure.${name}`);
}
