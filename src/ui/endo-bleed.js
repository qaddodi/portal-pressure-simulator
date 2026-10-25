// An active variceal bleed as the scope sees it, drawn over the cached endoscopic field each frame (instruments.js).
// Blood spurts from the tear in time with the heartbeat, drops thrown off the jet arcing and falling under gravity
// (a slow bleed oozes instead: the blood wells up at the tear and runs down); it runs down the wall as a wet trickle with
// beads sliding along it, and collects in a dark pool in the lowest part of the lumen, its surface level with a sheen and
// rings where the blood falls in, rising with the blood lost while a red haze settles over the view. Only a few gradients
// and sprite copies per frame: the drop is drawn once into a small canvas and reused.
import { bleedPulse } from './blood.js?v=856babbc01';
import { scopeDrops, scopePoolY } from './endo-motion.js?v=1393297b61';
import { cssVar, cssAlpha } from './util.js?v=d2c95a1b16';

const frac = (x) => ((x % 1) + 1) % 1;
const smooth = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };

let sprite = null, spriteKey = '';
function dropSprite() {
  const key = cssVar('--scope-blood-fresh') + cssVar('--scope-blood-jet');
  if (sprite && key === spriteKey) return sprite;
  const S = 48, c = document.createElement('canvas'), x = c.getContext('2d');
  c.width = c.height = S;
  const g = x.createRadialGradient(S * 0.45, S * 0.42, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, cssVar('--scope-blood-fresh')); g.addColorStop(0.65, cssVar('--scope-blood-jet'));
  g.addColorStop(0.88, cssAlpha('--scope-blood-pool-edge', 0.9)); g.addColorStop(1, cssAlpha('--scope-blood-pool-edge', 0));
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  // (the scope light caught on the wet drop)
  const hl = x.createRadialGradient(S * 0.36, S * 0.34, 0, S * 0.36, S * 0.34, S * 0.14);
  hl.addColorStop(0, cssAlpha('--white', 0.75)); hl.addColorStop(1, cssAlpha('--white', 0));
  x.fillStyle = hl; x.fillRect(0, 0, S, S);
  sprite = c; spriteKey = key;
  return c;
}

