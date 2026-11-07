// Saved scripts (production pass, 31 Oct): one malformed entry in storage used to stop every presentation from starting (fromScript read
// a null step), and a save that storage refused still said "Script created". The check runs for real (its source, in a sandbox).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../src/ui/script-library.js', import.meta.url), 'utf8');   // (the saved scripts' storage moved out of presenter.js)
const okScript = vm.runInNewContext(lib.slice(lib.indexOf('const okScript ='), lib.indexOf('export const readMine =')) + '; okScript');

test('okScript keeps the scripts the library can read and drops the ones that would stop it', () => {
  assert.ok(okScript({ id: 'a', title: 'A', steps: [{ title: 'one' }] }));
  assert.ok(okScript({ id: 'b', title: 'B', deck: { slides: [] } }), 'an imported deck');
  assert.ok(okScript({ id: 'c', title: 'C' }), 'no steps at all: kept (it opens as an empty script, not an error)');
  assert.ok(okScript({ id: 'd', title: 'D', steps: [] }));
  assert.ok(!okScript({ id: 'e', title: 'E', steps: [null] }), 'a null step threw in fromScript on every start');
  assert.ok(!okScript({ id: 'f', title: 'F', steps: [{}, 3] }));
  assert.ok(!okScript({ id: 'g', steps: 'nope' }));
  assert.ok(!okScript({ title: 'no id', steps: [] }));
  assert.ok(!okScript({ id: 'h', deck: 'x' }));
  assert.ok(!okScript(null) && !okScript(7) && !okScript('s'));
});

test('a refused save is said, never reported as done', () => {
  assert.match(lib, /export const writeMine = \(list\) => \{ try \{ localStorage\.setItem\(KEY, JSON\.stringify\(list\)\); return true; \} catch \{ return false; \} \};/);
  assert.equal((pres.match(/if \(!writeMine\(/g) || []).length >= 4, true, 'new, add step, remove, import');
  assert.match(pres, /if \(!writeMine\(list\)\) throw new Error\(NO_ROOM\);/);
  assert.match(pres, /catch \(e\) \{ toast\(e\?\.message === NO_ROOM \? NO_ROOM : 'The shared script could not be read\.', 'bad'\); \}/);
  assert.match(pres, /!s\.steps\.every\(\(st\) => st && typeof st === 'object'\)\) throw new Error\('That is not a deck or a script\.'\);/);
});
