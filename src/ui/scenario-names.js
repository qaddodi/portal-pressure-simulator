// The scenario pill's short forms (main.js): a phone shows a short form of a long name, wrapped to two lines if needed ("Decomp. cirrhosis", not "Decomp…"); the narrowest room
// (a phone held sideways, 84 px) takes the compact form. Pure, so tests/scenario-names.test.js can check every preset's name fits two lines.
export const LINE_CHARS = 15;   // (characters a line of the pill holds on a phone; two lines at most)
/** How many lines a name takes in the pill, wrapped greedily at word breaks. */
export const linesOf = (name, w = LINE_CHARS) => { let n = 1, cur = 0; for (const word of name.split(' ')) { const len = word.length; if (cur && cur + 1 + len > w) { n++; cur = len; } else cur += (cur ? 1 : 0) + len; } return n; };
export const shortName = (s) => s.replace(/\s*\(.*\)$/, '').replace(/,.*$/, '').replace(/^Decompensated cirrhosis \+ TIPS$/, 'Cirrhosis + TIPS').replace(/^Decompensated\b/, 'Decomp.').replace(/^Compensated\b/, 'Comp.').replace(/^Clinically significant PH$/, 'CSPH');
export const COMPACT = { 'Acute portal vein thrombosis': 'Acute PVT', 'Schistosomiasis / NCPH': 'Schisto­somiasis', 'Cirrhosis with gastrorenal shunt': 'Gastrorenal shunt', 'Sinusoidal obstruction syndrome': 'SOS' };
