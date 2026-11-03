// How the ends meeting at one join are filleted on the GPU (veins-gl.js): which groups of vessels blend into each other,
// and how much. Two ends meeting nearly head on are one vessel running on into the next and need little or no fillet:
// the smooth union of two overlapping ends swells the tube there, a bump at the join. That holds inside a fork too:
// where a tributary joins a trunk at the node between two of the trunk's stretches (the IMV or the splenorenal shunt on
// the splenic vein), the trunk's two ends are filleted only to the tributary, never to each other, or the trunk swells
// on its far wall.
//
// dirs: for each end, the unit direction from the join back into its vessel, or null for a vessel that passes the join
// without ending there. The answer is a kept record the caller reads at once (newJoinAnswer; the answer of the call before is
// written over): groups[0 … ng) each { members: [end indexes], fillet, trunk (-1 for none), strand }, and ra, rb the pair that
// runs on (-1 for none), whose courses and calibers are eased to meet. The figure's joins pass (vein-joins.js) makes one of these
// for the whole stage and fills it in place for every node of every vessel morph frame; forkJoins and nodeJoins below hand the same
// answer back as a plain record ({ groups, runOn }) for one-off callers and the tests.

/** A kept answer for forkJoinsInto and nodeJoinsInto. */
export const newJoinAnswer = () => ({ groups: [], ng: 0, ra: -1, rb: -1 });   // alloc-rare: made once for the stage, then written in place
// The next group of the answer, empty (its record and members list were made by an earlier call and are written again).
function nextGroup(out) {
  let g = out.groups[out.ng];
  if (!g) { g = { members: [], fillet: 0, trunk: -1, strand: false }; out.groups.push(g); }   // alloc-rare: a group's record, made the first time an answer holds that many
  out.ng++;
  g.members.length = 0; g.fillet = 0; g.trunk = -1; g.strand = false;
  return g;
}
export function forkJoinsInto(dirs, n, out) {
  out.ng = 0; out.ra = -1; out.rb = -1;
  // A crowded join (more than four ends: the hepatic veins' at the cava) keeps every pair filleted.
  if (n > 4) {
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { const g = nextGroup(out); g.members.push(a, b); g.fillet = 1; }
    return out;
  }
  // The most nearly head-on pair runs on (each end runs on into one other at most). In a fork only a pair that is nearly
  // straight (more than about 130° apart) does: the arms of an even Y stay filleted to each other.
  let found = false, bestA = 0, bestB = 0, bestFil = 0;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const u = dirs[a], v = dirs[b];
    if (!u || !v) continue;
    const fil = Math.min(1, Math.max(0, (u[0] * v[0] + u[1] * v[1] + 0.9) / 0.5));
    if (fil < (n === 2 ? 1 : 0.5) && (!found || fil < bestFil)) { found = true; bestA = a; bestB = b; bestFil = fil; }
  }
  if (!found) {
    const g = nextGroup(out);
    for (let i = 0; i < n; i++) g.members.push(i);
    g.fillet = 1;
    return out;
  }
  out.ra = bestA; out.rb = bestB;
  if (n === 2) {
    const g = nextGroup(out);
    g.members.push(0, 1); g.fillet = bestFil;
    return out;
  }
  // The run-on pair joined as one course with no fillet (its courses and calibers are eased to meet, so a fillet would
  // only swell the seam), and each of its ends filleted to the rest. In those two the run-on end is the trunk the rest
  // end on (`trunk`: its member), so the shader asks of each pair only whether the tributary lies off the trunk's
  // straight course toward the pixel, not also which way the tributary's own nearest segment runs (the azygos arch's
  // bend, onto the cava above the heart, flipped that between its short segments and the fillet came in saw-teeth).
  const g0 = nextGroup(out); g0.members.push(bestA, bestB); g0.fillet = 0;
  const ga = nextGroup(out), gb = nextGroup(out);
  ga.members.push(bestA); gb.members.push(bestB);
  for (let i = 0; i < n; i++) if (i !== bestA && i !== bestB) { ga.members.push(i); gb.members.push(i); }
  ga.fillet = 1; ga.trunk = bestA; gb.fillet = 1; gb.trunk = bestB;
  return out;
}

