// Apple/Metal risks in the card-glass blur path, pinned from the source (no device here): every blur target is plain RGBA8
// (renderable and linearly filterable on iOS, unlike float and half-float), no renderbuffer is used (so MAX_RENDERBUFFER_SIZE
// never applies), every target is checked for size and completeness as it is made, and every context the glass draws on is
// non-antialiased (a blit that scales out of a multisampled default framebuffer is INVALID_OPERATION).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const glass = src('glass-gl.js');

test('blur targets are RGBA8 only: no float or half-float format, no renderbuffer', () => {
  assert.doesNotMatch(glass, /RGBA16F|RGBA32F|HALF_FLOAT|\bR11F|EXT_color_buffer|OES_texture_float|createRenderbuffer/);
  assert.match(glass, /texImage2D\(G\.TEXTURE_2D, 0, G\.RGBA, [^)]*G\.UNSIGNED_BYTE, null\)/);
});

test('every blur target is size-checked and completeness-checked where it is made', () => {
  assert.match(glass, /MAX_TEXTURE_SIZE/);
  assert.match(glass, /st\.ok = fits\(G, st\.w, st\.h\) && complete\(G,/);
  assert.match(glass, /if \(!fits\(G, bw, bh\)\) \{ B\.size = ''; return false; \}/);
  assert.match(glass, /ok = ok && complete\(G, 'glass-blur', bw, bh\)/);
});

test('the glass grid is whole device pixels on a power-of-two step', () => {
  assert.match(glass, /const T = 2 \*\* Math\.max\(0, Math\.ceil\(Math\.log2\(SCALE \* k\)/);
  assert.match(glass, /Math\.floor\(W2 \/ T\) \* T/);
});
