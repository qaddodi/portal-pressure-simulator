// A stent's three gates read the open stent's velocity times how much faster each third runs (its narrowing: topology.js stentReadsOf).
// The Doppler's numbers are means over the last seconds of its record, and every sample in that record was taken under the narrowing
// the stent had then: a mean of old, fast open-stent samples times the new narrowing's factor read a jet the stent never had (play-test,
// 17 Nov 2026, TIPS deck slide 22: 1241 cm/s, settling to 540 over a few seconds). So the factors are kept with the record, as the times
// they changed (a change is rare: a learner's or a slide's edit, never per frame), and every sample is weighed by the factors of its own
// time. A reading then eases from the old gate's number to the new one and never passes it.

/** A record of the factors' changes: `note` when they may have changed, `at` for a sample's own, `mean` for a window's. */
export function gateFactors() {
  const ep = [];   // [t, f0, f1, f2], oldest first (alloc-rare: one row a change of the stent's narrowing)
  const out = [1, 1, 1];
  return {
    /** The factors from time t on (a stent's three gates; 1, 1, 1 for any other vessel). */
    note(t, f0, f1, f2) {
      const l = ep[ep.length - 1];
      if (l && l[1] === f0 && l[2] === f1 && l[3] === f2) return;
      if (l && t <= l[0]) { l[1] = f0; l[2] = f1; l[3] = f2; return; }
      ep.push([t, f0, f1, f2]);   // alloc-rare: the same change
    },
    /** Gate k's factor for a sample taken at time t (the first factors for a sample from before them). */
    at(t, k) {
      for (let i = ep.length - 1; i >= 0; i--) if (ep[i][0] <= t) return ep[i][1 + k];
      return ep.length ? ep[0][1 + k] : 1;
    },
    /** The three gates' factors over the samples buf[i] = [t, v] with t from `from` to `to`, each weighed by its speed (written into `into`):
     *  the gated mean is then the open mean times these. With no flow in the window, the factors now. */
    mean(buf, from, to, into = out) {
      let w = 0, a = 0, b = 0, c = 0;
      for (let i = buf.length - 1; i >= 0 && buf[i][0] >= from; i--) {
        const t = buf[i][0];
        if (t > to) continue;
        const v = Math.abs(buf[i][1]);
        w += v; a += v * this.at(t, 0); b += v * this.at(t, 1); c += v * this.at(t, 2);
      }
      if (w > 1e-9) { into[0] = a / w; into[1] = b / w; into[2] = c / w; }
      else { const l = ep[ep.length - 1]; into[0] = l ? l[1] : 1; into[1] = l ? l[2] : 1; into[2] = l ? l[3] : 1; }
      return into;
    },
    /** Forget the changes no sample from t0 on was taken under (the record's front dropped). */
    prune(t0) {
      let n = 0;
      while (n + 1 < ep.length && ep[n + 1][0] <= t0) n++;
      if (n) ep.splice(0, n);
    },
    clear() { ep.length = 0; },
    get size() { return ep.length; },
  };
}
