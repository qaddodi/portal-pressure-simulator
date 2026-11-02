// The corner credit looks again when the labels' boxes move on an 8 px grid, not each time their numbers are laid out (2 Nov 2026:
// about 560 reads in 15 s on a phone at rest, the running model's numbers changing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const cr = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');

test('the poll keys on the labels\' grid boxes, the camera and the views', () => {
  assert.match(cr, /const pollKey = \(\) => `\$\{window\.pps\?\.stage\?\.labelBoxStamp\?\.\(\) \?\? window\.pps\?\.stage\?\.labelStamp\?\.\(\) \?\? Math\.random\(\)\}\|/);
  assert.match(st, /labelBoxStamp: \(\) => \{ let k = ''; for \(const b of pool\.values\(\)\) if \(b\.box\) k \+= b\.box \+ ';'; return `\$\{k\}\|\$\{vt\.k\},\$\{vt\.x\},\$\{vt\.y\}\|\$\{morph\}\|\$\{rotU\}\|/);
  assert.match(st, /b\.box = `\$\{Math\.floor\(\(it\.x - it\.padX\) \/ 8\)\},/);
  assert.match(st, /b\.at = null; b\.gl = null;\n\s+b\.box = '';/, 'a label leaving drops its box');
});
