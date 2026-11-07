// One continuous taper along each run of vessels that run on into one another (the portal branches into the sinusoid
// stretches into the hepatic veins, the mesenteric veins, the renal vein: any chain of vessels joined end to end at two-vessel
// nodes). The vessels' own calibers are the readings of the model; this decides only how the drawn width passes from one to
// the next, so the drawing never moves a vessel and a vessel with no neighbour is not touched.
//
// Before, a vessel kept its own caliber over its whole course and each join eased the two ends toward each other with a
// smoothstep over half of each course counted in samples, not in length: a long vessel and a short one met at a slope three
// times steeper on one side than on the other (a kink at the join), and a run of vessels read as plateau, ramp, plateau.
//
// Now each chain is a station list along its arc length. A chain's free ends (a vessel with nothing running on at that end, or
// one that ends in a fork, which keeps its own caliber there: the fork's fillet takes the step) stand at the vessel's own
// caliber; each node between two vessels of the chain stands at the mean of the two calibers (what the old ease met at). A
// monotone cubic (Fritsch–Carlson / Butland slopes, flat at the chain's free ends) runs through the stations in real
// length, so the caliber AND its slope are continuous through every node, the width never overshoots the two calibers it
// passes between, and a run of equal calibers stays exactly flat.
//
// planTaper(vessels, links) → Map id → { y0, y1, d0, d1, j0, j1 }: the radius at the vessel's start (u = 0) and end (u = 1) and its
// slope there, per unit of length, along u; j0 and j1 say which ends run on into another vessel of the chain. taperAt(plan, len, u)
// is the radius at u. Vessels with no link are not in the answer.
//
//   vessels: Map id → { body (its own caliber, radius), len (its length) }
//   links:   [{ a, ea, b, eb }]: vessel a's end ea (0 start, 1 end) runs on into vessel b's end eb.

const key = (id, end) => `${id}:${end}`;

/** The chains the links make: each an array of { id, enter } (enter: the end the chain comes in by; 0 walks the vessel start to end). */
export function chainsOf(ids, links) {
  const next = new Map(); // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
  for (const { a, ea, b, eb } of links) {
    if (a === b || !ids.has(a) || !ids.has(b)) continue;
    const ka = key(a, ea), kb = key(b, eb);
    // (Each end runs on into one other at most: the first link an end appears in holds.)
    if (next.has(ka) || next.has(kb)) continue;
    next.set(ka, { id: b, end: eb });
    next.set(kb, { id: a, end: ea });
  }
  const seen = new Set(), chains = []; // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
  const walk = (id, enter) => { // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
    const chain = [];
    let cur = { id, end: enter };
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.push({ id: cur.id, enter: cur.end });
      cur = next.get(key(cur.id, 1 - cur.end));
    }
    return chain;
  };
  // A chain starts at a free end (a vessel with an end nothing runs on from) ...
  for (const id of ids) {
    if (seen.has(id) || (!next.has(key(id, 0)) && !next.has(key(id, 1)))) continue;
    if (!next.has(key(id, 0))) chains.push(walk(id, 0));
    else if (!next.has(key(id, 1))) chains.push(walk(id, 1));
  }
  // ... and what is left runs round in a loop: cut it at its first vessel.
  for (const id of ids) {
    if (seen.has(id) || (!next.has(key(id, 0)) && !next.has(key(id, 1)))) continue;
    chains.push(walk(id, 0));
  }
  return chains.filter((c) => c.length > 0); // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
}

