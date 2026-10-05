// The one flick: shared by the lobule, the anatomy and the circuit views so they feel the same.
// Positions are screen pixels, velocities pixels per millisecond. `hard(x, y)` returns the nearest resting
// position [x, y] (the view's bounds); `apply(x, y)` shows a position; `done()` runs once it has settled.
// Like a scroll view: the glide decays slowly, but carried past the edge it is braked hard (the velocity halves
// each frame), the overshoot shows only as a short tanh stretch, and it returns to the edge within a few frames.
export const FLICK = { decay: 0.9955, brake: 0.5, overshoot: 0.78, band: 36, minSpeed: 0.25, stop: 0.03 };

export function runFlick({ x, y, vx, vy, hard, apply, done }) {
  let raf = 0, last = performance.now(), rx = x, ry = y;
  const L = FLICK.band;
  const step = (now) => {
    raf = 0;
    const dt = Math.min(34, now - last), decay = Math.pow(FLICK.decay, dt), f16 = dt / 16;
    last = now; vx *= decay; vy *= decay;
    rx += vx * dt; ry += vy * dt;
    const [cx, cy] = hard(rx, ry);
    let ox = rx - cx, oy = ry - cy;
    if (ox) { vx *= Math.pow(FLICK.brake, f16); ox *= Math.pow(FLICK.overshoot, f16); rx = cx + ox; }
    if (oy) { vy *= Math.pow(FLICK.brake, f16); oy *= Math.pow(FLICK.overshoot, f16); ry = cy + oy; }
    apply(cx + (ox ? L * Math.tanh(ox / L) : 0), cy + (oy ? L * Math.tanh(oy / L) : 0));
    if (Math.hypot(vx, vy) > FLICK.stop || Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) raf = requestAnimationFrame(step);
    else { apply(cx, cy); done?.(); }
  };
  raf = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(raf); raf = 0; };
}
