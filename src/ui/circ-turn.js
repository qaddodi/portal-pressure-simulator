// The turn the circuit's side of a change between the views is laid out in (vessel-transition-recs rec 2 / v3.1, 4 Nov 2026).
// Through a change the world is never turned: the circuit's side is laid out already turned about CIRC_C by the turn's share (rotU,
// read live, so a toggle mid-change stays continuous), and the figure lerps straight to its upright place with no spin. Landed, the
// world turn (rotDeg) takes over: C plus that turn is the same picture, so nothing pops at either end.
export function createCircTurn(CIRC_C, rotEase, rotU) {
  // t: the change's eased share (0 < t < 1 is mid-change). on false: no turn (the anatomy, a landed view, a wide circuit).
  // Written in place: every caller reads it at once.
  const CT = { on: false, c: 1, s: 0, rr: 0 };
  function circTurn(t) {
    const rr = t > 0 && t < 1 ? rotEase(rotU()) : 0;
    if (rr !== CT.rr) { CT.rr = rr; if (rr === 1) { CT.c = 0; CT.s = -1; } else { const a = (-Math.PI / 2) * rr; CT.c = Math.cos(a); CT.s = Math.sin(a); } }
    CT.on = rr !== 0;
    return CT;
  }
  const ctOut = [0, 0];   // (circTurnPt's answer, read at once)
  function circTurnPt(p, t) {
    const T = circTurn(t);
    if (!T.on) return p;
    const dx = p[0] - CIRC_C[0], dy = p[1] - CIRC_C[1];
    ctOut[0] = CIRC_C[0] + T.c * dx - T.s * dy; ctOut[1] = CIRC_C[1] + T.s * dx + T.c * dy;
    return ctOut;
  }
  // A liver branch of the circuit (x.cbr) at t of the change: its own course, or (upright circuit, mid-change) a turned copy, made again only
  // when the turn's share moves (alloc-rare: once per change on an upright circuit, each frame only while the turn is toggled mid-change).
  function cbAt(cb, t) {
    const T = circTurn(t);
    if (!T.on) return cb.c0;
    if (cb.trR !== T.rr) {
      const cx = CIRC_C[0], cy = CIRC_C[1], tc = T.c, ts = T.s;
      cb.tr = cb.c0.map((p) => { const dx = p[0] - cx, dy = p[1] - cy; return [cx + tc * dx - ts * dy, cy + ts * dx + tc * dy]; });
      cb.trR = T.rr;
    }
    return cb.tr;
  }
  return { cbAt, circTurn, circTurnPt };
}
