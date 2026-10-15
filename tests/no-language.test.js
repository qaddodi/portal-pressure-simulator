// Language selection was removed (English only, to come back later): no language control, string
// tables, language state, storage key or URL parameter, and an old saved choice is cleared on load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const ui = readdirSync(new URL('../src/ui/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => '../src/ui/' + f);

test('no code reads a language choice or string table', () => {
  assert.equal(existsSync(new URL('../src/i18n/', import.meta.url)), false);
  for (const f of [...ui, '../index.html', '../styles/app.css']) {
    assert.doesNotMatch(read(f), /i18n|setLang|currentLang|LANGS|pps:lang|get\('lang'\)|\[dir="rtl"\]/, f);
  }
});

test('an old saved language is cleared on load and never read', () => {
  const main = read('../src/ui/main.js');
  assert.match(main, /localStorage\.removeItem\('pps\.lang'\)/);
  assert.doesNotMatch(main, /readLS\('pps\.lang'\)|getItem\('pps\.lang'\)|setItem\('pps\.lang'/);
});

test('the page stays English', () => {
  assert.match(read('../index.html'), /<html lang="en">/);
});
