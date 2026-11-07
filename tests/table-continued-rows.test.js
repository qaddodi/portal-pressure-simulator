import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sameHead } from '../src/ui/table-marks.js';

// A summary table draws a repeated row heading once (the same words in the same site's colour on consecutive rows), over the first of them.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('a heading repeats only when the words and the site both match the row above', () => {
  const a = { kicker: 'Non-selective beta-blocker', site: undefined };
  assert.equal(sameHead(a, { kicker: 'Non-selective beta-blocker', site: '' }), true, 'no site and an empty site are the same');
  assert.equal(sameHead(a, { kicker: 'Vasoactive drug' }), false);
  assert.equal(sameHead({ kicker: 'Where HVPG misleads', site: 'pre' }, { kicker: 'Where HVPG misleads', site: 'post' }), false, 'a different site colour is a different heading');
  assert.equal(sameHead({ kicker: 'Where HVPG misleads', site: 'pre' }, { kicker: 'Where HVPG misleads', site: 'pre' }), true);
  assert.equal(sameHead(null, a), false, 'the first row always shows its heading');
  assert.equal(sameHead({ kicker: '' }, { kicker: '' }), false, 'no words, nothing to repeat');
});

test('the table marks a continued row and keeps its heading in the markup', () => {
  assert.match(js, /sameHead\(rows\[n - 1\], r\) \? 'pz-cont' : ''/);
  assert.match(js, /h\('span', \{ class: 'pz-kick', 'data-site': r\.site \|\| 'none' \}, headOf\(r\)\)/, 'the heading is still in every row');
});

test('the heading of a continued row takes no room (font-size 0), stays in the markup, and the phone shows the heading in words, never a stroke', () => {
  assert.match(css, /\.pz-table tbody tr\.pz-cont th \.pz-kick \{ font-size: 0; \}/);
  assert.match(css, /\.pz-table tbody tr\.pz-cont \{ border-top-color: color-mix\(in srgb, var\(--border\) 42%, transparent\); \}/);
  // (no clipped box left to be measured: a text range of the clipped heading still ran out of its column in the smoke checks)
  assert.doesNotMatch(css, /tr\.pz-cont th \.pz-kick \{[^}]*(position: absolute|clip-path)/);
  // the tablet's note columns set the heading's size with a higher specificity: the continued row puts it back to 0 after it
  const nc = css.indexOf('.pz .pz-table.notecols tbody th .pz-kick { display: block;');
  assert.ok(nc > 0 && css.indexOf('.pz .pz-table.notecols tbody tr.pz-cont th .pz-kick { font-size: 0; }') > nc);
  // the phone's compact rows show the heading as a block of words over the name (the tablet's note columns do the same); the continued row's
  // font-size 0 is more specific than the phone's size, so a continued row still closes up there
  assert.match(css, /\.pz \.pz-table tbody th \.pz-kick \{ display: block; width: auto; background: none; font-size: var\(--s-cap\); overflow-wrap: normal; \}/);
  assert.doesNotMatch(css, /align-self: stretch; width: 3px; border-radius: 2px; background: var\(--site, transparent\)/, 'no coloured stroke beside a name');
  assert.match(css, /\.pz-table td\.note \{ grid-column: 1 \/ -1; padding: 0 10px \.6em 10px;/, 'the note sits under the name, which no stroke pushes in now');
});

test('no stylesheet rule styles a bare .pz-cont row outside the table, and the class is not the global .sub', () => {
  assert.doesNotMatch(js, /class: \[[^\]]*'sub'/);
  for (const m of css.matchAll(/[^{}]*\.pz-cont[^{]*\{/g)) assert.match(m[0], /\.pz-table/, m[0]);
});

test('the decks have rows that gain from it (the same kicker and site on consecutive rows)', async () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  let runs = 0;
  for (const f of readdirSync(dir)) {
    const m = await import(new URL(f, dir));
    const deck = m.default || Object.values(m).find((v) => v && v.slides);
    for (const s of (deck?.slides || []).filter((x) => x.visual === 'table')) {
      const rows = (s.of || []).map((o) => { const x = typeof o === 'object' ? o : {}, sl = deck.slides.find((q) => q.id === (typeof o === 'string' ? o : o.id)); return { kicker: x.kicker ?? sl?.kicker ?? '', site: x.site ?? sl?.site }; });
      rows.forEach((r, i) => { if (sameHead(rows[i - 1], r)) runs++; });
    }
  }
  assert.ok(runs >= 10, `${runs} repeated headings`);
});
