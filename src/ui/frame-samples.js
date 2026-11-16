// The model's beat-by-beat samples for the cards that read the PAINTED frame (the presenter's instruments, the scope lens).
//
// The worker posts a frame about every 95 ms and each carries the samples taken since the one before. The paint gate (paint-gate.js)
// takes every frame in, but paints only the newest waiting one, and does not paint a quiet one at all that comes within 80 ms of the last
// paint. A card that draws from painted frames therefore never saw the samples of the frames in between: a hole of 0.1 s to a few
// seconds in a strip that works from the cardiac phase, so a wrap of the phase (a heartbeat) fell in the hole and the beat was missing,
// or a beat was found twice (the EKG strip: one beat, a long flat stretch, then crowded beats). The dock's traces never had this: they
// take every frame in (dock.ingest). This does the same for the painted frame: it keeps the samples of every frame taken in since the
// last paint and hands the painted frame all of them, in order, so a card sees an unbroken stream whatever is painted.

const MAX_OWED = 300;   // (frames: about 30 s; a page that has not painted for longer has no card showing)

/** The samples objects (arrays by key, each the same length) joined in order, as one. */
export function joinSamples(list) {
  const first = list[0];
  const out = {};
  let n = 0;
  for (let i = 0; i < list.length; i++) n += list[i].t.length;
  for (const k of Object.keys(first)) {
    const a = new Float64Array(n);   // alloc-rare: only when frames were taken in without being painted
    for (let i = 0, at = 0; i < list.length; i++) { const v = list[i][k]; if (v) a.set(v, at); at += list[i].t.length; }
    out[k] = a;
  }
  return out;
}

export function createSampleOwing() {
  const owed = [];   // (the frames' samples taken in and not yet handed over)
  let gen, clock;
  return {
    /** Every frame, as it is taken in (not as it is painted). */
    take(f) {
      // A new patient or a clock change replaces the stream (the worker drops the old samples, worker-core.js stateChanged): what is owed
      // of the old one is of no use to a card that reads the new one. A state easing in posts no samples of its own.
      if (f.gen !== gen || f.clock !== clock || f.morphing) owed.length = 0;
      gen = f.gen; clock = f.clock;
      if (f.morphing || !f.samples?.t?.length) return;
      owed.push(f.samples);
      if (owed.length > MAX_OWED) owed.shift();
    },
    /** The frame to paint: itself when it carries all the samples owed, else a copy that carries them all. Call once for each paint. */
    forPaint(f) {
      const n = owed.length;
      if (!n || (n === 1 && owed[0] === f.samples)) { owed.length = 0; return f; }
      const samples = joinSamples(owed);
      owed.length = 0;
      return { ...f, samples };
    },
    get pending() { return owed.length; },
  };
}
