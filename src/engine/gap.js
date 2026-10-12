// A pressure gradient as the screen shows it: the difference of the two readings as displayed (whole mmHg), so a card
// that reads WHVP 16 and FHVP 5 reads HVPG 11, never 11.7. The model keeps its own decimals; any other value (a
// reading that was not measured) passes through unchanged.
export const wholeGap = (hi, lo, raw) => (Number.isFinite(hi) && Number.isFinite(lo) ? Math.round(hi) - Math.round(lo) : raw);
// The same at one decimal, as every other screen shows the readings: WHVP 16.4 and FHVP 4.8 give HVPG 11.6, never 11.7.
const r1 = (v) => Math.round(v * 10) / 10;
export const tenthGap = (hi, lo, raw) => (Number.isFinite(hi) && Number.isFinite(lo) ? r1(r1(hi) - r1(lo)) : raw);
