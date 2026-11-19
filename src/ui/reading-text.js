// A reading's digits as the labels' keys and sizes see them (bible review 19 Nov 2026, STG-5; the lobule's labels, as the stage's padNum, stage-label-size.js).
// Tabular digits are all one width, so a label's box depends on how many there are, not which: every digit is a zero, and the first run of each number
// (the whole part, not the decimals) is padded to two, the most a station's pressure shows. 9.9 and 10.0 read "00.0"; 100.0 is "000.0".
export const padDigits = (h) => h.replace(/(^|[^\d.])(\d+)/g, (m, a, n) => a + '0'.repeat(Math.max(2, n.length))).replace(/\d/g, '0');
