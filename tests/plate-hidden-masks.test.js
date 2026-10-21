import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// While the GPU draws the plate, its SVG groups are hidden, and their masks are turned off with them: a hidden group's mask
// is still built on each repaint (the diaphragm's covered the whole abdomen with ascites, on every pan frame). The copy the
// GPU draws is cloned from the mask attributes, which the rule leaves alone.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('the hidden plate groups draw no masks', () => {
  const hide = css.match(/\.stage-view\.gl-plate :is\(([^)]*)\) \{ visibility: hidden; \}/);
  assert.ok(hide, 'the plate groups hide under gl-plate');
  const off = css.match(/\.stage-view\.gl-plate :is\(([^)]*)\) \{ mask: none; \}/);
  assert.ok(off, 'their masks are off under gl-plate');
  for (const id of hide[1].split(',').map((x) => x.trim())) {
    assert.ok(off[1].includes(`${id} [mask]`), `${id}: masks inside it stay on while hidden`);
  }
  assert.ok(off[1].split(',').map((x) => x.trim()).includes('#backdrop'), 'the diaphragm mask (on #backdrop itself) is off');
});

test("the plate copy keeps the diaphragm's mask", () => {
  assert.match(stage, /s\('g', \{ id: 'backdrop', mask: 'url\(#diaMask\)' \}\)/, 'the mask is an attribute (cloned into the copy)');
  assert.match(stage, /const c = g\.cloneNode\(true\);/, 'the copy is a clone of the live group');
  assert.ok(!/removeAttribute\('mask'\)[^\n]*gBackdrop|gBackdrop[^\n]*removeAttribute\('mask'\)/.test(stage), 'the live mask attribute is never removed');
});

test('the page\'s own ascites, hidden while the GPU draws the fluid, builds no clip or mask either', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.stage-view\.gl-on #ascites \{ visibility: hidden; \}/);
  assert.match(css, /\.stage-view\.gl-on :is\(#ascites, #ascites \[mask\]\) \{ mask: none; clip-path: none; \}/);
});

test('the gut organs, hidden while the gut\'s picture shows, build no mask or clip, and the picture keeps them', () => {
  assert.match(css, /#organs > \.organ-gut\.gut-pic-on > \.organ \{ visibility: hidden; \}/);
  assert.match(css, /#organs > \.organ-gut\.gut-pic-on > \.organ, #organs > \.organ-gut\.gut-pic-on > \.organ :is\(\[mask\], \[clip-path\]\) \{ mask: none; clip-path: none; \}/);
  assert.match(stage, /if \(o\.id === 'colon'\) g\.setAttribute\('mask', 'url\(#rectFade\)'\);/, 'the rectum fade is an attribute (cloned into the copy)');
  assert.match(stage, /c = copies\.find\(\(el\) => el\.getAttribute\('data-gut'\) === i\)\?\.cloneNode\(true\)/, 'the picture is drawn from the plate copy');
  assert.ok(!/'mask'/.test(readFileSync(new URL('../src/ui/svg-inline.js', import.meta.url), 'utf8')), 'the copy never takes the computed mask');
});
