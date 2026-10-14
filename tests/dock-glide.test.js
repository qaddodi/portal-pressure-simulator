// Opening or closing the readout strip (chevron, or a drag) must glide the tiles, captions and vitals to their new
// spots by translate only (never a scale, so no text changes size), and every way of toggling `all` must go through it.
// (dock.js needs a DOM to import, so it is read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/dock.js', import.meta.url), 'utf8');

test('the readout strip glides its contents by translate, never scale', () => {
  const body = src.slice(src.indexOf('const glide ='), src.indexOf('const setAll ='));
  assert.match(body, /translate:/);
  assert.doesNotMatch(body, /scale|font/i);
  assert.match(body, /\.metric, \.ro-cap, \.vital/);
});

test('chevron, drag start and drag settle all toggle through glide', () => {
  assert.match(src, /glide\(\(\) => strip\.classList\.toggle\('all', on\), animate\)/);
  assert.match(src, /glide\(\(\) => strip\.classList\.add\('all'\), true\)/);
  assert.match(src, /glide\(\(\) => strip\.classList\.toggle\('all', open\), true\)/);
});
