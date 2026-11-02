// How the ends meeting at one join are filleted on the GPU (veins-gl.js): which groups of vessels blend into each other,
// and how much. Two ends meeting nearly head on are one vessel running on into the next and need little or no fillet:
// the smooth union of two overlapping ends swells the tube there, a bump at the join. That holds inside a fork too:
// where a tributary joins a trunk at the node between two of the trunk's stretches (the IMV or the splenorenal shunt on
// the splenic vein), the trunk's two ends are filleted only to the tributary, never to each other, or the trunk swells
// on its far wall.
//
// dirs: for each end, the unit direction from the join back into its vessel, or null for a vessel that passes the join
// without ending there. Returns { groups: [{ members: [end indexes], fillet }], runOn: [a, b] or null } (runOn: the pair
// that runs on, whose courses and calibers are eased to meet).
// (The answer is a record the caller reads at once: it is made when the vessels are binned again, which happens only when the layout, the
// set of vessels or a vessel's reach changed (stage.js syncVeinsNow's key guard), never in a frame that changes none of them. What the
// answer is made from, the scratch lists and the tests' pairs, is not made again for it: scalars and the kept lists below.)
// alloc-rare: the answer's own lists, made only when the vessels are binned again (stage.js syncVeinsNow's key guard: a changed layout, vessel set or reach)
const members = (n) => { const m = []; for (let i = 0; i < n; i++) m.push(i); return m; };
export function forkJoins(dirs) {
  const n = dirs.length;
  // A crowded join (more than four ends: the hepatic veins' at the cava) keeps every pair filleted.
  if (n > 4) {
    // alloc-rare: the answer's own lists, made only when the vessels are binned again (stage.js syncVeinsNow's key guard: a changed layout, vessel set or reach)
    const groups = [];
    // alloc-rare: the answer's own groups, made only when the vessels are binned again (a changed layout, vessel set or reach)
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) groups.push({ members: [a, b], fillet: 1 });
    // alloc-rare: the answer, made only when the vessels are binned again
    return { groups, runOn: null };
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
  // alloc-rare: the answer, made only when the vessels are binned again
  if (!found) return { groups: [{ members: members(n), fillet: 1 }], runOn: null };
  // alloc-rare: the answer, made only when the vessels are binned again
  if (n === 2) return { groups: [{ members: members(n), fillet: bestFil }], runOn: [bestA, bestB] };
  // The run-on pair joined as one course with no fillet (its courses and calibers are eased to meet, so a fillet would
  // only swell the seam), and each of its ends filleted to the rest. In those two the run-on end is the trunk the rest
  // end on (`trunk`: its member), so the shader asks of each pair only whether the tributary lies off the trunk's
  // straight course toward the pixel, not also which way the tributary's own nearest segment runs (the azygos arch's
  // bend, onto the cava above the heart, flipped that between its short segments and the fillet came in saw-teeth).
  // alloc-rare: the answer's groups, made only when the vessels are binned again
  const ga = [bestA], gb = [bestB];
  for (let i = 0; i < n; i++) if (i !== bestA && i !== bestB) { ga.push(i); gb.push(i); }
  // alloc-rare: the answer, made only when the vessels are binned again
  return { groups: [{ members: [bestA, bestB], fillet: 0 }, { members: ga, fillet: 1, trunk: bestA }, { members: gb, fillet: 1, trunk: bestB }], runOn: [bestA, bestB] };
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
// ends: for each end at the node, { dir (as forkJoins', or null), strand }. Returns forkJoins' answer, the indexes those of `ends`.
// (Kept lists the pass sorts the ends into, written again each call; used inside one call, which forkJoins' answer does not alias.)
const LEAD = [], STRANDS = [], LEAD_DIRS = [];
export function nodeJoins(ends) {
  LEAD.length = 0; STRANDS.length = 0;
  for (let i = 0; i < ends.length; i++) (ends[i].strand ? STRANDS : LEAD).push(i);
  const lead = LEAD, strands = STRANDS;
  // Nothing to set apart (no strands, or fewer than two vessels): as forkJoins gives it.
  if (!strands.length || lead.length < 2) {
    LEAD_DIRS.length = 0;
    for (let i = 0; i < ends.length; i++) LEAD_DIRS.push(ends[i].dir);
    return forkJoins(LEAD_DIRS);
  }
  LEAD_DIRS.length = 0;
  for (let i = 0; i < lead.length; i++) LEAD_DIRS.push(ends[lead[i]].dir);
  const fj = forkJoins(LEAD_DIRS);
  // alloc-rare: the answer, made only when the vessels are binned again (a changed layout, vessel set or reach)
  const groups = [];
  for (let gi = 0; gi < fj.groups.length; gi++) {
    // alloc-rare: the answer's own lists, made only when the vessels are binned again (stage.js syncVeinsNow's key guard: a changed layout, vessel set or reach)
    const g = fj.groups[gi], ms = [];
    for (let k = 0; k < g.members.length; k++) ms.push(lead[g.members[k]]);
    // alloc-rare: the answer's groups, made only when the vessels are binned again
    const out = { ...g, members: ms };
    if (g.trunk != null) out.trunk = lead[g.trunk];
    groups.push(out);
  }
  // (The vessels first, then each strand with every end before it: lead then strands, as a concatenated list.)
  const nl = lead.length, total = nl + strands.length;
  for (let a = 0; a < total; a++) {
    for (let b = Math.max(a + 1, nl); b < total; b++) {
      // alloc-rare: the answer's pairs, made only when the vessels are binned again
      groups.push({ members: [a < nl ? lead[a] : strands[a - nl], strands[b - nl]], fillet: 1, strand: true });
    }
  }
  let runOn = fj.runOn;
  // alloc-rare: the answer, made only when the vessels are binned again
  if (runOn) runOn = [lead[runOn[0]], lead[runOn[1]]];
  // alloc-rare: the answer, made only when the vessels are binned again
  return { groups, runOn };
}

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
