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
const MINS = [LANE_MIN.ekg, LANE_MIN.pressure, LANE_MIN.hvpg], SHARES = [LANE_SHARE.ekg, LANE_SHARE.pressure, LANE_SHARE.hvpg];
const NO_OPTS = Object.freeze({});
// (The answer is one of a ring of kept objects, written in place: the trace plans its lanes on a draw, and a caller holds its plan for that draw.)
const RING = Array.from({ length: 4 }, () => ({ ekg: 0, pressure: 0, hvpg: 0 }));
let ringAt = 0;
const SET = [false, false, false], H = [0, 0, 0], SH = [0, 0, 0];
export function laneRoom(avail, opts = NO_OPTS) {
  const ekg = opts.ekg ?? false, pressure = opts.pressure ?? true, hvpg = opts.hvpg ?? true, gap = opts.gap ?? 16, egap = opts.egap ?? 14, two = opts.two ?? 0.64;
  const out = RING[ringAt]; ringAt = (ringAt + 1) & 3;
  // The lanes asked for, then without the EKG, then (with the pressures to keep) without the HVPG lane too: the first set that fits.
  const nSets = pressure ? 3 : 2;
  for (let si = 0; si < nSets; si++) {
    SET[0] = si === 0 && ekg; SET[1] = pressure; SET[2] = si === 2 ? false : hvpg;
    let nk = 0, mins = 0;
    for (let k = 0; k < 3; k++) if (SET[k]) { nk++; mins += MINS[k]; }
    if (!nk) continue;
    const free = avail - (SET[0] && nk > 1 ? egap : 0) - (SET[1] && SET[2] ? gap : 0);
    if (free < mins) continue;
    const two2 = !SET[0] && SET[1] && SET[2];
    SH[0] = SHARES[0]; SH[1] = two2 ? two : SHARES[1]; SH[2] = two2 ? 1 - two : SHARES[2];
    let share = 0;
    for (let k = 0; k < 3; k++) if (SET[k]) share += SH[k];
    let used = 0, big = -1;
    for (let k = 0; k < 3; k++) {
      H[k] = 0;
      if (!SET[k]) continue;
      H[k] = Math.max(MINS[k], Math.round(free * SH[k] / share)); used += H[k];
      if (big < 0 || H[k] > H[big]) big = k;
    }
    // (rounding and the minimums: the lane with the most room takes or gives the difference, so the lanes fill the room exactly)
    H[big] += free - used;
    out.ekg = H[0]; out.pressure = H[1]; out.hvpg = H[2];
    return out;
  }
  // Not even the base lane has its least: it takes what there is.
  out.ekg = 0; out.pressure = pressure ? Math.max(0, avail) : 0; out.hvpg = !pressure && hvpg ? Math.max(0, avail) : 0;
  return out;
}
