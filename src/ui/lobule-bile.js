// The Lobule view's bile (Mohammad, 16 Nov 2026; the Layers menu's Bile switch). Bile runs against the blood, central vein to portal tract:
// one channel per hepatocyte plate starts against its sinusoid, in the space of Disse, about a quarter of the way out from the central vein,
// tapering in from nothing, and runs beside the sinusoid (never into or under it), thickening outward. At the limiting plate it crosses under
// the inlet venule and the lymphatic as a short canal of Hering and meets, square, the duct that runs along the lobule's edge just outside
// the lymphatic. Each half of an edge has one such duct, from the middle of the edge (where it meets the next half's) to its corner's bile
// ductule. The duct on the ductule's own side curves in from below; the one on the far side curves down between the portal venule and the
// lymphatic's disc, under the lymphatics, into the top of the ductule. All of it is drawn in the lowest tier (lobule-pick.js tierOf).
// Built once per stage size, with the rest of the lobule's geometry (lobule-zoom.js build).

import { lerp, clamp01 } from './num.js';

const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const unit = (x, y) => { const L = Math.hypot(x, y) || 1; return [x / L, y / L]; };   // alloc-rare: geometry built only on a stage-size change
// (each pass moves every inner point a quarter of the way toward its neighbours' mean)
const smoothPoly = (P, n = 1) => { let Q = P; for (let k = 0; k < n; k++) Q = Q.map((q, i) => (i === 0 || i === Q.length - 1 ? q : [(Q[i - 1][0] + 2 * q[0] + Q[i + 1][0]) / 4, (Q[i - 1][1] + 2 * q[1] + Q[i + 1][1]) / 4])); return Q; };   // alloc-rare: geometry built only on a stage-size change
const nearIdx = (pts, x, y) => { let b = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - x, pts[i][1] - y); if (d < bd) { bd = d; b = i; } } return b; };
// The sinusoid kinds' width, as drawn, against the narrowest (s0): the channel keeps clear of the widest sleeve of Disse round each.
const RS_K = { s0: 1, s1: 1.15, s2: 1.3 };

/** Adds the bile channels and ducts to the lobule being built. `g`: what build() has made so far (its tubes, add, join, curve, at, L0, inlets,
 *  triads, corners C) and its sizes (N samples per vessel, N0 first-generation sinusoids per edge, R, rsN, rs0, cx, cy). Returns the number of
 *  plate channels. Every vessel added carries `bile: true` (and `lymph: true`, so the blood-only set leaves it out). */
