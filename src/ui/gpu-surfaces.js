// Which surfaces are drawn on the GPU now and which on a fallback (the ?perf readout's "Surfaces" list; reviewer's checklist, 1 Nov 2026,
// section 9: "a single debug readout that lists which surfaces are on GPU vs fallback this frame").
// Each part of the page that can draw on the GPU or on a fallback (2D canvas, SVG, the browser's blur) says so here, once, with a getter
// of its own state. The getters are read only by the readout (perf-readout.js, while it is open, twice a second, never in a frame of
// the figure's), so without ?perf nothing here is ever called: a registration is one Map entry and costs no frame anything.
// A getter returns null when its surface is not on screen (the lobule closed, no Doppler card), else
// { on: 'gpu' | 'fallback' | 'mixed', via: what draws it ('WebGL2', '2D canvas', 'SVG', 'browser blur', ...), why: '' or why not the GPU }.

const rows = new Map();

/** Registers surface `name` with its state getter; returns the function that takes it off the list (a disposed view). */
export function surface(name, read) {
  rows.set(name, read);
  return () => { if (rows.get(name) === read) rows.delete(name); };
}

/** Every surface on screen now, in the order registered: [{ name, on, via, why }]. A getter that throws is listed as unknown. */
export function surfaceRows() {
  const out = []; // alloc-rare: read by the ?perf readout while it is open, twice a second, never by an ordinary frame
  for (const [name, read] of rows) {
    let s;
    try { s = read(); } catch (err) { s = { on: 'fallback', via: '?', why: `state unreadable (${err?.message || err})` }; } // alloc-rare: read by the ?perf readout while it is open, twice a second, never by an ordinary frame
    if (s) out.push({ name, on: s.on, via: s.via || '', why: s.why || '' }); // alloc-rare: read by the ?perf readout while it is open, twice a second, never by an ordinary frame
  }
  return out;
}

const MARK = { gpu: 'GPU', fallback: 'FALLBACK', mixed: 'PART GPU' };
/** The rows as the readout's text: a count, then the fallbacks first, then the rest. */
export function surfacesText(list) {
  if (!list.length) return 'Surfaces: none registered on screen';
  const off = list.filter((r) => r.on !== 'gpu').length;
  const order = (r) => (r.on === 'fallback' ? 0 : r.on === 'mixed' ? 1 : 2);
  const lines = [...list].sort((a, b) => order(a) - order(b)).map((r) => `  ${MARK[r.on] || r.on}  ${r.name}${r.via ? ` (${r.via})` : ''}${r.why ? `: ${r.why}` : ''}`);
  return [`Surfaces now: ${list.length - off} on the GPU, ${off} on a fallback or partly`, ...lines].join('\n');
}

/** For tests: forgets every registration. */
export function clearSurfaces() { rows.clear(); }
