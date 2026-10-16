// The deck importer (deck-source.js) reads deck .js files as data, without running them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseDeckSource } from '../src/ui/deck-source.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);

test('every built-in deck file reads to the same deck its module exports', async () => {
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const mod = await import(new URL(f, DIR));
    const want = Object.values(mod).find((v) => Array.isArray(v?.slides));
    assert.deepEqual(parseDeckSource(readFileSync(new URL(f, DIR), 'utf8')), JSON.parse(JSON.stringify(want)), f);
  }
});

test('a deck as JSON or a bare object literal is accepted too', () => {
  assert.equal(parseDeckSource('{"title":"T","slides":[{"title":"A"}]}').title, 'T');
  assert.equal(parseDeckSource("{ title: 'T', slides: [{ title: 'A', }], }").slides[0].title, 'A');
});

test('built-in MathML helpers work without being defined', () => {
  const d = parseDeckSource("export const D = { title: 'T', slides: [{ title: 'A', eq: [mi('x') + mo('=') + sub(mi('P'), 'pv')] }] };");
  assert.equal(d.slides[0].eq[0], '<mi>x</mi><mo>=</mo><msub><mi>P</mi><mtext>pv</mtext></msub>');
});

test('code that could reach the page is refused, never run', () => {
  const bad = [
    "export const D = { title: 'T', slides: [{ title: alert('x') }] };",
    "export const D = { title: globalThis.x, slides: [] };",
    "export const D = { title: 'T'.constructor, slides: [] };",
    "const f = (o) => o.__proto__; export const D = { title: 'T', slides: [{ title: f({}) }] };",
    "export const D = { title: 'T', slides: [{ title: new Date() }] };",
    "import x from './y.js'; export const D = { title: 'T', slides: [{ title: 'A' }] };",
    "function f() {} export const D = {};",
    "const f = (x) => f(x); export const D = { title: f(1), slides: [] };",
    "export const D = { title: 'T', slides: [{ title: 'A', go: (x) => x }] };",
    "export const D = { title: 'T', slides: [{ title: 'A', s: [].map.constructor }] };",
  ];
  globalThis.__hit = 0;
  for (const src of bad) assert.throws(() => parseDeckSource(src), Error, src);
  assert.equal(globalThis.__hit, 0);
});

test('errors name the line', () => {
  assert.throws(() => parseDeckSource("export const D = {\n  title: 'T',\n  slides: [ { title: 'A' } \n  oops\n] };"), /Line 4/);
  assert.throws(() => parseDeckSource("export const X = { title: 'T' };"), /No deck found/);
  assert.throws(() => parseDeckSource("export const D = { title: 'T', slides: [{}] };"), /Slide 1 needs a title/);
});