// o: { cx, cy, R (the lumen), jx, jy (the tear), t (seconds), a (0..1, the bleed easing in or out), rate (mL/min),
// fill (the pool's eased fill, 0..1), hr }. Drawn inside the lumen's clip.
export function drawScopeBleed(ctx, o) {
  const { cx, cy, R, jx, jy, t, a, rate, fill, hr } = o;
  const spurt = smooth(25, 70, rate || 50), p = bleedPulse(t, hr), sp = dropSprite();
  const surf = scopePoolY(cy, R, fill);
  ctx.save();
  ctx.globalAlpha = a;
  // The red haze over the view, thicker as the pool grows.
  ctx.fillStyle = cssAlpha('--scope-blood-haze', 0.06 + 0.22 * fill);
  ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // Fresh blood smeared on the wall below the tear, down to the pool.
  const top = jy - R * 0.04, len = Math.max(R * 0.1, surf - top);
  ctx.save();
  ctx.translate(jx + R * 0.03, top + len / 2); ctx.scale(1, len / (R * 0.16));
  const sm = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.16);
  sm.addColorStop(0, cssAlpha('--scope-blood-pool-edge', 0.55)); sm.addColorStop(1, cssAlpha('--scope-blood-pool-edge', 0));
  ctx.fillStyle = sm; ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // The trickle: a wet stream running down from the tear into the pool, with a thin light edge.
  const wob = (u) => Math.sin(u * 7 + 1.3) * R * 0.012 + u * R * 0.06;
  const path = () => { ctx.beginPath(); for (let i = 0; i <= 12; i++) { const u = i / 12; ctx[i ? 'lineTo' : 'moveTo'](jx + wob(u), jy + (surf + R * 0.01 - jy) * u); } };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  path(); ctx.strokeStyle = cssVar('--scope-blood-jet'); ctx.lineWidth = R * (0.03 + 0.012 * spurt); ctx.stroke();
  ctx.save(); ctx.translate(-R * 0.007, 0); path(); ctx.strokeStyle = cssAlpha('--scope-blood-fresh', 0.55); ctx.lineWidth = R * 0.007; ctx.stroke(); ctx.restore();
  for (let i = 0; i < 3; i++) {
    const u = frac(t * 0.7 + i / 3), r = R * 0.024;
    ctx.globalAlpha = a * Math.sin(Math.PI * u) ** 0.8;
    ctx.drawImage(sp, jx + wob(u) - r, jy + (surf - jy) * u - r * 1.3, 2 * r, 2.6 * r);
  }
  ctx.globalAlpha = a;
  // The pool: everything below its surface, crimson at the top and nearly black in its depth.
  const wave = (x) => surf + Math.sin(x / R * 9 + t * 1.6) * R * 0.004;
  const surfPath = () => { for (let i = 0; i <= 24; i++) { const x = cx - R + (2 * R * i) / 24; ctx[i ? 'lineTo' : 'moveTo'](x, wave(x)); } };
  const pg = ctx.createLinearGradient(0, surf, 0, cy + R);
  pg.addColorStop(0, cssVar('--scope-blood-pool-top')); pg.addColorStop(1, cssVar('--scope-blood-pool'));
  ctx.beginPath(); surfPath(); ctx.lineTo(cx + R, cy + R); ctx.lineTo(cx - R, cy + R); ctx.closePath();
  ctx.fillStyle = pg; ctx.fill();
  // Its wet surface: a bright line where the light meets it, and the scope light's reflection on it.
  ctx.beginPath(); surfPath(); ctx.strokeStyle = cssAlpha('--scope-blood-fresh', 0.6); ctx.lineWidth = Math.max(1, R * 0.008); ctx.stroke();
  ctx.save();
  ctx.translate(cx - R * 0.12, surf + R * 0.05); ctx.scale(1, 0.18);
  const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.32);
  gl.addColorStop(0, cssAlpha('--white', 0.2)); gl.addColorStop(1, cssAlpha('--white', 0));
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, R * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Rings where the trickle falls in.
  ctx.strokeStyle = cssAlpha('--scope-blood-fresh', 0.4); ctx.lineWidth = Math.max(1, R * 0.006);
  for (let i = 0; i < 2; i++) {
    const u = frac(t * 0.8 + i / 2), rx = R * (0.02 + 0.13 * u);
    ctx.globalAlpha = a * (1 - u) * smooth(0, 0.15, u);
    ctx.beginPath(); ctx.ellipse(jx + wob(1), surf + R * 0.012, rx, rx * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = a;
  // Blood welling up at the tear, swelling on each beat.
  const wr = R * (0.035 + 0.012 * p);
  ctx.drawImage(sp, jx - wr, jy - wr, 2 * wr, 2 * wr);
  // The spurt: the jet's core on this beat (a tapered stream along the drops' path) and the drops thrown off it.
  if (spurt > 0) {
    const k = Math.min(1.6, Math.max(0.6, (rate || 50) / 90)), v = (0.6 + 1.5 * p) * k, aj = -1.95;
    ctx.strokeStyle = cssVar('--scope-blood-fresh');
    let px = jx, py = jy;
    for (let i = 1; i <= 6; i++) {
      const s = (i / 6) * 0.16, x = jx + Math.cos(aj) * v * s * R, y = jy + (Math.sin(aj) * v * s + 1.6 * s * s) * R;
      ctx.globalAlpha = a * spurt * (0.5 + 0.5 * p) * (1 - i / 8);
      ctx.lineWidth = R * 0.03 * (1 - i / 7.5) * (0.7 + 0.3 * p);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      px = x; py = y;
    }
  }
  for (const [x, y, r, al] of scopeDrops(t, rate, hr)) {
    if (al <= 0.01) continue;
    const X = jx + x * R, Y = jy + y * R, rr = r * R;
    if (Y > surf + rr) continue;   // (fallen into the pool)
    ctx.globalAlpha = a * al;
    ctx.drawImage(sp, X - rr, Y - rr, 2 * rr, 2 * rr);
  }
  ctx.restore();
}
