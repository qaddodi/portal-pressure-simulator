// An active variceal bleed as the scope sees it, drawn over the cached endoscopic field each frame (instruments.js).
// The view is down a horizontal tube, so blood behaves as it does there. The tear sits on the crest of a varix column: a wet red
// spot that swells with each heartbeat, staining the mucosa round it, and spurts into the lumen (a slow bleed oozes), drops thrown
// off the jet and falling. Blood on the wall runs down it round the tube as a rivulet that widens as it goes, over a soft stain;
// blood that settles lies flat, so the pool is the wedge between the two lines where its surface meets the wall, running toward
// the dark centre, its far end fading into the dark, its edges uneven and thin and see-through, widening as it fills, with the
// scope's light as a soft patch on its surface and ripples running out from where the rivulet joins it. A red haze thickens with the
// blood lost. Few gradients and fills a frame: the spot and the stain are two small reused sprites.
import { bleedPulse } from './blood.js?v=300b3b5267';
import { scopeDrops, scopePool, inScopePool } from './endo-motion.js?v=9e325d9a13';
import { cssVar, cssAlpha } from './util.js?v=abece7b00c';

const frac = (x) => ((x % 1) + 1) % 1;
const smooth = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };

let sprite = null, soft = null, spriteKey = '';
function sprites() {
  const key = cssVar('--scope-blood-fresh') + cssVar('--scope-blood-jet') + cssVar('--scope-blood-pool-edge');
  if (sprite && key === spriteKey) return { sprite, soft };
  // The wet spot at the tear: crimson with a darker rim and the scope light caught on it.
  const S = 48, c = document.createElement('canvas'), x = c.getContext('2d');
  c.width = c.height = S;
  const g = x.createRadialGradient(S * 0.45, S * 0.42, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, cssVar('--scope-blood-fresh')); g.addColorStop(0.6, cssVar('--scope-blood-jet'));
  g.addColorStop(0.86, cssAlpha('--scope-blood-pool-edge', 0.85)); g.addColorStop(1, cssAlpha('--scope-blood-pool-edge', 0));
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const hl = x.createRadialGradient(S * 0.38, S * 0.36, 0, S * 0.38, S * 0.36, S * 0.1);
  hl.addColorStop(0, cssAlpha('--white', 0.4)); hl.addColorStop(1, cssAlpha('--white', 0));
  x.fillStyle = hl; x.fillRect(0, 0, S, S);
  // The stain: a soft blot that fades out to nothing, stamped along a rivulet and round the tear.
  const T = 64, c2 = document.createElement('canvas'), y = c2.getContext('2d');
  c2.width = c2.height = T;
  const g2 = y.createRadialGradient(T / 2, T / 2, 0, T / 2, T / 2, T / 2);
  g2.addColorStop(0, cssAlpha('--scope-blood-jet', 0.6)); g2.addColorStop(0.5, cssAlpha('--scope-blood-jet', 0.3)); g2.addColorStop(1, cssAlpha('--scope-blood-jet', 0));
  y.fillStyle = g2; y.fillRect(0, 0, T, T);
  sprite = c; soft = c2; spriteKey = key;
  return { sprite, soft };
}

// A ribbon along points (pts: [[x, y]]), wd(i) wide at each, as one filled shape (a tapered or swelling stream with no seams).
function ribbon(ctx, pts, wd) {
  const L = [], Rr = [];
  pts.forEach((q, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1, w = wd(i) / 2;
    L.push([q[0] - (dy / n) * w, q[1] + (dx / n) * w]); Rr.push([q[0] + (dy / n) * w, q[1] - (dx / n) * w]);
  });
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
  ctx.closePath();
}

