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
  for (const [f, id] of [['hvpg.js', 'heart']]) {   // (Right heart 5 shows the Gut to heart profile alone: see below)
    const s = slides.find((x) => x.f === f && x.id === id);
    assert.equal(s?.block, 'ra', `${f} ${id}`);
  }
  // (Sites' level slides show the profile, so its heart failure ladder is the summary row's.)
  const row = slides.find((x) => x.f === 'sites.js' && x.visual === 'ladders').of.find((r) => r.id === 'cardiac');
  assert.equal(row?.block, 'ra', 'sites.js ladders cardiac row');
  // (Heart failure's falls are all small, so no stretch of line carries a hatched band there.)
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /snodeBlk/);
  // (The block is a hatched rectangle at the RA node reaching a little to its right, not a ring or disc round the node.)
  assert.match(src, /const nodeBlk = sv\('rect'/);
  assert.match(src, /nodeBlk\.setAttribute\('x', \(X\(blockAt\) - 0\.12 \* step\)/);
  assert.match(src, /nodeBlk\.setAttribute\('width', \(0\.46 \* step\)/);
  assert.doesNotMatch(src, /sv\('circle', \{ class: 'pzl-nb'/);
});

test('the Sites summary ladders carry each slide\'s block, so the heart failure cell hatches its RA node too', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /block: x\.block \?\? sl\?\.block/, 'rowsOf passes the slide\'s block');
  assert.match(src, /L\.set\(r\.f, \{ block: r\.block \}\)/, 'laddersGrid draws it');
  const lad = slides.find((x) => x.f === 'sites.js' && x.visual === 'ladders');
  assert.ok(lad.of.some((r) => (r.id ?? r) === 'cardiac'), 'the summary includes the heart failure slide');
});

test('no data card shows both ladders: a Gut to heart profile slide has no old ladder (Pre-hepatic 3, Mohammad, 21 Oct: "just use the one we decided on")', () => {
  const both = slides.filter((x) => x.tool?.kind === 'profile' && x.data === 'ladder').map((x) => `${x.f} ${x.id}`);
  assert.deepEqual(both, []);
  for (const [f, id] of [['ncph.js', 'wedge'], ['outflow.js', 'soswedge'], ['prehepatic.js', 'cath'], ['right-heart.js', 'cath']]) {
    const s = slides.find((x) => x.f === f && x.id === id);
    assert.equal(s?.tool?.kind, 'profile', `${f} ${id}`);
    assert.ok(!s.data && !s.block && !s.brackets, `${f} ${id}: no ladder fields left`);
  }
});

test('the profile\'s HVPG and PPG brackets are the difference of the whole readings drawn at their ends', () => {
  const src = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ wholeGap \} from '\.\.\/engine\/gap\.js/);
  assert.match(src, /const v = gapOf\(k\), rate = RATE\[k\]\(v\)\[0\];/);
  assert.match(src, /wholeGap\(shown\.v\[STATIONS\.indexOf\(a\)\], shown\.v\[STATIONS\.indexOf\(b\)\], shown\[k\]\)/);
});
