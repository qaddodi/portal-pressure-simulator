// The daily balance the belly shows. The model's rate swings with every breath and beat (2200 to 1500 mL/day within a
// second on diuretics) and moves fast while time runs quickly, so: average it over about 6 s of screen time, keep the shown
// hundred until the average is 100 mL/day past it, and change the shown value at most once every 1.5 s (a dip-and-return
// fade takes 0.32 s of that). step(raw, now) returns the new value to show, or null when the line stays as it is.
export function balanceHold({ tau = 6000, band = 100, hold = 1500 } = {}) {
  let avg = null, t = 0, shown = null, next = -Infinity;
  return {
    step(raw, now) {
      if (!Number.isFinite(raw)) raw = 0;
      avg = avg == null ? raw : avg + (raw - avg) * (1 - Math.exp(-Math.min(Math.max(now - t, 0), 2000) / tau));
      t = now;
      if (shown != null && (Math.abs(avg - shown) <= band || now < next)) return null;
      const b = Math.round(avg / 100) * 100 || 0;
      if (b === shown) return null;
      shown = b; next = now + hold;
      return b;
    },
    get shown() { return shown; },
  };
}

// One shared hold for the live patient's readouts outside the belly (Details > Abdomen & ascites, the Compare table's
// "now" column), so they read the same steady hundred. Returns the value to show.
const live = balanceHold();
export function liveBalance(raw) { live.step(raw, performance.now()); return live.shown; }
