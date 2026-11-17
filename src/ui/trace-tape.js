// A pressure trace as a monitor records it: written once, sample by sample, as the procedure's clock passes, and never drawn differently after
// (Mohammad, 17 Nov 2026: "what's already been measured or traced is actually changing"). Before, each frame worked the whole trace out again from
// the model's heart phase and the live readings at that moment, so every beat already drawn slid and re-shaped as the clock, the heart rate or a
// reading moved on. Now a tape keeps every sample: its pressure, and the beat and breath phases it was written at so the wave carries on from them.
//
// The one pressure monitor (monitor.js) keeps a tape per canvas; every measurement on it (the HVPG catheter, the EUS-PPG needle, the PPG by IR, the
// PPG through a TIPS) records through it. A script gives the trace's mean level lv(t, v) and how damped its pulse is, damp(t) (hvpg-clock.js):
//   - the beat follows the patient's heart rate and stays in step with the model's own beat (the EKG, the Doppler), pulled in gently, never jumped;
//   - the readings a level is drawn from are eased (a quarter of a second) so a reading that lands, or a live value that drifts, never steps the trace;
//   - Back (the clock running down) erases the trace back to the head, as the tape is rewound; going on writes it afresh from where it stands.
// Pure: no DOM, no clock of its own. The tests drive it with made-up times.

import { traceWave, wavePhaseAt, wrapHalf, BREATH_S } from './hvpg-clock.js';

/** A sample every 10 ms on the procedure's clock (the a wave is about 50 ms wide). */
export const TAPE_DT = 10;
const LOCK_MS = 450, EASE_MS = 250;
const LOCK = 1 - Math.exp(-TAPE_DT / LOCK_MS), EASE = 1 - Math.exp(-TAPE_DT / EASE_MS);
const PH = [0, 0, 70, 1];   // (wavePhaseAt's answer: kept)
const PULL = 0.3;
const pull = (x, cap) => (x > cap ? cap : x < -cap ? -cap : x);

/** A new, empty tape. */
export const createTape = () => ({ S: null, t0: 0, dt: TAPE_DT, n: 0, cap: 0, p: null, ph: null, br: null, keys: null, vs: null, vh: null, V: null });

/** Empty the tape (a new measurement, the monitor waiting for the tip). */
export function tapeClear(tp) { tp.n = 0; }

function fit(tp, S) {
  const cap = Math.ceil((S.win[1] - S.win[0]) / TAPE_DT) + 2;
  if (tp.S === S && tp.p && tp.cap === cap) return;
  tp.S = S; tp.t0 = S.win[0]; tp.n = 0; tp.cap = cap;
  // alloc-rare: only when the monitor is handed another measurement
  tp.p = new Float32Array(cap); tp.ph = new Float64Array(cap); tp.br = new Float64Array(cap); tp.keys = null;
}
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
function keysOf(tp, v) {
  // alloc-rare: once per measurement (the readings object keeps its shape)
  tp.keys = Object.keys(v).filter((k) => typeof v[k] === 'number');
  const K = tp.keys.length;
  tp.vs = new Float64Array(K); tp.vh = new Float32Array(tp.cap * K); tp.V = {};
  for (const k of tp.keys) tp.V[k] = NaN;
}

/**
 * Write the tape up to procedure time tHead (ms) on script S (lv, damp, win), from the readings v and the model's beat and breath w
 * (hvpg-clock.js syncWave; null: the procedure's own 70/min and 4 s breath). Samples already written are never touched; a head that has
 * gone back erases those past it.
 */
export function tapeAdvance(tp, S, tHead, v, w = null) {
  fit(tp, S);
  const dt = TAPE_DT, t0 = tp.t0;
  const kHead = Math.min(tp.cap - 1, Math.floor((Math.min(tHead, S.win[1]) - t0) / dt + 1e-9));
  if (kHead < 0) { tp.n = 0; return tp; }
  if (kHead + 1 < tp.n) tp.n = kHead + 1 > 1 ? kHead + 1 : 0;   // (rewound: the samples past the head are gone; back to the start, it starts afresh)
  if (tp.n > kHead) return tp;
  if (!tp.keys) keysOf(tp, v);
  const K = tp.keys.length, keys = tp.keys, vs = tp.vs, V = tp.V;
  if (tp.n > 0) for (let j = 0; j < K; j++) vs[j] = tp.vh[(tp.n - 1) * K + j];
  for (let k = tp.n; k <= kHead; k++) {
    const tk = t0 + k * dt;
    wavePhaseAt(tk, w, PH);
    let ph, br;
    if (k === 0) { ph = PH[0]; br = PH[1]; for (let j = 0; j < K; j++) vs[j] = +v[keys[j]]; }
    else {
      // (on at the heart's rate and the breath's, and pulled gently toward where the model's own beat and breath are)
      // (a catch-up never runs the heart or the breath more than 30% fast or slow: a beat is never squeezed or stretched out of shape)
      const sp = (dt / 1000) * (PH[2] / 60), sb = dt / 1000 / BREATH_S;
      ph = tp.ph[k - 1] + sp; ph += pull(LOCK * wrapHalf(PH[0] - ph), PULL * sp);
      br = tp.br[k - 1] + sb; br += pull(LOCK * wrapHalf(PH[1] - br), PULL * sb);
      for (let j = 0; j < K; j++) {
        const x = +v[keys[j]], s = vs[j];
        vs[j] = !fin(x) || !fin(s) ? x : s + (x - s) * EASE;
      }
    }
    tp.ph[k] = ph; tp.br[k] = br;
    for (let j = 0; j < K; j++) { V[keys[j]] = vs[j]; tp.vh[k * K + j] = vs[j]; }
    const lv = S.lv(tk, V);
    tp.p[k] = fin(lv) ? lv + traceWave(ph, br, PH[2], S.damp(tk), PH[3]) : NaN;
  }
  tp.n = kHead + 1;
  return tp;
}

/** The time (ms) of sample k. */
export const tapeT = (tp, k) => tp.t0 + k * tp.dt;
/** The sample at or before time t (up: at or after), or -1 when the tape has none there. */
export function tapeIndex(tp, t, up = false) {
  const x = (t - tp.t0) / tp.dt, k = up ? Math.ceil(x - 1e-9) : Math.floor(x + 1e-9);
  return k >= 0 && k < tp.n ? k : -1;
}
/** The pressure recorded at time t (the sample at or before it; up: at or after), NaN where nothing is recorded. */
export function tapeAt(tp, t, up = false) {
  const k = tapeIndex(tp, t, up);
  return k < 0 ? NaN : tp.p[k];
}
