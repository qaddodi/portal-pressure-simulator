// The portal tract's labels on the Lobule (Mohammad, 16 Nov 2026, iPhone: "the labels in the lobule are crossing each other, the placements
// seem wrong"). Once the arteriole and the ductule were named always, four labels stood round one tract, and two rules were missing:
// 1. Each sits on the side its vessel faces. The arteriole's and the ductule's spots were fixed screen offsets (up and to the left, up and to the
//    right), so on a lower corner they fell inside the tract and the search sent them across it, the Arteriole's beside the ductule.
//    Now each tract label stands out along the ray from the venule through what it names (the arteriole, the lymphatic and the ductule fan
//    out on the tract's outer arc, lobule-zoom.js TRIAD_A), and the venule's own beside them, out to the side; spokes of one hub never cross.
// 2. No leader runs over another vessel's dot. The Portal venule's leader passed over the arteriole's dot, so it seemed to name the arteriole.
//    A leader over the venule's disc or a dot of the tract other than its own costs as much as two crossed leaders (lobule-zoom-records.js solve).
// Pure geometry on screen coordinates; the layout keeps one record (fan) and rewrites it in place each layout.

// Where the triad's small vessels stand round its venule (lobule-zoom.js build): TRIAD_D (of the lobule's radius) out, the arteriole TRIAD_A
// radians one way of the outward ray, the ductule the other, the lymphatic on it.
export const TRIAD_D = 0.09, TRIAD_A = 0.98;
export const TRACT_KEYS = ['triad', 'ha', 'bd', 'lymph'];
// A tract label whose centre turns more than 60 degrees from its own spoke is on the wrong side of the tract.
export const FACE_COS = 0.5;
export const CLASH = 1e5;   // (as two crossed leaders, lobule-zoom-records.js solve: placed still, never left out for it)

/** The kept record: the venule's centre and radii, and per tract label its direction (the spoke). */
export const mkFan = () => ({
  on: false, px: 0, py: 0, keepR: 14, pvR: 8, satR: 6,
  dx: [0, 0, 0], dy: [0, 0, 0],   // the arteriole, the ductule and the lymphatic of the tract, on screen
  ux: { triad: 0, ha: 0, bd: 0, lymph: 0 }, uy: { triad: 0, ha: 0, bd: 0, lymph: 0 }, has: { triad: false, ha: false, bd: false, lymph: false },
  sx: { triad: 0, ha: 0, bd: 0, lymph: 0 }, sy: { triad: 0, ha: 0, bd: 0, lymph: 0 },   // each label's spot on its spoke
  box: [{ l: 0, r: 0, t: 0, b: 0 }, { l: 0, r: 0, t: 0, b: 0 }, { l: 0, r: 0, t: 0, b: 0 }, { l: 0, r: 0, t: 0, b: 0 }],
});
// The order the spots are set in: the two small names first, nearest the tract, then the lymphatic's and the venule's, each moved out along its
// own spoke just as far as it must to clear those already set (spokes of one hub, so moving out never makes two leaders cross).
const FAN_ORDER = ['ha', 'bd', 'lymph', 'triad'];

/** Sets the fan for this layout. tri: the picked triad (world: x, y, ha, bd, lv.pts[0]); cvS: the central vein on screen; V: the view (k, x, y);
 *  R: the lobule's radius (world); keepR: the tract's kept disc on screen; items: the labels to place (screen anchors; an edge chip is no spoke);
 *  lyHere: whether the Lymph label names this triad's lymphatic; fr: the free space; hx, hy: a box's margins. */
