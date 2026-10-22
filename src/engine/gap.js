// A pressure gradient as the screen shows it: the difference of the two readings as displayed (one decimal), so a card
// that reads WHVP 16.4 and FHVP 4.8 reads HVPG 11.6, never 11.7. The model keeps its own decimals; any other value (a
// reading that was not measured) passes through unchanged.
const r1 = (v) => Math.round(v * 10) / 10;
export const tenthGap = (hi, lo, raw) => (Number.isFinite(hi) && Number.isFinite(lo) ? r1(r1(hi) - r1(lo)) : raw);