export function addBile(g) {
  const { tubes, add, join, curve, at, L0, inlets, triads, C, N, N0, R, rsN, rs0, cx, cy } = g;
  // which side of its parent a child sinusoid leaves on
  const sideOf = (ch, par) => { const dP = unit(par.pts[0][0] - par.pts[1][0], par.pts[0][1] - par.pts[1][1]), dC = unit(ch.pts[N - 2][0] - ch.pts[N - 1][0], ch.pts[N - 2][1] - ch.pts[N - 1][1]); return dP[0] * dC[1] - dP[1] * dC[0] >= 0 ? 1 : -1; };   // alloc-rare: geometry built only on a stage-size change
  // the lane beside a sinusoid, outward from its point `from`, each point tagged with the sinusoid's centre there and how close it may hug it
  const lanePts = (T, side, from) => {   // alloc-rare: geometry built only on a stage-size change
    const P = T.pts, out = [], off = rsN * (RS_K[T.kind] || 1) * 1.25 + rs0 * 0.62 + Math.max(2, R * 0.008), hug = (rsN * (RS_K[T.kind] || 1) + rs0 * 0.35) / off;   // alloc-rare: geometry built only on a stage-size change
    for (let i = N - 1 - from; i >= 0; i--) {
      const a = P[Math.min(N - 1, i + 1)], b = P[Math.max(0, i - 1)], [tx, ty] = unit(b[0] - a[0], b[1] - a[1]);
      out.push(Object.assign([P[i][0] - ty * side * off, P[i][1] + tx * side * off], { bx: P[i][0], by: P[i][1], hug }));   // alloc-rare: geometry built only on a stage-size change
    }
    return out;
  };
  // the inlet venule's outward normal at its point i (away from the central vein)
  const outN = (inl, i) => { const a = inl.pts[Math.max(0, i - 1)], b = inl.pts[Math.min(N - 1, i + 1)], [tx, ty] = unit(b[0] - a[0], b[1] - a[1]); let nx = -ty, ny = tx; if (nx * (inl.pts[i][0] - cx) + ny * (inl.pts[i][1] - cy) < 0) { nx = -nx; ny = -ny; } return [nx, ny]; };   // alloc-rare: geometry built only on a stage-size change
  const rIn = R * 0.012, start = R * 0.25;
  const halves = new Map();   // alloc-rare: geometry built only on a stage-size change (inlet id -> { inl, conn: the canals that reach it })
  L0.forEach((leaf, li) => {   // alloc-rare: geometry built only on a stage-size change
    const e = leaf.edge, k = leaf.k ?? (li % N0), h = k < N0 / 2 ? 0 : 1, jj = h === 0 ? k : N0 - 1 - k;
    const inl = tubes[leaf.inl], A = C[e], B = C[(e + 1) % 6], ed = unit(B[0] - A[0], B[1] - A[1]), want = h === 0 ? 1 : -1;
    const P1 = leaf.parent != null ? tubes[leaf.parent] : null, P2 = P1 && P1.parent != null ? tubes[P1.parent] : null;
    // the plate's channel runs on the sinusoid's side that faces the middle of the edge, from as far in as its parents run on that side
    const q0 = leaf.pts[0], q1 = leaf.pts[1], [tx, ty] = unit(q0[0] - q1[0], q0[1] - q1[1]);
    const side = (-ty * ed[0] + tx * ed[1]) * want >= 0 ? 1 : -1;
    const far = (q) => Math.hypot(q[0] - cx, q[1] - cy) > start;   // alloc-rare: geometry built only on a stage-size change
    let poly = [];   // alloc-rare: geometry built only on a stage-size change
    if (P1 && sideOf(leaf, P1) === side) {
      const chain = [P1, leaf]; if (P2 && sideOf(P1, P2) === side) chain.unshift(P2);   // alloc-rare: geometry built only on a stage-size change
      chain.forEach((T, ci) => { const Q = lanePts(T, side, 0).filter(far); poly = poly.concat(ci === 0 || !poly.length ? Q : Q.slice(1)); });   // alloc-rare: geometry built only on a stage-size change
    } else poly = lanePts(leaf, side, Math.ceil(0.14 * N)).filter(far);   // (in the crotch of a pair: it starts a little past the fork)   // alloc-rare: geometry built only on a stage-size change
    if (poly.length < 3) return;
    // it starts against its sinusoid, in the space of Disse, and eases out to its lane over the first stretch
    { let s = 0; poly = poly.map((q, i) => { if (i) s += Math.hypot(q[0] - poly[i - 1][0], q[1] - poly[i - 1][1]); if (q.bx == null) return q; const f = lerp(q.hug, 1, smooth(0, R * 0.14, s)); return [q.bx + (q[0] - q.bx) * f, q.by + (q[1] - q.by) * f]; }); }   // alloc-rare: geometry built only on a stage-size change
    // near the edge it leaves its sinusoid for the plate's centre line and ends just inside the inlet venule
    const nb = L0[li + (h === 0 ? 1 : -1)], mid = jj === N0 / 2 - 1 || !nb || nb.edge !== e ? inl.pts[N - 1] : nb.pts[0];
    const ic = nearIdx(inl.pts, (q0[0] + mid[0]) / 2, (q0[1] + mid[1]) / 2), P = inl.pts[ic], nO = outN(inl, ic), dEnd = rIn + R * 0.012;
    const pts = [];   // alloc-rare: geometry built only on a stage-size change
    for (const q of poly) {
      const d = (P[0] - q[0]) * nO[0] + (P[1] - q[1]) * nO[1];
      if (d <= dEnd) break;
      const w = 1 - smooth(R * 0.035, R * 0.1, d);
      pts.push([q[0] + w * (P[0] - nO[0] * d - q[0]), q[1] + w * (P[1] - nO[1] * d - q[1])]);   // alloc-rare: geometry built only on a stage-size change
    }
    if (pts.length < 3) return;
    pts.push([P[0] - nO[0] * dEnd, P[1] - nO[1] * dEnd]);   // alloc-rare: geometry built only on a stage-size change
    if (!halves.has(inl.id)) halves.set(inl.id, { inl, conn: [] });   // alloc-rare: geometry built only on a stage-size change
    halves.get(inl.id).conn.push({ pts, P, nO, ic });   // alloc-rare: geometry built only on a stage-size change
  });
  // One duct per half edge, just outside the lymphatic, from the middle of the edge to the corner's ductule; the canals join it square.
  const mids = new Map();   // alloc-rare: geometry built only on a stage-size change
  let plates = 0;
  for (const { inl, conn } of halves.values()) {
    const tr = triads[inl.tri], o = R * 0.055, leg = [], D = tr.bd;   // alloc-rare: geometry built only on a stage-size change
    // (straight along the edge past every canal that joins it; it turns for the ductule only beyond the last)
    const icMin = Math.min(...conn.map((c) => c.ic)), iEnd = Math.max(Math.round(0.1 * (N - 1)), icMin - Math.round(0.06 * (N - 1)));   // alloc-rare: geometry built only on a stage-size change
    const outAt = (i) => { const n = outN(inl, i), q = inl.pts[i]; return [q[0] + n[0] * o, q[1] + n[1] * o]; };   // alloc-rare: geometry built only on a stage-size change
    for (let i = N - 1; i >= iEnd; i--) leg.push(outAt(i));
    const legS = smoothPoly(leg, 2), Pe = legS[legS.length - 1], Pp = legS[legS.length - 3], tc = unit(Pe[0] - Pp[0], Pe[1] - Pp[1]);
    // The way into the ductule, laid out in the portal tract's own frame in thousandths of R: the portal venule at 0, out along the corner's
    // bisector is -x and toward the ductule's side +y (the ductule sits at -50, 75; the lymphatic's disc at -90, 0).
    const bis = [Math.cos(tr.a), Math.sin(tr.a)], dd = [D[0] - tr.x, D[1] - tr.y], pd = dd[0] * bis[0] + dd[1] * bis[1], pp = unit(dd[0] - bis[0] * pd, dd[1] - bis[1] * pd);   // alloc-rare: geometry built only on a stage-size change
    const sk = (sx, sy) => [tr.x + (-bis[0] * sx + pp[0] * sy) * R / 1000, tr.y + (-bis[1] * sx + pp[1] * sy) * R / 1000];   // alloc-rare: geometry built only on a stage-size change
    const bez = (A, a1, b1, B2) => { for (let k = 1; k <= 14; k++) { const u = k / 14, v = 1 - u; legS.push([v * v * v * A[0] + 3 * v * v * u * a1[0] + 3 * v * u * u * b1[0] + u * u * u * B2[0], v * v * v * A[1] + 3 * v * v * u * a1[1] + 3 * v * u * u * b1[1] + u * u * u * B2[1]]); } };   // alloc-rare: geometry built only on a stage-size change
    if (inl === inlets[tr.i * 2]) {
      // the far side: down between the portal venule and the lymphatic's disc, under the lymphatics, into the top of the ductule
      const c2 = sk(-52, -28), M = sk(-58, 8), d1 = Math.hypot(M[0] - Pe[0], M[1] - Pe[1]);
      bez(Pe, [Pe[0] + tc[0] * d1 * 0.4, Pe[1] + tc[1] * d1 * 0.4], c2, M);   // alloc-rare: geometry built only on a stage-size change
      bez(M, [2 * M[0] - c2[0], 2 * M[1] - c2[1]], sk(-58, 52), D);   // alloc-rare: geometry built only on a stage-size change
    } else {
      // the ductule's own side: along its edge, then into the ductule from below
      const d1 = Math.hypot(D[0] - Pe[0], D[1] - Pe[1]);
      bez(Pe, [Pe[0] + tc[0] * d1 * 0.4, Pe[1] + tc[1] * d1 * 0.4], sk(-28, 98), D);   // alloc-rare: geometry built only on a stage-size change
    }
    const legT = add('bh', curve((u) => at(legS, u)), { tri: tr.i, lymph: true, bile: true }); legT.radius = legT.pts.map((_, i) => Math.max(0.9, R * lerp(0.004, 0.0078, i / (N - 1))));   // alloc-rare: geometry built only on a stage-size change (radii fixed here: lobule-zoom-field.js radiusAt)
    join(D[0], D[1], [tr.bdT, legT], R * 0.004);   // alloc-rare: geometry built only on a stage-size change
    mids.set(inl.id, legT);
    for (const c of conn) {
      const tgt = outAt(c.ic), Lp = legT.pts[nearIdx(legT.pts, tgt[0], tgt[1])];
      const cp = [...c.pts, [c.P[0], c.P[1]], [c.P[0] + c.nO[0] * R * 0.03, c.P[1] + c.nO[1] * R * 0.03], Lp];   // alloc-rare: geometry built only on a stage-size change
      const t = add('bs', curve((u) => at(smoothPoly(cp, 1), u)), { lymph: true, bile: true }); t.radius = t.pts.map((_, i) => R * lerp(0.0004, 0.0036, smooth(0.22, 1, t.rho[i])) * smooth(0, 0.3, i / (N - 1)) ** 1.5);   // alloc-rare: geometry built only on a stage-size change (radii fixed here: lobule-zoom-field.js radiusAt)
      join(Lp[0], Lp[1], [legT, t], R * 0.003);   // alloc-rare: geometry built only on a stage-size change
      plates++;
    }
  }
  // the two halves of each edge meet at its middle, so the ductules of neighbouring portal tracts are joined end to end
  for (let e = 0; e < 6; e++) { const a = mids.get(inlets[e * 2].id), b = mids.get(inlets[((e + 1) % 6) * 2 + 1].id); if (a && b) join(a.pts[0][0], a.pts[0][1], [a, b], R * 0.0036); }   // alloc-rare: geometry built only on a stage-size change
  return plates;
}

