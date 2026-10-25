// Treatment bands on the over-time charts (deck visuals V26, package B): a slide's tool { kind: 'trace', bands: [...] } or
// { kind: 'flowtime', bands: [...] } shades the time points while each named treatment was on, named once at its start, so
// a fall in the line lines up with what caused it. A chart with no bands is drawn exactly as before.
// (No imports: the runs load in Node for the unit tests.)

// key → [name, whether a state's params have it on, colour token]
export const RX = {
  carvedilol: ['Carvedilol', (p) => !!p?.drugs?.carvedilol, '--s3'],
  propranolol: ['Propranolol', (p) => !!p?.drugs?.propranolol, '--s3'],
  terlipressin: ['Terlipressin', (p) => !!p?.drugs?.terlipressin, '--s4'],
  octreotide: ['Octreotide', (p) => !!p?.drugs?.octreotide, '--s4'],
  anticoag: ['Anticoagulation', (p) => !!p?.anticoag, '--s7'],
  diuretics: ['Diuretics', (p) => !!p?.diuretics, '--s1'],
  tips: ['TIPS', (p) => !!p?.tips?.on, '--s2'],
  dips: ['DIPS', (p) => !!p?.dips?.on, '--s2'],
};

/** The bands a tool asks for, known keys only, each once, in its order. */
export const bandKeys = (t) => [...new Set((Array.isArray(t?.bands) ? t.bands : []).filter((k) => Object.hasOwn(RX, k)))];

/** Each band's runs over a series of states (their params, in order): [{ key, name, tone, i0, i1 }], one per stretch of
 *  consecutive states with the treatment on, from its first state to its last. */
export function bandRuns(params, keys) {
  const out = [];
  for (const key of keys) {
    const [name, on, tone] = RX[key];
    let i0 = -1;
    params.forEach((p, i) => {
      if (on(p) && i0 < 0) i0 = i;
      if (i0 >= 0 && (!on(p) || i === params.length - 1)) { out.push({ key, name, tone, i0, i1: on(p) ? i : i - 1 }); i0 = -1; }
    });
  }
  return out;
}

/** A run's span on the chart: from halfway back to the state before its first to halfway on to the state after its last,
 *  inside the plot [L, R]. X: a state's x. */
export function bandSpan(run, n, X, L, R) {
  const x0 = run.i0 > 0 ? (X(run.i0 - 1) + X(run.i0)) / 2 : L, x1 = run.i1 < n - 1 ? (X(run.i1) + X(run.i1 + 1)) / 2 : R;
  return [Math.max(L, Math.min(x0, x1)), Math.min(R, Math.max(x0, x1))];
}

/** Where the bands' names go: each starts 6 px into its band, or ends at its row's maxX (a number, or one per row) where it
 *  would run past it; of the rows where it does not touch the name before it, the one where it starts nearest its band
 *  (a name that fits on none goes just after the name on the row that ends first). rows: how many there are room for;
 *  widthOf: a name's width in px; ends0: where each row is already taken up to (another label on it); grow: a name that fits
 *  on no row before its maxX opens a row of its own instead (the caller counts the rows used).
 *  Returns [{ x, row }] in the runs' order. */
export function namePlaces(spans, names, widthOf, { rows = 2, gap = 8, ends0 = [], maxX = Infinity, grow = false } = {}) {
  const ends = Array.from({ length: rows }, (_, r) => ends0[r] ?? -Infinity), out = [];
  const maxOf = (r) => (Array.isArray(maxX) ? maxX[r] ?? Infinity : maxX);
  for (const i of spans.map((_, k) => k).sort((a, b) => spans[a][0] - spans[b][0] || a - b)) {
    // (On the row where it starts nearest its band: at the band's start, or as near as that row's right edge allows.)
    let r = -1, x = -Infinity;
    for (let q = 0; q < rows; q++) {
      const xq = Math.min(spans[i][0] + 6, maxOf(q) - widthOf(names[i]));
      if (xq >= ends[q] + gap && xq > x + 0.5) { r = q; x = xq; }
    }
    // (No row free where it starts: on the row that frees first, just after the name there, never on top of it.)
    // (Or, with grow, where that would run past the row's edge, on a new row below the rest, at its band or ending at its edge.)
    if (r < 0 && grow && Math.min(...ends) + gap > maxOf(ends.indexOf(Math.min(...ends))) - widthOf(names[i])) {
      r = ends.length; ends.push(-Infinity); x = Math.max(0, Math.min(spans[i][0] + 6, maxOf(r) - widthOf(names[i])));
    }
    if (r < 0) { r = ends.indexOf(Math.min(...ends)); x = ends[r] + gap; }
    ends[r] = x + widthOf(names[i]);
    out[i] = { x, row: r };
  }
  return out;
}
