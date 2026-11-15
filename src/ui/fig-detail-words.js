// Settings › Figure detail: the name of every step of the figure's size, one name each (15 Nov 2026, Mohammad: "there's two softest").
// The steps run from a quarter of a megapixel up to Full (the screen's own density, 0). Standard is this device's own default (a phone's is a
// lighter picture than a laptop's), so the names are counted outward from it: below it Soft, Softer, Softest; above it Sharp, Sharper, Sharpest,
// Fine, Finer, Finest, Ultra; Full at the top. The old table named only two steps each way and gave every step beyond them the last word, so a
// Mac read Standard, Softer, Softest, Softest. Here the names run out into the megapixel figure rather than ever repeating one.

export const FIG_STEPS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 0];
const BELOW = ['Soft', 'Softer', 'Softest'];
const ABOVE = ['Sharp', 'Sharper', 'Sharpest', 'Fine', 'Finer', 'Finest', 'Ultra'];

/** One name for every step, in step order: the steps `steps` (megapixels, 0 = Full, last), the device's default step `dflt`. */
export function figDetailWords(steps = FIG_STEPS, dflt = 1.5) {
  const at = steps.indexOf(dflt);
  return steps.map((v, i) => {
    if (!v) return 'Full';
    const d = at - i;
    if (d === 0) return 'Standard';
    return (d > 0 ? BELOW[d - 1] : ABOVE[-d - 1]) || `${v} MP`;
  });
}
