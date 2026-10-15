// The Student role was removed (to come back later): no role setting, no role state, no Student-only branches,
// and an old saved role is cleared on load so it cannot change anything. (main.js needs a DOM, so files are read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const files = [...readdirSync(new URL('../src/ui/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => '../src/ui/' + f), '../styles/app.css', '../src/i18n/i18n.js'];

test('no code or style reads a role or a Student mode', () => {
  for (const f of files) {
    const s = read(f);
    assert.doesNotMatch(s, /(?<!pps)\.role\b|data-role|dataset\.role|'student'|"student"|'instructor'|import \{[^}]*\bROLES\b[^}]*\} from '\.\/menu|menu\.role|STUDENT_HIDDEN/, f);
  }
});

test('an old saved role is cleared on load and never read', () => {
  const main = read('../src/ui/main.js');
  assert.match(main, /localStorage\.removeItem\('pps\.role'\)/);
  assert.doesNotMatch(main, /readLS\('pps\.role'\)|setItem\('pps\.role'/);
});

test('Advanced physiology is in Settings for everyone', () => {
  const main = read('../src/ui/main.js');
  assert.match(main, /menuItem\('Advanced physiology'/);
  assert.doesNotMatch(main, /=== 'instructor' \? \[h\('div', \{ class: 'menu-sep' \}\),\s*menuItem\('Advanced physiology'/);
});

test('the HVPG shows without measuring unless Settings turned it off', () => {
  const store = read('../src/ui/store.js');
  assert.match(store, /showHvpg: \(\(\) => \{ try \{ return localStorage\.getItem\('pps\.showHvpg'\) !== '0'; \} catch \{ return true; \} \}\)\(\)/);
});
