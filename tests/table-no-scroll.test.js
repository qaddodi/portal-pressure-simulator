// A summary table never scrolls, in any direction, on any screen (Mohammad, 25 Oct: on an iPad on its side the table on the slide before last
// "scrolls right and left. They should not ever scroll."). The cap on the table card's width (5f3ff8c, 6a515e5) left the nine-column tables a
// little too wide for it; the table kept the overflow to itself (overflow: auto), so the card's fit never saw it. Now the table cannot be
// panned, its columns give way before it overflows, and the card's fit reads its sideways overflow and zooms until every column is in view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

// (The rule's body, from its selector at the start of a line to the closing brace.)
const rule = (sel) => { const at = css.indexOf('\n' + sel + ' {'); assert.ok(at >= 0, sel); return css.slice(at, css.indexOf('}', at)); };

test('the table card is not a scroll container a finger or a trackpad can pan', () => {
  const t = rule('.pz-table');
  assert.match(t, /overflow: hidden;/);
  assert.doesNotMatch(t, /overflow(?:-x|-y)?: (?:auto|scroll)/);
  // (The phone's and the upright tablet's rows clip as before.)
  assert.match(css, /\.pz-table \{ overflow: clip; border-radius: 12px; \}/);
  // (No other rule gives a summary table's card, or its table, a scrolling overflow.)
  for (const m of css.matchAll(/(^|\n)([^{\n]*\.pz-table[^{\n]*)\{([^}]*)\}/g)) assert.doesNotMatch(m[3], /overflow(?:-x|-y)?: (?:auto|scroll)/, m[2]);
});

test('a column heading wraps between its words rather than widen the table; the values keep to one line', () => {
  assert.doesNotMatch(rule('.pz-table thead th'), /white-space: nowrap/);
  assert.match(css, /\.pz-table \.num \{ text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; \}/);
  // (Still the one capital-letter style, with its weight and spacing: cards-critique-17oct.test.js.)
  assert.match(rule('.pz-table thead th'), /var\(--caps-w\)[^}]*letter-spacing: var\(--caps-ls\)/);
});

test('a wide screen\'s value columns keep less padding at the sides; the phone\'s grid keeps its own', () => {
  const wide = css.match(/\.pz:not\(\.stack\) \.pz-table :is\(thead th\.num, tbody td\.num\) \{ padding-inline: ([.\d]+)em; \}/);
  assert.ok(wide, 'the wide value-column padding');
  // (Under the row names' .75em, and over the phone's .1em, which is in its own block that does not apply here.)
  assert.ok(+wide[1] < 0.75 && +wide[1] > 0.1, wide[1]);
  assert.doesNotMatch(css, /\.pz\.stack[^{]*\.pz-table :is\(thead th\.num/);
  // (The row names, the note columns and the legend keep theirs.)
  assert.match(rule('.pz-table th, .pz-table td'), /padding: \.55em \.75em;/);
});

test('the card\'s fit counts a wide table\'s sideways overflow, in the card\'s pixels', () => {
  const fn = src.slice(src.indexOf('function overflowOf(el)'), src.indexOf('// What a card\'s fit depends on'));
  assert.match(fn, /const wideTable = !ui\.root\.classList\.contains\('stack'\);/);
  assert.match(fn, /if \(wideTable && c\.classList\.contains\('pz-table'\)\) sideways = Math\.max\(sideways, \(c\.scrollWidth - c\.clientWidth\) \* cz\);/);
  assert.match(fn, /h: Math\.max\(el\.scrollWidth - el\.clientWidth, sideways\)/);
  // (The count comes after the part is known to show: a hidden, absolute or folded part adds nothing.)
  assert.ok(fn.indexOf("s.maxHeight === '0px'") < fn.indexOf('sideways = Math.max'));
});

test('a wide table card zooms only as far as its lettering stays 12 px at first, the compact layout\'s rule', () => {
  assert.match(src, /function textFloor\(el\) \{\s*const px = minText\(el\);\s*return px > 12 && isFinite\(px\) \? Math\.ceil\(12 \/ px \* 1000\) \/ 1000 : 1;\s*\}/);
  assert.match(src, /function shortFit\(el\) \{[^]*?return textFloor\(el\);\s*\}/);
  assert.match(src, /const tableFloor = !small && !lowFloor && !shortFloor && el === ui\.panel && !ui\.root\.classList\.contains\('stack'\) && el\.querySelector\(':scope > \.pz-table'\) \? textFloor\(el\) : 0;/);
  // (After the compact layout's own floor, before the last resort at half.)
  assert.match(src, /if \(shortFloor > mins\[0\]\) mins\.unshift\(shortFloor\);[^\n]*\n\s*else if \(tableFloor > mins\[0\]\) mins\.unshift\(tableFloor\);/);
});

test('the widest summary table of any deck has the nine value columns the wide padding was worked out for', async () => {
  const { DECKS } = await import('../src/ui/decks.js');
  let widest = 0, which = '';
  for (const d of DECKS) for (const s of d.slides) {
    if (s.visual !== 'table') continue;
    const cols = (s.cols || ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg']).length + ((s.asc ?? !s.cols) ? 2 : 0);
    if (cols > widest) { widest = cols; which = d.id; }
  }
  // (Sites and Where: seven or six pressures with SAAG and protein. A wider table than this needs its own look at the iPad on its side.)
  assert.ok(widest <= 9, `${which} has ${widest} value columns`);
});
