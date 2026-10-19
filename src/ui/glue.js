// Words that belong together stay on one line in a slide's text (presenter.js: the lines, the case card, the causes).
// A name joined by an en dash (Budd–Chiari) never breaks at the dash, a number never breaks from its unit ("6.9 mmHg",
// "4.3 g/dL"), and a range keeps its two ends and its unit together ("6 to 9 mmHg").
const UNIT = String.raw`(?:mmHg|mL\/min|L\/min|g\/dL|mg\/dL|kPa|cm\/s|cm|mm|mL|[µμ]L|\/[µμ]L|kg|g|L|%|points?|hours?|days?|weeks?|months?|years?)(?![\p{L}\d])`;
const RANGE = new RegExp(String.raw`(\d) (to|or|and) (?=\d[\d.,]*[\u00a0 ]?${UNIT})`, 'gu');
const UNIT_GAP = new RegExp(String.raw`(\d) (?=${UNIT})`, 'gu');
export const nb = (t) => (t || '').replace(/(\p{L})–(\p{L})/gu, '$1–\u2060$2').replace(RANGE, '$1\u00a0$2\u00a0').replace(UNIT_GAP, '$1\u00a0');

// A list's later items in sentence case ("Sarcoidosis, congenital hepatic fibrosis, early primary biliary cholangitis"):
// an abbreviation (IVC web, HIV) or a name (Child–Pugh) keeps its capitals.
const PROPER = /^(?:Child|Budd|Wilson|Hodgkin|Kupffer|Doppler|Baveno|Laplace)\b/;
export const listCase = (items) => items.map((x, i) => (i && /^\p{Lu}\p{Ll}/u.test(x) && !PROPER.test(x) ? x[0].toLowerCase() + x.slice(1) : x)).join(', ');

// A platelet count in running text ("88,000/µL"); the tiles keep their ×10³/µL.
export const plateletText = (v) => `${(Math.round(v) * 1000).toLocaleString('en-US')}/µL`;
