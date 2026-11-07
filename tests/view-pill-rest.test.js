// The view pill's selection is measured where its button rests (2 Nov: on iPhone the Lobule highlight sat half the Sinusoid button
// to the right of Lobule after the pill grew). While the pill folds (pill-motion.js) its buttons are drawn shifted by a translate,
// and no resize follows a transform, so a box read then was kept. seg-glide.js boxIn takes the button's own slide off, takes the
// control's scale from its unrounded width, and measures in the control's scrolled content (where the piece is placed).
import test from 'node:test';
import assert from 'node:assert/strict';

const G = await import('../src/ui/seg-glide.js');
const near = (a, b) => Math.abs(a - b) < 1e-6;
const box = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
function setup(btnStyle, ctlStyle = { width: '300px', boxSizing: 'border-box' }) {
  const saved = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (e) => (e.isBtn ? btnStyle : ctlStyle);
  return () => { globalThis.getComputedStyle = saved; };
}

test('a button drawn shifted by its fold translate still gives its resting place', () => {
  const ctl = { getBoundingClientRect: () => box(100, 0, 300, 30), offsetWidth: 300, clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0 };
  const btn = { isBtn: true, getBoundingClientRect: () => box(100 + 165.3 + 44.27, 0, 73.7, 30) };
  const done = setup({ transform: 'matrix(1, 0, 0, 1, 44.27, 0)', translate: 'none' });
  try { const b = G.boxIn(ctl, btn); assert.ok(near(b.x, 165.3), String(b.x)); assert.ok(near(b.w, 73.7)); } finally { done(); }
});

test('a translate property and a 3d move count too; a scale is left in', () => {
  const at = (cs) => { const done = setup(cs); try { return G.shiftNow({ isBtn: true }); } finally { done(); } };
  assert.deepEqual(at({ transform: 'none', translate: '3px 4px' }), [3, 4]);
  assert.deepEqual(at({ transform: 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -12, 2, 0, 1)', translate: 'none' }), [-12, 2]);
  assert.deepEqual(at({ transform: 'matrix(2, 0, 0, 2, 10, 0)', translate: 'none' }), [0, 0]);
});

test('inside a scrolled control the place is in its scrolled content', () => {
  const ctl = { getBoundingClientRect: () => box(0, 0, 200, 30), offsetWidth: 200, clientLeft: 0, clientTop: 0, scrollLeft: 120, scrollTop: 0 };
  const btn = { isBtn: true, getBoundingClientRect: () => box(40 + 10, 0, 60, 30) };   // (laid out at 160, scrolled by 120, sliding by +10)
  const done = setup({ transform: 'matrix(1, 0, 0, 1, 10, 0)', translate: 'none' }, { width: '200px', boxSizing: 'border-box' });
  try { assert.ok(near(G.boxIn(ctl, btn).x, 160)); } finally { done(); }
});

test('the scale comes from the unrounded width, not offsetWidth', () => {
  // (A pill drawn at 300.4 px whose offsetWidth rounds to 300: the scale is 1, not 1.0013.)
  const ctl = { getBoundingClientRect: () => box(0, 0, 300.4, 30), offsetWidth: 300, clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0 };
  const btn = { isBtn: true, getBoundingClientRect: () => box(220, 0, 70, 30) };
  const done = setup({ transform: 'none', translate: 'none' }, { width: '300.4px', boxSizing: 'border-box' });
  try { assert.ok(near(G.boxIn(ctl, btn).x, 220)); } finally { done(); }
  assert.equal(G.borderW({ width: '290px', boxSizing: 'content-box', paddingLeft: '4px', paddingRight: '4px', borderLeftWidth: '1px', borderRightWidth: '1px' }), 300);
  assert.equal(G.borderW({}), 0);
});

test('a fold\'s ghost of the pressed button is not a second choice (the piece is not dropped while it plays)', () => {
  const b = (pressed, ghost) => ({ localName: 'button', hidden: false, dataset: ghost ? { ghost: '' } : {}, matches: () => pressed });
  const real = b(true, false);
  assert.equal(G.chosen({ children: [b(false, false), real, b(true, true)] }), real);
});
