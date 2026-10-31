// The split readings sheet's glass on the GPU (sheet-glass.js): its two pseudo-elements read as the card glass draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sheetPanes, boxPath } from '../src/ui/sheet-glass.js';

const box = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
const sheet = (ps, glass = '0', wide = false) => ({
  classList: { contains: (c) => c === 'pz-sheet' },
  closest: (q) => (q.includes(wide ? '.pz-wide' : '.stack') ? {} : null),
  getBoundingClientRect: () => box(10, 100, 300, 200),
  ps, glass,
});
const gcs = (e, p) => (p ? e.ps[p] : { borderLeftWidth: '0px', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', getPropertyValue: () => e.glass });
const pe = (o) => ({ content: '""', display: 'block', visibility: 'visible', opacity: '1', left: '-1px', top: '-1px', right: '-1px', bottom: '-1px', borderTopLeftRadius: '18px', borderTopRightRadius: '18px', borderBottomRightRadius: '18px', borderBottomLeftRadius: '18px', backgroundColor: 'rgba(250, 250, 250, 0.58)', ...o });

test('the readings\' card first, the instrument card cut out of it, then the instrument card with its own corners', () => {
  const el = sheet({ '::before': pe({ bottom: '19px' }), '::after': pe({ left: '7px', right: '7px', top: '170px', bottom: '-25px', borderTopLeftRadius: '0px', borderTopRightRadius: '0px', opacity: '0.5' }) });
  const out = sheetPanes(el, gcs);
  assert.equal(out.length, 2);
  const [back, front] = out;
  assert.deepEqual(front.r, box(9, 99, 302, 182));
  assert.deepEqual(front.rad, [18, 18, 18, 18]);
  assert.deepEqual(back.r, box(17, 270, 286, 55));
  assert.equal(back.a, 0.5);
  assert.ok(back.d.startsWith(boxPath(0, 0, 286, 55, [0, 0, 18, 18])), 'its own box');
  assert.ok(back.d.endsWith(boxPath(-8, -171, 302, 182, [18, 18, 18, 18], true)), 'the instrument card cut out, wound the other way');
});

test('any other card, or a sheet with its own glass, is read as usual; a faded-out piece is left out', () => {
  assert.equal(sheetPanes({ classList: { contains: () => false } }, gcs), undefined);
  assert.equal(sheetPanes(sheet({ '::before': pe(), '::after': pe() }, '1'), gcs), undefined);
  assert.equal(sheetPanes(sheet({ '::before': pe({ opacity: '0' }), '::after': pe({ opacity: '0' }) }), gcs).length, 0);
});

test('the presenter hands the sheet to the card glass, and the glass takes a list or a mask path', () => {
  const pr = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const gg = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(pr, /read: \(g\) => \(g === data \? sheetPanes\(g\) : undefined\) \}\) \|\| null;/);
  assert.match(gg, /for \(const one of \[\]\.concat\(q \|\| \[\]\)\) \{/);
  assert.match(gg, /d: one\.d \|\| null, rad: one\.d \? null : one\.rad,/);
  assert.match(css, /\.pz\.pz\.pz \.pz-data\.pz-data\.pz-sheet\.pz-sheet\[data-gl\]::before, \.pz\.pz\.pz \.pz-data\.pz-data\.pz-sheet\.pz-sheet\[data-gl\]::after \{ background: none; -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
});
