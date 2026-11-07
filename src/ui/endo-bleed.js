// An active variceal bleed as the scope sees it, drawn over the cached endoscopic field each frame (instruments.js).
// The view is down a horizontal tube, so blood behaves as it does there. The tear sits on the crest of a varix column: a wet red
// spot (steady: no heartbeat in it, Mohammad 6 Nov 2026), staining the mucosa round it, and spurts into the lumen (a slow bleed oozes), drops thrown
// off the jet and falling. Blood on the wall runs down it round the tube as a rivulet that widens as it goes, over a soft stain;
// blood that settles lies flat, so the pool is the wedge between the two lines where its surface meets the wall, running toward
// the dark centre, its far end fading into the dark, its edges uneven and thin and see-through, widening as it fills, with the
// scope's light as a soft patch on its surface and ripples running out from where the rivulet joins it. A red haze thickens with the
// blood lost. The spot and the stain are radial gradients in circles of their own.
import { bleedPulse } from './blood.js';
import { scopeDrops, scopePool, inScopePool } from './endo-motion.js';
import { cssVar, cssAlpha } from './util.js';

const frac = (x) => ((x % 1) + 1) % 1;
const smooth = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };

// The wet spot at the tear (crimson with a darker rim and the scope light caught on it) and the stain (a soft blot that fades out to
// nothing, stamped along a rivulet and round the tear): each a radial gradient filled in its own circle, on the GPU's drawer as
// on a canvas (no picture is made of them: nothing is drawn on a 2D canvas to be copied).
function stain(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, cssAlpha('--scope-blood-jet', 0.6)); g.addColorStop(0.5, cssAlpha('--scope-blood-jet', 0.3)); g.addColorStop(1, cssAlpha('--scope-blood-jet', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function spot(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - 0.1 * r, y - 0.16 * r, 0, x, y, r);
  g.addColorStop(0, cssVar('--scope-blood-fresh')); g.addColorStop(0.6, cssVar('--scope-blood-jet'));
  g.addColorStop(0.86, cssAlpha('--scope-blood-pool-edge', 0.85)); g.addColorStop(1, cssAlpha('--scope-blood-pool-edge', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  const hx = x - 0.24 * r, hy = y - 0.28 * r, hr = 0.2 * r, hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
  hl.addColorStop(0, cssAlpha('--white', 0.4)); hl.addColorStop(1, cssAlpha('--white', 0));
  ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
}

// Everything a frame needs is kept here and written in place (the bleed draws every frame it runs): the rivulet's points and widths, the
// spurt's, the drops' table and the tear scopeDrops is asked about.
const NMAIN = 20, NJET = 8;
const MAIN = new Float64Array(2 * (NMAIN + 1)), WMAIN = new Float64Array(NMAIN + 1), WWIDE = new Float64Array(NMAIN + 1);
const JET = new Float64Array(2 * (NJET + 1)), WJET = new Float64Array(NJET + 1);
const DROPS = [], TEAR_AT = { x: 0, y: 0 }, DASH = [0, 0], NO_DASH = [];   // (the drawer copies a dash it is given, so these are written again each frame)

// A ribbon along n points (P: flat x, y pairs), W[i] wide at each, as one filled shape (a tapered or swelling stream with no seams).
function ribbon(ctx, P, W, n) {
  for (let side = 0; side < 2; side++) {
    // (the left edge from the first point to the last, then the right edge back: side 0 forward, side 1 in reverse)
    for (let s = 0; s < n; s++) {
      const i = side ? n - 1 - s : s, i0 = Math.max(0, i - 1) * 2, i1 = Math.min(n - 1, i + 1) * 2;
      const dx = P[i1] - P[i0], dy = P[i1 + 1] - P[i0 + 1], d = Math.hypot(dx, dy) || 1, w = W[i] / 2;
      const x = side ? P[i * 2] + (dy / d) * w : P[i * 2] - (dy / d) * w, y = side ? P[i * 2 + 1] - (dx / d) * w : P[i * 2 + 1] + (dx / d) * w;
      if (side || s) ctx.lineTo(x, y); else { ctx.beginPath(); ctx.moveTo(x, y); }
    }
  }
  ctx.closePath();
}

// The pool's edges sway: side +1 the right edge, -1 the left.
const sway = (t, rho, side) => (0.016 * Math.sin(rho * 9 + t * 0.9 + side * 2) + 0.01 * Math.sin(rho * 23 - t * 1.3 + side)) * Math.min(1, rho * 3);
const NE = 16;
// The angle a pool edge leaves the centre at, rho of the way out (grow widens the wedge: the thin skirt).
const edgeAng = (t, phi, grow, side, rho) => (side > 0 ? phi - grow + sway(t, rho, 1) : Math.PI - phi + grow - sway(t, rho, -1));
// The wedge from the centre between the two edges, as a path.
function wedge(ctx, cx, cy, R, t, phi, grow) {
  ctx.beginPath(); ctx.moveTo(cx, cy);
  for (let i = 1; i <= NE; i++) { const rho = (i / NE) * 1.04, ang = edgeAng(t, phi, grow, 1, rho); ctx.lineTo(cx + Math.cos(ang) * rho * R, cy + Math.sin(ang) * rho * R); }
  ctx.arc(cx, cy, R * 1.04, phi - grow + sway(t, 1.04, 1), Math.PI - phi + grow - sway(t, 1.04, -1));
  for (let i = NE; i >= 1; i--) { const rho = (i / NE) * 1.04, ang = edgeAng(t, phi, grow, -1, rho); ctx.lineTo(cx + Math.cos(ang) * rho * R, cy + Math.sin(ang) * rho * R); }
  ctx.closePath();
}
// A wet edge of the pool, stroked from where the pool begins (past `from` of the way out).
function wetEdge(ctx, cx, cy, R, t, phi, side, from) {
  ctx.beginPath();
  let begun = false;
  for (let i = 0; i < NE; i++) {
    const rho = ((i + 1) / NE) * 1.04;
    if (rho > from) { const ang = edgeAng(t, phi, 0, side, rho); ctx[begun ? 'lineTo' : 'moveTo'](cx + Math.cos(ang) * rho * R, cy + Math.sin(ang) * rho * R); begun = true; }
  }
  ctx.stroke();
}

// The rivulet's points, written into MAIN: from the tear round the tube to the pool, bowing out by dRho on the way.
function runInto(cx, cy, R, th0, span, rho0, rhoEnd, dRho) {
  for (let i = 0; i <= NMAIN; i++) {
    const u = i / NMAIN, bow = Math.sin(Math.PI * u), ang = th0 + span * u, rho = rho0 + (rhoEnd - rho0) * u + dRho * bow + 0.006 * Math.sin(u * 9 + 1.7);
    MAIN[2 * i] = cx + Math.cos(ang) * rho * R; MAIN[2 * i + 1] = cy + Math.sin(ang) * rho * R;
  }
}

// o: { cx, cy, R (the lumen), jx, jy (the tear, on a varix column: endo-motion.js scopeTear), t (seconds), a (0..1, the bleed
// easing in or out), rate (mL/min), fill (the pool's eased fill, 0..1), hr }. Drawn inside the lumen's clip.
export function drawScopeBleed(ctx, o) {
  const { cx, cy, R, jx, jy, t, a, rate, fill, hr } = o;
  const spurt = smooth(25, 70, rate || 50), p = bleedPulse(t, hr);
  const { phi } = scopePool(fill);
  const tx = (jx - cx) / R, ty = (jy - cy) / R, th0 = Math.atan2(ty, tx), rho0 = Math.hypot(tx, ty);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // The red haze over the view, thicker as the pool grows.
  ctx.fillStyle = cssAlpha('--scope-blood-haze', 0.04 + 0.2 * fill);
  ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);

  // Blood on the wall: a rivulet runs down from the tear round the tube (a little deeper as it goes), wider as it nears the pool,
  // over a soft stain where the wall is wet.
  // It ends where the pool shows: the pool's far end fades in at `far`, so the rivulet runs on to just past it.
  const span = phi - th0, far = 0.52 - 0.42 * fill, rhoEnd = Math.min(0.8, Math.max(0.4, far + 0.1));
  if (span > 0.06) {
    runInto(cx, cy, R, th0, span, rho0, rhoEnd, 0);
    const flow = 0.7 + 0.3 * spurt;
    // (the wet stain under it, denser and wider as it goes)
    for (let i = 0; i <= NMAIN; i++) { const r = R * (0.08 + 0.07 * (i / NMAIN)); ctx.globalAlpha = a * 0.55; stain(ctx, MAIN[2 * i], MAIN[2 * i + 1], r); }
    ctx.globalAlpha = a;
    for (let i = 0; i <= NMAIN; i++) { const w = R * (0.032 + 0.05 * (i / NMAIN)) * flow * (1 + 0.16 * Math.sin(i * 1.3 + t * 2.1)); WMAIN[i] = w; WWIDE[i] = w * 1.7; }
    ribbon(ctx, MAIN, WWIDE, NMAIN + 1); ctx.fillStyle = cssAlpha('--scope-blood-jet', 0.35); ctx.fill();
    ribbon(ctx, MAIN, WMAIN, NMAIN + 1); ctx.fillStyle = cssVar('--scope-blood-jet'); ctx.fill();
    // (the scope's light on its wet inner edge, and brighter runs sliding along it)
    ctx.beginPath();
    for (let i = 0; i <= NMAIN; i++) {
      const qx = MAIN[2 * i], qy = MAIN[2 * i + 1], dx = cx - qx, dy = cy - qy, n = Math.hypot(dx, dy) || 1, w = WMAIN[i] * 0.22, x = qx + (dx / n) * w, y = qy + (dy / n) * w;
      ctx[i ? 'lineTo' : 'moveTo'](x, y);
    }
    ctx.strokeStyle = cssAlpha('--scope-blood-fresh', 0.55); ctx.lineWidth = Math.max(1, R * 0.006); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= NMAIN; i++) ctx[i ? 'lineTo' : 'moveTo'](MAIN[2 * i], MAIN[2 * i + 1]);
    DASH[0] = R * 0.05; DASH[1] = R * 0.1; ctx.setLineDash(DASH); ctx.lineDashOffset = -t * R * 0.5;
    ctx.strokeStyle = cssAlpha('--scope-blood-fresh', 0.3); ctx.lineWidth = R * 0.014; ctx.lineCap = 'butt'; ctx.stroke();
    ctx.setLineDash(NO_DASH); ctx.lineCap = 'round';
  }

  // The pool: the wedge from the centre between the two edges (their angles leave the horizontal at phi and PI - phi). Its edges
  // are uneven and sway; its far end fades into the dark of the lumen (the less blood, the nearer the lens it begins); it is
  // dark where it is far and brighter toward the lens, with a thin see-through skirt round it.
  const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  pg.addColorStop(0, cssAlpha('--scope-blood-pool', 0)); pg.addColorStop(Math.max(0.02, far - 0.1), cssAlpha('--scope-blood-pool', 0)); pg.addColorStop(far + 0.2, cssAlpha('--scope-blood-pool', 0.97));
  pg.addColorStop(0.5, cssVar('--scope-blood-pool')); pg.addColorStop(0.92, cssVar('--scope-blood-pool-top')); pg.addColorStop(1, cssAlpha('--scope-blood-pool-edge', 0.92));
  ctx.globalAlpha = a * 0.4; wedge(ctx, cx, cy, R, t, phi, 0.07); ctx.fillStyle = pg; ctx.fill();   // (the thin skirt)
  ctx.globalAlpha = a;
  wedge(ctx, cx, cy, R, t, phi, 0); ctx.fillStyle = pg; ctx.fill();
  ctx.save(); wedge(ctx, cx, cy, R, t, phi, 0); ctx.clip();
  // Brighter toward the lens, where the scope's light is strong, and its reflection as one soft patch low on the surface.
  const lg = ctx.createLinearGradient(0, cy + R * 0.2, 0, cy + R);
  lg.addColorStop(0, cssAlpha('--scope-blood-fresh', 0)); lg.addColorStop(1, cssAlpha('--scope-blood-fresh', 0.26));
  ctx.fillStyle = lg; ctx.fillRect(cx - R, cy, 2 * R, R + 4);
  ctx.save();
  ctx.translate(cx + R * 0.05 + Math.sin(t * 0.9) * R * 0.012, cy + R * 0.7); ctx.scale(1, 0.4);
  const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.2);
  gl.addColorStop(0, cssAlpha('--white', 0.22)); gl.addColorStop(1, cssAlpha('--white', 0));
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Ripples: arcs about the centre moving out across the surface, broken up by the light's reflection.
  ctx.strokeStyle = cssAlpha('--scope-blood-fresh', 1); ctx.lineWidth = Math.max(1, R * 0.005);
  for (let i = 0; i < 4; i++) {
    const u = frac(t * 0.16 + i / 4), rho = 0.16 + 0.82 * u;
    ctx.globalAlpha = a * 0.4 * (1 - u) ** 0.8 * smooth(0, 0.15, u);
    ctx.beginPath(); ctx.arc(cx, cy, rho * R, phi, Math.PI - phi); ctx.stroke();
  }
  // Rings where the rivulet runs into the pool.
  if (span > 0.06) {
    const lx = cx + Math.cos(phi) * rhoEnd * R, ly = cy + Math.sin(phi) * rhoEnd * R;
    for (let i = 0; i < 2; i++) {
      const u = frac(t * 0.7 + i / 2), rx = R * (0.015 + 0.09 * u);
      ctx.globalAlpha = a * 0.5 * (1 - u) * smooth(0, 0.12, u);
      ctx.beginPath(); ctx.ellipse(lx, ly, rx, rx * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = a;
  // Its wet edges, where the surface meets the wall: a soft dark feather and a thin bright line, from where the pool begins.
  ctx.strokeStyle = cssAlpha('--scope-blood-fresh', 0.5); ctx.lineWidth = Math.max(1, R * 0.006);
  wetEdge(ctx, cx, cy, R, t, phi, 1, far + 0.08); wetEdge(ctx, cx, cy, R, t, phi, -1, far + 0.08);

  // The spurt: a tapered stream from the tear toward the axis, bending down, as one shape that thins to nothing at its tip.
  const into = Math.atan2(-ty, -tx);
  if (spurt > 0) {
    const k = Math.min(1.6, Math.max(0.6, (rate || 50) / 90)), v = (0.2 + 0.55 * p) * k;
    for (let i = 0; i <= NJET; i++) {
      const s = (i / NJET) * 0.22;
      JET[2 * i] = jx + Math.cos(into) * v * s * R; JET[2 * i + 1] = jy + (Math.sin(into) * v * s + 0.75 * s * s) * R;
      WJET[i] = R * 0.026 * (1 - i / (NJET + 1)) * (0.7 + 0.3 * p);
    }
    const jg = ctx.createLinearGradient(jx, jy, JET[2 * NJET], JET[2 * NJET + 1]);
    jg.addColorStop(0, cssAlpha('--scope-blood-fresh', 0.95)); jg.addColorStop(1, cssAlpha('--scope-blood-fresh', 0));
    ribbon(ctx, JET, WJET, NJET + 1);
    ctx.globalAlpha = a * spurt * (0.55 + 0.45 * p); ctx.fillStyle = jg; ctx.fill();
  }
  // The drops: short, fat streaks along their path (a drop with a trail), not dashes and not round beads.
  ctx.strokeStyle = cssVar('--scope-blood-jet');
  TEAR_AT.x = tx; TEAR_AT.y = ty;
  const drops = scopeDrops(t, rate, hr, TEAR_AT, DROPS);
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i], al = d[3], r = d[2], vx = d[4], vy = d[5];
    if (al <= 0.01) continue;
    const X = jx + d[0] * R, Y = jy + d[1] * R;
    if (Math.hypot(X - cx, Y - cy) > R || inScopePool((X - cx) / R, (Y - cy) / R, phi)) continue;   // (gone into the pool)
    ctx.globalAlpha = a * al * 0.9; ctx.lineWidth = Math.max(1.5, 2 * r * R);
    ctx.beginPath(); ctx.moveTo(X - vx * 0.02 * R, Y - vy * 0.02 * R); ctx.lineTo(X, Y); ctx.stroke();
  }
  // The tear: the mucosa stained round it, and the wet spot itself, at one steady size.
  const sr = R * (0.07 + 0.02 * p);
  ctx.globalAlpha = a * 0.8; stain(ctx, jx, jy, sr);
  ctx.globalAlpha = a;
  const wr = R * (0.021 + 0.007 * p);
  spot(ctx, jx, jy, wr);
  ctx.restore();
}
