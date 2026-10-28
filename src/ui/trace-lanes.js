// How the beat-by-beat trace shares its card's room between its lanes: the EKG strip (thin) over the pressures (the most room) over the HVPG
// lane. Each lane has a least height it reads at; when the room is short the EKG goes first, then the HVPG lane (never a lane squeezed
// until its 12 px words cannot fit). The numbers are all in CSS pixels. pressure-time.js draws what this plans.

/** Share of the room (less the gaps) each lane takes, and the least height each reads at. */
export const LANE_SHARE = { ekg: 0.15, pressure: 0.5, hvpg: 0.35 };
export const LANE_MIN = { ekg: 24, pressure: 48, hvpg: 34 };

/**
 * avail: the room for the lanes and the gaps between them. The lanes asked for are ekg, pressure and hvpg. The pressure lane (or, with
 * none, the HVPG lane) is the base and is never dropped; when the room is short the EKG strip goes first, then the HVPG lane.
 * gap: the space between the pressures and the HVPG lane (it holds the HVPG lane's name); egap: the space under the EKG strip.
 * two: the pressure lane's share when only the pressures and the HVPG lane are drawn.
 * -> { ekg, pressure, hvpg } heights in px (0: not drawn); with their gaps they fill `avail`.
 */
export function laneRoom(avail, { ekg = false, pressure = true, hvpg = true, gap = 16, egap = 14, two = 0.64 } = {}) {
  // The lanes asked for, then without the EKG, then (with the pressures to keep) without the HVPG lane too: the first set that fits.
  const asked = { ekg, pressure, hvpg };
  const sets = [asked, { ...asked, ekg: false }, ...(pressure ? [{ ekg: false, pressure, hvpg: false }] : [])];
  for (const set of sets) {
    const keys = ['ekg', 'pressure', 'hvpg'].filter((k) => set[k]);
    if (!keys.length) continue;
    const free = avail - (set.ekg && keys.length > 1 ? egap : 0) - (set.pressure && set.hvpg ? gap : 0);
    if (free < keys.reduce((a, k) => a + LANE_MIN[k], 0)) continue;
    const sh = !set.ekg && set.pressure && set.hvpg ? { pressure: two, hvpg: 1 - two } : LANE_SHARE;
    const share = keys.reduce((a, k) => a + sh[k], 0), out = { ekg: 0, pressure: 0, hvpg: 0 };
    let used = 0;
    for (const k of keys) { out[k] = Math.max(LANE_MIN[k], Math.round(free * sh[k] / share)); used += out[k]; }
    // (rounding and the minimums: the lane with the most room takes or gives the difference, so the lanes fill the room exactly)
    const big = keys.reduce((a, k) => (out[k] > out[a] ? k : a), keys[0]);
    out[big] += free - used;
    return out;
  }
  // Not even the base lane has its least: it takes what there is.
  return { ekg: 0, pressure: pressure ? Math.max(0, avail) : 0, hvpg: !pressure && hvpg ? Math.max(0, avail) : 0 };
}
