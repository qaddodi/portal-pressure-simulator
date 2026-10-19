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

/** Where the bands' names go: each starts 6 px into its band, or ends at maxX where it would run past it (the chart's own
 *  labels sit beyond); a name that would touch the one before it on its row goes to the next row; rows: how many there
 *  are room for (a name that fits on none goes just after the name on the row that ends first). widthOf: a name's width in px; ends0: where each row is
 *  already taken up to (another label on it). Returns [{ x, row }] in the runs' order. */
export function namePlaces(spans, names, widthOf, { rows = 2, gap = 8, ends0 = [], maxX = Infinity } = {}) {
  const ends = Array.from({ length: rows }, (_, r) => ends0[r] ?? -Infinity), out = [];
  const xs = spans.map((sp, i) => Math.min(sp[0] + 6, maxX - widthOf(names[i])));
  for (const i of spans.map((_, k) => k).sort((a, b) => xs[a] - xs[b])) {
    let r = ends.findIndex((e) => xs[i] >= e + gap), x = xs[i];
    // (No row free where it starts: on the row that frees first, just after the name there, never on top of it.)
    if (r < 0) { r = ends.indexOf(Math.min(...ends)); x = ends[r] + gap; }
    ends[r] = x + widthOf(names[i]);
    out[i] = { x, row: r };
  }
  return out;
}
