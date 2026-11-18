// The recorder's history as plain JSON, small enough to paste (screen-report plan step 2c; the bug packet, step 2d, carries it).
//
//   exportHistory({ samples, events, traces, vb, env, startedAt }, { seconds = 10, maxBytes = 60000 }) -> { v: 1, seconds, step, startedAt, vb, env, samples, events, traces }
//   decodeHistory(history) -> the same with every sample whole (what the rules read)
//
// A sample that equals the one before it in a part (camera c, labels L, cards K) leaves that part out; decodeHistory carries the last one forward.
// null stays null: that source could not be read. Numbers are rounded (px to whole, alpha to 0.01, zoom to 5 places). When the text is over
// `maxBytes` the samples are thinned (every 2nd, 3rd...) until it fits, and `step` says by how much; the rules judge by time, not by counting samples.
export const HISTORY_V = 1;

const r0 = (v) => Math.round(v), r2 = (v) => Math.round(v * 100) / 100, r5 = (v) => Math.round(v * 1e5) / 1e5;
const optPx = (v) => (v == null ? undefined : r0(v));
const label = (e) => { const o = [e[0], r0(e[1]), r0(e[2]), r0(e[3]), r0(e[4]), r2(e[5])]; if (e[6] != null) o.push(optPx(e[6]), optPx(e[7])); return o; };
const card = (e) => [e[0], r0(e[1]), r0(e[2]), r0(e[3]), r0(e[4]), r2(e[5])];

/** One sample, rounded: { t, c, L, K }. */
export function roundSample(s) {
  return { t: r0(s.t), c: s.c ? [r5(s.c[0]), Math.round(s.c[1] * 100) / 100, Math.round(s.c[2] * 100) / 100] : s.c ?? null, L: s.L ? s.L.map(label) : s.L ?? null, K: s.K ? s.K.map(card) : s.K ?? null };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Samples with a part equal to the previous kept sample's left out. */
export function packSamples(samples) {
  const out = [];
  let prev = null;
  for (const s of samples) {
    const q = { t: s.t };
    for (const k of ['c', 'L', 'K']) if (!prev || !same(s[k], prev[k])) q[k] = s[k];
    out.push(q); prev = s;
  }
  return out;
}

/** The inverse: every sample whole. */
export function unpackSamples(samples) {
  const out = [];
  let prev = { c: null, L: null, K: null };
  for (const q of samples) {
    const s = { t: q.t, c: 'c' in q ? q.c : prev.c, L: 'L' in q ? q.L : prev.L, K: 'K' in q ? q.K : prev.K };
    out.push(s); prev = s;
  }
  return out;
}

export function exportHistory({ samples = [], events = [], traces = [], vb = null, env = null, startedAt = null } = {}, { seconds = 10, maxBytes = 60000 } = {}) {
  const end = samples.length ? samples[samples.length - 1].t : 0, from = end - seconds * 1000;
  const win = samples.filter((s) => s.t >= from).map(roundSample);
  const ev = events.filter((e) => e.t >= from).map((e) => ({ ...e, t: r0(e.t) }));
  const tr = traces.filter((t) => (t.at ?? end) >= from).map((t) => ({ ...t, frames: t.frames.map((f) => [r0(f[0]), r5(f[1]), r5(f[2]), r5(f[3])]) }));
  let step = 1, out;
  for (;;) {
    const kept = win.filter((_, i) => i % step === 0 || i === win.length - 1);
    out = { v: HISTORY_V, seconds, step, startedAt, vb, env, samples: packSamples(kept), events: ev, traces: tr };
    if (step >= 64 || JSON.stringify(out).length <= maxBytes) break;
    step *= 2;
  }
  return out;
}

export function decodeHistory(h) {
  if (!h || h.v !== HISTORY_V) throw new Error(`history: version ${h && h.v} is not ${HISTORY_V}`);
  return { ...h, samples: unpackSamples(h.samples || []) };
}
