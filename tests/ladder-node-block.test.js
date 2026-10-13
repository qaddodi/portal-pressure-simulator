// A block that sits on a station (the right atrium in heart failure) is hatched on its node, not on a stretch of line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseDeckSource } from '../src/ui/deck-source.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const slides = readdirSync(DIR).filter((f) => f.endsWith('.js'))
  .flatMap((f) => parseDeckSource(readFileSync(new URL(f, DIR), 'utf8')).slides.map((s) => ({ ...s, f })));

test('a slide that names a block station shows the ladder and names one of its five stations', () => {
  for (const s of slides.filter((x) => x.block)) {
    assert.equal(s.data, 'ladder', `${s.f} ${s.id}: block needs the ladder`);
    assert.ok(['pv', 'whvp', 'fhvp', 'ivc', 'ra'].includes(s.block), `${s.f} ${s.id}: ${s.block}`);
  }
});

test('every heart failure ladder puts its block on the right atrium node', () => {
  for (const [f, id] of [['right-heart.js', 'cath'], ['hvpg.js', 'heart'], ['sites.js', 'cardiac']]) {
    const s = slides.find((x) => x.f === f && x.id === id);
    assert.equal(s?.block, 'ra', `${f} ${id}`);
  }
  // (Heart failure's falls are all small, so no stretch of line carries a hatched band there.)
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /nodeBlk\.setAttribute\('cx'/);
  assert.match(src, /snodeBlk/);
});

test('the Sites summary ladders carry each slide\'s block, so the heart failure cell hatches its RA node too', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /block: x\.block \?\? sl\?\.block/, 'rowsOf passes the slide\'s block');
  assert.match(src, /L\.set\(r\.f, \{ block: r\.block \}\)/, 'laddersGrid draws it');
  const lad = slides.find((x) => x.f === 'sites.js' && x.visual === 'ladders');
  assert.ok(lad.of.includes('cardiac'), 'the summary includes the heart failure slide');
});
