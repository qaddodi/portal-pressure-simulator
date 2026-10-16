import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineStyles } from '../src/ui/svg-inline.js';

// The organs reach the GPU as a self-contained copy of the live SVG (inlineStyles). The stage hides the live organs while
// the GPU draws them and shows them again just for the copy, and Chrome can still report a descendant hidden at that
// moment (after a live text-size change in Present, every organ path came back hidden, so the copy, and the figure,
// were empty). Below the top element, visibility comes from an element's own setting, else its parent's.

function el(cs, { own = '', kids = [] } = {}) {
  const attrs = new Map();
  const e = {
    cs: { display: 'inline', ...cs, getPropertyValue(p) { return this[p] ?? ''; } },
    style: { visibility: own },
    children: kids,
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
    remove() { e.removed = true; },
    attrs,
  };
  e.cs.visibility = cs.visibility ?? 'visible';
  return e;
}
// A clone with the same shape (what cloneNode gives).
const clone = (e) => { const c = el({}, { kids: e.children.map(clone) }); c.attrs.clear(); return c; };

globalThis.getComputedStyle = (e) => e.cs;

test('a descendant Chrome still reports hidden under a shown parent is copied shown', () => {
  const leaf = el({ visibility: 'hidden', fill: 'rgb(1, 2, 3)' });
  const organ = el({}, { kids: [leaf] });
  const top = el({}, { kids: [organ] });
  const dst = clone(top);
  inlineStyles(top, dst);
  assert.equal(dst.children[0].children[0].getAttribute('visibility'), null);
  assert.equal(dst.children[0].children[0].getAttribute('fill'), 'rgb(1, 2, 3)');
});

test('an element hidden by its own style stays hidden in the copy, and so do its descendants', () => {
  const inner = el({ visibility: 'visible' });
  const gloss = el({ visibility: 'hidden' }, { own: 'hidden', kids: [inner] });
  const top = el({}, { kids: [gloss] });
  const dst = clone(top);
  inlineStyles(top, dst);
  assert.equal(dst.children[0].getAttribute('visibility'), 'hidden');
  assert.equal(dst.children[0].children[0].getAttribute('visibility'), 'hidden');
});

test('the top element keeps its computed visibility', () => {
  const top = el({ visibility: 'hidden' }, { kids: [el({ visibility: 'hidden' })] });
  const dst = clone(top);
  inlineStyles(top, dst);
  assert.equal(dst.getAttribute('visibility'), 'hidden');
  assert.equal(dst.children[0].getAttribute('visibility'), 'hidden');
});

test('an element not displayed is left out of the copy', () => {
  const gone = el({ display: 'none' });
  const top = el({}, { kids: [gone] });
  const dst = clone(top);
  inlineStyles(top, dst);
  assert.equal(dst.children[0].removed, true);
});