export function tractFan(fan, tri, cvS, V, R, keepR, items, lyHere, fr, hx, hy) {
  const sx = (p) => p[0] * V.k + V.x, sy = (p) => p[1] * V.k + V.y;
  const px = tri.x * V.k + V.x, py = tri.y * V.k + V.y, lv = tri.lv ? tri.lv.pts[0] : null;
  fan.px = px; fan.py = py; fan.keepR = keepR;
  fan.pvR = R * 0.042 * V.k + 2; fan.satR = Math.max(4, R * 0.016 * V.k) + 3;
  fan.dx[0] = sx(tri.ha); fan.dy[0] = sy(tri.ha); fan.dx[1] = sx(tri.bd); fan.dy[1] = sy(tri.bd);
  fan.dx[2] = lv ? sx(lv) : NaN; fan.dy[2] = lv ? sy(lv) : NaN;
  for (const k of TRACT_KEYS) fan.has[k] = false;
  let sats = 0, ly = false;
  for (const it of items) {
    if (it.edge || !TRACT_KEYS.includes(it.k) || (it.k === 'lymph' && !lyHere)) continue;
    fan.has[it.k] = true;
    if (it.k !== 'triad') sats++;
    if (it.k === 'lymph') ly = true;
  }
  fan.on = sats > 0 && (fan.has.ha || fan.has.bd);
  if (!fan.on) return fan;
  let ox = px - cvS[0], oy = py - cvS[1], ol = Math.hypot(ox, oy) || 1;
  ox /= ol; oy /= ol;
  const spoke = (k, x, y) => { let vx = x - px, vy = y - py; const l = Math.hypot(vx, vy); if (l < 1e-6) { vx = ox; vy = oy; } else { vx /= l; vy /= l; } fan.ux[k] = vx; fan.uy[k] = vy; };
  spoke('ha', fan.dx[0], fan.dy[0]); spoke('bd', fan.dx[1], fan.dy[1]); if (lv) spoke('lymph', fan.dx[2], fan.dy[2]); else spoke('lymph', px + ox, py + oy);
  // The venule's own label: straight out from the central vein when the lymphatic's is not shown (that slot is free), else out to the side
  // (a right angle from the outward ray), on the side with more room in the free space.
  if (!ly) { fan.ux.triad = ox; fan.uy.triad = oy; } else {
    const room = (s) => { const x = px - s * oy * (keepR + 60), y = py + s * ox * (keepR + 60); return Math.min(x - fr.l, fr.r - x, y - fr.t, fr.b - y); };
    const s = room(1) >= room(-1) ? 1 : -1;
    fan.ux.triad = -s * oy; fan.uy.triad = s * ox;
  }
  // Each spot: on its spoke, the box (margins and all) just clear of the tract's kept disc, then out until it clears the boxes set before it.
  let nb = 0;
  for (const k of FAN_ORDER) {
    if (!fan.has[k]) continue;
    let w = 0, hh = 0;
    for (const it of items) if (it.k === k) { w = it.w / 2 + hx; hh = it.hh / 2 + hy; break; }
    const ux = fan.ux[k], uy = fan.uy[k], b = fan.box[nb];
    let d = keepR + Math.abs(ux) * w + Math.abs(uy) * hh + 4;
    for (let n = 0; n < 120; n++, d += 4) {
      const x = px + ux * d, y = py + uy * d;
      b.l = x - w; b.r = x + w; b.t = y - hh; b.b = y + hh;
      let clear = true;
      for (let i = 0; i < nb; i++) { const o = fan.box[i]; if (b.l < o.r && o.l < b.r && b.t < o.b && o.t < b.b) { clear = false; break; } }
      if (clear) break;
    }
    fan.sx[k] = px + ux * d; fan.sy[k] = py + uy * d; nb++;
  }
  return fan;
}

/** The label's spot on its spoke (set by tractFan), written into out.px, out.py; false when k has no spoke. */
export function fanSpot(fan, k, out) {
  if (!fan.on || !fan.has[k]) return false;
  out.px = fan.sx[k]; out.py = fan.sy[k];
  return true;
}

// The distance from (x, y) to the segment a to q.
const segDist = (a, q, x, y) => {
  const vx = q[0] - a[0], vy = q[1] - a[1], l2 = vx * vx + vy * vy;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2)) : 0;
  return Math.hypot(a[0] + vx * t - x, a[1] + vy * t - y);
};

/** What a leader from a (the spot a label names) to q (its label's centre) costs here: a leader over the venule's disc or over a dot of the
 *  tract other than its own, and a tract label off the side its vessel faces. 0 when it keeps both rules. */
export function fanCost(fan, k, a, q) {
  if (!fan.on) return 0;
  let c = 0;
  if (Math.hypot(a[0] - fan.px, a[1] - fan.py) > 1 && segDist(a, q, fan.px, fan.py) < fan.pvR) c += CLASH;
  for (let i = 0; i < 3; i++) {
    const x = fan.dx[i], y = fan.dy[i];
    if (!Number.isFinite(x) || Math.hypot(a[0] - x, a[1] - y) <= 1) continue;
    if (segDist(a, q, x, y) < fan.satR) c += CLASH;
  }
  if (fan.has[k]) {
    const vx = q[0] - fan.px, vy = q[1] - fan.py, l = Math.hypot(vx, vy) || 1;
    if ((vx * fan.ux[k] + vy * fan.uy[k]) / l < FACE_COS) c += CLASH;
  }
  return c;
}