/** The Bile layer's moving marks, written into the lobule's flow rows (as the lymph's: a dash phase and pitch, the protein for the core, the
 *  dark theme's flag, -1 marking a lymph-style row, and the compositor's stream in floats 28 and 29). Only the edge ducts move, slowly, toward
 *  the ductule; the plate channels stay still (bile moves by diffusion there and starts to flow in the ductules, as the Sinusoid view draws it). */
export function bileFlowInto(flowData, tubeSet, motionOf, { R, dt, protein, dark, still, texels, period }) {
  const pitch = R * 0.06, v = R * 0.021;
  for (const t of tubeSet) {
    if (t.kind !== 'bh') continue;
    const mo = motionOf(t), o = t.id * texels * 4;
    mo.ld = ((((mo.ld ?? t.id * 0.371 * pitch) + (still ? 0 : dt * v)) % pitch) + pitch) % pitch;
    flowData[o] = mo.ld; flowData[o + 1] = pitch; flowData[o + 2] = protein; flowData[o + 3] = dark ? 1 : 0; flowData[o + 4] = -1; flowData[o + 6] = 1;
    mo.lyD = ((((mo.lyD ?? (t.id * 977) % period) + (still ? 0 : v * 0.5 * dt)) % period) + period) % period;
    flowData[o + 28] = mo.lyD; flowData[o + 29] = still ? 1e-3 : v * 0.5;
  }
}

/** The end-on discs' mouths (lobule-mouths.js mouthSite) as they are with the Bile layer off: no opening in the ductule's rim where no duct is drawn. */
export function mouthsWithoutBile(mouths, tubes, joins, mouthSite) {
  const out = new Map(), noBile = joins.filter((j) => j.members.every((id) => !tubes[id].bile));   // alloc-rare: geometry built only on a stage-size change
  for (const [id, site] of mouths) { const s = mouthSite(tubes[id], tubes, noBile, site.rim); if (s) out.set(id, s); }
  return out;
}