// The joins at one node when some of its ends belong to a collateral's strands. A varix (the coronary vein's, the short gastric
// veins', the rectal veins') is drawn as its channel and a braid of strands that run along it and leave and rejoin it at its
// ends, so at the node where the collateral meets the vein it runs on into, each strand stands as one more end there: the
// coronary vein and the esophageal varices met as two vessels and five strands, seven ends at one point, a "crowded join"
// above, with every pair filleted, no vessel running on into another and no caliber eased: the wide coronary vein ended in a
// round cap on the narrow varix beside it. The strands are the collateral's own, not other vessels meeting it, so they are left
// out of what decides the run-on and the forks (the vessels alone: the same answer the node gives with no strands drawn, which
// is how the portal tree's own junctions (the splenic vein where the short gastric veins leave it, the IMV where the rectal
// veins do) read the same whether those collaterals are open or not). Each strand is still joined, whole, to every vessel and
// strand there, as it was, so its round end never shows through a lumen as a stub; the vessels' groups come first (a cell of
// the shader reads only the first six joins it meets).
//
// ends: for each of the first n ends at the node, { dir (as forkJoins', or null), strand }. Writes forkJoinsInto's answer, the indexes those of `ends`.
// (Kept lists the pass sorts the ends into, written again each call; used inside one call, which the answer does not alias.)
const LEAD = [], STRANDS = [], LEAD_DIRS = [];
export function nodeJoinsInto(ends, n, out) {
  let nl = 0, ns = 0;
  for (let i = 0; i < n; i++) { if (ends[i].strand) STRANDS[ns++] = i; else LEAD[nl++] = i; }
  // Nothing to set apart (no strands, or fewer than two vessels): as forkJoins gives it.
  if (!ns || nl < 2) {
    for (let i = 0; i < n; i++) LEAD_DIRS[i] = ends[i].dir;
    return forkJoinsInto(LEAD_DIRS, n, out);
  }
  for (let i = 0; i < nl; i++) LEAD_DIRS[i] = ends[LEAD[i]].dir;
  forkJoinsInto(LEAD_DIRS, nl, out);
  // (The vessels' groups name the ends by their place among the vessels: back to the place at the node.)
  for (let gi = 0; gi < out.ng; gi++) {
    const g = out.groups[gi], ms = g.members;
    for (let k = 0; k < ms.length; k++) ms[k] = LEAD[ms[k]];
    if (g.trunk >= 0) g.trunk = LEAD[g.trunk];
  }
  if (out.ra >= 0) { out.ra = LEAD[out.ra]; out.rb = LEAD[out.rb]; }
  // (The vessels first, then each strand with every end before it: lead then strands, as a concatenated list.)
  const total = nl + ns;
  for (let a = 0; a < total; a++) {
    for (let b = Math.max(a + 1, nl); b < total; b++) {
      const g = nextGroup(out);
      g.members.push(a < nl ? LEAD[a] : STRANDS[a - nl], STRANDS[b - nl]); g.fillet = 1; g.strand = true;
    }
  }
  return out;
}

// The answer as a plain record, { groups: [{ members, fillet, trunk? , strand? }], runOn: [a, b] or null }, for one-off callers and the
// tests (the figure's own passes read the kept answer).
function plain(out) {
  const groups = [];
  for (let gi = 0; gi < out.ng; gi++) {
    const g = out.groups[gi], o = { members: g.members.slice(), fillet: g.fillet };
    if (g.trunk >= 0) o.trunk = g.trunk;
    if (g.strand) o.strand = true;
    groups.push(o);
  }
  return { groups, runOn: out.ra >= 0 ? [out.ra, out.rb] : null };
}
export const forkJoins = (dirs) => plain(forkJoinsInto(dirs, dirs.length, newJoinAnswer()));
export const nodeJoins = (ends) => plain(nodeJoinsInto(ends, ends.length, newJoinAnswer()));

// inside the vein, a little short of its centreline. Over its last stretch there its lumen narrows (to SIDE_END_MIN), so
// its round end sits well inside the vein's walls and never shows past the far wall as a bump: the scale of its radius at
// distance d from that end (world units), for a vein of radius hostR. The narrowing lies within the vein (0.6 of its
// radius), out of sight.
export const SIDE_END_MIN = 0.35;
export function sideEndScale(d, hostR) {
  const s = 0.6 * hostR;
  if (!(s > 0) || d >= s) return 1;
  const u = Math.max(0, d) / s;
  return SIDE_END_MIN + (1 - SIDE_END_MIN) * u * u * (3 - 2 * u);
}
