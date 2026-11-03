// A comparison table never shows "…" for a value, and never stays blank: a row whose patient is still being computed has empty cells (said
// "calculating" to a screen reader), and the table itself fills them in the moment the patient arrives, however the table was drawn.
// (1 Nov 2026, found by a screenshot pass: Two inflows 10 on an iPhone showed "…" in every value cell, Circuit 10 on an iPad two rows of
// them. The patients a table compares that no slide shows are computed after the slides; the fill-in was asked for only by the slide's
// landing, so a table drawn another way, or a landing that never came to its end, left the cells "…" for good.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const wave = readFileSync(new URL('../src/ui/col-wave.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const body = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); assert.ok(a > 0 && b > a, from); return src.slice(a, b); };

test('no table cell is ever drawn as "…": a pending cell is empty and told to a screen reader', () => {
  const table = body('  function summaryTable(', '  // (A visual a deck visuals package registers');
  assert.doesNotMatch(table, /'…'|"…"/, 'a table cell prints "…"');
  // (R15: no longer an empty cell: a faint bar of a value's width, hidden from the screen reader, which still hears 'calculating'.)
  assert.match(src, /const pendEl = \(\) => h\('td', \{ class: 'num pend', 'aria-busy': 'true' \}, h\('span', \{ class: 'pz-pendbar', 'aria-hidden': 'true', style: \{[^}]*\} \}\), h\('span', \{ class: 'sr-only' \}, 'calculating'\)\);/);
  assert.equal((table.match(/pendEl\(\)/g) || []).length, 4, 'the value, ascites (two) and column-package cells all use it');
  assert.doesNotMatch(wave, /'…'/, 'the Doppler trace cell prints "…" while it is drawn');
});

test('a table asks for its own rows to be filled in, as it is built, and lets go once it has left the page', () => {
  const table = body('  function summaryTable(', '  // (A visual a deck visuals package registers');
  assert.match(table, /watchRows\(el, s\);\s*return el;/, 'the table starts watching its rows before it is returned');
  const fn = body('  function watchRows(', '  const fpOf = ');
  assert.match(fn, /rowIdx\(s\)\.filter\(\(x\) => !states\[x\]\)/, 'every row whose patient is not in yet');
  assert.match(fn, /stateReady\(k\)\.then/);
  assert.match(fn, /!el\.isConnected\) return;/, 'a table the talk has moved on from is let go');
  assert.match(fn, /summaryTable\(s, k\)[\s\S]*el\.replaceWith\(t\)/, 'the table is drawn again with the new row, its cells fading in');
  assert.doesNotMatch(src, /fillTable/, 'the slide landing is no longer the only thing that fills a table in');
});

test('a table shows its numbers when it lands where it can, waiting only a moment for a patient still being computed', () => {
  const at = src.indexOf("await Promise.race([Promise.all(rowIdx(s).map(stateReady)), wait(TABLE_WAIT_MS)]); if (cut()) return;");
  assert.ok(at > 0, 'a table waits for its patients, but not for long');
  assert.match(src, /const TABLE_WAIT_MS = 1500;/);
  assert.match(src, /else if \(s\.visual\) \{ await Promise\.all\(rowIdx\(s\)\.map\(stateReady\)\); if \(cut\(\)\) return; \}/, 'the other visuals wait for every patient, as before');
});

test('a Doppler column cell is as tall waiting as it is drawn, and its trace keeps clear of the row rules', () => {
  assert.match(wave, /pend: \(\) => h\('td', \{ class: 'num pend pze-wcell', 'aria-busy': 'true' \}, h\('span', \{ class: 'pze-wbox' \}\), h\('span', \{ class: 'sr-only' \}, 'calculating'\)\),/);
  assert.match(src, /colExt\(k\)\.pend\?\.\(\) \?\? pendEl\(\)/);
  const room = css.match(/\.pz-table td\.pze-wcell \{ padding-block: ([\d.]+)em;/);
  assert.ok(room && +room[1] >= 0.4, 'at least .4em above and below the trace box: a flat line at the scale\'s edge sat 3 px from the rule');
  assert.match(css, /\.pze-wbox \{[^}]*height: 1\.8em;/, 'the box is 1.8em: with the padding the row stays as tall as before');
});
