import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineStyles } from '../src/ui/svg-inline.js';

// svg-inline.js inlines a group's styles for a copy taken with its groups shown, whatever the page reports for them at that moment
// (the organ painter's checks draw such copies): a stale "hidden" read at the top of a group would hide all of it (Mac, 16 Oct).

test('a group read back as hidden still copies visible, and a part hidden by its own setting stays hidden', () => {
  const el = (attrs = {}, kids = []) => {
    const a = new Map(Object.entries(attrs));
    return {
      style: {}, children: kids,
      getAttribute: (k) => (a.has(k) ? a.get(k) : null), setAttribute: (k, v) => a.set(k, String(v)), removeAttribute: (k) => a.delete(k),
      remove() { this.gone = true; }, attrs: a,
    };
  };
  const mk = () => el({}, [el(), el({ visibility: 'hidden' })]);
  const src = mk(), dst = mk();
  globalThis.getComputedStyle = () => ({ display: 'inline', visibility: 'hidden', getPropertyValue: () => '' });
  inlineStyles(src, dst, 'visible');
  assert.equal(dst.attrs.get('visibility'), undefined, 'the group is shown');
  assert.equal(dst.children[0].attrs.get('visibility'), undefined, 'its parts are shown');
  assert.equal(dst.children[1].attrs.get('visibility'), 'hidden', 'a part hidden by its own setting stays hidden');
});
