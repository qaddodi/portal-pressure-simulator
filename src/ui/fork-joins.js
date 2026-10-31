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
export function forkJoins(dirs) {
  const n = dirs.length;
  const all = (fillet) => ({ members: dirs.map((_, i) => i), fillet });
  // A crowded join (more than four ends: the hepatic veins' at the cava) keeps every pair filleted.
  if (n > 4) {
    const groups = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) groups.push({ members: [a, b], fillet: 1 });
    return { groups, runOn: null };
  }
  // The most nearly head-on pair runs on (each end runs on into one other at most). In a fork only a pair that is nearly
  // straight (more than about 130° apart) does: the arms of an even Y stay filleted to each other.
  let best = null;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const u = dirs[a], v = dirs[b];
    if (!u || !v) continue;
    const fil = Math.min(1, Math.max(0, (u[0] * v[0] + u[1] * v[1] + 0.9) / 0.5));
    if (fil < (n === 2 ? 1 : 0.5) && (!best || fil < best.fil)) best = { a, b, fil };
  }
  if (!best) return { groups: [all(1)], runOn: null };
  if (n === 2) return { groups: [all(best.fil)], runOn: [best.a, best.b] };
  // The run-on pair joined as one course with no fillet (its courses and calibers are eased to meet, so a fillet would
  // only swell the seam), and each of its ends filleted to the rest. In those two the run-on end is the trunk the rest
  // end on (`trunk`: its member), so the shader asks of each pair only whether the tributary lies off the trunk's
  // straight course toward the pixel, not also which way the tributary's own nearest segment runs (the azygos arch's
  // bend, onto the cava above the heart, flipped that between its short segments and the fillet came in saw-teeth).
  const rest = dirs.map((_, i) => i).filter((i) => i !== best.a && i !== best.b);
  return {
    groups: [{ members: [best.a, best.b], fillet: 0 }, { members: [best.a, ...rest], fillet: 1, trunk: best.a }, { members: [best.b, ...rest], fillet: 1, trunk: best.b }],
    runOn: [best.a, best.b],
  };
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
export function nodeJoins(ends) {
  const lead = [], strands = [];
  ends.forEach((e, i) => (e.strand ? strands : lead).push(i));
  // Nothing to set apart (no strands, or fewer than two vessels): as forkJoins gives it.
  if (!strands.length || lead.length < 2) return forkJoins(ends.map((e) => e.dir));
  const fj = forkJoins(lead.map((i) => ends[i].dir));
  const groups = fj.groups.map((g) => ({ ...g, members: g.members.map((m) => lead[m]), ...(g.trunk != null ? { trunk: lead[g.trunk] } : {}) }));
  const order = lead.concat(strands);
  for (let a = 0; a < order.length; a++) for (let b = Math.max(a + 1, lead.length); b < order.length; b++) groups.push({ members: [order[a], order[b]], fillet: 1, strand: true });
  return { groups, runOn: fj.runOn && fj.runOn.map((m) => lead[m]) };
}

// A shunt drawn onto the side of a vein (stage.js SIDE_HOSTS: the splenorenal shunt on the splenic and renal veins) ends
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
