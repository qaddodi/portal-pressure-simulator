// How big the view's sharp organ picture may be made on the memory there is (stage-plate.js settled). Pure: numbers in, numbers out; the one call that
// touches the GPU's books (gpu-budget.js freeBytes, room) is handed in.
//
// 18 Nov 2026, the iPhone's tab was killed on the HVPG deck's slide 5 to 6 every time: the way out of the lobule meets the camera's glide to the catheter's tip,
// and a close view asks for a sharp picture of the organs, 3.5 MP of its own and the same again in each of the painter's seven targets (about 110 MB), made over the
// lobule's buffers that are still warm. The picture was sized by pixels alone (4.2 MP), never by what the page could still hold. Now it is asked of the registry first:
// the widest margin that fits, then a narrower one, then a smaller scale, and none when even that does not fit (the whole-plate picture stays, a little soft).

/** The painter's targets a picture of any depth fills: the coverage scratch and the layer pairs a nested group takes (organ-paint.js). */
export const PAINTER_TARGETS = 7;
/** The bytes a picture of `px` device pixels asks of the GPU: its own texture, and what the painter's targets grow by to paint it (growBytes: the targets' size for it, less what they hold). */
export const plateBytes = (px, grow = 0) => px * 4 + grow;

const REACH_STEPS = 4, SCALE_STEPS = [0.85, 0.7, 0.55];

/**
 * The margin and scale the picture is made at. view: the screen's world box in device px at `need` (vw, vh). reachMax, reachMin: the margin past each side
 * (a share of the view) that is wanted and the least worth making; minScale: the smallest scale that is any sharper than the picture already shown.
 * bytesAt(reach, k): the bytes asked at that margin and k of `need` (k 1: as wanted). free(bytes, evict): the room there is for them (evict: letting go of what is held
 * for later to make it). Returns { reach, k } or null when nothing worth making fits.
 */
export function fitPlateView({ need, reachMax, reachMin, minScale, bytesAt, free }) {
  const rungs = [];
  for (let i = 0; i < REACH_STEPS; i++) rungs.push([reachMax + (reachMin - reachMax) * (i / (REACH_STEPS - 1)), 1]);
  for (const k of SCALE_STEPS) rungs.push([reachMin, k]);
  // (First what fits as things stand, then the same ladder once what is held for later has been let go.)
  for (const evict of [false, true]) {
    for (const [reach, k] of rungs) {
      if (need * k < minScale) continue;
      const b = bytesAt(reach, k);
      if (free(b, evict) >= b) return { reach, k };
    }
  }
  return null;
}