/** Slopes of a monotone cubic through (s[i], y[i]): zero at both ends and wherever the data turn, else the weighted harmonic mean of the two secants. */
export function monotoneSlopes(s, y) {
  const n = s.length, d = new Array(n).fill(0); // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
  if (n < 3) return d;
  const h = [], k = []; // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
  for (let i = 0; i < n - 1; i++) { h.push(Math.max(s[i + 1] - s[i], 1e-9)); k.push((y[i + 1] - y[i]) / h[i]); }
  for (let i = 1; i < n - 1; i++) {
    if (k[i - 1] * k[i] <= 0) { d[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    d[i] = (w1 + w2) / (w1 / k[i - 1] + w2 / k[i]);
  }
  return d;
}

/** monotoneSlopes into given arrays, allocating nothing (the figure's per-frame taper, stage.js sendRadii): s, y the first n
 *  stations; d gets the slopes; h and k are scratch of at least n - 1. The same arithmetic as monotoneSlopes, in the same order. */
export function slopesInto(s, y, n, d, h, k) {
  for (let i = 0; i < n; i++) d[i] = 0;
  if (n < 3) return d;
  for (let i = 0; i < n - 1; i++) { h[i] = Math.max(s[i + 1] - s[i], 1e-9); k[i] = (y[i + 1] - y[i]) / h[i]; }
  for (let i = 1; i < n - 1; i++) {
    if (k[i - 1] * k[i] <= 0) { d[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    d[i] = (w1 + w2) / (w1 / k[i - 1] + w2 / k[i]);
  }
  return d;
}

/** One chain's plan (planTaper's, for a chain from chainsOf) written into plans made once: plan(id) gives the object to fill
 *  ({ y0, y1, d0, d1, j0, j1 }); bodyOf(id), lenOf(id) the vessel's caliber and length; S, Y, D, H, K scratch arrays of at least
 *  chain.length + 1. Allocates nothing; the numbers are planTaper's. */
export function planChainInto(chain, bodyOf, lenOf, plan, S, Y, D, H, K) {
  const n = chain.length;
  if (n < 2) return;
  S[0] = 0; Y[0] = bodyOf(chain[0].id);
  for (let i = 0; i < n; i++) {
    S[i + 1] = S[i] + Math.max(lenOf(chain[i].id), 1e-6);
    Y[i + 1] = i === n - 1 ? bodyOf(chain[i].id) : (bodyOf(chain[i].id) + bodyOf(chain[i + 1].id)) / 2;
  }
  slopesInto(S, Y, n + 1, D, H, K);
  for (let i = 0; i < n; i++) {
    const c = chain[i], first = i === 0, last = i === n - 1, p = plan(c.id);
    if (c.enter === 0) { p.y0 = Y[i]; p.y1 = Y[i + 1]; p.d0 = D[i]; p.d1 = D[i + 1]; p.j0 = !first; p.j1 = !last; }
    else { p.y0 = Y[i + 1]; p.y1 = Y[i]; p.d0 = -D[i + 1]; p.d1 = -D[i]; p.j0 = !last; p.j1 = !first; }
  }
}

export function planTaper(vessels, links) {
  const plan = new Map(); // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
  if (!links.length) return plan;
  const ids = new Set(vessels.keys()); // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
  for (const chain of chainsOf(ids, links)) {
    if (chain.length < 2) continue;
    const bodies = chain.map((c) => vessels.get(c.id).body); // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
    const lens = chain.map((c) => Math.max(vessels.get(c.id).len, 1e-6)); // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
    // Stations: the chain's start, each node, the chain's end.
    const s = [0], y = [bodies[0]]; // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
    for (let i = 0; i < chain.length; i++) {
      s.push(s[i] + lens[i]);
      y.push(i === chain.length - 1 ? bodies[i] : (bodies[i] + bodies[i + 1]) / 2);
    }
    const d = monotoneSlopes(s, y);
    chain.forEach((c, i) => { // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
      // Walked forward the vessel's u runs with the chain's length; walked back it runs against it (its start is the later station).
      // (j0, j1: the vessel runs on into another at that end, so its caliber there is the node's, not its own.)
      const first = i === 0, last = i === chain.length - 1;
      plan.set(c.id, c.enter === 0
        ? { y0: y[i], y1: y[i + 1], d0: d[i], d1: d[i + 1], j0: !first, j1: !last } // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
        : { y0: y[i + 1], y1: y[i], d0: -d[i + 1], d1: -d[i], j0: !last, j1: !first }); // alloc-rare: only when a vessel's caliber or the joined set changes (stage.js sendRadii, a model change), never on a steady frame
    });
  }
  return plan;
}

/** The planned radius at u (0 … 1) along a vessel of length len. */
export function taperAt(p, len, u) {
  // (Equal calibers and no slope: exactly that caliber, not a rounding away from it.)
  if (p.y0 === p.y1 && p.d0 === 0 && p.d1 === 0) return p.y0;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p.y0 + (u3 - 2 * u2 + u) * len * p.d0 + (-2 * u3 + 3 * u2) * p.y1 + (u3 - u2) * len * p.d1;
}
