import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inlineStyles } from '../src/ui/svg-inline.js';

// The organs' copy for the GPU is made with the plate groups shown, whatever the page reports for them at that moment: a stale
// "hidden" read at the top of a group (the stage hides it while the GPU draws it) would hide every organ in the copy, and the
// figure would show none (Mac, 16 Oct).
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('the plate copy starts every group visible', () => {
  assert.match(stage, /if \(inlineStyles\(g, c, 'visible'\) === false\) continue;/);
});

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
