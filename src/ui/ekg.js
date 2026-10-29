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
        const at = prevT + (run > 1e-9 ? (1 - prevPh) / run : 0) * (t - prevT);
        if (!times.length || at > times[times.length - 1]) times.push(at);   // (the beats stay in order, whatever was laid before)
      }
      prevT = t; prevPh = ph;
    },
    /** The stream was broken (the strip ran on its own for a while): the next sample starts a new run, so no beat is read across the gap. */
    restart() { prevT = prevPh = NaN; },
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

// ── A beat on the strip's own clock ──
// While the model's clock stands still (a disease time-lapse runs a year in ten seconds with the beat parked, and a state easing in does the
// same for a moment) it sends no new beats, but the monitor goes on. The strip lays beats of its own then: `w = { x, ph, bpm }` is the time it
// has laid them to, the beat's phase there (below 0 when the last real beat sits ahead of it) and the heart rate it keeps.
const WALK_STEP_S = 0.02, WALK_EASE_S = 0.4, WALK_PULL = 1 / 3, WALK_AIM_S = 1.5;
const wrapHalf = (x) => (((x + 0.5) % 1) + 1) % 1 - 0.5;   // (a phase difference, as the shorter way round: -0.5 up to 0.5)
export const beatWalk = (x, ph, bpm) => ({ x, ph, bpm });

/** Walk `w` on by dt seconds toward the heart rate `bpm`, laying each beat it passes on `times`. Its own rate eases to `bpm` over about 0.4 s,
 *  so the beats close in as a rising number climbs. `to` = { ph, left } brings the beat to phase `ph` (the phase the model's own beat resumes
 *  at) `left` seconds from now: over the last WALK_AIM_S of the wait (the rate has hardly moved by then, so the beats it will lay are known)
 *  the difference is spread over the steps left, by at most a third of the rate, so the live beat takes over where the last one left off. */
export function walkBeats(w, dt, bpm, times, to = null) {
  const n = Math.max(1, Math.ceil(dt / WALK_STEP_S)), h = dt / n;
  for (let i = 0; i < n; i++) {
    w.bpm += (bpm - w.bpm) * (1 - Math.exp(-h / WALK_EASE_S));
    const rate = w.bpm / 60, rem = to ? to.left - i * h : NaN;
    let d = rate * h;
    if (Number.isFinite(to?.ph) && rem > h && rem < WALK_AIM_S) d += Math.max(-WALK_PULL * d, Math.min(WALK_PULL * d, wrapHalf(to.ph - (w.ph + rate * rem)) * h / rem));
    const was = w.ph;
    w.ph += d;
    if (w.ph >= 1) {
      const at = w.x + ((1 - was) / d) * h;
      w.ph -= 1;
      if (!times.length || at > times[times.length - 1]) times.push(at);
    }
    w.x += h;
  }
  return w;
}

/** Beats in front of the first of `times` at a steady `period`, back to one at or before `edge`: a strip that opens on a steady state
 *  has its window of it. Returns how many were laid. */
export function seedBeats(times, period, edge) {
  const back = [];
  if (!(period > 1e-6) || !times.length) return 0;
  for (let t = times[0] - period; back.length < 400; t -= period) { back.push(t); if (t <= edge) break; }
  times.unshift(...back.reverse());
  return back.length;
}

// ── Lead II for the beat-by-beat slide card ──
// The waves in seconds about each R peak, so the QRS stays narrow (about 80 ms) whatever the rate and the T wave closes in as the heart
// speeds up (QT about 0.4 √RR). A beat's R peak sits where ekgAt puts it (phase 0.02), so each QRS still lands on the model's own beat.
const gauss = (t, at, wide, high) => high * Math.exp(-(((t - at) / wide) ** 2));
/** The waveform `dt` seconds from an R peak, in a beat `rr` seconds long, as a fraction of the R wave. */
export const leadIIAt = (dt, rr) => {
  const tPeak = 0.4 * Math.sqrt(Math.max(0.3, rr)) - 0.11;
  return gauss(dt, -0.15, 0.03, 0.12)     // P
    + gauss(dt, -0.022, 0.008, -0.07)      // Q
    + gauss(dt, 0, 0.011, 1)               // R
    + gauss(dt, 0.024, 0.009, -0.17)       // S
    + gauss(dt, tPeak, 0.055, 0.28);       // T
};

/** The strip between two times as points { x, v }, every 4 ms, from the beats' start times as ekgSeries takes them. Each point sums the
 *  waves of the beats around it, so a fast heart's T runs into the next P as it does on a monitor. Nothing is laid past the last beat's end. */
export function leadIISeries(times, x0, x1, period, step = 0.004) {
  const x = [], v = [];
  if (!times.length || !(x1 > x0)) return { x, v };
  const starts = times.slice();
  const lead = starts.length > 1 ? starts[1] - starts[0] : period;
  if (Number.isFinite(lead) && lead > 1e-6) starts.unshift(starts[0] - lead);
  const lens = starts.map((t, k) => (k + 1 < starts.length ? starts[k + 1] - t : period));
  const peaks = starts.map((t, k) => t + 0.02 * lens[k]);
  const end = Math.min(x1, starts[starts.length - 1] + period);
  let k = 0;
  for (let t = Math.max(x0, starts[0]); t <= end + 1e-9; t += step) {
    while (k + 1 < peaks.length && peaks[k + 1] <= t) k++;
    let s = 0;
    for (let j = Math.max(0, k - 1); j <= Math.min(peaks.length - 1, k + 2); j++) s += leadIIAt(t - peaks[j], lens[j]);
    x.push(t); v.push(s);
  }
  return { x, v };
}
