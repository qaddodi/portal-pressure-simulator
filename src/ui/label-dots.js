// Station dots kept apart (11 Nov 2026, iPhone with the Tests card open: the hepatic artery's dot stood 8 px above the portal vein's, and the
// two read as an "8" beside "HA"). A station's dot is the middle of the vessel it names (stage-label-items.js labelAnchor); where it stands
// closer than DOT_ROOM screen px to another shown station's, the lower ranked of the two slides its dot along its own vessel (au, 0.5 its
// middle: what the GPU pins the label to, stage-label-host.js pinVesselAt) to the nearest point clear of every other. With none, it stays.
// Run at a solve, before the labels are placed; a carry keeps the slid point (the slots' au).

/** Screen px kept between two stations' dots. */
export const DOT_ROOM = 14;
const SLIDE = [0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];

/**
 * items: the stations' labels ({ ax, ay, pri, au? }); pathOf(it): its vessel's course (world points) when its dot is that vessel's middle,
 * else null (it cannot slide); at(P, u): the point u along P, in stage px, as [x, y].
 */
export function spreadDots(items, pathOf, at, room = DOT_ROOM) {
  const near = (it, x, y) => items.some((o) => o !== it && Number.isFinite(o.ax) && Math.hypot(o.ax - x, o.ay - y) < room);
  for (const it of [...items].sort((a, b) => a.pri - b.pri)) {   // alloc-rare: a solve, once per station
    if (!near(it, it.ax, it.ay)) continue;
    const P = pathOf(it);
    if (!P) continue;
    for (const u of SLIDE) {
      const [x, y] = at(P, u);
      if (!near(it, x, y)) { it.ax = x; it.ay = y; it.au = u; break; }
    }
  }
}
