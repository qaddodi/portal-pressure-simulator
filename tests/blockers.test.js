// What covers the figure is one list with one set of rules (bible review 19 Nov 2026, STG-2): the stage's labels, the lobule's, the sinusoid's and the probe read
// src/ui/blockers.js, so a label never tucks under the teaching card's glass in the lobule. (The "only blockers.js holds the list" rule is in scripts/rules-lint.mjs.)
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { restRect, blockerGone, blockerRects, BLOCKER_SEL } from '../src/ui/blockers.js';

const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t, x: l, y: t });
const el = (o = {}) => {
  const classes = new Set(o.classes || []);
  return { id: o.id || '', dataset: o.dataset || {}, style: { opacity: o.opacity ?? '' }, vis: o.vis || 'visible', offsetHeight: o.offsetHeight || 100,
    classList: { contains: (c) => classes.has(c) }, querySelector: (s) => (o.seg && s === '#viewSeg' ? {} : null), getBoundingClientRect: () => o.box || box(0, 0, 0, 0), tr: o.tr || 'none' };
};
const withPage = (els, fn) => {
  const had = globalThis.document, hadCS = globalThis.getComputedStyle;
  globalThis.document = { ...had, querySelectorAll: (sel) => { assert.equal(sel, BLOCKER_SEL); return els; } };
  globalThis.getComputedStyle = (e) => ({ visibility: e.vis, transform: e.tr, translate: 'none' });
  try { return fn(); } finally { globalThis.document = had; if (hadCS) globalThis.getComputedStyle = hadCS; else delete globalThis.getComputedStyle; }
};

test('the list names the cards, the teaching glass, the view switcher and the clock', () => {
  for (const part of ['.stage-blocker:not([hidden])', '.pz-shade', '#nbViews', '.stage-clock']) assert.ok(BLOCKER_SEL.includes(part), part);
});

test('a visible card counts; hidden, leaving and empty ones count for nothing', () => {
  const card = el({ classes: ['stage-blocker'], box: box(10, 20, 110, 220) });
  const hidden = el({ classes: ['stage-blocker'], vis: 'hidden', box: box(0, 0, 50, 50) });
  const leaving = el({ classes: ['stage-blocker', 'pz-leave'], box: box(0, 0, 50, 50) });
  const emptyGlass = el({ classes: ['pz-shade'], opacity: '0', box: box(0, 0, 50, 50) });
  const glass = el({ classes: ['pz-shade'], box: box(0, 300, 400, 500) });
  const holder = el({ id: 'nbViews', box: box(0, 0, 60, 30) });
  const switcher = el({ id: 'nbViews', seg: true, box: box(5, 5, 65, 35) });
  const flat = el({ classes: ['stage-blocker'], box: box(0, 0, 80, 0) });
  const got = withPage([card, hidden, leaving, emptyGlass, glass, holder, switcher, flat], () => blockerRects((e) => e.getBoundingClientRect()));
  assert.deepEqual(got.map((r) => r.el), [card, glass, switcher]);
  assert.deepEqual([got[1].left, got[1].top, got[1].right, got[1].bottom], [0, 300, 400, 500]);
});

test('the teaching card\'s glass counts in every consumer: it is in the list, not left to each', () => {
  const glass = el({ classes: ['pz-shade'], box: box(0, 300, 400, 500) });
  withPage([], () => {
    assert.equal(blockerGone(glass), false);
    assert.equal(blockerGone(el({ classes: ['pz-shade'], opacity: '0' })), true);
  });
});

test('only the pieces a read was asked for count when a list is handed in', () => {
  const a = el({ classes: ['stage-blocker'], box: box(0, 0, 10, 10) }), b = el({ classes: ['stage-blocker'], box: box(20, 20, 30, 30) });
  const got = withPage([a, b], () => blockerRects((e) => e.getBoundingClientRect(), [b]));
  assert.deepEqual(got.map((r) => r.el), [b]);
});

test('a card with data-safe-rest counts where it rests; one without counts where it is', () => {
  const q = box(10, 300, 110, 400);
  assert.equal(restRect(el(), q), q);
  const card = el({ dataset: { safeRest: '', restTranslate: '0 0' } });
  withPage([], () => { assert.equal(restRect(card, q).top, 300); });
});
