import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// An upright tablet keeps a small table's notes in columns under their headings, with the kickers over the names (17 Oct).
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('a table of four columns or fewer, notes counted, is marked notecols and carries its note count', () => {
  assert.match(js, /const noteCols = notes\.length && cols\.length \+ \(ascCols \? 2 : 0\) \+ notes\.length <= 4;/);
  assert.match(js, /\(noteCols \? ' notecols' : ''\)/);
  assert.match(js, /'--nn': String\(notes\.length\)/);
  assert.match(js, /notes\.map\(\(x\) => h\('th', \{ class: 'nh' \}, x\)\)/);
});

test('the upright tablet rules show the note headings, the note columns and the kickers', () => {
  const at = css.indexOf('@media (min-width: 700px) and (max-width: 1100px) and (orientation: portrait) {\n  .pz-table.notecols');
  assert.ok(at > 0, 'the upright tablet block');
  const block = css.slice(at, css.indexOf('\n}\n', at));
  assert.match(block, /repeat\(var\(--nn, 1\), minmax\(0, 1\.5fr\)\)/);
  assert.match(block, /\.pz-table\.notecols thead th\.nh:not\(\.num\) \{ display: block;/);
  assert.match(block, /\.pz-table\.notecols td\.note \{ grid-column: auto;/);
  assert.match(block, /\.pz \.pz-table\.notecols tbody th \.pz-kick \{ display: block; width: auto; background: none; font-size: var\(--s-cap\)/);
  // (comes after the compact rules it overrides: the phone's hidden headings and full-width note line)
  assert.ok(at > css.indexOf('.pz-table thead th:not(.num):not(:first-child):not(.ah) { display: none; }'));
  assert.ok(at > css.indexOf('.pz-table td.note { padding-left: 31px;'));
});

test('the Doppler findings table is one of them', () => {
  const dir = new URL('../src/ui/decks/', import.meta.url), hits = [];
  for (const f of readdirSync(dir)) {
    for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/visual: 'table', cols: \[([^\]]*)\], asc: (true|false)[^\n]*?note: (\[[^\]]*\]|'[^']*')/g)) {
      const nc = m[1].split(',').length + (m[2] === 'true' ? 2 : 0), nn = m[3].startsWith('[') ? m[3].split("',").length : 1;
      if (nc + nn <= 4) hits.push(f);
    }
  }
  assert.ok(hits.includes('doppler.js'), hits.join());
});
