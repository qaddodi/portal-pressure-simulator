// The version the cards' glass keys its blur on while the lobule is drawn in the figure's own canvas (stage.js frostSeq), and the question it
// asks of it: which parts of the canvas did the pictures since its last blur reach (lobule lag rec 8, 6 Nov 2026)?
//
// A number always: LZ_V + epoch * LZ_E + the lobule's picture count (lz.drawSeq), the count taken at most every 80 ms (a pan or pinch inside the
// lobule drew a picture a frame, and the glass blurred the figure again for each, over every card; one more is asked for after the last, so the
// frost always ends on the picture that stands). The glass then asks `rects` about the pictures between two of its numbers, and blurs only the
// tiles they drew in. The epoch turns over, so a range across it is "not known" and the glass blurs all it reads, as before, whenever the figure
// itself was drawn, the lobule went from laid plain on the canvas (no hand, dive, card zoom or field: lz.plain) to not or back, or its count began again.
// Numbers below LZ_V are the figure's own picture counts (veins.drawSeq), asked of the figure's tiles; a range across the two is not known.

export const LZ_V = 1e12, LZ_E = 1e9;
const WAIT_MS = 80;

/** lz, veins: the current lobule and figure renderer ({ drawSeq(), plain?(), pictureRects?() } and { drawSeq, pictureDirtyRects?() }); later(f): calls f after
 *  about 90 ms (the stage's timer), which asks for one more present. */
export function createLzGlassSeq({ lz, veins, later, repaint, now = () => performance.now() }) {
  let last = -1, at = 0, timer = 0, epoch = 0, veinsAt = -1, plainWas = true, picture = 0;
  const base = () => LZ_V + epoch * LZ_E;
  return {
    seq() {
      const v = veins(), l = lz();
      if (v.drawSeq !== veinsAt) { veinsAt = v.drawSeq; epoch++; }
      const plain = !!l.plain?.();
      if (plain !== plainWas) { epoch++; plainWas = plain; }
      const sq = l.drawSeq();
      if (sq !== last) {
        if (sq < last) { epoch++; last = -1; }   // (the lobule's renderer was made again: its count began at 0)
        const t = now();
        if (t - at >= WAIT_MS) { last = sq; at = t; picture = base() + sq; }
        else if (!timer) timer = later(() => { timer = 0; repaint(); });
      }
      // (The epoch may have turned over since the number was taken: made again from the picture it stands for, so a turn is seen at once.)
      if (picture < base()) picture = base() + Math.max(0, last);
      return picture;
    },
    /** Where the pictures after `a` up to `b` (two numbers `seq` gave) reached, as the glass's pictureRects asks: the boxes written into out from pool and
     *  their count, 0 for nowhere, -1 when not known. */
    rects(a, b, out, pool) {
      if (a < LZ_V || b < LZ_V) return a < LZ_V && b < LZ_V ? (veins().pictureDirtyRects?.(a, b, out, pool) ?? -1) : -1;
      const x = a - LZ_V, y = b - LZ_V;
      if (Math.floor(x / LZ_E) !== Math.floor(y / LZ_E)) return -1;
      return lz()?.pictureRects ? lz().pictureRects(x % LZ_E, y % LZ_E, out, pool) : -1;
    },
  };
}
