// The stent as path data (pure: no DOM, no styles). stage-transitions.js meshPaths hands it the vessel's frame and wraps the strings in
// SVG paths; the overlays' GPU painter draws them like every other mark. Anchored at a = 0 (the end the stent is unrolled from, the portal
// end of a shunt), running A along the vessel, drawn k of the way (0 to 1).
/** The bare stretch of the TIPS stent, in drawn length: BARE_CM of the shunt's lenCm, at most `max` of it. */
export const BARE_CM = 2;
export const bareOf = (drawn, lenCm, max = 0.4) => drawn * Math.min(max, BARE_CM / (lenCm > 0 ? lenCm : 8));

// ---------------------------------------------------------------------------------------------------------------------------------
// The stent as a device (look T2, Mohammad 13 Nov 2026, from the Viatorr photos; mocks /mnt/project-files/tips-stent-mocks/clear/): a
// tube, not a strip. Every piece is placed on the cylinder (along it, a; round it, the angle th, seen at v = sin th across), so the
// rings bend away at the edges and the far half shows through. Covered stretch: a white ePTFE graft, white where the light falls and
// nearly clear on the shaded side (nested fills, one per light level), rounded zig-zag rings nested along it, ending along the last
// ring's crowns. Bare stretch: open cells (rings whose crowns touch), ending in round crowns. A gold band where the graft starts and a
// gold tab near the far end. All of it is paths for the overlays' GPU painter (fills and round-joined strokes), nothing per pixel on the CPU.

/** The light the stent is shaded by (the figure's: from the top left, in the world's axes, y down). */
const LIGHT = (() => { const v = [-0.5, -0.62, 0.6], l = Math.hypot(...v); return v.map((x) => x / l); })();
/** The graft's opacity at light level lam (T2: 0.86 lit, a tenth of that on the shaded side, a smooth step between 0.45 and 0.9). */
const step01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };   // (a smoothstep in light level, not in time)
export const graftAlpha = (lam) => 0.86 * (0.1 + 0.9 * step01((lam - 0.45) / 0.45));
/** The light levels the graft is cut at; each fill covers where the light is at least its level. */
export const GRAFT_LEVELS = [0.45, 0.55, 0.65, 0.75, 0.84];
const RING_STEPS = 40;   // (points per half ring: about 16 per crown, so a crown is a round turn at any zoom, never a corner; 18 drew them as kinks, 13 Nov 2026)

/**
 * f(a, v): the point at arc length a along the stent (0 = its portal end) and v across it (-1 to 1, the wall's two sides). A: its length.
 * bare: the open stretch from the start (A or more: an all-bare stent, the veins' and the stent tool's). k: how much of it is drawn.
 * Returns { backBare, backCov, graft: [[d, opacity]], frontBare, frontCov, glint, band, tab } (path data; '' or [] where there is none).
 */
