// The guideline is Baveno VIII only (Mohammad, 13 Nov 2026; full app review 15 Nov, issue 5). Nothing the app ships may cite Baveno VII:
// not a sentence, a reference list line, a comment or a table kept "for the notes". Reads every file under src/ and index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
// "Baveno VII", "Baveno 7", "Baveno-VII", "BAVENO7", "Baveno_7" — but never "Baveno VIII".
const BAVENO7 = /baveno[\s_-]*(?:vii(?!i)|7(?!\d))/i;

test('nothing in src/ or index.html cites Baveno VII', () => {
  const files = [...walk('src').filter((f) => /\.(js|mjs|css|html|json)$/.test(f)), 'index.html'];
  assert.ok(files.length > 100);
  const bad = [];
  for (const f of files) readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((line, i) => { if (BAVENO7.test(line)) bad.push(`${f}:${i + 1}`); });
  assert.deepEqual(bad, [], 'Baveno VIII is the only guideline: take the Baveno VII line out');
});

test('the pattern catches the spellings and spares Baveno VIII', () => {
  for (const s of ['Baveno VII', 'baveno vii 1.1', 'Baveno 7', 'Baveno-VII', 'BAVENO7_SSM', 'Baveno VII (2022)']) assert.ok(BAVENO7.test(s), s);
  for (const s of ['Baveno VIII', 'Baveno VIII 1.15', 'Baveno 8']) assert.equal(BAVENO7.test(s), false, s);
});
