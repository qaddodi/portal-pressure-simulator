// GPU-1 (an emptied readout holds no picture) and GPU-9, GPU-13 (19 Nov 2026 whole-app review).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';
import { inked } from '../src/ui/svg-gl.js';

const el = (localName, attrs = {}, kids = []) => {
  const e = { localName, nodeType: 1, getAttribute: (k) => (k in attrs ? attrs[k] : null), firstElementChild: null, nextElementSibling: null };
  let prev = null;
  for (const k of kids) { if (prev) prev.nextElementSibling = k; else e.firstElementChild = k; prev = k; }
  return e;
};

test('a drawing of empty paths has no ink: an emptied readout draws and hands over nothing', () => {
  assert.equal(inked(el('svg', {}, [el('path', { d: '' }), el('path'), el('g', {}, [el('path', { d: '' })])])), false);
  assert.equal(inked(el('svg')), false, 'nothing at all');
});
test('a path with a shape, or a piece that is not a path, has ink, whatever its depth', () => {
  assert.equal(inked(el('svg', {}, [el('path', { d: '' }), el('path', { d: 'M0 0L1 1' })])), true);
  assert.equal(inked(el('svg', {}, [el('g', {}, [el('g', {}, [el('rect')])])])), true);
  assert.equal(inked(el('svg', {}, [el('text')])), true);
  const kept = el('path'); kept._g = { d: 'M0 0L2 2' };   // (a shape held on the piece, as gl-words sets its glyphs)
  assert.equal(inked(el('svg', {}, [kept])), true);
});

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
test('a change of look drops the labels\' cached default leader and dot inks (GPU-9)', () => {
  const t = src('label-gl.js');
  const decl = t.indexOf('let defLine = null, defDot = null, PIN_LINE0 = null, PIN_DOT0 = null;');
  const theme = t.indexOf('const themeNow = () =>');
  assert.ok(decl > 0 && decl < theme, 'the four are declared before themeNow, so it may reach them at any time');
  assert.match(t.slice(theme, theme + 260), /defLine = defDot = PIN_LINE0 = PIN_DOT0 = null/, 'and themeNow clears them');
});
test('the glass reacts to a transition anywhere only where it can move or resize a glass (GPU-13)', () => {
  const t = src('glass-gl.js');
  assert.match(t, /const docStart = \(e\) => \{ if \(paintOnly\(e\)\) return;/);
  assert.match(t, /const docEnd = \(e\) => \{ if \(paintOnly\(e\)\) return;/);
  const m = /const PAINT_ONLY = (\/.*\/);/.exec(t);
  assert.ok(m, 'the list of properties that only repaint');
  const re = eval(m[1]);
  for (const p of ['opacity', 'color', 'background-color', 'box-shadow', 'transform', 'filter']) assert.ok(re.test(p), `${p} only repaints`);
  for (const p of ['width', 'height', 'margin-left', 'top', 'left', 'padding', 'font-size', 'flex-basis', '--pz-u', 'inset', 'max-height', 'gap']) assert.ok(!re.test(p), `${p} can move a glass: it wakes it`);
});