export function stentLookD(f, A, bare = A, k = 1) {
  const e = A * Math.min(1, Math.max(0, k)), out = { backBare: '', backCov: '', graft: [], frontBare: '', frontCov: '', glint: '', band: '', tab: '' };
  if (!(e > 0.5)) return out;
  const p0 = f(0, 1), q0 = f(0, -1), R0 = Math.hypot(p0[0] - q0[0], p0[1] - q0[1]) / 2 || 1, u = R0 / 12;   // (u: the mocks' unit, a twelfth of the half-width)
  const covered = bare > 0.5 && bare < A - 4 * u;
  const SB = covered ? bare : A, BOW = 1.5 * u;   // (BOW: how far the band, round the tube, curves toward the far end at its sides; the bare crowns at SB stay under its stroke)
  // the light level at (a, v): the wall's normal is v across (the side direction) and sqrt(1 - v^2) towards the viewer
  const side = (a) => { const p = f(a, 1), q = f(a, -1), dx = p[0] - q[0], dy = p[1] - q[1], l = Math.hypot(dx, dy) || 1; return (dx * LIGHT[0] + dy * LIGHT[1]) / l; };
  const P = (q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`;
  // one ring: centre s, crown height A_, Nc crowns round, phase ph; front (v = sin th, th in -pi/2..pi/2) or back half
  const ring = (s, Ah, Nc, ph, back) => {
    let d = '';
    for (let i = 0; i <= RING_STEPS; i++) {
      const th = (back ? Math.PI / 2 : -Math.PI / 2) + Math.PI * i / RING_STEPS, a = s + Ah * Math.cos(Nc * th + ph);
      if (a < -0.01 || a > e + 0.01) { d += ' '; continue; }
      d += (i && !d.endsWith(' ') ? ' L' : 'M') + P(f(a, Math.sin(th)));
    }
    return d.replace(/\s+M/g, ' M').trim() + ' ';
  };
  const glintOf = (s, Ah, Nc, ph) => {   // the lit part of a front ring, for a thin bright core along the wire
    let d = '', on = false;
    for (let i = 0; i <= RING_STEPS; i++) {
      const th = -Math.PI / 2 + Math.PI * i / RING_STEPS, v = Math.sin(th), a = s + Ah * Math.cos(Nc * th + ph);
      const lit = a >= 0 && a <= e && v * side(a) + Math.cos(th) * LIGHT[2] > 0.72;
      if (lit) { d += (on ? ' L' : ' M') + P(f(a, v)); on = true; } else on = false;
    }
    return d.trim() ? d.trim() + ' ' : '';
  };
  // the bare stretch: rings of 5 crowns, every other one turned half a crown, so crowns meet and close the cells; the first ring's crowns are the round tips.
  // The rings fill the stretch exactly (about 17 units each), so the last ring's crowns reach the gold band and the open cells run straight on into the
  // covered stent: one device, no gap at the band (Mohammad, 13 Nov 2026: "the two fragments are NOT connected").
  const t0 = 1.2 * u, bEnd = covered ? SB : A - 1.2 * u, Nb = Math.max(1, Math.round((bEnd - t0) / (17 * u))), Pb = (bEnd - t0) / Nb, Ab = Pb / 2;
  for (let i = 0; i < Nb; i++) {
    const s = t0 + Ab + i * Pb, ph = i & 1 ? Math.PI : 0;
    if (s - Ab > e) break;
    out.backBare += ring(s, Ab, 5, ph, true); out.frontBare += ring(s, Ab, 5, ph, false); out.glint += glintOf(s, Ab, 5, ph);
  }
  if (!covered) return out;
  // the covered stretch: rings of 5 rounded crowns nested along the graft; the graft ends along the last ring's crowns
  const Pc = 11 * u, Ac = 0.42 * Pc, s0c = SB + Ac + 2.5 * u, Kc = Math.max(0, Math.floor((A - 1.2 * u - Ac - s0c) / Pc)), sLast = s0c + Kc * Pc;
  for (let i = 0; i <= Kc; i++) {
    const s = s0c + i * Pc;
    if (s - Ac > e) break;
    out.backCov += ring(s, Ac, 5, 0, true); out.frontCov += ring(s, Ac, 5, 0, false); out.glint += glintOf(s, Ac, 5, 0);
  }
  // the graft: where the light is at least each level, from the band to the scalloped end (the far end's crowns), cut at k when drawn part of the way
  const endAt = (v) => Math.min(e, sLast + Ac * Math.cos(5 * Math.asin(Math.max(-1, Math.min(1, v)))) + 1.4 * u);
  const startAt = (v) => Math.min(e, SB + BOW * (1 - Math.sqrt(Math.max(0, 1 - v * v))));   // (the graft starts along the band)
  const sMax = Math.min(e, sLast - Ac + 1.4 * u), step = Math.max(1, 3 * u);
  const edgeOf = (lvl, a) => {   // the span of v round the front where the light is at least lvl: [lo, hi], or null
    if (lvl <= 0) return [-1, 1];
    const p = side(a), z = LIGHT[2], m2 = p * p + z * z;
    if (lvl * lvl >= m2) return null;
    const r = z * Math.sqrt(m2 - lvl * lvl), lo = Math.max(-1, (p * lvl - r) / m2), hi = Math.min(1, (p * lvl + r) / m2);
    return hi > lo ? [lo, hi] : null;
  };
  // The graft's two ends, from v0 round to v1, at the place at(v) along it: evenly spaced round the tube (in the angle, not across it), finely enough that the
  // scallops are round, and the same curve for every light level's fill, so the fills' ends lie on one another (13 Nov 2026: sampled a few times across the width,
  // each fill cut its own chords through the crowns near the sides, and the stacked ends showed as a ragged top end).
  const arcAt = (v0, v1, at) => {
    const t0 = Math.asin(Math.max(-1, Math.min(1, v0))), t1 = Math.asin(Math.max(-1, Math.min(1, v1))), n = Math.max(6, Math.ceil(Math.abs(t1 - t0) / Math.PI * 2 * RING_STEPS)), o = [];
    for (let i = 0; i <= n; i++) { const v = Math.sin(t0 + (t1 - t0) * i / n); o.push(f(at(v), v)); }
    return o;
  };
  const levels = [0, ...GRAFT_LEVELS];
  let below = 0;   // (the opacity the fills under this one already give)
  for (let j = 0; j < levels.length; j++) {
    const lvl = levels[j], next = levels[j + 1] ?? 1, want = graftAlpha(j === 0 ? 0 : (lvl + next) / 2);
    const op = Math.max(0, 1 - (1 - want) / (1 - below)); below = want;
    if (!(op > 0.004) || sMax <= SB) continue;
    const hiE = [], loE = [], sp0 = edgeOf(lvl, SB), start = [];
    if (sp0) start.push(...arcAt(sp0[0], sp0[1], startAt));
    for (let a = Math.min(sMax, SB + BOW); ; a = Math.min(sMax, a + step)) {
      const sp = edgeOf(lvl, a);
      if (sp) { hiE.push(f(a, sp[1])); loE.push(f(a, sp[0])); }
      if (a >= sMax) break;
    }
    if (hiE.length < 2) continue;
    const spEnd = edgeOf(lvl, sMax), cap = [];
    if (spEnd) cap.push(...arcAt(spEnd[1], spEnd[0], (v) => Math.max(sMax, endAt(v))));
    out.graft.push(['M' + [...start, ...hiE, ...cap, ...loE.reverse()].map(P).join(' L') + ' Z', +op.toFixed(3)]);
  }
  // the gold band where the graft starts (bowed with the cylinder), and the gold tab near the far end
  if (e >= SB) {
    let d = '';
    for (let i = 0; i <= RING_STEPS; i++) { const th = -Math.PI / 2 + Math.PI * i / RING_STEPS; d += (i ? ' L' : 'M') + P(f(SB + BOW * (1 - Math.cos(th)), Math.sin(th))); }
    out.band = d;
  }
  const ts = sLast - Pc * 0.55;
  if (ts + 3.4 * u <= e) out.tab = `M${P(f(ts - 3.4 * u, Math.sin(0.32)))} L${P(f(ts + 3.4 * u, Math.sin(0.32)))}`;
  return out;
}
