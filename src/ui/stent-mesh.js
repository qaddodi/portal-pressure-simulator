// The stent mesh as path data (pure: no DOM, no styles). stage-transitions.js meshPaths hands it the vessel's frame and wraps the strings in
// SVG paths; the GPU draws them like every other stent mark. Anchored at a = 0 (the end the stent is unrolled from), running A along the
// vessel, drawn k of the way (0 to 1): two rails, a diamond lattice of struts, and a marker across the mesh at each end.
//
// bare > 0 draws the TIPS stent as the covered stent it is (visual-style D4): the first `bare` of its length (the 2 cm of open struts
// at the portal end) as plain struts, the rest under a PTFE cover (a closed outline between the rails, for a wash under fainter struts),
// and one ring across the mesh where the two meet (the radiopaque band).
const P = (q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
const RAIL_STEP = 3;   // (world units between the points of a rail and of the cover's edges, so they follow a bend)

/** The bare stretch of the TIPS stent, in drawn length: BARE_CM of the shunt's lenCm, at most `max` of it. */
export const BARE_CM = 2;
export const bareOf = (drawn, lenCm, max = 0.4) => drawn * Math.min(max, BARE_CM / (lenCm > 0 ? lenCm : 8));

/**
 * f(a, side): the mesh's point at arc length a from its start, on side 1 or -1 of the vessel ([x, y]). R0: the mesh's half-width at its
 * start (the lattice's cell). A: its whole length. k: how much is drawn. ends: the marker at the far end too. bare: the uncovered stretch
 * from the start (0: a plain mesh, nothing covered).
 * Returns { struts (the bare stretch's, or all of them), covStruts (the covered stretch's, '' for a plain mesh), rails, cover, marks, ring, crowns (a covered stent's ring across each end) }.
 */
export function stentMeshD(f, R0, A, k = 1, ends = true, bare = 0) {
  const e = A * k, cell = Math.max(6, R0 * 1.7), three = bare > 0 && bare < A;
  let rails = '';
  for (const side of [1, -1]) {
    rails += 'M' + P(f(0, side));
    for (let a = RAIL_STEP; a < e; a += RAIL_STEP) rails += ' L' + P(f(a, side));
    rails += ' L' + P(f(e, side)) + ' ';
  }
  const S = ['', ''];   // (the struts of the bare stretch and of the covered one: one polyline each way across, cut where the cover begins)
  for (const start of [1, -1]) {
    let side = start, prev = f(0, side), pa = 0, w = 0;
    S[0] += 'M' + P(prev);
    for (let a = cell / 2; a <= A + 0.01; a += cell / 2) {
      side = -side;
      const aa = Math.min(a, A), q = f(aa, side), grow = a > e + 0.01;
      let to = q, at = aa;
      if (grow) {   // (the lattice's growing end: the strut under way, drawn as far as it has come)
        const u = (e - (a - cell / 2)) / (cell / 2);
        if (!(u > 0.001)) break;
        to = [prev[0] + (q[0] - prev[0]) * u, prev[1] + (q[1] - prev[1]) * u]; at = e;
      }
      if (three && !w && at > bare) {
        const t = (bare - pa) / (at - pa), m = [prev[0] + (to[0] - prev[0]) * t, prev[1] + (to[1] - prev[1]) * t];
        S[0] += ' L' + P(m); S[1] += 'M' + P(m); w = 1;
      }
      S[w] += ' L' + P(to); prev = to; pa = at;
      if (grow) break;
    }
    S[0] += ' '; if (w) S[1] += ' ';
  }
  let cover = '', ring = '', marks = '';
  if (three && e > bare + 0.5) {
    const edge = (side) => { const r = []; for (let a = bare; a < e; a += RAIL_STEP) r.push(f(a, side)); r.push(f(e, side)); return r; };
    cover = 'M' + [...edge(1), ...edge(-1).reverse()].map(P).join(' L') + ' Z';
  }
  if (three && e >= bare) ring = `M${P(f(bare, 1))} L${P(f(bare, -1))}`;
  // (The covered TIPS stent ends square in each vein, a ring across each end, as a real stent's crown: 11 Nov 2026, "the ends should look like stent, not weird stubs". The front's own marker stays off for it.)
  let crowns = '';
  if (three) for (const a of k >= 1 ? [0, e] : [0]) crowns += `M${P(f(a, 1))} L${P(f(a, -1))} `;
  if (!three) for (const a of k > 0.02 && ends ? [0, e] : [0]) marks += `M${P(f(a, 1))} L${P(f(a, -1))} `;
  return { struts: S[0], covStruts: S[1], rails, cover, marks, ring, crowns };
}
