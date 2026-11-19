// The Readouts tab has no "Abnormal readings" box and no "Copy as text" row (Mohammad, 16 Nov 2026: "REMOVE this whole thing"). Nothing may bring them back
// under another class name: the pane, the stylesheet and the app's words are checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('no source or style names the Abnormal readings box, its copy row or its sentence', () => {
  for (const f of [...walk('src').filter((p) => p.endsWith('.js')), ...walk('styles')]) {
    const t = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(!/Copy as text|Abnormal readings|rp-copy|rp-quote|rp-copied|readoutsSentence/.test(t), `${f} still has the copy-as-text row`);
  }
});
