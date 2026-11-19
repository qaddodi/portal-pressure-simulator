// Which samples of a long series a chart draws (LOOK-9 / CHART-2, bible review 19 Nov 2026). A pulsatile trace has thousands of samples and about two points per pixel
// column are drawn. It used to keep every stride-th sample from the window's first index, so as the window slid the kept set changed phase and a crest was kept at one
// frame and skipped at the next: pulsatile crests shimmered. Here each run of `stride` samples keeps its lowest and its highest (in the order they occur), so a crest
// and a trough are always drawn whatever the phase; the first and the last sample are always kept, a gap (NaN) lifts the pen.
// Allocation-free once warm: the kept indices are written into one kept array (PICK), grown only for a series longer than any before.
let PICK = new Int32Array(1024);   // alloc-rare: grown once for the longest series
export const PEN_UP = -1;

/** Fills PICK with the sample indices to draw (PEN_UP where the pen lifts for a gap) and returns how many. */
export function pickTrace(ys, n, stride) {
  const need = n + 4;
  if (PICK.length < need) { let q = PICK.length; while (q < need) q *= 2; PICK = new Int32Array(q); }   // alloc-rare
  let m = 0, lifted = true;
  if (stride <= 1) {
    for (let i = 0; i < n; i++) { if (ys[i] !== ys[i]) { if (!lifted) { PICK[m++] = PEN_UP; lifted = true; } } else { PICK[m++] = i; lifted = false; } }
    return m;
  }
  let last = -2;
  for (let b = 0; b < n; b += stride) {
    const e = b + stride < n ? b + stride : n;
    let lo = -1, hi = -1, vLo = Infinity, vHi = -Infinity, gap = false;
    for (let i = b; i < e; i++) {
      const v = ys[i];
      if (v !== v) { gap = true; continue; }
      if (v < vLo) { vLo = v; lo = i; }
      if (v > vHi) { vHi = v; hi = i; }
    }
    if (gap) {   // a bucket with a missing reading: its samples one by one, so the pen lifts where the data does
      for (let i = b; i < e; i++) { if (ys[i] !== ys[i]) { if (!lifted) { PICK[m++] = PEN_UP; lifted = true; } } else { PICK[m++] = i; last = i; lifted = false; } }
      continue;
    }
    if (b === 0 && lo !== 0 && hi !== 0) { PICK[m++] = 0; lifted = false; }   // (the line starts at the series' first sample)
    const a = lo < hi ? lo : hi, c = lo < hi ? hi : lo;
    PICK[m++] = a; last = a;
    if (c !== a) { PICK[m++] = c; last = c; }
    lifted = false;
  }
  if (last !== n - 1 && ys[n - 1] === ys[n - 1]) PICK[m++] = n - 1;   // (the line ends at the live head)
  return m;
}
export const picked = () => PICK;
