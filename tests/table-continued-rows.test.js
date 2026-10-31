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
  assert.match(js, /h\('span', \{ class: 'pz-kick', 'data-site': r\.site \|\| 'none' \}, r\.kicker\.replace\('Intrahepatic · ', ''\)\)/, 'the heading is still in every row');
});

test('the heading of a continued row is hidden by clipping, not removed, and the phone keeps its site stroke', () => {
  assert.match(css, /\.pz-table tbody tr\.pz-cont th \.pz-kick \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\);/);
  assert.match(css, /\.pz-table tbody tr\.pz-cont \{ border-top-color: color-mix\(in srgb, var\(--border\) 42%, transparent\); \}/);
  const at = css.indexOf('@media (max-width: 767px), (max-width: 1100px) and (orientation: portrait) {\n  .pz .pz-table:not(.notecols) tbody tr.pz-cont');
  assert.ok(at > css.indexOf('.pz .pz-table tbody th .pz-kick { font-size: 0;'), 'put back after the phone rows set the stroke');
  assert.match(css.slice(at, css.indexOf('\n}\n', at)), /position: static; width: 3px; height: auto; overflow: visible; clip-path: none;/);
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