// o: { cx, cy, R (the lumen), jx, jy (the tear, on a varix column: endo-motion.js scopeTear), t (seconds), a (0..1, the bleed
// easing in or out), rate (mL/min), fill (the pool's eased fill, 0..1), hr }. Drawn inside the lumen's clip.
export function drawScopeBleed(ctx, o) {
  const { cx, cy, R, jx, jy, t, a, rate, fill, hr } = o;
  const spurt = smooth(25, 70, rate || 50), p = bleedPulse(t, hr), { sprite: dot, soft } = sprites();
  const { phi } = scopePool(fill);
  const tx = (jx - cx) / R, ty = (jy - cy) / R, th0 = Math.atan2(ty, tx), rho0 = Math.hypot(tx, ty);
  const at = (ang, rho) => [cx + Math.cos(ang) * rho * R, cy + Math.sin(ang) * rho * R];
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
  const run = (dRho, u0, u1, N) => {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = u0 + ((u1 - u0) * i) / N, bow = Math.sin(Math.PI * (u - u0) / (u1 - u0));
      pts.push(at(th0 + span * u, rho0 + (rhoEnd - rho0) * u + dRho * bow + 0.006 * Math.sin(u * 9 + 1.7)));
    }
    return pts;
  };
  if (span > 0.06) {
    const main = run(0, 0, 1, 20);
    const flow = 0.7 + 0.3 * spurt;
    // (the wet stain under it, denser and wider as it goes)
    for (let i = 0; i <= 20; i++) { const q = main[i], r = R * (0.08 + 0.07 * (i / 20)); ctx.globalAlpha = a * 0.55; ctx.drawImage(soft, q[0] - r, q[1] - r, 2 * r, 2 * r); }
    ctx.globalAlpha = a;
    const wMain = (i) => R * (0.032 + 0.05 * (i / 20)) * flow * (1 + 0.16 * Math.sin(i * 1.3 + t * 2.1));
    ribbon(ctx, main, (i) => wMain(i) * 1.7); ctx.fillStyle = cssAlpha('--scope-blood-jet', 0.35); ctx.fill();
    ribbon(ctx, main, wMain); ctx.fillStyle = cssVar('--scope-blood-jet'); ctx.fill();
    // (the scope's light on its wet inner edge, and brighter runs sliding along it)
    ctx.beginPath();
    main.forEach((q, i) => { const dx = cx - q[0], dy = cy - q[1], n = Math.hypot(dx, dy) || 1, w = wMain(i) * 0.22, x = q[0] + (dx / n) * w, y = q[1] + (dy / n) * w; ctx[i ? 'lineTo' : 'moveTo'](x, y); });
    ctx.strokeStyle = cssAlpha('--scope-blood-fresh', 0.55); ctx.lineWidth = Math.max(1, R * 0.006); ctx.stroke();
    ctx.beginPath();
    main.forEach((q, i) => { ctx[i ? 'lineTo' : 'moveTo'](q[0], q[1]); });
    ctx.setLineDash([R * 0.05, R * 0.1]); ctx.lineDashOffset = -t * R * 0.5;
    ctx.strokeStyle = cssAlpha('--scope-blood-fresh', 0.3); ctx.lineWidth = R * 0.014; ctx.lineCap = 'butt'; ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'round';
  }

  // The pool: the wedge from the centre between the two edges (their angles leave the horizontal at phi and PI - phi). Its edges
  // are uneven and sway; its far end fades into the dark of the lumen (the less blood, the nearer the lens it begins); it is
  // dark where it is far and brighter toward the lens, with a thin see-through skirt round it.
  const sway = (rho, side) => (0.016 * Math.sin(rho * 9 + t * 0.9 + side * 2) + 0.01 * Math.sin(rho * 23 - t * 1.3 + side)) * Math.min(1, rho * 3);
  const NE = 16, edge = (side, grow) => { const e = []; for (let i = 1; i <= NE; i++) { const rho = (i / NE) * 1.04; e.push(at(side > 0 ? phi - grow + sway(rho, 1) : Math.PI - phi + grow - sway(rho, -1), rho)); } return e; };
  const wedge = (grow) => {
    const er = edge(1, grow), el = edge(-1, grow);
    ctx.beginPath(); ctx.moveTo(cx, cy);
    for (const q of er) ctx.lineTo(q[0], q[1]);
    ctx.arc(cx, cy, R * 1.04, phi - grow + sway(1.04, 1), Math.PI - phi + grow - sway(1.04, -1));
    for (let i = el.length - 1; i >= 0; i--) ctx.lineTo(el[i][0], el[i][1]);
    ctx.closePath();
    return [er, el];
  };
  const dark = (al) => cssAlpha('--scope-blood-pool', al);
  const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  pg.addColorStop(0, dark(0)); pg.addColorStop(Math.max(0.02, far - 0.1), dark(0)); pg.addColorStop(far + 0.2, dark(0.97));
  pg.addColorStop(0.5, cssVar('--scope-blood-pool')); pg.addColorStop(0.92, cssVar('--scope-blood-pool-top')); pg.addColorStop(1, cssAlpha('--scope-blood-pool-edge', 0.92));
  ctx.globalAlpha = a * 0.4; wedge(0.07); ctx.fillStyle = pg; ctx.fill();   // (the thin skirt)
  ctx.globalAlpha = a;
  wedge(0); ctx.fillStyle = pg; ctx.fill();
  const [er, el] = [edge(1, 0), edge(-1, 0)];
  ctx.save(); wedge(0); ctx.clip();
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
    const [lx, ly] = at(phi, rhoEnd);
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
  for (const e of [er, el]) {
    ctx.beginPath();
    let begun = false;
    e.forEach((q, i) => { if ((i + 1) / NE * 1.04 > far + 0.08) { ctx[begun ? 'lineTo' : 'moveTo'](q[0], q[1]); begun = true; } });
    ctx.stroke();
  }

  // The spurt: a tapered stream from the tear toward the axis, bending down, as one shape that thins to nothing at its tip.
  const into = Math.atan2(-ty, -tx);
  if (spurt > 0) {
    const k = Math.min(1.6, Math.max(0.6, (rate || 50) / 90)), v = (0.2 + 0.55 * p) * k, N = 8, pts = [];
    for (let i = 0; i <= N; i++) { const s = (i / N) * 0.22; pts.push([jx + Math.cos(into) * v * s * R, jy + (Math.sin(into) * v * s + 0.75 * s * s) * R]); }
    const tip = pts[N], jg = ctx.createLinearGradient(jx, jy, tip[0], tip[1]);
    jg.addColorStop(0, cssAlpha('--scope-blood-fresh', 0.95)); jg.addColorStop(1, cssAlpha('--scope-blood-fresh', 0));
    ribbon(ctx, pts, (i) => R * 0.026 * (1 - i / (N + 1)) * (0.7 + 0.3 * p));
    ctx.globalAlpha = a * spurt * (0.55 + 0.45 * p); ctx.fillStyle = jg; ctx.fill();
  }
  // The drops: short, fat streaks along their path (a drop with a trail), not dashes and not round beads.
  ctx.strokeStyle = cssVar('--scope-blood-jet');
  for (const [x, y, r, al, vx, vy] of scopeDrops(t, rate, hr, { x: tx, y: ty })) {
    if (al <= 0.01) continue;
    const X = jx + x * R, Y = jy + y * R;
    if (Math.hypot(X - cx, Y - cy) > R || inScopePool((X - cx) / R, (Y - cy) / R, phi)) continue;   // (gone into the pool)
    ctx.globalAlpha = a * al * 0.9; ctx.lineWidth = Math.max(1.5, 2 * r * R);
    ctx.beginPath(); ctx.moveTo(X - vx * 0.02 * R, Y - vy * 0.02 * R); ctx.lineTo(X, Y); ctx.stroke();
  }
  // The tear: the mucosa stained round it, and the wet spot itself, swelling on each beat.
  const sr = R * (0.07 + 0.02 * p);
  ctx.globalAlpha = a * 0.8; ctx.drawImage(soft, jx - sr, jy - sr, 2 * sr, 2 * sr);
  ctx.globalAlpha = a;
  const wr = R * (0.021 + 0.007 * p);
  ctx.drawImage(dot, jx - wr, jy - wr, 2 * wr, 2 * wr);
  ctx.restore();
}
