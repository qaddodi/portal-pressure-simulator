// A schematic EKG for the beat-by-beat pressure trace and the vitals monitor: a P wave, a QRS and a T wave drawn from the model's own
// cardiac phase, so each QRS lands on the beat that moves the pressures. It is a rhythm timed to the model, not a modelled ECG.
//
// The worker sends the phase (0 to 1, eng.phase()) beside every pressure sample. Each time it wraps, a beat starts: BeatClock finds those
// moments to a fraction of a sample and the waveform is laid over each beat from its phase, so the strip needs no sampling rate of its own.

// Circular distance in phase, so a wave at the end of one beat and the start of the next stays one wave.
const around = (ph, at) => ((ph - at + 1.5) % 1) - 0.5;
const bump = (ph, at, wide, high) => high * Math.exp(-((around(ph, at) / wide) ** 2));

/** The waveform at a cardiac phase, as a fraction of the R wave (1 is the R peak). The ventricles start to eject at phase 0.04 in the
 *  model (physiology.js systoleShape), so the QRS runs just before it, the T wave closes the ejection, and the P wave comes ahead of
 *  the right atrium's a wave (raWave, 0.88). */
export const ekgAt = (ph) => bump(ph, 0.84, 0.024, 0.13)     // P
  + bump(ph, 0.004, 0.005, -0.16)                              // Q
  + bump(ph, 0.02, 0.0075, 1)                                  // R
  + bump(ph, 0.037, 0.0075, -0.26)                             // S
  + bump(ph, 0.27, 0.058, 0.3);                                // T

/** The phases one beat is drawn at: close together over the QRS and the end of the P wave, far apart on the flat parts. */
export const EKG_PHASES = (() => {
  const out = [];
  for (let ph = 0; ph < 1 - 1e-9; ph += ph < 0.075 || ph >= 0.9 ? 0.004 : 0.012) out.push(+ph.toFixed(4));
  return out;
})();

/** The moments the cardiac phase wrapped, from a stream of (time, phase) samples. */
export function createBeatClock() {
  let prevT = NaN, prevPh = NaN;
  const times = [];
  return {
    times,
    /** One sample. A drop of more than half a cycle is a wrap (a faster heart still moves less than that between samples). */
    push(t, ph) {
      if (!Number.isFinite(t) || !Number.isFinite(ph)) return;
      if (Number.isFinite(prevPh) && ph < prevPh - 0.5) {
        const run = 1 - prevPh + ph;   // (the phase covered between the two samples)
        times.push(prevT + (run > 1e-9 ? (1 - prevPh) / run : 0) * (t - prevT));
      }
      prevT = t; prevPh = ph;
    },
    /** Forget the beats before t (the buffer's tail), keeping the one that straddles it. */
    trim(t) { let k = 0; while (k + 1 < times.length && times[k + 1] < t) k++; if (k) times.splice(0, k); },
    reset() { times.length = 0; prevT = prevPh = NaN; },
  };
}

/** Beats per minute from the last few beats' spacing (60 over the beat period); null before two beats have been seen. */
export function ekgRate(times, last = 4) {
  const n = times.length;
  if (n < 2) return null;
  const from = Math.max(0, n - 1 - last);
  const period = (times[n - 1] - times[from]) / (n - 1 - from);
  return period > 1e-9 ? 60 / period : null;
}

/** The strip between two times as points { x, v } (v: the fraction of the R wave): every beat of `times` laid over its own period, the
 *  last one over `period` (60 over the heart rate) and only up to `x1`. A beat that began before the first wrap is borrowed from the
 *  first beat's length so the strip starts at the window's left edge. */
export function ekgSeries(times, x0, x1, period) {
  const x = [], v = [];
  if (!times.length || !(x1 > x0)) return { x, v };
  const starts = times.slice();
  const lead = starts.length > 1 ? starts[1] - starts[0] : period;
  if (Number.isFinite(lead) && lead > 1e-6) starts.unshift(starts[0] - lead);
  for (let k = 0; k < starts.length; k++) {
    const t0 = starts[k], len = k + 1 < starts.length ? starts[k + 1] - t0 : period;
    if (!(len > 1e-6) || t0 + len < x0 - 1e-9) continue;
    if (t0 > x1) break;
    for (const ph of EKG_PHASES) {
      const at = t0 + ph * len;
      if (at < x0 - len * 0.02) continue;
      if (at > x1) break;
      x.push(at); v.push(ekgAt(ph));
    }
  }
  return { x, v };
}
