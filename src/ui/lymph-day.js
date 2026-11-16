// The lymph's one printed form: mL a day, rounded to 10 (one rounding for the fluid balance card, the lobule's and the sinusoid's lymph
// labels and the lobule card, so a card and a label never print two numbers for one value; 16 Nov 2026, play-test: "3,450 mL/day" on the
// card, "2.2 mL/min" on the figure). The model's mL/min goes in; a day's mL comes out.

/** A rate in mL/min as mL a day, to the nearest 10 (never below 0). */
export const lymphDay = (mlMin) => Math.round((Math.max(0, mlMin) * 1440) / 10) * 10;

/** The same with its thousands comma ("3,170"). */
export const lymphText = (mlMin) => lymphDay(mlMin).toLocaleString('en-US');

/** The unit every lymph reading is printed in. */
export const LYMPH_UNIT = 'mL/day';
