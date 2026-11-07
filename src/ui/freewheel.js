// A trace that keeps sweeping while the model's own clock stands still (a state easing in: the frame says how long, parkSecs). The model sends no
// samples then, and a chart that waits for them stops at its last one, which looks frozen. The freewheel replays the last whole beat of the
// record over the time that passes instead: at the heart rate shown (the beats close in or open out with the number, ekg.js walkBeats), and
// brought to the phase the model's own beat resumes at as the wait ends, so the live samples take the sweep on where it is, with no restart
// and no jump. Pure (no DOM, no clock of its own): pressure-time.js hands it the record and the time, and records what it lays.
//
// Everything is made once (the kept arrays below) and written in place; a call in a frame makes nothing.

import { firstAtOrAbove } from './sorted.js';
import { ekgRate, beatWalk, walkBeats } from './ekg.js';

const STEP_MIN = 0.004, STEP_MAX = 0.03, MAX_STEPS = 400, LEVEL_S = 0.4;   // (spacing of the samples laid, s: the live ones' own, kept within these; most steps in a call)

/** `keys`: the record's value columns (its samples carry t and ph besides). */
export function createFreewheel(keys) {
  const N = new Float64Array(2);   // [the head, the wall time it was last moved on] (numbers in a typed array: a closure's variable is a heap object per write)
  const w = beatWalk(0, 0, 70), to = { ph: NaN, left: NaN }, drop = [];
  const ref = { n: 0, u: [] };   // the beat replayed: its samples at u (0 to 1) of the beat, one column to a key
  const out = { t: [], ph: [] };   // the samples laid in a call, in the shape of the live ones
  for (const k of keys) { ref[k] = []; out[k] = []; }   // alloc-rare: once, with the chart
  const base = new Float64Array(keys.length), shift = new Float64Array(keys.length);   // the readings when it began, and the replayed levels' move since, eased
  let on = false, laid = false;

  const valueAt = (k, u) => {
    const n = ref.n, v = ref[k], j = firstAtOrAbove(ref.u, u);
    if (j <= 0) return v[0];
    if (j >= n) return v[n - 1];
    const f = (u - ref.u[j - 1]) / (ref.u[j] - ref.u[j - 1]), a = v[j - 1], b = v[j];
    return Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * f : Number.isFinite(b) ? b : a;
  };
  /** The last whole beat on the record, copied (the record is cut from the front while the wait goes on). False: there is none to replay. */
  function takeBeat(fine, ts) {
    const n = ts.length;
    if (n < 2 || fine.t.length < 8) return false;
    const a = ts[n - 2], b = ts[n - 1], len = b - a;
    if (!(len > 0.2 && len < 3)) return false;
    const i = firstAtOrAbove(fine.t, a), j = firstAtOrAbove(fine.t, b);
    if (j - i < 4) return false;
    ref.n = 0;
    for (let q = i; q < j; q++) {
      ref.u[ref.n] = (fine.t[q] - a) / len;
      for (const k of keys) ref[k][ref.n] = fine[k][q];
      ref.n++;
    }
    ref.u.length = ref.n;
    for (const k of keys) ref[k].length = ref.n;
    return true;
  }
  return {
    get on() { return on; },
    /** It has laid samples since the last live ones came (the record's time may need moving on to meet them). */
    get laid() { return laid; },
    /** The head the freewheel draws to (only while `on`). */
    head: () => N[0],
    /** The live samples came: the freewheel is let go (its beats stay on the record). */
    land() { on = laid = false; },
    stop() { on = laid = false; },
    /**
     * Move the sweep on to wall time `now` and return the samples to record (null: none this call). `fine`: the record ({ t, ph, ...keys });
     * `beats`: its beat times; `lastT`: the record's newest time; `headNow`: where the trace is drawn to now (used when it starts); `lag`: s the
     * data runs ahead of the head; `hr`: the heart rate shown; `phase`, `left`: the phase the model's beat resumes at and the seconds until it does
     * (NaN for neither); `lvl`: the model's reading for each key now (NaN: none), so the beat replayed moves up or down with them as the model's state eases or the days run, glided over about 0.4 s. The result is one kept object, valid until the next call.
     */
    advance(now, fine, beats, lastT, headNow, lag, hr, phase, left, lvl = null) {
      if (!on) {
        if (!takeBeat(fine, beats)) return null;
        const ph = fine.ph[fine.ph.length - 1];
        w.ph = Number.isFinite(ph) ? ph - Math.floor(ph) : 0; w.bpm = ekgRate(beats) ?? hr; w.x = 0;
        for (let i = 0; i < keys.length; i++) { base[i] = lvl ? lvl[i] : NaN; shift[i] = 0; }
        N[0] = headNow; N[1] = now;   // (the head as it stands: the trace goes on from where it is drawn)
        on = true;
      }
      const dt = Math.min(0.25, Math.max(0, (now - N[1]) / 1000));
      N[1] = now; N[0] += dt;
      const target = N[0] + lag, n = fine.t.length;
      const gap = n > 1 ? fine.t[n - 1] - fine.t[n - 2] : 0.01, step = Math.min(STEP_MAX, Math.max(STEP_MIN, gap));
      to.ph = phase; to.left = left;
      let m = 0;
      for (let t = lastT + step; t <= target + 1e-9 && m < MAX_STEPS; t += step, m++) {
        drop.length = 0;
        walkBeats(w, step, hr, drop, to);   // (its own beats are found again from the phase by the record's beat clock)
        to.left -= step;
        out.t[m] = t; out.ph[m] = w.ph;
        const e = 1 - Math.exp(-step / LEVEL_S);
        for (let i = 0; i < keys.length; i++) {
          const want = lvl && Number.isFinite(lvl[i]) && Number.isFinite(base[i]) ? lvl[i] - base[i] : 0;
          shift[i] += (want - shift[i]) * e;
          out[keys[i]][m] = valueAt(keys[i], w.ph) + shift[i];
        }
      }
      if (!m) return null;
      out.t.length = out.ph.length = m;
      for (const k of keys) out[k].length = m;
      laid = true;
      return out;
    },
  };
}
