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
  // The run-on pair joined as one course (with its own, lesser fillet), and each of its ends filleted to the rest.
  const rest = dirs.map((_, i) => i).filter((i) => i !== best.a && i !== best.b);
  return {
    groups: [{ members: [best.a, best.b], fillet: best.fil }, { members: [best.a, ...rest], fillet: 1 }, { members: [best.b, ...rest], fillet: 1 }],
    runOn: [best.a, best.b],
  };
}

// A shunt drawn onto the side of a vein (stage.js SIDE_HOSTS: the splenorenal shunt on the splenic and renal veins) ends
// at the vein's centreline. Over its last stretch inside the vein its lumen narrows to half, so its round end sits well
// inside the vein's walls and never shows past the far wall as a bump: the scale of its radius at distance d from that
// end (world units), for a vein of radius hostR. The narrowing lies within the vein (0.8 of its radius), out of sight.
export const SIDE_END_MIN = 0.5;
export function sideEndScale(d, hostR) {
  const s = 0.8 * hostR;
  if (!(s > 0) || d >= s) return 1;
  const u = Math.max(0, d) / s;
  return SIDE_END_MIN + (1 - SIDE_END_MIN) * u * u * (3 - 2 * u);
}
