import { stageSource } from './stage-src.js';
// Laptop-heat recs H2: the ?perf backdrop-blur gauge (blur-gauge.js) lists what still wears a live CSS backdrop-filter, and why.
// The reasons come from the glasses (glass-gl.js why(), stage.js blurWhy); the figure's pixels are untouched by any of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nameOf, visibleArea, scanBlurs, blurText, keptReason } from '../src/ui/blur-gauge.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// A page of stubs: each element carries its computed style (own and pseudo), its box and its parent.
function el(tagName, { id = '', className = '', box = { left: 0, top: 0, width: 100, height: 50 }, own = {}, before = null, after = null, parent = null, opacity = '1', rects = 1 } = {}) {
  const e = { tagName, id, className, nodeType: 1, parentElement: parent, getBoundingClientRect: () => box, getClientRects: () => new Array(rects) };
  e.style = { backdropFilter: 'none', visibility: 'visible', display: 'block', opacity, content: 'none', ...own };
  e.pseudo = { '::before': before, '::after': after };
  return e;
}
const page = (els, w = 1000, h = 800) => ({
  root: { querySelectorAll: () => els },
  win: { innerWidth: w, innerHeight: h, getComputedStyle: (e, ps) => (ps ? (e.pseudo[ps] ? { backdropFilter: 'blur(16px)', visibility: 'visible', display: 'block', opacity: '1', content: '""', ...e.pseudo[ps] } : { backdropFilter: 'none', content: 'none' }) : e.style) },
});

test('an element is named by its tag, id, first three classes and pseudo-element', () => {
  assert.equal(nameOf(el('DIV', { id: 'x', className: 'pz-data pz-sheet a b' }), '::before'), 'div#x.pz-data.pz-sheet.a::before');
  assert.equal(nameOf({ tagName: 'svg', className: { baseVal: 'a' } }), 'svg');
});

test('the visible area is the part of the box inside the window', () => {
  assert.equal(visibleArea({ left: 0, top: 0, width: 100, height: 50 }, 1000, 800), 5000);
  assert.equal(visibleArea({ left: 950, top: 0, width: 100, height: 50 }, 1000, 800), 2500);
  assert.equal(visibleArea({ left: 1200, top: 0, width: 100, height: 50 }, 1000, 800), 0);
});

test('only what shows with a live blur is listed, the largest first, each with its glass\'s reason', () => {
  const big = el('div', { className: 'pz-data', box: { left: 0, top: 0, width: 400, height: 300 }, own: { backdropFilter: 'blur(16px) saturate(1.15)' } });
  const chip = el('button', { className: 'pz-fold', box: { left: 10, top: 10, width: 80, height: 30 }, own: { webkitBackdropFilter: 'blur(16px)', backdropFilter: '' } });
  const marked = el('div', { className: 'pz-bar' });                                               // data-gl: the CSS gives it none
  const hidden = el('div', { className: 'pz-fk', own: { backdropFilter: 'blur(16px)' }, opacity: '0' });
  const gone = el('div', { className: 'pz-case', own: { backdropFilter: 'blur(16px)', display: 'none' }, rects: 0 });
  const unseen = el('div', { className: 'pz-scales', own: { backdropFilter: 'blur(16px)', visibility: 'hidden' } });
  const off = el('div', { className: 'pz-shade', own: { backdropFilter: 'blur(16px)' }, box: { left: 2000, top: 0, width: 100, height: 100 } });
  const pill = el('span', { className: 'lz-lab', before: {} });                                      // a ::before with the blur
  const { root, win } = page([chip, marked, big, hidden, gone, unseen, off, pill]);
  const why = (e) => (e === big ? 'crosses a label, a leader or a callout' : e === chip ? null : '');
  const rows = scanBlurs(root, why, win);
  assert.deepEqual(rows.map((r) => r.name), ['div.pz-data', 'span.lz-lab::before', 'button.pz-fold']);
  assert.equal(rows[0].area, 120000);
  assert.equal(rows[0].why, 'crosses a label, a leader or a callout');
  assert.equal(rows[2].why, null);
  assert.ok(Math.abs(rows[0].share - 0.15) < 1e-9);
});

test('an element under a faded parent shows with the parents\' opacity', () => {
  const parent = el('div', { opacity: '0.0005' });
  const child = el('div', { className: 'pz-fk', own: { backdropFilter: 'blur(16px)' }, parent });
  const { root, win } = page([child]);
  assert.equal(scanBlurs(root, () => null, win).length, 0);
  const lit = el('div', { opacity: '0.5' });
  const child2 = el('div', { className: 'pz-fk', own: { backdropFilter: 'blur(16px)' }, parent: lit });
  assert.equal(scanBlurs(page([child2]).root, () => null, page([]).win).length, 1);
});

test('the report says how many, how much of the window, and what each reason is', () => {
  assert.match(blurText([], 7), /none\); glasses drawn in the figure's canvas instead: 7/);
  const t = blurText([{ name: 'div.pz-data', area: 1, share: 0.15, why: 'crosses a label, a leader or a callout' }, { name: 'button.pz-fold', area: 1, share: 0.003, why: null }, { name: 'div.pz-bar', area: 1, share: 0.01, why: '' }], 2);
  assert.match(t, /3, together 16\.3 % of the window/);
  assert.match(t, /div\.pz-data 15\.0 %: crosses a label, a leader or a callout/);
  assert.match(t, /button\.pz-fold 0\.3 %: no glass of the figure owns it/);
  assert.match(t, /div\.pz-bar 1\.0 %: its glass is drawn; the mark is about to be set/);
});

test('the lobule pills are named as the browser\'s blur on purpose, the toast and the fold chip as unowned', () => {
  const is = (cls) => ({ matches: (sel) => sel.split(',').some((x) => x.trim() === `.${cls}`) });
  assert.match(keptReason(is('lz-lab')), /on the browser's blur on purpose/);
  assert.match(keptReason(is('sv-region')), /lzpills=1/);
  assert.match(keptReason(is('pz-fold')), /no glass of the figure draws it/);
  assert.match(keptReason(is('toast')), /few seconds/);
  assert.equal(keptReason(is('pz-data')), '');
  assert.equal(keptReason({}), '');
  const t = blurText([{ name: 'span.lz-lab::before', area: 1, share: 0.01, why: null, kept: keptReason(is('lz-lab')) }], 0);
  assert.match(t, /span\.lz-lab::before 1\.0 %: a lobule pill, on the browser's blur on purpose/);
});

test('the glasses give their reasons where they decide, and the stage the canvas\'s own', () => {
  const g = read('../src/ui/glass-gl.js'), st = stageSource(), pr = read('../src/ui/perf-readout.js');
  for (const why of ['reaches past the figure', 'crosses a label, a leader or a callout']) assert.ok(g.includes(why), why);
  // (Since 1 Nov 2026 every glass decides alone, the callouts' and the pane's too: none sends all of them back at once.)
  assert.ok(!g.includes('a glass crosses a label, a leader or a card'));
  assert.match(g, /why\(el\) \{/);
  // The canvas's reasons are the old test, in the old order, in words.
  assert.match(st, /const frostOn = \(\) => !frostWhy\(\);/);
  assert.match(st, /why: frostWhy/);
  assert.match(st, /const blurWhy = /);
  assert.match(st, /\n {4}blurWhy,\n/);
  assert.match(pr, /scanBlurs\(document/);
});
