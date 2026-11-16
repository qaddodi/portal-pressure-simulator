// The mean arterial pressure as the bedside writes it from the two pressures it prints: diastolic + (systolic − diastolic) / 3.
// One place does the sum: the metrics' blood pressure triple and the formatter that prints it (vital-read.js bpText) both call it,
// so "S/D (M)" always checks by hand (16 Nov 2026: 117/69 (84) and 116/69 (82) did not).
export const bedsideMean = (sbp, dbp) => dbp + (sbp - dbp) / 3;
