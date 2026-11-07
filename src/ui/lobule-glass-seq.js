// The version the cards' glass keys its blur on while the lobule or the sinusoid is drawn in the figure's own canvas (stage.js frostSeq), and the
// question it asks of it: which parts of the canvas did the pictures since its last blur reach (lobule lag rec 8, 6 Nov 2026)?
//
// A number always: LZ_V + epoch * LZ_E + the lobule's picture count (lz.drawSeq), taken at every picture. The glass then asks `rects` about the
// pictures between two of its numbers, and blurs only the tiles they drew in. The epoch turns over, so a range across it is "not known" and the
// glass blurs all it reads, whenever the figure itself was drawn, the lobule went from laid plain on the canvas (no hand, dive, card zoom or field:
// lz.plain) to not or back, its count began again, the sinusoid laid a new picture (lz.sinSeq), or the figure's blood moved under a lobule that
// is not laid plain over it.
// Numbers below LZ_V are the figure's own picture counts (veins.drawSeq), asked of the figure's tiles; a range across the two is not known.
//
// (7 Nov 2026, Mohammad: the glass "not consistent and keeps popping" between Lobule, Sinusoid and Anatomy, and "does not truly glassify what's
// under it". Two holes in this number, both fixed here: the open sinusoid's pictures were in no count the glass looked at (its pass is laid in the
// figure's present, which counts none of them), so the play bar, the view pill and every pill over the sinusoid kept the blur of whatever lay there
// when it opened, sharp streaks of the lobule inside the frost, until something else moved; and the lobule's pictures were taken at most every
// 80 ms, so the frost over a lobule that pans or fades stepped five times a second where the anatomy's follows every frame. Now every picture of
// either counts, at the same cadence as the anatomy's blood (`every`, stage.js FROST_EVERY) for the sinusoid's flowing cells.)

export const LZ_V = 1e12, LZ_E = 1e9;

/** lz, veins: the current lobule and figure renderer ({ drawSeq(), plain?(), pictureRects?(), sinSeq?() } and { drawSeq, bloodSeq?, pictureDirtyRects?() });
 *  every: how many of the sinusoid's pictures, or the figure's blood frames under a lobule not laid plain, make one new number (1: each). */
export function createLzGlassSeq({ lz, veins, every = 1 }) {
  let last = -1, epoch = 0, veinsAt = -1, plainWas = true, picture = 0, sinAt = -1, bloodAt = -1;
  const base = () => LZ_V + epoch * LZ_E;
  // (A count that moved on by `every` or more, went back, or came or went (-1): a new picture for the glass.)
  const stepped = (now, at) => now !== at && (now < 0 || at < 0 || now < at || now - at >= every);
  return {
    seq() {
      const v = veins(), l = lz();
      if (v.drawSeq !== veinsAt) { veinsAt = v.drawSeq; epoch++; }
      const plain = !!l.plain?.();
      if (plain !== plainWas) { epoch++; plainWas = plain; }
      // (The sinusoid's picture: laid by its own pass in the figure's present, which counts none of them.)
      const ss = l.sinSeq?.() ?? -1;
      if (stepped(ss, sinAt)) { sinAt = ss; epoch++; }
      // (The figure's blood, seen through a lobule fading in or out, or not laid over it as it is.)
      const bs = v.bloodSeq ?? -1;
      if (plain) bloodAt = bs;
      else if (stepped(bs, bloodAt)) { bloodAt = bs; epoch++; }
      const sq = l.drawSeq();
      if (sq !== last) {
        if (sq < last) epoch++;   // (the lobule's renderer was made again: its count began at 0)
        last = sq;
      }
      // (Made again from the picture it stands for at every ask, so a turn of the epoch or a new picture is seen at once.)
      picture = base() + Math.max(0, last);
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
